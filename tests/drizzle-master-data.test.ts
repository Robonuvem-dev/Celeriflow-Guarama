import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { people } from "../src/db/schema/people";
import { states } from "../src/db/schema/localities";
import { banks, consistencyIssues, consistencyRuns, currencies, families, familyMembers, governmentEntities, legalReportSigners, legalTextVersions } from "../src/db/schema/master-data";
import { users } from "../src/db/schema/identity";
import * as master from "../src/db/repositories/registry/master-data-operations";
import { assertCanInactivate } from "../src/db/repositories/registry/master-data-guards";
import { runMasterDataConsistency } from "../src/db/repositories/registry/consistency";
import { loadMasterDataPage } from "../src/db/repositories/registry/master-data-queries";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import type { MasterDataCatalog } from "../src/app/app-domain/cadastros/master-data-types";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

test("Catálogos mestres: escritas, dependências, versões e consistência transacional", { skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000 }, async t => {
  assert.ok(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const fixture = createId();
  const rollback = new Error("expected master data rollback");
  const saved = new Map<MasterDataCatalog, string>();
  let runId = "";
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const [actor] = await tx.select({ id: users.id }).from(users).limit(1); assert.ok(actor);
      const [state] = await tx.select().from(states).where(eq(states.status, "ATIVO")).limit(1); assert.ok(state);
      const [person, other] = await tx.insert(people).values([{ fullName: `${fixture}-person` }, { fullName: `${fixture}-other` }]).returning();
      await t.test("família conserva membros históricos e substitui representante", async () => {
        const input = { code: fixture, responsiblePersonId: person.id, status: "ATIVA" };
        const id = await master.saveFamily(tx, null, input, [person.id, other.id]); saved.set("families", id);
        const initial = await tx.select().from(familyMembers).where(eq(familyMembers.familyId, id));
        await master.saveFamily(tx, id, { ...input, responsiblePersonId: other.id }, [other.id]);
        const after = await tx.select().from(familyMembers).where(eq(familyMembers.familyId, id));
        assert.equal(after.length, 2);
        assert.equal(after.find(row => row.personId === person.id)?.status, "INATIVO");
        assert.ok(after.find(row => row.personId === person.id)?.leftAt);
        assert.equal(after.find(row => row.personId === other.id)?.isRepresentative, true);
        assert.equal(after.find(row => row.personId === other.id)?.id, initial.find(row => row.personId === other.id)?.id);
        await master.saveFamily(tx, id, { ...input, responsiblePersonId: null }, []);
        assert.ok((await tx.select().from(familyMembers).where(eq(familyMembers.familyId, id))).every(row => row.status === "INATIVO"));
      });
      const entityInput = { code: fixture, name: fixture, type: "PREFEITURA", cnpj: null, companyId: null, parentId: null };
      const entityId = await master.saveGovernmentEntity(tx, null, entityInput); saved.set("entities", entityId);
      await t.test("hierarquia rejeita ciclos e inativação com vínculos ativos", async () => {
        const childId = await master.saveGovernmentEntity(tx, null, { ...entityInput, code: `${fixture}child`, parentId: entityId });
        await assert.rejects(master.assertHierarchy(tx, "entity", entityId, childId), /ciclo/);
        await assert.rejects(assertCanInactivate(tx, "entities", entityId), /1 vínculo/);
        await master.setMasterDataActive(tx, "entities", childId, false);
        await assertCanInactivate(tx, "entities", entityId);
        await assert.rejects(master.assertHierarchy(tx, "entity", null, childId), /inativo/);
      });
      const costCenterId = await master.saveCostCenter(tx, null, { code: fixture, name: fixture, description: null, parentId: null, governmentEntityId: entityId, secretariatId: null, departmentId: null, administrativeUnitId: null }); saved.set("costCenters", costCenterId);
      let ibgeCode = "";
      const knownCities = await tx.execute<{ ibgeCode: string }>(sql`SELECT "ibgeCode" FROM "City"`);
      for (let code = 9_990_001; code < 9_990_100; code++) if (!knownCities.rows.some(row => row.ibgeCode === String(code))) { ibgeCode = String(code); break; }
      assert.ok(ibgeCode);
      const cityId = await master.saveCity(tx, null, { stateId: state.id, ibgeCode, name: fixture }); saved.set("cities", cityId);
      const locality = { name: fixture, type: "Urbano", cityId, city: fixture, state: state.uf };
      const neighborhoodId = await master.saveNeighborhood(tx, null, { ...locality, adminRegion: null, notes: null }); saved.set("neighborhoods", neighborhoodId);
      const streetId = await master.saveStreet(tx, null, { ...locality, zipCode: "80000000", neighborhoodId }); saved.set("streets", streetId);
      await t.test("cidade/bairro preservam vínculos e impedem inativação prematura", async () => {
        await assert.rejects(assertCanInactivate(tx, "cities", cityId), /2 vínculo/);
        await assert.rejects(assertCanInactivate(tx, "neighborhoods", neighborhoodId), /1 vínculo/);
        assert.ok(await master.findActiveCityNeighborhood(tx, neighborhoodId, cityId));
        assert.equal(await master.findActiveCityNeighborhood(tx, neighborhoodId, "missing-city"), null);
        await master.saveNeighborhood(tx, neighborhoodId, { name: fixture, type: "Rural", adminRegion: null, notes: "nota" });
        assert.equal((await loadMasterDataPage(tx, "neighborhoods", fixture, 1)).rows[0]?.values.cityId, cityId);
      });
      const existingBanks = await tx.select({ compe: banks.compe, ispb: banks.ispb }).from(banks);
      let compe = "", ispb = "";
      for (let code = 900; code <= 999; code++) if (!existingBanks.some(row => row.compe === String(code) || row.ispb === `99999${code}`)) { compe = String(code); ispb = `99999${code}`; break; }
      assert.ok(compe);
      const bankId = await master.saveBank(tx, null, { compe, ispb, name: fixture, shortName: fixture }); saved.set("banks", bankId);
      const branchId = await master.saveBankBranch(tx, null, { bankId, cityId, code: "000001", name: fixture, cnpj: null }); saved.set("branches", branchId);
      await t.test("agência tem unicidade composta e impede inativar banco", async () => {
        await assert.rejects(assertCanInactivate(tx, "banks", bankId), /1 vínculo/);
        await assert.rejects(tx.transaction(nested => master.saveBankBranch(nested, null, { bankId, cityId, code: "000001", name: fixture, cnpj: null })), error => getPostgresError(error)?.code === "23505");
      });
      const taxId = await master.saveTax(tx, null, { code: fixture, name: fixture, taxType: "Taxa", governmentLevel: null, revenueNature: null, effectiveFrom: new Date("2026-01-01T12:00:00Z"), effectiveUntil: null, description: null }); saved.set("taxes", taxId);
      const productId = await master.saveCatalogItem(tx, null, { code: fixture, name: fixture, description: null, unit: "UN", category: null, productKind: "MATERIAL", specification: null, externalCode: null }); saved.set("products", productId);
      const existingCbos = await tx.execute<{ code: string }>(sql`SELECT code FROM "HealthCbo"`);
      let cboCode = "";
      for (let code = 999_000; code < 999_100; code++) if (!existingCbos.rows.some(row => row.code === String(code))) { cboCode = String(code); break; }
      assert.ok(cboCode);
      const cboId = await master.saveHealthCbo(tx, null, { code: cboCode, description: fixture }); saved.set("cbos", cboId);
      await t.test("moeda padrão muda atomicamente e não pode ser inativada", async () => {
        const existing = await tx.select({ isoCode: currencies.isoCode }).from(currencies);
        const isoCode = ["ZXA", "ZXB", "ZXC"].find(code => !existing.some(row => row.isoCode === code)); assert.ok(isoCode);
        const input = { isoCode, name: fixture, symbol: "F$", decimalPlaces: 2, isDefault: true };
        const id = await master.saveCurrency(tx, null, input); saved.set("currencies", id);
        assert.deepEqual((await tx.select({ id: currencies.id }).from(currencies).where(eq(currencies.isDefault, true))).map(row => row.id), [id]);
        await assert.rejects(assertCanInactivate(tx, "currencies", id), /1 vínculo/);
        await master.saveCurrency(tx, id, { ...input, isDefault: false });
        await assertCanInactivate(tx, "currencies", id);
      });
      await t.test("textos jurídicos versionam mudanças de conteúdo/vigência e assinatura preserva array", async () => {
        const input = { type: "LEI", number: fixture, summary: fixture, governmentLevel: "MUNICIPAL", issuingBody: fixture, publicationDate: null, effectiveFrom: null, effectiveUntil: null, governmentEntityId: entityId };
        const id = await master.saveLegalText(tx, null, input, "Conteúdo original"); saved.set("legalTexts", id);
        await master.saveLegalText(tx, id, input, "Conteúdo original");
        await master.saveLegalText(tx, id, { ...input, effectiveUntil: new Date("2027-01-01T12:00:00Z") }, "Conteúdo revisado");
        const versions = await tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, id)).orderBy(asc(legalTextVersions.versionNumber));
        assert.deepEqual(versions.map(row => [row.versionNumber, row.content]), [[1, "Conteúdo original"], [2, "Conteúdo revisado"]]);
        const signerId = await master.saveLegalReportSigner(tx, null, { personId: person.id, employeeId: null, governmentEntityId: entityId, signingRole: fixture, reportTypes: ["BALANCO", "RREO"], signatureOrder: 1, effectiveFrom: new Date("2026-01-01T12:00:00Z"), effectiveUntil: null }); saved.set("signers", signerId);
        const [signer] = await tx.select().from(legalReportSigners).where(eq(legalReportSigners.id, signerId));
        assert.deepEqual(signer.reportTypes, ["BALANCO", "RREO"]);
      });
      await t.test("todos os 14 catálogos alternam situação e carregam DTOs", async () => {
        assert.equal(saved.size, 14);
        for (const [catalog, id] of saved) {
          await master.setMasterDataActive(tx, catalog, id, false);
          const inactive = await loadMasterDataPage(tx, catalog, "", 1);
          // Query by fixture for records ordered outside the first page.
          const filtered = inactive.rows.find(row => row.id === id) ? inactive : await loadMasterDataPage(tx, catalog, catalog === "cbos" ? cboCode : fixture, 1);
          assert.equal(filtered.rows.find(row => row.id === id)?.active, false, catalog);
          await master.setMasterDataActive(tx, catalog, id, true);
        }
        await assert.rejects(master.setMasterDataActive(tx, "families", "missing-family", false), /não foi encontrado/);
      });
      await t.test("falha de auditoria reverte mutação e consistência gera ocorrências sem documento pessoal", async () => {
        const failedCode = `${fixture}audit`;
        await assert.rejects(tx.transaction(async nested => {
          const id = await master.saveGovernmentEntity(nested, null, { ...entityInput, code: failedCode });
          await insertAuditEvent(nested, { actorUsuarioId: "missing-drizzle-audit-actor", eventType: auditEventTypes.administrativeMutation, targetType: "GOVERNMENT_ENTITY", targetId: id });
        }), error => getPostgresError(error)?.code === "23503");
        assert.deepEqual(await tx.select({ id: governmentEntities.id }).from(governmentEntities).where(eq(governmentEntities.code, failedCode)), []);
        runId = await runMasterDataConsistency(tx);
        const [run] = await tx.select().from(consistencyRuns).where(eq(consistencyRuns.id, runId));
        assert.equal(run.status, "CONCLUIDA"); assert.ok(run.completedAt);
        const issues = await tx.select().from(consistencyIssues).where(and(eq(consistencyIssues.runId, runId), inArray(consistencyIssues.recordId, [person.id, other.id])));
        assert.equal(issues.length, 2);
        assert.ok(issues.every(row => row.issueType === "CANONICAL_DOCUMENT_INVALID" && row.severity === "ALTA"));
      });
      throw rollback;
    }, { timeoutMs: 100_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: families.id }).from(families).where(eq(families.code, fixture)), []);
    assert.deepEqual(await connection.db.select({ id: consistencyRuns.id }).from(consistencyRuns).where(eq(consistencyRuns.id, runId)), []);
    assert.deepEqual(await connection.db.select({ id: governmentEntities.id }).from(governmentEntities).where(eq(governmentEntities.code, fixture)), []);
  } finally { await connection.pool.end(); }
});
