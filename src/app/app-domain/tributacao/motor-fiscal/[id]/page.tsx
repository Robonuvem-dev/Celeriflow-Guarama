import Link from "next/link";
import { notFound } from "next/navigation";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { isPageAssessmentVisible } from "@/db/repositories/taxation-pages/assessments";
import { getAssessmentAccount } from "@/lib/tributacao/s2-service";

export const dynamic = "force-dynamic";
const money = (value: string | number) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default async function AssessmentAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  if (!await isPageAssessmentVisible(database, id, isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds)) notFound();
  const result = await getAssessmentAccount(database, id).catch(() => null); if (!result) notFound();
  const { assessment, events, position } = result;
  const name = assessment.taxpayer.company?.corporateName ?? assessment.taxpayer.person?.fullName ?? "Contribuinte";
  const movements = [
    { id: `origin-${assessment.id}`, date: assessment.createdAt, type: "CONSTITUIÇÃO", reference: assessment.assessmentNumber ?? assessment.id, amount: position.total.toFixed(2), status: assessment.status },
    ...events.map((event) => ({ id: event.id, date: event.createdAt, type: String(data(event.data).eventType ?? event.title), reference: event.processId ?? event.documentId ?? event.id, amount: String(data(event.data).amount ?? "0"), status: event.status })),
    ...assessment.guides.flatMap((guide) => guide.payments.map((payment) => ({ id: payment.id, date: payment.paymentDate, type: "PAGAMENTO", reference: guide.guideNumber ?? guide.id, amount: `-${payment.amountPaidDecimal?.toFixed(2) ?? payment.amountPaid}`, status: payment.status }))),
  ].sort((a,b) => a.date.getTime()-b.date.getTime());
  return <TaxOperationalTable id="conta-corrente"
    actions={<Link href="/tributacao/motor-fiscal" className="h-7 rounded border px-2 text-xs">Voltar</Link>}
    toolbar={<><span className="min-w-0 flex-1 truncate text-[13px]">Conta {assessment.assessmentNumber ?? assessment.id} · {assessment.tax.name} · {name}</span><OperationalFilters label="Posição integral"><dl>{[["Constituído", money(position.total.toFixed(2))], ["Pago", money(position.paid.toFixed(2))], ["Extinto sem caixa", money(position.extinct.toFixed(2))], ["Saldo", money(position.balance.toFixed(2))], ["Situação", assessment.status]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></OperationalFilters></>}
    columns={[["date", "Data", 95, 110], ["type", "Movimento", 130, 200], ["reference", "Referência / processo", 170, 300, "identifier"], ["value", "Valor", 120, 150, "text", "right"], ["status", "Situação", 110, 150, "status"]]}
    rows={movements.map(movement => ({ id: movement.id, label: movement.reference, values: { date: movement.date.toLocaleDateString("pt-BR"), type: movement.type, reference: movement.reference, value: money(movement.amount), status: movement.status } }))} />;
}
