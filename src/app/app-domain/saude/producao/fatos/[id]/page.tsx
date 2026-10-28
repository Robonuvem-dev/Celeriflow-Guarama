import Link from "next/link";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthProductionFacts, healthProductionCompetences, healthProductionCriticisms, healthProductionFactRevisions } from "@/db/schema/health-production";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthCareAgreements } from "@/db/schema/health-agreements";
import { healthPerformedProcedures } from "@/db/schema/health-care";
import { assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ProcedureField } from "../../laudos/TreatmentReportEditor";
import { reviseManualFactAction } from "./actions";
import { z } from "zod";
const field = "w-full rounded border bg-white p-2 text-sm";

export default async function ProductionFactPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), id = decodeURIComponent((await params).id);
  const database = context.database ?? db;
  const [row] = await database.select({ fact: healthProductionFacts, procedure: healthSusProcedures, unit: { name: healthUnits.name }, employee: { name: employees.name }, person: { fullName: people.fullName }, competence: { status: healthProductionCompetences.status } }).from(healthProductionFacts).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthProductionFacts.procedureId)).leftJoin(healthUnits, eq(healthUnits.id, healthProductionFacts.unitId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthProductionFacts.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(patientTable, eq(patientTable.id, healthProductionFacts.patientId)).leftJoin(people, eq(people.id, patientTable.personId)).leftJoin(healthProductionCompetences, eq(healthProductionCompetences.id, healthProductionFacts.competenceId)).where(eq(healthProductionFacts.id, id)).limit(1);
  if (!row) throw new Error("Produção não encontrada.");
  if (row.fact.unitId) assertHealthUnitAccess(context.user, row.fact.unitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Produção sem unidade autorizada no seu escopo.");
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const manualPricing = z.object({ manualInput: z.object({ agreementId: z.string().nullable() }) }).safeParse(row.fact.pricingSnapshot);
  const agreementId = manualPricing.success ? manualPricing.data.manualInput.agreementId || "" : "";
  const [units, patients, professionals, agreements, criticisms, revisions] = await Promise.all([
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    database.select({ id: patientTable.id, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(unitIds ? inArray(patientTable.referenceUnitId, unitIds) : undefined).orderBy(asc(people.fullName)).limit(500),
    database.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.isActive, true), unitIds ? or(inArray(healthProfessionals.unitId, unitIds), sql`EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=${healthProfessionals.id} AND a."isActive"=true AND ${inArray(sql`a."unitId"`, unitIds)})`) : undefined)).orderBy(asc(employees.name)),
    database.select({ id: healthCareAgreements.id, name: healthCareAgreements.name }).from(healthCareAgreements).where(or(eq(healthCareAgreements.isActive, true), eq(healthCareAgreements.id, agreementId))).orderBy(asc(healthCareAgreements.name)),
    database.select().from(healthProductionCriticisms).where(eq(healthProductionCriticisms.factId, id)).orderBy(desc(healthProductionCriticisms.createdAt)),
    database.select().from(healthProductionFactRevisions).where(eq(healthProductionFactRevisions.factId, id)).orderBy(desc(healthProductionFactRevisions.version)),
  ]);
  const fact = { ...row.fact, procedure: row.procedure, unit: row.unit, professional: row.employee ? { employee: row.employee } : null, patient: row.person ? { person: row.person } : null, competence: row.competence, criticisms, revisions };
  const performed = fact.originType === "PEP_PROCEDURE" ? (await database.select({ medicalRecordId: healthPerformedProcedures.medicalRecordId }).from(healthPerformedProcedures).where(eq(healthPerformedProcedures.id, fact.originId)).limit(1))[0] : null;
  const sourcePath = performed ? `/saude/atendimentos/${encodeURIComponent(performed.medicalRecordId)}/complementos` : fact.originType === "VACCINATION" && fact.patientId ? `/saude/vacinacao/carteira/${encodeURIComponent(fact.patientId)}` : fact.originType === "LAB_RESULT" ? "/saude/laboratorio" : fact.originType === "REGULATION" ? "/saude/regulacao" : fact.originType === "TRIAGE" ? "/saude/agenda" : fact.originType === "COLLECTIVE_ACTIVITY" ? "/saude/territorio/atencao-primaria" : fact.originType === "ESUS_FORM" ? "/saude/esus" : null;
  return <main className="space-y-4 p-4"><header><Link href={`/saude/producao?comp=${fact.period}`} className="text-sm underline">Produção da competência</Link><h1 className="text-xl font-semibold">Origem e revisão da produção</h1><p className="text-sm">{fact.originType} · {fact.originId} · versão {fact.version}</p></header><section className="space-y-1 rounded border bg-white p-3 text-sm"><p>{fact.patient?.person.fullName || "Produção não individualizada"} · {fact.unit?.name || "Sem unidade"}</p><p>{fact.procedure?.code} · {fact.procedure?.description} · quantidade {fact.quantity} · valor {fact.value !== null ? `R$ ${fact.value.toFixed(2)}` : "Não informado"}</p><p>{fact.professional?.employee.name || "Profissional não informado"} · competência {fact.period} · {fact.status} · {fact.competence?.status || "Ainda não processada"}</p>{sourcePath && <Link href={sourcePath} className="inline-block underline">Abrir registro ou gestor de origem para corrigir</Link>}</section>
    {fact.originType === "MANUAL" && fact.competence?.status !== "FECHADA" && <form action={reviseManualFactAction} className="grid gap-3 rounded border bg-white p-3 md:grid-cols-2">
      <h2 className="font-semibold md:col-span-2">Corrigir digitação manual com histórico</h2><input name="factId" type="hidden" value={fact.id}/><input name="expectedVersion" type="hidden" value={fact.version}/>
      <label className="text-sm">Unidade<select name="unitId" defaultValue={fact.unitId || ""} required className={field}>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
      <label className="text-sm">Profissional<select name="professionalId" defaultValue={fact.professionalId || ""} className={field}><option value="">Não informado</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.employee.name}</option>)}</select></label>
      <label className="text-sm">Paciente<select name="patientId" defaultValue={fact.patientId || ""} className={field}><option value="">Não individualizado</option>{patients.map(patient => <option key={patient.id} value={patient.id}>{patient.person.fullName}</option>)}</select></label>
      <ProcedureField selected={fact.procedure ? { id: fact.procedure.id, code: fact.procedure.code, description: fact.procedure.description } : null}/>
      <label className="text-sm">Convênio<select name="agreementId" defaultValue={agreementId} className={field}><option value="">Sem convênio específico</option>{agreements.map(agreement => <option key={agreement.id} value={agreement.id}>{agreement.name}</option>)}</select></label>
      <label className="text-sm">Quantidade<input name="quantity" type="number" min={1} max={9999} required defaultValue={fact.quantity} className={field}/></label>
      <label className="text-sm">Valor total (R$; vazio aplica tabela)<input name="value" type="number" min={0} step="0.01" defaultValue={fact.value?.toString() || ""} className={field}/></label>
      <label className="text-sm">Data do fato<input name="occurredAt" type="date" required defaultValue={fact.occurredAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} className={field}/></label>
      <label className="text-sm">CID (identificador do catálogo)<input name="cidReferenceId" defaultValue={fact.cidReferenceId || ""} className={field}/></label><label className="text-sm">Município da produção<input name="municipality" defaultValue={fact.municipality || ""} className={field}/></label><label className="text-sm">UF<input name="state" maxLength={2} defaultValue={fact.state || ""} className={field}/></label>
      <label className="text-sm md:col-span-2">Motivo da correção<input name="reason" minLength={3} required className={field}/></label><button className="rounded bg-teal-700 p-2 text-white md:col-span-2">Salvar revisão e exigir reprocessamento</button>
    </form>}
    {fact.pricingSnapshot && <details className="rounded border bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">Memória do preço, vigência e prestadora de origem</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(fact.pricingSnapshot, null, 2)}</pre></details>}
    <section className="space-y-2"><h2 className="font-semibold">Críticas e reprocessamentos</h2>{fact.criticisms.map(criticism => <p key={criticism.id} className="rounded border p-2 text-sm">{criticism.createdAt.toLocaleString("pt-BR")} · {criticism.code} · {criticism.status}<br/>{criticism.message}<br/>{criticism.actionNeeded}</p>)}</section><section className="space-y-2"><h2 className="font-semibold">Revisões de conteúdo</h2>{fact.revisions.map(revision => <details key={revision.id} className="rounded border p-2 text-sm"><summary>Versão {revision.version} · {revision.createdAt.toLocaleString("pt-BR")} · {revision.actorUsuarioId} · {revision.reason}</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify({ before: revision.before, after: revision.after }, null, 2)}</pre></details>)}</section></main>;
}
