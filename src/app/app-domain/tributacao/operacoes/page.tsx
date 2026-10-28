import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listPageTaxes, listPageAssessments } from "@/db/repositories/taxation-pages/assessments";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listFiscalProcessOptions, listFiscalDocumentOptions } from "@/db/repositories/taxation-pages/lookups";
import { listPageServiceActivities, listPageParameters } from "@/db/repositories/taxation-pages/fiscal-options";
import { readPageServiceRequests, readPageCertificateEvaluations } from "@/db/repositories/taxation-pages/operations";
import OperacoesTributariasClient from "./OperacoesTributariasClient";
import { PageFrame } from "@/components/app-ui/PageFrame";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OperacoesTributariasPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [taxes, taxpayers, processes, documents, activities, assessments, parameters, requests, evaluations] = await Promise.all([
    listPageTaxes(database),
    listPageTaxpayers(database, { active: true, order: "created-desc" }),
    listFiscalProcessOptions(database, 100),
    listFiscalDocumentOptions(database, 100, true),
    listPageServiceActivities(database),
    listPageAssessments(database, { allowedBudgetUnitIds, statuses: ["Lançado", "Emitido", "Parcial"], limit: 30 }),
    listPageParameters(database, 10),
    readPageServiceRequests(database),
    readPageCertificateEvaluations(database),
  ]);
  const name = (taxpayer: typeof taxpayers[number]) => taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Contribuinte sem nome";
  return <PageFrame className="space-y-3"><Link href="/tributacao/lotes-anuais" className="block underline">Simulação e efetivação anual por lote</Link><OperacoesTributariasClient taxes={taxes.map((tax) => ({ id: tax.id, name: tax.name }))} taxpayers={taxpayers.map((taxpayer) => ({ id: taxpayer.id, name: name(taxpayer) }))} processes={processes} documents={documents} activities={activities.map((activity) => ({ id: activity.id, name: `${activity.code} - ${activity.name} (${activity.tax.name})`, rate: activity.issRate?.toString() ?? "-" }))} assessments={assessments.map((assessment) => ({ id: assessment.id, label: `${assessment.assessmentNumber ?? assessment.id} - ${assessment.tax.name} - ${name(assessment.taxpayer)}` }))} parameters={parameters.map((parameter) => ({ id: parameter.id, label: `${parameter.tax.name}: ${parameter.code} (${parameter.calculationType})` }))} requests={requests.map((request) => ({ id: request.id, serviceType: request.serviceType, status: request.status, taxpayer: name(request.taxpayer), process: request.process?.protocolNumber ?? "Sem processo" }))} evaluations={evaluations.map((evaluation) => ({ id: evaluation.id, result: evaluation.result, pendingCount: evaluation.pendingCount, taxpayer: name(evaluation.taxpayer), date: evaluation.evaluatedAt.toISOString() }))} /></PageFrame>;
}
