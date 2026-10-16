import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { encryptClient } from "../../lib/db/encrypted-client";
import {
  defaultTechnologies,
  technologyKey,
} from "../../features/tracker/technologies";
export default async function setup() {
  const target = new URL(process.env.DATABASE_URL!);
  if (
    target.pathname !== "/mappleo_test" ||
    !["localhost", "127.0.0.1"].includes(target.hostname)
  )
    throw new Error("Se requiere la base mappleo_test.");
  const isolated = process.env.E2E_ISOLATED_RUN === "1";
  if (isolated) {
    process.env.E2E_RUN_EMAIL = `e2e-${randomUUID()}@example.test`;
    process.env.AUTHORIZED_EMAIL = process.env.E2E_RUN_EMAIL;
  }
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { stdio: "inherit", env: process.env },
  );
  const client = () =>
    encryptClient(
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
      }),
    );
  const db = client();
  let fixtureId = "";
  try {
    await db.authThrottle.deleteMany();
    const user = await db.user.upsert({
      where: { email: process.env.AUTHORIZED_EMAIL! },
      create: {
        email: process.env.AUTHORIZED_EMAIL!,
        name: "Alex · Pruebas",
        passwordHash: await hash(process.env.E2E_PASSWORD!, 12),
      },
      update: {
        passwordHash: await hash(process.env.E2E_PASSWORD!, 12),
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
    fixtureId = user.id;
    // CI starts with an empty database: this direct account creation bypasses
    // registration, so provision the same catalogue without duplicating tags.
    await db.technologyTag.createMany({
      data: defaultTechnologies.map((name) => ({
        userId: user.id,
        name,
        key: technologyKey(name),
      })),
      skipDuplicates: true,
    });
    if (isolated)
      await db.boardColumn.createMany({
        data: [
          { systemKey: "todo", name: "Por hacer", position: 0 },
          { systemKey: "doing", name: "En curso", position: 1 },
          { systemKey: "done", name: "Completadas", position: 2, isDone: true },
        ].map((column) => ({ ...column, userId: user.id })),
        skipDuplicates: true,
      });
  } finally {
    await db.$disconnect();
  }
  if (isolated)
    return async () => {
      const cleanup = client();
      try {
        // Only this generated fixture and its cascading records; never other test/local accounts.
        await cleanup.user.deleteMany({
          where: { id: fixtureId, email: process.env.E2E_RUN_EMAIL },
        });
      } finally {
        await cleanup.$disconnect();
      }
    };
}
