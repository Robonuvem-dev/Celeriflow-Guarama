import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma, type PrismaClient } from "@prisma/client";
import { createInternalControlFinding, resolveInternalControlFinding, transitionInternalControlPlan } from "../src/lib/c7/operations-service";
import { sendControlNotice, respondControlNotice, reviewControlNoticeResponse } from "../src/lib/c7/control-notifications";
import { buildControlReport, renderControlReport } from "../src/lib/c7/control-report";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const rollback = new Error("ROLLBACK_CONTROL_REHEARSAL");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const evidence: unknown[] = [];
  let failure: unknown;
  const counts = async () => ({ findings: await prisma.internalControlFinding.count(), events: await prisma.internalControlEvent.count() });
  try {
    const before = await counts();
    try {
      await prisma.$transaction(async tx => {
        const db = new Proxy(tx, { get(target, property) {
          if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
          return Reflect.get(target, property);
        } }) as unknown as PrismaClient;
        const user = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
        assert.ok(user.ativo && user.perfil.codigo === "SYSTEM_ADMINISTRATOR");
        const reviewer = await tx.usuario.findUniqueOrThrow({ where: { id: "cmv2sbpnj000106lbisa3zhwf" }, include: { unidadesGestoras: true } });
        assert.ok(reviewer.ativo);
        const owner = { usuarioId: user.id };
        const recipient = { usuarioId: reviewer.id, allowedBudgetUnitIds: reviewer.unidadesGestoras.map(item => item.budgetUnitId) };
        for (const suffix of ["exe", "leg"]) {
          const planId = `aurora-finance-control-2026-v1:plan:${suffix}`;
          const plan = await tx.internalControlPlan.findUniqueOrThrow({ where: { id: planId } });
          assert.equal(plan.ownerId, owner.usuarioId);
          assert.equal(plan.status, "ABERTO");
          const finding = await createInternalControlFinding(db, owner, { planId, title: "Conferência documental de suprimentos", description: "Solicitar comprovação da conferência do catálogo e das dotações antes da operação de suprimentos." });
          const input = { planId, findingId: finding.id, recipientId: recipient.usuarioId, title: "Conferência de suprimentos", message: "Informe a conferência do catálogo e das dotações municipais.", dueAt: new Date(Date.now() + 15 * 86400000), documentIds: [], idempotencyKey: `REHEARSAL-CONTROL-NOTICE-${suffix}` };
          const notice = await sendControlNotice(db, owner, input);
          assert.equal((await sendControlNotice(db, owner, input)).id, notice.id);
          await assert.rejects(resolveInternalControlFinding(db, owner, finding.id, "Encerramento antecipado"), /notificações pendentes/);
          await assert.rejects(respondControlNotice(db, owner, { noticeId: notice.id, response: "Resposta pelo remetente", documentIds: [] }), /Somente o destinatário/);
          const responseInput = { noticeId: notice.id, response: "Catálogo e dotações conferidos para o ensaio de suprimentos.", documentIds: [] };
          const response = await respondControlNotice(db, recipient, responseInput);
          assert.equal((await respondControlNotice(db, recipient, responseInput)).id, response.id);
          await assert.rejects(reviewControlNoticeResponse(db, recipient, { noticeId: notice.id, accepted: true, reason: "Autoanálise" }), /controlador|própria resposta/);
          const reviewInput = { noticeId: notice.id, accepted: true, reason: "Resposta analisada pelo controlador para esta conferência transitória." };
          const review = await reviewControlNoticeResponse(db, owner, reviewInput);
          assert.equal((await reviewControlNoticeResponse(db, owner, reviewInput)).id, review.id);
          assert.equal((await resolveInternalControlFinding(db, owner, finding.id, "Resposta recebida e analisada." )).status, "RESOLVIDO");
          await assert.rejects(transitionInternalControlPlan(db, owner, { planId, status: "CONCLUIDO", reason: "Concluir antes dos checklists" }), /checklists/);
          const report = await buildControlReport(db, owner, { planId, noticeId: notice.id });
          assert.match(report.hash, /^[a-f0-9]{64}$/);
          const pdf = await renderControlReport(report, "PDF"), csv = await renderControlReport(report, "CSV"), xlsx = await renderControlReport(report, "XLSX");
          assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
          assert.ok(csv.bytes.toString("utf8").includes(report.hash));
          assert.equal(xlsx.bytes.subarray(0, 2).toString(), "PK");
          evidence.push({ entity: suffix, findingResolved: true, recipientResponse: true, segregatedReview: true, noticeResponseReviewReplays: true, prematureResolutionRejected: true, senderResponseRejected: true, selfReviewRejected: true, unansweredChecklistsPreventPlanClosure: true,
            reportHash: report.hash, bytes: { pdf: pdf.bytes.length, csv: csv.bytes.length, xlsx: xlsx.bytes.length } });
        }
        throw rollback;
      }, { timeout: 180000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ evidence, rollbackVerified: true, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência do Controle Interno."); process.exitCode = 1; });
