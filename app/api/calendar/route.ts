import { requireApiUser } from "@/lib/auth";
import { securityResponse } from "@/lib/security/controls";
import { calendarItems } from "@/features/calendar/data";
import { calendarRange } from "@/lib/dates";
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const month = new URL(request.url).searchParams.get("month") ?? "";
    try {
      calendarRange(month);
    } catch {
      return Response.json({ error: "Elige un mes válido." }, { status: 400 });
    }
    const items = await calendarItems(user.id, month);
    return Response.json(
      { month, items },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return securityResponse(error);
  }
}
