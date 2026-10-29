import { randomUUID } from "node:crypto";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { listOwnPartnerDiscounts } from "@/lib/rh/partner-discounts";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { PartnerDiscountForm, PartnerInstallmentForm } from "./DiscountForms";
import { PublicOperationalList } from "../PublicOperationalList";
import { PublicRowAction } from "../PublicRowAction";

export const dynamic = "force-dynamic";
export default async function PartnerDiscountPortal() {
  const context = await getCurrentTenantContext(), { grants, agreements } = await listOwnPartnerDiscounts(context);
  return <main className="mx-auto max-w-5xl space-y-2 px-4 py-3"><PortalBreadcrumb current="Descontos conveniados" /><h1 className="text-xl font-bold">Descontos conveniados</h1><p className="text-sm">Operações nos contratos e rubricas expressamente habilitados pelo RH para sua conta.</p>
    {grants.map((grant) => <details key={grant.id} className="rounded border bg-white p-2"><summary className="cursor-pointer font-semibold">{grant.name} — reservar cronograma</summary><p className="whitespace-pre-wrap text-sm">{grant.policy.instructions}</p><PartnerDiscountForm grantId={grant.id} requestKey={randomUUID()} contracts={grant.contracts} /></details>)}
    {!grants.length && <p>Nenhuma autorização de convenente/departamento disponível para esta conta.</p>}
    <PublicOperationalList id="convenentes" caption="Parcelas dos contratos autorizados" columns={[["contract", "Contrato", 130, 100, "identifier"], ["sequence", "Parcela", 90, 70], ["competence", "Competência", 130, 100], ["value", "Valor BRL", 130, 100, "text", "right"], ["entries", "Operações de origem", 220, 130], ["actions", "Lançamento", 140, 140, "actions"]]}
      rows={agreements.flatMap((agreement) => {
        const grant = grants.find((item) => item.policy.supplierId === agreement.supplierId && item.contracts.some((contract) => contract.id === agreement.contractId) && item.policy.sourceRunId === agreement.sourceRunId);
        return agreement.installments.map((installment) => ({ id: installment.id, label: `Contrato ${agreement.number} — parcela ${installment.sequence}`, values: { contract: agreement.number, sequence: String(installment.sequence), competence: installment.competenceAt.toLocaleDateString("pt-BR", { timeZone: "UTC", month: "2-digit", year: "numeric" }), value: installment.amount.toFixed(2), entries: installment.entries.map((entry) => entry.kind).join(" · ") }, actions: grant && grant.policy.payrollIds.length > 0 && !installment.entries.some((entry) => entry.kind === "LANCAMENTO") ? <PublicRowAction label="Lançar parcela" title={`Contrato ${agreement.number} — parcela ${installment.sequence}`}><PartnerInstallmentForm grantId={grant.id} installmentId={installment.id} payrollIds={grant.policy.payrollIds} /></PublicRowAction> : undefined }));
      })} />
  </main>;
}
