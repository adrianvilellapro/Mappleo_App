import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { db } from "../../lib/db";
import { registerAccount } from "../../lib/auth/register";
import {
  registrationBlocked,
  recordRegistrationFailure,
} from "../../lib/auth/registration-throttle";
import {
  registrationSourceKey,
  registrationWindowMs,
} from "../../lib/auth/registration-access";
const prefix = "gate-" + randomUUID();
const sources = [prefix + "-first", prefix + "-other", prefix + "-parallel"];
afterAll(async () => {
  await db.authThrottle.deleteMany({
    where: { key: { in: sources.map(registrationSourceKey) } },
  });
  await db.$disconnect();
});
describe("Invitación y bloqueo persistente por origen", () => {
  it("no crea usuarios al enviar códigos incorrectos y bloquea desde el noveno fallo", async () => {
    const source = sources[0],
      before = await db.user.count();
    for (let i = 1; i <= 8; i++) {
      const result = await registerAccount(
        { registrationCode: "invalid" },
        source,
      );
      expect(result.status).toBe(403);
    }
    const ninth = await registerAccount(
      { registrationCode: "invalid" },
      source,
    );
    expect(ninth.status).toBe(429);
    expect(await registrationBlocked(source)).toBe(true);
    expect(await registrationBlocked(sources[1])).toBe(false);
    expect(
      (
        await registerAccount(
          {
            registrationCode: process.env.REGISTRATION_CODE,
            name: "Bloqueada",
            email: prefix + "@example.test",
            password: "Prueba privada segura 42!",
            confirmPassword: "Prueba privada segura 42!",
          },
          source,
        )
      ).status,
    ).toBe(429);
    expect(await db.user.count()).toBe(before);
    const row = await db.authThrottle.findUniqueOrThrow({
      where: { key: registrationSourceKey(source) },
    });
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      registrationWindowMs - 10000,
    );
    // Simulate elapsed time by changing only this fictitious source's expiry.
    await db.authThrottle.update({
      where: { key: row.key },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(await registrationBlocked(source)).toBe(false);
    expect(
      (await registerAccount({ registrationCode: "invalid" }, source)).status,
    ).toBe(403);
    expect(
      (await db.authThrottle.findUniqueOrThrow({ where: { key: row.key } }))
        .count,
    ).toBe(1);
  });
  it("nueve fallos concurrentes no pierden incrementos ni bloquean a otra fuente", async () => {
    await Promise.all(
      Array.from({ length: 9 }, () => recordRegistrationFailure(sources[2])),
    );
    expect(await registrationBlocked(sources[2])).toBe(true);
    expect(await registrationBlocked(sources[1])).toBe(false);
  });
});
