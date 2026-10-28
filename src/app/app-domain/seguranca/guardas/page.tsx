import SegMobCrudClient from "../components/SegMobCrudClient";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { mapGuarda } from "../data";
import type { SegMobPageConfig } from "../types";
import { db } from "@/db/client";
import { listSecurityGuards } from "@/db/repositories/security-mobility/queries";

const config: SegMobPageConfig = {
  title: "Guarda Municipal, Agentes e Equipes",
  description: "Cadastro e gestao interna do efetivo municipal, equipes, escalas administrativas e situacao funcional.",
  newLabel: "Novo agente",
  kind: "guarda",
  typeOptions: ["Guarda Municipal", "Agente de Transito", "Defesa Civil", "Coordenacao"],
  statusOptions: ["Ativo", "Licenca", "Afastado", "Inativo"],
  codeLabel: "Matricula",
  titleLabel: "Nome do servidor",
  typeLabel: "Funcao",
  locationLabel: "Equipe/Escala",
  accentClass: "bg-cyan-700 hover:bg-cyan-800",
};

export default async function GuardasPage() {
  await getTenantContextForModule("SEGURANCA");
  const guardas = await listSecurityGuards(db);
  return <SegMobCrudClient items={guardas.map(mapGuarda)} config={config} />;
}
