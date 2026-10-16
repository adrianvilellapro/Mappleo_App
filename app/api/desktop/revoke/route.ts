import { requireDevice } from "@/features/desktop/auth";
import { db } from "@/lib/db";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const device = await requireDevice(request);
    await db.desktopDevice.deleteMany({
      where: { id: device.id, userId: device.userId },
    });
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return securityResponse(error);
  }
}
