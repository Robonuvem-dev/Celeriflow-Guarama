import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { documentClasses } from "@/db/schema/document-workflow";
import { gedMetadata, gedTypeDefinitions } from "@/db/schema/ged-poc";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { canUseGed, gedEntryScope, gedObjectScope, requireGedObject } from "./ged-access";
import { typeDefinitionSchema, validateIndexValues, objectOperations } from "./ged-admin-policy";

export async function gedActivity(database: DatabaseExecutor, context: AppContext, documentId: string, kind: string, detail: unknown = {}) {
  await database.execute(sql`INSERT INTO "GedActivity"(id,"documentId","actorId",kind,detail) VALUES(${randomUUID()},${documentId},${context.user.id},${kind},${JSON.stringify(detail)}::jsonb)`);
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: `GED_${kind}`, targetId: documentId });
  if (kind === "METADATA") await database.execute(sql`INSERT INTO "GedEventQueue"(id,"documentId",event) VALUES(${randomUUID()},${documentId},'METADATA')`);
  if (kind === "FLOW_DECISION") await database.execute(sql`INSERT INTO "GedEventQueue"(id,"documentId",event) SELECT ${randomUUID()},${documentId},'HOMOLOGATED' FROM "GedEntry" WHERE "documentId"=${documentId} AND "editorialStatus"='HOMOLOGADO'`);
}
export function requireGedConfiguration(context: AppContext) {
  if (!canUseGed(context.user, "configure")) throw new Error("Sem permissão para configurar o GED.");
}
export async function gedGovernanceCommand(context: AppContext, command: string, id: string, data: Record<string, unknown>) {
  const database = context.database ?? db;
  if (command === "save-type") {
    requireGedConfiguration(context);
    const input = typeDefinitionSchema.parse(data);
    return withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_TYPE:${input.code}`}))`);
      const [documentClass] = await tx.insert(documentClasses).values({ code: input.code, label: input.label, isActive: input.active, signaturePolicy: input.signaturePolicy }).onConflictDoUpdate({ target: documentClasses.code, set: { label: input.label, isActive: input.active, signaturePolicy: input.signaturePolicy } }).returning();
      const previous = await tx.execute<{ version: number }>(sql`SELECT coalesce(max(version),0)::int AS version FROM "GedTypeDefinition" WHERE "classId"=${documentClass.id}`);
      const [definition] = await tx.insert(gedTypeDefinitions).values({ id: randomUUID(), classId: documentClass.id, version: previous.rows[0].version + 1, fields: input.fields, policy: input.policy, createdById: context.user.id }).returning();
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "GED_TYPE", targetId: definition.id });
      return { id: definition.id };
    });
  }
  if (command === "save-group") {
    requireGedConfiguration(context);
    const input = z.object({ name: z.string().trim().min(1).max(150), members: z.array(z.string().min(1)).max(500), active: z.boolean().default(true) }).parse(data);
    const key = id || randomUUID();
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`INSERT INTO "GedGroup"(id,name,active) VALUES(${key},${input.name},${input.active}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active`);
      await tx.execute(sql`DELETE FROM "GedGroupMember" WHERE "groupId"=${key}`);
      for (const userId of new Set(input.members)) await tx.execute(sql`INSERT INTO "GedGroupMember"("groupId","userId") SELECT ${key},id FROM "Usuario" WHERE id=${userId} AND ativo`);
      await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "ADMINISTRATIVE_MUTATION", targetType: "GED_GROUP", targetId: key });
    });
    return { id: key };
  }
  if (command === "save-acl") {
    const input = z.object({ kind: z.enum(["document", "folder"]), inherit: z.boolean(), entries: z.array(z.object({ principal: z.enum(["user", "group", "profile"]), principalId: z.string().min(1).max(100), operation: z.enum(objectOperations), effect: z.enum(["allow", "deny"]) })).max(300) }).parse(data);
    await requireGedObject(context, input.kind, id, "share");
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`GED_ACL:${input.kind}:${id}`}))`);
      for (const entry of input.entries) {
        const valid = await tx.execute(entry.principal === "user" ? sql`SELECT 1 FROM "Usuario" WHERE id=${entry.principalId} AND ativo` : entry.principal === "group" ? sql`SELECT 1 FROM "GedGroup" WHERE id=${entry.principalId} AND active` : sql`SELECT 1 FROM "ConfiguracaoPerfil" WHERE codigo=${entry.principalId} AND ativo`);
        if (!valid.rows.length) throw new Error("Uma permissão referencia usuário, grupo ou perfil inativo/inexistente.");
      }
      await tx.execute(sql`DELETE FROM "GedAcl" WHERE kind=${input.kind} AND "objectId"=${id}`);
      for (const entry of input.entries) await tx.execute(sql`INSERT INTO "GedAcl"(id,kind,"objectId",principal,"principalId",operation,effect) VALUES(${randomUUID()},${input.kind},${id},${entry.principal},${entry.principalId},${entry.operation},${entry.effect}) ON CONFLICT(kind,"objectId",principal,"principalId",operation) DO UPDATE SET effect=excluded.effect`);
      if (input.kind === "document") {
        await tx.execute(sql`INSERT INTO "GedMetadata"("documentId","inheritAccess") VALUES(${id},${input.inherit}) ON CONFLICT("documentId") DO UPDATE SET "inheritAccess"=excluded."inheritAccess"`);
        await gedActivity(tx, context, id, "ACCESS", input);
      } else await tx.execute(sql`UPDATE "GedFolderAccess" SET "inheritAccess"=${input.inherit} WHERE "folderId"=${id}`);
    });
    return { id };
  }
  if (command === "metadata") {
    await requireGedObject(context, "document", id, "edit");
    const document = await requireManagedDocument(context, id);
    const input = z.object({ values: z.record(z.string(), z.unknown()), tags: z.array(z.string().trim().min(1).max(100)).max(100), validUntil: z.string().nullable().default(null), responsibleId: z.string().nullable().default(null), alertDays: z.number().int().min(0).max(3650).default(30), title: z.string().trim().min(1).max(250) }).parse(data);
    if (input.validUntil && !input.responsibleId) throw new Error("Indique o responsável pelo prazo de validade.");
    const definitions = await database.execute<{ id: string; fields: z.infer<typeof typeDefinitionSchema>["fields"] }>(sql`SELECT t.id,t.fields FROM "GedTypeDefinition" t JOIN "Document" d ON d."documentClassId"=t."classId" WHERE d.id=${id} ORDER BY t.version DESC LIMIT 1`);
    const [existing] = await database.select().from(gedMetadata).where(eq(gedMetadata.documentId, id));
    const [historical] = existing?.definitionId ? await database.select().from(gedTypeDefinitions).where(eq(gedTypeDefinitions.id, existing.definitionId)) : [];
    const definition = historical ?? definitions.rows[0];
    const values = validateIndexValues(definition?.fields ?? [], input.values);
    const validUntil = input.validUntil ? z.coerce.date().parse(input.validUntil) : null;
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.insert(gedMetadata).values({ documentId: document.id, definitionId: definition?.id ?? null, values, tags: [...new Set(input.tags)], validUntil, responsibleId: input.responsibleId, alertDays: input.alertDays }).onConflictDoUpdate({ target: gedMetadata.documentId, set: { values, tags: [...new Set(input.tags)], validUntil, responsibleId: input.responsibleId, alertDays: input.alertDays } });
      await tx.execute(sql`UPDATE "Document" SET title=${input.title} WHERE id=${id}`);
      await gedActivity(tx, context, id, "METADATA", { before: existing?.values ?? {}, after: values, tags: input.tags, validUntil });
    });
    return { id };
  }
  if (command === "archive" || command === "restore") {
    await requireGedObject(context, "document", id, "delete");
    await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`DOCUMENT_SIGNATURE:${id}`}))`);
      const blocked = await tx.execute(sql`SELECT 1 FROM "GedCheckout" WHERE "documentId"=${id} AND "closedAt" IS NULL UNION ALL SELECT 1 FROM "GedReview" WHERE "documentId"=${id} AND status='ACTIVE' UNION ALL SELECT 1 FROM "GedFlowRun" WHERE "documentId"=${id} AND status='ACTIVE' UNION ALL SELECT 1 FROM "GedOperationLease" WHERE "documentId"=${id} AND "expiresAt">now() UNION ALL SELECT 1 FROM "DocumentSignature" WHERE "documentId"=${id} AND status='PENDING'`);
      if (blocked.rows.length && command === "archive") throw new Error("Conclua as reservas, tarefas e assinaturas antes de excluir.");
      const purged = await tx.execute(sql`SELECT 1 FROM "GedMetadata" WHERE "documentId"=${id} AND "purgedAt" IS NOT NULL`);
      if (purged.rows.length) throw new Error("Documento já descartado fisicamente.");
      const disposal = await tx.execute(sql`SELECT 1 FROM "GedDisposal" WHERE "documentId"=${id}`);
      if (disposal.rows.length) throw new Error("Documento encaminhado ao descarte físico não pode ser restaurado.");
      await tx.execute(sql`UPDATE "GedEntry" SET archived=${command === "archive"} WHERE "documentId"=${id}`);
      await tx.execute(sql`INSERT INTO "GedMetadata"("documentId","deletedAt") VALUES(${id},${command === "archive" ? new Date() : null}) ON CONFLICT("documentId") DO UPDATE SET "deletedAt"=excluded."deletedAt"`);
      await gedActivity(tx, context, id, command === "archive" ? "DELETE" : "RESTORE");
    });
    return { id };
  }
  if (command === "favorite" || command === "comment") {
    await requireManagedDocument(context, id);
    if (command === "favorite") {
      if (data.favorite === true) await database.execute(sql`INSERT INTO "GedFavorite"("documentId","userId") VALUES(${id},${context.user.id}) ON CONFLICT DO NOTHING`);
      else await database.execute(sql`DELETE FROM "GedFavorite" WHERE "documentId"=${id} AND "userId"=${context.user.id}`);
    } else {
      const text = z.string().trim().min(1).max(5000).parse(data.text);
      await database.execute(sql`INSERT INTO "GedComment"(id,"documentId","userId",text) VALUES(${randomUUID()},${id},${context.user.id},${text})`);
      await gedActivity(database, context, id, "COMMENT");
    }
    return { id };
  }
  if (command === "preference") {
    const settings = z.object({ color: z.string().regex(/^#[a-fA-F0-9]{6}$/), dashlets: z.array(z.enum(["tasks", "activities", "documents", "favorites", "approvals", "expiry"])).max(6) }).parse(data);
    await database.execute(sql`INSERT INTO "GedPreference"("userId",settings) VALUES(${context.user.id},${JSON.stringify(settings)}::jsonb) ON CONFLICT("userId") DO UPDATE SET settings=excluded.settings`);
    return settings;
  }
  if (command === "edit-smart") {
    const { gedQuerySchema } = await import("./ged-policy");
    const name = z.string().trim().min(1).max(150).parse(data.name); const query = gedQuerySchema.parse(data.query);
    if (data.shared === true) requireGedConfiguration(context);
    await database.execute(sql`UPDATE "GedSmartFolder" SET name=${name},query=${JSON.stringify(query)}::jsonb,shared=${data.shared === true} WHERE id=${id} AND "ownerId"=${context.user.id}`);
    return { id };
  }
  throw new Error("Operação de governança desconhecida.");
}

export async function readGedExtras(context: AppContext, id: string) {
  const database = context.database ?? db;
  await requireManagedDocument(context, id);
  const metadata = await database.execute(sql`SELECT m.*,t.fields,t.policy FROM "Document" d LEFT JOIN "GedMetadata" m ON m."documentId"=d.id LEFT JOIN LATERAL (SELECT * FROM "GedTypeDefinition" t WHERE t.id=m."definitionId" OR (m."definitionId" IS NULL AND t."classId"=d."documentClassId") ORDER BY t.version DESC LIMIT 1) t ON true WHERE d.id=${id}`);
  const comments = await database.execute(sql`SELECT c.id,c.text,u.nome AS author,c."createdAt" FROM "GedComment" c JOIN "Usuario" u ON u.id=c."userId" WHERE c."documentId"=${id} ORDER BY c."createdAt" DESC LIMIT 100`);
  const activity = await database.execute(sql`SELECT a.id,a.kind,a.detail,u.nome AS actor,a."createdAt" FROM "GedActivity" a JOIN "Usuario" u ON u.id=a."actorId" WHERE a."documentId"=${id} ORDER BY a."createdAt" DESC LIMIT 100`);
  const path = await database.execute(sql`WITH RECURSIVE path AS (SELECT f.id,f.name,f."parentId",0 depth FROM "Folder" f JOIN "Document" d ON d."folderId"=f.id WHERE d.id=${id} UNION ALL SELECT f.id,f.name,f."parentId",p.depth+1 FROM "Folder" f JOIN path p ON f.id=p."parentId") SELECT id,name FROM path f WHERE ${gedObjectScope(context, "folder", sql`f.id`, "read")} ORDER BY depth DESC`);
  const artifacts = await database.execute(sql`SELECT id,kind,hash,"mimeType",report FROM "GedArtifact" WHERE "versionId"=(SELECT id FROM "DocumentVersion" WHERE "documentId"=${id} ORDER BY "versionNumber" DESC LIMIT 1)`);
  const favorite = await database.execute(sql`SELECT 1 FROM "GedFavorite" WHERE "documentId"=${id} AND "userId"=${context.user.id}`);
  const publications = await database.execute(sql`SELECT p.id,p.title,p.status,p."publicKey",l."versionId" FROM "GedPublicationLink" l JOIN "TransparencyPublication" p ON p.id=l."publicationId" WHERE l."documentId"=${id} ORDER BY p."createdAt" DESC`);
  const sourcesLinked = await database.execute(sql`SELECT module,"sourceId" FROM "GedIntegrationLink" WHERE "documentId"=${id}`);
  const generatedFrom = await database.execute(sql`SELECT t.id,t.name,t.version FROM "GedGeneratedDocument" g JOIN "GedTemplateVersion" t ON t.id=g."templateVersionId" WHERE g."documentId"=${id}`);
  const access: Record<string, boolean> = {};
  for (const operation of objectOperations) {
    const result = await database.execute<{ allowed: boolean }>(sql`SELECT ${gedObjectScope(context, "document", sql`${id}`, operation)} AS allowed`);
    access[operation] = canUseGed(context.user, operation) && result.rows[0]?.allowed === true;
  }
  const acl = access.share ? await database.execute(sql`SELECT principal,"principalId",operation,effect FROM "GedAcl" WHERE kind='document' AND "objectId"=${id}`) : { rows: [] };
  const profiles = [context.user.profileCode, ...(context.user.additionalProfiles ?? []).map(p => p.code)];
  const sources = await database.execute<{ source: string; operation: string; effect: string }>(sql`WITH RECURSIVE ancestry AS (
    SELECT f.id,f."parentId",a."inheritAccess" inherit FROM "Document" d JOIN "Folder" f ON f.id=d."folderId" JOIN "GedFolderAccess" a ON a."folderId"=f.id LEFT JOIN "GedMetadata" m ON m."documentId"=d.id WHERE d.id=${id} AND coalesce(m."inheritAccess",true)
    UNION ALL SELECT f.id,f."parentId",a."inheritAccess" FROM ancestry p JOIN "Folder" f ON f.id=p."parentId" JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE p.inherit
  ) SELECT a.kind||':'||a."objectId"||' / '||a.principal||':'||a."principalId" AS source,a.operation,a.effect FROM "GedAcl" a WHERE ((a.kind='document' AND a."objectId"=${id}) OR (a.kind='folder' AND a."objectId" IN (SELECT id FROM ancestry))) AND
  ((a.principal='user' AND a."principalId"=${context.user.id}) OR (a.principal='profile' AND ${JSON.stringify(profiles)}::jsonb ? a."principalId") OR (a.principal='group' AND EXISTS(SELECT 1 FROM "GedGroupMember" gm JOIN "GedGroup" g ON g.id=gm."groupId" WHERE gm."userId"=${context.user.id} AND gm."groupId"=a."principalId" AND g.active)))
  UNION ALL SELECT 'Proprietário','*','allow' FROM "GedEntry" WHERE "documentId"=${id} AND "ownerId"=${context.user.id}
  UNION ALL SELECT 'Setor do documento','*','allow' FROM "GedEntry" e LEFT JOIN "GedMetadata" m ON m."documentId"=e."documentId" WHERE e."documentId"=${id} AND e."departmentId"=${context.user.departmentId} AND coalesce(m."inheritAccess",true)`);
  const accessExplanation = [isSystemAdministrator(context.user) ? "Administrador do sistema." : "Capacidades globais combinadas com o acesso ao objeto; negação explícita prevalece.", ...sources.rows.map(source => `${source.source}: ${source.operation} → ${source.effect}`), "Responsáveis de etapa ativa também podem receber leitura/revisão durante a participação."].join("\n");
  return { metadata: metadata.rows[0], comments: comments.rows, activity: activity.rows, path: path.rows, artifacts: artifacts.rows, favorite: favorite.rows.length > 0, access, acl: acl.rows, accessExplanation, publications: access.share ? publications.rows : [], sources: sourcesLinked.rows, generatedFrom: generatedFrom.rows };
}

export async function readGedAdministration(context: AppContext) {
  requireGedConfiguration(context); const database = context.database ?? db;
  const [types, groups, people, profiles, settings, jobs] = await Promise.all([
    database.execute(sql`SELECT c.*,t.id AS "definitionId",coalesce(t.fields,'[]') fields,coalesce(t.policy,'{}') policy,t.version FROM "DocumentClass" c LEFT JOIN LATERAL (SELECT * FROM "GedTypeDefinition" WHERE "classId"=c.id ORDER BY version DESC LIMIT 1) t ON true ORDER BY c.label`),
    database.execute(sql`SELECT g.*,coalesce((SELECT jsonb_agg("userId") FROM "GedGroupMember" WHERE "groupId"=g.id),'[]') members FROM "GedGroup" g ORDER BY name`),
    database.execute(sql`SELECT id,nome AS name FROM "Usuario" WHERE ativo ORDER BY nome LIMIT 1000`),
    database.execute(sql`SELECT codigo AS id,nome AS name FROM "ConfiguracaoPerfil" WHERE ativo ORDER BY nome`),
    database.execute(sql`SELECT key,value FROM "GedSetting"`),
    database.execute(sql`SELECT j.id,j.status,j.attempts,j.error,j.steps,j."nextAttemptAt",j."updatedAt",d.title,e."byteLength",v."versionNumber" FROM "GedProcessingJob" j JOIN "DocumentVersion" v ON v.id=j."versionId" JOIN "Document" d ON d.id=v."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE ${gedEntryScope(context)} ORDER BY j."updatedAt" DESC LIMIT 100`),
  ]);
  const storage = await database.execute<{ documents: number; versions: number; originalBytes: string; artifacts: number; archived: number }>(sql`SELECT count(DISTINCT e."documentId")::int AS documents,count(vf."versionId")::int AS versions,coalesce(sum(vf."byteLength"),0)::text AS "originalBytes",(SELECT count(*)::int FROM "GedArtifact" a JOIN "DocumentVersion" av ON av.id=a."versionId" JOIN "GedEntry" e ON e."documentId"=av."documentId" WHERE ${gedEntryScope(context)}) AS artifacts,count(DISTINCT e."documentId") FILTER(WHERE e.archived)::int AS archived FROM "GedEntry" e LEFT JOIN "DocumentVersion" v ON v."documentId"=e."documentId" LEFT JOIN "GedVersionFile" vf ON vf."versionId"=v.id WHERE ${gedEntryScope(context)}`);
  const { readGedProviderConfig } = await import("./ged-provider-config"); const providers = await readGedProviderConfig();
  const internal = Boolean(process.env.GED_SANDBOX_SNAPSHOT_ID) || process.env.GED_PROCESSING_RUNTIME === "local";
  return { types: types.rows, groups: groups.rows, users: people.rows, profiles: profiles.rows, settings: settings.rows, jobs: jobs.rows, storage: storage.rows[0], providers: { ocr: internal || Boolean(providers.ocrEndpoint), conversion: internal || Boolean(providers.conversionEndpoint || providers.libreOfficePath), pdfa: internal || Boolean(providers.pdfaEndpoint || providers.veraPdfPath), semantic: internal || Boolean(providers.semanticEndpoint) } };
}
