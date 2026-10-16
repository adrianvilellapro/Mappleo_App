import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env"))
  throw new Error("Copia .env.example a .env antes de continuar.");
const content = readFileSync(".env", "utf8");
if (!/^AUTH_SECRET=.+/m.test(content))
  appendFileSync(
    ".env",
    "\nAUTH_SECRET=" + randomBytes(48).toString("hex") + "\n",
  );
if (!/^NEXTAUTH_URL=/m.test(content))
  appendFileSync(".env", "NEXTAUTH_URL=https://localhost:3000\n");
console.log("Configuración local preparada. El secreto permanece en .env.");
