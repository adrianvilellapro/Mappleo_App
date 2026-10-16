import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  session,
  shell,
  Menu,
  powerMonitor,
  type IpcMainInvokeEvent,
} from "electron";
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { join, resolve, sep, extname } from "node:path";
import { z } from "zod";
import { LocalStore } from "./store";
import { SyncCoordinator, serverOrigin } from "./sync";
import { LocalFiles, maxDocumentBytes } from "./files";
import { backupSchema } from "../../../../packages/domain/backup";
import { makeCsv } from "../../../../packages/domain/csv";
import { csvSections } from "../../../../packages/domain/csv-sections";
import { publicWebsiteUrl } from "../../../../packages/domain/company-url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "mappleo",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
app.setName("Mappleo");
const development = !app.isPackaged;
const userData =
  process.env.MAPPLEO_DESKTOP_TEST_DATA ??
  join(app.getPath("appData"), development ? "Mappleo-Development" : "Mappleo");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
const devUrl =
  development && process.env.MAPPLEO_DESKTOP_DEV_URL === "http://127.0.0.1:5178"
    ? process.env.MAPPLEO_DESKTOP_DEV_URL
    : undefined;
let window: BrowserWindow | null = null,
  store: LocalStore | undefined;
let dialogBusy = false;
let sync: SyncCoordinator | undefined;
let files: LocalFiles | undefined;
let windowVisibleLogged = false;
const hideTestWindow =
  development &&
  !!process.env.MAPPLEO_DESKTOP_TEST_DATA &&
  process.env.MAPPLEO_DESKTOP_HIDE_WINDOW === "1";

function showMainWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (window.isVisible() && !windowVisibleLogged) {
    windowVisibleLogged = true;
    console.info("[Mappleo] Ventana abierta.");
  }
}

function message(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "Revisa los datos introducidos.";
  if (
    error instanceof Error &&
    !/SQLITE|decrypt|authenticate|Unsupported state|cipher/i.test(error.message)
  )
    return error.message;
  return "No se ha podido completar la operación. Tus datos no se han modificado.";
}
function trusted(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Origen no autorizado.");
  const url = new URL(event.senderFrame.url);
  if (
    !(url.protocol === "mappleo:" && url.host === "app") &&
    !(devUrl && url.origin === devUrl)
  )
    throw new Error("Origen no autorizado.");
}
function handle(channel: string, callback: (...args: unknown[]) => unknown) {
  ipcMain.handle("mappleo:" + channel, async (event, ...args: unknown[]) => {
    try {
      trusted(event);
      return { ok: true, data: await callback(...args) };
    } catch (error) {
      return { ok: false, error: message(error) };
    }
  });
}
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (dialogBusy)
    throw new Error("Termina primero la operación que tienes abierta.");
  dialogBusy = true;
  try {
    return await fn();
  } finally {
    dialogBusy = false;
  }
}
const dateSuffix = () => new Date().toISOString().slice(0, 10);

