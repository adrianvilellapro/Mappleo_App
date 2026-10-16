import { requireApiUser } from "@/lib/auth";
import { confirmIdentity } from "@/features/account/identity";
import { authorizeDevice, readDesktopJson } from "@/features/desktop/auth";
import { privateHeaders, securityResponse } from "@/lib/security/controls";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = z
      .object({
        password: z.string().min(1).max(128),
        authorization: z.unknown(),
      })
      .parse(await readDesktopJson(request, 4096));
    await confirmIdentity(user, input.password);
    return Response.json(
      { redirect: await authorizeDevice(user, input.authorization) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return securityResponse(error);
  }
}
