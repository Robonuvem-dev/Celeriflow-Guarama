import assert from "node:assert/strict";
import test from "node:test";
import { createControlDrizzleFixture } from "../../../../tests/helpers/control-drizzle-fixture";
import { count } from "drizzle-orm";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { transparencyPublications } from "@/db/schema/transparency";
import { createInternalControlPlan } from "../operations-service";
import { saveControlFinalReport, finalizeControlFinalReport, publishControlFinalReport, readFrozenControlReportBytes, type ControlFinalReportInput } from "../circumstantiated-report";
import { defaultTransparencySettings, transparencySettingsKey } from "@/lib/transparencia/presentation-settings";

const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug"] };
const report: ControlFinalReportInput = { title: "Relatório circunstanciado municipal", category: "CIRCUMSTANCIADO", year: 2026, from: "2026-01-01", through: "2026-09-30", objective: "Avaliar os controles da execução municipal.", methodology: "Conferência de documentos e evidências nas origens canônicas.", conclusion: "Conclusão fundamentada da avaliação dos controles municipais.", boards: [{ number: 1, title: "Execução financeira", criterion: "Critério municipal explicitamente informado", evidence: "Documentos e eventos identificados pelo controlador", assessment: "Conferência documental com os limites registrados", recommendation: "Manter as evidências e acompanhar as providências" }], attachmentKeys: [], requiresDigitalSignature: false };

test("relatório circunstanciado: revisões concorrentes, final imutável e publicação conservam os mesmos bytes", async () => {
  const f = await createControlDrizzleFixture();
  try {
    const settings = defaultTransparencySettings(); settings.entities[0].nativeIds = ["ente"];
    await f.db.db.insert(instanceParameters).values({ configuracaoInstanciaId: "instancia", chave: transparencySettingsKey, valor: settings });
    const plan = await createInternalControlPlan(f.db, actor, { title: "Controle documental", reference: "2026", budgetUnitId: "ug" });
    const input = { planId: plan.id, expectedRevision: 0, input: report, idempotencyKey: "report-initial" };
    const first = await saveControlFinalReport(f.db, actor, input);
    assert.equal((await saveControlFinalReport(f.db, actor, input)).id, first.id);
    await assert.rejects(saveControlFinalReport(f.db, actor, { ...input, input: { ...report, title: "Outro relatório" } }), /Chave/);
    const revisions = await Promise.allSettled(["revision-a", "revision-b"].map(key => saveControlFinalReport(f.db, actor, { ...input, reportId: "report-initial", expectedRevision: 1, idempotencyKey: key })));
    assert.equal(revisions.filter(result => result.status === "fulfilled").length, 1);
    const next = revisions.find(result => result.status === "fulfilled"); assert.ok(next?.status === "fulfilled");
    await assert.rejects(finalizeControlFinalReport(f.db, actor, { editionId: first.id, reason: "Finalização da edição inicial" }), /mais recente/);
    const finalInput = { editionId: next.value.id, reason: "Finalização fundamentada da revisão atual" };
    const final = await finalizeControlFinalReport(f.db, actor, finalInput);
    assert.equal((await finalizeControlFinalReport(f.db, actor, finalInput)).id, final.id);
    const bytes = await readFrozenControlReportBytes(f.db.db, final.id);
    assert.equal(bytes.bytes.subarray(0, 5).toString(), "%PDF-");
    await assert.rejects(f.pg.query('UPDATE "InternalControlEvent" SET reason=$1 WHERE id=$2', ["Reescrever relatório final", final.id]), /imutáveis/);
    await assert.rejects(saveControlFinalReport(f.db, actor, { ...input, reportId: "report-initial", expectedRevision: 2, idempotencyKey: "after-final" }), /finalizado/);
    const publication = await publishControlFinalReport(f.db, actor, final.id);
    assert.equal(publication.sha256, bytes.sha256);
    assert.equal((await publishControlFinalReport(f.db, actor, final.id)).id, publication.id);
    assert.deepEqual((await readFrozenControlReportBytes(f.db.db, final.id)).bytes, bytes.bytes);
    await assert.rejects(publishControlFinalReport(f.db, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug"] }, final.id), /controlador/);
  } finally { await f.close(); }
});

test("relatório: assinatura exigida e anexos de outra entidade impedem publicação/finalização", async () => {
  const f = await createControlDrizzleFixture();
  try {
    const settings = defaultTransparencySettings(); settings.entities[0].nativeIds = ["ente"];
    await f.db.db.insert(instanceParameters).values({ configuracaoInstanciaId: "instancia", chave: transparencySettingsKey, valor: settings });
    const plan = await createInternalControlPlan(f.db, actor, { title: "Controle de relatórios", reference: "2026", budgetUnitId: "ug" });
    const edition = await saveControlFinalReport(f.db, actor, { planId: plan.id, expectedRevision: 0, input: { ...report, requiresDigitalSignature: true }, idempotencyKey: "signed-report" });
    const final = await finalizeControlFinalReport(f.db, actor, { editionId: edition.id, reason: "Documento final aguardando assinatura real" });
    await assert.rejects(publishControlFinalReport(f.db, actor, final.id), /assinatura digital/);
    assert.equal((await f.db.db.select({ value: count() }).from(transparencyPublications))[0].value, 0);
    await f.db.db.insert(transparencyPublications).values({ publicKey: "anexo-camara", title: "Anexo da Câmara", collectionSlug: "publicacoes", entity: "camara", year: 2026, group: "Controle", referencePeriod: "2026", status: "PUBLISHED", values: {} });
    const other = await saveControlFinalReport(f.db, actor, { planId: plan.id, expectedRevision: 0, input: { ...report, attachmentKeys: ["anexo-camara"] }, idempotencyKey: "wrong-attachment" });
    await assert.rejects(finalizeControlFinalReport(f.db, actor, { editionId: other.id, reason: "Finalizar com anexo de outra entidade" }), /mesma entidade/);
  } finally { await f.close(); }
});
