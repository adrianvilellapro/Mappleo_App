import { requireUser } from "@/lib/auth";
import { boardData } from "@/features/tasks/data";
import { Board } from "@/features/tasks/board";
import { taskOptions } from "@/features/tasks/data";
export default async function Kanban({
  searchParams,
}: {
  searchParams: Promise<{
    task?: string;
    new?: string;
    kind?: string;
    recordId?: string;
  }>;
}) {
  const user = await requireUser(),
    search = await searchParams;
  const board = await boardData(user.id);
  const initialLink =
    search.new === "1" && search.recordId
      ? (await taskOptions(user.id)).find(
          (o) => o.kind === search.kind && o.id === search.recordId,
        )
      : undefined;
  return (
    <Board
      key={
        search.new === "1"
          ? `new:${search.kind}:${search.recordId}`
          : (search.task ?? "board")
      }
      {...board}
      initialTaskId={search.task}
      initialCreate={search.new === "1"}
      initialLink={initialLink}
    />
  );
}
