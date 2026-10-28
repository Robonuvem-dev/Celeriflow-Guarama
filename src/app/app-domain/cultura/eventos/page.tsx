import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { CulturaEventosClient } from "../components/CulturaEventosClient";
import { db } from "@/db/client";
import { listCulturalEvents } from "@/db/repositories/culture/queries";

export default async function EventosPage() {
  await getTenantContextForModule("CULTURA");
  const eventos = await listCulturalEvents(db);

  return <CulturaEventosClient eventos={eventos.map((evento) => ({
    ...evento,
    data: evento.data.toISOString(),
    startsAt: evento.startsAt?.toISOString() ?? null,
    endsAt: evento.endsAt?.toISOString() ?? null,
    reservas: evento.reservas.map((reserva) => ({
      ...reserva,
      startsAt: reserva.startsAt.toISOString(),
      endsAt: reserva.endsAt.toISOString(),
    })),
  }))} />;
}
