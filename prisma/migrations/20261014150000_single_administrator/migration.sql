CREATE TABLE "AdminAccount" (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "emailLookup" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "actionPasswordHash" TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  "lastTotpCounter" INTEGER NOT NULL DEFAULT -1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AdminSession" (
  id TEXT PRIMARY KEY,
  "adminId" INTEGER NOT NULL DEFAULT 1 CHECK ("adminId" = 1) REFERENCES "AdminAccount"(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE TABLE "RegistrationPolicy" (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  "maxAccounts" INTEGER NOT NULL DEFAULT 50 CHECK ("maxAccounts" BETWEEN 1 AND 100000),
  "accountCount" INTEGER NOT NULL DEFAULT 1 CHECK ("accountCount" >= 1)
);
-- The sole administrator always reserves one slot. Existing users are never removed.
INSERT INTO "RegistrationPolicy" (id, "maxAccounts", "accountCount") SELECT 1, 50, COUNT(*) + 1 FROM "User";
CREATE TABLE "AdminAudit" (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  "targetUserId" TEXT,
  "sourceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminAudit_createdAt_idx" ON "AdminAudit"("createdAt");

CREATE FUNCTION mappleo_account_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public."AdminAccount" WHERE "emailLookup" = NEW."emailLookup") THEN
      RAISE EXCEPTION 'Mappleo_reserved_admin_identity' USING ERRCODE = '23514';
    END IF;
    UPDATE public."RegistrationPolicy" SET "accountCount" = "accountCount" + 1
      WHERE id = 1 AND "accountCount" < "maxAccounts";
    IF NOT FOUND THEN RAISE EXCEPTION 'Mappleo_account_capacity' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF EXISTS (SELECT 1 FROM public."AdminAccount" WHERE "emailLookup" = NEW."emailLookup") THEN
      RAISE EXCEPTION 'Mappleo_reserved_admin_identity' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  ELSE
    UPDATE public."RegistrationPolicy" SET "accountCount" = "accountCount" - 1 WHERE id = 1;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER "User_account_capacity" BEFORE INSERT OR UPDATE OF "emailLookup" OR DELETE ON "User"
  FOR EACH ROW EXECUTE FUNCTION mappleo_account_capacity();
REVOKE ALL ON FUNCTION mappleo_account_capacity() FROM PUBLIC;

-- Only the narrowly privileged admin runtime may invoke this function.
-- Fixed tables and parameterized target, with no dynamic SQL or returned content.
CREATE FUNCTION mappleo_admin_delete_user(target_id TEXT) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public."User" WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public."TaskCompletion" WHERE "userId" = target_id;
  DELETE FROM public."Task" WHERE "userId" = target_id;
  DELETE FROM public."BoardColumn" WHERE "userId" = target_id;
  DELETE FROM public."NetworkingEvent" WHERE "userId" = target_id;
  DELETE FROM public."Application" WHERE "userId" = target_id;
  DELETE FROM public."JobOffer" WHERE "userId" = target_id;
  DELETE FROM public."Contact" WHERE "userId" = target_id;
  DELETE FROM public."Company" WHERE "userId" = target_id;
  DELETE FROM public."User" WHERE id = target_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION mappleo_admin_delete_user(TEXT) FROM PUBLIC;
REVOKE ALL ON "AdminAccount", "AdminSession", "AdminAudit", "RegistrationPolicy" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mappleo_runtime') THEN
    REVOKE ALL ON "AdminAccount", "AdminSession", "AdminAudit", "RegistrationPolicy" FROM mappleo_runtime;
    GRANT SELECT ON "RegistrationPolicy" TO mappleo_runtime;
  END IF;
END $$;
