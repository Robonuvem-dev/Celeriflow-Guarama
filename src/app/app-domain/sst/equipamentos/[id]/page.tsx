import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { equipmentScope } from "@/lib/sst/equipment-queries";
import type { Equipment } from "@/lib/sst/equipment-service";
import { equipmentBiometricIntegration } from "@/lib/sst/equipment-policy";
import { EquipmentNav,equipmentDate } from "../EquipmentUi";

export default async function EquipmentDetail({params}:{params:Promise<{id:string}>}) {
  const context=await getTenantContextForModule("SST"); const {id}=await params; const scope=await equipmentScope(context);
  const [equipment]=await context.prisma.$queryRaw<Equipment[]>`SELECT e.*,m."name",m."code" FROM "SstEquipment" e JOIN "Material" m ON m."id"=e."materialId" WHERE e."id"=${id} AND e."budgetUnitId" ${scope.sql}`; if(!equipment) notFound();
  const supplier=equipment.supplierId?await context.prisma.supplier.findUnique({where:{id:equipment.supplierId},include:{person:true,company:true}}):null;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">{equipment.code} — {equipment.name}</h1><EquipmentNav/><dl className="grid gap-2 text-sm"><dt>Tipo</dt><dd>{equipment.kind}</dd><dt>Certificado de aprovação</dt><dd>{equipment.ca||"Não aplicável"} · Vencimento {equipmentDate(equipment.caValidUntil,true)}</dd><dt>Validade de uso</dt><dd>{equipment.validityDays} dias após entrega</dd><dt>Revisão</dt><dd>A cada {equipment.reviewDays} dias; próxima data definida na revisão</dd><dt>Fornecedor canônico</dt><dd>{supplier?.person?.fullName||supplier?.company?.corporateName||"Não informado"}</dd></dl><section className="rounded border p-4"><h2 className="font-semibold">Integração biométrica pendente</h2><p>Hardware/SDK não disponíveis. Nenhuma confirmação biométrica é simulada ou aceita.</p><ul className="list-disc pl-5">{equipmentBiometricIntegration.requirements.map(r=><li key={r}>{r}</li>)}</ul></section></div>;
}
