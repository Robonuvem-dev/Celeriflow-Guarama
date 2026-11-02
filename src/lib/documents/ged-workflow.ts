import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { insertInternalNotifications } from "@/db/repositories/platform/notifications";
import { requireGedObject, gedEntryScope } from "./ged-access";
import { gedActivity, requireGedConfiguration } from "./ged-governance";
import { flowGraphSchema, ruleSchema, validateIndexValues, type IndexField, type FlowGraph } from "./ged-admin-policy";

type Definition = { id: string; key: string; version: number; graph: FlowGraph; adoptOnAccess: boolean };
type Run = { id: string; documentId: string; versionId: string; definitionId: string; nodeId: string; status: string };
async function notifyNode(database: DatabaseTransaction, context: AppContext, run: Run, node: FlowGraph["nodes"][number]) {
  await insertInternalNotifications(database, { actorUsuarioId: context.user.id, recipientUserIds: node.users, sourceModule: "ASSINATURA_DIGITAL", entityType: "GED_DOCUMENT", entityId: run.documentId, type: "GED_FLOW", title: node.label, message: "Existe uma tarefa documental vinculada a uma versão para sua participação.", dedupeDiscriminator: `${run.id}:${run.definitionId}:${node.id}` });
}
export async function gedWorkflowCommand(context: AppContext, command: string, id: string, data: Record<string, unknown>) {
  const database = context.database ?? db;
  if (command === "save-flow") {
    requireGedConfiguration(context);
    const input = z.object({ key: z.string().max(100).default(""), name: z.string().min(1).max(150), graph: flowGraphSchema, published: z.boolean(), adoptOnAccess: z.boolean() }).parse(data);
    const key = input.key || randomUUID();
    return withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_FLOW_DEFINITION:${key}`}))`);
      const count = await tx.execute<{ version: number }>(sql`SELECT coalesce(max(version),0)::int+1 AS version FROM "GedFlowDefinition" WHERE key=${key}`);
      const definitionId = randomUUID();
      for (const user of new Set(input.graph.nodes.flatMap(n => n.users))) {
        const valid = await tx.execute(sql`SELECT 1 FROM "Usuario" WHERE id=${user} AND ativo`); if (!valid.rows.length) throw new Error("Responsável inativo ou inválido.");
      }
      await tx.execute(sql`INSERT INTO "GedFlowDefinition"(id,key,version,name,graph,published,"adoptOnAccess","createdById") VALUES(${definitionId},${key},${count.rows[0].version},${input.name},${JSON.stringify(input.graph)}::jsonb,${input.published},${input.adoptOnAccess},${context.user.id})`);
      return { id: definitionId };
    });
  }
  if (command === "start-flow") {
    await requireGedObject(context, "document", id, "edit");
    const document = await requireManagedDocument(context, id);
    return withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${id}`}))`);
      const blocked = await tx.execute(sql`SELECT 1 FROM "GedCheckout" WHERE "documentId"=${id} AND "closedAt" IS NULL UNION ALL SELECT 1 FROM "GedReview" WHERE "documentId"=${id} AND status='ACTIVE' UNION ALL SELECT 1 FROM "GedOperationLease" WHERE "documentId"=${id} AND "expiresAt">now()`);
      if (blocked.rows.length || document.versionStatus !== "FINAL") throw new Error("Encerre reservas/fluxos/assinaturas antes de iniciar.");
      const definitions = await tx.execute<Definition>(sql`SELECT * FROM "GedFlowDefinition" WHERE id=${z.string().parse(data.definitionId)} AND published`);
      const definition = definitions.rows[0]; if (!definition) throw new Error("Definição publicada não encontrada.");
      const node = definition.graph.nodes.find(n => n.id === definition.graph.start)!;
      const run: Run = { id: randomUUID(), documentId: id, versionId: document.versionId, definitionId: definition.id, nodeId: node.id, status: "ACTIVE" };
      await tx.execute(sql`INSERT INTO "GedFlowRun"(id,"documentId","versionId","definitionId","nodeId","dueAt","createdById") VALUES(${run.id},${id},${document.versionId},${definition.id},${node.id},${new Date(Date.now() + node.days * 86400000)},${context.user.id})`);
      await tx.execute(sql`UPDATE "GedEntry" SET "editorialStatus"=${node.phase} WHERE "documentId"=${id}`);
      await notifyNode(tx, context, run, node); await gedActivity(tx, context, id, "FLOW_START", run);
      return { id: run.id };
    });
  }
  if (command === "decide-flow") {
    const input = z.object({ decision: z.enum(["APPROVE", "RETURN"]), comment: z.string().trim().min(3).max(5000) }).parse(data);
    const snapshot = await database.execute<Run>(sql`SELECT * FROM "GedFlowRun" WHERE id=${id}`); if (!snapshot.rows[0]) throw new Error("Fluxo não encontrado.");
    await requireGedObject(context, "document", snapshot.rows[0].documentId, "review");
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${snapshot.rows[0].documentId}`}))`);
      const runs = await tx.execute<Run>(sql`SELECT * FROM "GedFlowRun" WHERE id=${id} FOR UPDATE`); const run = runs.rows[0];
      const defs = await tx.execute<Definition>(sql`SELECT * FROM "GedFlowDefinition" WHERE id=${run.definitionId}`); const graph = defs.rows[0].graph;
      const node = graph.nodes.find(n => n.id === run.nodeId)!;
      const document = await requireManagedDocument(context, run.documentId, tx);
      if (run.status !== "ACTIVE" || !node.users.includes(context.user.id) || document.versionId !== run.versionId) throw new Error("Tarefa encerrada, versão alterada ou participação não autorizada.");
      await tx.execute(sql`INSERT INTO "GedFlowDecision"(id,"runId","nodeId","userId",decision,comment) VALUES(${randomUUID()},${id},${node.id},${context.user.id},${input.decision},${input.comment})`);
      if (input.decision === "RETURN") {
        await tx.execute(sql`UPDATE "GedFlowRun" SET status='RETURNED' WHERE id=${id}`);
        await tx.execute(sql`UPDATE "GedEntry" SET "editorialStatus"='DEVOLVIDO' WHERE "documentId"=${run.documentId}`);
      } else {
        const votes = await tx.execute<{ userId: string }>(sql`SELECT "userId" FROM "GedFlowDecision" WHERE "runId"=${id} AND "nodeId"=${node.id} AND decision='APPROVE'`);
        if (node.users.every(user => votes.rows.some(v => v.userId === user))) {
          const metadata = await tx.execute<{ values: Record<string, unknown> }>(sql`SELECT "values" FROM "GedMetadata" WHERE "documentId"=${run.documentId}`);
          const nextId = node.condition && String(metadata.rows[0]?.values[node.condition.field] ?? "") !== node.condition.equals ? node.condition.otherwise : node.next;
          const next = graph.nodes.find(n => n.id === nextId);
          await tx.execute(sql`UPDATE "GedFlowRun" SET status=${next ? "ACTIVE" : "COMPLETED"},"nodeId"=${next?.id ?? node.id},"dueAt"=${new Date(Date.now() + (next?.days ?? 1) * 86400000)} WHERE id=${id}`);
          await tx.execute(sql`UPDATE "GedEntry" SET "editorialStatus"=${next?.phase ?? "HOMOLOGADO"} WHERE "documentId"=${run.documentId}`);
          if (next) await notifyNode(tx, context, { ...run, nodeId: next.id }, next);
        }
      }
      await gedActivity(tx, context, run.documentId, "FLOW_DECISION", { runId: id, node: node.id, ...input });
    });
    return { id };
  }
  if (command === "save-rule") {
    requireGedConfiguration(context); const rule = ruleSchema.parse(data); const key = id || randomUUID();
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_RULE:${key}`}))`);
      await tx.execute(sql`INSERT INTO "GedRule"(id,name,event,conditions,actions,active,"createdById") VALUES(${key},${rule.name},${rule.event},${JSON.stringify(rule.conditions)}::jsonb,${JSON.stringify(rule.actions)}::jsonb,${rule.active},${context.user.id}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,event=excluded.event,conditions=excluded.conditions,actions=excluded.actions,active=excluded.active`);
      await tx.execute(sql`INSERT INTO "GedRuleVersion"(id,"ruleId",version,definition) SELECT ${randomUUID()},${key},coalesce(max(version),0)+1,${JSON.stringify(rule)}::jsonb FROM "GedRuleVersion" WHERE "ruleId"=${key}`);
    });
    return { id: key };
  }
  throw new Error("Operação de fluxo desconhecida.");
}

