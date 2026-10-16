import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "@/lib/sst/access";
import { ProgramForm } from "./ProgramForm";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { z } from "zod";

export default async function SstProgramsPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; personQ?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), select: { id: true, name: true }, orderBy: { name: "asc" } });
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const where = { budgetUnitId: { in: unit ? [unit.id] : units.map((item) => item.id) } };
  const total = await context.prisma.sstOccupationalProgram.count({ where });
  const page = Math.min(Math.max(1, Math.trunc(Number(params.page)) || 1), Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.sstOccupationalProgram.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, code: true, kind: true, version: true, startsAt: true, endsAt: true, responsibleSnapshot: true } });
  const programs = records.map((record) => ({ ...record, responsible: { fullName: z.object({ name: z.string() }).parse(record.responsibleSnapshot).name } }));
  const groups = unit ? await context.prisma.sstExposureGroup.findMany({ where: { budgetUnitId: unit.id, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take: 200 }) : [];
  const people = params.personQ && params.personQ.trim().length >= 3 ? await context.prisma.person.findMany({ where: { fullName: { contains: params.personQ.trim(), mode: "insensitive" } }, take: 20, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true } }) : [];
  const href = (value: number) => `/sst/programas?${new URLSearchParams({ budgetUnitId: unit?.id || "", personQ: params.personQ || "", page: String(value) })}`;
  const date = (value: Date) => value.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Programas e laudos ocupacionais</h1><form className="flex flex-wrap gap-2"><select name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Selecione a UG</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="personQ" defaultValue={params.personQ} placeholder="Responsável técnico no Cadastro Único (3 letras)" className="min-w-0 flex-1 rounded border p-2"/><button className="rounded border p-2">Carregar opções</button></form>{unit && <details className="rounded border p-3"><summary>Registrar programa ou nova versão</summary><ProgramForm budgetUnitId={unit.id} groups={groups} people={people}/></details>}<table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Código/tipo</th><th className="p-2">Versão</th><th className="p-2">Vigência</th><th className="p-2">Responsável</th><th className="p-2">Detalhes</th></tr></thead><tbody>{programs.map((program) => <tr className="border-b" key={program.id}><td className="break-words p-2">{program.code} · {program.kind}</td><td className="p-2">{program.version}</td><td className="p-2">{date(program.startsAt)} — {date(program.endsAt)}</td><td className="break-words p-2">{program.responsible.fullName}</td><td className="p-2"><Link className="underline" href={`/sst/programas/${program.id}`}>Abrir versão</Link></td></tr>)}</tbody></table><ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/></div>;
}
