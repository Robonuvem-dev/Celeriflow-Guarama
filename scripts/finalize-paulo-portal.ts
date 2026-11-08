import "./load-local-environment";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { head } from "@vercel/blob";
import { databaseConnection as connection } from "../src/db/client";
import { populationContext } from "./lib/population-context";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { confirmGedUpload, readGedDetail } from "../src/lib/documents/ged-service";
import { readOwnGeneratedDocument } from "../src/lib/portal-servidor/generated-documents";
import { publishFunctionalDocument, listOwnPublishedDocuments } from "../src/lib/portal-servidor/document-publication";

async function main() {
 const db=connection.db, actor=await populationContext();
 const [account]=(await db.execute<{firebaseUid:string}>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='paulo-silva-2026:user' AND ativo`)).rows;
 assert.ok(account);
 const identity=await findIdentityByFirebaseUid(db,account.firebaseUid);assert.ok(identity?.employee);
 const own:AppContext={database:db,user:{id:identity.id,firebaseUid:account.firebaseUid,email:identity.email,name:identity.nome,role:identity.perfil.nome,profileCode:identity.perfil.codigo,permissions:identity.perfil.permissoes,modulePermissions:identity.modulePermissions,allowedBudgetUnitIds:identity.allowedBudgetUnitIds,employeeId:identity.employee.id,departmentId:identity.employee.departmentId,secretariatId:identity.employee.secretariatId}};
 // Resume the exact uploaded bytes from the previous attempt, rather than creating duplicates.
 const [upload]=(await db.execute<{id:string;pathname:string}>(sql`SELECT id,pathname FROM "GedUpload" WHERE "ownerId"=${own.user.id} AND id='eaeba5d6-04eb-4681-9cd2-8d6f982c6044'`)).rows;assert.ok(upload);
 const stored=await head(upload.pathname);assert.equal(stored.pathname,upload.pathname);
 const generated=await readOwnGeneratedDocument(own,"cmw8feu2i0004sshyotfduwoy");
 if(!process.argv.includes("--apply")){console.log(JSON.stringify({mode:"PREVIEW",uploadId:upload.id,documentVersionId:generated.artifact.versionId}));return;}
 const [other]=(await db.execute<{id:string}>(sql`SELECT id FROM "GedUpload" WHERE "ownerId"=${own.user.id} AND id<>${upload.id} AND "documentId" IS NULL ORDER BY "createdAt" DESC LIMIT 1`)).rows;
 if(other)await assert.rejects(()=>confirmGedUpload(own,other.id,stored.url,""),/Arquivo não pertence ao upload registrado/);
 const ged=await confirmGedUpload(own,upload.id,stored.url,"");
 await readGedDetail(own,ged.documentId);
 const existing=(await listOwnPublishedDocuments(own)).find(row=>row.payload.documentVersionId===generated.artifact.versionId);
 const publicationId=existing?.id??await publishFunctionalDocument(actor,{employeeId:own.user.employeeId,budgetUnitId:"aurora-system-v1:budget-unit:000",contractId:generated.artifact.input.contractId,kind:"DECLARACAO_VINCULO",year:2026,documentVersionId:generated.artifact.versionId,sourceReference:"Declaração de vínculo funcional emitida a partir da história funcional de Paulo Silva, matrícula 004218.",releaseAt:new Date().toISOString()});
 assert.ok((await listOwnPublishedDocuments(own)).some(row=>row.id===publicationId));
 console.log(JSON.stringify({result:"PASS",gedDocumentId:ged.documentId,publicationId},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>connection.pool.end());
