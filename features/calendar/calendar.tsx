"use client";
import { useEffect, useState, useRef } from "react";
import Link from "@/components/ui/app-link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarRange, day } from "@/lib/dates";
import { Select } from "@/components/ui/select";
import type { CalendarItem } from "./data";
import { workspaceChangeEvent } from "@/lib/workspace-events";
const categories = {
  all: "Todos los apartados",
  networking: "Networking",
  applications: "Candidaturas",
  offers: "Ofertas",
  contacts: "Contactos",
  companies: "Empresas",
  tasks: "Tareas",
};
export function Calendar({
  initialMonth,
  initialItems,
  today,
}: {
  initialMonth: string;
  initialItems: CalendarItem[];
  today: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selected, setSelected] = useState(today);
  const [category, setCategory] = useState("all");
  const [loaded, setLoaded] = useState({
    month: initialMonth,
    items: initialItems,
  });
  const [error, setError] = useState("");
  const cache = useRef(
    new Map<string, { items: CalendarItem[]; until: number }>(),
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const clear = () => {
      cache.current.clear();
      setRevision((v) => v + 1);
    };
    window.addEventListener(workspaceChangeEvent, clear);
    return () => window.removeEventListener(workspaceChangeEvent, clear);
  }, []);
  useEffect(() => {
    if (month === initialMonth) return;
    const controller = new AbortController();
    const remembered = cache.current.get(month);
    if (remembered && remembered.until > Date.now()) {
      queueMicrotask(() => {
        if (!controller.signal.aborted)
          setLoaded({ month, items: remembered.items });
      });
      return () => controller.abort();
    }
    fetch("/api/calendar?month=" + month, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("No se ha podido cargar el calendario.");
        return r.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (cache.current.size >= 12)
          cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(month, {
          items: data.items,
          until: Date.now() + 5 * 60000,
        });
        setLoaded(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [month, initialMonth, initialItems, revision]);
  const items =
    month === initialMonth
      ? initialItems
      : loaded.month === month
        ? loaded.items
        : [];
  const { start, month: date } = calendarRange(month);
  const filtered = items.filter(
    (i) => category === "all" || i.category === category,
  );
  const selectedItems = filtered.filter((i) => i.date === selected);
  const navigate = (delta: number) => {
    const next = date.plus({ months: delta }).toFormat("yyyy-MM");
    if (next.slice(0, 4) < "2000" || next.slice(0, 4) > "2100") return;
    setMonth(next);
    setSelected(next + "-01");
    setError("");
  };
  return (
    <section className="panel calendar-panel">
      <header className="calendar-heading">
        <div>
          <h2>
            <CalendarDays size={18} />
            Tu calendario
          </h2>
          <p>Todas las fechas registradas · Europe/Madrid</p>
        </div>
        <Select
          label="Filtrar calendario"
          value={category}
          onValueChange={setCategory}
          options={Object.entries(categories).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      </header>
      <div className="calendar-navigation">
        <button
          className="icon-button"
          aria-label="Mes anterior"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 aria-live="polite">{date.toFormat("LLLL yyyy")}</h3>
        <button
          className="icon-button"
          aria-label="Mes siguiente"
          onClick={() => navigate(1)}
        >
          <ChevronRight size={18} />
        </button>
        <button
          className="button button-outline"
          onClick={() => {
            setMonth(today.slice(0, 7));
            setSelected(today);
            setError("");
          }}
        >
          Hoy
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
          <button
            className="button button-outline"
            onClick={() => {
              setMonth(initialMonth);
              setSelected(today);
              setError("");
            }}
          >
            Volver al mes actual
          </button>
        </p>
      )}
      {month !== initialMonth && loaded.month !== month && !error && (
        <p role="status" className="calendar-loading">
          Cargando fechas…
        </p>
      )}
      <div className="calendar-weekdays" aria-hidden="true">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid" aria-label="Días del mes">
        {Array.from({ length: 42 }, (_, index) => {
          const d = start.plus({ days: index }),
            key = d.toISODate()!,
            entries = filtered.filter((i) => i.date === key);
          return (
            <button
              type="button"
              key={key}
              className={[
                "calendar-day",
                d.month !== date.month ? "outside-month" : "",
                key === today ? "is-today" : "",
                key === selected ? "is-selected" : "",
              ].join(" ")}
              aria-label={
                d.toFormat("d LLLL yyyy") + ", " + entries.length + " registros"
              }
              aria-pressed={selected === key}
              onClick={() => setSelected(key)}
            >
              <span className="calendar-day-number">{d.day}</span>
              <span className="calendar-day-entries">
                {entries.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className={"calendar-entry calendar-" + e.category}
                  >
                    {e.title}
                  </span>
                ))}
                {entries.length > 3 && <small>+{entries.length - 3} más</small>}
              </span>
              <span className="calendar-dots" aria-hidden="true">
                {[...new Set(entries.map((e) => e.category))].map((c) => (
                  <i key={c} className={"calendar-" + c} />
                ))}
                {entries.length > 0 && <small>{entries.length}</small>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="calendar-selection">
        <h3>{day(selected).toFormat("cccc, d LLLL yyyy")}</h3>
        {selectedItems.length ? (
          <ul>
            {selectedItems.map((e) => (
              <li key={e.id}>
                <Link href={e.href}>
                  <span className={"calendar-category calendar-" + e.category}>
                    {categories[e.category as keyof typeof categories]}
                  </span>
                  <strong>{e.title}</strong>
                  <time>{day(e.timestamp).toFormat("HH:mm")}</time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Sin fechas registradas para este día y filtro.
          </p>
        )}
      </div>
    </section>
  );
}
