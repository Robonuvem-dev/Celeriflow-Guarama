import type { PrismaClient } from "@prisma/client";
import { economicProfileSchema } from "@/lib/tributacao/economic-profile";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

export default async function EconomicProfilePosition({ prisma, id, at }: { prisma: PrismaClient; id: string; at?: string }) {
  const { user } = await getTenantContextForModule("TRIBUTACAO");
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const date = at ? new Date(at) : new Date(); if (!Number.isFinite(date.valueOf())) return null;
  const entries = await prisma.taxRegistryEntry.findMany({ where: { entityType: "ECONOMIC_REGISTRATION", entityId: id, category: "ECONOMIC_PROFILE", createdAt: { lte: date }, ...(allowedBudgetUnitIds ? { OR: allowedBudgetUnitIds.map(budgetUnitId => ({ data: { path: ["budgetUnitId"], equals: budgetUnitId } })) } : {}) }, orderBy: { version: "desc" } });
  const entry = entries[0];
  if (!entry) return null;
  const users = await prisma.usuario.findMany({ where: { id: { in: entries.flatMap(item => item.actorUsuarioId ? [item.actorUsuarioId] : []) } }, select: { id: true, nome: true } });
  const actors = new Map(users.map(user => [user.id, user.nome]));
  const profile = economicProfileSchema.parse(entry.data);
  const names = new Map<string, string>(profile.partners.map(partner => [partner.taxpayerId, partner.taxpayerId]));
  if (profile.accountantTaxpayerId) names.set(profile.accountantTaxpayerId, profile.accountantTaxpayerId);
  const nameSnapshot = taxScopeSnapshot(taxScopeSnapshot(entry.data).relatedTaxpayerNames);
  for (const [taxpayerId, name] of Object.entries(nameSnapshot)) if (typeof name === "string") names.set(taxpayerId, name);
  const address = (value: typeof profile.companyAddress) => `${value.street}, ${value.number} ${value.complement} · ${value.neighborhood} · ${value.city}/${value.state} · ${value.zipCode}`;
  return <section className="mt-2 rounded border p-2 text-xs"><h3 className="font-bold">Perfil econômico registrado na referência · versão {entry.version}</h3><p>Última alteração do perfil: {entry.createdAt.toLocaleString("pt-BR")} · {actors.get(entry.actorUsuarioId ?? "") ?? entry.actorUsuarioId}</p><dl className="mt-1 grid gap-2 sm:grid-cols-2"><div><dt className="font-semibold">Tipo / atividades</dt><dd>{profile.companyType} · {profile.primaryCnae} · secundárias: {profile.secondaryCnaes.join(", ") || "Nenhuma"}</dd></div><div><dt className="font-semibold">Contador / CRC</dt><dd>{profile.accountantTaxpayerId ? names.get(profile.accountantTaxpayerId) : "Não informado"} · {profile.accountantCrc}</dd></div><div><dt className="font-semibold">Endereço da empresa</dt><dd>{address(profile.companyAddress)}</dd></div><div><dt className="font-semibold">Correspondência</dt><dd>{address(profile.correspondenceAddress)}</dd></div><div><dt className="font-semibold">Contrato social</dt><dd>{profile.contractNumber} · {profile.contractDate ?? "Data não informada"}</dd></div><div><dt className="font-semibold">Validade provisória</dt><dd>{profile.provisionalUntil ?? "Cadastro sem prazo provisório"}</dd></div><div><dt className="font-semibold">Coordenadas</dt><dd>{profile.latitude === null ? "Não informadas" : `${profile.latitude}, ${profile.longitude}`}</dd></div></dl><h4 className="mt-2 font-semibold">Sócios</h4><ul>{profile.partners.map(partner => <li key={partner.taxpayerId}>{names.get(partner.taxpayerId)} · {partner.role} · {partner.sharePercent}%</li>)}</ul>
    <details className="mt-2"><summary className="cursor-pointer font-semibold">Alterações do perfil e relacionamentos</summary><table className="mt-2 w-full text-left"><thead><tr><th>Data / usuário</th><th>Campo</th><th>Anterior</th><th>Novo</th></tr></thead><tbody>{entries.flatMap((item, index) => {
      const after = economicProfileSchema.parse(item.data); const previous = entries[index + 1]; const before = previous ? economicProfileSchema.parse(previous.data) : null;
      return (Object.keys(after) as (keyof typeof after)[]).filter(key => !["expectedVersion", "registrationId", "reason"].includes(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after[key])).map(key => <tr key={`${item.id}:${key}`} className="border-t align-top"><td className="p-1">{item.createdAt.toLocaleString("pt-BR")} · {actors.get(item.actorUsuarioId ?? "") ?? item.actorUsuarioId}</td><td className="p-1">{key}</td><td className="max-w-52 break-words p-1">{before ? JSON.stringify(before[key]) : "Posição inicial registrada"}</td><td className="max-w-52 break-words p-1">{JSON.stringify(after[key])}</td></tr>);
    })}</tbody></table></details></section>;
}
