import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { closedStatuses } from "@/features/tracker/config";
import { calendarItems } from "@/features/calendar/data";
import { madrid } from "@/lib/dates";
import { DashboardView } from "@/features/dashboard/view";
export const dynamic = "force-dynamic";
export default async function Dashboard() {
  const user = await requireUser(),
    now = new Date();
  const [
    companyCount,
    offerCount,
    activeCount,
    interviewCount,
    applications,
    events,
    tasks,
    activity,
  ] = await db.$transaction(
    [
      db.company.count({
        where: { userId: user.id, archivedAt: null },
      }),
      db.jobOffer.count({
        where: { userId: user.id, archivedAt: null },
      }),
      db.application.count({
        where: { userId: user.id, status: { notIn: closedStatuses } },
      }),
      db.application.count({
        where: {
          userId: user.id,
          status: { in: ["INTERVIEW", "FINAL_INTERVIEW"] },
        },
      }),
      db.application.findMany({
        where: { userId: user.id, status: { notIn: closedStatuses } },
        select: {
          id: true,
          status: true,
          jobOffer: {
            select: {
              title: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  websiteUrl: true,
                  faviconUrl: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.networkingEvent.findMany({
        where: { userId: user.id, startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 4,
        select: { id: true, name: true, startsAt: true, location: true },
      }),
      db.task.findMany({
        where: { userId: user.id, completedAt: null },
        select: {
          id: true,
          title: true,
          dueAt: true,
          links: { select: { label: true } },
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      }),
      db.applicationEvent.findMany({
        where: { application: { userId: user.id } },
        select: {
          id: true,
          applicationId: true,
          title: true,
          happenedAt: true,
          application: {
            select: {
              jobOffer: { select: { company: { select: { name: true } } } },
            },
          },
        },
        orderBy: { happenedAt: "desc" },
        take: 6,
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );

  const calendar = await calendarItems(
    user.id,
    madrid(now).toFormat("yyyy-MM"),
  );
  return (
    <DashboardView
      now={now}
      metrics={{
        companies: companyCount,
        offers: offerCount,
        active: activeCount,
        interviews: interviewCount,
      }}
      applications={applications}
      events={events}
      tasks={tasks}
      activity={activity}
      calendar={calendar}
    />
  );
}
