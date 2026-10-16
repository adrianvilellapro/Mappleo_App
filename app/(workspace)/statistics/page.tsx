import { requireUser } from "@/lib/auth";
import {
  parseStatsFilters,
  StatsInputError,
} from "@/features/statistics/model";
import { statisticsData } from "@/features/statistics/data";
import { StatisticsView } from "@/features/statistics/view";
import Link from "@/components/ui/app-link";
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  let filters;
  try {
    filters = parseStatsFilters(await searchParams);
  } catch (e) {
    if (!(e instanceof StatsInputError)) throw e;
    return (
      <div className="page">
        <h1>Estadísticas</h1>
        <p className="form-error" role="alert">
          {e.message}
        </p>
        <Link className="button button-outline" href="/statistics">
          Restablecer filtros
        </Link>
      </div>
    );
  }
  const { report, companies } = await statisticsData(user.id, filters);
  return (
    <StatisticsView
      key={JSON.stringify(filters)}
      report={report}
      companies={companies}
    />
  );
}
