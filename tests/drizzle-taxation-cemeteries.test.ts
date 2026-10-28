import assert from "node:assert/strict";
import test from "node:test";
import { eq, getTableColumns, getTableName, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { JsonNull } from "../src/db/json";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accessProfiles, users } from "../src/db/schema/identity";
import { secretariats } from "../src/db/schema/administration";
import { governmentEntities } from "../src/db/schema/master-data";
import { people } from "../src/db/schema/people";
import { addresses, companies, documents, realEstates, taxpayers } from "../src/db/schema/registry";
import { auditEvents } from "../src/db/schema/audit";
import * as cemeteryTables from "../src/db/schema/cemeteries";
import * as nfseTables from "../src/db/schema/taxation-nfse";
import * as registryTables from "../src/db/schema/taxation-registry";
import * as auditTables from "../src/db/schema/taxation-audit";
import { readNfseDocument, readNfseDocumentHistory, readOwnNfsePage } from "../src/db/repositories/taxation/nfse-documents";
import { readTaxLicenseValidation } from "../src/db/repositories/taxation/license-validation";
import { publishAccountant } from "../src/lib/tributacao/accountants";
import { readAccountantDirectory } from "../src/db/repositories/taxation/accountants";
import { publishPropertyEditRestriction, approvePropertyEdit } from "../src/lib/tributacao/property-edit-restrictions";
import { readPropertyEditControlData } from "../src/db/repositories/taxation/property-edit-restrictions";
import { insertPropertyWithHistory, updatePropertyWithHistory } from "../src/db/repositories/registry/operations";
import { runTaxAuditCrossCheck, issueTaxInfractionNotice } from "../src/lib/tributacao/inteligencia-tributaria-engine";
import { readTaxAuditCrossChecks } from "../src/db/repositories/taxation/audit-cross-checks";
import { taxAssessmentCompensatedValue, taxScopeSnapshot } from "../src/lib/tributacao/scope";
import { insertCemeteryAttachment, readCemeteryAttachmentDownload, readCemeteryAttachments } from "../src/db/repositories/cemeteries/attachments";
import { recordCemeteryReport } from "../src/db/repositories/cemeteries/reports";
import { createTaxationDrizzleFixture } from "./helpers/taxation-drizzle-fixture";

