import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "../../lib/db";
import { ensureColumns, saveTask } from "../../features/tasks/service";
import { calendarItems } from "../../features/calendar/data";
import { statisticsData } from "../../features/statistics/data";
import { parseStatsFilters } from "../../features/statistics/model";
import { madrid } from "../../lib/dates";
let owner = "",
  other = "";
afterAll(async () => {
  if (!owner || !other) return;
  const where = { userId: { in: [owner, other] } };
  await db.networkingEvent.deleteMany({ where });
  await db.contact.deleteMany({ where });
  await db.application.deleteMany({ where });
  await db.jobOffer.deleteMany({ where });
  await db.company.deleteMany({ where });
  await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
  await db.$disconnect();
});
describe("Calendario y estadísticas privados", () => {
  it("solo devuelve datos de la cuenta y conserva la primera respuesta", async () => {
    const suffix = Date.now(),
      now = new Date(),
      applied = madrid(now).startOf("day").toJSDate();
    owner = (
      await db.user.create({
        data: { name: "Owner", email: `calendar-owner-${suffix}@example.test` },
      })
    ).id;
    other = (
      await db.user.create({
        data: { name: "Other", email: `calendar-other-${suffix}@example.test` },
      })
    ).id;
    const ownCompany = await db.company.create({
        data: { userId: owner, name: "Empresa propia" },
      }),
      foreignCompany = await db.company.create({
        data: { userId: other, name: "Empresa ajena" },
      });
    const offer = await db.jobOffer.create({
      data: {
        userId: owner,
        companyId: ownCompany.id,
        title: "Oferta propia",
        deadlineAt: now,
        source: "LINKEDIN",
      },
    });
    await db.jobOffer.create({
      data: {
        userId: other,
        companyId: foreignCompany.id,
        title: "Oferta ajena",
        deadlineAt: now,
      },
    });
    const application = await db.application.create({
      data: {
        userId: owner,
        jobOfferId: offer.id,
        appliedAt: applied,
        firstResponseAt: now,
        nextAction: "Preparar conversación",
        nextActionDueAt: now,
      },
    });
    const contact = await db.contact.create({
      data: {
        userId: owner,
        name: "Contacto propio",
        lastContactAt: now,
      },
    });
    const encounter = await db.networkingEvent.create({
      data: {
        userId: owner,
        name: "Networking de varios días",
        startsAt: madrid(now).startOf("day").minus({ days: 2 }).toJSDate(),
        endsAt: madrid(now).startOf("day").plus({ days: 2 }).toJSDate(),
      },
    });
    await saveTask(owner, undefined, {
      title: "Preparar conversación",
      columnId: (await ensureColumns(db, owner)).todo.id,
      dueAt: now.toISOString(),
      links: [{ kind: "applications", recordId: application.id }],
    });
    const items = await calendarItems(owner, madrid(now).toFormat("yyyy-MM"));
    expect(items.some((i) => i.href === "/contacts/" + contact.id)).toBe(true);
    expect(
      items.filter((i) => i.href === "/networking/" + encounter.id),
    ).toHaveLength(5);
    expect(new Set(items.map((i) => i.category)).size).toBe(6);
    expect(items.some((i) => i.title.includes("ajena"))).toBe(false);
    expect(items.some((i) => i.title === "Preparar conversación")).toBe(true);
    expect(
      items.some(
        (i) =>
          i.id.includes(application.id) &&
          i.title.startsWith("Primera respuesta"),
      ),
    ).toBe(true);
    const { report } = await statisticsData(
      owner,
      parseStatsFilters({ source: "LINKEDIN" }),
    );
    expect(report.sent).toBe(1);
    expect(report.responses).toBe(1);
    const foreign = await statisticsData(
      owner,
      parseStatsFilters({ company: foreignCompany.id }),
    );
    expect(foreign.report.sent).toBe(0);
    expect(foreign.companies.some((c) => c.id === foreignCompany.id)).toBe(
      false,
    );
  });
});
