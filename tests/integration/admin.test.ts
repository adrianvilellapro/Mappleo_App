import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { db } from "../../lib/db";
import { adminDatabase } from "../../features/admin/db";
import { adminConfiguration, adminTotp } from "../../features/admin/config";
import {
  loginAdmin,
  authenticateAdmin,
  adminMutation,
  adminOverview,
  logoutAdmin,
  type AdminIdentity,
} from "../../features/admin/service";
import { verifyPassword } from "../../lib/auth/password";
import { registerAccount } from "../../lib/auth/register";
const sql = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const ownerIds: string[] = [];
let baseTime = 0,
  tick = 0,
  token = "",
  identity: AdminIdentity,
  userId = "";
const settings = () => adminConfiguration();
const nextCode = () => {
  tick++;
  vi.setSystemTime(baseTime + tick * 30000);
  return adminTotp(settings().secret).generate({ timestamp: Date.now() });
};
async function createUser() {
  const user = await db.user.create({
    data: {
      name: "Persona privada",
      email: `admin-fixture-${randomUUID()}@example.test`,
    },
  });
  ownerIds.push(user.id);
  return user.id;
}
describe("Administrador único y autorización real", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://localhost:3000");
    await db.authThrottle.deleteMany();
    baseTime = Math.ceil(Date.now() / 30000) * 30000;
    await sql.adminAccount.update({
      where: { id: 1 },
      data: { lastTotpCounter: -1 },
    });
    userId = await createUser();
    token = (
      await loginAdmin(
        {
          email: settings().email,
          password: settings().password,
          code: nextCode(),
        },
        "local-loopback",
      )
    ).token;
    identity = await authenticateAdmin(token, "local-loopback");
  });
  afterAll(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    await sql.registrationPolicy.update({
      where: { id: 1 },
      data: { maxAccounts: 100000 },
    });
    for (const id of ownerIds)
      await sql.$queryRaw`SELECT mappleo_admin_delete_user(${id})`;
    await sql.adminSession.deleteMany();
    await sql.adminAccount.update({
      where: { id: 1 },
      data: { lastTotpCounter: -1 },
    });
    await sql.$disconnect();
    await adminDatabase().$disconnect();
    await db.$disconnect();
  });
  it("no permite un segundo administrador ni registro reservado, y un User no puede promocionarse", async () => {
    const account = await sql.adminAccount.findUniqueOrThrow({
      where: { id: 1 },
    });
    await expect(
      sql.adminAccount.create({
        data: {
          ...account,
          id: 2,
          emailLookup: randomBytes(32).toString("hex"),
        },
      }),
    ).rejects.toThrow();
    await expect(db.adminAccount.findMany()).rejects.toThrow();
    await expect(
      db.adminSession.create({
        data: {
          id: "forged",
          fingerprint: "forged",
          sourceHash: "forged",
          expiresAt: new Date(Date.now() + 60000),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.registrationPolicy.update({
        where: { id: 1 },
        data: { maxAccounts: 9999 },
      }),
    ).rejects.toThrow();
    const registration = await registerAccount(
      {
        name: "Falso administrador",
        email: settings().email,
        password: "Prueba privada segura 27!",
        confirmPassword: "Prueba privada segura 27!",
        role: "ADMIN",
        registrationCode: process.env.REGISTRATION_CODE,
      },
      "admin-reserved-test",
    );
    expect(registration.ok).toBe(false);
    expect(await sql.adminAccount.count()).toBe(1);
  });
  it("ni el rol de usuarios puede borrar por la función, ni el administrador leer contenido/hash", async () => {
    await expect(
      db.$queryRaw`SELECT mappleo_admin_delete_user(${userId})`,
    ).rejects.toThrow();
    await expect(
      adminDatabase().user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      }),
    ).rejects.toThrow();
    await expect(
      adminDatabase().company.findMany({ select: { notes: true } }),
    ).rejects.toThrow();
    await expect(adminDatabase().adminAudit.deleteMany()).rejects.toThrow();
  });
  it("rechaza tokens inventados, otra IP, contraseña incorrecta, MFA ausente y OTP reutilizado", async () => {
    await expect(
      authenticateAdmin(randomBytes(32).toString("hex"), "local-loopback"),
    ).rejects.toThrow();
    await expect(authenticateAdmin(token, "8.8.8.8")).rejects.toThrow();
    await expect(
      loginAdmin(
        { email: settings().email, password: "invalid", code: nextCode() },
        "local-loopback",
      ),
    ).rejects.toThrow();
    await expect(
      loginAdmin(
        { email: settings().email, password: settings().password },
        "local-loopback",
      ),
    ).rejects.toThrow();
    const used = adminTotp(settings().secret).generate({
      timestamp: baseTime + 30000,
    });
    await expect(
      loginAdmin(
        { email: settings().email, password: settings().password, code: used },
        "local-loopback",
      ),
    ).rejects.toThrow();
  });
  it("entrega emails completos solo al administrador, sin ampliar otros datos privados", async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const overview = await adminOverview(identity, {
      search: user.email,
      page: 1,
    });
    expect(overview.accounts).toHaveLength(1);
    expect(overview.accounts[0]).not.toHaveProperty("passwordHash");
    expect(overview.accounts[0]).not.toHaveProperty("name");
    expect(overview.accounts[0].email).toBe(user.email);
    expect(overview.administrator).toBe(settings().email);
    expect(Object.keys(overview.accounts[0]).sort()).toEqual(
      [
        "id",
        "email",
        "createdAt",
        "updatedAt",
        "counts",
        "activeSessions",
      ].sort(),
    );
    expect(overview.accounts[0].id).toBe(userId);
  });
  it("restablecer exige la contraseña distinta, OTP nuevo, cierra sesiones y no revela hashes", async () => {
    const sid = randomBytes(32).toString("hex");
    await db.authSession.create({
      data: {
        id: sid,
        userId,
        sessionVersion: 0,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const input = {
      userId,
      password: "Otra clave privada 42!",
      confirmPassword: "Otra clave privada 42!",
      code: nextCode(),
      actionPassword: settings().password,
    };
    await expect(
      adminMutation(identity, "reset-password", input),
    ).rejects.toThrow();
    expect(await db.authSession.count({ where: { userId } })).toBe(1);
    await adminMutation(identity, "reset-password", {
      ...input,
      actionPassword: settings().actionPassword,
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(input.password, user.passwordHash!)).toBe(true);
    expect(user.sessionVersion).toBe(1);
    expect(await db.authSession.count({ where: { userId } })).toBe(0);
    await expect(
      adminMutation(identity, "reset-password", {
        ...input,
        actionPassword: settings().actionPassword,
      }),
    ).rejects.toThrow();
  });
  it("el límite se impone en PostgreSQL incluso con registros simultáneos y no cuenta upserts", async () => {
    const policy = await db.registrationPolicy.findUniqueOrThrow({
      where: { id: 1 },
    });
    await adminMutation(identity, "limit", {
      maxAccounts: policy.accountCount + 1,
      actionPassword: settings().actionPassword,
      code: nextCode(),
    });
    const results = await Promise.allSettled([createUser(), createUser()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const full = await db.registrationPolicy.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(full.accountCount).toBe(full.maxAccounts);
    await expect(
      adminMutation(identity, "limit", {
        maxAccounts: 1,
        actionPassword: settings().actionPassword,
        code: nextCode(),
      }),
    ).rejects.toThrow();
    const original = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await db.user.upsert({
      where: { email: original.email },
      create: { name: "No se crea", email: original.email },
      update: { name: "Persona privada" },
    });
    expect(
      (await db.registrationPolicy.findUniqueOrThrow({ where: { id: 1 } }))
        .accountCount,
    ).toBe(full.accountCount);
    const denied = await registerAccount(
      {
        name: "Sin plaza",
        registrationCode: process.env.REGISTRATION_CODE,
        email: `no-slot-${randomUUID()}@example.test`,
        password: "Prueba privada segura 27!",
        confirmPassword: "Prueba privada segura 27!",
      },
      "admin-capacity-test",
    );
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("límite");
    await sql.registrationPolicy.update({
      where: { id: 1 },
      data: { maxAccounts: 100000 },
    });
  });
  it("el borrado exige confirmación completa y elimina datos enlazados sin tocar otras cuentas", async () => {
    const doomed = await createUser();
    const company = await db.company.create({
      data: { userId: doomed, name: "Empresa privada" },
    });
    const offer = await db.jobOffer.create({
      data: { userId: doomed, companyId: company.id, title: "Oferta privada" },
    });
    await db.application.create({
      data: {
        userId: doomed,
        jobOfferId: offer.id,
        events: {
          create: { type: "NOTE", title: "Nota", description: "Privado" },
        },
      },
    });
    const contact = await db.contact.create({
      data: { userId: doomed, companyId: company.id, name: "Contacto privado" },
    });
    await db.networkingEvent.create({
      data: {
        userId: doomed,
        name: "Evento privado",
        startsAt: new Date(),
        companies: { connect: { id: company.id } },
        contacts: { connect: { id: contact.id } },
      },
    });
    const column = await db.boardColumn.findFirstOrThrow({
      where: { userId: doomed },
    });
    const task = await db.task.create({
      data: {
        userId: doomed,
        columnId: column.id,
        title: "Tarea",
        links: {
          create: { kind: "contacts", recordId: contact.id, label: "Privado" },
        },
      },
    });
    await db.taskCompletion.create({
      data: {
        userId: doomed,
        taskId: task.id,
        taskIdentity: task.id,
        title: "Completada",
      },
    });
    const count = (
      await db.registrationPolicy.findUniqueOrThrow({ where: { id: 1 } })
    ).accountCount;
    const input = {
      userId: doomed,
      actionPassword: settings().actionPassword,
      code: nextCode(),
      confirmation: "BORRAR",
    };
    await expect(
      adminMutation(identity, "delete-account", input),
    ).rejects.toThrow();
    await adminMutation(identity, "delete-account", {
      ...input,
      confirmation: `BORRAR ${doomed}`,
    });
    expect(await db.user.findUnique({ where: { id: doomed } })).toBeNull();
    expect(await db.company.count({ where: { userId: doomed } })).toBe(0);
    expect(await db.task.count({ where: { userId: doomed } })).toBe(0);
    expect(await db.user.findUnique({ where: { id: userId } })).not.toBeNull();
    expect(
      (await db.registrationPolicy.findUniqueOrThrow({ where: { id: 1 } }))
        .accountCount,
    ).toBe(count - 1);
  });
  it("revoca al salir, por inactividad, expiración y cambios de configuración", async () => {
    vi.setSystemTime(Date.now() + 11 * 60000);
    await expect(authenticateAdmin(token, "local-loopback")).rejects.toThrow();
    token = (
      await loginAdmin(
        {
          email: settings().email,
          password: settings().password,
          code: adminTotp(settings().secret).generate({
            timestamp: Date.now(),
          }),
        },
        "local-loopback",
      )
    ).token;
    identity = await authenticateAdmin(token, "local-loopback");
    const oldPassword = process.env.ADMIN_PASSWORD!;
    vi.stubEnv("ADMIN_PASSWORD", "changed".repeat(10));
    await expect(authenticateAdmin(token, "local-loopback")).rejects.toThrow();
    vi.stubEnv("ADMIN_PASSWORD", oldPassword);
    identity = await authenticateAdmin(token, "local-loopback");
    await sql.adminSession.update({
      where: { id: identity.sessionKey },
      data: { expiresAt: new Date(Date.now() - 1), lastSeenAt: new Date() },
    });
    await expect(authenticateAdmin(token, "local-loopback")).rejects.toThrow();
    vi.setSystemTime(Date.now() + 30000);
    const next = await loginAdmin(
      {
        email: settings().email,
        password: settings().password,
        code: adminTotp(settings().secret).generate({ timestamp: Date.now() }),
      },
      "local-loopback",
    );
    await expect(authenticateAdmin(token, "local-loopback")).rejects.toThrow();
    identity = await authenticateAdmin(next.token, "local-loopback");
    await logoutAdmin(identity);
    await expect(
      authenticateAdmin(next.token, "local-loopback"),
    ).rejects.toThrow();
  });
});
