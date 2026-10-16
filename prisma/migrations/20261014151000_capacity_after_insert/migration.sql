-- AFTER INSERT counts only actual inserts, never ON CONFLICT updates/skipped rows.
DROP TRIGGER "User_account_capacity" ON "User";
CREATE OR REPLACE FUNCTION mappleo_account_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public."RegistrationPolicy" SET "accountCount" = "accountCount" + 1
      WHERE id = 1 AND "accountCount" < "maxAccounts";
    IF NOT FOUND THEN RAISE EXCEPTION 'Mappleo_account_capacity' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  ELSE
    UPDATE public."RegistrationPolicy" SET "accountCount" = "accountCount" - 1 WHERE id = 1;
    RETURN OLD;
  END IF;
END $$;
CREATE FUNCTION mappleo_reserved_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public."AdminAccount" WHERE "emailLookup" = NEW."emailLookup") THEN
    RAISE EXCEPTION 'Mappleo_reserved_admin_identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION mappleo_reserved_admin() FROM PUBLIC;
CREATE TRIGGER "User_reserved_admin" BEFORE INSERT OR UPDATE OF "emailLookup" ON "User"
  FOR EACH ROW EXECUTE FUNCTION mappleo_reserved_admin();
CREATE TRIGGER "User_account_capacity" AFTER INSERT OR DELETE ON "User"
  FOR EACH ROW EXECUTE FUNCTION mappleo_account_capacity();
