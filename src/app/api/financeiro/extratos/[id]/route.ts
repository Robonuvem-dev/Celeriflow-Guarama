import { NextRequest, NextResponse } from "next/server";
import { AccessError, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { downloadFilename, getFile } from "@/lib/platform/blob";
import { db } from "@/db/client";
import { findArchivedStatementAccount, readAutomatedStatementDownload } from "@/db/repositories/finance/bank-statements";
import { financialAuditLogs } from "@/db/schema/finance-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await getTenantContextForModule("FINANCEIRO");
    const executor = context.database ?? db;
    const download = await readAutomatedStatementDownload(executor, id);
    if (!download) return NextResponse.json({ error: "Extrato não encontrado." }, { status: 404 });
    const account = await findArchivedStatementAccount(executor, { bankName: download.banco, agency: download.agencia, accountNumber: download.contaNumero });
    if (!isSystemAdministrator(context.user) && (!account?.budgetUnitId || !context.user.allowedBudgetUnitIds.includes(account.budgetUnitId))) {
      throw new AccessError("Acesso negado à unidade gestora do extrato bancário.", 403);
    }

    const file = await getFile(download.caminhoDestino);
    if (!file?.stream) return NextResponse.json({ error: "Arquivo de extrato não encontrado." }, { status: 404 });

    await executor.insert(financialAuditLogs).values({
      action: "CONSULTA_ARQUIVO_EXTRATO",
      entityType: "AutomatedBankDownload",
      entityId: download.id,
      authorUsuarioId: context.user.id,
    });

    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.blob.contentType || "text/plain; charset=utf-8",
        "Content-Disposition": `inline; filename="${downloadFilename(file.blob.pathname)}"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao abrir extrato bancário arquivado:", error);
    return NextResponse.json({ error: "Não foi possível abrir o extrato arquivado." }, { status: 500 });
  }
}
