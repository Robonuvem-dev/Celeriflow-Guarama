import { NextResponse } from "next/server";
import { Decimal } from "@/db/decimal";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { findBankNotificationTechnicalUser, findBankStatementNotification, insertBankException, insertBankStatementNotification, listAutomationBankAccounts } from "@/db/repositories/finance/bank-automation";
import { insertAnnualAudit } from "@/db/repositories/finance/annual-stages";
import { isPocVirtualBank } from "@/lib/poc/poc-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook para recepção de notificações de repasses e receitas externas enviadas pelo Simulador Bancário
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const secretKey = process.env.SIMULADOR_WEBHOOK_SECRET;
    if (!secretKey) {
      return NextResponse.json({ error: "Webhook bancário não configurado." }, { status: 503 });
    }

    if (authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json({ error: "Não autorizado: Token de Webhook inválido." }, { status: 401 });
    }

    const payload = await req.json();

    const {
      siglaReceita,
      nomeReceita,
      valor,
      banco,
      agencia,
      contaNumero,
      autenticacaoBancaria,
      dataCredito,
    } = payload;

    if (!siglaReceita || !autenticacaoBancaria || !contaNumero || !agencia || !banco || !Number.isFinite(Number(valor)) || Number(valor) <= 0) {
      return NextResponse.json({ error: "Payload do webhook incompleto." }, { status: 400 });
    }
    if (!isPocVirtualBank(banco)) {
      return NextResponse.json({ error: "A POC aceita webhooks somente do Banco Virtual Robonuvem." }, { status: 422 });
    }

    const [[account], technicalUser] = await Promise.all([
      listAutomationBankAccounts(db, { bankName: banco, agency: agencia, accountNumber: contaNumero, requireUnit: true }),
      findBankNotificationTechnicalUser(db),
    ]);
    if (!account) return NextResponse.json({ error: "Conta bancária do webhook não cadastrada, ativa e vinculada a uma Unidade Gestora." }, { status: 422 });
    if (!technicalUser) return NextResponse.json({ error: "Usuário técnico de auditoria não provisionado." }, { status: 503 });

    const item = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const existing = await findBankStatementNotification(tx, { bank: banco, agency: agencia, accountNumber: contaNumero, reference: autenticacaoBancaria });
      if (existing) return existing;
      const created = await insertBankStatementNotification(tx, {
          banco,
          agencia,
          contaNumero,
          tipoConta: "CORRENTE",
          date: dataCredito ? new Date(dataCredito) : new Date(),
          description: `${siglaReceita} - ${nomeReceita || "REPASSE EXTERNO CONSTITUCIONAL"}`,
          reference: autenticacaoBancaria,
          codigoTransacao: autenticacaoBancaria,
          sinal: "CREDITO",
          direction: "CREDIT",
          valueDecimal: new Decimal(valor),
          status: "Pendente",
          categoriaClassificada: "RECEITA_CONSTITUCIONAL",
      });
      await insertAnnualAudit(tx, {
          action: "WEBHOOK_RECEITA_EXTERNA_RECEBIDA",
          entityType: "BankStatementItem",
          entityId: created.id,
          authorUsuarioId: technicalUser.id,
          budgetUnitId: account.budgetUnitId ?? undefined,
          payload: { siglaReceita, valor, autenticacaoBancaria, bankAccountId: account.id },
      });
      await insertBankException(tx, {
          statementItemId: created.id,
          descricao: created.description || siglaReceita,
          valorDecimal: new Decimal(valor),
          dataMovimento: created.date,
          banco,
          contaNumero,
          sinal: "CREDITO",
          scoreConfianca: 0.98,
          sugestaoTipo: siglaReceita,
          motivoExcecao: "Receita externa aguardando confirmação do operador financeiro.",
      });
      return created;
    });

    return NextResponse.json({
      success: true,
      message: `Receita ${siglaReceita} no valor de R$ ${valor} registrada via Webhook com sucesso.`,
      statementItemId: item.id,
    });
  } catch (err: unknown) {
    console.error("[Webhook Banco Error]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao processar webhook bancário." }, { status: 500 });
  }
}
