import { ShieldCheck } from "lucide-react";
import Link from "@/components/ui/app-link";
import { BrandLogo } from "./brand-logo";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-container">
        <Link href="/login" className="brand auth-brand">
          <BrandLogo />
          Mappleo
        </Link>
        <section className="auth-card">
          <span className="eyebrow">TU BÚSQUEDA, EN ORDEN</span>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
          <noscript>
            <p className="form-error" role="alert">
              Activa JavaScript en tu navegador para utilizar este formulario de
              forma segura.
            </p>
          </noscript>
          <p className="privacy-note">
            <ShieldCheck size={15} />
            Tus oportunidades, en tu propio espacio.
          </p>
        </section>
        <p className="auth-caption">Un paso más cerca de lo que viene.</p>
      </div>
    </main>
  );
}
