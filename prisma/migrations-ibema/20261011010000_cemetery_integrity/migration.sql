-- Additive integrity for Cemeteries. Legacy rows are preserved for directed regularization.
ALTER TABLE "TaxGrave" ADD CONSTRAINT "TaxGrave_capacity_occupancy_check"
  CHECK ("capacity" > 0 AND "occupantCount" >= 0 AND "occupantCount" <= "capacity") NOT VALID;
ALTER TABLE "CemeteryLot" ADD CONSTRAINT "CemeteryLot_limit_check"
  CHECK ("graveLimit" > 0) NOT VALID;
ALTER TABLE "CemeteryOssuary" ADD CONSTRAINT "CemeteryOssuary_capacity_occupancy_check"
  CHECK ("capacity" > 0 AND "occupantCount" >= 0 AND "occupantCount" <= "capacity") NOT VALID;
ALTER TABLE "CemeteryIdentificationField" ADD CONSTRAINT "CemeteryIdentificationField_kind_check"
  CHECK ("targetType" IN ('LOTE', 'SEPULTURA') AND "valueType" IN ('DESCRITIVO', 'NUMERICO')) NOT VALID;
ALTER TABLE "CemeteryAttachment" ADD CONSTRAINT "CemeteryAttachment_target_check"
  CHECK ("targetType" IN ('LOTE', 'SEPULTURA', 'SEPULTAMENTO', 'VELORIO', 'CREMACAO')) NOT VALID;

CREATE OR REPLACE FUNCTION cemetery_history_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Histórico de cemitérios é imutável.';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cemetery_history_append_only BEFORE UPDATE OR DELETE ON "CemeteryChangeHistory"
  FOR EACH ROW EXECUTE FUNCTION cemetery_history_append_only();

CREATE INDEX "CemeteryProcess_performedAt_id_idx" ON "CemeteryProcess" ("performedAt", "id");
