export type TaskLink = { kind: string; recordId: string; label: string };
export type BoardTask = {
  id: string;
  title: string;
  description: string;
  columnId: string;
  position: number;
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  sourceKind: string | null;
  sourceId: string | null;
  links: TaskLink[];
};
export type Column = {
  id: string;
  name: string;
  position: number;
  isDone: boolean;
  systemKey: string | null;
};
export type LinkOption = { kind: string; id: string; label: string };
