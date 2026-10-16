import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isEntityKind } from "@/features/tracker/config";
import { getOptions } from "@/features/tracker/queries";
import { collectionPage } from "@/features/tracker/collection-data";
import { RecordsView } from "@/features/tracker/components/records-view";
import type { RecordRow } from "@/features/tracker/types";
export default async function Collection({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { section } = await params;
  if (!isEntityKind(section)) notFound();
  const user = await requireUser(),
    search = await searchParams;
  const [page, options] = await Promise.all([
    collectionPage(user.id, section, { scope: search.scope ?? "all" }),
    search.new === "1" ? getOptions(user.id, section) : undefined,
  ]);
  const preset: Record<string, string> = {};
  if (search.companyId) preset.companyId = search.companyId;
  if (search.jobOfferId) preset.jobOfferId = search.jobOfferId;
  return (
    <RecordsView
      kind={section}
      records={page.records as RecordRow[]}
      initialPage={page}
      options={options}
      creating={search.new === "1"}
      preset={preset}
      initialScope={search.scope}
    />
  );
}
