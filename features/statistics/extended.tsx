"use client";
import { useState } from "react";
import Link from "@/components/ui/app-link";
import type { Statistics } from "./model";
import { prettyDate } from "./model";
import { ActivityChart } from "./charts";
export function ExtendedStatistics({ report }: { report: Statistics }) {
  const [tab, setTab] = useState("activity"),
    [detail, setDetail] = useState("");
  const ext = report.extended;
  return (
    <section className="panel statistics-extended">
      <header className="panel-heading">
        <h2>Red y trabajo personal</h2>
        <div
          className="extended-tabs"
          role="tablist"
          aria-label="Estadísticas complementarias"
        >
          <button
            role="tab"
            aria-selected={tab === "activity"}
            onClick={() => setTab("activity")}
          >
            Actividad
          </button>
          <button
            role="tab"
            aria-selected={tab === "tech"}
            onClick={() => setTab("tech")}
          >
            Tecnologías
          </button>
        </div>
      </header>
      {tab === "activity" ? (
        <div role="tabpanel">
          <div className="extended-metrics">
            {[
              ["Eventos de networking", ext.events, "events"],
              ["Contactos añadidos", ext.newContacts, "contacts"],
              ["Con último contacto en el periodo", ext.contacted, ""],
              ["Tareas completadas", ext.completed, "tasks"],
            ].map(([label, value, id]) => (
              <button
                key={label}
                onClick={() => setDetail(detail === id ? "" : String(id))}
                disabled={!id}
              >
                <strong>{value}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <ActivityChart
            series={ext.series}
            labels={["Networking", "Contactos añadidos", "Tareas completadas"]}
          />
          {detail && (
            <ul className="extended-detail">
              {(detail === "tasks"
                ? ext.completionRows
                : detail === "events"
                  ? ext.eventRows
                  : ext.contactRows
              ).map((r) => (
                <li key={r.id}>
                  <span>{prettyDate(r.date)}</span>
                  {detail === "tasks" ? (
                    <strong>{r.title}</strong>
                  ) : (
                    <Link
                      href={
                        "/" +
                        (detail === "events" ? "networking" : "contacts") +
                        "/" +
                        r.id
                      }
                    >
                      {r.title}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="statistics-note">
            Eventos según su fecha de inicio, no asistencia confirmada. «Último
            contacto» es la fecha actual de la ficha, no un histórico de
            interacciones. Cada tarea cuenta una vez en el periodo, aunque se
            reabra y complete varias veces. El gráfico asigna esa tarea a su
            última finalización del periodo.
          </p>
        </div>
      ) : (
        <div role="tabpanel" className="statistics-table-wrap">
          <table className="statistics-table">
            <thead>
              <tr>
                <th>Tecnología</th>
                <th>Enviadas</th>
                <th>Respuestas</th>
                <th>Entrevistas</th>
                <th>Respuesta</th>
              </tr>
            </thead>
            <tbody>
              {ext.technologies.slice(0, 15).map((t) => (
                <tr key={t.label}>
                  <th>{t.label}</th>
                  <td>{t.sent}</td>
                  <td>{t.responses}</td>
                  <td>{t.interviews}</td>
                  <td>
                    {t.rate} %{t.sent < 10 && <small> Muestra pequeña</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ext.technologies.length && (
            <p className="compact-empty">
              Sin tecnologías en las ofertas de las candidaturas del periodo.
            </p>
          )}
          <p className="statistics-note">
            Hasta 15 tecnologías con más envíos. Una candidatura puede tener
            varias: sus filas no se suman. Cada envío repetido a la misma oferta
            cuenta como una candidatura distinta.
          </p>
        </div>
      )}
      <p className="statistics-note">
        El periodo y la empresa se aplican a toda esta sección. La fuente se
        aplica a candidaturas, tecnologías y tareas vinculadas a esas
        candidaturas; networking y contactos no tienen fuente de oferta.
      </p>
    </section>
  );
}
