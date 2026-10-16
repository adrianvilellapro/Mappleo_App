import { Client } from "pg";
import { taskEnvironment } from "./task-environment";
import { runtimePoolConfig } from "../lib/db/connection";
const { target } = taskEnvironment();
const admin = new Client(
  runtimePoolConfig(target.href, process.env.DATABASE_SSL_CA),
);
await admin.connect();
try {
  await admin.query("BEGIN");
  await admin.query(
    'DELETE FROM "AdminSession" WHERE "expiresAt" <= CURRENT_TIMESTAMP OR "lastSeenAt" < CURRENT_TIMESTAMP - INTERVAL \'10 minutes\'',
  );
  await admin.query(
    'DELETE FROM "AdminAudit" WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL \'90 days\'',
  );
  await admin.query(
    'DELETE FROM "SecurityEvent" WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL \'30 days\'',
  );
  await admin.query(
    'DELETE FROM "AuthSession" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
  );
  await admin.query(
    'DELETE FROM "DesktopAuthorization" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
  );
  await admin.query(
    'DELETE FROM "DesktopDevice" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
  );
  await admin.query(
    'DELETE FROM "AuthThrottle" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
  );
  await admin.query(
    'DELETE FROM "OperationLease" WHERE "expiresAt" <= CURRENT_TIMESTAMP',
  );
  await admin.query("COMMIT");
  console.log(
    "Metadatos de seguridad caducados eliminados. No se han eliminado registros del espacio de trabajo.",
  );
} catch {
  await admin.query("ROLLBACK");
  throw new Error("No se ha podido completar el mantenimiento de seguridad.");
} finally {
  await admin.end();
}
