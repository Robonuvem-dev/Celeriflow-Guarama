import {z} from "zod";
import {sql} from "drizzle-orm";
import type {DatabaseConnection} from "@/db/connection";
import type {DatabaseExecutor} from "@/db/transaction";
import {withDatabaseTransaction} from "@/db/transaction";
import {insertActionAudit} from "@/db/repositories/tax-actions/registry";
import {resolveTaxAssessmentScope} from "./scope";
import type {TaxActor} from "./index";
import type {JsonValue} from "@/db/json";
import {databaseTimestamp} from "@/db/temporal";

export const desifInfractionManagementSchema=z.object({caseId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),infractionType:z.string().trim().min(1).max(240),status:z.enum(["Emitido","Defesa apresentada","Em análise","Julgado"]),reason:z.string().trim().min(10).max(4000)});
type InfractionWire={id:string;infractionType:string;status:string;penalty:string;taxpayerId:string;defenseDeadline:string|null;updatedAt:string;institutionName:string;competence:string;taxId:string|null;calculationSnapshot:JsonValue|null};
export async function readManagedDesifInfraction(database:DatabaseExecutor,actor:TaxActor,caseId:string,lock=false){
 const {rows}=await database.execute<InfractionWire>(sql`SELECT i.id,i."infractionType",i.status,COALESCE(i."penaltyValueDecimal",i."penaltyValue"::numeric)::text AS penalty,i."taxpayerId",i."defenseDeadline",i."updatedAt",n.name AS "institutionName",c.competence,t."taxId",t."calculationSnapshot" FROM "DesifFiscalCase" c JOIN "Infraction" i ON i.id=c."infractionId" JOIN "DesifFinancialInstitution" n ON n.id=c."institutionId" LEFT JOIN "DesifAssessment" a ON a.id=c."assessmentId" LEFT JOIN "TaxAssessment" t ON t.id=a."taxAssessmentId" WHERE c.id=${caseId} ${lock?sql`FOR UPDATE OF i`:sql``}`);
 const row=rows[0];if(!row)throw new Error("Auto de infração bancário não encontrado.");
 if(!row.taxId)throw new Error("Auto sem lançamento tributário vinculado; concilie a origem antes de manter o documento.");
 const scope=await resolveTaxAssessmentScope(database,actor,row.taxId,row.calculationSnapshot);
 return {...row,updatedAt:databaseTimestamp(row.updatedAt),defenseDeadline:row.defenseDeadline?databaseTimestamp(row.defenseDeadline):null,scope};
}
export async function updateManagedDesifInfraction(connection:DatabaseConnection,actor:TaxActor,raw:unknown){
 const input=desifInfractionManagementSchema.parse(raw);
 return withDatabaseTransaction(connection,async tx=>{
  const row=await readManagedDesifInfraction(tx,actor,input.caseId,true);
  if(row.updatedAt.toISOString()!==input.expectedUpdatedAt)throw new Error("Auto alterado por outro usuário. Recarregue.");
  const transitions:Record<string,string[]>={Emitido:["Emitido","Defesa apresentada","Em análise"],"Defesa apresentada":["Defesa apresentada","Em análise"],"Em análise":["Em análise","Defesa apresentada","Julgado"]};
  if(!transitions[row.status]?.includes(input.status))throw new Error("Transição administrativa não permitida. Autos julgados exigem procedimento próprio.");
  await tx.execute(sql`UPDATE "Infraction" SET "infractionType"=${input.infractionType},status=${input.status},"updatedAt"=clock_timestamp() WHERE id=${row.id}`);
  await tx.execute(sql`INSERT INTO "DesifFiscalEvent" (id,"fiscalCaseId","eventType",description,payload,"actorUsuarioId","createdAt") VALUES (gen_random_uuid()::text,${input.caseId},'AUTO_MANTIDO',${input.reason},${JSON.stringify({before:{infractionType:row.infractionType,status:row.status},after:{infractionType:input.infractionType,status:input.status}})}::jsonb,${actor.usuarioId},now())`);
  await insertActionAudit(tx,{action:"DESIF_INFRACTION_UPDATED",entityType:"Infraction",entityId:row.id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId??null,payload:{caseId:input.caseId,budgetUnitId:row.scope.budgetUnitId,reason:input.reason,before:{infractionType:row.infractionType,status:row.status},after:{infractionType:input.infractionType,status:input.status}}});
  return row.id;
 });
}
