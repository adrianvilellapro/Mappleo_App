import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DemoStore } from "../../apps/demo/src/store";
import { DemoRuntime } from "../../apps/demo/src/runtime";
import { webActions } from "../../apps/demo/src/web-actions";
import {
  demoCalendar,
  demoDashboard,
  demoStatistics,
  recordOptions,
  recordRows,
} from "../../apps/demo/src/web-data";
const now = new Date("2026-10-16T16:00:00Z");
const runtime = () =>
  new DemoRuntime(new DemoStore("es", undefined, () => now.getTime()));
const source = (path: string) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("web-identical static demo adapters", () => {
  it("uses the actual web components and CSS, never the desktop renderer", () => {
    const app = source("apps/demo/src/App.tsx");
    expect(app).toContain("features/tracker/components/records-view");
    expect(app).toContain("features/tasks/board");
    expect(app).toContain("features/statistics/view");
    expect(app).toContain("features/dashboard/view");
    expect(app).toContain("features/account/settings-view");
    expect(app).not.toContain("windows/src/renderer");
    expect(source("apps/demo/src/main.tsx")).toContain("app/globals.css");
    expect(source("apps/demo/src/main.tsx")).not.toContain("windows");
    for (const path of ["dashboard", "search", "settings"]) {
      expect(source(`app/(workspace)/${path}/page.tsx`)).toContain("View");
    }
    expect(source("apps/demo/vite.config.ts")).toContain(
      "Server code is forbidden",
    );
  });
  it("enriches web rows and option lists with the same relationships", () => {
    const data = runtime().snapshot().data;
    const company = recordRows(data, "companies")[0];
    expect(company.offers?.length).toBeGreaterThan(0);
    const app = recordRows(data, "applications")[0];
    expect(app.jobOffer?.company.name).toBeTruthy();
    expect(recordRows(data, "networking")[0].companies?.[0].name).toBeTruthy();
    const options = recordOptions(data);
    expect(options.companies).toHaveLength(24);
    expect(options.offers).toHaveLength(64);
    expect(options.offers[0].id).toBe(
      [...data.offers].sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0].id,
    );
    expect(recordRows(data, "invalid")).toEqual([]);
  });
  it("supports web CRUD and archive actions entirely in memory", async () => {
    const r = runtime(),
      api = webActions(r);
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No network allowed"));
    try {
      expect(
        (
          await api.saveAction("companies", undefined, {
            name: "Demo creation",
            interestRating: 4,
            workMode: "UNKNOWN",
          })
        ).ok,
      ).toBe(true);
      const id = r.snapshot().data.companies.at(-1)!.id;
      expect((await api.archiveAction("companies", id, true)).ok).toBe(true);
      expect(r.snapshot().data.companies.at(-1)!.archivedAt).toBeTruthy();
      await api.archiveAction("companies", id, false);
      expect(r.snapshot().data.companies.at(-1)!.archivedAt).toBeNull();
      await api.deleteAction("companies", id);
      expect(r.snapshot().data.companies).toHaveLength(24);
      expect(
        (await api.saveAction("companies", undefined, { name: "" })).ok,
      ).toBe(false);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("adds and removes real web history entries without removing an application", async () => {
    const r = runtime(),
      api = webActions(r);
    const application = r.snapshot().data.applications[0],
      original = application.events.length;
    expect(
      (
        await api.activityAction({
          applicationId: application.id,
          title: "Demo activity",
          description: "Details",
          type: "NOTE",
          happenedAt: now.toISOString(),
        })
      ).ok,
    ).toBe(true);
    const event = r.snapshot().data.applications[0].events.at(-1)!;
    expect(event.title).toBe("Demo activity");
    expect((await api.deleteActivityAction(event.id)).ok).toBe(true);
    expect(r.snapshot().data.applications[0].events).toHaveLength(original);
  });
  it("maps task forms, ordering, completion and column deletion to portable mutations", async () => {
    const r = runtime(),
      api = webActions(r);
    await api.taskAction("column", undefined, {
      name: "Demo column",
      position: 1,
      isDone: false,
    });
    const column = r
      .snapshot()
      .data.boardColumns!.find((c) => c.name === "Demo column")!;
    const company = r.snapshot().data.companies[0];
    expect(
      (
        await api.taskAction("save", undefined, {
          title: "Demo task",
          description: "Full description",
          columnId: column.id,
          dueAt: null,
          links: [{ kind: "companies", recordId: company.id }],
        })
      ).ok,
    ).toBe(true);
    const task = r.snapshot().data.tasks!.at(-1)!;
    expect(task.links[0].label).toContain(company.name);
    const destination = r
      .snapshot()
      .data.boardColumns!.find((c) => !c.isDone && c.id !== column.id)!;
    expect(
      (
        await api.taskAction("move", undefined, {
          taskId: task.id,
          columnId: destination.id,
          beforeId: null,
        })
      ).ok,
    ).toBe(true);
    expect(
      r.snapshot().data.tasks!.find((t) => t.id === task.id)!.columnId,
    ).toBe(destination.id);
    expect(
      (await api.completeNextStepAction({ kind: "tasks", id: task.id })).ok,
    ).toBe(true);
    expect(
      r.snapshot().data.tasks!.find((t) => t.id === task.id)!.completedAt,
    ).toBeTruthy();
    expect(r.snapshot().data.taskCompletions!.at(-1)!.companyIds).toContain(
      company.id,
    );
    expect(
      (
        await api.taskAction("delete-column", column.id, {
          mode: "delete",
          confirmed: false,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await api.taskAction("delete-column", column.id, {
          mode: "delete",
          confirmed: true,
        })
      ).ok,
    ).toBe(true);
    expect(
      r.snapshot().data.boardColumns!.some((c) => c.id === column.id),
    ).toBe(false);
  });
  it("builds real web dashboard, calendar and analytics data with no external service", () => {
    const data = runtime().snapshot().data;
    const dashboard = demoDashboard(data, now);
    expect(dashboard.metrics.companies).toBe(22);
    expect(dashboard.metrics.offers).toBe(56);
    expect(dashboard.activity.length).toBe(6);
    expect(
      dashboard.tasks.every((t) => t.dueAt === null || t.dueAt instanceof Date),
    ).toBe(true);
    const calendar = demoCalendar(data, "2026-10");
    expect(
      new Set(calendar.map((c) => c.category)).size,
    ).toBeGreaterThanOrEqual(5);
    expect(
      calendar.every((c) => c.href.startsWith("/") && c.date.length === 10),
    ).toBe(true);
    expect(demoCalendar(data, "2020-01")).toEqual([]);
    const statistics = demoStatistics(data, { period: "months" }, now);
    expect(statistics.sent).toBeGreaterThan(40);
    expect(statistics.extended).toBeTruthy();
  });
  it("never routes to a real account, server endpoint or external URL", () => {
    const r = runtime();
    for (const href of [
      "/api/export",
      "https://example.com",
      "/admin",
      "/login",
      "/contacts/../../admin",
    ]) {
      r.navigate(href);
      expect(r.snapshot().href).toBe("/dashboard");
      expect(r.snapshot().notice).toContain("demo");
    }
    r.navigate("/contacts/demo_contact_1");
    expect(r.snapshot().href).toBe("/contacts/demo_contact_1");
  });
});
