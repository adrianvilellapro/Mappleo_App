import { describe, expect, it } from "vitest";
import {
  buildStatistics,
  median,
  parseStatsFilters,
  type StatsApplication,
} from "../../features/statistics/model";
import { dashboardMetrics } from "../../features/dashboard/metrics";
import { calendarRange, day } from "../../lib/dates";
import { statisticsPdf } from "../../features/statistics/pdf";
const now = new Date("2026-10-01T12:00:00Z");
const app = (
  id: string,
  appliedAt: string,
  extra: Partial<StatsApplication> = {},
): StatsApplication => ({
  id,
  status: "APPLIED",
  appliedAt: new Date(appliedAt),
  firstResponseAt: null,
  nextAction: "",
  nextActionDueAt: null,
  jobOffer: {
    title: "Developer",
    source: "LINKEDIN",
    companyId: "co",
    company: { name: "Acme" },
  },
  events: [],
  ...extra,
});
describe("Estadísticas y agenda", () => {
  it("mide red y tareas sin inventar interacciones ni duplicar tareas/tecnologías", () => {
    const a = app("a", "2026-10-01T09:00:00Z");
    a.jobOffer.technologies = ["TypeScript", "typescript", "HTML"];
    const b = app("b", "2026-10-01T09:30:00Z");
    b.jobOffer.technologies = ["TypeScript"];
    const report = buildStatistics([a, b], parseStatsFilters({}, now), now, {
      networking: [
        {
          id: "n",
          name: "Encuentro",
          startsAt: new Date("2026-10-01T08:00:00Z"),
        },
        {
          id: "future",
          name: "Futuro",
          startsAt: new Date("2026-10-02T08:00:00Z"),
        },
      ],
      contacts: [
        {
          id: "c",
          name: "Persona",
          createdAt: new Date("2026-09-29T08:00:00Z"),
          lastContactAt: new Date("2026-10-01T08:00:00Z"),
        },
      ],
      completions: [
        {
          id: "1",
          taskIdentity: "same",
          title: "Tarea",
          completedAt: new Date("2026-10-01T08:00:00Z"),
        },
        {
          id: "2",
          taskIdentity: "same",
          title: "Tarea reabierta",
          completedAt: new Date("2026-10-01T10:00:00Z"),
        },
      ],
    });
    expect(report.extended.events).toBe(1);
    expect(report.extended.newContacts).toBe(0);
    expect(report.extended.contacted).toBe(1);
    expect(report.extended.completed).toBe(1);
    expect(report.extended.completionRows[0].title).toBe("Tarea reabierta");
    expect(
      report.extended.technologies.find(
        (t) => t.label.toLowerCase() === "typescript",
      )?.sent,
    ).toBe(2);
    expect(
      report.extended.series.reduce((sum, b) => sum + b.interviews, 0),
    ).toBe(1);
  });
  it("separa la cohorte del periodo de los eventos del periodo y no duplica hitos", () => {
    const filters = parseStatsFilters(
      { period: "custom", from: "2026-09-01", to: "2026-09-30" },
      now,
    );
    const data = [
      app("a", "2026-09-04T10:00:00Z", {
        status: "INTERVIEW",
        firstResponseAt: new Date("2026-09-06T10:00:00Z"),
        events: [
          {
            type: "INTERVIEW",
            toStatus: null,
            happenedAt: new Date("2026-09-07T10:00:00Z"),
          },
          {
            type: "STATUS_CHANGED",
            toStatus: "INTERVIEW",
            happenedAt: new Date("2026-09-09T10:00:00Z"),
          },
        ],
      }),
      app("b", "2026-09-10T10:00:00Z"),
      app("old", "2026-08-10T10:00:00Z", {
        firstResponseAt: new Date("2026-09-03T10:00:00Z"),
      }),
      app("future", "2026-11-01T10:00:00Z"),
    ];
    const report = buildStatistics(data, filters, now);
    expect(report.sent).toBe(2);
    expect(report.responses).toBe(1);
    expect(report.interviews).toBe(1);
    expect(report.medianDays).toBe(2);
    expect(report.responseRate).toBe(50);
    expect(report.series.reduce((n, s) => n + s.responses, 0)).toBe(2);
    expect(report.series.reduce((n, s) => n + s.interviews, 0)).toBe(1);
    expect(report.current.active).toBe(3);
    expect(report.withoutResponseDate).toBe(1);
  });
  it("no infiere entrevistas, respuestas ni etapas omitidas", () => {
    const filters = parseStatsFilters({}, now),
      report = buildStatistics(
        [app("offer", "2026-10-01T09:00:00Z", { status: "OFFER_RECEIVED" })],
        filters,
        now,
      );
    expect(report.responses).toBe(0);
    expect(report.interviews).toBe(0);
    expect(report.offers).toBe(1);
    expect(report.medianDays).toBeNull();
  });
  it("normaliza Madrid y compara los días transcurridos del mes", () => {
    const report = buildStatistics(
      [
        app("midnight", "2026-09-30T22:30:00Z"),
        app("previous", "2026-09-01T08:00:00Z"),
      ],
      parseStatsFilters({}, now),
      now,
    );
    expect(report.sent).toBe(1);
    expect(report.previous).toBe(1);
    expect(report.previousFrom).toBe("2026-09-01");
    expect(report.previousTo).toBe("2026-09-01");
    expect(
      day("2026-03-29").plus({ days: 1 }).diff(day("2026-03-29"), "hours")
        .hours,
    ).toBe(23);
  });
  it("aplica filtros de fuente y empresa y valida los límites", () => {
    expect(
      buildStatistics(
        [app("a", "2026-10-01T09:00:00Z")],
        parseStatsFilters({ source: "INFOJOBS" }, now),
        now,
      ).sent,
    ).toBe(0);
    expect(
      buildStatistics(
        [app("a", "2026-10-01T09:00:00Z")],
        parseStatsFilters({ company: "other" }, now),
        now,
      ).sent,
    ).toBe(0);
    expect(() =>
      parseStatsFilters(
        { period: "custom", from: "2026-02-30", to: "2026-09-01" },
        now,
      ),
    ).toThrow();
    expect(() =>
      parseStatsFilters(
        { period: "custom", from: "2026-09-01", to: "2026-11-01" },
        now,
      ),
    ).toThrow();
    expect(() => parseStatsFilters({ group: "day" }, now)).toThrow();
    expect(() => parseStatsFilters({ source: "INVALID" }, now)).toThrow();
  });
  it("presenta ausencia de datos y medianas correctamente", () => {
    expect(median([])).toBeNull();
    expect(median([4, 1, 3, 2])).toBe(2.5);
    const report = buildStatistics([], parseStatsFilters({}, now), now);
    expect(report.responseRate).toBeNull();
    expect(report.interviewRate).toBeNull();
  });
  it("los recuentos del dashboard coinciden con los filtros, sin incluir prueba técnica como entrevista", () => {
    const metrics = dashboardMetrics(
      [{ archivedAt: null }, { archivedAt: new Date() }],
      [{ archivedAt: null }, { archivedAt: null }],
      [
        { status: "APPLIED" },
        { status: "TECHNICAL_TEST" },
        { status: "INTERVIEW" },
        { status: "FINAL_INTERVIEW" },
        { status: "REJECTED" },
        { status: "ACCEPTED" },
      ],
    );
    expect(metrics).toEqual({
      companies: 1,
      offers: 2,
      active: 4,
      interviews: 2,
    });
  });
  it("el calendario tiene 42 días y empieza en lunes incluso con cambio de horario", () => {
    const range = calendarRange("2026-03");
    expect(range.start.weekday).toBe(1);
    expect(range.end.diff(range.start, "days").days).toBe(42);
    expect(() => calendarRange("2026-13")).toThrow();
    expect(() => calendarRange("bad")).toThrow();
  });
  it("genera un informe PDF con los mismos datos filtrados", async () => {
    const report = buildStatistics(
      [app("a", "2026-10-01T09:00:00Z")],
      parseStatsFilters({}, now),
      now,
    );
    const bytes = await statisticsPdf(report, "Todas");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(3000);
  });
});
