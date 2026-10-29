import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyProfileSchema } from "@/lib/tributacao/property-profile-schema";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";

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
    <OperationalTablePanel title="Alterações do perfil imobiliário e relacionamentos" triggerLabel="Abrir alterações do perfil imobiliário" description="Versões documentadas do perfil, conservando a titularidade e o espelho na referência.">
      <TaxOperationalTable id="historico-perfil-imobiliario" resetKey={`${id}:${at ?? ""}`}
        toolbar={<span className="text-[13px]">Imóvel {id} · referência {at ?? "atual"}</span>}
        columns={[["date", "Data", 80, 165], ["actor", "Usuário", 80, 170], ["version", "Versão", 40, 60], ["field", "Campo", 80, 155], ["before", "Anterior", 100, 270], ["after", "Novo", 100, 270]]}
        rows={entries.flatMap((item, index) => {
          const after = propertyProfileSchema.parse(item.data); const previous = entries[index + 1]; const before = previous ? propertyProfileSchema.parse(previous.data) : null;
          return (Object.keys(after) as (keyof typeof after)[]).filter(key => !["expectedVersion", "expectedUpdatedAt", "reason", "propertyId"].includes(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after[key])).map(key => ({ id: `${item.id}:${key}`, label: String(key), values: { date: item.createdAt.toLocaleString("pt-BR"), actor: actors.get(item.actorUsuarioId ?? "") ?? item.actorUsuarioId ?? "Origem sem usuário atribuído", version: String(item.version), field: String(key), before: before ? JSON.stringify(before[key], null, 2) ?? "Não informado" : "Posição inicial registrada", after: JSON.stringify(after[key], null, 2) ?? "Não informado" } }));
        })} />
    </OperationalTablePanel>
  </section>;
}
