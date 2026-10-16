import Link from "@/components/ui/app-link";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Building2,
  BriefcaseBusiness,
  Layers3,
  CalendarDays,
  CheckCheck,
  Activity,
} from "lucide-react";
import { closedStatuses } from "@/features/tracker/config";
import { StatusBadge } from "@/features/tracker/components/records-view";
import { CompanyLogo } from "@/components/company-logo";
import { formatDate } from "@/lib/utils";
import { NextActions } from "@/components/dashboard-next-actions";
import { Calendar } from "@/features/calendar/calendar";
import { madrid } from "@/lib/dates";
import type { CalendarItem } from "@/features/calendar/data";
export type DashboardData = {
  now: Date;
  metrics: {
    companies: number;
    offers: number;
    active: number;
    interviews: number;
  };
  applications: {
    id: string;
    status: string;
    jobOffer: {
      title: string;
      company: {
        id: string;
        name: string;
        websiteUrl: string;
        faviconUrl: string;
      };
    };
  }[];
  events: { id: string; name: string; startsAt: Date; location: string }[];
  tasks: {
    id: string;
    title: string;
    dueAt: Date | null;
    links: { label: string }[];
  }[];
  activity: {
    id: string;
    applicationId: string;
    title: string;
    happenedAt: Date;
    application: { jobOffer: { company: { name: string } } };
  }[];
  calendar: CalendarItem[];
  loadCalendar?: (
    month: string,
    signal: AbortSignal,
  ) => Promise<{ month: string; items: CalendarItem[] }>;
};
export function DashboardView({
  now,
  metrics,
  applications,
  events,
  tasks,
  activity,
  calendar,
  loadCalendar,
}: DashboardData) {
  const month = madrid(now).toFormat("yyyy-MM"),
    today = madrid(now).toISODate()!;
  const active = applications.filter((a) => !closedStatuses.includes(a.status));
  const actions = tasks
    .map((t) => ({
      id: t.id,
      kind: "tasks" as const,
      title: t.title,
      context: t.links.map((l) => l.label).join(" · ") || "Tarea del tablero",
      due: t.dueAt,
      href: "/kanban?task=" + t.id,
    }))
    .sort(
      (a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity),
    );
  const date = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  }).format(now);
  return (
    <div className="page dashboard">
      <div className="breadcrumb">
        Mi espacio <span>/</span> Hoy
      </div>
      <header className="page-heading">
        <div>
          <h1 className="dashboard-date">{date}</h1>
        </div>
        <Link className="button button-outline" href="/applications?new=1">
          <Plus size={16} />
          Registrar candidatura
        </Link>
      </header>
      <div className="metric-grid">
        {[
          {
            label: "Empresas en el radar",
            value: metrics.companies,
            icon: Building2,
            href: "/companies",
            caption: "Empresas sin archivar",
          },
          {
            label: "Ofertas guardadas",
            value: metrics.offers,
            icon: BriefcaseBusiness,
            href: "/offers",
            caption: "Ofertas sin archivar",
          },
          {
            label: "Procesos activos",
            value: metrics.active,
            icon: Layers3,
            href: "/applications?scope=active",
            caption: "Candidaturas no cerradas",
          },
          {
            label: "En entrevista",
            value: metrics.interviews,
            icon: CalendarDays,
            href: "/applications?scope=interviews",
            caption: "Entrevista o entrevista final",
          },
        ].map(({ label, value, icon: Icon, href, caption }) => (
          <Link className="metric" href={href} key={label}>
            <div className="metric-label">
              {label}
              <Icon size={17} />
            </div>
            <strong>{value.toString().padStart(2, "0")}</strong>
            <span>
              {caption}
              <ArrowUpRight size={14} />
            </span>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel">
            <header className="panel-heading">
              <h2>
                <CheckCheck size={18} />
                Lo siguiente
              </h2>
              <span className="count-pill">{actions.length}</span>
            </header>
            <NextActions
              actions={actions.map((action) => ({
                ...action,
                dueAt: action.due?.toISOString() ?? null,
                dueLabel: action.due ? formatDate(action.due) : "Sin fecha",
                overdue: Boolean(action.due && action.due < now),
              }))}
            />
          </section>
          <section className="panel">
            <header className="panel-heading">
              <h2>Procesos en marcha</h2>
              <Link href="/applications">
                Ver todos <ArrowUpRight size={14} />
              </Link>
            </header>
            {active.length ? (
              <div className="process-list">
                {active.slice(0, 5).map((a) => (
                  <Link href={"/applications/" + a.id} key={a.id}>
                    <CompanyLogo
                      companyId={a.jobOffer.company.id}
                      name={a.jobOffer.company.name}
                      websiteUrl={a.jobOffer.company.websiteUrl}
                      faviconUrl={a.jobOffer.company.faviconUrl}
                    />
                    <span>
                      <strong>{a.jobOffer.title}</strong>
                      <small>{a.jobOffer.company.name}</small>
                    </span>
                    <StatusBadge status={a.status} />
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="panel-empty">
                <Layers3 size={24} />
                <h3>Las oportunidades empiezan con un paso</h3>
                <p>
                  Guarda una empresa y su oferta. Cuando apliques, registra aquí
                  tu candidatura.
                </p>
                <Link href="/companies?new=1">
                  Añadir mi primera empresa <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="quick-start">
            <span className="eyebrow">HAZ SITIO A LO QUE VIENE</span>
            <h2>¿Una nueva oportunidad?</h2>
            <p>Guárdala ahora. Tendrás tiempo para los detalles.</p>
            <Link href="/offers?new=1" className="button button-primary">
              <Plus size={15} />
              Guardar oferta
            </Link>
          </section>
          <section className="panel">
            <header className="panel-heading">
              <h2>
                <CalendarDays size={17} />
                En tu agenda
              </h2>
              <Link href="/networking?new=1" aria-label="Nuevo evento">
                <Plus size={17} />
              </Link>
            </header>
            {events.length ? (
              <div className="agenda-list">
                {events.map((e) => (
                  <Link key={e.id} href={"/networking/" + e.id}>
                    <div className="calendar-tile">
                      <span>
                        {new Intl.DateTimeFormat("es", {
                          month: "short",
                          timeZone: "Europe/Madrid",
                        }).format(e.startsAt)}
                      </span>
                      <strong>
                        {new Intl.DateTimeFormat("es", {
                          day: "2-digit",
                          timeZone: "Europe/Madrid",
                        }).format(e.startsAt)}
                      </strong>
                    </div>
                    <span>
                      <strong>{e.name}</strong>
                      <small>{e.location || "Ubicación pendiente"}</small>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="compact-empty">
                Sin eventos próximos. Tu siguiente conexión puede empezar en un
                encuentro.
              </p>
            )}
          </section>
          <section className="panel">
            <header className="panel-heading">
              <h2>
                <Activity size={17} />
                Actividad reciente
              </h2>
            </header>
            {activity.length ? (
              <ol className="recent-activity">
                {activity.map((a) => (
                  <li key={a.id}>
                    <Link href={"/applications/" + a.applicationId}>
                      <strong>{a.title}</strong>
                      <span>{a.application.jobOffer.company.name}</span>
                      <time>{formatDate(a.happenedAt)}</time>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="compact-empty">
                Aquí aparecerá la historia de tus candidaturas, paso a paso.
              </p>
            )}
          </section>
        </aside>
      </div>
      <Calendar
        initialMonth={month}
        initialItems={calendar}
        today={today}
        loadItems={loadCalendar}
      />
    </div>
  );
}
