import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { type EntityKind } from "@/features/tracker/config";
import { assertAccountQuota } from "@/lib/security/quota";
type Tx = Prisma.TransactionClient;
export class TaskError extends Error {}
const id = z.string().min(1).max(100);
export const taskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(30000).default(""),
  dueAt: z
    .preprocess((v) => (v === "" ? null : v), z.iso.datetime().nullable())
    .default(null),
  columnId: id,
  expectedUpdatedAt: z.iso.datetime().optional(),
  links: z
    .array(
      z.object({
        kind: z.enum([
          "companies",
          "offers",
          "applications",
          "contacts",
          "networking",
        ]),
        recordId: id,
      }),
    )
    .max(20)
    .default([]),
});
export async function ensureColumns(tx: Tx, userId: string) {
  if (!(await tx.boardColumn.count({ where: { userId } })))
    await tx.boardColumn.createMany({
      data: [
        { systemKey: "todo", name: "Por hacer", position: 0 },
        { systemKey: "doing", name: "En curso", position: 1 },
        { systemKey: "done", name: "Completadas", position: 2, isDone: true },
      ].map((c) => ({ ...c, userId })),
      skipDuplicates: true,
    });
  const columns = await tx.boardColumn.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  const destination =
    columns.find((c) => c.isDone) ?? columns[columns.length - 1];
  for (const column of columns)
    if (column.isDone !== (column.id === destination.id)) {
      await tx.boardColumn.update({
        where: { id: column.id, userId },
        data: { isDone: column.id === destination.id },
      });
      column.isDone = column.id === destination.id;
    }
  return {
    columns,
    todo:
      columns.find((c) => c.systemKey === "todo") ??
      columns.find((c) => !c.isDone) ??
      columns[0],
    done: columns.find((c) => c.isDone),
  };
}
export async function recordLabel(
  tx: Tx,
  userId: string,
  kind: EntityKind,
  recordId: string,
) {
  const where = { id: recordId, userId };
  switch (kind) {
    case "companies":
      return (await tx.company.findFirst({ where, select: { name: true } }))
        ?.name;
    case "offers":
      return (await tx.jobOffer.findFirst({ where, select: { title: true } }))
        ?.title;
    case "applications": {
      const a = await tx.application.findFirst({
        where,
        select: { appliedAt: true, jobOffer: { select: { title: true } } },
      });
      return a
        ? `${a.jobOffer.title} · ${a.appliedAt.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}`
        : undefined;
    }
    case "contacts":
      return (await tx.contact.findFirst({ where, select: { name: true } }))
        ?.name;
    case "networking":
      return (
        await tx.networkingEvent.findFirst({ where, select: { name: true } })
      )?.name;
  }
}
async function completionContext(tx: Tx, userId: string, taskId: string) {
  const links = await tx.taskLink.findMany({
    where: { taskId, task: { userId } },
  });
  const companyIds = new Set<string>(),
    sources = new Set<string>();
  for (const l of links) {
    if (l.kind === "companies") {
      const c = await tx.company.findFirst({
        where: { id: l.recordId, userId },
        select: { id: true },
      });
      if (c) companyIds.add(c.id);
    }
    if (l.kind === "offers" || l.kind === "applications") {
      const offer =
        l.kind === "offers"
          ? await tx.jobOffer.findFirst({
              where: { id: l.recordId, userId },
              select: { companyId: true, source: true },
            })
          : (
              await tx.application.findFirst({
                where: { id: l.recordId, userId },
                select: {
                  jobOffer: { select: { companyId: true, source: true } },
                },
              })
            )?.jobOffer;
      if (offer) {
        companyIds.add(offer.companyId);
        sources.add(offer.source);
      }
    }
    if (l.kind === "contacts") {
      const c = await tx.contact.findFirst({
        where: { id: l.recordId, userId },
        select: { companyId: true },
      });
      if (c?.companyId) companyIds.add(c.companyId);
    }
    if (l.kind === "networking") {
      const n = await tx.networkingEvent.findFirst({
        where: { id: l.recordId, userId },
        select: { companies: { where: { userId }, select: { id: true } } },
      });
      n?.companies.forEach((c) => companyIds.add(c.id));
    }
  }
  return { companyIds: [...companyIds], sources: [...sources] };
}
export async function moveTask(userId: string, input: unknown) {
  const { taskId, columnId, beforeId, expectedUpdatedAt } = z
    .object({
      taskId: id,
      columnId: id,
      beforeId: id.nullable().default(null),
      expectedUpdatedAt: z.iso.datetime(),
    })
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, userId } }),
        column = await tx.boardColumn.findFirst({
          where: { id: columnId, userId },
        });
      if (!task || !column)
        throw new TaskError("La tarea o columna no está disponible.");
      if (task.updatedAt.toISOString() !== expectedUpdatedAt)
        throw new TaskError(
          "La tarea ha cambiado en otra ventana. Actualiza el tablero.",
        );
      const completing = column.isDone && !task.completedAt,
        reopening =
          !column.isDone && !!task.completedAt && task.columnId !== columnId;
      const rows = await tx.task.findMany({
        where: { userId, columnId, id: { not: taskId } },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      const index = beforeId
        ? rows.findIndex((r) => r.id === beforeId)
        : rows.length;
      if (index < 0) throw new TaskError("La posición de destino ha cambiado.");
      rows.splice(index, 0, { id: taskId });
      const completedAt = completing
        ? new Date()
        : reopening
          ? null
          : task.completedAt;
      const sourceKey =
        reopening && task.sourceKind && task.sourceId
          ? task.sourceKind + ":" + task.sourceId
          : completing
            ? null
            : task.sourceKey;
      await tx.task.update({
        where: { id: taskId, userId },
        data: { columnId, completedAt, sourceKey },
      });
      for (let i = 0; i < rows.length; i++)
        await tx.task.update({
          where: { id: rows[i].id, userId },
          data: { position: i },
        });
      if (completing)
        await tx.taskCompletion.create({
          data: {
            userId,
            taskId,
            taskIdentity: taskId,
            ...(await completionContext(tx, userId, taskId)),
            title: task.title,
            sourceKind: task.sourceKind,
            sourceId: task.sourceId,
            completedAt: completedAt!,
          },
        });
      await assertAccountQuota(tx, userId);
      return { id: taskId };
    },
    { isolationLevel: "Serializable" },
  );
}
export async function saveTask(
  userId: string,
  taskId: string | undefined,
  input: unknown,
) {
  const data = taskSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const column = await tx.boardColumn.findFirst({
        where: { id: data.columnId, userId },
      });
      if (!column) throw new TaskError("Columna no disponible.");
      const existing = taskId
        ? await tx.task.findFirst({ where: { id: taskId, userId } })
        : null;
      if (taskId && !existing) throw new TaskError("Tarea no disponible.");
      if (
        existing &&
        data.expectedUpdatedAt &&
        existing.updatedAt.toISOString() !== data.expectedUpdatedAt
      )
        throw new TaskError(
          "La tarea ha cambiado en otra ventana. Actualiza antes de editar.",
        );
      if (existing && existing.columnId !== data.columnId)
        throw new TaskError("Mueve la tarea usando el tablero.");
      const unique = [
        ...new Map(
          data.links.map((l) => [l.kind + ":" + l.recordId, l]),
        ).values(),
      ];
      if (
        existing?.sourceKind &&
        existing.sourceId &&
        !unique.some(
          (l) =>
            l.kind === existing.sourceKind && l.recordId === existing.sourceId,
        )
      )
        unique.push({
          kind: existing.sourceKind as EntityKind,
          recordId: existing.sourceId,
        });
      const links = [];
      for (const l of unique) {
        const label = await recordLabel(tx, userId, l.kind, l.recordId);
        if (!label)
          throw new TaskError(
            "Un enlace no pertenece a tu cuenta o ya no existe.",
          );
        links.push({ ...l, label });
      }
      const dueAt = data.dueAt ? new Date(data.dueAt) : null;
      const fields = {
        title: data.title,
        description: data.description,
        dueAt,
      };
      if (existing) {
        await tx.taskLink.deleteMany({ where: { taskId: existing.id } });
        const updated = await tx.task.update({
          where: { id: existing.id, userId },
          data: { ...fields, links: { create: links } },
        });
        await assertAccountQuota(tx, userId);
        return updated;
      }
      const completedAt = column.isDone ? new Date() : null;
      const task = await tx.task.create({
        data: {
          ...fields,
          userId,
          columnId: data.columnId,
          completedAt,
          position: await tx.task.count({
            where: { userId, columnId: data.columnId },
          }),
          links: { create: links },
        },
      });
      if (completedAt)
        await tx.taskCompletion.create({
          data: {
            userId,
            taskId: task.id,
            taskIdentity: task.id,
            ...(await completionContext(tx, userId, task.id)),
            title: task.title,
            completedAt,
          },
        });
      await assertAccountQuota(tx, userId);
      return task;
    },
    { isolationLevel: "Serializable" },
  );
}
export async function completeTask(userId: string, input: unknown) {
  const {
    id: taskId,
    title,
    dueAt,
  } = z
    .object({
      id,
      title: z.string().max(500),
      dueAt: z.iso.datetime().nullable(),
    })
    .parse(input);
  const task = await db.task.findFirst({
    where: { id: taskId, userId, completedAt: null },
  });
  if (
    !task ||
    task.title !== title ||
    task.dueAt?.toISOString() !== (dueAt ?? undefined)
  )
    throw new TaskError(
      "La tarea ha cambiado o ya está completada. Actualiza la página.",
    );
  return db.$transaction(
    async (tx) => {
      const current = await tx.task.findFirst({
        where: {
          id: taskId,
          userId,
          completedAt: null,
          updatedAt: task.updatedAt,
        },
      });
      if (!current)
        throw new TaskError(
          "La tarea ha cambiado o ya está completada. Actualiza la página.",
        );
      const { done } = await ensureColumns(tx, userId),
        completedAt = new Date();
      await tx.task.update({
        where: { id: taskId, userId },
        data: {
          completedAt,
          sourceKey: null,
          ...(done
            ? {
                columnId: done.id,
                position: await tx.task.count({
                  where: { userId, columnId: done.id },
                }),
              }
            : {}),
        },
      });
      await tx.taskCompletion.create({
        data: {
          userId,
          taskId,
          taskIdentity: taskId,
          title: current.title,
          sourceKind: current.sourceKind,
          sourceId: current.sourceId,
          completedAt,
          ...(await completionContext(tx, userId, taskId)),
        },
      });
      await assertAccountQuota(tx, userId);
      return { id: taskId };
    },
    { isolationLevel: "Serializable" },
  );
}
export async function deleteTask(userId: string, taskId: string) {
  id.parse(taskId);
  return db.$transaction(
    async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, userId } });
      if (!task) throw new TaskError("Tarea no disponible.");
      await tx.task.delete({ where: { id: taskId, userId } });
    },
    { isolationLevel: "Serializable" },
  );
}
export async function saveColumn(
  userId: string,
  columnId: string | undefined,
  input: unknown,
) {
  const { name, position, isDone } = z
    .object({
      name: z.string().trim().min(1).max(80),
      position: z.coerce.number().int().min(0).max(29).optional(),
      isDone: z.boolean().optional(),
    })
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const columns = await tx.boardColumn.findMany({
        where: { userId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      if (columnId && !columns.some((c) => c.id === columnId))
        throw new TaskError("Columna no disponible.");
      if (!columnId && columns.length >= 30)
        throw new TaskError("Puedes crear hasta 30 columnas.");
      const record = columnId
        ? await tx.boardColumn.update({
            where: { id: columnId, userId },
            data: { name },
          })
        : await tx.boardColumn.create({
            data: { name, userId, position: columns.length },
          });
      const ordered = columns.filter((c) => c.id !== record.id);
      ordered.splice(
        Math.min(
          position ??
            (columnId
              ? columns.findIndex((c) => c.id === record.id)
              : ordered.length),
          ordered.length,
        ),
        0,
        record,
      );
      const destination =
        isDone === true
          ? record.id
          : (ordered.find(
              (c) => c.isDone && !(c.id === record.id && isDone === false),
            )?.id ?? ordered[ordered.length - 1].id);
      for (let i = 0; i < ordered.length; i++)
        await tx.boardColumn.update({
          where: { id: ordered[i].id, userId },
          data: { position: i, isDone: ordered[i].id === destination },
        });
      return record;
    },
    { isolationLevel: "Serializable" },
  );
}
export async function deleteColumn(
  userId: string,
  columnId: string,
  input: unknown,
) {
  id.parse(columnId);
  const data = z
    .object({
      mode: z.enum(["move", "delete"]),
      targetColumnId: id.optional(),
      confirmed: z.literal(true),
      taskVersions: z
        .array(z.object({ id, updatedAt: z.iso.datetime() }))
        .max(6000),
    })
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const columns = await tx.boardColumn.findMany({
        where: { userId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      if (!columns.some((c) => c.id === columnId))
        throw new TaskError("Columna no disponible.");
      if (columns.length < 2)
        throw new TaskError("Mantén al menos una columna en el tablero.");
      const tasks = await tx.task.findMany({
        where: { userId, columnId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      if (
        tasks.length !== data.taskVersions.length ||
        new Set(data.taskVersions.map((t) => t.id)).size !== tasks.length ||
        tasks.some(
          (t) =>
            !data.taskVersions.some(
              (v) => v.id === t.id && v.updatedAt === t.updatedAt.toISOString(),
            ),
        )
      )
        throw new TaskError(
          "Las tareas de la columna han cambiado. Actualiza y confirma de nuevo.",
        );
      if (data.mode === "move") {
        const target = columns.find(
          (c) => c.id === data.targetColumnId && c.id !== columnId,
        );
        if (!target) throw new TaskError("Elige otra columna de tu tablero.");
        const last = await tx.task.aggregate({
          where: { userId, columnId: target.id },
          _max: { position: true },
        });
        for (let i = 0; i < tasks.length; i++)
          await tx.task.update({
            where: { id: tasks[i].id, userId },
            data: {
              columnId: target.id,
              position: (last._max.position ?? -1) + 1 + i,
            },
          });
      } else {
        for (const task of tasks) {
          await tx.task.delete({ where: { id: task.id, userId } });
        }
      }
      await tx.boardColumn.delete({ where: { id: columnId, userId } });
      const remaining = columns.filter((c) => c.id !== columnId);
      const destination =
        remaining.find((c) => c.isDone)?.id ??
        (data.mode === "move" ? data.targetColumnId : undefined) ??
        remaining[remaining.length - 1].id;
      for (let i = 0; i < remaining.length; i++)
        await tx.boardColumn.update({
          where: { id: remaining[i].id, userId },
          data: { position: i, isDone: remaining[i].id === destination },
        });
      return { id: columnId };
    },
    { isolationLevel: "Serializable", timeout: 30000 },
  );
}
export async function unlinkRecord(
  tx: Tx,
  userId: string,
  kind: EntityKind,
  recordId: string,
) {
  await tx.taskLink.deleteMany({ where: { kind, recordId, task: { userId } } });
  await tx.task.updateMany({
    where: { userId, sourceKind: kind, sourceId: recordId },
    data: { sourceKey: null, sourceKind: null, sourceId: null },
  });
}
