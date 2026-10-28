import type { DatabaseConnection } from "../../src/db/connection";
import * as stock from "../../src/lib/saude/health-stock-service";
import * as invoice from "../../src/lib/saude/pharmacy-invoice-service";
import * as catalog from "../../src/lib/saude/pharmacy-catalog-service";
import * as dispensation from "../../src/lib/saude/pharmacy-dispensation-service";
import * as judicial from "../../src/lib/saude/pharmacy-judicial-service";
import * as kit from "../../src/lib/saude/pharmacy-kit-service";
import * as inventory from "../../src/lib/saude/pharmacy-inventory-service";
import * as request from "../../src/lib/saude/pharmacy-request-service";
import * as vaccination from "../../src/lib/saude/vaccination-service";
import * as registry from "../../src/lib/saude/vaccination-registry-service";
import * as vaccineStock from "../../src/lib/saude/vaccination-stock-service";
import * as tfd from "../../src/lib/saude/tfd-service";
import * as clinicalTfd from "../../src/lib/saude/tfd-clinical-service";
import * as transport from "../../src/lib/saude/tfd-transport-service";
import { tfdPatientDocument as patientDocument } from "../../src/lib/saude/tfd-document-service";
import { tfdTripDocument as tripDocument } from "../../src/lib/saude/tfd-trip-document";
import { tfdProcessReport as processReport } from "../../src/lib/saude/tfd-report-service";
import { getHealthRaasSources as raasSources } from "../../src/lib/saude/raas-source-service";
import * as followup from "../../src/lib/saude/followup-exchange-service";
import { processHealthFollowupBatch as receiveFollowup } from "../../src/lib/saude/followup-receiver-service";

/** Typed argument binding only: invokes the real exported operation, with its
 * original inputs and its final connection. No persistence implementation,
 * return adaptation, catches, retries, mocks or alternative client here. */
function bindConnection<C, I, R>(connection: DatabaseConnection, operation: (context: C, input: I, connection: DatabaseConnection) => R) {
  return (context: C, input: I) => operation(context, input, connection);
}

