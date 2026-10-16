import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
import { isEntityKind } from "@/features/tracker/config";
import { collectionPage } from "@/features/tracker/collection-data";
import { getOptions } from "@/features/tracker/queries";
import { taskOptions } from "@/features/tasks/data";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const user = await requireApiUser();
    const { kind } = await params;
    const search = new URL(request.url).searchParams;
    if (kind === "tasks" && search.get("options") === "1")
      return Response.json(await taskOptions(user.id), {
        headers: privateHeaders,
      });
    if (!isEntityKind(kind))
      return Response.json(
        { error: "Apartado no válido." },
        { status: 404, headers: privateHeaders },
      );
    const result =
      search.get("options") === "1"
        ? await getOptions(user.id, kind)
        : await collectionPage(user.id, kind, Object.fromEntries(search));
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Filtros no válidos." },
        { status: 400, headers: privateHeaders },
      );
    return securityResponse(error);
  }
}
