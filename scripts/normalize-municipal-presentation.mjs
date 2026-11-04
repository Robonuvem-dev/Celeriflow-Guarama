import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

// Each table/column and exact source value was reviewed separately. This is not
// a regex replacement over arbitrary data. Original values remain in a private
// provenance ledger; no signed evidence, audit event or source file is changed.
const base = "Base fictícia autorizada: município mineiro de aproximadamente 50 mil habitantes. Não representa operação oficial.";
const rules = [
  ["Asset", "description", base, null],
  ["Department", "description", base, null],
  ["Material", "description", base, null],
  ["Role", "description", base, null],
  ["FleetDocument", "notes", base, null],
  ["FleetUnit", "notes", `${base} Identificadores sintéticos. Chassi/série no patrimônio vinculado.`, "Chassi/série no patrimônio vinculado."],
  ["Address", "complement", "Cenário sintético", null],
  ["SocialAttendance", "description", "Atendimento sintético de orientação, análise documental e acesso à rede.", "Orientação, análise documental e acesso à rede."],
  ["SocialBenefitRequest", "reason", "Solicitação sintética para demonstrar análise e entrega de benefício eventual.", "Solicitação de análise de benefício eventual."],
  ["SocialBenefitRequestItem", "assessment", "Parecer sintético da equipe.", "Análise registrada pela equipe."],
  ["SocialBenefitRequestItem", "deliveryReason", "Entrega real do cenario POC, com data efetiva informada e baixa de estoque.", "Entrega com data efetiva informada e baixa de estoque."],
  ["SocialCatalogEntry", "description", "Catálogo local de demonstração; validar critérios municipais.", "Catálogo municipal de condições socioassistenciais."],
  ["SocialConditionality", "observations", "Dados sintéticos; não representam efeito ou decisão de programa federal.", "Registro municipal de acompanhamento; não representa decisão de programa federal."],
  ["SocialFinancialEntry", "observations", "Lançamento sintético para demonstração da ficha socioeconômica.", "Lançamento da ficha socioeconômica."],
  ["SocialFollowup", "diagnosis", "Avaliação socioeconômica sintética da família.", "Avaliação socioeconômica da família."],
  ["SocialFollowupNote", "description", "Família compareceu à orientação e apresentou documentação do cenário POC.", "Orientação familiar e análise documental registradas no acompanhamento."],
  ["SocialMessage", "body", "Aviso de demonstração: confira o prazo de atualização cadastral junto à sua unidade de referência.", "Confira o prazo de atualização cadastral junto à sua unidade de referência."],
  ["SocialNetworkOrganization", "name", "Posto municipal CadÚnico — POC", "Posto municipal CadÚnico"],
  ["SocialPersonFact", "observations", "Rede de apoio comunitária — cenário sintético.", "Rede de apoio comunitária."],
  ["SocialProfessionalRegistration", "council", "CRESS — demonstração", null],
  ["SocialProfessionalRegistration", "registration", "POC-1001", null],
  ["SocialProgram", "description", "Cenário sintético de demonstração.", "Acompanhamento municipal das famílias."],
  ["SocialProgram", "name", "Programa municipal de apoio às famílias — POC", "Programa municipal de apoio às famílias"],
  ["SocialQuestionnaire", "title", "Avaliação de acesso à rede — POC", "Avaliação de acesso à rede"],
  ["SocialScfvEvent", "report", "Encontro sintético executado, com chamada individual e avaliação do grupo.", "Encontro com chamada individual e avaliação do grupo."],
  ["SocialUnitRegistration", "legalName", "Unidade socioassistencial CRAS Jardim das Acácias — cenário sintético", "Unidade socioassistencial CRAS Jardim das Acácias"],
  ["SocialUnitRegistration", "legalName", "Unidade socioassistencial CREAS Aurora das Veredas — cenário sintético", "Unidade socioassistencial CREAS Aurora das Veredas"],
  ["SocialVisit", "report", "Visita de demonstração realizada; condições domiciliares registradas no acompanhamento.", "Condições domiciliares registradas no acompanhamento."],
  ["Person", "motherName", "Filiação materna de demonstração", "Não informada"],
  ["Person", "fatherName", "Filiação paterna de demonstração", "Não informado"],
  ["Person", "birthPlace", "Aurora das Veredas/MG — fictícia", null],
  ["Person", "fullName", "Responsável de importação POC", "Responsável familiar importado"],
  ["CadUnicoRecord", "nomeCompleto", "Responsável de importação POC", "Responsável familiar importado"],
  ["FleetDocument", "title", "Licenciamento anual 2026 — referência fictícia", "Licenciamento anual 2026"],
  ["FleetDriver", "policyReference", "Política sintética para demonstração; validar norma municipal.", "Não informada"],
  ["MaterialMovement", "reason", `Saldo inicial fictício autorizado — ${base}`, "Saldo inicial de implantação"],
  ["PayrollEvent", "name", "Vencimento básico — cenário fictício", "Vencimento básico"],
  ["ProcessMovement", "reason", "Encaminhamento inicial para análise — cenário fictício.", "Encaminhamento inicial para análise."],
  ["Role", "description", "Nomeação fictícia para a base de demonstração municipal.", null],
  ["SocialBenefitRequest", "reason", "Solicitação individual de demonstração pela interface, com solicitante e usufrutuário identificados.", "Solicitação individual, com solicitante e usufrutuário identificados."],
  ["SocialBenefitRequestItem", "assessment", "Indeferimento sintético fundamentado para demonstração.", "Indeferimento registrado na avaliação."],
  ["SocialBenefitRequestItem", "assessment", "Parecer de homologacao POC: beneficio deferido conforme cenario sintetico.", "Benefício deferido na avaliação."],
  ["SocialBenefitStockMovement", "supplierName", "Fornecedor sintético POC", null],
  ["SocialImportBatch", "filename", "exemplo-local-poc.csv", "cadastro-familiar.csv"],
  ["Person", "rg", "POC-PROF-001", null],
  ["SocialFamily", "familyCode", "POC-IMPORT-1", "AV-IMPORT-1"],
];

