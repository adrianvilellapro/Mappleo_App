import { registerAccount } from "@/lib/auth/register";
import { trustedRequestSource } from "@/lib/security/request";
import {
  privateHeaders,
  SecurityError,
  securityResponse,
} from "@/lib/security/controls";
import { smallJson } from "@/lib/security/json";
import {
  recordRegistrationFailure,
  registrationBlocked,
  registrationBlockedMessage,
} from "@/lib/auth/registration-throttle";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let source: string | undefined;
  try {
    source = trustedRequestSource(Object.fromEntries(request.headers));
    if (await registrationBlocked(source))
      throw new SecurityError(registrationBlockedMessage, 429);
    const result = await registerAccount(await smallJson(request), source);
    const status = result.ok ? 201 : (result.status ?? 400);
    return Response.json(result, {
      status,
      headers: {
        ...privateHeaders,
        ...(status === 429 ? { "Retry-After": "900" } : {}),
      },
    });
  } catch (error) {
    if (
      source &&
      error instanceof SecurityError &&
      [400, 408, 413, 415].includes(error.status)
    ) {
      let blocked: boolean;
      try {
        blocked = await recordRegistrationFailure(source);
      } catch (failure) {
        return securityResponse(failure);
      }
      if (blocked)
        return Response.json(
          { ok: false, error: registrationBlockedMessage },
          {
            status: 429,
            headers: { ...privateHeaders, "Retry-After": "900" },
          },
        );
    }
    const response = securityResponse(error);
    if (response.status === 429) response.headers.set("Retry-After", "900");
    return response;
  }
}
