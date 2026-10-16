import { requireApiUser } from "@/lib/auth";
import { desktopEnabled } from "@/features/desktop/auth";
import { db } from "@/lib/db";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
export const runtime = "nodejs";
export async function GET() {
  try {
    desktopEnabled();
    const user = await requireApiUser();
    const cursor = await db.syncVersion.findUnique({
      where: { userId: user.id },
      select: { revision: true },
    });
    return Response.json(
      { revision: cursor?.revision.toString() ?? "0" },
      { headers: privateHeaders },
    );
  } catch (error) {
    return securityResponse(error);
  }
}