test("Drizzle Tributação/Cemitérios: histórico SQL, autorização, precisão e rollback de auditoria", { timeout: 240_000 }, async t => {
  const f = await createTaxationDrizzleFixture();
  const db = f.connection.db;
  try {
    const [profile] = await db.insert(accessProfiles).values({ codigo: "TAXATION_TEST", nome: "Verificação", permissoes: "{}" }).returning();
    await db.insert(users).values({ id: "taxation-actor", nome: "Operador", email: "taxation@example.invalid", perfilId: profile.id });
    const actor = { usuarioId: "taxation-actor", employeeId: null };
    await db.insert(people).values({ id: "provider-person", fullName: "Prestador ativo" });
    await db.insert(companies).values({ id: "taker-company", corporateName: "Tomador ativo", cnpj: "11222333000181" });
    await db.insert(taxpayers).values([
      { id: "provider", taxpayerType: "PF", personId: "provider-person" },
      { id: "taker", taxpayerType: "PJ", companyId: "taker-company" },
    ]);

    await t.test("mapeamentos usam nomes físicos, nulabilidade e numerics do histórico SQL", async () => {
      const catalog = await f.database.query<{ table_name: string; column_name: string; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null }>(`SELECT table_name,column_name,is_nullable,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public'`);
      const columns = new Map(catalog.rows.map(row => [`${row.table_name}.${row.column_name}`, row]));
      for (const table of [...Object.values(cemeteryTables), ...Object.values(nfseTables), ...Object.values(registryTables), ...Object.values(auditTables)]) {
        for (const column of Object.values(getTableColumns(table))) {
          const key = `${getTableName(table)}.${column.name}`;
          const actual = columns.get(key);
          assert.ok(actual, key);
          assert.equal(actual.is_nullable, column.notNull ? "NO" : "YES", key);
          const numeric = column.getSQLType().match(/^numeric\((\d+),(\d+)\)$/);
          if (numeric) {
            assert.equal(actual.numeric_precision, Number(numeric[1]), key);
            assert.equal(actual.numeric_scale, Number(numeric[2]), key);
          }
        }
      }
    });

    await t.test("NFS-e mantém partes, endereços, Decimal, datas e histórico cronológico", async () => {
      await db.insert(addresses).values([{ personId: "provider-person", streetName: "Rua do prestador", number: "1" }, { companyId: "taker-company", streetName: "Rua do tomador", number: "2" }]);
      await db.insert(nfseTables.taxInvoices).values({ id: "nfse-document", invoiceNumber: 1, verificationCode: "DOCUMENT-CODE", serviceValue: 1234567890123456.7, serviceValueDecimal: new Decimal("1234567890123456.78"), issValue: 1, issValueDecimal: new Decimal("1.00"), competence: "10/2026", providerId: "provider", takerId: "taker" });
      await db.insert(nfseTables.nfseInvoiceData).values({ invoiceId: "nfse-document", economicRegistrationId: "registration", serviceActivityId: "activity", parameterId: "parameter", serviceDescription: "Serviço municipal", taxableBaseDecimal: new Decimal("1234567890123456.78"), rate: new Decimal("0.012345"), calculationSnapshot: { exact: "1234567890123456.78", optional: null }, authenticityUrl: "/portal/nfse/DOCUMENT-CODE", qrPayload: "DOCUMENT-CODE" });
      const early = new Date("2026-10-01T12:00:00.123Z"), late = new Date("2026-10-02T12:00:00.456Z");
      await db.insert(nfseTables.nfseEvents).values([{ invoiceId: "nfse-document", eventType: "LATE", description: "Segundo", createdAt: late, payload: JsonNull }, { invoiceId: "nfse-document", eventType: "EARLY", description: "Primeiro", createdAt: early, payload: null }]);
      await db.insert(nfseTables.nfseCorrectionLetters).values([{ invoiceId: "nfse-document", reason: "Segunda", changes: { description: "B" }, createdByUsuarioId: actor.usuarioId, createdAt: late }, { invoiceId: "nfse-document", reason: "Primeira", changes: { description: "A" }, createdByUsuarioId: actor.usuarioId, createdAt: early }]);
      const document = await readNfseDocument(db, { code: "DOCUMENT-CODE" });
      assert.ok(document?.fiscal);
      assert.equal(document.invoice.provider.person?.fullName, "Prestador ativo");
      assert.equal(document.invoice.provider.person?.addresses[0].streetName, "Rua do prestador");
      assert.equal(document.invoice.provider.company, null);
      assert.equal(document.invoice.taker?.company?.addresses[0].streetName, "Rua do tomador");
      assert.equal(document.invoice.serviceValueDecimal?.toFixed(2), "1234567890123456.78");
      assert.equal(document.fiscal.rate.toFixed(6), "0.012345");
      assert.deepEqual(document.fiscal.calculationSnapshot, { exact: "1234567890123456.78", optional: null });
      assert.equal((await readNfseDocument(db, { id: "nfse-document" }))?.invoice.id, document.invoice.id);
      assert.equal(await readNfseDocument(db, { code: "missing" }), null);
      const history = await readNfseDocumentHistory(db, "nfse-document");
      assert.deepEqual(history.events.map(row => row.eventType), ["EARLY", "LATE"]);
      assert.deepEqual(history.letters.map(row => row.reason), ["Primeira", "Segunda"]);
      assert.equal(history.events[0].createdAt.toISOString(), early.toISOString());
      assert.equal(history.events[0].actorUsuarioId, null);
      const nulls = await db.execute<{ eventType: string; sqlNull: boolean }>(sql`SELECT "eventType",payload IS NULL AS "sqlNull" FROM "NfseEvent" ORDER BY "createdAt"`);
      assert.deepEqual(nulls.rows, [{ eventType: "EARLY", sqlNull: true }, { eventType: "LATE", sqlNull: false }]);
    });

    await t.test("portal aplica TITULAR/NFSE e estado canônico antes da contagem/paginação", async () => {
      const grant = async (id: string, accessType: string, scopes: unknown, status = "ATIVO", revokedAt: Date | null = null, grantedAt = new Date("2020-01-01")) => {
        await db.execute(sql`INSERT INTO "TaxpayerPortalAccess" (id,"usuarioId","taxpayerId","accessType",scopes,status,"grantedByUsuarioId","grantedAt","revokedAt") VALUES (${`grant-${id}`},${actor.usuarioId},${id},${accessType},${JSON.stringify(scopes)}::jsonb,${status},${actor.usuarioId},${grantedAt},${revokedAt})`);
      };
      await grant("provider", "TITULAR", ["NFSE"]);
      const cases = ["representative", "no-scope", "wrong-json", "revoked", "inactive-grant", "future", "inactive-taxpayer", "inactive-person", "inactive-company", "no-canonical"];
      for (const [index, id] of cases.entries()) {
        if (id === "inactive-company") {
          await db.insert(companies).values({ id, corporateName: id, cnpj: `0000000000${String(index).padStart(4, "0")}`, status: "Inativo" });
        } else if (id !== "no-canonical") {
          await db.insert(people).values({ id, fullName: id, status: id === "inactive-person" ? "Inativo" : "Ativo" });
        }
        await db.insert(taxpayers).values({ id, taxpayerType: id === "inactive-company" ? "PJ" : "PF", personId: id === "inactive-company" || id === "no-canonical" ? null : id, companyId: id === "inactive-company" ? id : null, status: id === "inactive-taxpayer" ? "Inativo" : "Ativo" });
        await grant(id, id === "representative" ? "REPRESENTANTE" : "TITULAR", id === "no-scope" ? [] : id === "wrong-json" ? "NFSE" : ["NFSE"], id === "inactive-grant" ? "INATIVO" : "ATIVO", id === "revoked" ? new Date("2020-01-02") : null, id === "future" ? new Date("2099-01-01") : new Date("2020-01-01"));
        await db.insert(nfseTables.taxInvoices).values({ invoiceNumber: index + 100, verificationCode: `HIDDEN-${id}`, serviceValue: 1, issValue: 0, competence: "10/2026", providerId: id });
      }
      for (let number = 2; number <= 25; number++) await db.insert(nfseTables.taxInvoices).values({ invoiceNumber: number, verificationCode: `OWN-${number}`, serviceValue: 1, issValue: 0, competence: "10/2026", providerId: "provider" });
      await db.insert(nfseTables.taxInvoices).values([{ invoiceNumber: 26, verificationCode: "OWN-TAKER", serviceValue: 1, issValue: 0, competence: "09/2026", providerId: "taker", takerId: "provider" }, { invoiceNumber: 27, verificationCode: "OWN-BOTH", serviceValue: 1, issValue: 0, competence: "10/2026", providerId: "provider", takerId: "provider" }]);
      const first = await readOwnNfsePage(db, actor.usuarioId, "10/2026", 1);
      assert.equal(first.total, 26);
      assert.equal(first.rows.length, 20);
      assert.deepEqual(first.rows.slice(0, 3).map(row => row.invoiceNumber), [27, 25, 24]);
      const last = await readOwnNfsePage(db, actor.usuarioId, "10/2026", 999);
      assert.equal(last.page, 2);
      assert.deepEqual(last.rows.map(row => row.invoiceNumber), [6, 5, 4, 3, 2, 1]);
      assert.equal((await readOwnNfsePage(db, actor.usuarioId, "", 1)).total, 27);
      assert.deepEqual(await readOwnNfsePage(db, "unlinked-user", "", 999), { rows: [], total: 0, page: 1 });
    });

    await t.test("alvará exige código da licença e da emissão; assinatura é opcional", async () => {
      const [license] = await db.insert(registryTables.taxLicenses).values({ licenseType: "Funcionamento", qrCode: "LICENSE-CODE", taxpayerId: "provider" }).returning();
      assert.equal(await readTaxLicenseValidation(db, "LICENSE-CODE"), null);
      await db.insert(registryTables.taxRegistryEntries).values({ entityType: "LICENSE", entityId: license.id, category: "LICENSE_ISSUANCE", title: "Emissão", data: { authCode: "WRONG" } });
      assert.equal(await readTaxLicenseValidation(db, "LICENSE-CODE"), null);
      const [valid] = await db.insert(registryTables.taxLicenses).values({ licenseType: "Funcionamento", qrCode: "VALID-CODE", taxpayerId: "provider" }).returning();
      await db.insert(registryTables.taxRegistryEntries).values({ entityType: "LICENSE", entityId: valid.id, category: "LICENSE_ISSUANCE", title: "Emissão", data: { authCode: "VALID-CODE", optional: null } });
      assert.equal((await readTaxLicenseValidation(db, "VALID-CODE"))?.signature, null);
      const [signature] = await db.insert(registryTables.taxRegistryEntries).values({ entityType: "LICENSE", entityId: valid.id, category: "LICENSE_SIGNATURE", title: "Assinatura", data: {} }).returning();
      assert.deepEqual((await readTaxLicenseValidation(db, "VALID-CODE"))?.signature, { id: signature.id });
    });

    await t.test("contador preserva versões, conflito otimista e rollback quando a auditoria falha", async () => {
      const input = { taxpayerId: "provider", crc: "CRC-1", expectedVersion: 0, reason: "Cadastro inicial" };
      const first = await publishAccountant(f.connection, actor, input);
      const second = await publishAccountant(f.connection, actor, { ...input, crc: "CRC-2", expectedVersion: 1, reason: "Correção" });
      assert.notEqual(first.id, second.id);
      assert.equal(second.version, 2);
      assert.deepEqual(second.data, { crc: "CRC-2", reason: "Correção", previousId: first.id });
      await assert.rejects(publishAccountant(f.connection, actor, input), /alterado/);
      await assert.rejects(db.update(registryTables.taxRegistryEntries).set({ title: "Tampered" }).where(eq(registryTables.taxRegistryEntries.id, first.id)), error => getPostgresError(error)?.code === "P0001");
      await f.database.exec(`CREATE FUNCTION reject_taxation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit test failure'; END; $$; CREATE TRIGGER reject_taxation_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_taxation_audit();`);
      try {
        await assert.rejects(publishAccountant(f.connection, actor, { ...input, expectedVersion: 2, crc: "CRC-ROLLBACK" }), error => getPostgresError(error)?.code === "P0001");
      } finally { await f.database.exec('DROP TRIGGER reject_taxation_audit ON "AuditEvent"; DROP FUNCTION reject_taxation_audit()'); }
      const directory = await readAccountantDirectory(db);
      assert.deepEqual(directory.entries.map(row => row.version), [2, 1]);
      assert.equal(directory.taxpayers.find(row => row.id === "provider")?.person?.fullName, "Prestador ativo");
      assert.equal((await db.select().from(auditTables.taxAuditLogs)).length, 2);
      assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.targetType, "TaxRegistryEntry"))).length, 2);
    });

    await t.test("compensação usa a transação repeatable read recebida e soma Decimal sem perda", async () => {
      const snapshot = { budgetUnitId: "unit", nested: { value: null, missing: undefined } };
      assert.equal(taxScopeSnapshot(snapshot), snapshot);
      assert.deepEqual(taxScopeSnapshot(null), {});
      assert.deepEqual(taxScopeSnapshot([snapshot]), {});
      assert.deepEqual(taxScopeSnapshot("not-an-object"), {});
      const rollback = new Error("expected compensation rollback");
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        const base = { entityType: "TAX_ASSESSMENT", entityId: "scope-assessment", category: "CREDIT_MOVEMENT", title: "Compensação", status: "EFETIVADO" };
        await tx.insert(registryTables.taxRegistryEntries).values([
          { ...base, data: { operation: "COMPENSAR", amount: "9007199254740993.01" } },
          { ...base, data: { operation: "COMPENSAR", amount: "0.02" } },
          { ...base, data: { operation: "RESTITUIR", amount: "100.00" } },
          { ...base, status: "ESTORNADO", data: { operation: "COMPENSAR", amount: "200.00" } },
          { ...base, entityId: "other-assessment", data: { operation: "COMPENSAR", amount: "400.00" } },
          { ...base, category: "OTHER", data: { operation: "COMPENSAR", amount: "800.00" } },
          { ...base, entityType: "OTHER", data: { operation: "COMPENSAR", amount: "1600.00" } },
          { ...base, data: ["not-a-movement"] },
        ]);
        const compensated = await taxAssessmentCompensatedValue(tx, "scope-assessment");
        assert.equal(Decimal.isDecimal(compensated), true);
        assert.equal(compensated.toFixed(2), "9007199254740993.03");
        throw rollback;
      }, { isolationLevel: "repeatable read" }), error => error === rollback);
      assert.equal((await taxAssessmentCompensatedValue(db, "scope-assessment")).toFixed(2), "0.00");
    });

    await t.test("cruzamento calcula ISS exato, mantém nulabilidade e emite auto", async () => {
      const input = { cnpjCpfContribuinte: "12345678901", razaoSocial: "Contribuinte", origemCruzamento: "DEISS_BANCOS" as const, valorDeclarado: 0.1, valorApuradoBancos: 0.4 };
      const result = await runTaxAuditCrossCheck(db, input);
      assert.equal(result.divergenciaImposto, 0.02);
      const [record] = await readTaxAuditCrossChecks(db);
      assert.equal(record.divergenciaImposto.toFixed(2), "0.02");
      assert.equal(record.numeroAutoInfracao, null);
      assert.equal(record.createdAt instanceof Date, true);
      const notice = await issueTaxInfractionNotice(db, result.id);
      assert.match(notice.numeroAutoInfracao, /^AUTO-ISS-\d{4}-\d{6}$/);
      assert.equal(notice.record.statusMalha, "AUTO_INFRACAO_EMITIDO");
      await assert.rejects(issueTaxInfractionNotice(db, "missing"), /não encontrado/);
      assert.equal((await runTaxAuditCrossCheck(db, { ...input, valorDeclarado: 100, valorApuradoBancos: 1 })).divergenciaImposto, 0);
    });

    await t.test("bloqueio imobiliário conserva escopo, versão, posição e consumo transacional da aprovação", async () => {
      await db.insert(secretariats).values({ id: "taxation-secretariat", name: "Secretaria" });
      await db.insert(governmentEntities).values({ id: "taxation-entity", code: "TAXATION", name: "Ente fiscal", type: "PREFEITURA" });
      await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('taxation-unit','TAX-UG','UG fiscal','taxation-secretariat',CURRENT_TIMESTAMP)`);
      await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('taxation-unit','taxation-entity')`);
      const property = await withDatabaseTransaction(f.connection, tx => insertPropertyWithHistory(tx, actor.usuarioId, { municipalInsc: "TAX-LOCKED", propertyType: "Casa", propertyUse: null, streetName: null, number: null, complement: null, landArea: 100, builtArea: 20, status: "Regular" }));
      const input = { propertyId: property.id, governmentEntityId: "taxation-entity", budgetUnitId: "taxation-unit", expectedVersion: 0, enabled: true, reason: "Restrição fundamentada" };
      await assert.rejects(publishPropertyEditRestriction(f.connection, { ...actor, allowedBudgetUnitIds: [] }, input), /autorizado/);
      await assert.rejects(publishPropertyEditRestriction(f.connection, actor, { ...input, governmentEntityId: "wrong-entity" }), /conciliados/);
      const restriction = await publishPropertyEditRestriction(f.connection, actor, input);
      assert.equal(restriction.version, 1);
      await assert.rejects(publishPropertyEditRestriction(f.connection, actor, input), /alterada/);
      const approvalInput = { propertyId: property.id, expectedUpdatedAt: property.updatedAt.toISOString(), operatorId: actor.usuarioId, validMinutes: 60, reason: "Autorização pontual" };
      await assert.rejects(approvePropertyEdit(f.connection, actor, { ...approvalInput, expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }), /alterado/);
      await assert.rejects(approvePropertyEdit(f.connection, actor, { ...approvalInput, operatorId: "missing-user" }), /ativo não encontrado/);
      const approval = await approvePropertyEdit(f.connection, actor, approvalInput);
      await assert.rejects(db.update(realEstates).set({ status: "Inativo" }).where(eq(realEstates.id, property.id)), error => getPostgresError(error)?.code === "P0001");
      const rollback = new Error("expected property rollback");
      await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
        await updatePropertyWithHistory(tx, actor.usuarioId, property.id, { status: "Inativo" });
        throw rollback;
      }), error => error === rollback);
      const controls = await readPropertyEditControlData(db, property.id);
      assert.ok(controls);
      assert.equal(controls.property.status, "Regular");
      assert.equal(controls.approvals.find(row => row.id === approval.id)?.status, "DISPONIVEL");
      assert.deepEqual(controls.effective, [{ id: restriction.id, governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId }]);
      assert.ok(controls.units.some(unit => unit.governmentEntity.name === "Ente fiscal" && unit.budgetUnit.code === "TAX-UG"));
      await withDatabaseTransaction(f.connection, tx => updatePropertyWithHistory(tx, actor.usuarioId, property.id, { status: "Inativo" }));
      assert.equal((await readPropertyEditControlData(db, property.id))?.approvals.find(row => row.id === approval.id)?.status, "CONSUMIDO");
      await assert.rejects(withDatabaseTransaction(f.connection, tx => updatePropertyWithHistory(tx, actor.usuarioId, property.id, { status: "Regular" })), error => getPostgresError(error)?.code === "P0001");
      assert.equal(await readPropertyEditControlData(db, "missing-property"), null);
    });

    await t.test("anexo GED e relatório revertem dados e evidências juntos", async () => {
      const [cemetery] = await db.insert(cemeteryTables.cemeteries).values({ code: "DRIZZLE", name: "Cemitério" }).returning();
      const [lot] = await db.insert(cemeteryTables.cemeteryLots).values({ cemeteryId: cemetery.id, identifier: "L1", ownerTaxpayerId: "provider", graveLimit: 1 }).returning();
      const target = { targetType: "LOTE" as const, targetId: lot.id };
      const payload = { requestKey: "cemetery-attachment", title: "Título", fileUrl: "https://blob.example.invalid/cemetery.pdf", hashSha256: "a".repeat(64) };
      const first = await insertCemeteryAttachment(f.connection, actor.usuarioId, target, payload);
      assert.equal(first.created, true);
      assert.deepEqual(await insertCemeteryAttachment(f.connection, actor.usuarioId, target, payload), { id: first.id, created: false });
      const download = await readCemeteryAttachmentDownload(db, first.id);
      assert.ok(download);
      assert.equal(download.shared, false);
      assert.equal(download.hashSha256, payload.hashSha256);
      await assert.rejects(insertCemeteryAttachment(f.connection, "other", target, payload), /indisponível/);
      await assert.rejects(insertCemeteryAttachment(f.connection, actor.usuarioId, target, { ...payload, hashSha256: "b".repeat(64) }), /indisponível/);
      await f.database.exec(`CREATE FUNCTION reject_cemetery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit test failure'; END; $$; CREATE TRIGGER reject_cemetery_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_cemetery_audit();`);
      try {
        await assert.rejects(insertCemeteryAttachment(f.connection, actor.usuarioId, target, { ...payload, requestKey: "cemetery-rollback" }), error => getPostgresError(error)?.code === "P0001");
        await assert.rejects(recordCemeteryReport(f.connection, { id: "report-rollback", actorId: actor.usuarioId, fieldName: "emissao", evidence: { count: 1 } }), error => getPostgresError(error)?.code === "P0001");
      } finally { await f.database.exec('DROP TRIGGER reject_cemetery_audit ON "AuditEvent"; DROP FUNCTION reject_cemetery_audit()'); }
      assert.deepEqual(await db.select({ id: documents.id }).from(documents).where(eq(documents.id, "cemetery-rollback")), []);
      const versions = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM "DocumentVersion" WHERE "documentId"='cemetery-rollback'`);
      assert.equal(versions.rows[0].count, 0);
      assert.equal((await readCemeteryAttachments(db, target, 999)).total, 1);
      assert.deepEqual(await db.select().from(cemeteryTables.cemeteryChangeHistory).where(eq(cemeteryTables.cemeteryChangeHistory.targetId, "report-rollback")), []);
      await recordCemeteryReport(f.connection, { id: "report-committed", actorId: actor.usuarioId, fieldName: "emissao_pdf", evidence: { count: 1 } });
      assert.equal((await db.select().from(cemeteryTables.cemeteryChangeHistory).where(eq(cemeteryTables.cemeteryChangeHistory.targetId, "report-committed"))).length, 1);
      assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.targetId, "report-committed"))).length, 1);
    });
  } finally { await f.close(); }
});
