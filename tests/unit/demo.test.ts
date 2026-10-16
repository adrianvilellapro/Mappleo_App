import { describe, expect, it } from "vitest";
import { DemoStore, DEMO_TTL } from "../../apps/demo/src/store";
import { createDemoWorkspace } from "../../apps/demo/src/seed";
import { backupSchema } from "../../packages/domain/backup";
import { translateDemo } from "../../apps/demo/vite.config";
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}
const companyDefaults = { workMode: "UNKNOWN", interestRating: 3 };
describe("public static demo isolation and lifecycle", () => {
  it("generates valid, fictitious six-month fixtures in both languages, including the first day of a year", () => {
    for (const lang of ["es", "en"] as const)
      for (const date of [new Date("2026-10-16"), new Date("2027-01-01")]) {
        const data = createDemoWorkspace(lang, date);
        expect(backupSchema.safeParse(data).success).toBe(true);
        expect([
          data.companies.length,
          data.offers.length,
          data.applications.length,
          data.contacts.length,
          data.networking.length,
          data.tasks?.length,
        ]).toEqual([24, 64, 54, 36, 18, 34]);
        expect(
          new Set(data.applications.map((a) => a.appliedAt.slice(0, 7))).size,
        ).toBe(6);
        expect(
          data.contacts.every((c) => c.email.endsWith("@example.test")),
        ).toBe(true);
      }
  });
  it("supports validated CRUD and atomic rollback without a server", () => {
    const store = new DemoStore("es", memory()),
      before = store.snapshot();
    store.command({
      action: "save",
      kind: "companies",
      input: {
        ...companyDefaults,
        name: "My demo company",
        websiteUrl: "https://example.com",
      },
    });
    const company = store.snapshot().companies.at(-1)!;
    expect(company.name).toBe("My demo company");
    store.command({
      action: "save",
      kind: "companies",
      id: company.id,
      input: { ...companyDefaults, name: "Updated" },
    });
    expect(store.snapshot().companies.at(-1)?.name).toBe("Updated");
    expect(() =>
      store.command({
        action: "save",
        kind: "offers",
        input: { title: "bad", companyId: "missing" },
      }),
    ).toThrow();
    expect(store.snapshot().offers).toEqual(before.offers);
    expect(() =>
      store.command({
        action: "save",
        kind: "companies",
        input: { name: "unsafe", websiteUrl: "javascript:alert(1)" },
      }),
    ).toThrow();
    store.command({ action: "delete", kind: "companies", id: company.id });
    expect(store.snapshot().companies).toEqual(before.companies);
  });
  it("moves and completes cards, preserves history when deleting and reassigns a removed done column", () => {
    const store = new DemoStore("en", memory()),
      task = store.snapshot().tasks![0],
      done = store.snapshot().boardColumns!.find((c) => c.isDone)!;
    store.command({
      action: "moveTask",
      id: task.id,
      columnId: done.id,
      position: 0,
    });
    expect(
      store.snapshot().tasks!.find((t) => t.id === task.id)?.completedAt,
    ).toBeTruthy();
    store.command({ action: "delete", kind: "tasks", id: task.id });
    expect(store.snapshot().taskCompletions!.at(-1)?.taskId).toBeNull();
    store.command({
      action: "delete",
      kind: "boardColumns",
      id: done.id,
      moveTo: store.snapshot().boardColumns![0].id,
    });
    expect(store.snapshot().boardColumns!.filter((c) => c.isDone)).toHaveLength(
      1,
    );
  });
  it("retains reload changes only until a fixed expiry, without extending it on each change", () => {
    let now = Date.now();
    const storage = memory();
    const store = new DemoStore("es", storage, () => now),
      expiry = store.expiresAt;
    store.command({
      action: "save",
      kind: "companies",
      input: { ...companyDefaults, name: "Temporary" },
    });
    now += 60000;
    const reload = new DemoStore("es", storage, () => now);
    expect(reload.snapshot().companies.at(-1)?.name).toBe("Temporary");
    expect(reload.expiresAt).toBe(expiry);
    now += DEMO_TTL;
    expect(
      new DemoStore("es", storage, () => now).snapshot().companies,
    ).toHaveLength(24);
    expect(() =>
      reload.command({ action: "delete", kind: "companies", id: "missing" }),
    ).toThrow(/caducado/);
    expect(reload.snapshot().companies).toHaveLength(24);
  });
  it("recovers from corrupt/foreign cache and disabled storage, and never embeds database secrets", () => {
    const storage = memory();
    storage.setItem(
      "mappleo-portfolio-demo-v1-es",
      JSON.stringify({
        expiresAt: Date.now() + 60000,
        data: { ownerId: "foreign" },
      }),
    );
    expect(new DemoStore("es", storage).snapshot().ownerId).toBe(
      "demo-john-miller",
    );
    const blocked = {
      getItem: () => {
        throw Error("disabled");
      },
      setItem: () => {
        throw Error("disabled");
      },
      removeItem: () => {},
    };
    const store = new DemoStore("es", blocked);
    store.command({
      action: "save",
      kind: "companies",
      input: { ...companyDefaults, name: "In memory" },
    });
    expect(store.snapshot().companies.at(-1)?.name).toBe("In memory");
    expect(store.cacheAvailable).toBe(false);
    expect(JSON.stringify(store.snapshot())).not.toMatch(
      /neon\.tech|npg_|vcp_|AUTH_SECRET|argon2/i,
    );
  });
  it("localises complete UI literals without changing keys, identifiers or user data", () => {
    expect(
      translateDemo(
        'const kind = "companies"; const label = "Empresas"; const x = <h1>Lo siguiente</h1>;',
        "test.tsx",
      ),
    ).toBe(
      'const kind = "companies"; const label = "Companies"; const x = <h1>{"Up next"}</h1>;',
    );
  });
});
