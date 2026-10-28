import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Isolated PostgreSQL fixture for procurement exports/invitation evidence only. */
export async function createProcurementDrizzleFixture(input: { connectionStatus?: string; resultReady?: boolean } = {}) {
  const local = await createLocalDrizzleDatabase();
  const pg = local.database;
  try {
    await pg.exec(`
      CREATE TABLE "Usuario" (id text PRIMARY KEY);
      INSERT INTO "Usuario" VALUES ('buyer-1');
      CREATE TABLE "AuditEvent" (id text PRIMARY KEY, "eventType" text NOT NULL, "targetType" text NOT NULL, "targetId" text NOT NULL, "actorUsuarioId" text NOT NULL REFERENCES "Usuario", "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "ProtocolNotification" (id text PRIMARY KEY, "userId" text NOT NULL REFERENCES "Usuario", "processId" text, "sourceModule" text NOT NULL, "entityType" text NOT NULL, "entityId" text NOT NULL, type text NOT NULL, title text NOT NULL, message text NOT NULL, priority text NOT NULL, "dedupeKey" text, "readAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX notification_dedupe ON "ProtocolNotification" ("userId", "dedupeKey") WHERE "dedupeKey" IS NOT NULL;
      CREATE TABLE "IntegrationConnection" (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL, provider text NOT NULL, environment text NOT NULL, status text NOT NULL, "baseUrl" text, "credentialReference" text, configuration jsonb, "mockScenario" jsonb, "lastTestedAt" timestamp(3), "lastTestStatus" text, "lastTestMessage" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "IntegrationRun" (id text PRIMARY KEY, "connectionId" text NOT NULL REFERENCES "IntegrationConnection", operation text NOT NULL, environment text NOT NULL, status text NOT NULL, message text NOT NULL, "externalId" text, payload jsonb, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseProcess" (id text PRIMARY KEY, number text NOT NULL UNIQUE, object text NOT NULL, type text NOT NULL, modality text, "estimatedValue" double precision, status text NOT NULL DEFAULT 'Em Planejamento', "secretariatId" text NOT NULL, "purchaseRequestId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "PurchaseProcessItem" (id text PRIMARY KEY, "purchaseProcessId" text NOT NULL REFERENCES "PurchaseProcess", "catalogItemId" text, "customName" text, quantity double precision NOT NULL, "estimatedUnitValue" double precision, "materialId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "CatalogItem" (id text PRIMARY KEY, name text NOT NULL, unit text NOT NULL);
      CREATE TABLE "Material" (id text PRIMARY KEY, name text NOT NULL, "unitOfMeasure" text NOT NULL);
      CREATE TABLE "Bidding" (id text PRIMARY KEY, number text NOT NULL UNIQUE, modality text NOT NULL, status text NOT NULL, "publicationDate" timestamp(3), "sessionDate" timestamp(3), "processId" text NOT NULL REFERENCES "PurchaseProcess", "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "BiddingLot" (id text PRIMARY KEY, "biddingId" text NOT NULL REFERENCES "Bidding", number integer NOT NULL, description text, status text NOT NULL, "estimatedValueDecimal" numeric(18,2), "preliminaryTechnicalStudyId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "BiddingParticipant" (id text PRIMARY KEY, "biddingId" text NOT NULL REFERENCES "Bidding", "supplierId" text NOT NULL, "displayCode" text, status text NOT NULL DEFAULT 'Inscrito', "registeredAt" timestamp(3) NOT NULL DEFAULT now(), notes text, "preliminaryTechnicalStudyId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "BiddingResult" (id text PRIMARY KEY, "biddingLotId" text NOT NULL REFERENCES "BiddingLot", "participantId" text NOT NULL REFERENCES "BiddingParticipant", "biddingBidId" text, "biddingActId" text, status text NOT NULL, reason text, "unitValueDecimal" numeric(18,2), "totalValueDecimal" numeric(18,2) NOT NULL, "isCurrent" boolean NOT NULL DEFAULT true, "decidedByUsuarioId" text NOT NULL, "decidedAt" timestamp(3) NOT NULL DEFAULT now(), "idempotencyKey" text NOT NULL UNIQUE, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "BudgetUnit" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL);
      CREATE TABLE "Contract" (id text PRIMARY KEY, number text NOT NULL UNIQUE, object text NOT NULL, "initialValue" double precision NOT NULL, "updatedValue" double precision NOT NULL, "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL, status text NOT NULL, "processId" text NOT NULL REFERENCES "PurchaseProcess", "supplierId" text NOT NULL, "secretariatId" text NOT NULL, "sourceBudgetUnitId" text, "managerId" text, "inspectorId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "ContractAmendment" (id text PRIMARY KEY, type text NOT NULL, justification text NOT NULL, "previousValue" double precision, "newValue" double precision, "previousEndDate" timestamp(3), "newEndDate" timestamp(3), status text NOT NULL, "contractId" text NOT NULL REFERENCES "Contract", "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "Person" (id text PRIMARY KEY, "fullName" text NOT NULL);
      CREATE TABLE "Company" (id text PRIMARY KEY, "tradeName" text, "corporateName" text NOT NULL);
      CREATE TABLE "Supplier" (id text PRIMARY KEY, "personId" text, "companyId" text);
      CREATE TABLE "PriceResearch" (id text PRIMARY KEY, "processId" text NOT NULL REFERENCES "PurchaseProcess");
      CREATE TABLE "PriceQuote" (id text PRIMARY KEY, "researchId" text NOT NULL REFERENCES "PriceResearch", "supplierId" text NOT NULL REFERENCES "Supplier", status text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      INSERT INTO "PurchaseProcess" (id, number, object, type, modality, "estimatedValue", "secretariatId", "updatedAt") VALUES ('process-1', 'PROC-2026-001', 'Aquisicao POC', 'COMPRA', 'PREGAO', 1000, 'secretariat-1', '2026-09-19 12:00:00');
      INSERT INTO "Bidding" (id, number, modality, status, "processId", "updatedAt") VALUES ('bidding-1', 'LIC-2026-001', 'PREGAO', 'HOMOLOGADA', 'process-1', '2026-09-19 12:00:00');
      INSERT INTO "BiddingLot" (id, "biddingId", number, description, status, "estimatedValueDecimal") VALUES ('lot-1', 'bidding-1', 1, 'Lote POC', 'HOMOLOGADO', 1000);
      INSERT INTO "BiddingParticipant" (id, "biddingId", "supplierId", "displayCode") VALUES ('participant-1', 'bidding-1', 'supplier-1', 'SUPPLIER-1');
      INSERT INTO "Company" VALUES ('company-1', 'Fornecedor POC', 'Fornecedor POC LTDA');
      INSERT INTO "Supplier" VALUES ('supplier-1', NULL, 'company-1');
      INSERT INTO "PriceResearch" VALUES ('research-1', 'process-1');
      INSERT INTO "PriceQuote" (id, "researchId", "supplierId", status) VALUES ('quote-1', 'research-1', 'supplier-1', 'CONVITE_PENDENTE');
    `);
    await pg.query(`INSERT INTO "IntegrationConnection" (id, code, name, category, provider, environment, status, "credentialReference", configuration) VALUES ('pncp-connection', 'PNCP', 'PNCP', 'COMPRAS', 'PNCP', 'MOCK', $1, 'secret://integracoes/pncp', $2::jsonb)`, [input.connectionStatus ?? "ATIVA", JSON.stringify({ layout: { code: "PNCP-CONTRATACOES", version: "2026.1", specificationReference: "https://example.test/pncp/contract" }, operations: ["PROCUREMENT", "PROCEDURE_RESULT", "CONTRACT"] })]);
    if (input.resultReady) await pg.exec(`INSERT INTO "BiddingResult" (id, "biddingLotId", "participantId", status, "totalValueDecimal", "unitValueDecimal", "decidedByUsuarioId", "idempotencyKey") VALUES ('result-1', 'lot-1', 'participant-1', 'HOMOLOGADO', 1000, 10, 'buyer-1', 'result-1')`);
    return {
      pg,
      connection: local.connection,
      async runs() { return (await pg.query<{ id: string; payload: Record<string, unknown> }>('SELECT id, payload FROM "IntegrationRun" ORDER BY "createdAt", id')).rows; },
      async audits() { return (await pg.query<{ eventType: string }>('SELECT "eventType" FROM "AuditEvent"')).rows; },
      close: local.close,
    };
  } catch (error) { await local.close(); throw error; }
}