async function initialize() {
  if (!safeStorage.isEncryptionAvailable() || process.platform !== "win32")
    throw new Error(
      "Esta primera versión necesita la protección de claves de Windows.",
    );
  const keyFile = join(userData, "installation-key.dpapi");
  const database = join(userData, "mappleo.sqlite");
  let key: Buffer;
  if (existsSync(keyFile))
    key = Buffer.from(
      safeStorage.decryptString(readFileSync(keyFile)),
      "base64",
    );
  else {
    if (existsSync(database))
      throw new Error(
        "Falta la clave local de estos datos. No se sobrescribirá la base de datos. Recupera una copia JSON o la clave original.",
      );
    key = randomBytes(32);
    writeFileSync(keyFile, safeStorage.encryptString(key.toString("base64")), {
      flag: "wx",
    });
  }
  store = new LocalStore(userData, key);
  files = new LocalFiles(userData, key);
  key.fill(0);
  // LocalStore owns its own copy; see RecordCipher constructor.
  if (store.profile()) store.backup();
  const createSync = () =>
    new SyncCoordinator(
      store!,
      serverOrigin(development, process.env.MAPPLEO_DESKTOP_SERVER_URL),
      (url) => shell.openExternal(url),
      () => {
        if (window && !window.isDestroyed())
          window.webContents.send("mappleo:changed");
      },
    );
  sync = createSync();
  const root = resolve(__dirname, "renderer");
  protocol.handle("mappleo", async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app" || request.method !== "GET")
      return new Response("Forbidden", { status: 403 });
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep))
      return new Response("Forbidden", { status: 403 });
    try {
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
      };
      return new Response(readFileSync(path), {
        headers: {
          "Content-Type": mime[extname(path)] ?? "application/octet-stream",
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  if (devUrl)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:5178; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
          ],
        },
      }),
    );
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    callback({
      cancel: !(
        ["mappleo:", "devtools:", "data:", "blob:"].includes(url.protocol) ||
        (devUrl && [devUrl, "ws://127.0.0.1:5178"].includes(url.origin))
      ),
    });
  });
  handle("snapshot", () => store!.snapshot());
  handle("files-list", () => {
    if (!store!.profile()) throw new Error("Crea un perfil local.");
    return files!.list();
  });
  handle("files-read", (id) => {
    if (!store!.profile()) throw new Error("Crea un perfil local.");
    return files!.read(z.uuid().parse(id));
  });
  handle("files-update", (id, input) => {
    if (!store!.profile()) throw new Error("Crea un perfil local.");
    files!.update(
      z.uuid().parse(id),
      input,
      new Set(store!.all("offers").map((o) => o.id)),
    );
    return true;
  });
  handle("files-import", (raw) =>
    exclusive(async () => {
      if (!store!.profile()) throw new Error("Crea un perfil local.");
      const category = z.enum(["cv", "letter", "other"]).parse(raw);
      const selection = await dialog.showOpenDialog(window!, {
        title: "Guardar archivo solo en este ordenador",
        filters: [
          {
            name: "PDF, imágenes o texto",
            extensions: ["pdf", "png", "jpg", "jpeg", "txt"],
          },
        ],
        properties: ["openFile"],
      });
      if (selection.canceled) return null;
      const path = selection.filePaths[0],
        stat = statSync(path);
      if (!stat.isFile() || stat.size > maxDocumentBytes)
        throw new Error("Selecciona un documento de hasta 10 MB.");
      return files!.import(path, category, readFileSync(path));
    }),
  );
  handle("files-delete", (raw) =>
    exclusive(async () => {
      if (!store!.profile()) throw new Error("Crea un perfil local.");
      const id = z.uuid().parse(raw),
        item = files!.read(id).document;
      const answer = await dialog.showMessageBox(window!, {
        type: "warning",
        title: "Eliminar archivo local",
        message: `¿Eliminar «${item.name}» y sus enlaces locales?`,
        detail:
          "No se borra el archivo original de tu ordenador ni se modifica nada en la web.",
        buttons: ["Cancelar", "Eliminar"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return false;
      files!.delete(id);
      return true;
    }),
  );
  handle("files-export", (raw) =>
    exclusive(async () => {
      if (!store!.profile()) throw new Error("Crea un perfil local.");
      const item = files!.read(z.uuid().parse(raw));
      const extension = (
        {
          "application/pdf": "pdf",
          "image/png": "png",
          "image/jpeg": "jpg",
          "text/plain": "txt",
        } as const
      )[item.document.mime];
      const selection = await dialog.showSaveDialog(window!, {
        title: "Guardar copia del documento sin cifrar",
        defaultPath:
          item.document.name.replace(/\.[^.]+$/, "") + "." + extension,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (selection.canceled || !selection.filePath) return false;
      writeFileSync(selection.filePath, Buffer.from(item.content, "base64"));
      return true;
    }),
  );
  handle("reset-local", (raw) =>
    exclusive(async () => {
      z.literal("BORRAR LOCAL").parse(raw);
      const answer = await dialog.showMessageBox(window!, {
        type: "warning",
        title: "Borrar el espacio local",
        message:
          "¿Borrar este perfil, sus registros, archivos y copias locales y empezar de cero?",
        detail:
          "No se elimina tu cuenta web ni sus datos. Esta eliminación local no se puede deshacer. Exporta los registros y documentos antes si quieres conservarlos. La revocación del equipo se reintentará si no hay internet.",
        buttons: ["Cancelar", "Borrar solo este equipo"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return false;
      sync!.stop();
      store!.resetLocalProfile();
      files!.reset();
      await session.defaultSession.clearCache();
      await session.defaultSession.clearStorageData();
      sync = createSync();
      sync.start();
      return true;
    }),
  );
  handle("command", (raw) => {
    const result = store!.command(raw);
    sync!.changed();
    return result;
  });
  handle("connect-account", () => sync!.connect());
  handle("disconnect-account", () => sync!.disconnect());
  handle("cancel-connection", () => sync!.cancelConnection());
  handle("network-online", () => {
    sync!.changed();
    return true;
  });
  handle("resolve-conflict", (key, choice) =>
    sync!.resolve(
      z.string().min(1).max(220).parse(key),
      z.enum(["local", "remote"]).parse(choice),
    ),
  );
  handle("folder", async () => {
    const error = await shell.openPath(userData);
    if (error) throw new Error("No se ha podido abrir la carpeta de datos.");
    return true;
  });
  handle("external", async (raw) => {
    const value = z.string().max(2048).parse(raw),
      url = new URL(value);
    if (!publicWebsiteUrl(url))
      throw new Error("Solo se pueden abrir enlaces públicos http o https.");
    return exclusive(async () => {
      const answer = await dialog.showMessageBox(window!, {
        type: "question",
        title: "Abrir enlace externo",
        message:
          "Este enlace se abrirá en tu navegador y puede necesitar internet.",
        detail: url.href,
        buttons: ["Cancelar", "Abrir enlace"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (answer.response !== 1) return false;
      await shell.openExternal(url.href);
      return true;
    });
  });
  handle("import", () =>
    exclusive(async () => {
      const selection = await dialog.showOpenDialog(window!, {
        title: "Importar copia JSON de Mappleo",
        filters: [{ name: "Copia de Mappleo", extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (selection.canceled) return null;
      const file = selection.filePaths[0];
      if (!statSync(file).isFile() || statSync(file).size > 3 * 1024 * 1024)
        throw new Error("Elige un JSON de Mappleo de hasta 3 MB.");
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
      } catch {
        throw new Error("El archivo no contiene un JSON válido.");
      }
      const parsed = backupSchema.parse(raw);
      const answer = await dialog.showMessageBox(window!, {
        title: "Confirmar importación",
        type: "question",
        message: "Se combinarán los datos de esta copia con tu perfil local.",
        detail: `${parsed.companies.length} empresas · ${parsed.offers.length} ofertas · ${parsed.applications.length} candidaturas. No se borrarán tus datos. Los registros existentes más recientes y los eliminados se conservarán.`,
        buttons: ["Cancelar", "Importar"],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return null;
      store!.backup("antes-importar");
      const summary = store!.importBackup(raw);
      sync!.changed();
      return summary;
    }),
  );
  handle("export", (rawFormat, rawSection) =>
    exclusive(async () => {
      const format = z.enum(["json", "csv"]).parse(rawFormat);
      const section = z
        .enum(csvSections.map((s) => s.id))
        .parse(rawSection ?? "companies");
      const answer = await dialog.showMessageBox(window!, {
        type: "warning",
        title: "Exportar datos",
        message: "El archivo exportado contendrá tus datos sin cifrar.",
        detail:
          "Guárdalo en una ubicación privada. Una copia JSON permite trasladar los datos a otro equipo o a la web.",
        buttons: ["Cancelar", "Continuar"],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return false;
      const selection = await dialog.showSaveDialog(window!, {
        title: "Exportar datos",
        defaultPath: `mappleo-${format === "json" ? "backup" : section}-${dateSuffix()}.${format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (selection.canceled || !selection.filePath) return false;
      const data = backupSchema.parse(store!.portableBackup());
      writeFileSync(
        selection.filePath,
        format === "json"
          ? JSON.stringify(data, null, 2)
          : makeCsv(data, section),
        "utf8",
      );
      return true;
    }),
  );
  handle("pdf", () =>
    exclusive(async () => {
      const selection = await dialog.showSaveDialog(window!, {
        title: "Guardar informe de la vista actual (contiene datos personales)",
        defaultPath: `mappleo-informe-${dateSuffix()}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selection.canceled || !selection.filePath) return false;
      const pdf = await window!.webContents.printToPDF({
        printBackground: true,
        pageSize: "A4",
        preferCSSPageSize: true,
      });
      writeFileSync(selection.filePath, pdf);
      return true;
    }),
  );
  window = new BrowserWindow({
    title: "Mappleo",
    width: 1440,
    height: 940,
    minWidth: 850,
    minHeight: 620,
    backgroundColor: "#f8f9fa",
    icon: join(__dirname, "icon.png"),
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: !hideTestWindow,
    },
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (
      url.split("#")[0] !== (devUrl ? devUrl + "/" : "mappleo://app/index.html")
    )
      event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.once("ready-to-show", () => {
    if (!hideTestWindow) showMainWindow();
  });
  window.on("closed", () => {
    window = null;
  });
  await window.loadURL(devUrl ?? "mappleo://app/index.html");
  // Do not depend solely on first paint to reveal the interactive window.
  if (!hideTestWindow) showMainWindow();
  sync.start();
  powerMonitor.on("resume", () => sync?.changed());
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    showMainWindow();
  });
  app
    .whenReady()
    .then(initialize)
    .catch((error) => {
      dialog.showErrorBox("Mappleo no puede abrirse", message(error));
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    sync?.stop();
    sync = undefined;
    files?.close();
    files = undefined;
    store?.close();
    store = undefined;
  });
}
