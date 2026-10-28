import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { simulateGroupedPropertyValuation } from "@/lib/tributacao/property-group-simulation";
import ConfirmPropertySimulationClient from "./ConfirmPropertySimulationClient";
import { db, databaseConnection } from "@/db/client";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";

export const dynamic="force-dynamic";
export default async function GroupSimulationPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const context=await getTenantContextForModule("TRIBUTACAO"); const {user}=context; const database=context.database ?? db; const params=await searchParams;
  const allowedBudgetUnitIds=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [profiles,rules]=await Promise.all([listFiscalEntries(database,{entityType:"REAL_ESTATE",categories:["PROPERTY_PROFILE"],allowedBudgetUnitIds}),listFiscalEntries(database,{entityType:"TAX",categories:["PROPERTY_VALUATION_RULE"],allowedBudgetUnitIds})]);
  const latestProfiles=new Map<string,typeof profiles[number]>();for(const profile of profiles) if(!latestProfiles.has(profile.entityId)) latestProfiles.set(profile.entityId,profile);
  const latestRules=new Map<string,typeof rules[number]>();for(const rule of rules) {const key=`${rule.entityId}:${rule.title}`;if(!latestRules.has(key)) latestRules.set(key,rule);}
  const value=(key:string)=>typeof params[key]==="string" ? params[key] as string : "";
  const parentId=value("parentId");
  const unitIds=Array.isArray(params.unitIds) ? params.unitIds : typeof params.unitIds==="string" ? [params.unitIds] : [];
  const unitBuiltAreaOverrides=Object.fromEntries(unitIds.filter(id=>value(`area.${id}`)!=="").map(id=>[id,value(`area.${id}`)]));
  const simulation={parentId,unitIds,ruleId:value("ruleId"),includeParentConstruction:params.includeParentConstruction==="on",taxRate:value("taxRate") || "0",...(value("landArea") ? {landAreaOverride:value("landArea")} : {}),...(value("builtArea") ? {parentBuiltAreaOverride:value("builtArea")} : {}),unitBuiltAreaOverrides};
  let result:Awaited<ReturnType<typeof simulateGroupedPropertyValuation>>|null=null;let error="";
  if(params.calculate==="1") try {result=await simulateGroupedPropertyValuation(databaseConnection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds},simulation);}catch(cause){error=cause instanceof Error ? cause.message : "Simulação indisponível.";}
  const field="mt-1 w-full rounded border p-2 text-xs";
  return <div className="h-full space-y-3 overflow-auto p-4"><h1 className="text-lg font-bold">Simulação individual e englobamento de unidades</h1>
    <form className="grid gap-3 rounded border bg-white p-3 sm:grid-cols-2">
      <label className="text-xs">Imóvel / terreno principal<select name="parentId" defaultValue={parentId} required className={field}><option value="">Selecione</option>{[...latestProfiles.values()].map(entry=><option key={entry.id} value={entry.entityId}>{String(taxScopeSnapshot(entry.data).inscription ?? entry.entityId)} · {String(taxScopeSnapshot(entry.data).kind)}</option>)}</select></label>
      <label className="text-xs">Regra / exercício<select name="ruleId" defaultValue={value("ruleId")} required className={field}><option value="">Selecione</option>{[...latestRules.values()].map(rule=><option key={rule.id} value={rule.id}>{rule.title} · versão {rule.version}</option>)}</select></label>
      <button className="rounded border p-2 text-xs">Atualizar unidades do terreno</button>
      <label className="text-xs">Alíquota para simulação (%)<input name="taxRate" type="number" min="0" max="100" step="0.000001" defaultValue={value("taxRate") || "0"} required className={field}/></label>
      <label className="text-xs">Área territorial simulada (m², vazio usa cadastro)<input name="landArea" type="number" min="0" step="0.000001" defaultValue={value("landArea")} className={field}/></label>
      <label className="text-xs">Construção do imóvel principal (m², vazio usa cadastro)<input name="builtArea" type="number" min="0" step="0.000001" defaultValue={value("builtArea")} className={field}/></label>
      <fieldset className="space-y-2 rounded border p-3 sm:col-span-2"><legend className="text-xs font-semibold">Unidades para simular em conjunto</legend>{[...latestProfiles.values()].filter(entry=>taxScopeSnapshot(entry.data).parentId===parentId).map(entry=><div key={entry.id} className="grid gap-2 sm:grid-cols-2"><label className="inline-flex items-center gap-2 text-xs"><input name="unitIds" value={entry.entityId} type="checkbox" defaultChecked={unitIds.includes(entry.entityId)}/>{String(taxScopeSnapshot(entry.data).inscription ?? entry.entityId)} · {String(taxScopeSnapshot(entry.data).unitMode)}</label><label className="text-xs">Construção simulada (m², vazio usa cadastro)<input name={`area.${entry.entityId}`} type="number" min="0" step="0.000001" defaultValue={value(`area.${entry.entityId}`)} className={field}/></label></div>)}</fieldset>
      <label className="flex items-center gap-2 text-xs"><input name="includeParentConstruction" type="checkbox" defaultChecked={params.includeParentConstruction==="on"}/>Incluir construção do imóvel principal</label><button name="calculate" value="1" className="rounded bg-emerald-700 p-2 text-xs text-white">Simular</button>
    </form>
    {error && <p role="alert" className="rounded border bg-amber-50 p-2 text-sm">{error}</p>}
    {result && <section className="rounded border bg-white p-3"><h2 className="font-semibold">Valor venal: R$ {result.venalValue} · Tributo estimado: R$ {result.estimatedTax}</h2><p className="mt-1 text-xs">O terreno é contado uma vez, com as construções selecionadas. A simulação conserva os dados cadastrais.</p><pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(result.memory,null,2)}</pre><ConfirmPropertySimulationClient simulation={simulation} previewHash={result.previewHash}/></section>}
  </div>;
}
