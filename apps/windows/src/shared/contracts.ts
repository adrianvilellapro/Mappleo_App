import type {
  Command,
  Profile,
  Workspace,
} from "../../../../packages/domain/workspace";
export type {
  Command,
  Kind,
  Profile,
  Wire,
  Workspace,
} from "../../../../packages/domain/workspace";
import type { CsvSection } from "../../../../packages/domain/csv-sections";
import type { SyncConflict } from "../../../../packages/domain/sync";
export type SyncStatus = {
  connected: boolean;
  phase:
    | "disconnected"
    | "connecting"
    | "syncing"
    | "synced"
    | "offline"
    | "conflicts"
    | "error"
    | "expired";
  email?: string;
  lastSyncedAt?: string;
  message?: string;
  conflicts: SyncConflict[];
  revocationPending?: boolean;
};

export type Snapshot = {
  profile: Profile | null;
  workspace: Workspace;
  dataPath: string;
  pendingChanges: number;
  version: string;
  sync: SyncStatus;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ImportSummary = { added: number; updated: number; skipped: number };
export type DocumentCategory = "cv" | "letter" | "other";
export type LocalDocument = {
  id: string;
  name: string;
  category: DocumentCategory;
  mime: "application/pdf" | "image/png" | "image/jpeg" | "text/plain";
  size: number;
  createdAt: string;
  offerIds: string[];
};
export type DesktopAPI = {
  listDocuments(): Promise<Result<LocalDocument[]>>;
  importDocument(
    category: DocumentCategory,
  ): Promise<Result<LocalDocument | null>>;
  readDocument(
    id: string,
  ): Promise<Result<{ document: LocalDocument; content: string }>>;
  updateDocument(
    id: string,
    input: { name: string; category: DocumentCategory; offerIds: string[] },
  ): Promise<Result<boolean>>;
  deleteDocument(id: string): Promise<Result<boolean>>;
  exportDocument(id: string): Promise<Result<boolean>>;
  resetLocalProfile(confirmation: string): Promise<Result<boolean>>;
  connectAccount(): Promise<Result<boolean>>;
  disconnectAccount(): Promise<Result<boolean>>;
  cancelConnection(): Promise<Result<boolean>>;
  connectionAvailable(): Promise<Result<boolean>>;
  resolveConflict(
    key: string,
    choice: "local" | "remote",
  ): Promise<Result<boolean>>;
  onChange(callback: () => void): () => void;
  snapshot(): Promise<Result<Snapshot>>;
  command(command: Command): Promise<Result<Snapshot>>;
  importBackup(): Promise<Result<ImportSummary | null>>;
  exportFile(
    format: "json" | "csv",
    section?: CsvSection,
  ): Promise<Result<boolean>>;
  exportPdf(): Promise<Result<boolean>>;
  openExternal(url: string): Promise<Result<boolean>>;
  openDataFolder(): Promise<Result<boolean>>;
};

declare global {
  interface Window {
    mappleo: DesktopAPI;
  }
}
