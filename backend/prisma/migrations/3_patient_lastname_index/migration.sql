-- Blind index for exact-match search over the encrypted last name.
-- Backfill of existing rows: scripts/backfill-lastname-index.ts (needs the PHI key).
ALTER TABLE "patients" ADD COLUMN "lastNameIndex" TEXT;

CREATE INDEX "patients_organizationId_lastNameIndex_idx" ON "patients"("organizationId", "lastNameIndex");
