import Link from "@/components/ui/app-link";
import { AuthShell } from "@/components/auth-shell";
import { AdminLoginForm } from "@/features/admin/login-form";
export const dynamic = "force-dynamic";
export default function AdminLogin() {
  return (
    <AuthShell
      title="Administración"
      description="Acceso reservado al administrador único. Contraseña y autenticador obligatorios."
    >
      <AdminLoginForm />
      <p className="auth-switch">
        <Link href="/login">Volver al inicio de sesión de usuarios</Link>
      </p>
    </AuthShell>
  );
}
