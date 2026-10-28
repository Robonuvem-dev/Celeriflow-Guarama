import Link from "next/link";
import { and, asc, eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import type { JsonObject, JsonValue } from "@/db/json";
import { governmentEntities } from "@/db/schema/master-data";
import { PersistenceError } from "@/db/errors";
import { findMscCatalogVersion, listMscAuthorizedUnits, listMscEntityYears, listMscPublishedEntries } from "@/db/repositories/finance/msc-configuration";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { importMscReference, saveMscReportingScope } from "./actions";
import MscMappingForm from "./MscMappingForm";

export const dynamic = "force-dynamic";
const object = (value: JsonValue): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export default async function MscConfigurationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { database, user } = await getTenantContextForModule("FINANCEIRO");
  const executor = database ?? db;
  const params = await searchParams;
  const parsed = z.object({ governmentEntityId: z.string().min(1).optional(), budgetUnitId: z.string().min(1).optional(), financialYearId: z.string().min(1).optional() }).safeParse(Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!parsed.success) return <p className="p-5">Seleção de ente/exercício/UG inválida.</p>;
  const units = await listMscAuthorizedUnits(executor, isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds);
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const governmentEntityId = parsed.data.governmentEntityId ?? entities[0]?.[0];
  if (!governmentEntityId || !entities.some(([id]) => id === governmentEntityId)) return <p className="p-5">Nenhum ente autorizado para a MSC.</p>;
  const entityUnits = units.filter(unit => unit.governmentEntityId === governmentEntityId);
  const budgetUnitId = parsed.data.budgetUnitId ?? entityUnits[0]?.budgetUnitId;
  if (!budgetUnitId || !entityUnits.some(unit => unit.budgetUnitId === budgetUnitId)) return <p className="p-5">UG fora da seleção autorizada.</p>;
  const years = await listMscEntityYears(executor, governmentEntityId);
  const financialYearId = parsed.data.financialYearId ?? years.find(year => year.status === "Aberto")?.id ?? years[0]?.id;
  const year = years.find(item => item.id === financialYearId);
  if (!year || !financialYearId) return <p className="p-5">Exercício fora do ente selecionado.</p>;
  const [reference, entries] = await Promise.all([
    findMscCatalogVersion(executor, "msc-reference:stn:2026:20260708"),
    listMscPublishedEntries(executor, { mappingKinds: true, year: year.year, governmentEntityId, budgetUnitId }),
  ]);
  const editable = canPerformModuleOperation(user, "FINANCEIRO", "update");
  const [entity] = await executor.select({ type: governmentEntities.type, parentId: governmentEntities.parentId }).from(governmentEntities).where(eq(governmentEntities.id, governmentEntityId));
  if (!entity) throw new PersistenceError("not-found", "Entidade municipal não encontrada.");
  const reportingEntityId = entity.type === "PREFEITURA" ? governmentEntityId : entity.parentId;
  const reportingScopes = reportingEntityId ? await listMscPublishedEntries(executor, { kind: "MSC_REPORTING_SCOPE", canonicalId: reportingEntityId, year: year.year }) : [];
  const reportMembers = entity.type === "PREFEITURA" ? await executor.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(or(eq(governmentEntities.id, governmentEntityId), and(eq(governmentEntities.parentId, governmentEntityId), eq(governmentEntities.status, "ATIVA")))).orderBy(asc(governmentEntities.id)) : [];
  const replacedScopes = new Set(reportingScopes.map(scope => object(scope.attributes).predecessorEntryId));
  const currentScopes = reportingScopes.filter(scope => !replacedScopes.has(scope.id));
  const field = "block w-full rounded border p-2 text-sm";
  return <section className="space-y-4 p-5"><header><h1 className="text-xl font-semibold">MSC — referências e de-para por ente/UG</h1><Link href="/financeiro/contabilidade" className="underline">Contabilidade e fechamento</Link></header>
    <form className="flex flex-wrap items-end gap-3 rounded border p-4"><label>Entidade<select name="governmentEntityId" defaultValue={governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><button className="rounded border p-2 text-sm">Selecionar entidade</button></form>
    <form className="flex flex-wrap items-end gap-3 rounded border p-4"><input type="hidden" name="governmentEntityId" value={governmentEntityId} /><label>UG<select name="budgetUnitId" defaultValue={budgetUnitId} className={field}>{entityUnits.map(unit => <option key={unit.budgetUnitId} value={unit.budgetUnitId}>{unit.budgetUnit.code} · {unit.budgetUnit.name}</option>)}</select></label><label>Exercício<select name="financialYearId" defaultValue={financialYearId} className={field}>{years.map(item => <option key={item.id} value={item.id}>{item.year} · {item.status}</option>)}</select></label><button className="rounded border p-2 text-sm">Selecionar escopo</button></form>
    <p className="text-sm">A referência oficial e as decisões municipais são edições distintas. Publicação do de-para congela as informações nas novas linhas; não modifica partidas anteriores nem constitui homologação no Siconfi.</p>
    {reference ? <p className="rounded border p-3 text-sm">{reference.label} · {reference._count.entries} referências · SHA-256 {reference.sourceHash}</p> : <p className="rounded border p-3 text-sm">Referência oficial ainda não capturada no registro versionado.</p>}
    {editable && !reference && <form action={importMscReference} className="space-y-3 rounded border p-4"><h2 className="font-semibold">Capturar referência oficial</h2><p className="text-sm">Selecione `docs/poc-p0/fontes/MSC_STN_2026_20260708.json`. A captura é conferida pelo hash da derivação preservada.</p><input required type="file" name="referenceFile" accept=".json,application/json" /><button className="block rounded bg-slate-800 px-4 py-2 text-white">Capturar sem alterar cadastros e saldos</button></form>}
    {editable && reference && year.year === 2026 && <MscMappingForm key={`${governmentEntityId}:${budgetUnitId}:${financialYearId}`} scope={{ governmentEntityId, budgetUnitId, financialYearId, year: year.year }} />}
    {year.year !== 2026 && <p>Selecione o leiaute oficial do exercício correspondente antes de configurar seu de-para.</p>}
    {editable && entity.type === "PREFEITURA" && <form action={saveMscReportingScope} className="space-y-3 rounded border p-4"><h2 className="font-semibold">Perímetro da MSC agregada pelo Executivo</h2>
      <input type="hidden" name="governmentEntityId" value={governmentEntityId} /><input type="hidden" name="financialYearId" value={financialYearId} />
      <p className="text-sm">Inclui os órgãos/poderes ativos vinculados ao Executivo no cadastro de entidades. Preserva PO e valores recíprocos; o download exige acesso a todas as UGs do perímetro.</p>
      <ul className="list-inside list-disc text-sm">{reportMembers.map(member => <li key={member.id}>{member.name}<input type="hidden" name="entityIds" value={member.id} /></li>)}</ul>
      <label className="block text-sm">Código da instituição Siconfi (IBGE + EX)<input required name="institutionCode" pattern="[0-9]{7}EX" maxLength={9} placeholder="Código oficial da instituição" className={field} /></label>
      <label className="block text-sm">Edição predecessora<select name="predecessorEntryId" className={field}><option value="">Primeira edição</option>{currentScopes.map(scope => <option key={scope.id} value={scope.id}>{scope.code} · {scope.name}</option>)}</select></label>
      <label className="block text-sm">Fundamento do perímetro<textarea required name="reason" minLength={10} maxLength={4000} className={field} /></label><button className="rounded bg-slate-800 px-4 py-2 text-white">Publicar perímetro documentado</button>
    </form>}
    {canPerformModuleOperation(user, "FINANCEIRO", "issueReports") && currentScopes.length > 0 && year.year === 2026 && <form action="/api/financeiro/msc" method="get" className="space-y-3 rounded border p-4"><h2 className="font-semibold">Gerar arquivo CSV compactado</h2><label className="block text-sm">Perímetro de envio<select required name="reportingScopeEntryId" className={field}>{currentScopes.map(scope => <option key={scope.id} value={scope.id}>{scope.code} · {scope.name}</option>)}</select></label><label className="block text-sm">Competência<select required name="period" className={field}>{Array.from({ length: 13 }, (_, index) => <option key={index} value={`2026-${String(index + 1).padStart(2, "0")}`}>{index === 12 ? "2026-13 · Encerramento" : `2026-${String(index + 1).padStart(2, "0")}`}</option>)}</select></label><p className="text-sm">Exige composição MSC congelada em todas as linhas, competências fechadas e saldos conciliados. O arquivo gerado não representa transmissão ou homologação no Siconfi.</p><button className="rounded bg-emerald-700 px-4 py-2 text-white">Gerar e baixar ZIP da MSC</button></form>}
    <section className="space-y-3"><h2 className="font-semibold">Edições publicadas no escopo</h2>{entries.map(entry => { const attrs = object(entry.attributes); return <article key={entry.id} className="space-y-1 rounded border p-3 text-sm"><p className="font-semibold">{entry.kind} · {entry.code} — {entry.name}</p><p>Origem canônica {entry.canonicalId} · {String(attrs.effectiveFrom ?? "")} a {String(attrs.effectiveUntil ?? "")}</p><p>{String(attrs.decision ?? "")}</p><p className="break-all text-xs">Edição {entry.id} · predecessora {String(attrs.predecessorEntryId ?? "Nenhuma")}</p></article>; })}{!entries.length && <p>Nenhuma edição municipal MSC no escopo.</p>}</section>
  </section>;
}
