import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { db } from "../../lib/db";
import {
  authorizeDevice,
  digest,
  exchangeCode,
  requireDevice,
  authorizationSchema,
} from "../../features/desktop/auth";
import { pullWorkspace, pushWorkspace } from "../../features/desktop/workspace";
import {
  canonical,
  withOwner,
  wireWorkspace,
} from "../../packages/domain/sync";
import { LocalStore } from "../../apps/windows/src/main/store";
import { proxy } from "../../proxy";
import { NextRequest } from "next/server";

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const verifier = randomBytes(32).toString("base64url"),
  state = randomBytes(32).toString("base64url");
const redirectUri = "http://127.0.0.1:43129/callback";
let owner: { id: string; sessionVersion: number },
  other: string,
  device: Awaited<ReturnType<typeof requireDevice>>,
  token: string,
  otherCompany: string;
beforeAll(async () => {
  vi.stubEnv("DESKTOP_SYNC_ENABLED", "true");
  owner = await db.user.create({
    data: {
      name: "Desktop sync owner",
      email: `desktop-${randomUUID()}@example.test`,
    },
  });
  other = (
    await db.user.create({
      data: {
        name: "Desktop sync other",
        email: `desktop-other-${randomUUID()}@example.test`,
      },
    })
  ).id;
  otherCompany = (
    await db.company.create({
      data: { userId: other, name: "Other account private company" },
    })
  ).id;
});
afterAll(async () => {
  const ids = [owner?.id, other].filter(Boolean);
  await admin.securityEvent.deleteMany({ where: { userId: { in: ids } } });
  await admin.taskCompletion.deleteMany({ where: { userId: { in: ids } } });
  await admin.task.deleteMany({ where: { userId: { in: ids } } });
  await admin.networkingEvent.deleteMany({ where: { userId: { in: ids } } });
  await admin.contact.deleteMany({ where: { userId: { in: ids } } });
  await admin.application.deleteMany({ where: { userId: { in: ids } } });
  await admin.jobOffer.deleteMany({ where: { userId: { in: ids } } });
  await admin.company.deleteMany({ where: { userId: { in: ids } } });
  await admin.user.deleteMany({ where: { id: { in: ids } } });
  await admin.$disconnect();
  await db.$disconnect();
  vi.unstubAllEnvs();
});
describe("Windows protocol against encrypted PostgreSQL", () => {
  it("does not relax CSRF for cookie-authorized endpoints or cross-site browser requests", () => {
    const request = (path: string, headers: Record<string, string> = {}) =>
      new NextRequest("http://localhost:3100" + path, {
        method: "POST",
        headers,
      });
    expect(
      proxy(
        request("/api/desktop/sync", { "x-mappleo-client": "windows-v1" }),
      ).headers.get("x-middleware-next"),
    ).toBe("1");
    expect(
      proxy(
        request("/api/desktop/sync", {
          "x-mappleo-client": "windows-v1",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
        }),
      ).status,
    ).toBe(403);
    expect(proxy(request("/api/desktop/sync")).status).toBe(403);
    expect(
      proxy(request("/api/import", { "x-mappleo-client": "windows-v1" }))
        .status,
    ).toBe(403);
    expect(
      proxy(
        request("/api/desktop/authorize", { "x-mappleo-client": "windows-v1" }),
      ).status,
    ).toBe(403);
    expect(
      proxy(
        request("/api/desktop/devices", { "x-mappleo-client": "windows-v1" }),
      ).status,
    ).toBe(403);
  });
  it("accepts only loopback redirects, PKCE, single-use unexpired authorization and scoped tokens", async () => {
    for (const redirectUri of [
      "https://evil.test/callback",
      "http://localhost:43129/callback",
      "http://127.0.0.1:43129/elsewhere",
      "http://127.0.0.1:43129/callback?x=1",
      "http://127.0.0.1:80/callback",
    ])
      expect(
        authorizationSchema.safeParse({
          redirectUri,
          challenge: digest(verifier),
          state,
        }).success,
      ).toBe(false);
    const target = new URL(
      await authorizeDevice(owner, {
        redirectUri,
        challenge: digest(verifier),
        state,
      }),
    );
    expect(target.searchParams.get("state")).toBe(state);
    const code = target.searchParams.get("code")!;
    await expect(
      exchangeCode({
        code,
        verifier: randomBytes(32).toString("base64url"),
        redirectUri,
      }),
    ).rejects.toThrow(/autorización/);
    const issued = await exchangeCode({ code, verifier, redirectUri });
    token = issued.token;
    await expect(exchangeCode({ code, verifier, redirectUri })).rejects.toThrow(
      /autorización/,
    );
    device = await requireDevice(
      new Request("http://localhost/api/desktop/sync", {
        headers: { Authorization: "Bearer " + token },
      }),
    );
    expect(device.userId).toBe(owner.id);
    expect(device.tokenHash).not.toBe(token);
    await expect(
      requireDevice(new Request("http://localhost/api/desktop/sync")),
    ).rejects.toThrow(/conectar/);
    const expired = new URL(
      await authorizeDevice(owner, {
        redirectUri,
        challenge: digest(verifier),
        state,
      }),
    ).searchParams.get("code")!;
    await db.desktopAuthorization.update({
      where: { codeHash: digest(expired) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      exchangeCode({ code: expired, verifier, redirectUri }),
    ).rejects.toThrow(/autorización/);
  });
  it("roundtrips every local entity, nested histories, links, completed tasks, encryption and technologies", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mappleo-sync-postgres-")),
      store = new LocalStore(directory, randomBytes(32));
    try {
      store.command({ action: "profile", name: "John sync" });
      store.command({
        action: "save",
        kind: "companies",
        input: {
          name: "Empresa sincronizada",
          websiteUrl: "https://example.com",
          careersUrl: "",
          linkedinUrl: "",
          location: "Alicante",
          sector: "IT",
          workMode: "REMOTE",
          interestRating: 4,
          notes: "Nota cifrada sincronizada",
          tags: ["Producto"],
        },
      });
      const companyId = store.all("companies")[0].id;
      store.command({
        action: "save",
        kind: "offers",
        input: {
          companyId,
          title: "Frontend",
          url: "",
          source: "LINKEDIN",
          location: "",
          workMode: "REMOTE",
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: "EUR",
          description: "Oferta local",
          notes: "",
          technologies: ["React", "Prueba sync"],
          interestRating: 3,
          publishedAt: null,
          deadlineAt: null,
        },
      });
      store.command({
        action: "save",
        kind: "applications",
        input: {
          jobOfferId: store.all("offers")[0].id,
          status: "INTERVIEW",
          appliedAt: new Date().toISOString(),
          nextAction: "Preparar entrevista",
          nextActionDueAt: new Date().toISOString(),
          cvVersion: "CV",
          coverLetterUsed: false,
          notes: "",
        },
      });
      const applicationId = store.all("applications")[0].id;
      store.command({
        action: "activity",
        applicationId,
        title: "Conversación",
        description: "Detalle",
        happenedAt: new Date().toISOString(),
        type: "NOTE",
      });
      store.command({
        action: "save",
        kind: "contacts",
        input: {
          companyId,
          name: "Contacto sync",
          role: "Recruiter",
          email: "contact@example.test",
          phone: "+34 600000000",
          linkedinUrl: "",
          notes: "",
          lastContactAt: null,
          followUpAt: new Date().toISOString(),
        },
      });
      store.command({
        action: "save",
        kind: "networking",
        input: {
          name: "Encuentro",
          type: "MEETUP",
          startsAt: new Date().toISOString(),
          endsAt: null,
          location: "Alicante",
          url: "",
          notes: "",
          companyIds: [companyId],
          contactIds: [store.all("contacts")[0].id],
        },
      });
      store.command({
        action: "save",
        kind: "tasks",
        input: {
          title: "Preparar entrevista",
          columnId: store.all("boardColumns").find((c) => !c.isDone)!.id,
          links: [
            {
              kind: "applications",
              recordId: applicationId,
              label: "Candidatura",
            },
          ],
        },
      });
      store.command({
        action: "complete",
        kind: "tasks",
        id: store.all("tasks")[0].id,
      });
      const pulled = await pullWorkspace(owner.id, null);
      store.bindAccount(
        {
          userId: owner.id,
          email: "john@example.test",
          origin: "https://mappleo.vercel.app",
          token,
          deviceId: device.id,
          expiresAt: device.expiresAt.toISOString(),
        },
        pulled.workspace!,
        pulled.revision,
      );
      const payload = withOwner(store.exportBackup(), owner.id);
      const committed = await pushWorkspace(device, pulled.revision, payload);
      expect(committed.workspace.companies).toHaveLength(1);
      expect(committed.workspace.offers).toHaveLength(1);
      expect(committed.workspace.applications[0].events.length).toBeGreaterThan(
        1,
      );
      expect(committed.workspace.networking[0].companies[0].id).toBe(companyId);
      expect(committed.workspace.networking[0].contacts).toHaveLength(1);
      expect(committed.workspace.tasks).toHaveLength(1);
      expect(committed.workspace.taskCompletions).toHaveLength(1);
      expect(committed.workspace.contacts[0].email).toBe(
        "contact@example.test",
      );
      expect(committed.workspace.technologyTags).toContain("Prueba sync");
      const raw = await admin.contact.findFirstOrThrow({
        where: { userId: owner.id },
      });
      expect(raw.email).not.toContain("contact@example.test");
      expect(raw.phone).not.toContain("600000000");
      const unchanged = await pullWorkspace(owner.id, committed.revision);
      expect(unchanged).not.toHaveProperty("workspace");
      const again = await pushWorkspace(
        device,
        committed.revision,
        committed.workspace,
      );
      expect(again.revision).toBe(committed.revision);
      expect(canonical(again.workspace)).toBe(canonical(committed.workspace));
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("detects ordinary web changes, nested history edits and stale writes", async () => {
    const before = await pullWorkspace(owner.id, null);
    await db.company.update({
      where: { id: before.workspace!.companies[0].id, userId: owner.id },
      data: { notes: "Modificada desde web" },
    });
    const after = await pullWorkspace(owner.id, before.revision);
    expect(after.workspace?.companies[0].notes).toBe("Modificada desde web");
    await expect(
      pushWorkspace(device, before.revision, before.workspace),
    ).rejects.toThrow(/cambios nuevos/);
    const event = await db.applicationEvent.findFirstOrThrow({
      where: { application: { userId: owner.id } },
    });
    await db.applicationEvent.delete({ where: { id: event.id } });
    const history = await pullWorkspace(owner.id, after.revision);
    expect(history.workspace).toBeDefined();
  });
  it("rejects cross-account IDs and mixed owners atomically", async () => {
    const before = await pullWorkspace(owner.id, null),
      payload = wireWorkspace(before.workspace);
    payload.companies[0].id = otherCompany;
    payload.offers[0].companyId = otherCompany;
    payload.contacts[0].companyId = otherCompany;
    payload.networking[0].companies[0].id = otherCompany;
    await expect(
      pushWorkspace(device, before.revision, payload),
    ).rejects.toThrow();
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: otherCompany } }))
        .name,
    ).toBe("Other account private company");
    expect(canonical((await pullWorkspace(owner.id, null)).workspace)).toBe(
      canonical(before.workspace),
    );
    const mixed = wireWorkspace(before.workspace);
    mixed.companies[0].userId = other;
    await expect(
      pushWorkspace(device, before.revision, mixed),
    ).rejects.toThrow();
  });
  it("propagates consistent deletions without leaving histories or task relations behind", async () => {
    const before = await pullWorkspace(owner.id, null),
      payload = wireWorkspace(before.workspace);
    payload.companies = [];
    payload.offers = [];
    payload.applications = [];
    payload.contacts = [];
    payload.networking = [];
    payload.tasks = [];
    payload.taskCompletions = [];
    const after = await pushWorkspace(device, before.revision, payload);
    expect(after.workspace.companies).toHaveLength(0);
    expect(after.workspace.boardColumns).toHaveLength(3);
    expect(
      await db.applicationEvent.count({
        where: { application: { userId: owner.id } },
      }),
    ).toBe(0);
  });
  it("password changes, expiry and device revocation invalidate the connection", async () => {
    await db.user.update({
      where: { id: owner.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await expect(
      requireDevice(
        new Request("http://localhost/api/desktop/sync", {
          headers: { Authorization: "Bearer " + token },
        }),
      ),
    ).rejects.toThrow(/revocado/);
    await expect(pushWorkspace(device, "0", {})).rejects.toThrow();
    await db.desktopDevice.deleteMany({
      where: { id: device.id, userId: owner.id },
    });
    await expect(
      requireDevice(
        new Request("http://localhost/api/desktop/sync", {
          headers: { Authorization: "Bearer " + token },
        }),
      ),
    ).rejects.toThrow(/revocado/);
  });
});
