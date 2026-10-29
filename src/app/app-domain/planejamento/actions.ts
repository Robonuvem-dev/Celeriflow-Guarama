"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getPlanningContext } from "@/lib/planejamento/access";
import { planningConnection } from "@/lib/planejamento/database";
import { jurisdictionSchema, planningBasePath } from "@/lib/planejamento/policy";
import { addPlanningAction, addPlanningLine, addPlanningMemory, addPlanningProgram, addPlanningWaiver, configurePlanningEntity, createPlanningInstrument } from "@/lib/planejamento/service";
import { AccessError } from "@/lib/platform/tenant-context";
import { createPlanningCatalog, saveRevenueAllocation } from "@/lib/planejamento/catalog";
import { addAllocatedPlanningRevenue, addApprovedPlanningLine, addPlanningTransfer } from "@/lib/planejamento/service";
import { decideCommunityDemand, registerCommunityDemand, registerPlanningHearing } from "@/lib/planejamento/hearings";
import { importPlanningLines, importPlanningStructure, previewPlanningImport } from "@/lib/planejamento/imports";
import { registerPlanningMovement } from "@/lib/planejamento/revisions";
import { applyPlanningCompatibility, propagatePlanningCompatibility, transitionPlanningPiece, updatePlanningPhysical } from "@/lib/planejamento/versions";
import { createLegislativePlanningAmendment, decideLegislativePlanningAmendment, setPlanningAmendmentBlock } from "@/lib/planejamento/amendments";
import { contingencyPlanningBudget, generatePlanningSchedule, planningQuotaEvent, redistributePlanningQuotas } from "@/lib/planejamento/scheduling";
import { createPlanningCreditPreview, transitionPlanningCredit } from "@/lib/planejamento/credits";
import { addPlanningWork, configurePlanningFiscalReport } from "@/lib/planejamento/reports";
import { reorderPlanningExpenseCodes, setPlanningReducedCode } from "@/lib/planejamento/reduced-codes";
import { reconcilePlanningLegacyAppropriation } from "@/lib/planejamento/legacy-reconciliation";
import { configurePlanningInternalAccounting, configurePlanningInternalExecution, synchronizePlanningAccounting } from "@/lib/planejamento/accounting-bridge";
import { linkPlanningDocument, requestPlanningDocumentSignatures } from "@/lib/planejamento/documents";
import { importPlanningCatalogVersion, publishPlanningCatalogVersion } from "@/lib/planejamento/classification";
import { maintainPlanningRecord } from "@/lib/planejamento/maintenance";
import { planningLookup } from "@/lib/planejamento/lookups";
import { advancePlanningLegislativeProcedure, linkPlanningLegislativeProcedure } from "@/lib/planejamento/legislative-bridge";
import { synchronizePlanningWaiver } from "@/lib/planejamento/fiscal-execution";
import { projectPlanningAnnualMemory } from "@/lib/planejamento/projections";
import { configurePlanningReportLayout } from "@/lib/planejamento/report-layouts";
import { publishPlanningReport, withdrawPlanningPublication } from "@/lib/planejamento/publication";
import { adoptMunicipalCatalog, createCanonicalActivityReference, importSharedReferenceCatalog } from "@/lib/planejamento/catalog-adoption";
import { configureMunicipalActivityRelation } from "@/lib/planejamento/activity-relations";

export async function searchPlanningOptions(jurisdiction: string, input: Record<string, string>) {
  try { const context = await getPlanningContext(jurisdictionSchema.parse(jurisdiction)); return { ...await planningLookup(context, input), error: undefined }; }
  catch (error) { return { options: [], total: 0, page: 1, error: error instanceof Error ? error.message : "Não foi possível consultar as opções." }; }
}

export async function previewPlanningImportAction(jurisdiction: string, input: Record<string, string>) {
  try { const context = await getPlanningContext(jurisdictionSchema.parse(jurisdiction)); const clean = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== "")); return { data: await previewPlanningImport(context, clean), error: undefined }; }
  catch (error) { return { data: undefined, error: error instanceof Error && !error.message.includes("Invalid `") ? error.message : "Não foi possível calcular a prévia." }; }
}

