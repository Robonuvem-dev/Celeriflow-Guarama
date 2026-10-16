import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getTenantContextForModule, assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { riskInput, examOccasions } from "@/lib/sst/program-policy";

export default async function SstProgramVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST");
  const { id } = await params;
  const scope = await context.prisma.sstOccupationalProgram.findUnique({ where: { id }, select: { budgetUnitId: true } });
  if (!scope) notFound();
  assertBudgetUnitAccess(context.user, scope.budgetUnitId);
  const record = await context.prisma.sstOccupationalProgram.findUniqueOrThrow({ where: { id }, include: { budgetUnit: { select: { name: true } }, groups: true } });
  const responsible = z.object({ name: z.string(), council: z.string() }).parse(record.responsibleSnapshot);
  const program = { ...record, responsible: { fullName: responsible.name }, responsibleCouncil: responsible.council };
  const content = z.record(z.string(), z.string()).parse(program.content);
  const date = (value: Date) => value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return <div className="space-y-4 p-4"><header><h1 className="text-xl font-semibold">{program.kind} · {program.code} · Versão {program.version}</h1><Link href="/sst/programas">Voltar aos programas</Link></header><section className="space-y-2 rounded border p-4"><p>UG: {program.budgetUnit.name}</p><p>Vigência: {date(program.startsAt)} — {date(program.endsAt)}</p><p>Responsável: {program.responsible.fullName} · {program.responsibleCouncil}</p></section><section className="grid gap-3 rounded border p-4 sm:grid-cols-2">{Object.entries(content).filter(([, value]) => value).map(([key, value]) => <div key={key}><h2 className="font-semibold">{({ objectives: "Objetivos", responsibilities: "Responsabilidades", procedures: "Procedimentos", records: "Registro e arquivo", firstAid: "Primeiros socorros", campaigns: "Campanhas" } as Record<string, string>)[key] || key}</h2><p className="whitespace-pre-wrap">{value}</p></div>)}</section>{program.groups.map((entry) => {
    const group = z.object({ code: z.string(), name: z.string(), conditions: z.string() }).parse(entry.groupSnapshot);
    const risks = z.array(riskInput.safeExtend({ score: z.number().nullable() })).parse(entry.risks);
    const exams = z.array(z.object({ name: z.string(), occasion: z.enum(examOccasions) })).parse(entry.exams);
    return <section key={entry.id} className="space-y-3 rounded border p-4"><h2 className="text-lg font-semibold">GHE {group.code} · {group.name}</h2><p className="whitespace-pre-wrap">{group.conditions}</p>{risks.map((risk, index) => <article className="space-y-2 rounded border p-3" key={index}><h3 className="font-semibold">{risk.description}</h3><p>Perigo: {risk.danger}</p><p>Danos: {risk.possibleDamage}</p><p>Propagação: {risk.propagation}</p><p>Fontes: {risk.sources}</p><p>Controle: {risk.controls}</p><p>Exposição: {risk.exposureMinutes} minutos/dia</p><p>EPI: {risk.epiApplicable ? risk.epis.join(", ") : "Não aplicável"}</p><p>Probabilidade: {risk.probability ?? "Não avaliada"} · Severidade: {risk.severity ?? "Não avaliada"} · Pontuação: {risk.score ?? "Não avaliada"}</p></article>)}{exams.map((exam, index) => <p key={index}>{exam.occasion}: {exam.name}</p>)}</section>;
  })}</div>;
}
