import { requireUser } from "@/lib/auth";
import { Navigation } from "@/components/layout/navigation";
import { Topbar } from "@/components/layout/topbar";
import { LiveRefresh } from "@/components/live-refresh";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const syncRevision =
    process.env.DESKTOP_SYNC_ENABLED === "true"
      ? ((
          await db.syncVersion.findUnique({
            where: { userId: user.id },
            select: { revision: true },
          })
        )?.revision.toString() ?? "0")
      : undefined;
  return (
    <div className="app-shell">
      <LiveRefresh userId={user.id} syncRevision={syncRevision} />
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <Navigation name={user.name} />
      <div className="workspace">
        <Topbar />
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
