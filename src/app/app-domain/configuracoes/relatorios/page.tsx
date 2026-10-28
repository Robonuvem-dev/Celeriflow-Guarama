import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { createReportTemplatePresentation, reportTemplateScope } from "@/lib/reports/report-template";
import { ReportTemplateForm } from "./ReportTemplateForm";
import { FileText } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { findReportTemplate } from "@/db/repositories/platform/report-template";

export const dynamic = "force-dynamic";

export default async function ReportTemplatePage() {
  const context = await getTenantContextForModule("CONFIGURACOES");
  const { user } = context;
  const storedTemplate = await findReportTemplate(context.database ?? db, reportTemplateScope);
  const template = createReportTemplatePresentation(storedTemplate);

  return <PageFrame className="space-y-3 px-1 py-1 md:px-2"><PageHeader title="Relatórios da instância" icon={<FileText className="size-4 shrink-0 text-slate-700 dark:text-slate-300" />} className="dark:border-slate-700 dark:bg-slate-800 dark:[&>h1]:text-white" /><p className="text-sm text-slate-500 dark:text-slate-400">Um único modelo visual é aplicado aos relatórios internos. Arquivamento, publicação e assinatura são fluxos separados.</p>{isSystemAdministrator(user) ? <ReportTemplateForm template={template} /> : <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">O modelo global de relatórios é gerenciado pelo administrador do sistema.</div>}</PageFrame>;
}
