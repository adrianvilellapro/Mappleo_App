import { authenticatedUser } from "@/lib/auth";
import { authorizationSchema } from "@/features/desktop/auth";
import { DesktopConsent } from "@/features/desktop/consent";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
export const dynamic = "force-dynamic";
export default async function DesktopConnect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const input = authorizationSchema.safeParse({
    challenge: params.challenge,
    state: params.state,
    redirectUri: params.redirectUri,
  });
  if (!input.success || process.env.DESKTOP_SYNC_ENABLED !== "true")
    return (
      <AuthShell
        title="Conexión no disponible"
        description="Inicia la vinculación desde la configuración de Mappleo para Windows."
      >
        <p>Puedes seguir utilizando tu espacio local sin conexión.</p>
      </AuthShell>
    );
  const user = await authenticatedUser();
  const callbackUrl =
    "/desktop/connect?" + new URLSearchParams(input.data).toString();
  return (
    <AuthShell
      title="Conectar Mappleo para Windows"
      description="Tu espacio local y tu cuenta web, sincronizados."
    >
      {user ? (
        <DesktopConsent email={user.email} authorization={input.data} />
      ) : (
        <>
          <p>
            Inicia sesión con la cuenta que quieres vincular. Después podrás
            autorizar tu equipo.
          </p>
          <LoginForm callbackUrl={callbackUrl} />
        </>
      )}
    </AuthShell>
  );
}
