"use client";
import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BriefcaseBusiness,
  Layers3,
  UsersRound,
  CalendarDays,
  Settings2,
  LogOut,
  ChartNoAxesCombined,
  Columns3,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn, initials } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
const links = [
  { href: "/dashboard", label: "Hoy", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: Columns3 },
  { href: "/companies", label: "Empresas", icon: Building2 },
  { href: "/offers", label: "Ofertas", icon: BriefcaseBusiness },
  { href: "/applications", label: "Candidaturas", icon: Layers3 },
  { href: "/networking", label: "Networking", icon: CalendarDays },
  { href: "/contacts", label: "Contactos", icon: UsersRound },
  { href: "/statistics", label: "Estadísticas", icon: ChartNoAxesCombined },
];
export function Navigation({ name }: { name: string }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link className="brand" href="/dashboard">
        <BrandLogo />
        Mappleo<span className="version">BETA</span>
      </Link>
      <div className="nav-caption">ESPACIO DE TRABAJO</div>
      <nav aria-label="Navegación principal">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn("nav-link", path.startsWith(href) && "active")}
            aria-current={path.startsWith(href) ? "page" : undefined}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <Link className="nav-link" href="/settings">
          <Settings2 size={18} />
          Configuración
        </Link>
        <div className="profile">
          <Link
            className="profile-link"
            href="/settings"
            aria-label={`Configuración de ${name}`}
          >
            <span className="avatar">{initials(name)}</span>
            <strong>{name}</strong>
          </Link>
          <button
            className="icon-button sidebar-logout"
            onClick={() => signOut({ callbackUrl: "/login" })}
            aria-label="Cerrar sesión"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
