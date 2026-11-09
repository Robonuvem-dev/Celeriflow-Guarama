import "./load-local-environment";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { databaseConnection as connection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { populationContext } from "./lib/population-context";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { savePatientRegistrationDetails } from "../src/lib/saude/patient-registration-service";
import { createSpontaneousCare, registerHealthTriage, callHealthAppointment } from "../src/lib/saude/appointment-service";
import { startHealthCare, saveMedicalRecordNarrative, addHealthExamRequest, concludeHealthCare } from "../src/lib/saude/care-service";
import { createAvailability } from "../src/lib/sst/agenda-service";
import { bookOwnMedicalAppointment } from "../src/lib/portal-servidor/medical-agenda";
import { listOwnDocumentModels, issueOwnFunctionalDocument } from "../src/lib/portal-servidor/generated-documents";
import { saveManagedPortalPolicy } from "../src/lib/portal-servidor/management";
import { registerFunctionalPeriod, registerVerifiedEntityMapping } from "../src/lib/sst/functional-service";

const db=connection.db, employeeId="paulo-silva-2026:employee", patientId="paulo-silva-2026:patient", unitId="aurora-system-v1:health-unit:000";
async function main(){
 const actor=await populationContext();
 const [account]=(await db.execute<{firebaseUid:string}>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='paulo-silva-2026:user'`)).rows; assert.ok(account);
 const identity=await findIdentityByFirebaseUid(db,account.firebaseUid);assert.ok(identity?.employee);
 const own:AppContext={database:db,user:{id:identity.id,firebaseUid:account.firebaseUid,email:identity.email,name:identity.nome,role:identity.perfil.nome,profileCode:identity.perfil.codigo,permissions:identity.perfil.permissoes,modulePermissions:identity.modulePermissions,allowedBudgetUnitIds:identity.allowedBudgetUnitIds,employeeId,departmentId:identity.employee.departmentId,secretariatId:identity.employee.secretariatId}};
 const [professional]=(await db.execute<{id:string;employeeId:string;personId:string}>(sql`SELECT p.id,p."employeeId",e."personId" FROM "HealthProfessional" p JOIN "Employee" e ON e.id=p."employeeId" WHERE p."isActive" AND p."unitId"=${unitId} AND e."personId" IS NOT NULL ORDER BY p.id LIMIT 1`)).rows;assert.ok(professional);
 let models=await listOwnDocumentModels(own);
 if(!process.argv.includes("--apply")){console.log(JSON.stringify({mode:"PREVIEW",employeeId,professionalId:professional.id,models:models.map(m=>({id:m.id,kinds:m.policy.kinds,signature:m.policy.requireSignature}))},null,2));return;}
 await withDatabaseTransaction(connection,tx=>inDatabaseTransactionScope(connection,tx,async()=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('PAULO_CARE_2026'))`);
  const prior=(await tx.execute(sql`SELECT id FROM "MedicalRecord" WHERE "patientId"=${patientId} LIMIT 1`)).rows;
  if(prior.length){console.log(JSON.stringify({stage:"care",reused:true}));return;}
  const context={...actor,database:tx,user:{...actor.user,employeeId:professional.employeeId}};
  const [person]=(await tx.execute<{cpf:string}>(sql`SELECT cpf FROM "Person" WHERE id='paulo-silva-2026:person'`)).rows;
  await savePatientRegistrationDetails(context,patientId,{stage:"COMPLETE",fullName:"Paulo Silva",cpf:person.cpf,birthDate:"1988-11-18",gender:"Masculino",raceColor:"Não informado",motherName:"Helena Silva",fatherUnknown:true,phonePrimary:"34991234567",email:"paulo@aurora.mg.gov.br",profession:"Analista Administrativo"});
  const appointment=await createSpontaneousCare(context,{patientId,unitId,professionalId:professional.id,specialtyId:null,serviceId:null,arrivalNotes:"Acompanhamento preventivo e orientações de saúde no trabalho.",priority:"Normal"});
  await callHealthAppointment(context,appointment.id);
  await registerHealthTriage(context,{appointmentId:appointment.id,chiefComplaint:"Acompanhamento preventivo.",bloodPressure:"120/80",temperature:36.5,weight:78,height:1.78,heartRate:72,respiratoryRate:18,oxygenSaturation:98,observedConditions:"Sem queixas agudas.",riskClassification:"Não urgente",priorityLabel:"Normal",notes:null});
  const record=await startHealthCare(context,appointment.id);
  await saveMedicalRecordNarrative(context,{medicalRecordId:record.id,anamnesis:"Procura acompanhamento preventivo e orientação sobre hábitos de vida.",assessment:"Sem queixas agudas no atendimento.",evolution:"Orientações de autocuidado discutidas com o paciente.",conduct:"Orientações de alimentação, hidratação e pausas durante o trabalho. Seguimento na atenção primária.",observations:"Registro fictício preparado para apresentação autorizada do sistema."});
  await addHealthExamRequest(context,{medicalRecordId:record.id,procedureId:null,examName:"Hemograma completo",priority:"Rotina",indication:"Avaliação complementar no acompanhamento preventivo.",notes:null});
  await concludeHealthCare(context,{medicalRecordId:record.id,outcome:"Alta",conduct:"Retorno à unidade de referência para acompanhamento."});
  console.log(JSON.stringify({stage:"care",appointmentId:appointment.id,medicalRecordId:record.id}));
 }),{timeoutMs:120000});
 const [priorAppointment]=(await db.execute<{id:string}>(sql`SELECT id FROM "SstAppointment" WHERE "employeeId"=${employeeId} LIMIT 1`)).rows;
 if(!priorAppointment){
  const startsAt=new Date();startsAt.setUTCDate(startsAt.getUTCDate()+7);startsAt.setUTCHours(12,0,0,0);
  const availabilityId=await createAvailability(actor,{budgetUnitId:"aurora-system-v1:budget-unit:000",professionalPersonId:professional.personId,unitName:"Saúde do Servidor — Administração",startsAt,endsAt:new Date(startsAt.getTime()+4*3600000),slotMinutes:30});
  const appointmentId=await bookOwnMedicalAppointment(own,{availabilityId,startsAt:startsAt.toISOString(),purpose:"CONSULTA"});
  console.log(JSON.stringify({stage:"occupational-agenda",appointmentId,startsAt}));
 }
 if(!models.some(m=>m.policy.kinds.includes("DECLARACAO_VINCULO")&&!m.policy.requireSignature)){
  const [issuer]=(await db.execute<{name:string;cnpj:string}>(sql`SELECT name,cnpj FROM "Institution" WHERE cnpj IS NOT NULL LIMIT 1`)).rows;assert.ok(issuer);
  const [documentClass]=(await db.execute<{code:string}>(sql`SELECT code FROM "DocumentClass" WHERE "isActive" AND "signaturePolicy"='INTERNAL_ALLOWED' ORDER BY code LIMIT 1`)).rows;assert.ok(documentClass);
  const [regime]=(await db.execute<{ruleSetId:string}>(sql`SELECT r."ruleSetId" FROM "HrEmploymentContract" c JOIN "HrEmploymentRegime" r ON r.id=c."regimeId" WHERE c."employeeId"=${employeeId} LIMIT 1`)).rows;
  await saveManagedPortalPolicy(actor,{ruleSetId:regime.ruleSetId,code:"PORTAL_DECLARACAO_VINCULO_ADMIN",name:"Declaração de vínculo funcional",budgetUnitId:"aurora-system-v1:budget-unit:000",kind:"MODELO_DOCUMENTO_FUNCIONAL",isActive:true,value:{origin:"MODELO_DOCUMENTO_FUNCIONAL",budgetUnitId:"aurora-system-v1:budget-unit:000",kinds:["DECLARACAO_VINCULO"],issuerName:issuer.name,issuerCnpj:issuer.cnpj.replace(/\D/g,""),title:"Declaração de vínculo funcional",text:"Declaramos que {{nome}}, matrícula {{matricula}}, possui vínculo funcional no período consultado de {{inicio}} a {{fim}}.",footer:"Documento emitido a partir do cadastro funcional. Consulte a autenticidade pelo código informado.",legalReference:"Cadastro funcional e registros de pessoal mantidos pela Administração Municipal.",documentClassCode:documentClass.code,signerUserIds:[],requireSignature:false}});
  models=await listOwnDocumentModels(own);
 }
 const model=models.find(m=>m.policy.kinds.includes("DECLARACAO_VINCULO")&&!m.policy.requireSignature);
 if(model){
  const [contract]=(await db.execute<{id:string;regimeId:string;roleId:string;departmentId:string}>(sql`SELECT id,"regimeId","roleId","departmentId" FROM "HrEmploymentContract" WHERE "employeeId"=${employeeId} LIMIT 1`)).rows;
  const references={governmentEntityId:"p0-current-exe",localId:"aurora-mg-50k-v1:unit:000",costCenterId:"aurora-mg-50k-v1:cost-center:000"};
  const mappings=(await db.execute(sql`SELECT id FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"='aurora-system-v1:budget-unit:000' AND "governmentEntityId"=${references.governmentEntityId}`)).rows;
  if(!mappings.length)await registerVerifiedEntityMapping(actor,{budgetUnitId:"aurora-system-v1:budget-unit:000",governmentEntityId:references.governmentEntityId,sourceReference:"Base municipal fictícia Aurora: unidade Gestão de Administração, Paço Municipal e entidade Executivo, conferidos na preparação autorizada de Paulo Silva."});
  await registerFunctionalPeriod(actor,{submissionKey:"761ec7dc-d6ef-46a1-bbde-106fe9ca33ef",employeeId,budgetUnitId:"aurora-system-v1:budget-unit:000",...references,employmentRegimeId:contract.regimeId,roleId:contract.roleId,departmentId:contract.departmentId,startsAt:"2024-01-02T00:00:00Z",endsAt:"2027-01-01T00:00:00Z",contractReference:contract.id,sourceReference:"Histórico funcional fictício autorizado de Paulo Silva — Portaria 042/2024 e vínculo 004218."});
  const id=await issueOwnFunctionalDocument(own,{kind:"DECLARACAO_VINCULO",policyId:model.id,requestKey:"a3fd1f50-1be8-4389-b225-f4cb2bf3ecac",contractId:contract.id,from:"2024-01-02",until:"2026-11-08"});
  console.log(JSON.stringify({stage:"functional-document",id}));
 }else console.log(JSON.stringify({stage:"functional-document",availableModels:models.map(m=>({id:m.id,kinds:m.policy.kinds}))}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>connection.pool.end());
