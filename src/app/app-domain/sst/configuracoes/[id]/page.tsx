import { getTenantContextForModule, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { SstForm } from "../../SstForm";
import { ReasonFields } from "../../ReasonFields";
import { updateSstReason, setSstReasonActive } from "../../agenda-actions";
import Link from "next/link";
import { findSstReasonPage, readSstReasonOptions } from "@/db/repositories/sst-pages/administration";
import { sstDatabase } from "@/lib/sst/database";

export default async function EditSstReasonPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST");
  const { id } = await params;
  const database = sstDatabase(context);
  const reason = await findSstReasonPage(database, id);
  if (!reason) notFound();
  assertBudgetUnitAccess(context.user, reason.budgetUnitId);
  const { roles, regimes, policy } = await readSstReasonOptions(database, id);
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Editar motivo · {reason.name}</h1><Link href="/sst/configuracoes">Voltar</Link><p>Atestados existentes preservam a configuração de integração registrada na entrega.</p><SstForm action={updateSstReason}><ReasonFields reason={reason} roles={roles} regimes={regimes} restrictedRegimeIds={policy?.restrictedRegimeIds || []}/></SstForm><SstForm action={setSstReasonActive} label={reason.isActive ? "Inativar motivo" : "Reativar motivo"}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!reason.isActive)}/><p>Situação atual: {reason.isActive ? "Ativo" : "Inativo"}. O histórico de uso será preservado.</p></SstForm></div>;
}
