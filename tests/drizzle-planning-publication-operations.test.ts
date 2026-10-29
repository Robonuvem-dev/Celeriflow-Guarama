import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as mappings from "../src/db/schema/planning-publication-operations";
import type { PlanningPublicationConnectionContext } from "../src/lib/contracts/planning-publication-operations";
import type { PlanningPublicationStorage } from "../src/lib/planejamento/publication";
import type { InternalReportDataset } from "../src/lib/financeiro/report-delivery";

test("pure publication catalog: complete mappings match installed physical columns", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const columns = catalog.columns.filter(column => column.schema === "public" && column.table_name === config.name);
    assert.equal(config.columns.length, columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(item => item.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null);
      const normalize = (value: string) => value.replace(/\s/g, "").replace("withouttimezone", "");
      assert.equal(normalize(column.getSQLType()), normalize(physical.type), `${config.name}.${column.name}`);
    }
  }
});

const instant = "2026-10-28T01:02:03.456Z";
const sha = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
// Independent JSON/hash oracle: never imports the production contentHash or
// repository to manufacture expected persisted values.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(Reflect.get(value, key))]));
  return value;
}
const dataset = {
  title: "Conferência do orçamento — não homologado", year: 2026, warnings: ["Leiaute interno preservado"],
  metadata: { status: "INTERNAL_REVIEW", scope: "Ente/UG", referencePeriod: "2026-09-30", statutoryCompleteness: "NOT_STATUTORY", publicSnapshotEligible: true, publicSnapshotCondition: "PUBLICATION_REQUIRED" },
  sections: [{ title: "Referência normativa e valores preservados", rows: [{ norma: "Lei municipal 17/2026", valor: "90071992547409.91", físico: "12345678901234.1234", indicadorFloat: 0.125, versão: "versão 7", referênciaFinanceiro: "C7:budget:unchanged" }] }],
  planningIdentity: { name: "Ente de ensaio", legalName: null, cnpj: null, address: null, city: null, state: null },
  planningEmission: { issuedAt: instant, issuedBy: "Pessoa de ensaio" }, evidence: { nested: [null, "001.00", { normativeReference: "Norma preservada", versionHash: "b".repeat(64) }] },
} satisfies InternalReportDataset & { planningIdentity: unknown; planningEmission: unknown; evidence: unknown };
const datasetHash = sha(JSON.stringify(canonical(dataset)));

function storageFixture() {
  const files = new Map<string, Uint8Array>(); let uploads = 0;
  const storage: PlanningPublicationStorage = {
    async put(filename, bytes) { uploads++; const url = `isolated://publication/${filename}/${uploads}`; files.set(url, new Uint8Array(bytes)); return url; },
    async get(url) { return files.get(url) ?? null; },
  };
  return { storage, files, uploads: () => uploads };
}

function hasMessage(pattern: RegExp) {
  return (error: unknown): boolean => {
    const messages: string[] = [];
    for (let current = error; current instanceof Error; current = current.cause) messages.push(current.message);
    assert.match(messages.join("\n"), pattern); return true;
  };
}

function requiredRow<T>(rows: readonly T[]): T {
  const row = rows[0];
  assert.ok(row);
  return row;
}

