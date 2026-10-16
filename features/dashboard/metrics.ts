import { closedStatuses } from "@/features/tracker/config";
export const interviewStatuses = ["INTERVIEW", "FINAL_INTERVIEW"];
export function applicationInScope(status: string, scope: string) {
  return scope === "active"
    ? !closedStatuses.includes(status)
    : scope === "interviews"
      ? interviewStatuses.includes(status)
      : true;
}
export function dashboardMetrics(
  companies: { archivedAt: unknown }[],
  offers: { archivedAt: unknown }[],
  applications: { status: string }[],
) {
  return {
    companies: companies.filter((c) => !c.archivedAt).length,
    offers: offers.filter((o) => !o.archivedAt).length,
    active: applications.filter((a) => applicationInScope(a.status, "active"))
      .length,
    interviews: applications.filter((a) =>
      applicationInScope(a.status, "interviews"),
    ).length,
  };
}
