import SegMobCrudClient from "../components/SegMobCrudClient";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { mapInfracao } from "../data";
import type { SegMobPageConfig } from "../types";
import { InfracoesInteractiveClient } from "./InfracoesInteractiveClient";
import { db } from "@/db/client";
import { listSecurityInfractions } from "@/db/repositories/security-mobility/queries";
import Link from "next/link";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";

const config: SegMobPageConfig = {
  title: "Autos de Infracao",
  description: "Controle administrativo de infracoes de transito registradas pela fiscalizacao municipal.",
  newLabel: "Novo auto",
  kind: "infracao",
  typeOptions: ["Estacionamento irregular", "Avanco de sinal", "Carga e descarga", "Bloqueio de via", "Transporte irregular"],
  statusOptions: ["Registrado", "Notificado", "Em Recurso", "Pago", "Cancelado"],
  codeLabel: "Numero do auto",
  titleLabel: "Placa",
  typeLabel: "Tipo da infracao",
  locationLabel: "Local",
  showDate: true,
  showPlate: true,
  showValue: true,
  accentClass: "bg-cyan-700 hover:bg-cyan-800",
};

export default async function InfracoesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await getTenantContextForModule("SEGURANCA");
  const infracoes = await listSecurityInfractions(db);
  const params = await searchParams;
  if (params.view === "emitir") return <main className="space-y-4 p-4"><Link href="/seguranca/infracoes">Voltar aos autos</Link><InfracoesInteractiveClient /></main>;
  return (
    <>
      <OperationalHeaderActions><Link href="/seguranca/infracoes?view=emitir" className={styles.dialogButton}>Emissão instantânea</Link></OperationalHeaderActions>
      <SegMobCrudClient items={infracoes.map(mapInfracao)} config={config} />
    </>
  );
}
