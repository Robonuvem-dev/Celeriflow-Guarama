import Link from "next/link";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { db } from "@/db/client";
import { buildSocialReport } from "@/db/repositories/social/reports";
import { socialReportFilter } from "@/lib/social/report-contract";
import { socialAccessibleUnitOptions } from "@/db/repositories/social/queries";
import { SocialReportPreview } from "./SocialReportPreview";
import { readSocialWorkflow } from "@/db/repositories/social/workflow-queries";

export default async function SocialReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports"), access = await resolveSocialAccess(context);
  const query = await searchParams, now = new Date().toISOString().slice(0, 10);
  const parsed = socialReportFilter.safeParse({ from: now.slice(0, 8) + "01", to: now, ...query });
  if (!parsed.success) return <main className="p-4"><p role="alert">Período ou filtros inválidos.</p><Link href="/social/relatorios">Limpar filtros</Link></main>;
  const report = await buildSocialReport(context.database ?? db, access, parsed.data), units = await socialAccessibleUnitOptions(context.database ?? db, access);
  const { options } = await readSocialWorkflow(context.database ?? db, access, "scfv");
  return <SocialReportPreview report={report} filters={parsed.data} units={units} options={options} />;
}
