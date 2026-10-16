import Link from "@/components/ui/app-link";
import { Search, ArrowUpRight } from "lucide-react";
import { entities, type EntityKind } from "@/features/tracker/config";
import { rowTitle, type RecordRow } from "@/features/tracker/types";
import type { RecordMatch } from "@/features/tracker/search";
export type SearchResults = {
  kind: EntityKind;
  rows: { row: RecordRow; match: RecordMatch }[];
}[];
export function SearchView({
  q,
  results,
}: {
  q: string;
  results: SearchResults;
}) {
  return (
    <div className="page">
      <div className="breadcrumb">
        Mi espacio <span>/</span> Búsqueda
      </div>
      <header className="page-heading">
        <div>
          <h1>Encuentra tu próximo paso</h1>
          <p>
            {q
              ? "Resultados para “" + q + "”"
              : "Busca empresas, ofertas, candidaturas, contactos o eventos."}
          </p>
        </div>
      </header>
      <form action="/search" className="search-box search-page-form">
        <Search size={18} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Nombre, tecnología, notas…"
          aria-label="Buscar registros"
          maxLength={100}
        />
        <button className="button button-primary">Buscar</button>
      </form>
      {results.map(
        ({ kind, rows }) =>
          rows.length > 0 && (
            <section key={kind} className="panel search-results">
              <header className="panel-heading">
                <h2>{entities[kind].title}</h2>
                <span>{rows.length}</span>
              </header>
              {rows.slice(0, 50).map(({ row: r, match }) => (
                <Link key={r.id} href={"/" + kind + "/" + r.id}>
                  <span>
                    <strong>{rowTitle(r)}</strong>
                    <small>
                      {match.label}: {match.excerpt}
                    </small>
                  </span>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            </section>
          ),
      )}
      {q && results.every((r) => !r.rows.length) && (
        <div className="empty-state">
          <Search size={26} />
          <h2>No hay coincidencias</h2>
          <p>Prueba con otro nombre o una palabra de tus notas.</p>
        </div>
      )}
    </div>
  );
}
