import Link from "@/components/ui/app-link";
import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell
      title="Bienvenido de nuevo"
      description="Inicia sesión para continuar tu búsqueda."
    >
      {error && (
        <p className="form-error" role="alert">
          {error === "TooManyAttempts"
            ? "has realizado varios intentos, espera 15 minutos."
            : "Email o contraseña incorrectos."}
        </p>
      )}
      <LoginForm />
      <p className="auth-switch">
        ¿No tienes cuenta? <Link href="/register">Crear una cuenta</Link>
      </p>
      <p className="auth-switch">
        <Link href="/admin/login">Acceso administrativo</Link>
      </p>
    </AuthShell>
  );
}
