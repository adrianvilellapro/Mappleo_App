import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const execute = promisify(execFile);

for (const mode of ["start", "dev"]) {
  test(
    `real ${mode} launcher opens a visible window (not just a loaded renderer)`,
    { timeout: 45000, skip: process.platform !== "win32" },
    async () => {
      const directory = mkdtempSync(join(tmpdir(), "mappleo-launcher-test-"));
      const env = { ...process.env, MAPPLEO_DESKTOP_TEST_DATA: directory };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.MAPPLEO_DESKTOP_HIDE_WINDOW;
      delete env.MAPPLEO_DESKTOP_DEV_URL;
      const child = spawn(process.execPath, [`scripts/${mode}.mjs`], {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let output = "";
      const exited = once(child, "exit");
      try {
        await new Promise((resolveReady, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Window was not shown. Output: ${output.slice(-1800)}`,
                ),
              ),
            25000,
          );
          const onData = (chunk) => {
            output += chunk.toString();
            if (output.includes("[Mappleo] Ventana abierta.")) {
              clearTimeout(timer);
              resolveReady();
            }
          };
          child.stdout.on("data", onData);
          child.stderr.on("data", onData);
          child.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.once("exit", (code) => {
            clearTimeout(timer);
            reject(
              new Error(
                `Launcher exited before showing its window (${code}). ${output.slice(-1800)}`,
              ),
            );
          });
        });
        assert.match(output, /\[Mappleo\] Ventana abierta\./);
        // Close only the Electron GUI created by THIS launcher, allowing SQLite to close.
        const script = `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${child.pid}" | Where-Object { $_.Name -eq 'electron.exe' } | ForEach-Object { (Get-Process -Id $_.ProcessId).CloseMainWindow() | Out-Null }`;
        await execute(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
          ],
          { windowsHide: true, timeout: 10000 },
        );
        const [code] = await Promise.race([
          exited,
          new Promise((_, reject) => {
            const timer = setTimeout(
              () =>
                reject(
                  new Error("Launcher did not exit after closing its GUI."),
                ),
              6000,
            );
            timer.unref();
          }),
        ]);
        assert.equal(code, 0);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          // Test-owned process tree only; never terminate an existing user instance.
          await execute(
            "taskkill.exe",
            ["/PID", String(child.pid), "/T", "/F"],
            { windowsHide: true },
          ).catch(() => {});
          await exited;
        }
        if (
          !resolve(directory).startsWith(
            resolve(tmpdir()) + "\\mappleo-launcher-test-",
          )
        )
          throw new Error("Unexpected temporary directory.");
        rmSync(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200,
        });
      }
    },
  );
}
