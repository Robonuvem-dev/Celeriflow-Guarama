import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as administration from "../src/db/repositories/sst-pages/administration";
import * as agenda from "../src/db/repositories/sst-pages/agenda";
import * as programs from "../src/db/repositories/sst-pages/programs";
import * as clinical from "../src/db/repositories/sst-pages/clinical-options";
import * as aso from "../src/db/repositories/sst-pages/aso";
import * as certificates from "../src/db/repositories/sst-pages/certificates";
import * as equipment from "../src/db/repositories/sst-pages/equipment";
import * as functional from "../src/db/repositories/sst-pages/functional-options";
import * as benefits from "../src/db/repositories/sst-pages/benefits";
import * as prevention from "../src/db/repositories/sst-pages/prevention";
import * as accidents from "../src/db/repositories/sst-pages/accidents";

const connectionString = process.env.SST_PAGES_NEON_URL;

test("SST pages: physical Neon SQL/column contracts on one read-only transaction", { skip: !connectionString }, async () => {
  assert.ok(connectionString);
  const connection = createDatabaseConnection(connectionString);
  try {
    await withDatabaseTransaction(connection, async database => {
      // An impossible scope validates real SQL compilation/decoding without
      // exposing or mutating clinical data. No DDL, fixtures or audit writes.
      const id = "sst-pages-contract-no-record-2026-10-28";
      const unit = { id, name: "Contract check", secretariatId: id };
      const now = new Date("2026-10-28T00:00:00.000Z");
      const settings = await administration.readSstSettingsPage(database, [], "1", false);
      assert.equal(settings.total, 0);
      assert.equal(await administration.findSstReasonPage(database, id), null);
      await administration.readSstReasonOptions(database, id);
      assert.equal((await administration.readSstProfessionalsPage(database, [], "1", false)).total, 0);
      assert.equal((await administration.readSstShiftsPage(database, [], unit, "1")).total, 0);
      assert.equal((await administration.readSstBoardsPage(database, [], "1")).total, 0);
      assert.equal((await administration.readSstExposurePage(database, unit, {}, now)).total, 0);
      assert.equal((await agenda.readSstAgendaPage(database, [], { availabilityId: id })).selected, null);
      assert.deepEqual(await agenda.readSstAgendaEmployees(database, id), []);
      assert.equal((await agenda.readSstAppointmentsPage(database, [], { q: id })).total, 0);
      assert.equal(await agenda.findSstAppointmentPage(database, id), null);
      assert.equal((await programs.readSstProgramsPage(database, [], id, "1")).total, 0);
      assert.equal(await programs.findSstProgramScope(database, id), undefined);
      assert.equal(await programs.findSstProgramPage(database, id), null);
      assert.equal((await clinical.readSstQuestionnairesPage(database, [], { q: id })).total, 0);
      assert.equal(await clinical.findSstQuestionnaireScope(database, id), undefined);
      assert.equal(await clinical.findSstQuestionnairePage(database, id), undefined);
      assert.deepEqual(await clinical.searchSstWorkerPeople(database, id), []);
      assert.deepEqual(await clinical.searchSstPageVaccines(database, id), []);
      assert.deepEqual(await clinical.searchSstPageMedicines(database, id), []);
      assert.deepEqual(await clinical.readSstUserProfessionals(database, id, "MEDICINE", id, true), []);
      assert.deepEqual((await clinical.readSstClinicalQuestionnaireOptions(database, id, "MEDICINE", { questionnaireVersionId: id })).versions, []);
      await clinical.readSstRestrictionOptions(database, [unit], [id]);
      assert.deepEqual(await clinical.readSstRestrictionDetailsOptions(database, id, id), { outbox: [], doctors: [] });
      assert.equal((await aso.readSstAsosPage(database, [], { q: id }, now, now)).total, 0);
      assert.deepEqual(await aso.searchSstAsoLaboratories(database, id), []);
      assert.deepEqual(await aso.readSstAsoPrograms(database, id), []);
      assert.deepEqual(await aso.readSstAsoQuestionnaires(database, id), []);
      assert.deepEqual(await aso.readSstAsoFunctionalPeriods(database, id, [id]), []);
      assert.equal(await aso.findSstAsoSettings(database, id), undefined);
      assert.equal(await aso.findSstAsoScope(database, id), undefined);
      assert.equal(await aso.findSstAsoCorrection(database, id), undefined);
      assert.equal((await aso.readSstAnamnesisHistory(database, id, id, { questionnaireVersionId: id })).total, 0);
      assert.equal(await aso.findSstAnamnesisScope(database, id), undefined);
      assert.equal(await aso.findSstAnamnesisPage(database, id), undefined);
      assert.deepEqual((await certificates.readSstNewCertificateOptions(database, unit, id)).employees, []);
      assert.equal(await certificates.findSstCertificateScope(database, id), undefined);
      assert.deepEqual((await certificates.readSstCertificateDetailsOptions(database, id, id)).revisions, []);
      assert.equal((await certificates.readSstCertificateFinancialPage(database, id, "1")).financialCount.total, 0);
      assert.equal(await certificates.findSstCertificateReceipt(database, id), undefined);
      assert.equal(await equipment.findSstEquipmentPolicy(database, id), undefined);
      assert.deepEqual(await equipment.readSstEquipmentCatalogOptions(database, { materialQ: id, supplierQ: id }), { materials: [], supplierRecords: [] });
      assert.equal(await equipment.findSstEquipmentPage(database, id, sql`IN (${id})`), undefined);
      assert.equal(await equipment.findSstEquipmentSupplier(database, id), undefined);
      assert.deepEqual(await equipment.searchSstPageEquipment(database, id, id), []);
      assert.deepEqual((await equipment.readSstEquipmentDeliveryOptions(database, unit, { employeeQ: id, personQ: id })).warehouses, []);
      assert.deepEqual(await equipment.readSstEquipmentLots(database, id, now), []);
      assert.deepEqual((await equipment.readSstEquipmentRequirementOptions(database, id, [], { programGroupId: id })).groups, []);
      assert.deepEqual((await functional.readSstFunctionalOptions(database, unit, id, false)).mapping, []);
      assert.deepEqual((await functional.readSstServiceOrderOptions(database, id, { materialQ: id })).responsibilities, []);
      assert.deepEqual((await benefits.readSstBenefitRegistrationPage(database, [unit], id, { planId: id, payrollBenefitId: id })).plans, []);
      assert.deepEqual((await prevention.readSstPreventionOptions(database, unit, id)).records, []);
      assert.deepEqual(await accidents.searchSstAccidentEmployees(database, [], id), []);
      assert.deepEqual(await accidents.readSstAccidentClinicalOptions(database, id, id), { doctors: [], attendances: [] });
    }, { accessMode: "read only", isolationLevel: "repeatable read", timeoutMs: 60_000 });
  } finally { await connection.pool.end(); }
});
