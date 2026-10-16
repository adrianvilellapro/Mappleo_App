-- Ownership is also enforced by PostgreSQL, not only by the application services.
CREATE UNIQUE INDEX "Company_id_userId_key" ON "Company"("id", "userId");
CREATE UNIQUE INDEX "JobOffer_id_userId_key" ON "JobOffer"("id", "userId");
CREATE UNIQUE INDEX "BoardColumn_id_userId_key" ON "BoardColumn"("id", "userId");
ALTER TABLE "JobOffer" DROP CONSTRAINT "JobOffer_companyId_fkey";
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "Company"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobOfferId_fkey";
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobOfferId_userId_fkey" FOREIGN KEY ("jobOfferId", "userId") REFERENCES "JobOffer"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_companyId_fkey";
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "Company"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" DROP CONSTRAINT "Task_columnId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_userId_fkey" FOREIGN KEY ("columnId", "userId") REFERENCES "BoardColumn"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Polymorphic task links and implicit networking join tables need equivalent checks.
CREATE FUNCTION mappleo_check_owned_relation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_a TEXT; owner_b TEXT;
BEGIN
  IF TG_TABLE_NAME = 'TaskLink' THEN
    SELECT "userId" INTO owner_a FROM "Task" WHERE id = NEW."taskId";
    CASE NEW.kind
      WHEN 'companies' THEN SELECT "userId" INTO owner_b FROM "Company" WHERE id = NEW."recordId";
      WHEN 'offers' THEN SELECT "userId" INTO owner_b FROM "JobOffer" WHERE id = NEW."recordId";
      WHEN 'applications' THEN SELECT "userId" INTO owner_b FROM "Application" WHERE id = NEW."recordId";
      WHEN 'contacts' THEN SELECT "userId" INTO owner_b FROM "Contact" WHERE id = NEW."recordId";
      WHEN 'networking' THEN SELECT "userId" INTO owner_b FROM "NetworkingEvent" WHERE id = NEW."recordId";
      ELSE RAISE EXCEPTION 'Invalid relation kind' USING ERRCODE = '23514';
    END CASE;
  ELSIF TG_TABLE_NAME = '_CompanyToNetworkingEvent' THEN
    SELECT "userId" INTO owner_a FROM "Company" WHERE id = NEW."A";
    SELECT "userId" INTO owner_b FROM "NetworkingEvent" WHERE id = NEW."B";
  ELSIF TG_TABLE_NAME = '_ContactToNetworkingEvent' THEN
    SELECT "userId" INTO owner_a FROM "Contact" WHERE id = NEW."A";
    SELECT "userId" INTO owner_b FROM "NetworkingEvent" WHERE id = NEW."B";
  END IF;
  IF owner_a IS NULL OR owner_b IS NULL OR owner_a <> owner_b THEN
    RAISE EXCEPTION 'Relation must belong to the same account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TaskLink_owned" BEFORE INSERT OR UPDATE ON "TaskLink" FOR EACH ROW EXECUTE FUNCTION mappleo_check_owned_relation();
CREATE TRIGGER "NetworkingCompany_owned" BEFORE INSERT OR UPDATE ON "_CompanyToNetworkingEvent" FOR EACH ROW EXECUTE FUNCTION mappleo_check_owned_relation();
CREATE TRIGGER "NetworkingContact_owned" BEFORE INSERT OR UPDATE ON "_ContactToNetworkingEvent" FOR EACH ROW EXECUTE FUNCTION mappleo_check_owned_relation();

-- Provision default columns once for existing accounts, so reading Kanban never writes data.
INSERT INTO "BoardColumn" (id, "userId", name, position, "isDone", "systemKey")
SELECT 'security_todo_' || id, id, 'Por hacer', 0, false, 'todo' FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "BoardColumn" c WHERE c."userId" = u.id);
INSERT INTO "BoardColumn" (id, "userId", name, position, "isDone", "systemKey")
SELECT 'security_doing_' || id, id, 'En curso', 1, false, 'doing' FROM "User" u
WHERE EXISTS (SELECT 1 FROM "BoardColumn" c WHERE c.id = 'security_todo_' || u.id);
INSERT INTO "BoardColumn" (id, "userId", name, position, "isDone", "systemKey")
SELECT 'security_done_' || id, id, 'Completadas', 2, true, 'done' FROM "User" u
WHERE EXISTS (SELECT 1 FROM "BoardColumn" c WHERE c.id = 'security_todo_' || u.id);
