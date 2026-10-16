import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { db } from "../../lib/db";
import { fieldCipher, cipherPrefix } from "../../lib/db/field-encryption";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const email = `encryption-${randomUUID()}@example.test`;
let userId: string;
let companyId: string;
describe("Cifrado real en PostgreSQL", () => {
  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "Nombre privado Álex",
        email,
        passwordHash: await hashPassword("Una clave privada 27!"),
      },
    });
    userId = user.id;
    companyId = (
      await db.company.create({
        data: {
          userId,
          name: "Empresa privada",
          notes: "Nota médica confidencial",
          tags: ["etiqueta privada"],
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (userId) {
      await admin.task.deleteMany({ where: { userId } });
      await admin.contact.deleteMany({ where: { userId } });
      await admin.user.delete({ where: { id: userId } });
    }
    await admin.$disconnect();
    await db.$disconnect();
  });
  it("guarda email, nombres y notas cifrados, pero permite login y evita cuentas duplicadas", async () => {
    const raw = await admin.user.findUniqueOrThrow({ where: { id: userId } });
    expect(raw.name.startsWith(cipherPrefix)).toBe(true);
    expect(raw.email.startsWith(cipherPrefix)).toBe(true);
    expect(raw.email).not.toContain(email);
    expect(raw.emailLookup).toBe(fieldCipher().emailLookup(email));
    const user = await db.user.findUniqueOrThrow({
      where: { email: email.toUpperCase() },
    });
    expect(user.id).toBe(userId);
    expect(user.name).toBe("Nombre privado Álex");
    expect(user.email).toBe(email);
    expect(
      await verifyPassword("Una clave privada 27!", user.passwordHash!),
    ).toBe(true);
    await expect(
      db.user.create({
        data: { name: "Duplicado", email: email.toUpperCase() },
      }),
    ).rejects.toThrow();
    const company = await admin.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    for (const value of [
      company.name,
      company.notes,
      company.websiteUrl,
      ...company.tags,
    ])
      expect(value.startsWith(cipherPrefix)).toBe(true);
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: companyId } })).tags,
    ).toEqual(["etiqueta privada"]);
  });
  it("cifra escrituras anidadas y lecturas con select/include dentro de transacciones", async () => {
    await db.$transaction(async (tx) => {
      const column = await tx.boardColumn.create({
        data: { userId, name: "Columna privada", position: 0 },
      });
      const task = await tx.task.create({
        data: {
          userId,
          columnId: column.id,
          title: "Tarea privada",
          links: {
            create: {
              kind: "companies",
              recordId: companyId,
              label: "Empresa privada",
            },
          },
        },
        include: { links: true, column: true },
      });
      expect(task.title).toBe("Tarea privada");
      expect(task.links[0].label).toBe("Empresa privada");
      expect(task.column.name).toBe("Columna privada");
      const linked = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          name: true,
          tasks: {
            select: { title: true, links: { select: { label: true } } },
          },
        },
      });
      expect(linked.tasks[0].links[0].label).toBe("Empresa privada");
    });
    const raw = await admin.task.findFirstOrThrow({
      where: { userId },
      include: { links: true },
    });
    expect(raw.title.startsWith(cipherPrefix)).toBe(true);
    expect(raw.links[0].label.startsWith(cipherPrefix)).toBe(true);
  });
  it("cifra createMany, updateMany, set, upsert y los teléfonos", async () => {
    const id = randomUUID();
    await db.contact.createMany({
      data: [
        {
          id,
          userId,
          name: "Contacto privado",
          email: "persona@example.test",
          phone: "+34 611 222 333",
        },
      ],
    });
    await db.contact.updateMany({
      where: { id, userId },
      data: { notes: "Notas privadas actualizadas" },
    });
    const contact = await db.contact.upsert({
      where: { id },
      create: { userId, name: "No se crea" },
      update: { name: { set: "María privada" } },
    });
    expect(contact.phone).toBe("+34 611 222 333");
    expect(contact.name).toBe("María privada");
    expect(contact.notes).toBe("Notas privadas actualizadas");
    const raw = await admin.contact.findUniqueOrThrow({ where: { id } });
    expect(raw.phone.startsWith(cipherPrefix)).toBe(true);
    expect(raw.email.startsWith(cipherPrefix)).toBe(true);
    expect(raw.notes.startsWith(cipherPrefix)).toBe(true);
  });
  it("rechaza texto plano incluso si una escritura se salta la capa de cifrado", async () => {
    await expect(
      admin.user.create({
        data: {
          name: "Sin cifrar",
          email: "plaintext@example.test",
          emailLookup: "fake",
        },
      }),
    ).rejects.toThrow();
    await expect(
      admin.company.update({
        where: { id: companyId },
        data: { notes: "Sin cifrar" },
      }),
    ).rejects.toThrow();
    await expect(
      admin.company.update({
        where: { id: companyId },
        data: {
          tags: [
            fieldCipher().encrypt("uno", "Company", "tags"),
            "otro sin cifrar",
          ],
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.company.findMany({ where: { userId, name: { contains: "privada" } } }),
    ).rejects.toThrow(/Filter encrypted/);
  });
  it("no expone datos manipulados o copiados entre campos", async () => {
    const original = await admin.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    await admin.company.update({
      where: { id: companyId },
      data: { notes: original.name },
    });
    await expect(
      db.company.findUnique({ where: { id: companyId } }),
    ).rejects.toThrow(/authenticate/);
    await admin.company.update({
      where: { id: companyId },
      data: { notes: original.notes },
    });
  });
});
