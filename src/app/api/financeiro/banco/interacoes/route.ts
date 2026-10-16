import { NextRequest, NextResponse } from "next/server";
import { applyPaymentBankReturn } from "@/lib/financeiro/payment-bank-return";
import { bankIntegrationClient } from "@/lib/financeiro/bank-integration-client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.BANK_SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const actor = await prisma.usuario.findFirst({
    where: { ativo: true, employeeId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, employeeId: true },
  });
  if (!actor?.employeeId) return NextResponse.json({ error: "Usuário técnico financeiro não configurado." }, { status: 503 });

  const interactions = await bankIntegrationClient.fetchPendingInteractions();
  let completed = 0;
  for (const interaction of interactions) {
    if (interaction.interactionType !== "PAYMENT_ORDER_STATUS_CHANGED") continue;
    const paymentOrderExternalId = stringField(interaction.payload, "payment_order_external_id");
    const status = stringField(interaction.payload, "status");
    if (!paymentOrderExternalId || !status) {
      await bankIntegrationClient.acknowledgeInteraction(interaction.externalId, "FAILED", "Retorno de pagamento sem identificadores obrigatórios.");
      continue;
    }

    try {
      await applyPaymentBankReturn(prisma, { usuarioId: actor.id, employeeId: actor.employeeId }, interaction.payload);

      await bankIntegrationClient.acknowledgeInteraction(interaction.externalId, "COMPLETED");
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar retorno bancário.";
      await bankIntegrationClient.acknowledgeInteraction(interaction.externalId, "FAILED", message);
    }
  }
  return NextResponse.json({ completed });
}
