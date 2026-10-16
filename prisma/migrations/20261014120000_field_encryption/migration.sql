-- Populated transactionally by encryption:prepare before serving requests.
ALTER TABLE "User" ADD COLUMN "emailLookup" TEXT;
CREATE UNIQUE INDEX "User_emailLookup_key" ON "User"("emailLookup");
