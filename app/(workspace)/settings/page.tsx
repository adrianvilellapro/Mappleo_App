import { Palette, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { DataPortability } from "@/components/data-portability";
import { ThemeSettings } from "@/components/theme-controls";
import { AccountForms } from "@/features/account/forms";
import { DesktopDevices } from "@/features/desktop/devices";
import { LogoutButton } from "@/components/logout-button";
export default async function Settings() {
  const user = await requireUser();
  return (
    <div className="page settings-page">
      <div className="breadcrumb">
        Mi espacio <span>/</span> Configuración
      </div>
      <header className="page-heading">
        <div>
          <h1>Tu espacio, tus datos.</h1>
          <p>Lo esencial para mantener el control de tu búsqueda.</p>
        </div>
      </header>
      <section className="panel settings-section">
        <h2>
          <ShieldCheck size={18} />
          Cuenta privada
        </h2>
        <dl>
          <dt>Nombre</dt>
          <dd>{user.name}</dd>
          <dt>Email de la cuenta</dt>
          <dd>{user.email}</dd>
          <dt>Fechas</dt>
          <dd>Español · Europe/Madrid</dd>
        </dl>
        <AccountForms name={user.name} />
        <LogoutButton />
      </section>
      <section className="panel settings-section">
        <h2>
          <Palette size={18} />
          Apariencia
        </h2>
        <p>
          Elige el modo de visualización. Tu elección se guarda en este
          navegador.
        </p>
        <ThemeSettings />
      </section>
      <DataPortability />
      {process.env.DESKTOP_SYNC_ENABLED === "true" && <DesktopDevices />}
      <section className="panel settings-section">
        <h2>Primera iteración · 0.1.0</h2>
        <p>
          Un espacio local centrado en registrar oportunidades y hacer
          seguimiento. Puedes registrar una cuenta desde el login. La
          verificación por email todavía no está disponible.
        </p>
      </section>
    </div>
  );
}
