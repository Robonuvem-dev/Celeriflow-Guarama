import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { gedGenerated, gedSmartFolders, gedTemplates } from "../src/db/schema/ged-management";
import { saveGedSmartFolder, saveGedTemplate, generateGedTemplate, readGedDetail } from "../src/lib/documents/ged-service";
import { gedQuerySchema } from "../src/lib/documents/ged-policy";
import { listGedSection } from "../src/db/repositories/documents/ged";
import { populationContext } from "./lib/population-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply");
const output = "docs/plano-populacao-2026-11-08/execucao/ged";
const catalog = [
  ["Despacho de encaminhamento", "Encaminhamentos administrativos", "Encaminho o processo {{protocolo}} à unidade {{unidade}} para análise de {{objeto}} e manifestação no prazo de dez dias úteis."],
  ["Termo de recebimento de materiais", "Recebimento de materiais", "A unidade {{unidade}} recebeu os materiais relativos ao processo {{protocolo}}. Objeto: {{objeto}}. Responsável pela conferência: {{responsavel}}."],
  ["Declaração de matrícula", "Declarações escolares", "Declaramos que {{nome}} encontra-se matriculado na Escola Municipal Caminhos do Saber, no ano letivo de 2026. Referência: {{protocolo}}."],
  ["Ofício de solicitação de documentos", "Solicitações de documentos", "Solicitamos a {{nome}} a apresentação dos documentos necessários à instrução do processo {{protocolo}}, referente a {{objeto}}."],
  ["Relatório de vistoria de imóvel", "Vistorias de imóveis", "Imóvel: {{endereco}}. Responsável: {{responsavel}}. Foram verificadas as condições de conservação e acessibilidade. Encaminhamento: {{objeto}}."],
  ["Termo de responsabilidade patrimonial", "Responsabilidade patrimonial", "{{nome}} assume a guarda dos bens destinados à unidade {{unidade}}, relacionados ao processo {{protocolo}}, e compromete-se a comunicar alterações de localização."],
  ["Solicitação de manutenção de veículo", "Manutenção de veículos", "Solicita-se a inspeção preventiva do veículo destinado à unidade {{unidade}}. Serviço: {{objeto}}. Responsável: {{responsavel}}. Processo: {{protocolo}}."],
  ["Relatório de visita domiciliar", "Visitas domiciliares", "Visita à família de {{nome}}, residente em {{endereco}}. Unidade de referência: {{unidade}}. Encaminhamento acordado: {{objeto}}."],
  ["Declaração de comparecimento", "Declarações de comparecimento", "Declaramos que {{nome}} compareceu à unidade {{unidade}} para atendimento em {{data}}. Responsável pelo atendimento: {{responsavel}}."],
  ["Ofício de convocação para reunião", "Convocações para reunião", "Convidamos {{nome}} para reunião na unidade {{unidade}}, em {{data}}, com a pauta: {{objeto}}."],
  ["Ata de reunião de equipe", "Atas de reuniões", "Em {{data}}, reuniu-se a equipe da unidade {{unidade}}, sob coordenação de {{responsavel}}, para deliberar sobre {{objeto}}."],
  ["Relatório de execução de serviço", "Execução de serviços", "Serviço: {{objeto}}. Unidade requisitante: {{unidade}}. Processo: {{protocolo}}. Conferência realizada por {{responsavel}} em {{data}}."],
  ["Requerimento de atualização cadastral", "Atualizações cadastrais", "{{nome}} requer a atualização do endereço para {{endereco}} no processo {{protocolo}}. Conferência documental pela unidade {{unidade}}."],
  ["Termo de entrega de equipamentos", "Entrega de equipamentos", "Em {{data}}, {{responsavel}} entregou a {{nome}} os equipamentos destinados a {{objeto}}, sob guarda da unidade {{unidade}}."],
  ["Parecer de análise administrativa", "Pareceres administrativos", "Após análise do processo {{protocolo}}, referente a {{objeto}}, a unidade {{unidade}} recomenda o prosseguimento da instrução. Responsável: {{responsavel}}."],
  ["Solicitação de reserva de espaço cultural", "Reservas de espaços culturais", "{{nome}} solicita reserva do espaço comunitário para {{objeto}}, em {{data}}. Contato e endereço de referência: {{endereco}}."],
  ["Relatório de acompanhamento de obra", "Acompanhamento de obras", "Obra: {{objeto}}. Endereço: {{endereco}}. Acompanhamento da unidade {{unidade}}, realizado por {{responsavel}} em {{data}}."],
  ["Comunicado de atendimento ao cidadão", "Atendimentos ao cidadão", "Informamos a {{nome}} que o atendimento referente ao processo {{protocolo}} foi encaminhado à unidade {{unidade}}. Providência: {{objeto}}."],
  ["Autorização de deslocamento da equipe", "Deslocamentos de equipes", "Autoriza-se o deslocamento de {{responsavel}} à unidade {{unidade}} em {{data}}, para {{objeto}}, conforme processo {{protocolo}}."],
  ["Relatório de inventário de materiais", "Inventários de materiais", "Em {{data}}, a unidade {{unidade}} realizou conferência dos materiais destinados a {{objeto}}, sob responsabilidade de {{responsavel}}. Processo: {{protocolo}}."],
  ["Termo de encerramento de processo", "Encerramentos de processos", "Concluídas as providências referentes a {{objeto}}, registra-se o encerramento do processo {{protocolo}}, da unidade {{unidade}}, em {{data}}. Responsável: {{responsavel}}."],
] as const;
const report = { startedAt: new Date().toISOString(), mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", templates: [] as { id: string; name: string; reused: boolean }[], folders: [] as { id: string; name: string; reused: boolean }[], documents: [] as { id: string; templateId: string; reused: boolean; bytes: number }[], checks: [] as string[], status: "RUNNING", error: "" };
async function main() {
  try {
    const context = await populationContext();
    const rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, tx => inDatabaseTransactionScope(databaseConnection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('MUNICIPAL_GED_20261108'))`);
        for (const [index, [name, folderName, body]] of catalog.entries()) {
          const templateKey = `municipal-2026-document-${index + 1}`;
          const [existing] = await tx.select().from(gedTemplates).where(and(eq(gedTemplates.templateKey, templateKey), eq(gedTemplates.ownerId, context.user.id))).limit(1);
          const template = existing ?? await saveGedTemplate(context, name, `${name.toLocaleUpperCase("pt-BR")}\n\n${body}\n\nVereda das Auroras, {{data}}.`, undefined, templateKey);
          report.templates.push({ id: template.id, name, reused: Boolean(existing) });
          const [prior] = await tx.select().from(gedSmartFolders).where(and(eq(gedSmartFolders.ownerId, context.user.id), eq(gedSmartFolders.name, folderName))).limit(1);
          const folder = prior ?? await saveGedSmartFolder({ ...context, database: tx as unknown as typeof context.database }, folderName, { text: name, mode: "phrase" }, index % 3 === 0);
          report.folders.push({ id: folder.id, name: folderName, reused: Boolean(prior) });
        }
        if (!apply) throw rollback;
      }), { timeoutMs: 240_000 });
    } catch (error) { if (error !== rollback) throw error; }
    if (apply) {
      const [documentClass] = (await databaseConnection.db.execute<{ code: string }>(sql`SELECT code FROM "DocumentClass" WHERE "isActive" AND code='GED_INTERNAL_ALLOWED' LIMIT 1`)).rows;
      assert.ok(documentClass, "Classe documental interna não configurada.");
      for (const [index, template] of report.templates.entries()) {
        const [prior] = await databaseConnection.db.select().from(gedGenerated).where(eq(gedGenerated.templateVersionId, template.id)).limit(1);
        const created = prior ?? await generateGedTemplate(context, template.id, { nome: index % 2 ? "Maria Aparecida dos Santos" : "João da Silva", responsavel: "Ana Paula Ribeiro", unidade: "Secretaria Municipal de Administração", endereco: "Rua das Acácias, 150, Centro", protocolo: `2026/${String(9101 + index).padStart(6, "0")}`, objeto: "organização do atendimento e conservação das unidades municipais", data: "9 de novembro de 2026" }, documentClass.code);
        const detail = await readGedDetail(context, created.documentId);
        assert.equal(detail.document.title, template.name);
        assert.ok(detail.document.byteLength > 0);
        report.documents.push({ id: created.documentId, templateId: template.id, reused: Boolean(prior), bytes: detail.document.byteLength });
      }
      for (const section of ["pastas-inteligentes", "modelos"] as const) {
        const first = await listGedSection(context, section, gedQuerySchema.parse({}), 1);
        const second = await listGedSection(context, section, gedQuerySchema.parse({}), 2);
        assert.equal(first.rows.length, 20); assert.ok(second.rows.length > 0);
        assert.ok(!first.rows.some(row => second.rows.some(other => other.id === row.id)));
        report.checks.push(`${section}: 20 registros na primeira página e segunda página sem repetição`);
      }
    }
    report.status = "PASS";
  } catch (error) {
    report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 500) : "Falha na carga GED"; process.exitCode = 1;
  } finally {
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/${apply ? "applied" : "preview"}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    await databaseConnection.pool.end();
  }
}
void main();
