CREATE TABLE "DesktopDevice" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DesktopDevice_userId_idx" ON "DesktopDevice"("userId");
CREATE TABLE "DesktopAuthorization" (
  "codeHash" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "challenge" TEXT NOT NULL, "redirectUri" TEXT NOT NULL, "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SyncVersion" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE, "revision" BIGINT NOT NULL DEFAULT 1
);
INSERT INTO "SyncVersion" ("userId") SELECT "id" FROM "User";
-- One inexpensive cursor per account. All existing web write paths are covered,
-- including nested history, task links and implicit many-to-many relations.
CREATE FUNCTION mappleo_sync_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE item JSONB; owner_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN item := to_jsonb(OLD); ELSE item := to_jsonb(NEW); END IF;
  owner_id := item->>'userId';
  IF TG_TABLE_NAME = 'ApplicationEvent' THEN
    SELECT "userId" INTO owner_id FROM "Application" WHERE id = item->>'applicationId';
  ELSIF TG_TABLE_NAME = 'TaskLink' THEN
    SELECT "userId" INTO owner_id FROM "Task" WHERE id = item->>'taskId';
  ELSIF TG_TABLE_NAME IN ('_CompanyToNetworkingEvent', '_ContactToNetworkingEvent') THEN
    SELECT "userId" INTO owner_id FROM "NetworkingEvent" WHERE id = item->>'B';
  END IF;
  IF owner_id IS NOT NULL AND EXISTS (SELECT 1 FROM "User" WHERE id = owner_id) THEN
    INSERT INTO "SyncVersion" ("userId", "revision") VALUES (owner_id, 1)
    ON CONFLICT ("userId") DO UPDATE SET "revision" = "SyncVersion"."revision" + 1;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['Company','JobOffer','Application','ApplicationEvent','Contact','NetworkingEvent','TechnologyTag','BoardColumn','Task','TaskLink','TaskCompletion','_CompanyToNetworkingEvent','_ContactToNetworkingEvent'] LOOP
    EXECUTE format('CREATE TRIGGER mappleo_sync_changed BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION mappleo_sync_changed()', table_name);
  END LOOP;
END $$;
