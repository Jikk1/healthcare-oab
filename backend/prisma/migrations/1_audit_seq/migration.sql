-- Monotonic insert-order column for the audit hash-chain.
-- `createdAt` has millisecond precision and ties under bursts, which makes the
-- prev-lookup and verifyChain ordering non-deterministic. `seq` (SERIAL) is
-- strictly increasing and unique, giving the chain a stable total order.
ALTER TABLE "AuditLog" ADD COLUMN "seq" SERIAL NOT NULL;

CREATE INDEX "AuditLog_organizationId_seq_idx" ON "AuditLog"("organizationId", "seq");
