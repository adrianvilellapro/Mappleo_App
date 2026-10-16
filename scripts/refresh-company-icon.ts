import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { discoverCompanyIcon } from "../lib/company-icons";
import { sameWebsiteHost } from "../lib/company-icon-url";
import { encryptClient } from "../lib/db/encrypted-client";

const domain = process.argv[2]?.trim().toLowerCase();
if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
  throw new Error(
    "Uso: npx.cmd tsx scripts/refresh-company-icon.ts metaenlace.com",
  );
const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? new URL(databaseUrl) : null;
if (
  !database ||
  database.pathname !== "/mappleo" ||
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  database.port !== "5433"
)
  throw new Error("Esta herramienta solo puede usar la base local mappleo.");

const db = encryptClient(
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  }),
);
try {
  const candidates = await db.company.findMany({
    select: { id: true, websiteUrl: true, faviconUrl: true },
  });
  let refreshed = 0;
  let unchanged = 0;
  for (const company of candidates) {
    let host = "";
    try {
      host = new URL(company.websiteUrl).hostname;
    } catch {
      continue;
    }
    if (!sameWebsiteHost(host, domain)) continue;
    const icon = await discoverCompanyIcon(company.websiteUrl);
    if (icon && icon !== company.faviconUrl) {
      await db.company.update({
        where: { id: company.id },
        data: { faviconUrl: icon },
      });
      refreshed++;
    } else unchanged++;
  }
  console.log({ refreshed, unchanged });
} finally {
  await db.$disconnect();
}
