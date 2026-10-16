import { requireUser } from "@/lib/auth";
import { SettingsView } from "@/features/account/settings-view";
export default async function Settings() {
  const user = await requireUser();
  return (
    <SettingsView
      user={user}
      syncEnabled={process.env.DESKTOP_SYNC_ENABLED === "true"}
    />
  );
}