// Only identifiers emitted by the inspected Social seed are cleared. Unknown
// civil-document/benefit numbers are left absent rather than invented.
for (let family = 0; family < 25; family++) {
  for (let member = 0; member < 3; member++) {
    rules.push(["Person", "rg", `POC-${family}-${member}`, null]);
    rules.push(["SocialBeneficiaryRegistration", "birthCertificate", `Certidão sintética ${family}/${member}`, null]);
  }
  rules.push(["SocialProgramEnrollment", "benefitNumber", `POC-BEN-${family + 1}`, null]);
  if (family >= 10) rules.push(["SocialFamily", "familyCode", `AV-POC-${family + 1}`, `AV-FAM-${family + 1}`]);
}
for (const benefit of ["000", "001", "002", "003"]) rules.push(["SocialBenefitStockMovement", "invoiceNumber", `social-poc-2026-v1-aurora-system-v1:social-benefit:${benefit}`, null]);
for (const time of ["18:14", "18:38", "18:41", "18:43", "18:59"]) rules.push(["SocialVisit", "objective", `Visita HTTP POC 2026-11-01T${time}`, "Visita domiciliar para acompanhamento familiar"]);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const apply = process.argv.includes("--apply");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('municipal-presentation-normalization',0))");
    const summary = [];
    for (const [table, column, previous, current] of rules) {
      // SQL identifiers come exclusively from the reviewed constant allowlist.
      const key = table === "SocialProfessionalRegistration" ? "employeeId" : table === "SocialUnitRegistration" ? "unitId" : table === "SocialBeneficiaryRegistration" ? "personId" : "id";
      const { rows } = await client.query(`SELECT "${key}" AS id FROM "${table}" WHERE "${column}"=$1 FOR UPDATE`, [previous]);
      summary.push({ table, column, count: rows.length });
      if (!apply) continue;
      for (const { id } of rows) {
        await client.query('INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), table, id, column, previous, current]);
        await client.query(`UPDATE "${table}" SET "${column}"=$1 WHERE "${key}"=$2 AND "${column}"=$3`, [current, id, previous]);
      }
    }
    // These uploaded PDFs contain verification text. Archive their operational
    // metadata while retaining the original bytes, titles, hashes and versions.
    const archived = await client.query('SELECT id,status FROM "Document" WHERE title = ANY($1::text[]) AND status<>$2 FOR UPDATE', [["Planejamento SCFV - comprovacao POC", "Registro profissional POC - homologacao"], "Arquivado"]);
    summary.push({ table: "Document", column: "status", count: archived.rows.length });
    if (apply) for (const row of archived.rows) {
      await client.query('INSERT INTO "MunicipalPresentationRevision" (id,"tableName","recordId","columnName","previousValue","currentValue") VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), "Document", row.id, "status", row.status, "Arquivado"]);
      await client.query('UPDATE "Document" SET status=$1 WHERE id=$2', ["Arquivado", row.id]);
    }
    await client.query(apply ? "COMMIT" : "ROLLBACK");
    const grouped = new Map();
    for (const item of summary) { const key = `${item.table}.${item.column}`; grouped.set(key, (grouped.get(key) || 0) + item.count); }
    console.log(JSON.stringify({ mode: apply ? "applied" : "preview", total: summary.reduce((total, item) => total + item.count, 0), fields: Object.fromEntries([...grouped].filter(([, count]) => count)) }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { await client.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha no saneamento de apresentação."); process.exitCode = 1; });
