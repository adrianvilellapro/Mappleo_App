import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./options";
import { SecurityError } from "@/lib/security/controls";
import { consumeAttempt } from "./throttle";
import { cache } from "react";
// Memoized only for this server render, never across requests/accounts.
export const authenticatedUser = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  // The JWT callback already verified the stored session and user version.
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    sessionVersion: session.user.sessionVersion,
    sessionId: session.user.sessionId,
    verifiedAt: session.user.verifiedAt,
  };
});
export async function requireApiUser() {
  const user = await authenticatedUser();
  if (!user) throw new SecurityError("Inicia sesión para continuar.", 401);
  if (!(await consumeAttempt("api-read", user.id, 300, 60000)))
    throw new SecurityError("Demasiadas peticiones. Espera un minuto.");
  return user;
}
export function requireRecentIdentity(user: { verifiedAt: number }) {
  if (Date.now() - user.verifiedAt > 30 * 60000)
    throw new SecurityError(
      "Confirma tu contraseña para importar o descargar tus datos.",
      428,
    );
}
export const requireUser = cache(async () => {
  const user = await authenticatedUser();
  if (!user) redirect("/login");
  if (!(await consumeAttempt("page-access", user.id, 600, 60000)))
    throw new SecurityError("Demasiadas peticiones. Espera un minuto.");
  return user;
});
