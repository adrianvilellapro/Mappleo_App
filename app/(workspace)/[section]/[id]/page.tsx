import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isEntityKind } from "@/features/tracker/config";
import { listRecords, getOptions } from "@/features/tracker/queries";
import { RecordsView } from "@/features/tracker/components/records-view";
import type { RecordRow } from "@/features/tracker/types";
export default async function Detail({
  params,
}: {
  params: Promise<{ section: string; id: string }>;
}) {
  const { section, id } = await params;
  if (!isEntityKind(section)) notFound();
  const user = await requireUser();
  const [records, options] = await Promise.all([
    listRecords(user.id, section, id),
    getOptions(user.id, section),
  ]);
  if (!records.some((r) => r.id === id)) notFound();
  return (
    <RecordsView
      kind={section}
      records={JSON.parse(JSON.stringify(records)) as RecordRow[]}
      options={options}
      initialRecordId={id}
    />
  );
}
