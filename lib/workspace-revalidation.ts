import "server-only";
import { revalidatePath } from "next/cache";
import type { EntityKind } from "@/features/tracker/config";
export function revalidateWorkspace(kind?: EntityKind | "tasks", id?: string) {
  const paths = new Set(["/dashboard", "/kanban", "/statistics"]);
  // A linked task can change or clear its original action/follow-up.
  if (kind === "tasks") {
    paths.add("/applications");
    paths.add("/contacts");
  }
  if (kind && kind !== "tasks") {
    paths.add("/" + kind);
    paths.add("/search");
    if (id) paths.add("/" + kind + "/" + id);
    if (kind === "companies")
      for (const related of [
        "offers",
        "applications",
        "contacts",
        "networking",
      ])
        paths.add("/" + related);
    if (kind === "offers") paths.add("/applications");
    if (kind === "contacts") paths.add("/networking");
  }
  for (const path of paths) revalidatePath(path);
  revalidatePath("/[section]/[id]", "page");
}
