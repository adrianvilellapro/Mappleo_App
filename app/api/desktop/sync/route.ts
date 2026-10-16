import { requireDevice, readDesktopJson } from "@/features/desktop/auth";
import { pullWorkspace, pushWorkspace } from "@/features/desktop/workspace";
import {
  privateHeaders,
  securityResponse,
  SecurityError,
} from "@/lib/security/controls";
import { z } from "zod";
import { revalidateWorkspace } from "@/lib/workspace-revalidation";
import { isEntityKind } from "@/features/tracker/config";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const device = await requireDevice(request),
      known = new URL(request.url).searchParams.get("revision");
    if (known && !/^\d{1,30}$/.test(known))
      throw new SecurityError("Versión no válida.", 400);
    return Response.json(await pullWorkspace(device.userId, known), {
      headers: privateHeaders,
    });
  } catch (error) {
    return securityResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const device = await requireDevice(request);
    const input = z
      .object({
        revision: z.string().regex(/^\d{1,30}$/),
        changes: z.unknown(),
      })
      .parse(await readDesktopJson(request));
    const committed = await pushWorkspace(
      device,
      input.revision,
      input.changes,
      true,
    );
    for (const [section, rows] of Object.entries(committed.changes.upserts)) {
      if (
        rows.length ||
        committed.changes.deletes[
          section as keyof typeof committed.changes.deletes
        ]?.length
      ) {
        revalidateWorkspace(isEntityKind(section) ? section : "tasks");
      }
    }
    return Response.json(
      { revision: committed.revision, changes: committed.changes },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2034"
    )
      return securityResponse(
        new SecurityError("Hay cambios nuevos. Se volverán a comprobar.", 409),
      );
    if (error instanceof z.ZodError)
      return securityResponse(
        new SecurityError(
          "Los datos contienen relaciones o valores incompatibles.",
          422,
        ),
      );
    return securityResponse(error);
  }
}
