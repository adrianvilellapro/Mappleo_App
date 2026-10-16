import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "../../lib/db";
import { backupSchema, type Backup } from "../../features/backup/schema";
import { createBackup } from "../../features/backup/data";
import { restoreBackup } from "../../features/backup/restore";
import { makeCsv } from "../../features/backup/csv";
import { makePdf } from "../../features/backup/pdf";

let owner = "";
let recipient = "";
let companyId = "";
let backup: Backup;
beforeAll(async () => {
  const suffix = Date.now() + "-" + Math.random().toString(36).slice(2);
  owner = (
    await db.user.create({
      data: {
        email: "backup-owner-" + suffix + "@example.test",
        name: "Backup owner",
      },
    })
  ).id;
  recipient = (
    await db.user.create({
      data: {
        email: "backup-target-" + suffix + "@example.test",
        name: "Backup target",
      },
    })
  ).id;
  const company = await db.company.create({
    data: {
      userId: owner,
      name: "Empresa copia",
      notes: "Notas originales",
      domain: "example.test",
      websiteUrl: "https://example.test/jobs",
      faviconUrl: "https://example.test/favicon.ico",
      tags: ["producto"],
    },
  });
  companyId = company.id;
  const offer = await db.jobOffer.create({
    data: {
      userId: owner,
      companyId,
      title: "Puesto de prueba",
      technologies: ["TypeScript"],
    },
  });
  await db.technologyTag.create({
    data: { userId: owner, name: "AcmeLang", key: "acmelang" },
  });
  const application = await db.application.create({
    data: {
      userId: owner,
      jobOfferId: offer.id,
      status: "INTERVIEW",
      nextAction: "Llamar mañana",
    },
  });
  await db.applicationEvent.create({
    data: {
      applicationId: application.id,
      type: "NOTE",
      title: "Primer contacto",
      description: "Reunión acordada",
    },
  });
  const contact = await db.contact.create({
    data: {
      userId: owner,
      companyId,
      name: "Persona de prueba",
      email: "persona@example.test",
    },
  });
  await db.networkingEvent.create({
    data: {
      userId: owner,
      name: "Encuentro de prueba",
      startsAt: new Date("2026-11-10T17:00:00Z"),
      companies: { connect: [{ id: companyId }] },
      contacts: { connect: [{ id: contact.id }] },
    },
  });
  backup = backupSchema.parse(
    JSON.parse(JSON.stringify(await createBackup(owner))),
  );
});
afterAll(async () => {
  const userId = { in: [owner, recipient] };
  await db.networkingEvent.deleteMany({ where: { userId } });
  await db.contact.deleteMany({ where: { userId } });
  await db.application.deleteMany({ where: { userId } });
  await db.jobOffer.deleteMany({ where: { userId } });
  await db.company.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe("Backup y restauración", () => {
  it("fusiona el mismo archivo sin crear duplicados", async () => {
    expect(backup.technologyTags).toContain("AcmeLang");
    expect(backup.applications[0].events).toHaveLength(1);
    await db.company.update({
      where: { id: companyId },
      data: { notes: "Cambio posterior" },
    });
    expect(await restoreBackup(owner, backup)).toEqual({
      created: 0,
      updated: 9,
    });
    expect(await restoreBackup(owner, backup)).toEqual({
      created: 0,
      updated: 9,
    });
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } })).notes,
    ).toBe("Notas originales");
    expect(await db.company.count({ where: { userId: owner } })).toBe(1);
    expect(
      await db.applicationEvent.count({
        where: { application: { userId: owner } },
      }),
    ).toBe(1);
  });

  it("restaura en otra cuenta sin tocar al propietario original", async () => {
    expect(await restoreBackup(recipient, backup)).toEqual({
      created: 6,
      updated: 3,
    });
    expect(await restoreBackup(recipient, backup)).toEqual({
      created: 0,
      updated: 9,
    });
    expect(
      await db.technologyTag.findUnique({
        where: { userId_key: { userId: recipient, key: "acmelang" } },
      }),
    ).not.toBeNull();
    const company = await db.company.findFirstOrThrow({
      where: { userId: recipient },
    });
    expect(company.id).not.toBe(companyId);
    expect(company.faviconUrl).toBe("https://example.test/favicon.ico");
    const offer = await db.jobOffer.findFirstOrThrow({
      where: { userId: recipient },
    });
    const application = await db.application.findFirstOrThrow({
      where: { userId: recipient },
      include: { events: true },
    });
    const contact = await db.contact.findFirstOrThrow({
      where: { userId: recipient },
    });
    const event = await db.networkingEvent.findFirstOrThrow({
      where: { userId: recipient },
      include: { companies: true, contacts: true },
    });
    expect(offer.companyId).toBe(company.id);
    expect(application.jobOfferId).toBe(offer.id);
    expect(application.events).toHaveLength(1);
    expect(contact.companyId).toBe(company.id);
    expect(event.companies.map((item) => item.id)).toEqual([company.id]);
    expect(event.contacts.map((item) => item.id)).toEqual([contact.id]);
  });

  it("rechaza relaciones rotas e impide escribir sobre otra cuenta", async () => {
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.companies = [];
    expect(backupSchema.safeParse(invalid).success).toBe(false);
    const externalIcon = JSON.parse(JSON.stringify(backup));
    externalIcon.companies[0].faviconUrl = "https://otro.example/favicon.ico";
    expect(backupSchema.safeParse(externalIcon).success).toBe(false);
    const forged = JSON.parse(JSON.stringify(backup));
    forged.ownerId = recipient;
    for (const section of [
      "companies",
      "offers",
      "applications",
      "contacts",
      "networking",
      "boardColumns",
    ])
      for (const row of forged[section] ?? []) row.userId = recipient;
    const before = await db.company.count({ where: { userId: recipient } });
    await expect(
      restoreBackup(recipient, backupSchema.parse(forged)),
    ).rejects.toThrow();
    expect(await db.company.count({ where: { userId: recipient } })).toBe(
      before,
    );
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } })).userId,
    ).toBe(owner);
  });

  it("acepta un backup v1 antiguo vacío sin modificar datos", async () => {
    const legacy = backupSchema.parse({
      version: 1,
      exportedAt: "2026-09-29T09:00:00.000Z",
      companies: [],
      offers: [],
      applications: [],
      contacts: [],
      networking: [],
    });
    expect(await restoreBackup(recipient, legacy)).toEqual({
      created: 0,
      updated: 0,
    });
  });
  it("no inventa el icono al restaurar un backup antiguo sin ese campo", async () => {
    const legacy = JSON.parse(JSON.stringify(backup));
    delete legacy.companies[0].faviconUrl;
    await restoreBackup(recipient, backupSchema.parse(legacy));
    expect(
      (await db.company.findFirstOrThrow({ where: { userId: recipient } }))
        .faviconUrl,
    ).toBe("");
  });

  it("restaura fechas de respuesta sin borrarlas con un backup antiguo", async () => {
    const dated = JSON.parse(JSON.stringify(backup));
    const response = new Date().toISOString();
    dated.applications[0].firstResponseAt = response;
    await restoreBackup(owner, backupSchema.parse(dated));
    await restoreBackup(owner, backupSchema.parse(dated));
    const legacy = JSON.parse(JSON.stringify(dated));
    delete legacy.applications[0].firstResponseAt;
    await restoreBackup(owner, backupSchema.parse(legacy));
    const restored = await db.application.findUniqueOrThrow({
      where: { id: backup.applications[0].id },
    });
    expect(restored.firstResponseAt?.toISOString()).toBe(response);
    const exported = backupSchema.parse(
      JSON.parse(JSON.stringify(await createBackup(owner))),
    );
    expect(exported.applications[0].firstResponseAt?.toISOString()).toBe(
      response,
    );
    expect(makeCsv(exported, "applications")).toContain(response);
    expect(await db.application.count({ where: { userId: owner } })).toBe(1);
  });

  it("genera CSV seguro e informe PDF", async () => {
    const changed = JSON.parse(JSON.stringify(backup));
    changed.companies[0].name = "=2+2";
    const csv = makeCsv(backupSchema.parse(changed), "companies");
    expect(csv).toContain('"\'=2+2"');
    expect(csv).toContain("Notas originales");
    const pdf = await makePdf(backup);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});
