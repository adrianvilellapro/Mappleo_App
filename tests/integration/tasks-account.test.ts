import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "../../lib/db";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
import { updateAccount } from "../../features/account/service";
import { saveRecord, completeNextStep } from "../../features/tracker/services";
import {
  saveTask,
  moveTask,
  deleteTask,
  ensureColumns,
  saveColumn,
  deleteColumn,
  completeTask,
} from "../../features/tasks/service";
import { createBackup } from "../../features/backup/data";
import { backupSchema } from "../../features/backup/schema";
import { restoreBackup } from "../../features/backup/restore";
import { statisticsData } from "../../features/statistics/data";
import { parseStatsFilters } from "../../features/statistics/model";
let owner = "",
  other = "",
  companyId = "",
  offerId = "",
  appId = "",
  taskId = "",
  todo = "",
  done = "";
const password = "Una clave original segura 27!",
  changed = "Otra clave muy distinta 93!";
beforeAll(async () => {
  const suffix = Date.now();
  const passwordHash = await hashPassword(password);
  owner = (
    await db.user.create({
      data: {
        name: "Cuenta prueba",
        email: `board-owner-${suffix}@example.test`,
        passwordHash,
      },
    })
  ).id;
  other = (
    await db.user.create({
      data: {
        name: "Otra cuenta",
        email: `board-other-${suffix}@example.test`,
        passwordHash,
      },
    })
  ).id;
  const cols = await ensureColumns(db, owner);
  todo = cols.todo.id;
  done = cols.done!.id;
});
afterAll(async () => {
  const userId = { in: [owner, other] };
  await db.task.deleteMany({ where: { userId } });
  await db.boardColumn.deleteMany({ where: { userId } });
  await db.networkingEvent.deleteMany({ where: { userId } });
  await db.contact.deleteMany({ where: { userId } });
  await db.application.deleteMany({ where: { userId } });
  await db.jobOffer.deleteMany({ where: { userId } });
  await db.company.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
describe("Cuenta y tareas compartidas", () => {
  // Each destructive case uses only records created by this test suite.
  it("requiere contraseña actual para cambiar nombre, sin tocar el email", async () => {
    await expect(
      updateAccount(owner, 0, {
        kind: "name",
        name: "Intruso",
        currentPassword: "incorrecta",
      }),
    ).rejects.toThrow();
    await updateAccount(owner, 0, {
      kind: "name",
      name: "Nombre actualizado",
      currentPassword: password,
    });
    const u = await db.user.findUniqueOrThrow({ where: { id: owner } });
    expect(u.name).toBe("Nombre actualizado");
    expect(u.email).toContain("board-owner-");
  });
  it("crea candidaturas sin recordatorios implícitos y acciones explícitas en Kanban", async () => {
    companyId = (
      await saveRecord(owner, "companies", undefined, {
        name: "Empresa tablero",
        workMode: "UNKNOWN",
        interestRating: 3,
      })
    ).id;
    offerId = (
      await saveRecord(owner, "offers", undefined, {
        companyId,
        title: "Oferta repetida",
        source: "LINKEDIN",
        workMode: "UNKNOWN",
        salaryCurrency: "EUR",
        interestRating: 3,
        technologies: ["TypeScript", "typescript"],
      })
    ).id;
    appId = (
      await saveRecord(owner, "applications", undefined, {
        jobOfferId: offerId,
        status: "APPLIED",
        appliedAt: new Date(),
        nextAction: "Preparar conversación",
      })
    ).id;
    await saveRecord(owner, "applications", undefined, {
      jobOfferId: offerId,
      status: "APPLIED",
      appliedAt: new Date(),
      nextAction: "Segundo envío",
    });
    expect(
      await db.application.count({
        where: { userId: owner, jobOfferId: offerId },
      }),
    ).toBe(2);
    expect(await db.task.count({ where: { userId: owner } })).toBe(0);
    taskId = (
      await saveTask(owner, undefined, {
        title: "Preparar conversación",
        columnId: todo,
        links: [{ kind: "applications", recordId: appId }],
      })
    ).id;
    await saveTask(owner, undefined, {
      title: "Segundo envío",
      columnId: todo,
      links: [{ kind: "applications", recordId: appId }],
    });
  });
  it("rechaza enlaces, columnas y tareas ajenos", async () => {
    await expect(
      saveTask(other, undefined, { title: "Intruso", columnId: todo }),
    ).rejects.toThrow();
    const own = (await ensureColumns(db, other)).todo.id;
    await expect(
      saveTask(other, undefined, {
        title: "Intruso",
        columnId: own,
        links: [{ kind: "applications", recordId: appId }],
      }),
    ).rejects.toThrow();
    const t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    await expect(
      moveTask(other, {
        taskId,
        columnId: done,
        expectedUpdatedAt: t.updatedAt.toISOString(),
      }),
    ).rejects.toThrow();
  });
  it("completa en Hoy sin modificar la ficha de origen y registra una finalización", async () => {
    await completeNextStep(owner, {
      kind: "tasks",
      id: taskId,
      title: "Preparar conversación",
      dueAt: null,
    });
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: appId } }))
        .nextAction,
    ).toBe("Preparar conversación");
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskId } })).completedAt,
    ).not.toBeNull();
    expect(await db.taskCompletion.count({ where: { taskId } })).toBe(1);
    await expect(
      completeNextStep(owner, {
        kind: "tasks",
        id: taskId,
        title: "Preparar conversación",
        dueAt: null,
      }),
    ).rejects.toThrow();
  });
  it("reabre sin borrar historia y rechaza mover una versión obsoleta", async () => {
    let t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    const old = t.updatedAt.toISOString();
    await moveTask(owner, { taskId, columnId: todo, expectedUpdatedAt: old });
    expect(
      (await db.application.findUniqueOrThrow({ where: { id: appId } }))
        .nextAction,
    ).toBe("Preparar conversación");
    await expect(
      moveTask(owner, { taskId, columnId: done, expectedUpdatedAt: old }),
    ).rejects.toThrow();
    t = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    await moveTask(owner, {
      taskId,
      columnId: done,
      expectedUpdatedAt: t.updatedAt.toISOString(),
    });
    expect(await db.taskCompletion.count({ where: { taskId } })).toBe(2);
  });
  it("estadísticas deduplican tareas y tecnologías y conservan contexto al borrar", async () => {
    await deleteTask(owner, taskId);
    const { report } = await statisticsData(
      owner,
      parseStatsFilters({ company: companyId }),
    );
    expect(report.extended.completed).toBe(1);
    expect(report.extended.technologies[0].sent).toBe(2);
    expect(report.extended.technologies[0].label).toBe("TypeScript");
    expect(
      await db.taskCompletion.count({
        where: { userId: owner, taskIdentity: taskId },
      }),
    ).toBe(2);
  });
  it("restaura candidaturas repetidas y tablero sin duplicar", async () => {
    const backup = backupSchema.parse(
      JSON.parse(JSON.stringify(await createBackup(owner))),
    );
    await restoreBackup(owner, backup);
    await restoreBackup(owner, backup);
    expect(await db.application.count({ where: { userId: owner } })).toBe(2);
    expect(await db.boardColumn.count({ where: { userId: owner } })).toBe(3);
    const legacy = JSON.parse(JSON.stringify(backup));
    delete legacy.tasks;
    delete legacy.boardColumns;
    delete legacy.taskCompletions;
    await restoreBackup(owner, backupSchema.parse(legacy));
    expect(await db.taskCompletion.count({ where: { userId: owner } })).toBe(2);
  });
  it("cambiar contraseña incrementa versión y rechaza sesiones anteriores", async () => {
    await expect(
      updateAccount(owner, 0, {
        kind: "password",
        currentPassword: password,
        password: "corta",
        confirmPassword: "corta",
      }),
    ).rejects.toThrow();
    await updateAccount(owner, 0, {
      kind: "password",
      currentPassword: password,
      password: changed,
      confirmPassword: changed,
    });
    const u = await db.user.findUniqueOrThrow({ where: { id: owner } });
    expect(u.sessionVersion).toBe(1);
    expect(await verifyPassword(changed, u.passwordHash!)).toBe(true);
    expect(await verifyPassword(password, u.passwordHash!)).toBe(false);
    await expect(
      updateAccount(owner, 0, {
        kind: "name",
        name: "Sesión vieja",
        currentPassword: changed,
      }),
    ).rejects.toThrow();
  });
  it("reordena columnas sin tocar las tareas", async () => {
    const task = await db.task.findFirstOrThrow({ where: { userId: owner } });
    await saveColumn(owner, done, { name: "Hechas", position: 0 });
    expect(
      (
        await db.boardColumn.findMany({
          where: { userId: owner },
          orderBy: { position: "asc" },
        })
      )[0].id,
    ).toBe(done);
    const after = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(after.columnId).toBe(task.columnId);
    expect(after.updatedAt).toEqual(task.updatedAt);
  });
  it("el borrado exige confirmar, rechaza versiones antiguas y destinos ajenos", async () => {
    const c = await saveColumn(owner, undefined, { name: "Columna temporal" });
    const t = await saveTask(owner, undefined, {
      title: "Tarea de borrado",
      columnId: c.id,
    });
    const versions = [{ id: t.id, updatedAt: t.updatedAt.toISOString() }];
    await expect(
      deleteColumn(owner, c.id, {
        mode: "delete",
        confirmed: false,
        taskVersions: versions,
      }),
    ).rejects.toThrow();
    await expect(
      deleteColumn(owner, c.id, {
        mode: "move",
        confirmed: true,
        targetColumnId: (await ensureColumns(db, other)).todo.id,
        taskVersions: versions,
      }),
    ).rejects.toThrow();
    await expect(
      deleteColumn(owner, c.id, {
        mode: "delete",
        confirmed: true,
        taskVersions: [],
      }),
    ).rejects.toThrow();
    const original = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    await deleteColumn(owner, c.id, {
      mode: "move",
      confirmed: true,
      targetColumnId: todo,
      taskVersions: versions,
    });
    const moved = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(moved.columnId).toBe(todo);
    expect(moved.completedAt).toEqual(original.completedAt);
    expect(
      await db.taskCompletion.count({ where: { taskIdentity: t.id } }),
    ).toBe(0);
  });
  it("borra tareas de una columna y cancela solo sus pasos pendientes", async () => {
    const c = await saveColumn(owner, undefined, { name: "Para eliminar" });
    const task = await db.task.findFirstOrThrow({
      where: { userId: owner, completedAt: null },
    });
    await moveTask(owner, {
      taskId: task.id,
      columnId: c.id,
      expectedUpdatedAt: task.updatedAt.toISOString(),
    });
    const current = await db.task.findUniqueOrThrow({ where: { id: task.id } }),
      before = await db.taskCompletion.count({ where: { userId: owner } });
    await deleteColumn(owner, c.id, {
      mode: "delete",
      confirmed: true,
      taskVersions: [
        { id: current.id, updatedAt: current.updatedAt.toISOString() },
      ],
    });
    expect(await db.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(
      (
        await db.application.findUniqueOrThrow({
          where: { id: appId },
        })
      ).nextAction,
    ).toBe("Preparar conversación");
    expect(await db.taskCompletion.count({ where: { userId: owner } })).toBe(
      before,
    );
  });
  it("permite borrar la columna de completadas sin resucitarla ni perder el historial", async () => {
    const t = await saveTask(owner, undefined, {
      title: "Completada para traslado",
      columnId: done,
    });
    const tasks = await db.task.findMany({
      where: { userId: owner, columnId: done },
    });
    await deleteColumn(owner, done, {
      mode: "move",
      targetColumnId: todo,
      confirmed: true,
      taskVersions: tasks.map((t) => ({
        id: t.id,
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
    const cols = await ensureColumns(db, owner);
    expect(cols.columns.some((c) => c.id === done)).toBe(false);
    const moved = await db.task.findUniqueOrThrow({ where: { id: t.id } });
    expect(moved.completedAt).not.toBeNull();
    expect(moved.columnId).toBe(todo);
    const next = await saveTask(owner, undefined, {
      title: "Completar sin columna dedicada",
      columnId: cols.columns.find((c) => !c.isDone)!.id,
    });
    await completeTask(owner, { id: next.id, title: next.title, dueAt: null });
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: next.id } })).completedAt,
    ).not.toBeNull();
    const backup = backupSchema.parse(
      JSON.parse(JSON.stringify(await createBackup(owner))),
    );
    await restoreBackup(owner, backup);
    expect(
      (await ensureColumns(db, owner)).columns.some(
        (c) => c.systemKey === "done",
      ),
    ).toBe(false);
  });
  it("cambia el destino de completadas sin reescribir tareas existentes", async () => {
    const columns = (await ensureColumns(db, owner)).columns,
      previous = columns.find((c) => c.isDone)!,
      target = columns.find((c) => !c.isDone)!;
    const before = await db.task.findMany({
      where: { userId: owner },
      orderBy: { id: "asc" },
    });
    await saveColumn(owner, target.id, { name: target.name, isDone: true });
    expect(
      await db.boardColumn.count({ where: { userId: owner, isDone: true } }),
    ).toBe(1);
    expect((await ensureColumns(db, owner)).done?.id).toBe(target.id);
    expect(
      await db.task.findMany({
        where: { userId: owner },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    const task = await saveTask(owner, undefined, {
      title: "Destino configurable",
      columnId: previous.id,
    });
    await completeTask(owner, { id: task.id, title: task.title, dueAt: null });
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).columnId,
    ).toBe(target.id);
  });
  it("bloquea cambios tras demasiados intentos", async () => {
    for (let i = 0; i < 5; i++)
      await expect(
        updateAccount(other, 0, {
          kind: "name",
          name: "No guardar",
          currentPassword: "incorrecta",
        }),
      ).rejects.toThrow();
    await expect(
      updateAccount(other, 0, {
        kind: "name",
        name: "No guardar",
        currentPassword: password,
      }),
    ).rejects.toThrow();
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: other } })).name,
    ).toBe("Otra cuenta");
  });
});
