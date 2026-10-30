import { and,eq,inArray,isNull,sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { processes } from "@/db/schema/processes";
import { processJunctions } from "@/db/schema/process-junction";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
function reason(value:string){const normalized=value.trim();if(normalized.length<10||normalized.length>2000)throw new Error("Informe justificativa entre 10 e 2000 caracteres.");return normalized;}
async function lockProcesses(tx:DatabaseTransaction,parentId:string,childId:string,departmentId:string){
 if(parentId===childId)throw new Error("Um processo não pode ser juntado a si próprio.");
 // A global transaction lock serializes graph mutations, including concurrent
 // A→B / B→A joins whose reachable paths share no row at the start.
 await tx.execute(sql`SELECT pg_advisory_xact_lock(726481, 19)`);
 const rows=await tx.select({id:processes.id,departmentId:processes.currentDepartmentId,status:processes.status}).from(processes).where(inArray(processes.id,[parentId,childId])).orderBy(processes.id).for("update");
 if(rows.length!==2||rows.some(row=>row.departmentId!==departmentId))throw new Error("Ambos os processos devem pertencer ao seu setor atual.");
 return rows;
}
export async function joinProcesses(tx:DatabaseTransaction,input:{parentId:string;childId:string;departmentId:string;actorId:string;reason:string}){
 const note=reason(input.reason),rows=await lockProcesses(tx,input.parentId,input.childId,input.departmentId);
 if(rows.some(row=>["Arquivado","Cancelado","Concluido"].includes(row.status)))throw new Error("Junção exige processos em andamento.");
 const duplicate=await tx.select({id:processJunctions.id}).from(processJunctions).where(and(eq(processJunctions.childProcessId,input.childId),isNull(processJunctions.endedAt))).limit(1);
 if(duplicate.length)throw new Error("O processo já possui junção ativa. Desfaça a anterior antes de juntá-lo novamente.");
 const cycle=await tx.execute<{id:string}>(sql`WITH RECURSIVE descendants(id) AS (SELECT "childProcessId" FROM "ProcessJunction" WHERE "parentProcessId"=${input.childId} AND "endedAt" IS NULL UNION SELECT j."childProcessId" FROM "ProcessJunction" j JOIN descendants d ON j."parentProcessId"=d.id WHERE j."endedAt" IS NULL) SELECT id FROM descendants WHERE id=${input.parentId} LIMIT 1`);
 if(cycle.rows.length)throw new Error("Esta junção criaria um ciclo entre processos.");
 const [created]=await tx.insert(processJunctions).values({parentProcessId:input.parentId,childProcessId:input.childId,reason:note,createdByUsuarioId:input.actorId}).returning({id:processJunctions.id});
 await insertAuditEvent(tx,{actorUsuarioId:input.actorId,eventType:auditEventTypes.processUpdated,targetType:"PROCESS_JUNCTION",targetId:created.id});
 return created;
}
export async function undoProcessJunction(tx:DatabaseTransaction,input:{id:string;departmentId:string;actorId:string;reason:string}){
 const note=reason(input.reason);
 const [junction]=await tx.select().from(processJunctions).where(eq(processJunctions.id,input.id)).limit(1);
 if(!junction||junction.endedAt)throw new Error("Junção não encontrada ou já desfeita.");
 await lockProcesses(tx,junction.parentProcessId,junction.childProcessId,input.departmentId);
 const changed=await tx.update(processJunctions).set({endedAt:new Date(),endedByUsuarioId:input.actorId,endReason:note}).where(and(eq(processJunctions.id,junction.id),isNull(processJunctions.endedAt))).returning({id:processJunctions.id});
 if(!changed.length)throw new Error("Esta junção já foi desfeita.");
 await insertAuditEvent(tx,{actorUsuarioId:input.actorId,eventType:auditEventTypes.processUpdated,targetType:"PROCESS_JUNCTION_UNDONE",targetId:junction.id});
 return {parentId:junction.parentProcessId,childId:junction.childProcessId};
}
