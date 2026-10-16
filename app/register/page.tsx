import Link from "@/components/ui/app-link";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";
export default function Register() {
  return (
    <AuthShell
      title="Crea tu cuenta"
      description="Organiza tus oportunidades desde un único lugar."
    >
      <RegisterForm />
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link href="/login">Iniciar sesión</Link>
      </p>
    </AuthShell>
  );
}
