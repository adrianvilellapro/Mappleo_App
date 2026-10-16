import { spawn } from "node:child_process";
import electron from "electron";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], {
  env,
  stdio: "inherit",
  // Electron is the interactive application, not a hidden background helper.
  // SW_HIDE can suppress its first BrowserWindow.show() on Windows.
  windowsHide: false,
});
child.on("error", () => {
  console.error(
    "No se ha podido iniciar Electron. Ejecuta npm.cmd run desktop:install y vuelve a intentarlo.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(code ?? 1));
