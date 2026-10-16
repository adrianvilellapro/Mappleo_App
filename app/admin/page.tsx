import { redirect } from "next/navigation";
import { adminPageIdentity } from "@/features/admin/request";
import { adminOverview } from "@/features/admin/service";
import { AdminPanel } from "@/features/admin/panel";
import { SecurityError } from "@/lib/security/controls";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const identity = await adminPageIdentity().catch((error) => {
    if (error instanceof SecurityError) redirect("/admin/login");
    throw error;
  });
  const data = await adminOverview(identity, { page: 1, search: "" });
  return <AdminPanel initial={data} />;
}
