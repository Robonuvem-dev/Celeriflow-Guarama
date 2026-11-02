import Link from "next/link";
import { ZodError } from "zod";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { parseRecyclingReportFilters, RecyclingReportError } from "@/lib/environment/recycling-reports";
import { readRecyclingReport } from "@/lib/environment/recycling-report-service";
import { ReportView } from "./ReportView";

export const dynamic = "force-dynamic";
export default async function RecyclingReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getTenantContextForModuleOperation("MEIO_AMBIENTE", "issueReports");
  let report: Awaited<ReturnType<typeof readRecyclingReport>> | undefined;
  let message = "";
  try {
    const raw = await searchParams;
    const query = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const filters = parseRecyclingReportFilters(query);
    report = await readRecyclingReport(databaseConnection, filters, query.page);
  } catch (error) {
    if (!(error instanceof RecyclingReportError || error instanceof ZodError)) throw error;
    message = error instanceof RecyclingReportError ? error.message : "Confira os filtros do relatório.";
  }
  if (!report) return <section role="alert" className="space-y-3 p-5"><p>{message}</p><Link className="underline" href="/meio-ambiente/residuos/relatorios">Rever filtros</Link><p><Link className="underline" href="/meio-ambiente/residuos/estoque">Voltar ao estoque</Link></p></section>;
  return <ReportView data={report.data} entries={report.entries} />;
}
