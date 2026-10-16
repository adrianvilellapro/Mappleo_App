import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import {
  collectionPage,
  collectionRows,
} from "../../features/tracker/collection-data";
import { collectionFilterSchema } from "../../features/tracker/collection";
import { createBackup } from "../../features/backup/data";
import { backupSchema } from "../../features/backup/schema";
import { statisticsData } from "../../features/statistics/data";
import {
  buildStatistics,
  parseStatsFilters,
} from "../../features/statistics/model";
const suffix = randomUUID();
let owner = "",
  other = "";
beforeAll(async () => {
  owner = (
    await db.user.create({
      data: { email: `collection-${suffix}@example.test`, name: "Colección" },
    })
  ).id;
  other = (
    await db.user.create({
      data: { email: `collection-other-${suffix}@example.test`, name: "Otra" },
    })
  ).id;
  await db.company.createMany({
    data: Array.from({ length: 62 }, (_, i) => ({
      userId: owner,
      name: `Empresa ${String(i).padStart(3, "0")}`,
      notes:
        i === 61 ? "Palabra exclusivamente en notas: microscópico" : "Privado",
      archivedAt: i === 0 ? new Date() : null,
      updatedAt: new Date(2026, 8, 1, 0, i),
    })),
  });
  await db.company.create({
    data: { userId: other, name: "Empresa ajena", notes: "microscópico" },
  });
});
afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await db.$disconnect();
});
describe("Listados ligeros, paginación y búsqueda cifrada", () => {
  it("pagina sin transferir notas y conserva recuentos completos", async () => {
    const first = await collectionPage(owner, "companies");
    expect(first.records).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.summary).toEqual({
      total: 62,
      active: 61,
      archived: 1,
      statuses: {},
    });
    expect(first.records.every((r) => !("notes" in r))).toBe(true);
    const next = await collectionPage(owner, "companies", { offset: 50 });
    expect(next.records).toHaveLength(11);
    expect(next.hasMore).toBe(false);
    expect(
      new Set([...first.records, ...next.records].map((r) => r.id)).size,
    ).toBe(61);
  });
  it("encuentra notas cifradas sin incluirlas en el listado ni mezclar cuentas", async () => {
    const page = await collectionPage(owner, "companies", {
      q: "MICROSCOPICO",
    });
    expect(page.records).toHaveLength(1);
    expect(page.records[0].name).toBe("Empresa 061");
    expect(page.records[0].notes).toBeUndefined();
    const archived = await collectionPage(owner, "companies", {
      filter: "archived",
    });
    expect(archived.records).toHaveLength(1);
    const sorted = await collectionPage(owner, "companies", { sort: "name" });
    expect(sorted.records[0].name).toBe("Empresa 001");
  });
  it("evita relaciones duplicadas en filas/backups y mantiene restauración", async () => {
    const rows = await collectionRows(
      owner,
      "companies",
      collectionFilterSchema.parse({}),
    );
    expect(rows[0].offers).toBeUndefined();
    expect(rows[0].contacts).toBeUndefined();
    const backup = JSON.parse(JSON.stringify(await createBackup(owner)));
    expect(backupSchema.safeParse(backup).success).toBe(true);
    expect(backup.companies).toHaveLength(62);
    expect(backup.offers).toEqual([]);
    expect(backup.companies[0].offers).toBeUndefined();
  });
  it("suma registros y no estados al filtrar entrevistas y procesos activos", async () => {
    const company = await db.company.findFirstOrThrow({
      where: { userId: owner },
    });
    const offer = await db.jobOffer.create({
      data: {
        userId: owner,
        companyId: company.id,
        title: "Oferta de recuentos",
        source: "LINKEDIN",
      },
    });
    for (const status of [
      "INTERVIEW",
      "INTERVIEW",
      "FINAL_INTERVIEW",
      "REJECTED",
      "SENT",
    ]) {
      await db.application.create({
        data: {
          userId: owner,
          jobOfferId: offer.id,
          status,
          appliedAt: new Date(),
        },
      });
    }
    expect(
      (await collectionPage(owner, "applications", { scope: "interviews" }))
        .matchedTotal,
    ).toBe(3);
    expect(
      (await collectionPage(owner, "applications", { scope: "active" }))
        .matchedTotal,
    ).toBe(4);
    expect(
      (await collectionPage(owner, "applications", { status: "INTERVIEW" }))
        .matchedTotal,
    ).toBe(2);
    const now = new Date();
    const earlier = new Date(now.getTime() - 60 * 86400000);
    await db.application.create({
      data: {
        userId: owner,
        jobOfferId: offer.id,
        status: "SENT",
        appliedAt: earlier,
        firstResponseAt: now,
      },
    });
    const all = await db.application.findMany({
      where: { userId: owner },
      include: { jobOffer: { include: { company: true } }, events: true },
    });
    for (const source of ["all", "LINKEDIN", "INFOJOBS"]) {
      const filters = parseStatsFilters(
        { period: "month", source, company: company.id },
        now,
      );
      const result = await statisticsData(owner, filters);
      expect(result.report).toEqual(
        buildStatistics(all, filters, new Date(result.report.generatedAt)),
      );
    }
  });
});
