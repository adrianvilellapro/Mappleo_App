import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminRequestSource, smallAdminJson } from "@/features/admin/request";
import { adminCookie } from "@/features/admin/config";
import {
  loginAdmin,
  authenticateAdmin,
  adminOverview,
  adminMutation,
  logoutAdmin,
} from "@/features/admin/service";
import {
  privateHeaders,
  SecurityError,
  securityResponse,
} from "@/lib/security/controls";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failed(error: unknown) {
  return securityResponse(
    error instanceof z.ZodError
      ? new SecurityError(
          "Revisa los campos y la confirmación de la operación.",
          400,
        )
      : error,
  );
}
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  try {
    const source = adminRequestSource(request);
    const identity = await authenticateAdmin(
      request.cookies.get(adminCookie)?.value,
      source,
    );
    if ((await context.params).operation !== "accounts")
      throw new SecurityError("Ruta no disponible.", 404);
    if ([...request.nextUrl.searchParams.keys()].some((key) => key !== "page"))
      throw new SecurityError("Utiliza la búsqueda protegida del panel.", 400);
    const result = await adminOverview(identity, {
      page: request.nextUrl.searchParams.get("page") ?? "1",
      search: "",
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    return failed(error);
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  try {
    const source = adminRequestSource(request);
    const { operation } = await context.params;
    if (operation === "login") {
      const result = await loginAdmin(await smallAdminJson(request), source);
      const response = NextResponse.json(
        { ok: true },
        { headers: privateHeaders },
      );
      response.cookies.set(adminCookie, result.token, {
        secure: true,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        expires: result.expiresAt,
        priority: "high",
      });
      return response;
    }
    const identity = await authenticateAdmin(
      request.cookies.get(adminCookie)?.value,
      source,
    );
    if (operation === "accounts") {
      const result = await adminOverview(
        identity,
        await smallAdminJson(request),
      );
      return NextResponse.json(result, { headers: privateHeaders });
    }
    if (operation === "logout") {
      await logoutAdmin(identity);
      const response = NextResponse.json(
        { ok: true },
        { headers: privateHeaders },
      );
      response.cookies.set(adminCookie, "", {
        secure: true,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    if (!["limit", "reset-password", "delete-account"].includes(operation))
      throw new SecurityError("Ruta no disponible.", 404);
    const result = await adminMutation(
      identity,
      operation as "limit" | "reset-password" | "delete-account",
      await smallAdminJson(request),
    );
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    return failed(error);
  }
}
