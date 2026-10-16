import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { getCACertificates } from "node:tls";
import { z } from "zod";
import { LocalStore } from "./store";
import {
  canonical,
  mergeWorkspaces,
  wireWorkspace,
  withOwner,
  syncPatchSchema,
  workspacePatch,
  applyWorkspacePatch,
} from "../../../../packages/domain/sync";
import type { SyncStatus } from "../shared/contracts";

const MAX_BYTES = 3 * 1024 * 1024;
export class SyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function serverOrigin(development: boolean, override?: string) {
  const origin = new URL(
    development && override ? override : "https://mappleo.vercel.app",
  );
  if (
    origin.origin !== origin.href.replace(/\/$/, "") ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (origin.origin !== "https://mappleo.vercel.app" &&
      !(
        development &&
        ["localhost", "127.0.0.1"].includes(origin.hostname) &&
        ["https:", "http:"].includes(origin.protocol)
      ))
  )
    throw new Error("Servidor de Mappleo no permitido.");
  return origin.origin;
}
/** Main-process transport only. No cookies, redirects, arbitrary hosts, insecure
 * TLS exceptions or unbounded responses. Windows' trusted local CA is supported. */
export async function syncRequest(
  origin: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<unknown> {
  const url = new URL(path, origin);
  if (
    url.origin !== origin ||
    !/^\/api\/desktop\/(sync|token|revoke)(\?|$)/.test(path)
  )
    throw new Error("Destino no permitido.");
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (payload && Buffer.byteLength(payload) > MAX_BYTES)
    throw new Error("El espacio supera el límite de sincronización de 3 MB.");
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: payload === undefined ? "GET" : "POST",
        headers: {
          "X-Mappleo-Client": "windows-v1",
          Accept: "application/json",
          "Accept-Encoding": "identity",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
        ...(url.protocol === "https:"
          ? {
              ca: [
                ...getCACertificates("default"),
                ...getCACertificates("system"),
              ],
            }
          : {}),
      },
      (response) => {
        const payload = Buffer.allocUnsafe(MAX_BYTES);
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          if (size + chunk.length > MAX_BYTES)
            req.destroy(
              new SyncHttpError(
                "Los datos del servidor superan el límite de sincronización de 3 MiB. Tus datos locales se conservan.",
                413,
              ),
            );
          else {
            payload.set(chunk, size);
            size += chunk.length;
          }
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            if (
              !response.headers["content-type"]?.startsWith("application/json")
            )
              throw new SyncHttpError(
                "El servidor no tiene disponible esta versión de la conexión de Windows.",
                response.statusCode ?? 503,
              );
            const result = JSON.parse(
              payload.subarray(0, size).toString("utf8"),
            );
            if (!response.statusCode || response.statusCode >= 300)
              throw new SyncHttpError(
                typeof result.error === "string"
                  ? result.error
                  : "No se ha podido sincronizar.",
                response.statusCode ?? 503,
              );
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    const timeout = setTimeout(
      () =>
        req.destroy(
          new Error(
            "No se ha podido conectar con el servidor. Tus cambios siguen guardados en este equipo.",
          ),
        ),
      30000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const pullSchema = z.object({
  revision: z.string().regex(/^\d{1,30}$/),
  workspace: z.unknown().optional(),
  changes: syncPatchSchema.optional(),
});
const tokenSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  deviceId: z.string().min(1).max(100),
  expiresAt: z.iso.datetime(),
  user: z.object({
    id: z.string().min(1).max(100),
    email: z.email(),
    name: z.string(),
  }),
});
type Transport = typeof syncRequest;

export class SyncCoordinator {
  private timer?: ReturnType<typeof setTimeout>;
  private server?: Server;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private failures = 0;
  private running?: Promise<void>;
  private stopped = false;
  private dirty = false;
  constructor(
    private store: LocalStore,
    readonly origin: string,
    private openBrowser: (url: string) => Promise<void>,
    private notify: () => void,
    private transport: Transport = syncRequest,
  ) {}
  start() {
    this.stopped = false;
    this.schedule(1000);
  }
  stop() {
    this.stopped = true;
    this.attempt++;
    clearTimeout(this.timer);
    clearTimeout(this.connectionTimer);
    this.server?.close();
    this.server = undefined;
  }
  private status(
    value: Omit<SyncStatus, "connected" | "conflicts"> & {
      conflicts?: SyncStatus["conflicts"];
    },
  ) {
    if (this.stopped) return;
    const link = this.store.connection();
    this.store.syncStatus({
      connected: !!link?.token,
      email: link?.email,
      lastSyncedAt: link?.lastSyncedAt,
      revocationPending: this.store.pendingRevocations().length > 0,
      conflicts: [],
      ...value,
    });
    this.notify();
  }
  private schedule(delay: number) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.synchronize(), delay);
  }
  changed() {
    this.dirty = true;
    if (!this.running) this.schedule(1500);
  }
  async connect() {
    if (!this.store.profile()) throw new Error("Crea primero tu perfil local.");
    if (this.store.connection()?.token)
      throw new Error("Desconecta la cuenta antes de volver a vincularla.");
    // Fail promptly if the deployed web has not enabled the desktop API yet.
    try {
      await this.transport(this.origin, "/api/desktop/sync");
      throw new Error(
        "El servidor no ofrece una autorización de Windows compatible.",
      );
    } catch (error) {
      if (!(error instanceof SyncHttpError && error.status === 401))
        throw error;
    }
    this.cancelConnection();
    const attempt = ++this.attempt,
      state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const server = createServer();
    server.maxConnections = 8;
    server.headersTimeout = 10000;
    server.requestTimeout = 10000;
    server.keepAliveTimeout = 1000;
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No se ha podido preparar la autorización.");
    const redirectUri = `http://127.0.0.1:${address.port}/callback`;
    let consumed = false;
    server.on("request", (request, response) => {
      let target: URL;
      try {
        target = new URL(request.url ?? "/", redirectUri);
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      const code = target.searchParams.get("code");
      const valid =
        !consumed &&
        request.method === "GET" &&
        request.headers.host === `127.0.0.1:${address.port}` &&
        target.pathname === "/callback" &&
        target.searchParams.get("state") === state &&
        /^[A-Za-z0-9_-]{43}$/.test(code ?? "") &&
        attempt === this.attempt;
      response.writeHead(valid ? 200 : 400, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(
        valid
          ? "Autorización recibida. Puedes volver a Mappleo para Windows."
          : "Autorización no válida. Vuelve a Mappleo e inicia la conexión otra vez.",
      );
      if (valid) {
        consumed = true;
        server.close();
        this.server = undefined;
        clearTimeout(this.connectionTimer);
        void this.finishConnection(code!, verifier, redirectUri, attempt);
      }
    });
    this.connectionTimer = setTimeout(() => {
      if (attempt === this.attempt) {
        this.cancelConnection();
        this.status({
          phase: "error",
          message: "La vinculación ha caducado. Puedes volver a intentarlo.",
        });
      }
    }, 8 * 60000);
    this.status({
      phase: "connecting",
      message: "Termina el inicio de sesión y la autorización en tu navegador.",
    });
    try {
      await this.openBrowser(
        this.origin +
          "/desktop/connect?" +
          new URLSearchParams({ challenge, state, redirectUri }),
      );
    } catch {
      this.cancelConnection();
      throw new Error("No se ha podido abrir el navegador.");
    }
    return true;
  }
  cancelConnection() {
    this.attempt++;
    clearTimeout(this.connectionTimer);
    this.server?.close();
    this.server = undefined;
    if (!this.stopped)
      this.status({
        phase: this.store.connection()?.token ? "synced" : "disconnected",
      });
    return true;
  }
  private async finishConnection(
    code: string,
    verifier: string,
    redirectUri: string,
    attempt: number,
  ) {
    let issued: z.infer<typeof tokenSchema> | undefined;
    try {
      issued = tokenSchema.parse(
        await this.transport(this.origin, "/api/desktop/token", undefined, {
          code,
          verifier,
          redirectUri,
        }),
      );
      if (this.stopped || attempt !== this.attempt) {
        await this.transport(
          this.origin,
          "/api/desktop/revoke",
          issued.token,
          {},
        );
        return;
      }
      const result = pullSchema.parse(
        await this.transport(this.origin, "/api/desktop/sync", issued.token),
      );
      const remote = wireWorkspace(result.workspace);
      if (remote.ownerId !== issued.user.id)
        throw new Error("La respuesta del servidor pertenece a otra cuenta.");
      if (this.stopped || attempt !== this.attempt) {
        await this.transport(
          this.origin,
          "/api/desktop/revoke",
          issued.token,
          {},
        );
        return;
      }
      this.store.bindAccount(
        {
          origin: this.origin,
          userId: issued.user.id,
          email: issued.user.email,
          token: issued.token,
          deviceId: issued.deviceId,
          expiresAt: issued.expiresAt,
        },
        remote,
        result.revision,
      );
      this.dirty = true;
      await this.synchronize();
    } catch (error) {
      if (issued && !this.stopped && !this.store.connection()?.token) {
        this.store.setRevocations([
          ...this.store.pendingRevocations(),
          { origin: this.origin, token: issued.token },
        ]);
        this.schedule(30000);
      }
      this.status({
        phase: "error",
        message:
          error instanceof Error && !(error instanceof z.ZodError)
            ? error.message
            : "La respuesta de vinculación no es válida.",
      });
    }
  }
  async disconnect() {
    this.cancelConnection();
    this.store.disconnect();
    this.status({
      phase: "disconnected",
      message: "Cuenta desconectada. Los datos siguen en este equipo.",
    });
    this.dirty = true;
    this.schedule(0);
    return true;
  }
  async resolve(key: string, choice: "local" | "remote") {
    const conflict = this.store
      .snapshot()
      .sync.conflicts.find((c) => c.key === key);
    if (!conflict)
      throw new Error(
        "Esta discrepancia ya ha cambiado. Revisa la lista actualizada.",
      );
    const workspace = this.store.exportBackup();
    const current =
      conflict.section === "workspace"
        ? workspace
        : ((workspace[conflict.section] ?? []).find(
            (r) => r.id === conflict.id,
          ) ?? null);
    if (canonical(current) !== canonical(conflict.local)) {
      this.changed();
      throw new Error(
        "El registro local ha cambiado. Revisa la nueva versión antes de elegir.",
      );
    }
    this.store.backup("antes-resolver");
    this.store.chooseConflict(key, choice, conflict.local, conflict.remote);
    this.changed();
    return true;
  }
  async synchronize() {
    if (this.stopped) return;
    if (this.running) {
      this.dirty = true;
      return this.running;
    }
    this.running = this.cycle();
    try {
      await this.running;
    } finally {
      this.running = undefined;
      if (!this.stopped)
        this.schedule(
          this.dirty
            ? 2000
            : this.failures
              ? Math.min(300000, 30000 * 2 ** this.failures)
              : 300000,
        );
    }
  }
  private async cycle() {
    this.dirty = false;
    for (const revocation of this.store.pendingRevocations()) {
      try {
        await this.transport(
          revocation.origin,
          "/api/desktop/revoke",
          revocation.token,
          {},
        );
      } catch (error) {
        if (!(error instanceof SyncHttpError && error.status === 401)) continue;
      }
      if (this.stopped) return;
      this.store.setRevocations(
        this.store
          .pendingRevocations()
          .filter((r) => r.token !== revocation.token),
      );
    }
    if (this.stopped) return;
    const link = this.store.connection();
    if (!link?.token) {
      if (!this.server && this.store.snapshot().sync.phase !== "expired")
        this.status({ phase: "disconnected" });
      return;
    }
    if (link.origin !== this.origin) {
      this.status({
        phase: "error",
        message:
          "Este perfil está vinculado a otro servidor. Usa su configuración original.",
      });
      return;
    }
    const token = link.token,
      live = () => !this.stopped && this.store.connection()?.token === token;
    this.status({ phase: "syncing" });
    try {
      const result = pullSchema.parse(
        await this.transport(
          link.origin,
          "/api/desktop/sync" +
            (link.revision
              ? "?revision=" + encodeURIComponent(link.revision)
              : ""),
          token,
        ),
      );
      if (!live()) return;
      const remote = result.workspace
        ? wireWorkspace(result.workspace)
        : withOwner(link.remote, link.userId);
      if (remote.ownerId !== link.userId)
        throw new Error("La respuesta pertenece a otra cuenta.");
      if (result.workspace || link.revision !== result.revision)
        this.store.rememberRemote(remote, result.revision);
      const sent = this.store.exportBackup(),
        sequence = this.store.syncSequence(),
        localRemote = withOwner(remote, sent.ownerId!);
      const current = this.store.connection()!;
      if (
        !result.workspace &&
        !sequence &&
        !Object.keys(current.choices).length &&
        canonical(sent) === canonical(current.base)
      ) {
        this.failures = 0;
        this.status({ phase: "synced" });
        return;
      }
      const merged = mergeWorkspaces(
        current.base,
        sent,
        localRemote,
        current.choices,
      );
      if (merged.conflicts.length) {
        this.failures = 0;
        this.status({
          phase: "conflicts",
          message:
            "Revisa las discrepancias para continuar. Ninguna de las dos versiones se ha sobrescrito.",
          conflicts: merged.conflicts,
        });
        return;
      }
      let committed = { revision: result.revision, workspace: remote };
      if (canonical(merged.workspace) !== canonical(localRemote)) {
        const updated = pullSchema.parse(
          await this.transport(link.origin, "/api/desktop/sync", token, {
            revision: result.revision,
            changes: workspacePatch(
              remote,
              withOwner(merged.workspace, link.userId),
            ),
          }),
        );
        if (!updated.changes)
          throw new Error("Respuesta de sincronización incompleta.");
        committed = {
          revision: updated.revision,
          workspace: applyWorkspacePatch(remote, updated.changes),
        };
      }
      if (!live()) return;
      if (committed.workspace.ownerId !== link.userId)
        throw new Error("La respuesta pertenece a otra cuenta.");
      this.store.acceptSynced(
        committed.workspace,
        committed.revision,
        sent,
        sequence,
      );
      this.failures = 0;
      if (this.store.syncSequence() > sequence) this.dirty = true;
      this.status({ phase: "synced" });
    } catch (error) {
      if (!live()) return;
      if (error instanceof SyncHttpError && error.status === 409) {
        this.store.setConnection({
          ...this.store.connection()!,
          revision: null,
        });
        this.dirty = this.failures++ < 2;
        this.status({
          phase: "syncing",
          message: "Comprobando los últimos cambios…",
        });
      } else {
        this.failures = Math.min(this.failures + 1, 4);
        if (error instanceof SyncHttpError && error.status === 401)
          this.store.setConnection({
            ...this.store.connection()!,
            token: null,
          });
        this.status({
          phase:
            error instanceof SyncHttpError
              ? error.status === 401
                ? "expired"
                : "error"
              : error instanceof z.ZodError
                ? "error"
                : "offline",
          message:
            error instanceof z.ZodError
              ? "Los datos recibidos no son compatibles con esta versión. Tus datos locales se conservan."
              : error instanceof SyncHttpError
                ? error.message
                : "Sin conexión disponible. Tus cambios se guardan en este equipo y se enviarán al recuperar la conexión.",
        });
      }
    }
  }
}
