import Link from "@/components/ui/app-link";
import { Search, ArrowUpRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { collectionRows, listOnly } from "@/features/tracker/collection-data";
import { collectionFilterSchema } from "@/features/tracker/collection";
import { entities, type EntityKind } from "@/features/tracker/config";
import { type RecordRow, rowTitle } from "@/features/tracker/types";
import { searchRecord } from "@/features/tracker/search";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser(),
    q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const kinds = Object.keys(entities) as EntityKind[];
  const results = q
    ? await Promise.all(
        kinds.map(async (kind) => ({
          kind,
          rows: (
            JSON.parse(
              JSON.stringify(await collectionRows(user.id, kind, collectionFilterSchema.parse({q,filter:"all"}), true, false)),
            ) as RecordRow[]
          )
            .flatMap((row) => {
              const match = searchRecord(kind, row, q);
              return match ? [{ row:listOnly(row), match }] : [];
            })
            .sort((a, b) => b.match.score - a.match.score),
        })),
      )
    : [];
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
