import { DemoStore } from "./store";
import type { Workspace } from "../../../packages/domain/workspace";
import { ZodError } from "zod";

declare const __DEMO_LANGUAGE__: "es" | "en";
export type DemoState = { data: Workspace; href: string; notice: string };
const allowedRoute =
  /^\/(?:dashboard|kanban|statistics|settings|search|(?:companies|offers|applications|contacts|networking)(?:\/[a-zA-Z0-9_:-]{1,100})?)(?:\?[^#]{0,2000})?$/;

/** Browser-only transport for the actual web UI. Never holds account credentials. */
export class DemoRuntime {
  private listeners = new Set<() => void>();
  private state: DemoState;
  constructor(
    readonly store: DemoStore,
    href = "/dashboard",
  ) {
    this.state = {
      data: store.snapshot(),
      href: allowedRoute.test(href) ? href : "/dashboard",
      notice: "",
    };
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DemoState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  notify = (notice: string) => this.update({ notice });
  refresh = () => this.update({ data: this.store.snapshot() });
  execute(raw: unknown) {
    try {
      this.update({ data: this.store.command(raw) });
      return { ok: true };
    } catch (error) {
      this.refresh();
      return {
        ok: false,
        error:
          error instanceof ZodError
            ? error.issues
                .slice(0, 3)
                .map((issue) => issue.message)
                .join(" ")
            : error instanceof Error
              ? error.message
              : "No se ha podido guardar.",
      };
    }
  }
  navigate = (
    href: string,
    options?: { scroll?: boolean },
    replace = false,
  ) => {
    if (!allowedRoute.test(href)) {
      this.notify("Esta demo no tiene cuentas reales ni enlaces externos.");
      return;
    }
    if (typeof window !== "undefined") {
      window.history[replace ? "replaceState" : "pushState"](
        null,
        "",
        "#" + href,
      );
      if (
        options?.scroll !== false &&
        this.state.href.split(/[/?]/)[1] !== href.split(/[/?]/)[1]
      )
        document.getElementById("main")?.scrollTo(0, 0);
    }
    this.update({ href });
  };
  restoreRoute = () => {
    const href = window.location.hash.slice(1);
    this.update({ href: allowedRoute.test(href) ? href : "/dashboard" });
    document.getElementById("main")?.scrollTo(0, 0);
  };
  expire = () => {
    if (!this.store.expired()) return;
    this.update({
      data: this.store.reset(),
      href: "/dashboard",
      notice: "La demo ha caducado. Se han restaurado los datos de ejemplo.",
    });
    if (typeof window !== "undefined")
      window.history.replaceState(null, "", "#/dashboard");
  };
}
let instance: DemoRuntime | undefined;
export function demoRuntime() {
  if (!instance) {
    let storage: Storage | undefined;
    try {
      storage =
        typeof window === "undefined" ? undefined : window.sessionStorage;
    } catch {
      /* Memory-only mode. */
    }
    const language =
      typeof __DEMO_LANGUAGE__ === "undefined" ? "es" : __DEMO_LANGUAGE__;
    instance = new DemoRuntime(
      new DemoStore(language, storage),
      typeof window === "undefined" ? undefined : window.location.hash.slice(1),
    );
  }
  return instance;
}
