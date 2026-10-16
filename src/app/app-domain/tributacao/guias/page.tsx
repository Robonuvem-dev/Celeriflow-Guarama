import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxAssessmentAccessFilter } from "@/lib/tributacao/scope";
import GuiasClient from "./GuiasClient";
import { PaymentReversalForm } from "./PaymentReversalForm";

export const dynamic = "force-dynamic";

export default async function GuiasPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const guias = await prisma.taxGuide.findMany({
    where: { assessment: taxAssessmentAccessFilter(isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds) },
    include: {
      assessment: {
        include: {
          taxpayer: { include: { person: true, company: true } },
          tax: true
        }
      },
      payments: { where: { status: "Confirmado" }, select: { id: true, amountPaidDecimal: true, paymentDate: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const displayGuides = guias.map(({ totalValueDecimal, payments, ...guide }) => {
    const totalValue = Number(totalValueDecimal ?? guide.totalValue);
    const paidValue = payments.reduce((total, payment) => total + Number(payment.amountPaidDecimal ?? 0), 0);
    return {
      ...guide,
      totalValue,
      outstandingValue: totalValue - paidValue,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <PaymentReversalForm payments={guias.flatMap((guide) => guide.payments.map((payment) => ({ id: payment.id, label: `${guide.guideNumber ?? guide.id} · ${payment.paymentDate.toISOString().slice(0, 10)} · R$ ${payment.amountPaidDecimal?.toFixed(2) ?? "não conciliado"}` })))} />
      <GuiasClient guias={displayGuides} />
    </div>
  );
}
