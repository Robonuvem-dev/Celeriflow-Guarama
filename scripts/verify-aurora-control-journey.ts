import assert from "node:assert/strict";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { requireControlPlan } from "../src/db/repositories/internal-control/records";
import { createInternalControlFindingInTransaction, resolveInternalControlFindingInTransaction, transitionInternalControlPlanInTransaction } from "../src/lib/c7/operations-service";
import { sendControlNoticeInTransaction, respondControlNoticeInTransaction, reviewControlNoticeResponseInTransaction } from "../src/lib/c7/control-notifications";
import { buildControlReportInTransaction, renderControlReport } from "../src/lib/c7/control-report";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const rollback = new Error("ROLLBACK_CONTROL_REHEARSAL");

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL!);
  const evidence: unknown[] = [];
  let failure: unknown;
  const counts = async () => (await connection.db.execute<{ findings: number; events: number }>(sql`SELECT (SELECT count(*)::int FROM "InternalControlFinding") AS findings, (SELECT count(*)::int FROM "InternalControlEvent") AS events`)).rows[0];
  try {
    const before = await counts();
    try {
      await withDatabaseTransaction(connection, async tx => {
        const user = (await tx.execute<{ id: string; ativo: boolean; profileCode: string }>(sql`SELECT u.id, u.ativo, p.codigo AS "profileCode" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.email=${"admin@email.com"}`)).rows[0];
        assert.ok(user?.ativo && user.profileCode === "SYSTEM_ADMINISTRATOR");
        const reviewer = (await tx.execute<{ id: string; ativo: boolean }>(sql`SELECT id, ativo FROM "Usuario" WHERE id=${"cmv2sbpnj000106lbisa3zhwf"}`)).rows[0];
        assert.ok(reviewer?.ativo);
        const units = (await tx.execute<{ budgetUnitId: string }>(sql`SELECT "budgetUnitId" FROM "UsuarioUnidadeGestora" WHERE "usuarioId"=${reviewer.id}`)).rows;
        const owner = { usuarioId: user.id };
        const recipient = { usuarioId: reviewer.id, allowedBudgetUnitIds: units.map(item => item.budgetUnitId) };
        for (const suffix of ["exe", "leg"]) {
          const planId = `aurora-finance-control-2026-v1:plan:${suffix}`;
          const plan = await requireControlPlan(tx, planId);
          assert.equal(plan.ownerId, owner.usuarioId);
          assert.equal(plan.status, "ABERTO");
          const finding = await createInternalControlFindingInTransaction(tx, owner, { planId, title: "Conferência documental de suprimentos", description: "Solicitar comprovação da conferência do catálogo e das dotações antes da operação de suprimentos." });
          const input = { planId, findingId: finding.id, recipientId: recipient.usuarioId, title: "Conferência de suprimentos", message: "Informe a conferência do catálogo e das dotações municipais.", dueAt: new Date(Date.now() + 15 * 86400000), documentIds: [], idempotencyKey: `REHEARSAL-CONTROL-NOTICE-${suffix}` };
          const notice = await sendControlNoticeInTransaction(tx, owner, input);
          assert.equal((await sendControlNoticeInTransaction(tx, owner, input)).id, notice.id);
          await assert.rejects(resolveInternalControlFindingInTransaction(tx, owner, finding.id, "Encerramento antecipado"), /notificações pendentes/);
          await assert.rejects(respondControlNoticeInTransaction(tx, owner, { noticeId: notice.id, response: "Resposta pelo remetente", documentIds: [] }), /Somente o destinatário/);
          const responseInput = { noticeId: notice.id, response: "Catálogo e dotações conferidos para o ensaio de suprimentos.", documentIds: [] };
          const response = await respondControlNoticeInTransaction(tx, recipient, responseInput);
          assert.equal((await respondControlNoticeInTransaction(tx, recipient, responseInput)).id, response.id);
          await assert.rejects(reviewControlNoticeResponseInTransaction(tx, recipient, { noticeId: notice.id, accepted: true, reason: "Autoanálise" }), /controlador|própria resposta/);
          const reviewInput = { noticeId: notice.id, accepted: true, reason: "Resposta analisada pelo controlador para esta conferência transitória." };
          const review = await reviewControlNoticeResponseInTransaction(tx, owner, reviewInput);
          assert.equal((await reviewControlNoticeResponseInTransaction(tx, owner, reviewInput)).id, review.id);
          assert.equal((await resolveInternalControlFindingInTransaction(tx, owner, finding.id, "Resposta recebida e analisada.")).status, "RESOLVIDO");
          await assert.rejects(transitionInternalControlPlanInTransaction(tx, owner, { planId, status: "CONCLUIDO", reason: "Concluir antes dos checklists" }), /checklists/);
          const report = await buildControlReportInTransaction(tx, owner, { planId, noticeId: notice.id });
          assert.match(report.hash, /^[a-f0-9]{64}$/);
          const pdf = await renderControlReport(report, "PDF"), csv = await renderControlReport(report, "CSV"), xlsx = await renderControlReport(report, "XLSX");
          assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
          assert.ok(csv.bytes.toString("utf8").includes(report.hash));
          assert.equal(xlsx.bytes.subarray(0, 2).toString(), "PK");
          evidence.push({ entity: suffix, findingResolved: true, recipientResponse: true, segregatedReview: true, noticeResponseReviewReplays: true, prematureResolutionRejected: true, senderResponseRejected: true, selfReviewRejected: true, unansweredChecklistsPreventPlanClosure: true,
            reportHash: report.hash, bytes: { pdf: pdf.bytes.length, csv: csv.bytes.length, xlsx: xlsx.bytes.length } });
        }
        throw rollback;
      }, { timeoutMs: 180000, isolationLevel: "serializable" });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ evidence, rollbackVerified: true, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência do Controle Interno."); process.exitCode = 1; });
