-- CF10 only. No backfill, no mutation of EnvWaste or the valued/approved stock.
-- References preserve the existing RECYCLING_CATALOG keys and instance scope.
CREATE TABLE "EnvRecyclingMaterialBinding" (
  "instanceId" TEXT NOT NULL REFERENCES "ConfiguracaoInstancia"(id) ON DELETE RESTRICT,
  "materialKey" TEXT NOT NULL CHECK ("materialKey" ~ '^RECYCLING_CATALOG:materials:'),
  "typeKey" TEXT NOT NULL CHECK ("typeKey" ~ '^RECYCLING_CATALOG:types:'),
  "unitKey" TEXT NOT NULL CHECK ("unitKey" ~ '^RECYCLING_CATALOG:units:'),
  PRIMARY KEY ("instanceId", "materialKey"),
  CONSTRAINT "EnvRecyclingMaterialBinding_keys" UNIQUE ("instanceId", "materialKey", "typeKey", "unitKey"),
  FOREIGN KEY ("instanceId", "materialKey") REFERENCES "ConfiguracaoParametroInstancia"("configuracaoInstanciaId", chave) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("instanceId", "typeKey") REFERENCES "ConfiguracaoParametroInstancia"("configuracaoInstanciaId", chave) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("instanceId", "unitKey") REFERENCES "ConfiguracaoParametroInstancia"("configuracaoInstanciaId", chave) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE "EnvRecyclingStock" (
  "instanceId" TEXT NOT NULL,
  "materialKey" TEXT NOT NULL,
  "depotKey" TEXT NOT NULL CHECK ("depotKey" ~ '^RECYCLING_CATALOG:depots:'),
  "typeKey" TEXT NOT NULL, "unitKey" TEXT NOT NULL,
  quantity NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  PRIMARY KEY ("instanceId", "materialKey", "depotKey"),
  FOREIGN KEY ("instanceId", "materialKey", "typeKey", "unitKey") REFERENCES "EnvRecyclingMaterialBinding"("instanceId", "materialKey", "typeKey", "unitKey") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("instanceId", "depotKey") REFERENCES "ConfiguracaoParametroInstancia"("configuracaoInstanciaId", chave) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "EnvRecyclingStock_depot_idx" ON "EnvRecyclingStock"("instanceId", "depotKey");
CREATE TABLE "EnvRecyclingMovement" (
  id TEXT PRIMARY KEY,
  "instanceId" TEXT NOT NULL, "materialKey" TEXT NOT NULL, "depotKey" TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ENTRY','EXIT')),
  quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  "quantityBefore" NUMERIC(18,3) NOT NULL CHECK ("quantityBefore" >= 0),
  "quantityAfter" NUMERIC(18,3) NOT NULL CHECK ("quantityAfter" >= 0),
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  "destinationKey" TEXT CHECK ("destinationKey" ~ '^RECYCLING_CATALOG:centers:'),
  origin TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  snapshot JSONB NOT NULL,
  "occurredOn" DATE NOT NULL,
  "actorUsuarioId" TEXT NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[0-9a-f]{64}$'),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "EnvRecyclingMovement_request" UNIQUE ("instanceId", "idempotencyKey"),
  CONSTRAINT "EnvRecyclingMovement_sequence" UNIQUE ("instanceId", "materialKey", "depotKey", sequence),
  FOREIGN KEY ("instanceId", "materialKey", "depotKey") REFERENCES "EnvRecyclingStock"("instanceId", "materialKey", "depotKey") ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY ("instanceId", "destinationKey") REFERENCES "ConfiguracaoParametroInstancia"("configuracaoInstanciaId", chave) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((kind='ENTRY' AND "destinationKey" IS NULL AND length(trim(origin))>0 AND amount=0 AND "quantityAfter"="quantityBefore"+quantity)
      OR (kind='EXIT' AND "destinationKey" IS NOT NULL AND origin='' AND "quantityAfter"="quantityBefore"-quantity))
);
CREATE INDEX "EnvRecyclingMovement_history_idx" ON "EnvRecyclingMovement"("instanceId", "occurredOn", "createdAt", id);
CREATE INDEX "EnvRecyclingMovement_stock_idx" ON "EnvRecyclingMovement"("instanceId", "materialKey", "depotKey", sequence);
CREATE FUNCTION cf10_recycling_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de reciclagem não permite alteração ou exclusão.';
END;
$$;
CREATE TRIGGER "EnvRecyclingMovement_immutable" BEFORE UPDATE OR DELETE ON "EnvRecyclingMovement"
FOR EACH ROW EXECUTE FUNCTION cf10_recycling_movement_immutable();
