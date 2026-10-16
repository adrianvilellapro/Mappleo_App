CREATE FUNCTION mappleo_check_task_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE related_owner TEXT;
BEGIN
  IF TG_TABLE_NAME = 'TaskCompletion' THEN
    IF NEW."taskId" IS NULL THEN RETURN NEW; END IF;
    SELECT "userId" INTO related_owner FROM "Task" WHERE id = NEW."taskId";
  ELSE
    IF NEW."sourceId" IS NULL AND NEW."sourceKind" IS NULL THEN RETURN NEW; END IF;
    IF NEW."sourceKind" = 'applications' THEN
      SELECT "userId" INTO related_owner FROM "Application" WHERE id = NEW."sourceId";
    ELSIF NEW."sourceKind" = 'contacts' THEN
      SELECT "userId" INTO related_owner FROM "Contact" WHERE id = NEW."sourceId";
    END IF;
  END IF;
  IF related_owner IS NULL OR related_owner <> NEW."userId" THEN
    RAISE EXCEPTION 'Task relation must belong to the same account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Task_source_owned" BEFORE INSERT OR UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION mappleo_check_task_owner();
CREATE TRIGGER "TaskCompletion_owned" BEFORE INSERT OR UPDATE ON "TaskCompletion" FOR EACH ROW EXECUTE FUNCTION mappleo_check_task_owner();

CREATE FUNCTION mappleo_default_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "BoardColumn" (id, "userId", name, position, "isDone", "systemKey") VALUES
    ('security_todo_' || NEW.id, NEW.id, 'Por hacer', 0, false, 'todo'),
    ('security_doing_' || NEW.id, NEW.id, 'En curso', 1, false, 'doing'),
    ('security_done_' || NEW.id, NEW.id, 'Completadas', 2, true, 'done');
  RETURN NEW;
END $$;
CREATE TRIGGER "User_default_columns" AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION mappleo_default_columns();
