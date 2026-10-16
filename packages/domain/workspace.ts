import type { Backup } from "./backup";
import type { EntityKind } from "./tracker";
export type Wire<T> = T extends Date
  ? string
  : T extends (infer I)[]
    ? Wire<I>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
export type Workspace = Wire<Backup>;
export type Kind = EntityKind | "tasks" | "boardColumns";
export type Profile = {
  id: string;
  name: string;
  deviceId: string;
  createdAt: string;
};

export type Command =
  | { action: "profile"; name: string }
  | { action: "save"; kind: Kind; id?: string; input: Record<string, unknown> }
  | {
      action: "delete";
      kind: Kind;
      id: string;
      moveTo?: string;
      deleteTasks?: boolean;
    }
  | { action: "moveTask"; id: string; columnId: string; position: number }
  | {
      action: "complete";
      kind: "applications" | "contacts" | "tasks";
      id: string;
    }
  | {
      action: "activity";
      applicationId: string;
      title: string;
      description: string;
      type: string;
      happenedAt: string;
    }
  | { action: "deleteActivity"; applicationId: string; id: string };