export async function adoptGedFlowUpdates(context: AppContext, documentId: string) {
  await requireManagedDocument(context, documentId);
  await withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${documentId}`}))`);
    const runs = await tx.execute<Run>(sql`SELECT * FROM "GedFlowRun" WHERE "documentId"=${documentId} AND status='ACTIVE' FOR UPDATE`); const run = runs.rows[0]; if (!run) return;
    const definitions = await tx.execute<Definition>(sql`SELECT f.* FROM "GedFlowDefinition" f WHERE f.key=(SELECT key FROM "GedFlowDefinition" WHERE id=${run.definitionId}) AND f.published ORDER BY f.version DESC`);
    const latest = definitions.rows[0], current = definitions.rows.find(d => d.id === run.definitionId);
    if (!latest?.adoptOnAccess || latest.id === run.definitionId || !current) return;
    const completed = await tx.execute<{ nodeId: string }>(sql`SELECT DISTINCT "nodeId" FROM "GedFlowDecision" WHERE "runId"=${run.id}`);
    const lockedNodes = new Set([run.nodeId, ...completed.rows.map(d => d.nodeId)]);
    const incompatible = [...lockedNodes].some(id => {
      const before = current.graph.nodes.find(n => n.id === id), after = latest.graph.nodes.find(n => n.id === id);
      return !before || !after || before.phase !== after.phase || [...before.users].sort().join(",") !== [...after.users].sort().join(",");
    });
    if (incompatible) {
      const recorded = await tx.execute(sql`SELECT 1 FROM "GedActivity" WHERE "documentId"=${documentId} AND kind='FLOW_ADOPT_BLOCKED' AND detail->>'proposedDefinition'=${latest.id}`);
      if (!recorded.rows.length) await gedActivity(tx, context, documentId, "FLOW_ADOPT_BLOCKED", { proposedDefinition: latest.id, retainedDefinition: current.id, reason: "Mudança de fase/participantes ou remoção de etapa ativa/concluída; manter a instância na definição original até seu encerramento." });
      return;
    }
    await tx.execute(sql`UPDATE "GedFlowRun" SET "definitionId"=${latest.id} WHERE id=${run.id}`);
    await gedActivity(tx, context, documentId, "FLOW_ADOPT", { from: current.id, to: latest.id, policy: "preserve-active-and-completed" });
  });
}

