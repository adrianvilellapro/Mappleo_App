import {
  exchangeCode,
  nativeBudget,
  readDesktopJson,
} from "@/features/desktop/auth";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await nativeBudget(request, "exchange", 8);
    return Response.json(
      await exchangeCode(await readDesktopJson(request, 4096)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return securityResponse(error);
  }
}
