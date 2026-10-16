import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "@/lib/sst/access";
import { createSstCertificate } from "../../actions";
import { SstForm } from "../../SstForm";
import Link from "next/link";

export default async function NewSstCertificatePage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; employeeId?: string; personQ?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), orderBy: { name: "asc" }, select: { id: true, name: true, secretariatId: true } });
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const employees = unit ? await context.prisma.employee.findMany({ where: { isActive: true, secretariatId: unit.secretariatId }, select: { id: true, name: true, registration: true }, orderBy: { name: "asc" } }) : [];
  const reasons = unit ? await context.prisma.sstCertificateReason.findMany({ where: { budgetUnitId: unit.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, dependentPolicy: true } }) : [];
  const dependents = employees.some((item) => item.id === params.employeeId) ? await context.prisma.dependent.findMany({ where: { employeeId: params.employeeId }, select: { id: true, name: true } }) : [];
  const issuers = params.personQ && params.personQ.trim().length >= 3 ? await context.prisma.person.findMany({ where: { fullName: { contains: params.personQ.trim(), mode: "insensitive" } }, take: 20, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }) : [];
  const clinical = unit && (isSystemAdministrator(context.user) || Boolean(await context.prisma.sstAccessGrant.findFirst({ where: { usuarioId: context.user.id, budgetUnitId: unit.id, isActive: true, canReadClinical: true }, select: { id: true } })));
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Registrar atestado</h1><Link href="/sst/atestados">Voltar à consulta</Link>
    <form className="grid gap-3 rounded border p-4 sm:grid-cols-2"><label>Unidade gestora<select name="budgetUnitId" className="block w-full rounded border p-2" defaultValue={params.budgetUnitId} required><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Servidor<select name="employeeId" className="block w-full rounded border p-2" defaultValue={params.employeeId}><option value="">Selecione após carregar a unidade</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.registration}</option>)}</select></label><label>Emitente no Cadastro Único<input name="personQ" defaultValue={params.personQ} placeholder="Nome, ao menos 3 letras" className="block w-full rounded border p-2"/></label><button className="self-end rounded border p-2">Carregar opções</button></form>
    {unit && !clinical && <p role="alert">Solicite autorização clínica ocupacional nesta unidade gestora.</p>}
    {clinical && <SstForm action={createSstCertificate} redirectBase="/sst/atestados" receipt>
      <input type="hidden" name="budgetUnitId" value={unit!.id}/><input type="hidden" name="employeeId" value={params.employeeId || ""}/>
      <p>Servidor: {employees.find((item) => item.id === params.employeeId)?.name || "Selecione e carregue o servidor acima."}</p>
      <label>Motivo<select required name="reasonId" className="block w-full rounded border p-2"><option value="">Selecione</option>{reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name} · dependente: {reason.dependentPolicy}</option>)}</select></label>
      <label>Profissional emitente<select required name="issuerPersonId" className="block w-full rounded border p-2"><option value="">Pesquise e carregue o emitente acima</option>{issuers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select></label>
      <label>Registro do conselho (tipo, UF e número)<input required name="issuerCouncil" className="block w-full rounded border p-2"/></label>
      <label>Dependente<select name="dependentId" className="block w-full rounded border p-2"><option value="">Sem dependente</option>{dependents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label>Início<input required type="datetime-local" name="startsAt" className="block w-full rounded border p-2"/></label><label>Término<input required type="datetime-local" name="endsAt" className="block w-full rounded border p-2"/></label></div>
      <label>CIDs (separados por vírgula)<input name="cidCodes" className="block w-full rounded border p-2" placeholder="Z00.0, M54.5"/></label>
      <label>Apresentação (se geração manual)<input name="presentedAt" type="datetime-local" className="block w-full rounded border p-2"/></label><label>Protocolo (se geração manual)<input name="protocolNumber" className="block w-full rounded border p-2"/></label>
      <label>Identificador do processo digital (opcional)<input name="processId" className="block w-full rounded border p-2"/><span className="text-xs text-slate-500">O vínculo exige acesso ao módulo Processos e ao setor do processo. Os anexos clínicos permanecem restritos ao SST.</span></label>
    </SstForm>}
  </div>;
}
