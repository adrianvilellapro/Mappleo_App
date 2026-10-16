import { requireApiUser, requireRecentIdentity } from "@/lib/auth";
import {
  securityResponse,
  withExpensiveOperation,
  recordSecurityEvent,
} from "@/lib/security/controls";
import {
  parseStatsFilters,
  StatsInputError,
} from "@/features/statistics/model";
import { statisticsData } from "@/features/statistics/data";
import { ReportLimitError } from "@/features/reports/pdf-runtime";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    requireRecentIdentity(user);
    return await withExpensiveOperation(user.id, () =>
      makeReport(request, user.id),
    );
  } catch (cause) {
    if(cause instanceof ReportLimitError) return Response.json({error:cause.message},{status:413,headers:{"Cache-Control":"private, no-store"}});
    return securityResponse(cause);
  }
}
async function makeReport(request: Request, userId: string) {
  let filters;
  try {
    filters = parseStatsFilters(
      Object.fromEntries(new URL(request.url).searchParams),
    );
  } catch (e) {
    if (!(e instanceof StatsInputError)) throw e;
    return Response.json({ error: e.message }, { status: 400 });
  }
  if (new URL(request.url).searchParams.get("render") === "client") {
    // Recheck revocation/recent identity and the export budget before allowing
    // the browser to render the exact report already displayed. No second scan.
    await recordSecurityEvent("statistics_exported", userId);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const { report, companies } = await statisticsData(userId, filters);
  await recordSecurityEvent("statistics_exported", userId);
  const {statisticsPdf}=await import("@/features/statistics/pdf");
  const bytes = await statisticsPdf(
    report,
    filters.company === "all"
      ? "Todas"
      : (companies.find((c) => c.id === filters.company)?.name ??
          "Sin coincidencias"),
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mappleo-estadisticas-${filters.from}-${filters.to}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