export async function savePlanningRecord(jurisdiction: string, operation: string, input: Record<string, string>): Promise<{ error?: string; id?: string }> {
  try {
    const sector = jurisdictionSchema.parse(jurisdiction);
    const context = await getPlanningContext(sector);
    const clean = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== ""));
    let id: string | undefined;
    switch (operation) {
      case "instrument": id = await createPlanningInstrument(context, clean); break;
      case "program": id = await addPlanningProgram(context, clean); break;
      case "action": id = await addPlanningAction(context, clean); break;
      case "line": id = await addPlanningLine(context, clean); break;
      case "allocatedRevenue": id = await addAllocatedPlanningRevenue(context, clean); break;
      case "catalog": id = await createPlanningCatalog(context, clean); break;
      case "catalogVersion": id = await importPlanningCatalogVersion(context, clean); break;
      case "catalogPublish": id = await publishPlanningCatalogVersion(context, clean); break;
      case "catalogAdopt": id = await adoptMunicipalCatalog(context, clean); break;
      case "catalogReference": id = await createCanonicalActivityReference(context, clean); break;
      case "catalogRelation": id = await configureMunicipalActivityRelation(context, clean); break;
      case "catalogReferenceImport": id = await importSharedReferenceCatalog(context, clean); break;
      case "maintenance": id = await maintainPlanningRecord(context, clean); break;
      case "allocation": id = await saveRevenueAllocation(context, clean); break;
      case "hearing": id = await registerPlanningHearing(context, clean); break;
      case "demand": id = await registerCommunityDemand(context, clean); break;
      case "demandDecision": id = await decideCommunityDemand(context, clean); break;
      case "import": id = await importPlanningLines(context, clean); break;
      case "structureImport": id = await importPlanningStructure(context, clean); break;
      case "movement": id = await registerPlanningMovement(context, clean); break;
      case "approvedLine": id = await addApprovedPlanningLine(context, clean); break;
      case "transfer": id = await addPlanningTransfer(context, clean); break;
      case "workflow": id = await transitionPlanningPiece(context, clean); break;
      case "compatibility": id = await applyPlanningCompatibility(context, clean); break;
      case "compatibilityBatch": id = await propagatePlanningCompatibility(context, clean); break;
      case "physical": id = await updatePlanningPhysical(context, clean); break;
      case "amendment": id = await createLegislativePlanningAmendment(context, clean); break;
      case "amendmentDecision": id = await decideLegislativePlanningAmendment(context, clean); break;
      case "amendmentBlock": id = await setPlanningAmendmentBlock(context, clean); break;
      case "schedule": id = await generatePlanningSchedule(context, clean); break;
      case "quotaEvent": id = await planningQuotaEvent(context, clean); break;
      case "contingency": id = await contingencyPlanningBudget(context, clean); break;
      case "redistribute": id = await redistributePlanningQuotas(context, clean); break;
      case "credit": id = await createPlanningCreditPreview(context, clean); break;
      case "creditTransition": id = await transitionPlanningCredit(context, clean); break;
      case "fiscalRule": id = await configurePlanningFiscalReport(context, clean); break;
      case "work": id = await addPlanningWork(context, clean); break;
      case "reducedCode": id = await setPlanningReducedCode(context, clean); break;
      case "reorderCodes": id = await reorderPlanningExpenseCodes(context, clean); break;
      case "legacyBind": id = await reconcilePlanningLegacyAppropriation(context, clean); break;
      case "accountingConfigure": id = await configurePlanningInternalAccounting(context, clean); break;
      case "accountingSynchronize": id = await synchronizePlanningAccounting(context, clean); break;
      case "executionConfigure": id = await configurePlanningInternalExecution(context, clean); break;
      case "documentLink": id = await linkPlanningDocument(context, clean); break;
      case "documentSignatures": id = await requestPlanningDocumentSignatures(context, clean); break;
      case "legislativeLink": id = await linkPlanningLegislativeProcedure(context, clean); break;
      case "legislativeTransition": id = await advancePlanningLegislativeProcedure(context, clean); break;
      case "waiverSync": id = await synchronizePlanningWaiver(context, clean); break;
      case "annualProjection": id = await projectPlanningAnnualMemory(context, clean); break;
      case "reportLayout": id = await configurePlanningReportLayout(context, clean); break;
      case "reportPublish": id = (await publishPlanningReport({ ...context, connection: planningConnection(context) }, clean)).id; break;
      case "reportWithdraw": id = await withdrawPlanningPublication({ ...context, connection: planningConnection(context) }, clean); break;
      case "memory": id = await addPlanningMemory(context, clean); break;
      case "waiver": id = await addPlanningWaiver(context, clean); break;
      case "scope": await configurePlanningEntity(context, clean.governmentEntityId, clean.budgetUnitId); break;
      default: return { error: "Operação inválida." };
    }
    revalidatePath(planningBasePath(sector), "layout");
    revalidatePath("/financeiro", "layout");
    revalidatePath("/compras", "layout");
    return { id };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues.map((issue) => issue.message).join(" ") };
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof Error && !error.message.includes("Invalid `")) return { error: error.message };
    return { error: "Não foi possível salvar o registro. Confira os dados e tente novamente." };
  }
}
