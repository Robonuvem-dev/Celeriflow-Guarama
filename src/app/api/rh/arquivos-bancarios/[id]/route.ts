import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readBankFile } from "@/lib/rh/bank-file-service";
import { renderHrReport } from "@/lib/rh/report-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports"), { id } = await params;
  const file = await readBankFile(context.database ?? db, context, id), format = request.nextUrl.searchParams.get('format');
  if (format === 'PDF' || format === 'CSV' || format === 'XLSX') {
    const report = { title: `Relação de créditos — ${file.competence} — remessa ${file.input.sequence} — total BRL ${file.total} — SHA-256 ${file.fileSha256}`, headers: ['Matrícula','Nome completo','Banco','Agência','Conta corrente','Valor a creditar BRL','Demonstrativo','Fonte da conta'], rows: file.recipients.map(row => [row.registration,row.name,row.bank,`${row.agency}${row.agencyDv ? '-'+row.agencyDv : ''}`,`${row.account}${row.accountDv ? '-'+row.accountDv : ''}${row.accountSecondDv ?? ''}`,row.net,row.statementId,row.accountSource]) };
    const output = await renderHrReport(report, format);
    return new NextResponse(new Uint8Array(output.bytes), { headers: { 'Content-Type': output.contentType, 'Content-Disposition': `attachment; filename="relacao-${file.input.sequence}.${format.toLowerCase()}"`, 'Cache-Control': 'private, no-store' } });
  }
  return new NextResponse(new Uint8Array(file.bytes), { headers: { 'Content-Type': 'text/plain; charset=us-ascii', 'Content-Disposition': `attachment; filename="${file.input.layout}-${file.input.sequence}.txt"`, 'Cache-Control': 'private, no-store', 'X-Content-SHA256': file.fileSha256 } });
}
