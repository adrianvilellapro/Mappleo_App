ALTER TABLE "Company" ADD COLUMN "faviconUrl" TEXT NOT NULL DEFAULT '';

UPDATE "Company"
SET "faviconUrl" = substring("websiteUrl" from '^https?://[^/?#]+') || '/favicon.ico'
WHERE "websiteUrl" ~ '^https?://[^/?#]+';
