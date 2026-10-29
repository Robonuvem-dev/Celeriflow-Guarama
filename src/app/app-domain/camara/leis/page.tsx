import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LeisClient } from "./LeisClient";
import { db } from "@/db/client";
import { listLaws } from "@/db/repositories/chamber/queries";

export default async function LeisPage() {
  await getTenantContextForModule("CAMARA");
  const leis = await listLaws(db);
  const rows = leis.map((lei) => ({
    id: lei.id,
    numero: lei.numero,
    tipo: lei.tipo,
    ementa: lei.ementa,
    autoria: lei.proposicao?.autor.nomeParlamentar ?? "Poder Executivo",
    publicacao: lei.dataPublicacao?.toISOString() ?? null,
    status: lei.status,
  }));
  return <LeisClient rows={rows} />;
}
