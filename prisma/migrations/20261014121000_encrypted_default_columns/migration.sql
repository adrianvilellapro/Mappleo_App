-- Defaults must be encrypted by the application; DB must never possess its keys.
-- The encrypted client creates these columns as a nested atomic write.
DROP TRIGGER "User_default_columns" ON "User";
DROP FUNCTION mappleo_default_columns();
