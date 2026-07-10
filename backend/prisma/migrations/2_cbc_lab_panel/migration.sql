-- CBC analytes get typed columns (the OmniRisk engine consumes them), and the
-- complete raw lab panel is preserved as JSON so nothing a clinician enters
-- is ever dropped, even analytes without a dedicated column.
ALTER TABLE "biomarker_sets"
  ADD COLUMN "hemoglobin"  DOUBLE PRECISION,
  ADD COLUMN "hematocrit"  DOUBLE PRECISION,
  ADD COLUMN "wbc"         DOUBLE PRECISION,
  ADD COLUMN "platelets"   DOUBLE PRECISION,
  ADD COLUMN "neutrophils" DOUBLE PRECISION,
  ADD COLUMN "lymphocytes" DOUBLE PRECISION,
  ADD COLUMN "esr"         DOUBLE PRECISION,
  ADD COLUMN "labPanel"    JSONB;