export function bindHealthChecklistDrizzleServices(connection: DatabaseConnection) {
  return {
    postHealthStockReceipt: bindConnection(connection, stock.postHealthStockReceipt),
    approveHealthStockReceipt: bindConnection(connection, stock.approveHealthStockReceipt),
    dispatchHealthStockTransfer: bindConnection(connection, stock.dispatchHealthStockTransfer),
    receiveHealthStockTransfer: bindConnection(connection, stock.receiveHealthStockTransfer),
    configureHealthReceiptApproval: (context: Parameters<typeof stock.configureHealthReceiptApproval>[0], warehouseId: string, required: boolean) => stock.configureHealthReceiptApproval(context, warehouseId, required, connection),
    importPharmacyInvoice: bindConnection(connection, invoice.importPharmacyInvoice),
    saveDcbSubstance: bindConnection(connection, catalog.saveDcbSubstance),
    savePharmacyProductCatalog: bindConnection(connection, catalog.savePharmacyProductCatalog),
    saveCatmatUnitMapping: bindConnection(connection, catalog.saveCatmatUnitMapping),
    dispenseElectronicPrescription: bindConnection(connection, dispensation.dispenseElectronicPrescription),
    dispenseManualMedicine: bindConnection(connection, dispensation.dispenseManualMedicine),
    cancelMedicineDispensation: bindConnection(connection, dispensation.cancelMedicineDispensation),
    correctMedicineDispensation: bindConnection(connection, dispensation.correctMedicineDispensation),
    savePharmacyLawyer: bindConnection(connection, judicial.savePharmacyLawyer),
    createPharmacyJudicialCase: bindConnection(connection, judicial.createPharmacyJudicialCase),
    transitionPharmacyJudicialCase: bindConnection(connection, judicial.transitionPharmacyJudicialCase),
    renewPharmacyJudicialCase: bindConnection(connection, judicial.renewPharmacyJudicialCase),
    savePharmacyKit: bindConnection(connection, kit.savePharmacyKit),
    generatePharmacyKits: bindConnection(connection, kit.generatePharmacyKits),
    deliverPharmacyKit: bindConnection(connection, kit.deliverPharmacyKit),
    recordUncollectedPharmacyKit: bindConnection(connection, kit.recordUncollectedPharmacyKit),
    returnPharmacyKit: bindConnection(connection, kit.returnPharmacyKit),
    startPharmacyInventory: bindConnection(connection, inventory.startPharmacyInventory),
    countPharmacyInventory: bindConnection(connection, inventory.countPharmacyInventory),
    submitPharmacyInventory: bindConnection(connection, inventory.submitPharmacyInventory),
    closePharmacyInventory: bindConnection(connection, inventory.closePharmacyInventory),
    createPharmacyStockRequest: bindConnection(connection, request.createPharmacyStockRequest),
    fulfillPatientPharmacyRequest: bindConnection(connection, request.fulfillPatientPharmacyRequest),
    cancelPharmacyProductFulfillment: bindConnection(connection, request.cancelPharmacyProductFulfillment),
    cancelPharmacyStockRequest: bindConnection(connection, request.cancelPharmacyStockRequest),
    recordVaccination: bindConnection(connection, vaccination.recordVaccination),
    saveVaccineManufacturer: bindConnection(connection, registry.saveVaccineManufacturer),
    saveVaccineCodeMapping: bindConnection(connection, registry.saveVaccineCodeMapping),
    configureVaccineStock: bindConnection(connection, registry.configureVaccineStock),
    saveVaccineCalendarRule: bindConnection(connection, registry.saveVaccineCalendarRule),
    saveVaccineInteraction: bindConnection(connection, registry.saveVaccineInteraction),
    saveVaccinationCampaign: bindConnection(connection, registry.saveVaccinationCampaign),
    recordVaccinationCardEvent: bindConnection(connection, registry.recordVaccinationCardEvent),
    revokeVaccinationCardEvent: bindConnection(connection, registry.revokeVaccinationCardEvent),
    recordVaccineAdverseEvent: bindConnection(connection, registry.recordVaccineAdverseEvent),
    addVaccineAdverseConduct: bindConnection(connection, registry.addVaccineAdverseConduct),
    receiveVaccineVials: bindConnection(connection, vaccineStock.receiveVaccineVials),
    prepareVaccineVial: bindConnection(connection, vaccineStock.prepareVaccineVial),
    recordVaccineDoseLoss: bindConnection(connection, vaccineStock.recordVaccineDoseLoss),
    reconcileOpenedVaccineVial: bindConnection(connection, vaccineStock.reconcileOpenedVaccineVial),
    createTfdRequest: bindConnection(connection, tfd.createTfdRequest),
    authorizeTfdRequest: bindConnection(connection, tfd.authorizeTfdRequest),
    addPassenger: bindConnection(connection, tfd.addPassenger),
    requestPassengerRemoval: bindConnection(connection, tfd.requestPassengerRemoval),
    movePassenger: (context: Parameters<typeof tfd.movePassenger>[0], passengerId: string, tripId: string) => tfd.movePassenger(context, passengerId, tripId, connection),
    confirmPassengerRemoval: (context: Parameters<typeof tfd.confirmPassengerRemoval>[0], passengerId: string, approve: boolean) => tfd.confirmPassengerRemoval(context, passengerId, approve, connection),
    updateTripStatus: (context: Parameters<typeof tfd.updateTripStatus>[0], tripId: string, status: string) => tfd.updateTripStatus(context, tripId, status, connection),
    saveTfdClinicalReport: bindConnection(connection, clinicalTfd.saveTfdClinicalReport),
    addTfdReportSupplement: bindConnection(connection, clinicalTfd.addTfdReportSupplement),
    transitionTfdClinicalRequest: bindConnection(connection, clinicalTfd.transitionTfdClinicalRequest),
    requestTfdBenefit: bindConnection(connection, clinicalTfd.requestTfdBenefit),
    transitionTfdBenefit: bindConnection(connection, clinicalTfd.transitionTfdBenefit),
    createTfdTripFromBooking: bindConnection(connection, transport.createTfdTripFromBooking),
    confirmTfdTrip: bindConnection(connection, transport.confirmTfdTrip),
    recordTfdPassengerBoarding: bindConnection(connection, transport.recordTfdPassengerBoarding),
    tfdPatientDocument: (context: Parameters<typeof patientDocument>[0], requestId: string, kind: Parameters<typeof patientDocument>[2], version?: number) => patientDocument(context, requestId, kind, version, connection),
    tfdTripDocument: (context: Parameters<typeof tripDocument>[0], tripId: string) => tripDocument(context, tripId, connection.db),
    tfdProcessReport: (context: Parameters<typeof processReport>[0], input: unknown) => processReport(context, input, connection.db),
    getHealthRaasSources: (context: Parameters<typeof raasSources>[0], input: unknown) => raasSources(context, input, connection.db),
    configureHealthFollowup: bindConnection(connection, followup.configureHealthFollowup),
    generateHealthFollowupBatches: bindConnection(connection, followup.generateHealthFollowupBatches),
    processHealthFollowupBatch: (context: Parameters<typeof receiveFollowup>[0], batchId: string, contract?: Parameters<typeof receiveFollowup>[2]) => receiveFollowup(context, batchId, contract, connection),
  };
}
