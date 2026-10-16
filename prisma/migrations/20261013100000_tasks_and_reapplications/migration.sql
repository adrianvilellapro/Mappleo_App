DROP INDEX "Application_userId_jobOfferId_key";
CREATE INDEX "Application_userId_jobOfferId_appliedAt_idx" ON "Application"("userId", "jobOfferId", "appliedAt");
CREATE TABLE "BoardColumn" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL, "position" INTEGER NOT NULL DEFAULT 0, "isDone" BOOLEAN NOT NULL DEFAULT false, "systemKey" TEXT
);
CREATE UNIQUE INDEX "BoardColumn_userId_systemKey_key" ON "BoardColumn"("userId", "systemKey");
CREATE INDEX "BoardColumn_userId_position_idx" ON "BoardColumn"("userId", "position");
CREATE TABLE "Task" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "columnId" TEXT NOT NULL REFERENCES "BoardColumn"("id") ON DELETE RESTRICT,
 "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '', "dueAt" TIMESTAMP(3), "position" INTEGER NOT NULL DEFAULT 0,
 "completedAt" TIMESTAMP(3), "sourceKey" TEXT, "sourceKind" TEXT, "sourceId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Task_sourceKey_key" ON "Task"("sourceKey");
CREATE INDEX "Task_userId_columnId_position_idx" ON "Task"("userId", "columnId", "position");
CREATE INDEX "Task_userId_completedAt_dueAt_idx" ON "Task"("userId", "completedAt", "dueAt");
CREATE TABLE "TaskLink" (
 "id" TEXT NOT NULL PRIMARY KEY, "taskId" TEXT NOT NULL REFERENCES "Task"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "recordId" TEXT NOT NULL, "label" TEXT NOT NULL
);
CREATE UNIQUE INDEX "TaskLink_taskId_kind_recordId_key" ON "TaskLink"("taskId", "kind", "recordId");
CREATE INDEX "TaskLink_kind_recordId_idx" ON "TaskLink"("kind", "recordId");
CREATE TABLE "TaskCompletion" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "taskId" TEXT REFERENCES "Task"("id") ON DELETE SET NULL, "taskIdentity" TEXT NOT NULL, "title" TEXT NOT NULL,
 "sourceKind" TEXT, "sourceId" TEXT, "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TaskCompletion_userId_completedAt_idx" ON "TaskCompletion"("userId", "completedAt");
-- Deterministic defaults and existing reminders; no completed history is invented.
INSERT INTO "BoardColumn" ("id", "userId", "name", "position", "isDone", "systemKey")
SELECT 'board_' || md5(u."id" || v.key), u."id", v.name, v.pos, v.done, v.key
FROM "User" u CROSS JOIN (VALUES ('todo', 'Por hacer', 0, false), ('doing', 'En curso', 1, false), ('done', 'Completadas', 2, true)) v(key,name,pos,done);
INSERT INTO "Task" ("id", "userId", "columnId", "title", "dueAt", "sourceKey", "sourceKind", "sourceId")
SELECT 'task_' || md5('applications:' || a."id"), a."userId", 'board_' || md5(a."userId" || 'todo'), a."nextAction", a."nextActionDueAt", 'applications:' || a."id", 'applications', a."id"
FROM "Application" a WHERE a."nextAction" <> '' AND a."status" NOT IN ('ACCEPTED','REJECTED','WITHDRAWN','GHOSTED');
INSERT INTO "Task" ("id", "userId", "columnId", "title", "dueAt", "sourceKey", "sourceKind", "sourceId")
SELECT 'task_' || md5('contacts:' || c."id"), c."userId", 'board_' || md5(c."userId" || 'todo'), 'Contactar con ' || c."name", c."followUpAt", 'contacts:' || c."id", 'contacts', c."id"
FROM "Contact" c WHERE c."followUpAt" IS NOT NULL;
INSERT INTO "TaskLink" ("id","taskId","kind","recordId","label")
SELECT 'link_' || md5(t."id"), t."id", t."sourceKind", t."sourceId", CASE WHEN t."sourceKind"='contacts' THEN c."name" ELSE o."title" END
FROM "Task" t LEFT JOIN "Contact" c ON c."id"=t."sourceId" LEFT JOIN "Application" a ON a."id"=t."sourceId" LEFT JOIN "JobOffer" o ON o."id"=a."jobOfferId";
