import { SearchView } from "@/features/search/view";
import { requireUser } from "@/lib/auth";
import { collectionRows, listOnly } from "@/features/tracker/collection-data";
import { collectionFilterSchema } from "@/features/tracker/collection";
import { entities, type EntityKind } from "@/features/tracker/config";
import { type RecordRow } from "@/features/tracker/types";
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
              JSON.stringify(
                await collectionRows(
                  user.id,
                  kind,
                  collectionFilterSchema.parse({ q, filter: "all" }),
                  true,
                  false,
                ),
              ),
            ) as RecordRow[]
          )
            .flatMap((row) => {
              const match = searchRecord(kind, row, q);
              return match ? [{ row: listOnly(row), match }] : [];
            })
            .sort((a, b) => b.match.score - a.match.score),
        })),
      )
    : [];
  return <SearchView q={q} results={results} />;
}
