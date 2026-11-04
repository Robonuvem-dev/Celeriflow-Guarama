import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  buildPlanningUpstreamContext,
  listAiSuggestionLogsForPlanning,
  listInternalPhaseDocumentVersions,
  listInternalPhaseMonitoringItems,
  recordAiSuggestionDecision,
  recordInternalPhaseDocumentVersion,
  transitionInternalPhaseDocumentStatus,
} from "../src/db/repositories/procurement/internal-phase-documents";
import { recordDemandVersion } from "../src/db/repositories/procurement/purchase-demand";
import type { DatabaseExecutor } from "../src/db/transaction";
import {
  buildInheritedEtpPayload,
  buildInheritedPcaPayload,
  buildInheritedTrPayload,
  generateAssistiveSuggestions,
  getCf30GovernanceAndWarrantyDescriptor,
} from "../src/lib/compras/internal-phase-documents";

async function createCf30Fixture() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE "CatalogItem" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT,
      "name" TEXT NOT NULL,
      "unit" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE "ObjectivePPA" (
      "id" TEXT PRIMARY KEY,
      "code" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "Department" (
      "id" TEXT PRIMARY KEY,
      "name" TEXT NOT NULL,
      "secretariatId" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "PurchaseRequest" (
      "id" TEXT PRIMARY KEY,
      "number" TEXT NOT NULL UNIQUE,
      "object" TEXT NOT NULL,
      "justification" TEXT NOT NULL,
      "estimatedValue" DOUBLE PRECISION,
      "status" TEXT NOT NULL DEFAULT 'Aprovada',
      "priority" TEXT NOT NULL DEFAULT 'Normal',
      "secretariatId" TEXT NOT NULL,
      "departmentId" TEXT NOT NULL,
      "requesterId" TEXT NOT NULL,
      "approvedByEmployeeId" TEXT,
      "approvedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "PurchasePlanning" (
      "id" TEXT PRIMARY KEY,
      "description" TEXT,
      "catalogItemId" TEXT,
      "originPurchaseRequestId" TEXT,
      "unit" TEXT NOT NULL,
      "quantity" DOUBLE PRECISION NOT NULL,
      "expectedPeriodStart" DATE NOT NULL,
      "expectedPeriodEnd" DATE NOT NULL,
      "estimatedValueDecimal" NUMERIC(18, 2) NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'Planejado',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE "DocumentVersion" (
      "id" TEXT PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "versionNumber" INTEGER NOT NULL DEFAULT 1,
      "status" TEXT NOT NULL DEFAULT 'SIGNED'
    );
  `);
  await pg.exec(await readFile("db/migrations/20261103130000_cf30_demand_versions/migration.sql", "utf8"));
  await pg.exec(await readFile("db/migrations/20261103140000_cf30_demand_workflow/migration.sql", "utf8"));
  await pg.exec(await readFile("db/migrations/20261103150000_cf30_pca_objectives/migration.sql", "utf8"));
  await pg.exec(await readFile("db/migrations/20261103170000_cf30_internal_phase_documents/migration.sql", "utf8"));

  await pg.exec(`
    INSERT INTO "CatalogItem" ("id", "code", "name", "unit") VALUES ('cat-1', 'MAT-01', 'Notebook Corporativo', 'un');
    INSERT INTO "ObjectivePPA" ("id", "code", "description") VALUES ('obj-1', 'PPA-2026-01', 'Modernização Administrativa');
    INSERT INTO "Department" ("id", "name", "secretariatId") VALUES ('dep-ti', 'Diretoria de TI', 'sec-adm');
    INSERT INTO "PurchaseRequest" ("id", "number", "object", "justification", "estimatedValue", "status", "secretariatId", "departmentId", "requesterId", "approvedAt")
      VALUES ('req-1', 'SOL-2026/001', 'Aquisição de Notebooks Corporativos', 'Substituição de parque tecnológico defasado', 45000, 'Aprovada', 'sec-adm', 'dep-ti', 'emp-1', '2026-10-01T10:00:00Z');
    INSERT INTO "PurchasePlanning" ("id", "description", "catalogItemId", "originPurchaseRequestId", "objectiveId", "unit", "quantity", "expectedPeriodStart", "expectedPeriodEnd", "estimatedValueDecimal", "status")
      VALUES ('plan-1', 'Notebooks 16GB RAM SSD 512GB', 'cat-1', 'req-1', 'obj-1', 'un', 10, '2026-11-15', '2026-12-20', 45000.00, 'Planejado');
    INSERT INTO "DocumentVersion" ("id", "documentId", "versionNumber", "status")
      VALUES ('ged-pca-1', 'doc-pca', 1, 'FINAL'), ('ged-etp-1', 'doc-etp', 1, 'SIGNED'), ('ged-tr-1', 'doc-tr', 1, 'SIGNED');
  `);

  const db = drizzle(pg) as unknown as DatabaseExecutor;
  return { pg, db };
}

test("CF30 30.3, 30.5, 30.6, 30.8 & 30.12 elaborates PCA, ETP and TR with DFD inheritance, GED links, coherence checks and segregation of duties", async () => {
  const { pg, db } = await createCf30Fixture();
  try {
    await recordDemandVersion(db, "req-1", "analista-demanda", 0, {
      number: "SOL-2026/001",
      object: "Aquisição de Notebooks Corporativos",
      justification: "Substituição de parque tecnológico defasado",
      secretariat: "Administração",
      department: "Diretoria de TI",
      requester: "Servidor TI",
      priority: "Alta",
      status: "Aprovada",
      createdAt: "2026-10-01T09:00:00Z",
      approvedAt: "2026-10-01T10:00:00Z",
      estimatedValue: 45000,
      items: [{ id: "it-1", name: "Notebook Corporativo", quantity: 10, estimatedUnitValue: 4500 }],
      planning: [{ id: "plan-1", name: "Notebook Corporativo", status: "Planejado" }],
    });

    const ctx1 = await buildPlanningUpstreamContext(db, "plan-1");
    assert.ok(ctx1);
    assert.equal(ctx1.latestDfdVersion?.version, 1);

    const pcaPayload = buildInheritedPcaPayload(ctx1);
    const pcaV1 = await recordInternalPhaseDocumentVersion(db, {
      planningId: "plan-1",
      documentType: "PCA",
      expectedVersion: 0,
      actorId: "autor-pca",
      rawPayload: pcaPayload,
      gedDocumentVersionId: "ged-pca-1",
    });
    assert.equal(pcaV1.version, 1);
    assert.equal(pcaV1.gedDocumentVersionId, "ged-pca-1");
    assert.equal(pcaV1.coherenceReport.coherent, true);

    const etpPayload = buildInheritedEtpPayload(ctx1);
    const etpV1 = await recordInternalPhaseDocumentVersion(db, {
      planningId: "plan-1",
      documentType: "ETP",
      expectedVersion: 0,
      actorId: "autor-etp",
      rawPayload: etpPayload,
      gedDocumentVersionId: "ged-etp-1",
    });
    assert.equal(etpV1.version, 1);
    assert.equal(etpV1.coherenceReport.coherent, true);

    // Reject stale optimistic version
    await assert.rejects(
      recordInternalPhaseDocumentVersion(db, {
        planningId: "plan-1",
        documentType: "ETP",
        expectedVersion: 0,
        actorId: "outro",
        rawPayload: etpPayload,
      }),
      /atualizado por outro usuário/,
    );

    // Workflow transition with segregation of duties
    await transitionInternalPhaseDocumentStatus(db, {
      versionId: etpV1.id,
      actorId: "autor-etp",
      targetStatus: "EM_ANALISE",
      reason: "Encaminhamento do ETP para aprovação técnica",
    });
    await assert.rejects(
      transitionInternalPhaseDocumentStatus(db, {
        versionId: etpV1.id,
        actorId: "autor-etp",
        targetStatus: "APROVADO",
        reason: "Autoaprovação indevida",
      }),
      /Segregação de funções/,
    );
    const approvedEtp = await transitionInternalPhaseDocumentStatus(db, {
      versionId: etpV1.id,
      actorId: "gestor-compras",
      targetStatus: "APROVADO",
      reason: "ETP aderente ao art. 18, § 1º da Lei 14.133/2021",
    });
    assert.equal(approvedEtp.status, "APROVADO");

    // Elaborate TR inheriting from DFD + approved ETP
    const ctx2 = await buildPlanningUpstreamContext(db, "plan-1");
    assert.ok(ctx2?.latestEtpVersion);
    assert.equal(ctx2.latestEtpVersion.status, "APROVADO");

    const trPayload = buildInheritedTrPayload(ctx2);
    const trV1 = await recordInternalPhaseDocumentVersion(db, {
      planningId: "plan-1",
      documentType: "TR",
      expectedVersion: 0,
      actorId: "autor-tr",
      rawPayload: trPayload,
      gedDocumentVersionId: "ged-tr-1",
    });
    assert.equal(trV1.version, 1);
    assert.equal(trV1.sourceEtpVersionId, etpV1.id);
    assert.equal(trV1.coherenceReport.coherent, true);

    // Verify coherence detection when ETP value diverges from planning
    const divergentEtp = await recordInternalPhaseDocumentVersion(db, {
      planningId: "plan-1",
      documentType: "ETP",
      expectedVersion: 1,
      actorId: "autor-etp",
      rawPayload: { ...etpPayload, estimatedTotalValueBrl: "52000.00" },
    });
    assert.equal(divergentEtp.version, 2);
    assert.equal(divergentEtp.coherenceReport.coherent, false);
    assert.ok(divergentEtp.coherenceReport.warnings.some(w => w.includes("Divergência de valor estimado")));

    const allEtpVersions = await listInternalPhaseDocumentVersions(db, "plan-1", "ETP");
    assert.equal(allEtpVersions.length, 2);

    const monitoringItems = await listInternalPhaseMonitoringItems(db, 2026);
    assert.equal(monitoringItems.length, 1);
    assert.equal(monitoringItems[0].hasDfd, true);
    assert.equal(monitoringItems[0].gedLinkedCount, 3);
  } finally {
    await pg.close();
  }
});

test("CF30 30.2 & 30.11 generates assistive AI suggestions and enforces human validation logging", async () => {
  const { pg, db } = await createCf30Fixture();
  try {
    const ctx = await buildPlanningUpstreamContext(db, "plan-1");
    assert.ok(ctx);

    const etpSuggestions = generateAssistiveSuggestions(ctx, "ETP");
    assert.ok(etpSuggestions.length >= 4);

    // Reject EDITADA when text was not modified by human
    await assert.rejects(
      recordAiSuggestionDecision(db, {
        planningId: "plan-1",
        documentType: "ETP",
        fieldKey: etpSuggestions[0].fieldKey,
        suggestionType: etpSuggestions[0].suggestionType,
        suggestedText: etpSuggestions[0].suggestedText,
        decision: "EDITADA",
        finalText: etpSuggestions[0].suggestedText,
        actorId: "servidor-1",
      }),
      /altere o texto sugerido/,
    );

    const accepted = await recordAiSuggestionDecision(db, {
      planningId: "plan-1",
      documentType: "ETP",
      fieldKey: etpSuggestions[0].fieldKey,
      suggestionType: etpSuggestions[0].suggestionType,
      suggestedText: etpSuggestions[0].suggestedText,
      decision: "ACEITA",
      finalText: etpSuggestions[0].suggestedText,
      justification: "Redação compatível com a necessidade técnica",
      actorId: "servidor-1",
    });
    assert.equal(accepted.decision, "ACEITA");

    const edited = await recordAiSuggestionDecision(db, {
      planningId: "plan-1",
      documentType: "ETP",
      fieldKey: etpSuggestions[1].fieldKey,
      suggestionType: etpSuggestions[1].suggestionType,
      suggestedText: etpSuggestions[1].suggestedText,
      decision: "EDITADA",
      finalText: `${etpSuggestions[1].suggestedText} — Complementado pela equipe de TI.`,
      justification: "Ajuste fino na memória de cálculo",
      actorId: "servidor-1",
    });
    assert.equal(edited.decision, "EDITADA");

    const logs = await listAiSuggestionLogsForPlanning(db, "plan-1");
    assert.equal(logs.length, 2);
  } finally {
    await pg.close();
  }
});

test("CF30 30.13 & 30.14 validates concurrent operations performance and 12-month warranty governance metadata", async () => {
  const descriptor = getCf30GovernanceAndWarrantyDescriptor();
  assert.equal(descriptor.warrantyAndSupport.warrantyMonths, 12);
  assert.match(descriptor.legalFramework.primaryLaw, /14\.133/);
  assert.ok(descriptor.warrantyAndSupport.includedServices.length >= 4);

  const { pg, db } = await createCf30Fixture();
  try {
    const startMs = Date.now();
    const ctx = await buildPlanningUpstreamContext(db, "plan-1");
    assert.ok(ctx);
    const suggestion = generateAssistiveSuggestions(ctx, "PCA")[0];

    await Promise.all(
      Array.from({ length: 10 }, (_, idx) =>
        recordAiSuggestionDecision(db, {
          planningId: "plan-1",
          documentType: "PCA",
          fieldKey: `field-${idx}`,
          suggestionType: suggestion.suggestionType,
          suggestedText: suggestion.suggestedText,
          decision: "ACEITA",
          finalText: suggestion.suggestedText,
          actorId: `user-${idx}`,
        }),
      ),
    );
    const elapsedMs = Date.now() - startMs;
    assert.ok(elapsedMs < 5000, `Expected concurrent persistence under 5000ms, got ${elapsedMs}ms`);
    const logs = await listAiSuggestionLogsForPlanning(db, "plan-1");
    assert.equal(logs.length, 10);
  } finally {
    await pg.close();
  }
});

