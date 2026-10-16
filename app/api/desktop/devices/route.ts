import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
import { desktopEnabled, readDesktopJson } from "@/features/desktop/auth";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET() {
  try {
    desktopEnabled();
    const user = await requireApiUser();
    const devices = await db.desktopDevice.findMany({
      where: {
        userId: user.id,
        sessionVersion: user.sessionVersion,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ devices }, { headers: privateHeaders });
  } catch (error) {
    return securityResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    desktopEnabled();
    const user = await requireApiUser();
    const { id } = z
      .object({ id: z.string().min(1).max(100) })
      .parse(await readDesktopJson(request, 1024));
    await db.desktopDevice.deleteMany({ where: { id, userId: user.id } });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return securityResponse(error);
  }
}