test("publication physical: full 156 SQL history, Neon/Drizzle, independent SQL evidence and transaction origin", { timeout: 240_000 }, async t => {
  // Dynamic imports keep the pure selection free of PGlite, application services
  // and historical replay. The only database is this isolated local transport.
  const { createLocalDrizzleDatabase } = await import("./helpers/local-drizzle-database");
  const { withDatabaseTransaction } = await import("../src/db/transaction");
  const { sql } = await import("drizzle-orm");
  const publication = await import("../src/lib/planejamento/publication");
  const repository = await import("../src/db/repositories/planning-publication-operations/records");
  const { publicPlanningPublicationResponse } = await import("../src/lib/planejamento/publication-response");
  const fixture = await createLocalDrizzleDatabase();
  fixture.connection.pool.options.max = 1; // Queued callers: PGlite has one backend.
  const { connection, database: postgres } = fixture, db = connection.db;
  const stored = storageFixture();
  const grants = (transparency = true, legalApproval = true, chamber = true) => JSON.stringify({ acesso: "TOTAL", modules: {
    PLANEJAMENTO: { blocked: false, showDashboardCard: true, create: true, update: true, issueReports: true, legalApproval },
    TRANSPARENCIA: { blocked: !transparency, showDashboardCard: true, create: true, update: true },
    CAMARA: { blocked: !chamber, showDashboardCard: true, create: true, update: true },
  } });
  const context: PlanningPublicationConnectionContext = { connection, database: db, jurisdiction: "EXECUTIVE", user: {
    id: "po-user", firebaseUid: "po-firebase", email: "publication@example.invalid", name: "Pessoa de ensaio", role: "Planejamento", profileCode: "PO-OPERATOR", permissions: grants(),
    modulePermissions: ["PLANEJAMENTO", "TRANSPARENCIA", "CAMARA"].map(code => ({ code, canView: true, canEdit: true })), allowedBudgetUnitIds: ["po-unit-a", "po-restricted"], employeeId: null, departmentId: null, secretariatId: null,
  } };
  const narrow = { ...context, user: { ...context.user, allowedBudgetUnitIds: ["po-unit-a"] } };
  const rows = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) => (await postgres.query<T>(text, params)).rows;
  type ArtifactRow = { id: string; status: string; kind: string; attempts: number; leaseToken: string | null; lastError: string | null; reason: string; requestedById: string; publicKey: string; publishedAt: string | null; withdrawnAt: string | null };
  const artifact = async (snapshotId: string, format = "CSV") => (await rows<ArtifactRow>('SELECT * FROM "PlanningReportPublication" WHERE "snapshotId"=$1 AND format=$2', [snapshotId, format]))[0];
  const eventTypes = async (id: unknown) => (await rows<{ type: string }>('SELECT type FROM "PlanningPublicationEvent" WHERE "publicationId"=$1 ORDER BY "createdAt",id', [id])).map(row => row.type).sort();
  const preserve = async () => {
    const tables = ["PlanningInstrument", "MultiYearPlan", "BudgetGuideline", "AnnualBudgetLaw", "PlanningBudgetLine", "PlanningLineMovement", "PlanningVersion", "PlanningReportSnapshot", "PlanningIntegrationCommand", "BudgetAppropriation", "BudgetMovement", "AccountingTransaction", "AccountingEntry", "InternalControlEvent", "FinancialAuditLog"];
    return Object.fromEntries(await Promise.all(tables.map(async table => [table, requiredRow(await rows<{ hash: string }>(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb)::text) AS hash FROM "${table}" t`)).hash])));
  };
  const snapshot = async (id: string, instrumentId = "po-ppa-a", options: { filters?: object; hash?: string; at?: string } = {}) => {
    const filters = { instrumentIds: instrumentId, type: "REVENUE", asOf: "2026-09-30", snapshotUnitIds: ["po-unit-a"], ...options.filters };
    await postgres.query('INSERT INTO "PlanningReportSnapshot" (id,"instrumentId","reportType",filters,dataset,hash,"createdById","createdAt") VALUES ($1,$2,\'REVENUE\',$3::jsonb,$4::jsonb,$5,\'po-user\',$6::timestamp)', [id, instrumentId, JSON.stringify(filters), JSON.stringify(dataset), options.hash ?? datasetHash, options.at ?? instant]);
    return { snapshotId: id, format: "CSV", reason: "Conferência pública com evidência" };
  };
  const trigger = async (type: string) => postgres.exec(`CREATE FUNCTION po_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='${type}' THEN RAISE EXCEPTION 'po injected ${type}'; END IF; RETURN NEW; END $$; CREATE TRIGGER po_fail_event BEFORE INSERT ON "PlanningPublicationEvent" FOR EACH ROW EXECUTE FUNCTION po_fail_event();`);
  const untrigger = async () => postgres.exec('DROP TRIGGER po_fail_event ON "PlanningPublicationEvent"; DROP FUNCTION po_fail_event();');
  try {
    const history = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort();
    assert.equal(history.length, 156);
    for (const name of history) await postgres.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    await postgres.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('po-profile','PO-OPERATOR','Operador de publicação','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('po-user','Pessoa de ensaio','publication@example.invalid','po-profile',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('po-secretariat','Planejamento',CURRENT_TIMESTAMP);
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES
        ('po-entity-a','PO.A','Município PO_%','PREFEITURA','ATIVA',CURRENT_TIMESTAMP),('po-entity-b','PO.B','Outro Município','PREFEITURA','ATIVA',CURRENT_TIMESTAMP),
        ('po-entity-leg','PO.LEG','Câmara PO','CAMARA','ATIVA',CURRENT_TIMESTAMP),('po-entity-off','PO.OFF','Ente inativo','PREFEITURA','INATIVA',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES
        ('po-unit-a','PO.UG.A','UG A','po-secretariat',CURRENT_TIMESTAMP),('po-restricted','PO.UG.R','UG restrita','po-secretariat',CURRENT_TIMESTAMP),
        ('po-unit-b','PO.UG.B','UG B','po-secretariat',CURRENT_TIMESTAMP),('po-unit-leg','PO.UG.LEG','UG Câmara','po-secretariat',CURRENT_TIMESTAMP),('po-unit-off','PO.UG.OFF','UG inativa','po-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('po-entity-a','EXECUTIVE'),('po-entity-b','EXECUTIVE'),('po-entity-leg','LEGISLATIVE'),('po-entity-off','EXECUTIVE');
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('po-unit-a','po-entity-a'),('po-restricted','po-entity-a'),('po-unit-b','po-entity-b'),('po-unit-leg','po-entity-leg'),('po-unit-off','po-entity-off');
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('po-source','PO.F','Fonte de ensaio',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('po-revenue','PO.R','Receita de ensaio',CURRENT_TIMESTAMP);
      INSERT INTO "MultiYearPlan" (id,code,name,"startYear","endYear",status,"updatedAt") VALUES
        ('po-canonical-a','PO.PPA.A','PPA A',2026,2029,'DRAFT',CURRENT_TIMESTAMP),('po-canonical-b','PO.PPA.B','PPA B',2026,2029,'DRAFT',CURRENT_TIMESTAMP),
        ('po-canonical-leg','PO.PPA.LEG','PPA Câmara',2026,2029,'DRAFT',CURRENT_TIMESTAMP),('po-canonical-off','PO.PPA.OFF','PPA inativo',2026,2029,'DRAFT',CURRENT_TIMESTAMP),('po-canonical-page','PO.PPA.PAGE','PPA paginado',2025,2028,'DRAFT',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","multiYearPlanId","createdById","updatedAt") VALUES
        ('po-ppa-a','po-entity-a','PPA','PO.PPA.A','PPA A',2026,2029,'po-canonical-a','po-user',CURRENT_TIMESTAMP),('po-ppa-b','po-entity-b','PPA','PO.PPA.B','PPA B',2026,2029,'po-canonical-b','po-user',CURRENT_TIMESTAMP),
        ('po-ppa-leg','po-entity-leg','PPA','PO.PPA.LEG','PPA Câmara',2026,2029,'po-canonical-leg','po-user',CURRENT_TIMESTAMP),('po-ppa-off','po-entity-off','PPA','PO.PPA.OFF','PPA inativo',2026,2029,'po-canonical-off','po-user',CURRENT_TIMESTAMP),
        ('po-page','po-entity-a','PPA','PO.PPA.PAGE','PPA paginado',2025,2028,'po-canonical-page','po-user',CURRENT_TIMESTAMP);
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('po-year',2026,'po-entity-a','Aberto','2026-01-01','2026-12-31',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetGuideline" (id,"financialYearId","multiYearPlanId",status,"updatedAt") VALUES ('po-guideline','po-year','po-canonical-a','PUBLISHED',CURRENT_TIMESTAMP);
      INSERT INTO "AnnualBudgetLaw" (id,"lawNumber","financialYearId","budgetGuidelineId",status,"totalRevenue","totalExpense","updatedAt") VALUES ('po-law','Lei 17/2026','po-year','po-guideline','PUBLISHED',90071992547409.91,90071992547409.91,CURRENT_TIMESTAMP);
      INSERT INTO "PlanningInstrument" (id,"governmentEntityId",kind,code,title,"startYear","endYear","parentId","budgetGuidelineId","annualBudgetLawId","createdById","updatedAt") VALUES
        ('po-ldo','po-entity-a','LDO','PO.LDO','LDO',2026,2026,'po-ppa-a','po-guideline',NULL,'po-user',CURRENT_TIMESTAMP),('po-loa','po-entity-a','LOA','PO.LOA','LOA',2026,2026,'po-ldo',NULL,'po-law','po-user',CURRENT_TIMESTAMP);
      INSERT INTO "PlanningBudgetLine" (id,"instrumentId",kind,code,description,year,"budgetUnitId","resourceSourceId","revenueNatureId","originalValue","physicalTarget") VALUES
        ('po-line','po-ppa-a','REVENUE','PO.R','Valor exato preservado',2026,'po-unit-a','po-source','po-revenue',90071992547409.91,12345678901234.1234),
        ('po-line-restricted','po-ppa-a','REVENUE','PO.R.2','Outra unidade',2026,'po-restricted','po-source','po-revenue',0,0);
      INSERT INTO "PlanningLineMovement" (id,"lineId","effectiveAt",value,reason,"legalText","legalActNumber","createdById","idempotencyKey") VALUES ('po-movement','po-line','2026-02-03',0.09,'Ato preservado','Texto preservado','Lei 17/2026','po-user','po-movement');
      INSERT INTO "PlanningVersion" (id,"instrumentId",number,"effectiveAt","legalActNumber",reason,snapshot,hash,"createdById") VALUES ('po-version','po-ppa-a',7,'2026-02-03','Lei 17/2026','Versão imutável','{"amount":"90071992547409.91","nested":[null,0.125]}','${"b".repeat(64)}','po-user');
      INSERT INTO "PlanningIntegrationCommand" (id,type,"sourceId",payload,"idempotencyKey") VALUES ('po-c7','ACCOUNTING_BUDGET_CHANGE','po-movement','{"reference":"C7:budget:unchanged","amount":"0.09"}','po-c7');
      UPDATE "MultiYearPlan" SET status='PUBLISHED' WHERE id LIKE 'po-canonical-%';
    `);

    await t.test("originating transaction: uncommitted readers and publication/event rollback together", async () => {
      await snapshot("po-tx"); const before = await preserve();
      const bytes = new TextEncoder().encode("arquivo apenas na transação"); const url = await stored.storage.put("tx.csv", bytes, "text/csv");
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        const record = await repository.insertPublication(tx, { snapshotId: "po-tx", format: "CSV", publicKey: "po-tx-key", filename: "tx.csv", contentType: "text/csv", title: "TX", requestedById: context.user.id, reason: "Ensaio transacional" });
        await repository.claimPublication(tx, record.id, "tx-lease", new Date(Date.now() + 60_000));
        assert.equal(await repository.savePublicationArtifact(tx, record.id, "tx-lease", url, sha(bytes)), 1);
        assert.equal(await repository.finalizePublication(tx, record.id, "tx-lease"), 1);
        await repository.insertPublicationEvent(tx, record.id, "PUBLISHED", context.user.id, { nested: [null, "0.01"] });
        assert.deepEqual((await publication.readPlanningPublishedFile(tx, "po-tx-key", stored.storage)).bytes, bytes);
        assert.deepEqual((await publication.readPlanningArchivedFile({ user: context.user, jurisdiction: context.jurisdiction, database: tx }, "po-tx", "CSV", stored.storage))?.bytes, bytes);
        const managed = await publication.listPlanningPublicationManagement({ user: context.user, jurisdiction: context.jurisdiction, database: tx }, "po-ppa-a");
        assert.equal(managed.records.find(row => row.id === "po-tx")?.publications[0].id, record.id);
        throw new Error("po caller rollback");
      }), hasMessage(/po caller rollback/));
      assert.equal(await artifact("po-tx"), undefined); assert.deepEqual(await rows('SELECT id FROM "PlanningPublicationEvent"'), []); assert.deepEqual(await preserve(), before);
    });

    await t.test("CSV/PDF, private/public identical bytes, frozen evidence, replay and withdrawal", async () => {
      const input = await snapshot("po-main", "po-loa", { filters: { instrumentIds: "po-loa,po-loa", targetId: "po-ldo" } });
      const before = await preserve(), uploads = stored.uploads();
      const published = await publication.publishPlanningReport(context, input, stored.storage);
      assert.deepEqual(await publication.publishPlanningReport(context, input, stored.storage), published); assert.equal(stored.uploads(), uploads + 1);
      const record = await artifact("po-main"); assert.equal(record.status, "PUBLISHED"); assert.equal(record.kind, "REVIEW_COPY"); assert.equal(record.attempts, 1); assert.equal(record.leaseToken, null); assert.equal(record.lastError, null);
      assert.equal(record.reason, input.reason); assert.equal(record.requestedById, context.user.id);
      assert.deepEqual(await eventTypes(published.id), ["ARCHIVE_REQUESTED", "PUBLISHED"]);
      const events = await rows<{ payload: { datasetHash: string } }>('SELECT payload FROM "PlanningPublicationEvent" WHERE "publicationId"=$1', [published.id]); assert.ok(events.every(row => row.payload.datasetHash === datasetHash));
      const privateFile = await publication.readPlanningArchivedFile(context, "po-main", "CSV", stored.storage); assert.ok(privateFile);
      const publicFile = await publication.readPlanningPublishedFile(db, String(record.publicKey), stored.storage); assert.deepEqual(publicFile, privateFile); assert.equal(publicFile.hash, sha(publicFile.bytes));
      assert.match(new TextDecoder().decode(publicFile.bytes), /90071992547409.91/);
      const response = await publicPlanningPublicationResponse(db, String(record.publicKey), stored.storage); assert.equal(response.status, 200); assert.equal(response.headers.get("x-report-file-sha256"), publicFile.hash); assert.equal(response.headers.get("x-planning-completeness"), "REVIEW_COPY_NOT_STATUTORY"); assert.deepEqual(new Uint8Array(await response.arrayBuffer()), privateFile.bytes);
      const pdf = await publication.publishPlanningReport(context, { ...input, format: "PDF" }, stored.storage);
      const pdfFile = await publication.readPlanningArchivedFile(context, "po-main", "PDF", stored.storage); assert.ok(pdfFile); assert.equal(Buffer.from(pdfFile.bytes).toString("ascii", 0, 5), "%PDF-"); assert.equal(pdf.fileHash, sha(pdfFile.bytes));
      const managed = await publication.listPlanningPublicationManagement(context, "po-loa"); assert.equal(managed.records[0].createdAt.toISOString(), instant); assert.equal(managed.records[0].publications.length, 2);
      const listed = await publication.listPlanningPublications(db, { entity: "PO_%", year: 2026 }); assert.equal(listed.total, 2); assert.ok(!JSON.stringify(listed).includes("po-main")); assert.match(listed.records[0].publishedAt ?? "", /Z$/);
      assert.equal(await publication.withdrawPlanningPublication(context, { publicationId: published.id, reason: "Substituição fundamentada" }), published.id);
      assert.equal(await publication.withdrawPlanningPublication(context, { publicationId: published.id, reason: "Retirada repetida" }), published.id);
      assert.equal((await publicPlanningPublicationResponse(db, String(record.publicKey), stored.storage)).status, 404);
      assert.deepEqual((await publication.readPlanningArchivedFile(context, "po-main", "CSV", stored.storage))?.bytes, privateFile.bytes);
      await assert.rejects(publication.publishPlanningReport(context, input, stored.storage), hasMessage(/retirado/));
      assert.deepEqual(await eventTypes(published.id), ["ARCHIVE_REQUESTED", "PUBLISHED", "WITHDRAWN"]);
      await assert.rejects(postgres.query('UPDATE "PlanningReportPublication" SET "fileHash"=$1 WHERE id=$2', ["0".repeat(64), published.id]), hasMessage(/immutable/));
      await assert.rejects(postgres.query('DELETE FROM "PlanningPublicationEvent" WHERE "publicationId"=$1', [published.id]), hasMessage(/immutable/));
      await assert.rejects(postgres.query('UPDATE "PlanningReportSnapshot" SET hash=$1 WHERE id=$2', ["0".repeat(64), "po-main"]), hasMessage(/immutable/));
      assert.deepEqual(await preserve(), before, "publication must not mutate legal/accounting/C7/snapshot state");
    });

    await t.test("storage failure/retry and injected claim, confirmation and withdrawal event failures", async () => {
      const input = await snapshot("po-storage"), uploads = stored.uploads();
      await assert.rejects(publication.publishPlanningReport(context, input, { ...stored.storage, get: async () => new Uint8Array([1, 2, 3]) }), hasMessage(/hash divergente/));
      const failed = await artifact("po-storage"); assert.equal(failed.status, "FAILED"); assert.equal(failed.leaseToken, null); assert.equal(failed.attempts, 1);
      assert.equal((await publicPlanningPublicationResponse(db, String(failed.publicKey), stored.storage)).status, 404);
      const retried = await publication.publishPlanningReport(context, input, stored.storage); assert.equal(retried.id, failed.id); assert.equal(stored.uploads(), uploads + 1); assert.equal((await artifact("po-storage")).attempts, 2);
      assert.deepEqual(await eventTypes(retried.id), ["ARCHIVE_REQUESTED", "ARCHIVE_REQUESTED", "FAILED", "PUBLISHED"]);
      const claim = await snapshot("po-claim-rollback"), beforeUploads = stored.uploads();
      await trigger("ARCHIVE_REQUESTED");
      try { await assert.rejects(publication.publishPlanningReport(context, claim, stored.storage), hasMessage(/po injected ARCHIVE_REQUESTED/)); } finally { await untrigger(); }
      assert.equal(await artifact("po-claim-rollback"), undefined); assert.equal(stored.uploads(), beforeUploads);
      const confirm = await snapshot("po-confirm-rollback");
      await trigger("PUBLISHED");
      try { await assert.rejects(publication.publishPlanningReport(context, confirm, stored.storage), hasMessage(/po injected PUBLISHED/)); } finally { await untrigger(); }
      const confirmation = await artifact("po-confirm-rollback"); assert.equal(confirmation.status, "FAILED"); assert.equal(confirmation.publishedAt, null); assert.deepEqual(await eventTypes(confirmation.id), ["ARCHIVE_REQUESTED", "FAILED"]);
      const count = stored.uploads(); const completed = await publication.publishPlanningReport(context, confirm, stored.storage); assert.equal(completed.id, confirmation.id); assert.equal(stored.uploads(), count);
      await trigger("WITHDRAWN");
      try { await assert.rejects(publication.withdrawPlanningPublication(context, { publicationId: completed.id, reason: "Retirada com falha injetada" }), hasMessage(/po injected WITHDRAWN/)); } finally { await untrigger(); }
      assert.equal((await artifact("po-confirm-rollback")).status, "PUBLISHED"); assert.equal((await artifact("po-confirm-rollback")).withdrawnAt, null); assert.ok(!(await eventTypes(completed.id)).includes("WITHDRAWN"));
      const corrupt = { ...stored.storage, get: async () => new Uint8Array([0]) };
      await assert.rejects(publication.readPlanningPublishedFile(db, String(confirmation.publicKey), corrupt), hasMessage(/integridade/));
      await assert.rejects(publication.readPlanningArchivedFile(context, "po-confirm-rollback", "CSV", corrupt), hasMessage(/hash divergente/));
      const failedEvent = await snapshot("po-failed-event-rollback");
      await trigger("FAILED");
      try { await assert.rejects(publication.publishPlanningReport(context, failedEvent, corrupt), hasMessage(/po injected FAILED/)); } finally { await untrigger(); }
      const archiving = await artifact("po-failed-event-rollback"); assert.equal(archiving.status, "ARCHIVING"); assert.ok(archiving.leaseToken); assert.equal(archiving.lastError, null); assert.deepEqual(await eventTypes(archiving.id), ["ARCHIVE_REQUESTED"]);
      await postgres.query('UPDATE "PlanningReportPublication" SET "leaseExpiresAt"=\'2000-01-01\' WHERE id=$1', [archiving.id]);
      assert.equal((await publication.publishPlanningReport(context, failedEvent, stored.storage)).id, archiving.id);
    });

    await t.test("active lease excludes replay; expired lease takeover fences the old attempt", async () => {
      async function delayedAttempt(id: string, takeover: boolean) {
        const input = await snapshot(id); let ready!: () => void, release!: () => void;
        const started = new Promise<void>(resolve => { ready = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
        const delayed = { ...stored.storage, put: async (...args: Parameters<PlanningPublicationStorage["put"]>) => { ready(); await gate; return stored.storage.put(...args); } };
        const pending = publication.publishPlanningReport(context, input, delayed);
        // Attach rejection before starting the second caller.
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        await started;
        try {
          await assert.rejects(publication.publishPlanningReport(context, input, stored.storage), hasMessage(/processamento/));
          if (takeover) {
            await postgres.query('UPDATE "PlanningReportPublication" SET "leaseExpiresAt"=\'2000-01-01\' WHERE "snapshotId"=$1', [id]);
            await publication.publishPlanningReport(context, input, stored.storage);
          }
        } finally { release(); }
        const result = await outcome;
        if (takeover) { assert.ok("error" in result); hasMessage(/concessão/)(result.error); }
        else { assert.ok("value" in result); assert.equal(result.value.status, "PUBLISHED"); }
        const record = await artifact(id); assert.equal(record.status, "PUBLISHED"); assert.equal(record.attempts, takeover ? 2 : 1); assert.equal(record.lastError, null);
        assert.deepEqual(await eventTypes(record.id), takeover ? ["ARCHIVE_REQUESTED", "ARCHIVE_REQUESTED", "PUBLISHED"] : ["ARCHIVE_REQUESTED", "PUBLISHED"]);
      }
      await delayedAttempt("po-active-lease", false); await delayedAttempt("po-expired-lease", true);
    });

    await t.test("legal status is checked again after storage; full-piece, entity, UG and Câmara authorization", async () => {
      const input = await snapshot("po-legal", "po-loa", { filters: { instrumentIds: "po-loa", targetId: "po-ldo" } });
      const changing = { ...stored.storage, put: async (...args: Parameters<PlanningPublicationStorage["put"]>) => { const url = await stored.storage.put(...args); await postgres.exec('UPDATE "BudgetGuideline" SET status=\'SANCTIONED\' WHERE id=\'po-guideline\''); return url; } };
      await assert.rejects(publication.publishPlanningReport(context, input, changing), hasMessage(/situação legal mudou/));
      assert.equal((await artifact("po-legal")).status, "FAILED"); assert.equal((await artifact("po-legal")).publishedAt, null);
      await assert.rejects(publication.publishPlanningReport(context, input, stored.storage), hasMessage(/fluxo legal/));
      await postgres.exec('UPDATE "BudgetGuideline" SET status=\'PUBLISHED\' WHERE id=\'po-guideline\'');
      const count = stored.uploads(); await publication.publishPlanningReport(context, input, stored.storage); assert.equal(stored.uploads(), count);
      const denied = await snapshot("po-denied");
      await assert.rejects(publication.publishPlanningReport(narrow, denied, stored.storage), hasMessage(/todas as unidades/));
      await assert.rejects(publication.publishPlanningReport({ ...context, user: { ...context.user, permissions: grants(false) } }, denied, stored.storage), hasMessage(/Transparência/));
      await assert.rejects(publication.publishPlanningReport({ ...context, user: { ...context.user, permissions: grants(true, false) } }, denied, stored.storage), hasMessage(/aprovação/));
      await snapshot("po-b", "po-ppa-b", { filters: { snapshotUnitIds: ["po-unit-b"] } });
      await assert.rejects(publication.publishPlanningReport(context, { ...denied, snapshotId: "po-b" }, stored.storage), hasMessage(/escopo/));
      await snapshot("po-outside-units", "po-ppa-a", { filters: { snapshotUnitIds: ["po-unit-b"] } });
      await assert.rejects(publication.readPlanningArchivedFile(context, "po-outside-units", "CSV", stored.storage), hasMessage(/unidades autorizadas/));
      await snapshot("po-tampered", "po-ppa-a", { hash: "0".repeat(64) });
      await assert.rejects(publication.publishPlanningReport(context, { ...denied, snapshotId: "po-tampered" }, stored.storage), hasMessage(/hash preservado/));
      const chamber = { ...context, jurisdiction: "LEGISLATIVE" as const, user: { ...context.user, allowedBudgetUnitIds: ["po-unit-leg"] } };
      const legislative = await snapshot("po-leg", "po-ppa-leg", { filters: { snapshotUnitIds: ["po-unit-leg"] } });
      await assert.rejects(publication.publishPlanningReport(context, legislative, stored.storage), hasMessage(/escopo/));
      await assert.rejects(publication.publishPlanningReport({ ...chamber, user: { ...chamber.user, permissions: grants(true, true, false) } }, legislative, stored.storage), hasMessage(/Câmara/));
      assert.equal((await publication.publishPlanningReport(chamber, legislative, stored.storage)).status, "PUBLISHED");
      await snapshot("po-off", "po-ppa-off", { filters: { snapshotUnitIds: ["po-unit-off"] } });
      await assert.rejects(publication.listPlanningPublicationManagement({ ...context, user: { ...context.user, allowedBudgetUnitIds: ["po-unit-off"] } }, "po-ppa-off"), hasMessage(/escopo/));
      assert.equal(await artifact("po-denied"), undefined);
    });

    await t.test("management all-selected/target/JSON containment, deterministic pages and absent runtime", async () => {
      for (let index = 0; index < 23; index++) {
        const id = `po-page-${String(index).padStart(2, "0")}`; await snapshot(id, "po-page");
        if (index < 21) await postgres.query('INSERT INTO "PlanningReportPublication" (id,"snapshotId",format,"publicKey",status,"fileUrl","fileHash",filename,"contentType",title,"requestedById",reason,"publishedAt","updatedAt") VALUES ($1,$2,\'CSV\',$3,\'PUBLISHED\',\'isolated://listed\',$4,\'page.csv\',\'text/csv\',\'Página pública\',\'po-user\',\'Evidência\',$5::timestamp,$5::timestamp)', [`${id}-artifact`, id, `${id}-key`, "a".repeat(64), instant]);
      }
      await snapshot("po-page-hidden-selected", "po-page", { filters: { instrumentIds: "po-page,po-ppa-b" } });
      await snapshot("po-page-hidden-target", "po-page", { filters: { targetId: "po-ppa-b" } });
      await snapshot("po-page-hidden-unit", "po-page", { filters: { snapshotUnitIds: ["po-unit-b"] } });
      await snapshot("po-page-hidden-missing", "po-page", { filters: { snapshotUnitIds: undefined } });
      const managed = await publication.listPlanningPublicationManagement(context, "po-page", 999);
      assert.equal(managed.total, 23); assert.equal(managed.page, 2); assert.deepEqual(managed.records.map(row => row.id), ["po-page-20", "po-page-21", "po-page-22"]); assert.equal(managed.records[0].createdAt.toISOString(), instant); assert.equal(managed.records[0].publications[0].publicKey, "po-page-20-key");
      assert.equal((await publication.listPlanningPublicationManagement(context, "po-page", NaN)).page, 1);
      const admin = { ...context, user: { ...context.user, profileCode: "SYSTEM_ADMINISTRATOR" } };
      assert.equal((await publication.listPlanningPublicationManagement(admin, "po-page")).total, 27);
      await assert.rejects(publication.listPlanningPublicationManagement(context, "po-ppa-b"), hasMessage(/escopo/));
      const listed = await publication.listPlanningPublications(db, { year: 2025, entity: "po_%", page: 999 }); assert.equal(listed.total, 21); assert.equal(listed.page, 2); assert.equal(listed.records[0].url, "/api/transparencia/planejamento/po-page-20-key"); assert.equal(listed.records[0].publishedAt, instant);
      assert.equal((await publication.listPlanningPublications(db, { year: 2025, entity: "' OR true --" })).total, 0);
      assert.equal((await publication.listPlanningPublications(db, { year: 2025, entity: "not_%" })).total, 0);
      const oracle = requiredRow(await rows<{ money: string; physical: string }>('SELECT "originalValue"::text AS money,"physicalTarget"::text AS physical FROM "PlanningBudgetLine" WHERE id=\'po-line\'')); assert.equal(oracle.money, "90071992547409.91"); assert.equal(oracle.physical, "12345678901234.1234");
      const preserved = requiredRow(await rows<{ dataset: unknown; hash: string }>('SELECT dataset,hash FROM "PlanningReportSnapshot" WHERE id=\'po-main\'')); assert.deepEqual(preserved.dataset, dataset); assert.equal(preserved.hash, datasetHash);
      await assert.rejects(withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`ALTER TABLE "PlanningReportPublication" RENAME TO "po_temporarily_unavailable"`);
        assert.deepEqual(await publication.listPlanningPublications(tx, { page: 999 }), { total: 0, page: 1, records: [] });
        assert.equal(await publication.readPlanningArchivedFile({ user: context.user, jurisdiction: context.jurisdiction, database: tx }, "po-main", "CSV", stored.storage), null);
        throw new Error("po restore runtime");
      }), hasMessage(/po restore runtime/));
      assert.equal(await repository.publicationRuntimeReady(db), true);
    });
  } finally { await fixture.close(); }
});
