import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultTechnologies,
  technologyKey,
} from "../../features/tracker/technologies";

const mocks = vi.hoisted(() => ({
  migrate: vi.fn(),
  db: {
    authThrottle: { deleteMany: vi.fn() },
    user: { upsert: vi.fn(), deleteMany: vi.fn() },
    boardColumn: { createMany: vi.fn() },
    technologyTag: { createMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}));
vi.mock("node:child_process", () => ({ execFileSync: mocks.migrate }));
vi.mock("../../generated/prisma/client", () => ({
  PrismaClient: class {},
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("bcryptjs", () => ({ hash: vi.fn().mockResolvedValue("test-hash") }));
vi.mock("../../lib/db/encrypted-client", () => ({
  encryptClient: () => mocks.db,
}));
import setup from "../e2e/global-setup";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/mappleo_test");
  vi.stubEnv("AUTHORIZED_EMAIL", "owner@example.test");
  vi.stubEnv("E2E_PASSWORD", "test-password");
  vi.stubEnv("E2E_ISOLATED_RUN", "0");
  mocks.db.user.upsert.mockResolvedValue({ id: "test-owner" });
});
afterEach(() => vi.unstubAllEnvs());

describe("Preparación E2E independiente de datos anteriores", () => {
  it("prepara para la cuenta el catálogo completo, incluido Angular", async () => {
    await setup();
    expect(mocks.db.technologyTag.createMany).toHaveBeenCalledWith({
      data: defaultTechnologies.map((name) => ({
        userId: "test-owner",
        name,
        key: technologyKey(name),
      })),
      skipDuplicates: true,
    });
    expect(mocks.db.$disconnect).toHaveBeenCalledOnce();
  });

  it("prepara también las cuentas existentes sin duplicar sus etiquetas", async () => {
    mocks.db.user.upsert.mockResolvedValue({ id: "existing-test-owner" });
    await setup();
    await setup();
    expect(mocks.db.technologyTag.createMany).toHaveBeenCalledTimes(2);
    for (const [input] of mocks.db.technologyTag.createMany.mock.calls) {
      expect(input.skipDuplicates).toBe(true);
      expect(
        input.data.every(
          (tag: { userId: string }) => tag.userId === "existing-test-owner",
        ),
      ).toBe(true);
    }
  });

  it("rechaza una base real antes de migrar o escribir datos", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/mappleo");
    await expect(setup()).rejects.toThrow("Se requiere la base mappleo_test.");
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(mocks.db.user.upsert).not.toHaveBeenCalled();
    expect(mocks.db.technologyTag.createMany).not.toHaveBeenCalled();
  });
  it("aísla la cuenta temporal y retira exclusivamente esa cuenta al terminar", async () => {
    vi.stubEnv("E2E_ISOLATED_RUN", "1");
    vi.stubEnv("E2E_RUN_EMAIL", "");
    const teardown = await setup();
    const email = process.env.E2E_RUN_EMAIL;
    expect(email).toMatch(/^e2e-[a-f0-9-]{36}@example\.test$/);
    expect(process.env.AUTHORIZED_EMAIL).toBe(email);
    expect(mocks.db.boardColumn.createMany).toHaveBeenCalledOnce();
    expect(mocks.db.user.deleteMany).not.toHaveBeenCalled();
    await teardown!();
    expect(mocks.db.user.deleteMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "test-owner", email },
    });
    expect(mocks.db.$disconnect).toHaveBeenCalledTimes(2);
  });
});
