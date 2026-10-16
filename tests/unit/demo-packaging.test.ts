import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");
describe("standalone demo distribution", () => {
  it("has no default production administrator email or embedded deployment identifiers", () => {
    const preparation =
      source("scripts/admin-prepare.ts") +
      source("scripts/deployment-profile.ts");
    expect(
      preparation.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g),
    ).toEqual(["admin@example.test"]);
    expect(preparation).toContain("if (!adminEmail)");
    expect(source("scripts/prepare-ci.ts")).toContain(
      "ADMIN_EMAIL=admin-ci@example.test",
    );
    expect(source("scripts/vercel-prepare.ts")).not.toMatch(
      /(?:prj_|team_)[A-Za-z0-9]{10,}/,
    );
    expect(source("scripts/deployment-rotate-owner.ts")).toContain(
      "process.env.NEON_PROJECT_ID",
    );
  });
  it("never builds or copies the demo into the web service", () => {
    const scripts = JSON.parse(source("package.json")).scripts;
    expect(scripts.build).not.toContain("demo:build");
    expect(scripts.build).toContain("scripts/prepare-web.mjs");
    expect(source("scripts/build-demo.ts")).not.toContain("public/demo");
    expect(source("next.config.ts")).not.toContain('source: "/demo');
    expect(source("proxy.ts")).not.toContain("|demo/");
  });
  it("keeps Pages activation manual, with a portable relative-path build", () => {
    expect(source(".github/workflows/pages.yml")).toContain(
      "workflow_dispatch:",
    );
    expect(source(".github/workflows/pages.yml")).not.toMatch(/^\s+push:/m);
    expect(source("apps/demo/vite.config.ts")).toContain('base: "./"');
    expect(source("scripts/build-demo.ts")).toContain('".nojekyll"');
  });
});
