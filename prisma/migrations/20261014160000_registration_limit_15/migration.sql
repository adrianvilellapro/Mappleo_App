ALTER TABLE "RegistrationPolicy" ALTER COLUMN "maxAccounts" SET DEFAULT 15;
-- Lower the original default without deleting users or changing custom limits.
-- Dedicated test databases deliberately use a larger fixture-only policy.
UPDATE "RegistrationPolicy" SET "maxAccounts" = 15
WHERE id = 1 AND "maxAccounts" = 50 AND "accountCount" <= 15;
