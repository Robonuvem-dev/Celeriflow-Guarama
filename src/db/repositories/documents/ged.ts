import { and, asc, eq, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { db } from "@/db/client";
import { documentClasses } from "@/db/schema/document-workflow";
import { users } from "@/db/schema/identity";
import { gedThesaurus } from "@/db/schema/ged-management";
import { gedEntryScope } from "@/lib/documents/ged-access";
import { gedTokens, normalizeGedText, type GedQuery } from "@/lib/documents/ged-policy";
import type { AppContext } from "@/lib/platform/tenant-context";
import type { GedDocumentItem, GedListResponse, GedListRow, GedSection } from "@/lib/contracts/ged";

const collectionFrom = sql`FROM "GedEntry" e JOIN "Document" d ON d.id=e."documentId"
  JOIN LATERAL (SELECT * FROM "DocumentVersion" v0 WHERE v0."documentId"=d.id ORDER BY v0."versionNumber" DESC LIMIT 1) v ON TRUE
  LEFT JOIN "Folder" f ON f.id=d."folderId"
  LEFT JOIN "GedCheckout" c ON c."documentId"=d.id AND c."closedAt" IS NULL`;

async function gedPageCondition(database: DatabaseExecutor, query: GedQuery): Promise<SQL> {
  if (!query.text) return sql`TRUE`;
  const value = normalizeGedText(query.text);
  let expression: SQL;
  if (query.mode === "fragment") expression = sql`strpos(p.normalized, ${value})>0`;
  else if (query.mode === "phrase") expression = sql`p.search @@ phraseto_tsquery('simple', ${value})`;
  else if (query.mode === "proximity") {
    const tokens = gedTokens(query.text);
    if (tokens.length !== 2) throw new Error("Na proximidade, informe exatamente duas palavras.");
    const terms: string[] = [];
    for (let distance = 1; distance <= query.distance + 1; distance++) {
      terms.push(`('${tokens[0]}' <${distance}> '${tokens[1]}')`, `('${tokens[1]}' <${distance}> '${tokens[0]}')`);
    }
    expression = sql`p.search @@ to_tsquery('simple', ${terms.join(" | ")})`;
  } else {
    const tokens = gedTokens(query.text);
    if (!tokens.length) return sql`FALSE`;
    const terms = query.thesaurus ? await database.select().from(gedThesaurus) : [];
    expression = sql.join(tokens.map(token => {
      const match = terms.find(t => t.term === token || t.equivalents.includes(token));
      const equivalents = match ? [match.term, ...match.equivalents] : [token];
      return sql`(${sql.join(equivalents.map(term => sql`p.search @@ phraseto_tsquery('simple', ${term})`), sql` OR `)})`;
    }), sql` AND `);
  }
  return expression;
}

export async function gedContentCondition(database: DatabaseExecutor, query: GedQuery): Promise<SQL> {
  if (!query.text) return sql`TRUE`;
  const expression = await gedPageCondition(database, query);
  return sql`EXISTS(SELECT 1 FROM "GedTextPage" p WHERE p."versionId"=v.id AND (${expression}))`;
}

export async function listManagedDocuments(context: AppContext, query: GedQuery, requestedPage = 1): Promise<GedListResponse> {
  const database = context.database ?? db;
  const content = await gedContentCondition(database, query);
  const pageContent = await gedPageCondition(database, query);
  const condition = sql`${gedEntryScope(context)} AND NOT e.archived AND ${content}
    ${query.folderId ? sql`AND d."folderId"=${query.folderId}` : sql``}
    ${query.status ? sql`AND (e."editorialStatus"=${query.status} OR d.status=${query.status})` : sql``}`;
  const count = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${collectionFrom} WHERE ${condition}`);
  const total = count.rows[0]?.total ?? 0;
  const page = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))));
  const result = await database.execute<GedDocumentItem>(sql`SELECT d.id,d.title,d."documentType",d.status,e."editorialStatus",
    e.filename,e."mimeType",e."byteLength",e.origin,e."legacyReference",d."folderId",f.name AS "folderName",
    v.id AS "versionId",v."versionNumber",v."hashSha256",v.status AS "versionStatus",c."ownerId" AS "checkoutOwnerId",d."createdAt"::text AS "createdAt",
    (SELECT p.page FROM "GedTextPage" p WHERE p."versionId"=v.id AND (${pageContent}) ORDER BY p.page LIMIT 1) AS page,
    (SELECT substring(p.text FROM greatest(1,strpos(p.normalized,${normalizeGedText(query.text)})-70) FOR 240)
      FROM "GedTextPage" p WHERE p."versionId"=v.id AND (${pageContent}) ORDER BY (strpos(p.normalized,${normalizeGedText(query.text)})>0) DESC,p.page LIMIT 1) AS snippet
    ${collectionFrom} WHERE ${condition} ORDER BY d."createdAt" DESC,d.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { documents: result.rows, rows: [], total, page, query };
}

export async function requireManagedDocument(context: AppContext, id: string, database: DatabaseExecutor = context.database ?? db) {
  const result = await database.execute<GedDocumentItem & { fileUrl: string; ownerId: string | null }>(sql`SELECT d.id,d.title,d."documentType",d.status,e."editorialStatus",
    e.filename,e."mimeType",e."byteLength",e.origin,e."legacyReference",e."ownerId",d."folderId",f.name AS "folderName",
    v.id AS "versionId",v."versionNumber",v."hashSha256",v.status AS "versionStatus",v."fileUrl",c."ownerId" AS "checkoutOwnerId",d."createdAt"::text AS "createdAt",
    NULL::int AS page,NULL::text AS snippet ${collectionFrom} WHERE d.id=${id} AND ${gedEntryScope(context)} AND NOT e.archived LIMIT 1`);
  const row = result.rows[0];
  if (!row) throw new Error("Documento não encontrado ou fora do seu escopo.");
  return row;
}

export async function listGedSection(context: AppContext, section: GedSection, query: GedQuery, requestedPage: number): Promise<GedListResponse> {
  if (section === "acervo" || section === "pesquisa") return listManagedDocuments(context, query, requestedPage);
  const userId = context.user.id;
  const scope = gedEntryScope(context);
  let source: SQL;
  switch (section) {
    case "pastas-inteligentes": source = sql`SELECT id,name AS title,'Consulta salva' AS kind,CASE WHEN shared THEN 'Compartilhada' ELSE 'Pessoal' END AS status,query::text AS detail,"createdAt"::text AS date FROM "GedSmartFolder" WHERE "ownerId"=${userId} OR shared`; break;
    case "importacoes": source = sql`SELECT u.id,u.filename AS title,u."batchId" AS kind,u.status,coalesce(u.error,u."legacyReference",'') AS detail,u."createdAt"::text AS date FROM "GedUpload" u WHERE u."ownerId"=${userId}`; break;
    case "processamento": source = sql`SELECT j.id,d.title,j."versionId" AS kind,j.status,coalesce(j.error,'Tentativas: '||j.attempts) AS detail,j."updatedAt"::text AS date FROM "GedProcessingJob" j JOIN "DocumentVersion" v ON v.id=j."versionId" JOIN "Document" d ON d.id=v."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE ${scope}`; break;
    case "tarefas":
    case "fluxos": source = sql`SELECT r.id,d.title,(ARRAY['Elaboração','Consenso','Aprovação','Homologação'])[r.stage+1] AS kind,r.status,'Versão vinculada: '||r."versionId" AS detail,r."dueAt"::text AS date FROM "GedReview" r JOIN "Document" d ON d.id=r."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE ${scope} ${section === "tarefas" ? sql`AND r.status='ACTIVE' AND r.assignments::jsonb @> jsonb_build_object((ARRAY['ELABORACAO','CONSENSO','APROVACAO','HOMOLOGACAO'])[r.stage+1],jsonb_build_array(${userId}::text))` : sql``}`; break;
    case "modelos": source = sql`SELECT id,name AS title,'Versão '||version AS kind,CASE WHEN "sourceUrl" IS NULL THEN 'Editor' ELSE 'Importado' END AS status,array_to_string(ARRAY(SELECT jsonb_array_elements_text(markers)),', ') AS detail,"createdAt"::text AS date FROM "GedTemplateVersion" WHERE "ownerId"=${userId} OR ("departmentId" IS NOT NULL AND "departmentId"=${context.user.departmentId})`; break;
    case "thesaurus": source = sql`SELECT id,term AS title,'Equivalentes' AS kind,'Ativo' AS status,array_to_string(ARRAY(SELECT jsonb_array_elements_text(equivalents)),', ') AS detail,'' AS date FROM "GedThesaurus"`; break;
    case "classes": source = sql`SELECT id,label AS title,code AS kind,CASE WHEN "isActive" THEN 'Ativa' ELSE 'Inativa' END AS status,"signaturePolicy" AS detail,"createdAt"::text AS date FROM "DocumentClass"`; break;
  }
  const database = context.database ?? db;
  const filter = query.text ? sql`WHERE strpos(lower(title),lower(${query.text}))>0` : sql``;
  const counted = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM (${source}) items ${filter}`);
  const total = counted.rows[0]?.total ?? 0;
  const page = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(total / 20))));
  const rows = await database.execute<GedListRow>(sql`SELECT * FROM (${source}) items ${filter} ORDER BY date DESC,id LIMIT 20 OFFSET ${(page - 1) * 20}`);
  return { rows: rows.rows, documents: [], total, page, query };
}

export async function gedSelectors(context: AppContext) {
  const database = context.database ?? db;
  const [classes, people] = await Promise.all([
    database.select({ code: documentClasses.code, label: documentClasses.label }).from(documentClasses).where(eq(documentClasses.isActive, true)).orderBy(asc(documentClasses.label)),
    database.select({ id: users.id, name: users.nome }).from(users).where(and(eq(users.ativo, true), context.user.profileCode === "SYSTEM_ADMINISTRATOR" ? sql`TRUE` : or(eq(users.id, context.user.id), context.user.departmentId ? sql`EXISTS(SELECT 1 FROM "Employee" emp WHERE emp.id=${users.employeeId} AND emp."departmentId"=${context.user.departmentId})` : sql`FALSE`))).orderBy(asc(users.nome)).limit(200),
  ]);
  return { classes, users: people };
}
