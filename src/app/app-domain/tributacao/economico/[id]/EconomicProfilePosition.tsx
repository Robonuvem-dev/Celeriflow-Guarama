import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listFiscalActorNames } from "@/db/repositories/taxation-pages/lookups";
import { economicProfileSchema } from "@/lib/tributacao/economic-profile";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";

export default async function EconomicProfilePosition({ database, id, at }: { database: DatabaseExecutor; id: string; at?: string }) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const date = at ? new Date(at) : new Date(); if (!Number.isFinite(date.valueOf())) return null;
  const entries = await listFiscalEntries(database, { entityType: "ECONOMIC_REGISTRATION", entityIds: [id], categories: ["ECONOMIC_PROFILE"], recordedBy: date, allowedBudgetUnitIds });
  const entry = entries[0];
  if (!entry) return null;
  const users = await listFiscalActorNames(database, entries.flatMap(item => item.actorUsuarioId ? [item.actorUsuarioId] : []));
  const actors = new Map(users.map(user => [user.id, user.nome]));
  const profile = economicProfileSchema.parse(entry.data);
  const names = new Map<string, string>(profile.partners.map(partner => [partner.taxpayerId, partner.taxpayerId]));
  if (profile.accountantTaxpayerId) names.set(profile.accountantTaxpayerId, profile.accountantTaxpayerId);
  const nameSnapshot = taxScopeSnapshot(taxScopeSnapshot(entry.data).relatedTaxpayerNames);
  for (const [taxpayerId, name] of Object.entries(nameSnapshot)) if (typeof name === "string") names.set(taxpayerId, name);
  const address = (value: typeof profile.companyAddress) => `${value.street}, ${value.number} ${value.complement} · ${value.neighborhood} · ${value.city}/${value.state} · ${value.zipCode}`;
  return <section className="mt-2 rounded border p-2 text-xs"><h3 className="font-bold">Perfil econômico registrado na referência · versão {entry.version}</h3><p>Última alteração do perfil: {entry.createdAt.toLocaleString("pt-BR")} · {actors.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId}</p><dl className="mt-1 grid gap-2 sm:grid-cols-2"><div><dt className="font-semibold">Tipo / atividades</dt><dd>{profile.companyType} · {profile.primaryCnae} · secundárias: {profile.secondaryCnaes.join(", ") || "Nenhuma"}</dd></div><div><dt className="font-semibold">Contador / CRC</dt><dd>{profile.accountantTaxpayerId ? names.get(profile.accountantTaxpayerId) : "Não informado"} · {profile.accountantCrc}</dd></div><div><dt className="font-semibold">Endereço da empresa</dt><dd>{address(profile.companyAddress)}</dd></div><div><dt className="font-semibold">Correspondência</dt><dd>{address(profile.correspondenceAddress)}</dd></div><div><dt className="font-semibold">Contrato social</dt><dd>{profile.contractNumber} · {profile.contractDate ?? "Data não informada"}</dd></div><div><dt className="font-semibold">Validade provisória</dt><dd>{profile.provisionalUntil ?? "Cadastro sem prazo provisório"}</dd></div><div><dt className="font-semibold">Coordenadas</dt><dd>{profile.latitude === null ? "Não informadas" : `${profile.latitude}, ${profile.longitude}`}</dd></div></dl><h4 className="mt-2 font-semibold">Sócios</h4><ul>{profile.partners.map(partner => <li key={partner.taxpayerId}>{names.get(partner.taxpayerId)} · {partner.role} · {partner.sharePercent}%</li>)}</ul>
    <OperationalTablePanel title="Alterações do perfil econômico e relacionamentos" triggerLabel="Abrir alterações do perfil econômico" description="Versões registradas com usuário, campos e valores integrais, mantendo o espelho na ficha.">
      <TaxOperationalTable id="historico-perfil-economico" resetKey={`${id}:${at ?? ""}`}
        toolbar={<span className="text-[13px]">Inscrição {id} · referência {at ?? "atual"}</span>}
        columns={[["date", "Data", 80, 165], ["actor", "Usuário", 80, 170], ["version", "Versão", 40, 60], ["field", "Campo", 80, 155], ["before", "Anterior", 100, 270], ["after", "Novo", 100, 270]]}
        rows={entries.flatMap((item, index) => {
      const after = economicProfileSchema.parse(item.data); const previous = entries[index + 1]; const before = previous ? economicProfileSchema.parse(previous.data) : null;
      return (Object.keys(after) as (keyof typeof after)[]).filter(key => !["expectedVersion", "registrationId", "reason"].includes(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after[key])).map(key => ({ id: `${item.id}:${key}`, label: String(key), values: { date: item.createdAt.toLocaleString("pt-BR"), actor: actors.get(item.actorUsuarioId ?? "") ?? item.actorUsuarioId ?? "Origem sem usuário atribuído", version: String(item.version), field: String(key), before: before ? JSON.stringify(before[key], null, 2) ?? "Não informado" : "Posição inicial registrada", after: JSON.stringify(after[key], null, 2) ?? "Não informado" } }));
    })} /></OperationalTablePanel></section>;
}
