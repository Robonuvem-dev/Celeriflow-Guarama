import type { ReportDefinition } from "@/lib/reports/report-engine";
import { AccessError, isSystemAdministrator } from "@/lib/platform/tenant-context";
import {
  generateInternalReportDataset,
  type InternalReportDataset,
  type InternalReportType,
} from "./report-delivery";
import { createReportTemplatePresentation, type ReportEmissionMetadata, type ReportInstitutionIdentity } from "@/lib/reports/report-template";
import { databaseConnection, db } from "@/db/client";
import { findFinancialScopeUnits, findFinancialScopeYear } from "@/db/repositories/finance/report-scopes";
import { findReportTemplate } from "@/db/repositories/platform/report-template";
import { readFinancialReportEmitter } from "@/db/repositories/finance/report-emitter";
import { readFinanceReportInstitution } from "@/db/repositories/finance/report-delivery";

export const financeInternalReportKey = "finance.internal";

export type FinanceReportInput = {
  financialYearId: string;
  reportType: InternalReportType;
  month?: number;
};

export type FinanceReportDataset = {
  financialYearId: string;
  reportType: InternalReportType;
  report: InternalReportDataset;
  presentation?: {
    institution: ReportInstitutionIdentity | null;
    template: ReturnType<typeof createReportTemplatePresentation>;
    emission: ReportEmissionMetadata | null;
  };
};

export function createFinanceReportDataset(
  financialYear: { id: string; year: number },
  reportType: InternalReportType,
  report: InternalReportDataset,
): FinanceReportDataset {
  return { financialYearId: financialYear.id, reportType, report };
}

export const financeInternalReportDefinition: ReportDefinition<FinanceReportInput, FinanceReportDataset> = {
  key: financeInternalReportKey,
  moduleCode: "FINANCEIRO",
  async createDataset(context, input) {
    const database = context.database ?? db;
    const financialYear = await findFinancialScopeYear(database, input.financialYearId);
    if (!financialYear) {
      throw new AccessError("Exercício financeiro não encontrado.", 404);
    }
    if (!isSystemAdministrator(context.user)) {
      const bindings = financialYear.governmentEntityId ? await findFinancialScopeUnits(database, { governmentEntityId: financialYear.governmentEntityId, budgetUnitIds: context.user.allowedBudgetUnitIds }) : [];
      if (!bindings.length) throw new AccessError("Exercício fora das entidades autorizadas.", 403);
    }

    const [report, institution, storedTemplate, emitter] = await Promise.all([
      generateInternalReportDataset(
        databaseConnection,
        input.reportType,
        financialYear.id,
        financialYear.year,
        { month: input.month },
        { budgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds },
      ),
      readFinanceReportInstitution(database),
      findReportTemplate(database, "GLOBAL"),
      readFinancialReportEmitter(database, context.user.id, context.user.name),
    ]);
    const template = createReportTemplatePresentation(storedTemplate);
    return {
      ...createFinanceReportDataset(financialYear, input.reportType, report),
      presentation: {
        institution,
        template,
        emission: template.includeEmissionMetadata ? { issuedAt: new Date().toISOString(), issuedBy: emitter } : null,
      },
    };
  },
  auditTarget() {
    return {
      targetType: "REPORT_DEFINITION",
      targetId: financeInternalReportKey,
    };
  },
};
