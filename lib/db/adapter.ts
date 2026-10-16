import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { runtimePoolConfig } from "./connection";
export function databaseAdapter(url: string, ca?: string) {
  const pool = new Pool(runtimePoolConfig(url, ca));
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  return new PrismaPg(pool, { disposeExternalPool: true });
}
