import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { createProcessesPortalsDatabase } from "./helpers/processes-portals-database";
import { createCitizenRequest, consultCitizenRequest, appealCitizenRequest, rateCitizenService } from "../src/lib/transparencia/citizen-service";
import { transparencyCitizenRequests, transparencyCitizenAppeals, transparencySatisfactions } from "../src/db/schema/citizen-channels";
import { tickets, supportChannels } from "../src/db/schema/attendance-portals";
import { processes, processSequences } from "../src/db/schema/processes";

test("e-SIC/Ouvidoria: prazos, replay, sigilo, integração, recursos e avaliação com Drizzle/Neon", async t => {
  const { connection, close } = await createProcessesPortalsDatabase();
  const db = connection.db;
  const input = { type: "ESIC", name: "Solicitante", email: "pessoa@example.test", subject: "Informação pública", message: "Solicito acesso aos dados públicos do orçamento municipal.", requestKey: randomUUID() };
  try {
    const before = Date.now();
    const receipt = await createCitizenRequest(connection, input);
    const [stored] = await db.select().from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.protocol, receipt.protocol));
    await t.test("20/30 dias, token hasheado e processo sem identidade ou narrativa", async () => {
      assert.ok(stored.dueAt.getTime() >= before + 20 * 86400000);
      assert.ok(stored.dueAt.getTime() <= Date.now() + 20 * 86400000);
      assert.equal(stored.accessHash, createHash("sha256").update(receipt.token).digest("hex"));
      assert.notEqual(stored.accessHash, receipt.token);
      const [process] = await db.select().from(processes).where(eq(processes.id, stored.processId!));
      assert.ok(process.description && !process.description.includes(input.message) && !process.description.includes(input.name));
      assert.equal(process.personId, null);
      assert.equal(process.companyId, null);
      const anonymous = await createCitizenRequest(connection, { type: "RECLAMACAO", subject: "Manifestação sem identidade", message: "Solicito a melhoria do atendimento e dos serviços municipais." });
      const [manifestation] = await db.select().from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.protocol, anonymous.protocol));
      assert.ok(manifestation.dueAt.getTime() >= before + 30 * 86400000);
      assert.equal(manifestation.name, null);
    });
    await t.test("replay não gera protocolo, processo ou incremento adicional", async () => {
      const [sequenceBefore] = await db.select().from(processSequences);
      assert.deepEqual(await createCitizenRequest(connection, input), receipt);
      const [sequenceAfter] = await db.select().from(processSequences);
      assert.equal(sequenceAfter.nextNumber, sequenceBefore.nextNumber);
      const [{ total }] = await db.select({ total: count() }).from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.requestKeyHash, stored.requestKeyHash!));
      assert.equal(total, 1);
      await assert.rejects(createCitizenRequest(connection, { ...input, message: "Conteúdo diferente para a mesma chave de pedido público." }), /outro conteúdo/);
    });
    await t.test("consulta usa chave privada e resposta integrada com projeção explícita", async () => {
      assert.equal(await consultCitizenRequest(db, receipt.protocol, "b".repeat(64)), null);
      const [channel] = await db.insert(supportChannels).values({ name: "e-SIC de teste" }).returning({ id: supportChannels.id });
      const now = new Date();
      const [ticket] = await db.insert(tickets).values({ ticketNumber: "SIC-INTEGRATION", subject: input.subject, description: input.message, channelId: channel.id, status: "Resolvido", solution: "Resposta institucional do atendimento", resolvedAt: now }).returning({ id: tickets.id });
      await db.update(transparencyCitizenRequests).set({ nativeTicketId: ticket.id }).where(eq(transparencyCitizenRequests.id, stored.id));
      const response = await consultCitizenRequest(db, receipt.protocol, receipt.token);
      assert.equal(response?.status, "RESPONDIDO");
      assert.equal(response?.response, "Resposta institucional do atendimento");
      assert.deepEqual(Object.keys(response!).sort(), ["appeals", "createdAt", "dueAt", "entity", "extensionReason", "outcome", "protocol", "respondedAt", "response", "status", "subject", "type"].sort());
      assert.equal(response?.respondedAt?.getTime(), now.getTime());
    });
    await t.test("recursos exigem chave, resposta e janela; instância pendente impede outra", async () => {
      await assert.rejects(appealCitizenRequest(db, receipt.protocol, "b".repeat(64), "Fundamento de recurso do pedido de acesso."));
      const appeal = await appealCitizenRequest(db, receipt.protocol, receipt.token, "Fundamento de recurso do pedido de acesso.");
      assert.equal(appeal.level, 1);
      assert.ok(appeal.dueAt.getTime() > Date.now() + 4 * 86400000);
      await assert.rejects(appealCitizenRequest(db, receipt.protocol, receipt.token, "Segundo recurso antes da resposta da autoridade."), /pendente/);
      await db.update(transparencyCitizenAppeals).set({ respondedAt: new Date(Date.now() - 11 * 86400000), status: "RESPONDIDO" }).where(eq(transparencyCitizenAppeals.requestId, stored.id));
      await assert.rejects(appealCitizenRequest(db, receipt.protocol, receipt.token, "Recurso apresentado fora da janela legal."), /prazo/);
    });
    await t.test("avaliação mantém uma linha, atualiza notas e exige titularidade", async () => {
      await rateCitizenService(db, receipt.protocol, receipt.token, 5, "Comentário restrito");
      await rateCitizenService(db, receipt.protocol, receipt.token, { serviceScore: 4, qualityScore: 3, deadlineScore: 2 }, "Atualização da mesma avaliação");
      const scores = await db.select().from(transparencySatisfactions).where(eq(transparencySatisfactions.requestId, stored.id));
      assert.equal(scores.length, 1);
      assert.deepEqual([scores[0].rating, scores[0].qualityRating, scores[0].deadlineRating], [4, 3, 2]);
      await assert.rejects(rateCitizenService(db, receipt.protocol, "b".repeat(64), 5, ""));
    });
  } finally { await close(); }
});
