import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { taskEnvironment } from "./task-environment";
const { file, test } = taskEnvironment();
let contents = readFileSync(file, "utf8");
const values = {
  REGISTRATION_CODE:
    process.env.REGISTRATION_CODE || randomBytes(32).toString("base64url"),
  ACCOUNT_LIMIT_CEILING:
    process.env.ACCOUNT_LIMIT_CEILING || (test ? "100000" : "15"),
};
if (
  values.REGISTRATION_CODE.length < 24 ||
  values.REGISTRATION_CODE.length > 128
)
  throw new Error("El código privado debe tener de 24 a 128 caracteres.");
for (const [key, value] of Object.entries(values)) {
  const line = key + "=" + value;
  const pattern = new RegExp("^" + key + "=.*$", "m");
  contents = pattern.test(contents)
    ? contents.replace(pattern, () => line)
    : contents.trimEnd() + "\n" + line + "\n";
}
writeFileSync(file, contents, { mode: 0o600 });
console.log(
  "Código de registro y techo de cuentas preparados en el archivo privado, sin mostrar secretos.",
);
