import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import { ownPortalContents, savePortalContent } from "../src/lib/portal-servidor/content-catalog";
import { uploadFile, deleteUploadedDocument } from "../src/lib/platform/blob";
import type { AppContext } from "../src/lib/platform/tenant-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_APRESENTACAO_2026_V1";
const documents = [
  { title: "Guia de navegação do Portal do Servidor", kind: "MANUAL" as const, filename: "guia-portal-servidor.txt", text: "GUIA DE NAVEGAÇÃO DO PORTAL DO SERVIDOR\n\nMaterial de apresentação do ambiente municipal fictício.\n\n1. Consulte Minha ficha funcional para conferir cargo, lotação e vínculo.\n2. Em Ponto, confira as marcações da competência selecionada.\n3. Consulte Férias para visualizar os períodos programados.\n4. Em Demonstrativos, abra o contracheque e utilize o download do PDF.\n5. Em Serviços, preencha a solicitação e acompanhe o protocolo correspondente.\n6. Em Locais de atendimento, consulte a equipe responsável.\n\nEste guia orienta a utilização do sistema; não substitui os atos e regulamentos municipais.\n" },
  { title: "Orientações para conferência cadastral e atendimento", kind: "DOCUMENTO" as const, filename: "orientacoes-conferencia-cadastral.txt", text: "ORIENTAÇÕES PARA CONFERÊNCIA CADASTRAL E ATENDIMENTO\n\nMaterial de apresentação do ambiente municipal fictício.\n\nConfira nome, vínculo, endereço e contatos antes de encaminhar uma solicitação.\nA atualização de dados depende da análise do setor de Gestão de Pessoas.\nPedidos de férias e revisão do ponto podem ser acompanhados pelo protocolo funcional.\nPara apoio na navegação, consulte o local de atendimento de Tecnologia da Informação.\n\nNão encaminhe senhas nos pedidos. Documentos e anexos devem ser enviados pelo fluxo próprio do sistema.\n" },
];
async function main() {
  try {
    const db = databaseConnection.db;
    const [actor] = (await db.execute<{ id: string; firebaseUid: string }>(sql`SELECT u.id,u."firebaseUid" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u.id='cmvba36v700007kqmdslbwhkk'`)).rows;
    assert.ok(actor);
    const identity = await findIdentityByFirebaseUid(db, actor.firebaseUid); assert.ok(identity);
    const context: AppContext = { database: db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
    const existing = await ownPortalContents(db, "THIAGO_MORCATTY_DEMO_2026_V1:employee");
    const report = { packageId, mode: process.argv.includes("--apply") ? "APPLIED" : "PREVIEW", created: [] as { id: string; title: string; sha256: string }[], planned: [] as string[] };
    for (const document of documents) {
      if (existing.some(row => row.data.title === document.title && row.data.budgetUnitId === "aurora-system-v1:budget-unit:000")) continue;
      if (report.mode === "PREVIEW") { report.planned.push(document.title); continue; }
      const file = new File([document.text], document.filename, { type: "text/plain" });
      const sha256 = createHash("sha256").update(document.text).digest("hex");
      const blob = await uploadFile(file);
      let saved = false;
      try {
        const id = await savePortalContent(context, { kind: document.kind, title: document.title, budgetUnitId: "aurora-system-v1:budget-unit:000", address: "", hours: "", contact: "", fileUrl: blob.url, fileName: document.filename, contentType: "text/plain; charset=utf-8", fileHash: sha256 });
        saved = true; report.created.push({ id, title: document.title, sha256 });
      } finally { if (!saved) await deleteUploadedDocument(blob); }
    }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/portal-library-${report.mode.toLowerCase()}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await databaseConnection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
