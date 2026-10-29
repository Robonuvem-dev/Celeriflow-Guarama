import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import AtividadesEsporteLazerClient from "../components/AtividadesEsporteLazerClient";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { db } from "@/db/client";
import { listCulturalActivities } from "@/db/repositories/culture/queries";

export const dynamic = "force-dynamic";

export default async function EsporteLazerPage() {
  await getTenantContextForModule("CULTURA");
  const activities = await listCulturalActivities(db);

  const activeActivities = activities.filter((activity) => activity.active);
  const activeModalities = new Set(
    activeActivities.map((activity) => activity.modalidade.trim().toLocaleLowerCase("pt-BR")),
  );
  const usedSpaces = new Set(
    activeActivities.flatMap((activity) => (activity.space ? [activity.space.id] : [])),
  );

  const serializedActivities = activities.map((activity) => ({
    id: activity.id,
    nome: activity.nome,
    modalidade: activity.modalidade,
    publicoAlvo: activity.publicoAlvo,
    startsAt: activity.startsAt.toISOString(),
    endsAt: activity.endsAt?.toISOString() ?? null,
    status: activity.status,
    active: activity.active,
    space: activity.space
      ? {
          nome: activity.space.nome,
          tipo: activity.space.tipo,
          asset: activity.space.asset
            ? {
                nome: activity.space.asset.name,
                patrimonio: activity.space.asset.patrimonyNumber,
                realEstate: activity.space.asset.realEstate
                  ? {
                      inscricao: activity.space.asset.realEstate.municipalInsc,
                      endereco: [
                        activity.space.asset.realEstate.streetName,
                        activity.space.asset.realEstate.number,
                      ]
                        .filter(Boolean)
                        .join(", "),
                    }
                  : null,
              }
            : null,
          realEstate: activity.space.realEstate
            ? {
                inscricao: activity.space.realEstate.municipalInsc,
                endereco: [activity.space.realEstate.streetName, activity.space.realEstate.number]
                  .filter(Boolean)
                  .join(", "),
              }
            : null,
        }
      : null,
    instructorName: activity.instructorEmployee?.name ?? null,
    agentName:
      activity.agent?.person?.socialName ??
      activity.agent?.person?.fullName ??
      activity.agent?.company?.tradeName ??
      activity.agent?.company?.corporateName ??
      activity.agent?.nome ??
      null,
  }));

  return (
    <>
      <OperationalHeaderActions><span className="text-[13px]">Atividades: {activities.length} · Ativas: {activeActivities.length} · Modalidades: {activeModalities.size} · Espaços: {usedSpaces.size}</span></OperationalHeaderActions>
      <AtividadesEsporteLazerClient activities={serializedActivities} />
    </>
  );
}
