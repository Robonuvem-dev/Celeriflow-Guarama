import assert from "node:assert/strict";
import test from "node:test";
import { config } from "dotenv";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { getPostgresError } from "../src/db/errors";
import { withDatabaseTransaction } from "../src/db/transaction";
import { environmentalEnterprises, environmentalLicenses } from "../src/db/schema/environment";
import * as operations from "../src/db/repositories/environment/operations";
import * as queries from "../src/db/repositories/environment/queries";
import { generateEnvironmentalLicense } from "../src/lib/meio-ambiente/licenciamento-engine";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

test("Meio Ambiente: CRUDs, relações opcionais, licenças únicas, hash e rollback", {
  skip: process.env.DRIZZLE_VERIFY_DATABASE !== "1", timeout: 120_000,
}, async t => {
  const url = process.env.DATABASE_URL;
  assert.ok(url);
  const connection = createDatabaseConnection(url);
  const fixture = createId();
  const rollback = new Error("expected environment rollback");
  try {
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const enterprise = await operations.insertEnterprise(tx, { name: fixture, cnpjCpf: null, activityType: "Comércio", potentialRisk: "Baixo", address: null });
      assert.equal(enterprise.status, "Ativo");
      assert.equal(enterprise.updatedAt instanceof Date, true);
      await t.test("licença mantém vínculo obrigatório, datas nulas, unicidade e suspensão", async () => {
        const license = await operations.insertLicense(tx, { licenseNumber: fixture, licenseType: "Operação", enterpriseId: enterprise.id, validUntil: null });
        assert.equal(license.validUntil, null);
        await operations.updateLicense(tx, license.id, { status: "Suspensa" });
        const found = (await queries.listLicenses(tx, { status: "Suspensa" })).find(row => row.id === license.id);
        assert.equal(found?.enterprise.name, fixture);
        await assert.rejects(tx.transaction(nested => operations.insertLicense(nested, { licenseNumber: fixture, licenseType: "Prévia", enterpriseId: enterprise.id, validUntil: null })), error => getPostgresError(error)?.code === "23505");
        await assert.rejects(tx.transaction(nested => operations.insertLicense(nested, { licenseNumber: `${fixture}-missing`, licenseType: "Prévia", enterpriseId: "missing-fixture-enterprise", validUntil: null })), error => getPostgresError(error)?.code === "23503");
        await operations.deleteLicense(tx, license.id);
        await assert.rejects(operations.deleteLicense(tx, license.id), /Registro não encontrado/);
      });
      await t.test("denúncia anônima, vistoria e documentos preservam nulabilidade e anexos", async () => {
        const complaint = await operations.insertComplaint(tx, { complaintType: fixture, description: fixture, address: null, isAnonymous: true });
        await operations.updateComplaint(tx, complaint.id, { status: "Encerrada", description: fixture, address: null });
        assert.equal((await queries.listComplaints(tx, { tipo: fixture }))[0].isAnonymous, true);
        await operations.deleteComplaint(tx, complaint.id);
        const inspection = await operations.insertInspection(tx, { inspector: fixture, notes: null, enterpriseId: null });
        await operations.updateInspection(tx, inspection.id, { inspector: fixture, notes: null, enterpriseId: null, status: "Realizada" });
        const found = (await queries.listInspections(tx, { status: "Realizada" })).find(row => row.id === inspection.id);
        assert.equal(found?.enterprise, null);
        assert.equal(found?.dateScheduled, null);
        await operations.deleteInspection(tx, inspection.id);
        const document = await operations.insertDocument(tx, { title: fixture, docType: fixture, enterpriseId: enterprise.id, fileUrl: "https://example.invalid/fixture.pdf" });
        await operations.updateDocument(tx, document.id, { title: "Atualizado", docType: fixture, enterpriseId: null });
        const saved = (await queries.listDocuments(tx, { tipo: fixture }))[0];
        assert.equal(saved.enterprise, null);
        assert.equal(saved.fileUrl, "https://example.invalid/fixture.pdf");
        await operations.deleteDocument(tx, document.id);
      });
      await t.test("área verde, resíduo e educação mantêm medidas e estados existentes", async () => {
        const area = await operations.insertGreenArea(tx, { name: fixture, areaType: "Parque", sizeSqm: 123.45, location: null, status: "Preservado", notes: null });
        await operations.updateGreenArea(tx, area.id, { status: "Degradado" });
        assert.equal((await queries.listGreenAreas(tx, { status: "Degradado" })).find(row => row.id === area.id)?.sizeSqm, 123.45);
        const waste = await operations.insertWaste(tx, { generatorName: fixture, wasteType: fixture, quantityKg: 0.75, destination: "Reciclagem", notes: null, enterpriseId: null });
        await operations.updateWaste(tx, waste.id, { generatorName: fixture, wasteType: fixture, quantityKg: 1.25, destination: "Reciclagem", notes: null, enterpriseId: enterprise.id });
        assert.equal((await queries.listWastes(tx, { tipo: fixture }))[0].enterprise?.id, enterprise.id);
        await operations.deleteWaste(tx, waste.id);
        const program = await operations.insertEducationProgram(tx, { title: fixture, description: fixture, targetAudience: null, startDate: new Date("2099-01-01T12:00:00Z"), endDate: null, participantsCount: null, status: "Planejado" });
        await operations.updateEducationProgram(tx, program.id, { title: fixture, description: fixture, targetAudience: null, startDate: program.startDate, endDate: null, participantsCount: 20, status: "Concluído" });
        assert.equal((await queries.listEducationPrograms(tx, { status: "Concluído" })).find(row => row.id === program.id)?.participantsCount, 20);
        await operations.deleteEducationProgram(tx, program.id);
      });
      await t.test("motor legado mantém hash do processo e impede segunda emissão para o mesmo processo", async () => {
        const input = { numeroProcesso: fixture, tipoLicenca: "LP - Licença Prévia" as const, requerenteNome: fixture, requerenteCnpjCpf: "fixture", atividade: "Comércio", enderecoEmpreendimento: "Local de verificação", validadeMeses: 12 };
        const issued = await generateEnvironmentalLicense(tx, input);
        const expectedHash = crypto.createHash("sha256").update(`${issued.numeroLicenca}:${fixture}:fixture:${issued.validadeData.toISOString()}`).digest("hex");
        assert.equal(issued.hashSHA256, expectedHash);
        assert.equal(issued.status, "EMITIDA");
        assert.ok(issued.qrCodeValidationUrl.includes(expectedHash));
        await assert.rejects(tx.transaction(nested => generateEnvironmentalLicense(nested, input)), error => getPostgresError(error)?.code === "23505");
      });
      await operations.updateEnterprise(tx, enterprise.id, { status: "Inativo" });
      assert.equal((await queries.listEnterprises(tx, { status: "Inativo" })).find(row => row.id === enterprise.id)?.status, "Inativo");
      throw rollback;
    }, { timeoutMs: 90_000 }), error => error === rollback);
    assert.deepEqual(await connection.db.select({ id: environmentalEnterprises.id }).from(environmentalEnterprises).where(eq(environmentalEnterprises.name, fixture)), []);
    assert.deepEqual(await connection.db.select({ id: environmentalLicenses.id }).from(environmentalLicenses).where(eq(environmentalLicenses.licenseNumber, fixture)), []);
  } finally { await connection.pool.end(); }
});
