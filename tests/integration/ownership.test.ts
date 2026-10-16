import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "../../lib/db";
import { saveTask, ensureColumns } from "../../features/tasks/service";
import {
  saveRecord,
  removeRecord,
  archiveRecord,
  addActivity,
  removeActivity,
  completeNextStep,
} from "../../features/tracker/services";
let owner = "",
  other = "",
  companyId = "",
  offerId = "",
  appId = "",
  foreignId = "";
const companyData = {
  name: "Integration Acme",
  workMode: "UNKNOWN",
  interestRating: 3,
};
const offerData = {
  title: "Developer",
  source: "OTHER",
  workMode: "REMOTE",
  salaryCurrency: "EUR",
  interestRating: 3,
};
const applicationData = {
  status: "APPLIED",
  appliedAt: new Date(),
  coverLetterUsed: false,
};
beforeAll(async () => {
  const suffix = Date.now();
  owner = (
    await db.user.create({
      data: {
        email: "integration-owner-" + suffix + "@example.test",
        name: "Integration owner",
      },
    })
  ).id;
  other = (
    await db.user.create({
      data: {
        email: "integration-other-" + suffix + "@example.test",
        name: "Other owner",
      },
    })
  ).id;
  foreignId = (await saveRecord(other, "companies", undefined, companyData)).id;
});
afterAll(async () => {
  const userId = { in: [owner, other] };
  await db.networkingEvent.deleteMany({ where: { userId } });
  await db.contact.deleteMany({ where: { userId } });
  await db.application.deleteMany({ where: { userId } });
  await db.jobOffer.deleteMany({ where: { userId } });
  await db.company.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
describe("Persistencia y autorización", () => {
  it("crea registros relacionados con historial inicial", async () => {
    companyId = (await saveRecord(owner, "companies", undefined, companyData))
      .id;
    offerId = (
      await saveRecord(owner, "offers", undefined, { ...offerData, companyId })
    ).id;
    appId = (
      await saveRecord(owner, "applications", undefined, {
        ...applicationData,
        jobOfferId: offerId,
      })
    ).id;
    expect(
      await db.applicationEvent.count({ where: { applicationId: appId } }),
    ).toBe(1);
  });
  it("no permite editar, borrar o archivar datos de otro propietario", async () => {
    await expect(
      saveRecord(owner, "companies", foreignId, companyData),
    ).rejects.toThrow();
    await expect(removeRecord(owner, "companies", foreignId)).rejects.toThrow();
    await expect(
      archiveRecord(owner, "companies", foreignId, true),
    ).rejects.toThrow();
    expect(
      await db.company.findUnique({ where: { id: foreignId } }),
    ).not.toBeNull();
  });
  it("no inventa un favicon para webs ficticias y lo limpia si cambia", async () => {
    const saved = await saveRecord(owner, "companies", companyId, {
      ...companyData,
      websiteUrl: "example.com/jobs",
    });
    const company = await db.company.findUniqueOrThrow({
      where: { id: saved.id },
    });
    expect(company.websiteUrl).toBe("https://example.com/jobs");
    expect(company.faviconUrl).toBe("");
    await saveRecord(owner, "companies", companyId, {
      ...companyData,
      websiteUrl: "",
    });
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } }))
        .faviconUrl,
    ).toBe("");
  });
  it("rechaza relaciones con una empresa ajena", async () => {
    await expect(
      saveRecord(owner, "offers", undefined, {
        ...offerData,
        companyId: foreignId,
      }),
    ).rejects.toThrow();
    await expect(
      saveRecord(owner, "contacts", undefined, {
        name: "Sam",
        companyId: foreignId,
      }),
    ).rejects.toThrow();
    await expect(
      saveRecord(owner, "networking", undefined, {
        name: "Meetup",
        type: "MEETUP",
        startsAt: new Date(),
        companyIds: [foreignId],
      }),
    ).rejects.toThrow();
  });
  it("permite envíos independientes para una misma oferta", async () => {
    const second = await saveRecord(owner, "applications", undefined, {
      ...applicationData,
      jobOfferId: offerId,
    });
    expect(second.id).not.toBe(appId);
    expect(await db.application.count({ where: { userId: owner } })).toBe(2);
  });
  it("completa la próxima acción propia sin borrar un paso cambiado", async () => {
    const dueAt = "2026-10-10T10:00:00.000Z";
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
      nextAction: "Preparar entrevista",
      nextActionDueAt: dueAt,
    });
    const step = {
      kind: "applications",
      id: appId,
      title: "Preparar entrevista",
      dueAt,
    };
    await expect(completeNextStep(other, step)).rejects.toThrow();
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
      nextAction: "Revisar CV",
      nextActionDueAt: dueAt,
    });
    await expect(completeNextStep(owner, step)).rejects.toThrow();
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: appId } }))
        .nextAction,
    ).toBe("Revisar CV");
    await expect(
      completeNextStep(owner, { ...step, title: "Revisar CV" }),
    ).rejects.toThrow();
    const task = await saveTask(owner, undefined, {
      title: "Revisar CV",
      columnId: (await ensureColumns(db, owner)).todo.id,
      dueAt,
      links: [{ kind: "applications", recordId: appId }],
    });
    await expect(
      completeNextStep(other, {
        ...step,
        kind: "tasks",
        id: task.id,
        title: task.title,
      }),
    ).rejects.toThrow();
    await completeNextStep(owner, {
      ...step,
      kind: "tasks",
      id: task.id,
      title: task.title,
    });
    const application = await db.application.findUniqueOrThrow({
      where: { id: appId },
    });
    expect(application.nextAction).toBe("Revisar CV");
    expect(application.nextActionDueAt?.toISOString()).toBe(dueAt);
    expect(application.status).toBe("APPLIED");
  });
  it("completa un follow-up propio y conserva el resto del contacto", async () => {
    const dueAt = "2026-10-11T10:00:00.000Z";
    const contact = await saveRecord(owner, "contacts", undefined, {
      name: "Contacto agenda",
      role: "Recruiter",
      followUpAt: dueAt,
    });
    const step = {
      kind: "contacts",
      id: contact.id,
      title: "Contactar con Contacto agenda",
      dueAt,
    };
    await expect(completeNextStep(other, step)).rejects.toThrow();
    await expect(
      completeNextStep(owner, { ...step, dueAt: "2026-10-12T10:00:00.000Z" }),
    ).rejects.toThrow();
    await expect(completeNextStep(owner, step)).rejects.toThrow();
    const task = await saveTask(owner, undefined, {
      title: step.title,
      columnId: (await ensureColumns(db, owner)).todo.id,
      dueAt,
      links: [{ kind: "contacts", recordId: contact.id }],
    });
    await completeNextStep(owner, { ...step, kind: "tasks", id: task.id });
    const saved = await db.contact.findUniqueOrThrow({
      where: { id: contact.id },
    });
    expect(saved.followUpAt?.toISOString()).toBe(dueAt);
    expect(saved.role).toBe("Recruiter");
    expect(saved.lastContactAt).toBeNull();
    await expect(completeNextStep(owner, step)).rejects.toThrow();
  });
  it("guarda nuevas tecnologías solo en el catálogo de su usuario", async () => {
    await saveRecord(owner, "offers", offerId, {
      ...offerData,
      companyId,
      technologies: ["Angular", "Mi Stack Privado", "mi stack privado"],
    });
    expect(
      (await db.jobOffer.findUniqueOrThrow({ where: { id: offerId } }))
        .technologies,
    ).toEqual(["Angular", "Mi Stack Privado"]);
    expect(
      await db.technologyTag.findUnique({
        where: { userId_key: { userId: owner, key: "mi stack privado" } },
      }),
    ).not.toBeNull();
    expect(
      await db.technologyTag.findUnique({
        where: { userId_key: { userId: other, key: "mi stack privado" } },
      }),
    ).toBeNull();
  });
  it("cambia estado y añade historial en una transacción", async () => {
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
      status: "INTERVIEW",
    });
    expect(
      await db.applicationEvent.count({ where: { applicationId: appId } }),
    ).toBe(2);
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
      status: "INTERVIEW",
      notes: "Updated notes",
    });
    expect(
      await db.applicationEvent.count({ where: { applicationId: appId } }),
    ).toBe(2);
  });
  it("rechaza escribir actividad sobre candidaturas ajenas", async () => {
    await expect(
      addActivity(other, {
        applicationId: appId,
        title: "Invalid",
        type: "NOTE",
        happenedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
  it("borra solo entradas propias sin cambiar el estado de la candidatura", async () => {
    const entry = await addActivity(owner, {
      applicationId: appId,
      title: "Nota equivocada",
      type: "NOTE",
      happenedAt: new Date(),
    });
    await expect(removeActivity(other, entry.id)).rejects.toThrow();
    expect(
      await db.applicationEvent.findUnique({ where: { id: entry.id } }),
    ).not.toBeNull();
    const status = (
      await db.application.findUniqueOrThrow({ where: { id: appId } })
    ).status;
    await removeActivity(owner, entry.id);
    expect(
      await db.applicationEvent.findUnique({ where: { id: entry.id } }),
    ).toBeNull();
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: appId } })).status,
    ).toBe(status);
    await expect(removeActivity(owner, entry.id)).rejects.toThrow();
  });
  it("permite borrar un cambio de estado automático sin revertir el estado", async () => {
    const event = await db.applicationEvent.findFirstOrThrow({
      where: { applicationId: appId, type: "STATUS_CHANGED" },
    });
    await removeActivity(owner, event.id);
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: appId } })).status,
    ).toBe("INTERVIEW");
  });
  it("marca cierre y permite reabrir una candidatura", async () => {
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
      status: "REJECTED",
    });
    expect(
      (await db.application.findUnique({ where: { id: appId } }))?.closedAt,
    ).not.toBeNull();
    await saveRecord(owner, "applications", appId, {
      ...applicationData,
      jobOfferId: offerId,
    });
    expect(
      (await db.application.findUnique({ where: { id: appId } }))?.closedAt,
    ).toBeNull();
  });
  it("impide eliminar empresas con dependencias", async () => {
    await expect(removeRecord(owner, "companies", companyId)).rejects.toThrow();
  });
});
