import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { requireGedConfiguration } from "./ged-governance";
import { requireGedObject } from "./ged-access";
import { objectOperations } from "./ged-admin-policy";
import { readAdditionalProfiles } from "@/db/repositories/platform/additional-profiles";

export async function explainGedObjectAccess(context: AppContext, input: { kind: string; id: string; userId: string; operation: string }) {
  requireGedConfiguration(context);
  const kind = z.enum(["document", "folder"]).parse(input.kind), operation = z.enum(objectOperations).parse(input.operation);
  await requireGedObject(context, kind, input.id, "share");
  const database = context.database ?? db;
  const rows = await database.execute<{ id: string; name: string; departmentId: string | null; code: string }>(sql`SELECT u.id,u.nome AS name,e."departmentId",p.codigo AS code FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" LEFT JOIN "Employee" e ON e.id=u."employeeId" WHERE u.id=${input.userId} AND u.ativo AND p.ativo`);
  const user = rows.rows[0]; if (!user) throw new Error("Usuário ativo não encontrado.");
  const profiles = JSON.stringify([user.code, ...(await readAdditionalProfiles(database, user.id)).map(p => p.codigo)]);
  const result = await database.execute(sql`WITH RECURSIVE base AS (
    SELECT d."folderId" folder,e."ownerId" owner,e."departmentId" department,coalesce(m."inheritAccess",true) inherit FROM "Document" d JOIN "GedEntry" e ON e."documentId"=d.id LEFT JOIN "GedMetadata" m ON m."documentId"=d.id WHERE ${kind}='document' AND d.id=${input.id}
    UNION ALL SELECT f.id,a."ownerId",a."departmentId",a."inheritAccess" FROM "Folder" f JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE ${kind}='folder' AND f.id=${input.id}
    ), ancestors AS (
    SELECT f.id,f."parentId",a."inheritAccess" inherit FROM base b JOIN "Folder" f ON f.id=b.folder JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE b.inherit
    UNION ALL SELECT f.id,f."parentId",a."inheritAccess" FROM ancestors p JOIN "Folder" f ON f.id=p."parentId" JOIN "GedFolderAccess" a ON a."folderId"=f.id WHERE p.inherit
    ), matched AS (
    SELECT a.kind,a."objectId",a.principal,a."principalId",a.effect FROM "GedAcl" a WHERE a.operation=${operation}
    AND ((a.kind=${kind} AND a."objectId"=${input.id}) OR (a.kind='folder' AND a."objectId" IN (SELECT id FROM ancestors)))
    AND ((a.principal='user' AND a."principalId"=${user.id}) OR (a.principal='profile' AND ${profiles}::jsonb ? a."principalId") OR (a.principal='group' AND EXISTS(SELECT 1 FROM "GedGroupMember" gm JOIN "GedGroup" g ON g.id=gm."groupId" AND g.active WHERE gm."groupId"=a."principalId" AND gm."userId"=${user.id})))
    ) SELECT ged_access(${kind},${input.id},${user.id},${user.departmentId},${profiles}::jsonb,${operation}) AS "objectAllowed",
      coalesce((SELECT jsonb_agg(to_jsonb(matched)) FROM matched),'[]'::jsonb) AS rules,
      EXISTS(SELECT 1 FROM base WHERE owner=${user.id}) AS owner,
      EXISTS(SELECT 1 FROM base WHERE inherit AND department IS NOT NULL AND department=${user.departmentId}) AS "departmentFallback",
      coalesce((SELECT inherit FROM base LIMIT 1),false) AS inherit,
      (${kind}='document' AND ${operation} IN ('read','review') AND (
        EXISTS(SELECT 1 FROM "GedReview" r WHERE r."documentId"=${input.id} AND r.status='ACTIVE' AND r.assignments @> jsonb_build_object((ARRAY['ELABORACAO','CONSENSO','APROVACAO','HOMOLOGACAO'])[r.stage+1],jsonb_build_array(${user.id}::text))) OR
        EXISTS(SELECT 1 FROM "GedFlowRun" r JOIN "GedFlowDefinition" f ON f.id=r."definitionId",jsonb_array_elements(f.graph->'nodes') n WHERE r."documentId"=${input.id} AND r.status='ACTIVE' AND n->>'id'=r."nodeId" AND (n->'users') ? ${user.id})
      )) AS participant`);
  return { user: user.name, ...result.rows[0], note: "Decisão de objeto: negação explícita prevalece. Capacidades globais e ativação do módulo também são exigidas; administradores do sistema possuem bypass." };
}
