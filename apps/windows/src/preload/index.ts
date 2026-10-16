import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/contracts";

// No raw ipcRenderer, filesystem, secrets or dynamic channel exposed to React.
const api: DesktopAPI = {
  listDocuments: () => ipcRenderer.invoke("mappleo:files-list"),
  importDocument: (category) =>
    ipcRenderer.invoke("mappleo:files-import", category),
  readDocument: (id) => ipcRenderer.invoke("mappleo:files-read", id),
  updateDocument: (id, input) =>
    ipcRenderer.invoke("mappleo:files-update", id, input),
  deleteDocument: (id) => ipcRenderer.invoke("mappleo:files-delete", id),
  exportDocument: (id) => ipcRenderer.invoke("mappleo:files-export", id),
  resetLocalProfile: (confirmation) =>
    ipcRenderer.invoke("mappleo:reset-local", confirmation),
  connectAccount: () => ipcRenderer.invoke("mappleo:connect-account"),
  disconnectAccount: () => ipcRenderer.invoke("mappleo:disconnect-account"),
  cancelConnection: () => ipcRenderer.invoke("mappleo:cancel-connection"),
  connectionAvailable: () => ipcRenderer.invoke("mappleo:network-online"),
  resolveConflict: (key, choice) =>
    ipcRenderer.invoke("mappleo:resolve-conflict", key, choice),
  onChange: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("mappleo:changed", listener);
    return () => ipcRenderer.removeListener("mappleo:changed", listener);
  },
  snapshot: () => ipcRenderer.invoke("mappleo:snapshot"),
  command: (command) => ipcRenderer.invoke("mappleo:command", command),
  importBackup: () => ipcRenderer.invoke("mappleo:import"),
  exportFile: (format, section) =>
    ipcRenderer.invoke("mappleo:export", format, section),
  exportPdf: () => ipcRenderer.invoke("mappleo:pdf"),
  openExternal: (url) => ipcRenderer.invoke("mappleo:external", url),
  openDataFolder: () => ipcRenderer.invoke("mappleo:folder"),
};
contextBridge.exposeInMainWorld("mappleo", api);
