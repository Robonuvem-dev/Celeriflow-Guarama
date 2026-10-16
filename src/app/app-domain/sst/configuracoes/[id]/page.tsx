import { getTenantContextForModule, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { SstForm } from "../../SstForm";
import { ReasonFields } from "../../ReasonFields";
import { updateSstReason, setSstReasonActive } from "../../agenda-actions";
import Link from "next/link";

export default async function EditSstReasonPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST");
  const { id } = await params;
  const reason = await context.prisma.sstCertificateReason.findUnique({ where: { id } });
  if (!reason) notFound();
  assertBudgetUnitAccess(context.user, reason.budgetUnitId);
  const roles = await context.prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const regimes = await context.prisma.hrEmploymentRegime.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const [policy] = await context.prisma.$queryRaw<{ restrictedRegimeIds: string[] }[]>`SELECT "restrictedRegimeIds" FROM "SstReasonRegimePolicy" WHERE "reasonId"=${id} ORDER BY version DESC LIMIT 1`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Editar motivo · {reason.name}</h1><Link href="/sst/configuracoes">Voltar</Link><p>Atestados existentes preservam a configuração de integração registrada na entrega.</p><SstForm action={updateSstReason}><ReasonFields reason={reason} roles={roles} regimes={regimes} restrictedRegimeIds={policy?.restrictedRegimeIds || []}/></SstForm><SstForm action={setSstReasonActive} label={reason.isActive ? "Inativar motivo" : "Reativar motivo"}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!reason.isActive)}/><p>Situação atual: {reason.isActive ? "Ativo" : "Inativo"}. O histórico de uso será preservado.</p></SstForm></div>;
}
