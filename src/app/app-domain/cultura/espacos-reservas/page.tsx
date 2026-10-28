import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ReservasAgendaClient } from "../components/ReservasAgendaClient";
import { db } from "@/db/client";
import { listCulturalReservations } from "@/db/repositories/culture/queries";

export default async function EspacosReservasPage() {
  await getTenantContextForModule("CULTURA");
  const reservas = await listCulturalReservations(db);

  return <ReservasAgendaClient reservas={reservas.map((reserva) => ({
    ...reserva,
    startsAt: reserva.startsAt.toISOString(),
    endsAt: reserva.endsAt.toISOString(),
  }))} />;
}
