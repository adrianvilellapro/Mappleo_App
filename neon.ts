import { defineConfig } from "@neon/config/v1";
// PostgreSQL only. Preserve NextAuth and the existing API; no new Auth, buckets
// or compute services are provisioned for features the application does not use.
export default defineConfig({
  branch: (branch) =>
    branch.name === "production"
      ? {
          postgres: {
            computeSettings: {
              autoscalingLimitMinCu: 0.25,
              autoscalingLimitMaxCu: 0.25,
              // Free accounts use Neon's fixed automatic suspension interval.
              // Do not send a suspendTimeout update: the free API rejects it.
            },
          },
        }
      : {},
});
