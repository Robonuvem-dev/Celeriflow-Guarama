import "dotenv/config";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { employees as employeeTable } from "../src/db/schema/administration";
import { assets } from "../src/db/schema/assets";
import { documents } from "../src/db/schema/registry";
import { infrastructureServices } from "../src/db/schema/infrastructure";
import { securityGuards, securityOccurrences, securityInfractions, mobilityRecords } from "../src/db/schema/security-mobility";

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  const employees = await db.select().from(employeeTable).where(eq(employeeTable.isActive, true)).limit(3).orderBy(asc(employeeTable.name));
  const guards = await Promise.all([
    { matricula: "GCM-2026-001", nome: employees[0]?.name ?? "Marcos Vinicius Almeida", tipo: "Guarda Municipal", equipe: "Patrulha Centro", employeeId: employees[0]?.id },
    { matricula: "GCM-2026-002", nome: employees[1]?.name ?? "Renata Souza Barros", tipo: "Agente de Transito", equipe: "Equipe de Transito", employeeId: employees[1]?.id },
    { matricula: "GCM-2026-003", nome: employees[2]?.name ?? "Daniela Ferreira Costa", tipo: "Defesa Civil", equipe: "Nucleo de Prevencao", employeeId: employees[2]?.id },
  ].map(async (guard) => (await db.insert(securityGuards).values({ ...guard, status: "Ativo" }).onConflictDoUpdate({
    target: securityGuards.matricula,
    set: { nome: guard.nome, tipo: guard.tipo, equipe: guard.equipe, employeeId: guard.employeeId },
  }).returning())[0]));

  await db.insert(securityOccurrences).values({
      numero: "OC-2026-001", tipo: "Acidente de Transito", descricao: "Apoio operacional em colisao sem vitimas na Avenida Central.",
      local: "Avenida Central, proximo ao Mercado Municipal", bairro: "Centro", prioridade: "Alta", status: "Resolvida", responsavelGuardaId: guards[1].id,
  }).onConflictDoUpdate({ target: securityOccurrences.numero, set: { responsavelGuardaId: guards[0].id } });
  await db.insert(securityOccurrences).values({
      numero: "OC-2026-002", tipo: "Risco Estrutural", descricao: "Vistoria preventiva em muro com risco de desabamento apos chuvas intensas.",
      local: "Rua das Acacias, 142", bairro: "Vila Nova", prioridade: "Urgente", status: "Em Atendimento", responsavelGuardaId: guards[2].id,
  }).onConflictDoUpdate({ target: securityOccurrences.numero, set: { responsavelGuardaId: guards[2].id } });

  await db.insert(securityInfractions).values({ auto: "AIT-2026-0001", data: new Date("2026-06-12T10:30:00"), placa: "PES-4A21", tipo: "Estacionamento irregular", local: "Rua do Comercio", valor: 195.23, status: "Notificado" }).onConflictDoNothing({ target: securityInfractions.auto });
  await db.insert(securityInfractions).values({ auto: "AIT-2026-0002", data: new Date("2026-06-14T16:10:00"), placa: "RKL-8B76", tipo: "Avanco de sinal", local: "Avenida Norte com Rua Sete de Setembro", valor: 293.47, status: "Em Recurso" }).onConflictDoNothing({ target: securityInfractions.auto });

  const [asset, obrasServico, document] = await Promise.all([
    db.select().from(assets).where(inArray(assets.status, ["Ativo", "Em uso"])).orderBy(asc(assets.createdAt)).limit(1).then(rows => rows[0]),
    db.select().from(infrastructureServices).where(eq(infrastructureServices.active, true)).orderBy(desc(infrastructureServices.createdAt)).limit(1).then(rows => rows[0]),
    db.select().from(documents).orderBy(desc(documents.createdAt)).limit(1).then(rows => rows[0]),
  ]);

  const records = [
    { codigo: "RND-2026-001", categoria: "Ronda", tipo: "Ronda Escolar", titulo: "Roteiro escolas da area central", local: "Centro", responsavel: guards[0].nome, prioridade: "Normal", status: "Concluida", dataInicio: new Date("2026-06-13T07:00:00") },
    { codigo: "SIG-2026-001", categoria: "Sinalizacao", tipo: "Faixa de Pedestre", titulo: "Reforco de sinalizacao em travessia escolar", local: "Rua da Matriz", responsavel: guards[1].nome, prioridade: "Alta", status: "Em Execucao", dataInicio: new Date("2026-06-15T08:00:00"), assetId: asset?.id, obrasServicoId: obrasServico?.id },
    { codigo: "DOC-2026-001", categoria: "Documento", tipo: "Relatorio Mensal", titulo: "Relatorio operacional de junho", local: "Coordenacao da Guarda", responsavel: guards[0].nome, prioridade: "Normal", status: "Publicado", dataInicio: new Date("2026-06-30T17:00:00"), documentId: document?.id },
  ];
  for (const record of records) {
    await db.insert(mobilityRecords).values(record).onConflictDoUpdate({ target: mobilityRecords.codigo, set: record });
  }
  console.log("Seed de Seguranca e Mobilidade concluido.");
}

main().catch((error) => { console.error(error); process.exit(1); });