export async function readGedFlows(context: AppContext, documentId?: string) {
  const database = context.database ?? db;
  if (documentId) await adoptGedFlowUpdates(context, documentId);
  const definitions = await database.execute(sql`SELECT DISTINCT ON(key) id,key,version,name,graph,published,"adoptOnAccess" FROM "GedFlowDefinition" WHERE published ORDER BY key,version DESC`);
  const runs = await database.execute(sql`SELECT r.*,d.title,f.name,f.graph,f.version AS "flowVersion",(SELECT jsonb_agg(jsonb_build_object('userId',v."userId",'nodeId',v."nodeId",'decision',v.decision,'comment',v.comment)) FROM "GedFlowDecision" v WHERE v."runId"=r.id) decisions FROM "GedFlowRun" r JOIN "GedFlowDefinition" f ON f.id=r."definitionId" JOIN "Document" d ON d.id=r."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE ${gedEntryScope(context)} ${documentId ? sql`AND d.id=${documentId}` : sql``} ORDER BY r."createdAt" DESC LIMIT 100`);
  return { definitions: definitions.rows, runs: runs.rows };
}

export async function executeGedRules(context: AppContext, documentId: string, event: string, eventId: string) {
  const database = context.database ?? db; await requireGedObject(context, "document", documentId, "edit");
  const rules = await database.execute<z.infer<typeof ruleSchema> & { id: string }>(sql`SELECT * FROM "GedRule" WHERE active AND event=${event} ORDER BY id`);
  let failed = false;
  for (const rule of rules.rows) {
    const previous = await database.execute<{ definition: z.infer<typeof ruleSchema>; status: string }>(sql`SELECT definition,status FROM "GedRuleExecution" WHERE "ruleId"=${rule.id} AND "eventId"=${eventId}`);
    if (previous.rows[0]) Object.assign(rule, previous.rows[0].definition);
    const document = await requireManagedDocument(context, documentId);
    const meta = await database.execute<{ code: string; tags: string[] }>(sql`SELECT c.code,coalesce(m.tags,'[]') tags FROM "Document" d JOIN "DocumentClass" c ON c.id=d."documentClassId" LEFT JOIN "GedMetadata" m ON m."documentId"=d.id WHERE d.id=${documentId}`);
    if (!previous.rows.length && ((rule.conditions.classCode && rule.conditions.classCode !== meta.rows[0]?.code) || (rule.conditions.folderId && rule.conditions.folderId !== document.folderId) || (rule.conditions.tag && !meta.rows[0]?.tags.includes(rule.conditions.tag)))) continue;
    const claimed = await database.execute<{ definition: z.infer<typeof ruleSchema> }>(sql`INSERT INTO "GedRuleExecution"("ruleId","eventId",definition,status) VALUES(${rule.id},${eventId},${JSON.stringify(rule)}::jsonb,'RUNNING') ON CONFLICT("ruleId","eventId") DO UPDATE SET status='RUNNING',error=NULL,"leaseUntil"=now()+interval '5 minutes' WHERE "GedRuleExecution".status='FAILED' OR ("GedRuleExecution".status='RUNNING' AND "GedRuleExecution"."leaseUntil"<now()) RETURNING definition`); if (!claimed.rows.length) continue;
    Object.assign(rule, claimed.rows[0].definition);
    try {
      for (const [index, action] of rule.actions.entries()) {
        const key = `${rule.id}:${eventId}:${index}`;
        const completed = await database.execute(sql`SELECT 1 FROM "GedRuleActionResult" WHERE "ruleId"=${rule.id} AND "eventId"=${eventId} AND position=${index} AND status='SUCCEEDED'`);
        if (completed.rows.length) continue;
        await database.execute(sql`INSERT INTO "GedRuleActionResult"("ruleId","eventId",position,status) VALUES(${rule.id},${eventId},${index},'RUNNING') ON CONFLICT("ruleId","eventId",position) DO UPDATE SET status='RUNNING',error=NULL`);
        if (action.type === "tag") await database.execute(sql`UPDATE "GedMetadata" SET tags=(SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements(tags||jsonb_build_array(${action.value}::text))) WHERE "documentId"=${documentId}`);
        if (action.type === "move") { const { moveManagedDocument } = await import("./ged-service"); await moveManagedDocument(context, documentId, action.value); }
        if (action.type === "classify") {
          requireGedConfiguration(context);
          const definitions = await database.execute<{ id: string; fields: IndexField[] }>(sql`SELECT t.id,t.fields FROM "GedTypeDefinition" t JOIN "DocumentClass" c ON c.id=t."classId" WHERE c.code=${action.value} AND c."isActive" ORDER BY t.version DESC LIMIT 1`);
          const metadata = await database.execute<{ values: Record<string, unknown> }>(sql`SELECT "values" FROM "GedMetadata" WHERE "documentId"=${documentId}`);
          validateIndexValues(definitions.rows[0]?.fields ?? [], metadata.rows[0]?.values ?? {});
          await database.execute(sql`UPDATE "Document" SET "documentClassId"=(SELECT id FROM "DocumentClass" WHERE code=${action.value} AND "isActive") WHERE id=${documentId} AND EXISTS(SELECT 1 FROM "DocumentClass" WHERE code=${action.value} AND "isActive")`);
          await database.execute(sql`UPDATE "GedMetadata" SET "definitionId"=${definitions.rows[0]?.id ?? null} WHERE "documentId"=${documentId}`);
        }
        if (action.type === "task" || action.type === "revalidate" || action.type === "publication") await database.execute(sql`INSERT INTO "GedTask"(id,"documentId","userId",title,"dueAt","dedupeKey") VALUES(${randomUUID()},${documentId},${action.userId || context.user.id},${action.value},now()+interval '7 days',${key}) ON CONFLICT("dedupeKey") DO NOTHING`);
        if (action.type === "notify") await withDatabaseTransaction(databaseConnection, tx => insertInternalNotifications(tx, { actorUsuarioId: context.user.id, recipientUserIds: [action.userId || context.user.id], sourceModule: "ASSINATURA_DIGITAL", entityType: "GED_DOCUMENT", entityId: documentId, type: "GED_RULE", title: action.value, message: "Automação documental executada.", dedupeDiscriminator: key }));
        if (action.type === "flow") {
          const existing = await database.execute(sql`SELECT 1 FROM "GedFlowRun" WHERE "documentId"=${documentId} AND "definitionId"=${action.value} AND status='ACTIVE'`);
          if (!existing.rows.length) await gedWorkflowCommand(context, "start-flow", documentId, { definitionId: action.value });
        }
        await database.execute(sql`UPDATE "GedRuleActionResult" SET status='SUCCEEDED' WHERE "ruleId"=${rule.id} AND "eventId"=${eventId} AND position=${index}`);
      }
      await database.execute(sql`UPDATE "GedRuleExecution" SET status='SUCCEEDED' WHERE "ruleId"=${rule.id} AND "eventId"=${eventId}`);
      await gedActivity(database, context, documentId, "RULE", { ruleId: rule.id, eventId });
    } catch {
      failed = true;
      await database.execute(sql`UPDATE "GedRuleActionResult" SET status='FAILED',error='Ação não concluída.' WHERE "ruleId"=${rule.id} AND "eventId"=${eventId} AND status='RUNNING'`);
      await database.execute(sql`UPDATE "GedRuleExecution" SET status='FAILED',error='Uma ação não pôde ser concluída. Consulte as permissões e o estado do documento.' WHERE "ruleId"=${rule.id} AND "eventId"=${eventId}`);
    }
  }
  if (failed) throw new Error("Uma ou mais regras aguardam retomada; consulte o histórico de ações.");
}
