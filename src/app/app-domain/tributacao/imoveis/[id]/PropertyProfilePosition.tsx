import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyProfileSchema } from "@/lib/tributacao/property-profile-schema";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export default async function PropertyProfilePosition({ database,id,at }: { database: DatabaseExecutor; id: string; at?: string }) {
  const date=at ? new Date(at) : new Date(); if(!Number.isFinite(date.valueOf())) return null;
  const {user}=await getTenantContextForModule("TRIBUTACAO");
  const allowedBudgetUnitIds=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const entries=await listFiscalEntries(database,{entityType:"REAL_ESTATE",entityIds:[id],categories:["PROPERTY_PROFILE"],recordedBy:date,allowedBudgetUnitIds});
  const entry=entries[0]; if(!entry) return null;
  const profile=propertyProfileSchema.parse(entry.data);
  const position=(await listFiscalEntries(database,{entityType:"REAL_ESTATE",entityIds:[id],categories:["FISCAL_OWNERSHIP"],effectiveAt:date,order:"effective-version",limit:1}))[0];
  const positionData=taxScopeSnapshot(position?.data);
  const names={...taxScopeSnapshot(taxScopeSnapshot(entry.data).ownerNames),...taxScopeSnapshot(positionData.ownerNames)};
  const owners=Array.isArray(positionData.owners) ? positionData.owners : profile.owners;
  const users=await listFiscalActorNames(database,entries.flatMap(item=>item.actorUsuarioId ? [item.actorUsuarioId] : []));
  const actors=new Map(users.map(user=>[user.id,user.nome]));
  const address=profile.correspondenceAddress;
  return <section className="mt-2 rounded border p-2 text-xs"><h3 className="font-bold">Perfil imobiliário na referência · versão {entry.version}</h3><p>{entry.createdAt.toLocaleString("pt-BR")} · {actors.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId}</p><dl className="mt-2 grid gap-2 sm:grid-cols-3"><div><dt className="font-semibold">Tipo / vínculo</dt><dd>{profile.kind} · {profile.parentId ?? "Sem terreno principal"} · {profile.unitMode ?? ""}</dd></div><div><dt className="font-semibold">Correspondência</dt><dd>{address.street}, {address.number} {address.complement} · {address.neighborhood} · {address.city}/{address.state} · {address.zipCode}</dd></div><div><dt className="font-semibold">Coordenadas</dt><dd>{profile.latitude===null ? "Não informadas" : `${profile.latitude}, ${profile.longitude}`}</dd></div><div><dt className="font-semibold">Índices urbanísticos</dt><dd>{profile.floors} pavimentos · afastamento frontal {profile.frontSetback} m · lateral {profile.sideSetback} m</dd></div><div><dt className="font-semibold">Risco / APP</dt><dd>{profile.riskArea ? "Área de risco" : "Sem área de risco informada"} · {profile.environmentalProtection ? "Proteção ambiental" : "Sem APP informada"}</dd></div></dl><h4 className="mt-2 font-semibold">Proprietários na posição fiscal</h4><ul>{owners.map((owner,index)=>{const value=taxScopeSnapshot(owner); const taxpayerId=String(value.taxpayerId);return <li key={index}>{String(names[taxpayerId] ?? taxpayerId)} · {String(value.sharePercent)}%</li>;})}</ul>
    <details className="mt-2"><summary className="cursor-pointer font-semibold">Histórico dos campos e relacionamentos do perfil</summary><table className="mt-2 w-full text-left"><thead><tr><th>Data / usuário</th><th>Campo</th><th>Anterior</th><th>Novo</th></tr></thead><tbody>{entries.flatMap((item,index)=>{const after=propertyProfileSchema.parse(item.data); const previous=entries[index+1];const before=previous ? propertyProfileSchema.parse(previous.data) : null;return (Object.keys(after) as (keyof typeof after)[]).filter(key=>!["expectedVersion","expectedUpdatedAt","reason","propertyId"].includes(key) && JSON.stringify(before?.[key])!==JSON.stringify(after[key])).map(key=><tr key={`${item.id}:${key}`} className="border-t align-top"><td className="p-1">{item.createdAt.toLocaleString("pt-BR")} · {actors.get(item.actorUsuarioId ?? "") ?? item.actorUsuarioId}</td><td className="p-1">{key}</td><td className="max-w-48 break-words p-1">{before ? JSON.stringify(before[key]) : "Posição inicial registrada"}</td><td className="max-w-48 break-words p-1">{JSON.stringify(after[key])}</td></tr>);})}</tbody></table></details>
  </section>;
}
