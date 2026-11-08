import "./load-local-environment";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { databaseConnection as connection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { people } from "../src/db/schema/people";
import { addresses } from "../src/db/schema/registry";
import { employees } from "../src/db/schema/administration";
import { accessProfiles, users, userModulePermissions, userBudgetUnits, modules } from "../src/db/schema/identity";
import { attendanceRecords, personnelActs } from "../src/db/schema/personnel-records";
import { payrolls, hrEmploymentContracts } from "../src/db/schema/personnel-workforce";
import { hrPayrollRules } from "../src/db/schema/personnel-configuration";
import { patients } from "../src/db/schema/health-registration";
import { healthUserAccessScopes } from "../src/db/schema/health-access";
import { employeePortalRequests } from "../src/db/schema/employee-portal";
import { adminAuth } from "../src/lib/firebase/server";
import { populationContext } from "./lib/population-context";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { saveEmploymentContract, calculatePayrollRun, closePayrollRun, publishPayrollStatements } from "../src/lib/rh/workforce-service";
import { postServiceTimeAllowance } from "../src/lib/rh/service-time-allowance";
import { acquireVacationRights } from "../src/lib/rh/vacation-rights";
import { saveCareerPolicy, enrollOwnCourse, completeFunctionalCourse, listOwnCareerActivities } from "../src/lib/portal-servidor/career-service";
import { saveFunctionalService, listFunctionalServices } from "../src/lib/portal-servidor/service-catalog";
import { submitFunctionalRequest, decideFunctionalRequest } from "../src/lib/portal-servidor/functional-requests";
import { ownReleasedStatementIds } from "../src/lib/portal-servidor/payroll-publication";
import { listFunctionalBirthdays } from "../src/lib/portal-servidor/birthday-service";

const key = "paulo-silva-2026";
const employeeId = `${key}:employee`, personId = `${key}:person`, userId = `${key}:user`;
const email = "paulo@aurora.mg.gov.br", name = "Paulo Silva";
const departmentId = "aurora-system-v1:department:000", secretariatId = "aurora-system-v1:secretariat:000";
const budgetUnitId = "aurora-system-v1:budget-unit:000", healthUnitId = "aurora-system-v1:health-unit:000";
const roleId = "aurora-system-v1:role:000";
const db = connection.db;
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
function fictionalCpf() {
  const digits = "947628315".split("").map(Number);
  for (const size of [9, 10]) { const n = digits.reduce((sum, digit, i) => sum + digit * (size + 1 - i), 0) % 11; digits.push(n < 2 ? 0 : 11 - n); }
  return digits.join("");
}

async function main() {
  const actor = await populationContext();
  const existing = await db.select().from(users).where(eq(users.email, email));
  assert.ok(!existing.length || existing[0].id === userId, "E-mail já pertence a outra conta; conciliar antes de prosseguir.");
  const [regime] = (await db.execute<{id:string; ruleSetId:string}>(sql`SELECT e.id,e."ruleSetId" FROM "HrEmploymentRegime" e JOIN "HrPayrollRuleSet" r ON r.id=e."ruleSetId" WHERE e.code='EFETIVO_POC' AND r.code='RH_POC_DOCUMENTAL_2026_V1' AND r.status='ATIVA'`)).rows;
  assert.ok(regime);
  if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode:"PREVIEW", email, employeeId, regimeId:regime.id, months:["08/2026","09/2026","10/2026"], scope:"DEMONSTRACAO", modules:["PORTAL_SERVIDOR","RH","ASSINATURA_DIGITAL","DOCUMENTOS","ATENDIMENTO","PROCESSOS","SAUDE"] })); return; }
  const password = process.env.PROVISION_ACCOUNT_PASSWORD;
  assert.ok(password, "Defina PROVISION_ACCOUNT_PASSWORD somente no ambiente de execução.");
  let firebase;
  try { firebase = await adminAuth.getUserByEmail(email); } catch (error) { if ((error as {code?:string}).code !== "auth/user-not-found") throw error; }
  assert.ok(!firebase || existing[0]?.firebaseUid === firebase.uid, "Identidade Firebase preexistente não vinculada ao pacote.");
  firebase = firebase ? await adminAuth.updateUser(firebase.uid, { displayName:name, password, emailVerified:true, disabled:false }) : await adminAuth.createUser({ email, password, displayName:name, emailVerified:true, disabled:false });
  const permission = (edit: boolean) => ({ showDashboardCard:true, blocked:false, create:edit, update:edit, delete:false, issueReports:true });
  const permissionMap = { PORTAL_SERVIDOR:permission(true), RH:permission(false), ASSINATURA_DIGITAL:permission(true), DOCUMENTOS:permission(true), ATENDIMENTO:permission(true), PROCESSOS:permission(true), SAUDE:permission(false) };
  const profileId = `${key}:profile`;
  await withDatabaseTransaction(connection, async tx => {
    await tx.insert(people).values({ id:personId, fullName:name, cpf:fictionalCpf(), rg:"MG-24681579", rgIssuer:"SSP/MG", birthDate:date("1988-11-18"), gender:"Masculino", nationality:"Brasileira", motherName:"Helena Silva", educationLevel:"Superior completo", profession:"Analista Administrativo", email, phonePrimary:"34991234567" }).onConflictDoNothing();
    await tx.insert(addresses).values({ id:`${key}:address`, personId, streetName:"Rua das Acácias", number:"245", zipCode:"38120000", addressType:"Residencial", zone:"Urbana" }).onConflictDoNothing();
    await tx.insert(employees).values({ id:employeeId, personId, name, cpf:fictionalCpf(), registration:"004218", email, roleId, departmentId, secretariatId, salaryBase:4800, contractedHours:200, isActive:true }).onConflictDoNothing();
    await tx.insert(accessProfiles).values({ id:profileId, codigo:"SERVIDOR_SERVICOS_INTEGRADOS", nome:"Servidor — Serviços Integrados", descricao:"Autosserviço funcional e módulos autorizados por unidade.", permissoes:JSON.stringify({ acesso:"operacional", modules:permissionMap }), ativo:true }).onConflictDoNothing();
    await tx.insert(users).values({ id:userId, nome:name, email, firebaseUid:firebase.uid, perfilId:profileId, employeeId, ativo:true }).onConflictDoNothing();
    const configured = await tx.select().from(modules);
    for (const [code, permissions] of Object.entries(permissionMap)) {
      const module = configured.find(item => item.codigo === code); assert.ok(module?.ativo, `Módulo inativo: ${code}`);
      await tx.insert(userModulePermissions).values({ id:`${key}:module:${code}`, usuarioId:userId, moduloId:module.id, canView:true, canEdit:permissions.create }).onConflictDoNothing();
    }
    await tx.insert(userBudgetUnits).values({ id:`${key}:budget`, usuarioId:userId, budgetUnitId }).onConflictDoNothing();
    await tx.insert(healthUserAccessScopes).values({ id:`${key}:health-scope`, usuarioId:userId, unitId:healthUnitId, weekdays:"0,1,2,3,4,5,6", startTime:"00:00", endTime:"23:59", isActive:true }).onConflictDoNothing();
    await tx.insert(patients).values({ id:`${key}:patient`, personId, usuarioId:userId, referenceUnitId:healthUnitId, status:"Ativo" }).onConflictDoNothing();
    await tx.insert(personnelActs).values({ id:`${key}:appointment`, employeeId, type:"Nomeação", actNumber:"Portaria 042/2024", date:date("2024-01-02") }).onConflictDoNothing();
  });
  console.log(JSON.stringify({ stage:"identity", email, enabled:true }));
  const identity = await findIdentityByFirebaseUid(db, firebase.uid); assert.ok(identity?.employee);
  const own: AppContext = { database:db, user:{ id:identity.id, firebaseUid:firebase.uid, email, name, role:identity.perfil.nome, profileCode:identity.perfil.codigo, permissions:identity.perfil.permissoes, modulePermissions:identity.modulePermissions, allowedBudgetUnitIds:identity.allowedBudgetUnitIds, employeeId, departmentId, secretariatId } };
  const [priorContract] = await db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.employeeId, employeeId));
  const contract = priorContract ?? await saveEmploymentContract(connection, actor.user.id, { employeeId, registration:"004218", regimeId:regime.id, roleId, departmentId, workLocation:"Coordenação de Administração", monthlyHours:200, salary:"4800.00", admittedAt:"2024-01-02", appointedAt:"2024-01-02", swornAt:"2024-01-02", endsAt:"", details:{ seedPackage:key, fictional:true }, reason:"Preparação autorizada do histórico funcional de Paulo Silva para apresentação do Portal do Servidor." });
  const [ats] = (await db.execute<{id:string}>(sql`SELECT id FROM "HrPayrollRule" WHERE "ruleSetId"=${regime.ruleSetId} AND code='ATS' AND "isActive"`)).rows;
  assert.ok(ats);
  for (const month of [8,9,10]) {
    const mm = String(month).padStart(2,"0"), payrollId = `${key}:payroll:${mm}`;
    await db.insert(payrolls).values({ id:payrollId, competence:`${mm}/2026`, type:"Mensal", status:"Aberta" }).onConflictDoNothing();
    const marks: typeof attendanceRecords.$inferInsert[] = [];
    for (let day=1;day<=31;day++) {
      const d = new Date(Date.UTC(2026,month-1,day)); if (d.getUTCMonth() !== month-1 || [0,6].includes(d.getUTCDay())) continue;
      const civil = d.toISOString().slice(0,10); if (["2026-09-07","2026-10-12"].includes(civil)) continue;
      marks.push({ id:`${key}:attendance:${civil}`, employeeId, date:d, entryTime:new Date(`${civil}T11:00:00Z`), exitTime:new Date(`${civil}T20:00:00Z`), contractedHours:8, hoursWorked:8, status:"Presente" });
    }
    await db.insert(attendanceRecords).values(marks).onConflictDoNothing();
    const [payroll] = await db.select().from(payrolls).where(eq(payrolls.id,payrollId));
    if (payroll.status !== "Fechada") await postServiceTimeAllowance(connection, actor.user.id, { contractId:contract.id, payrollId, ruleId:ats.id });
    const run = await calculatePayrollRun(connection, actor.user.id, { payrollId, requestKey:payrollId, mode:"OFICIAL", scope:"DEMONSTRACAO", contractIds:[contract.id] });
    const closed = await closePayrollRun(connection, actor.user.id, run.id);
    const [release] = (await db.execute<{releaseAt:Date|null}>(sql`SELECT "releaseAt" FROM "HrPayrollStatement" WHERE "runId"=${run.id} LIMIT 1`)).rows;
    await publishPayrollStatements(connection, actor.user.id, run.id, release?.releaseAt ?? closed.approvedAt ?? new Date());
    console.log(JSON.stringify({ stage:"payroll", competence:`${mm}/2026`, statements:run.statements.length }));
  }
  await acquireVacationRights(connection, actor.user.id, contract.id, new Date().toISOString().slice(0,10));
  const fields = [
    {code:"contractId",label:"Vínculo funcional",type:"SELECT",required:true,options:[contract.id]},
    {code:"periodStart",label:"Início do período aquisitivo",type:"DATE",required:true},
    {code:"periodEnd",label:"Fim do período aquisitivo",type:"DATE",required:true},
    {code:"kind",label:"Modalidade",type:"SELECT",required:true,options:["GOZO"]},
    {code:"start",label:"Início das férias",type:"DATE",required:true},
    {code:"days",label:"Quantidade de dias",type:"NUMBER",required:true},
  ];
  const priorServices = await listFunctionalServices(db, employeeId);
  let service = priorServices.find(row => row.code === "PORTAL_SERVICO_FERIAS_PAULO");
  if (!service) {
    await saveFunctionalService(actor, { ruleSetId:regime.ruleSetId, code:"PORTAL_SERVICO_FERIAS_PAULO", name:"Programar minhas férias", description:"Solicite a programação de férias com as datas pretendidas e acompanhe a análise do RH.", isActive:true, configuration:{ budgetUnitId, group:"Gestão de Pessoas", processTypeId:"aurora-system-v1:process-type:000", subjectId:"aurora-system-v1:subject:000", operation:"FERIAS", employeeIds:[employeeId], fields, requiredDocuments:[], acceptance:"Confirmo as datas e solicito análise da programação pelo RH." } });
    service = (await listFunctionalServices(db, employeeId)).find(row => row.code === "PORTAL_SERVICO_FERIAS_PAULO");
  }
  assert.ok(service);
  const request = await submitFunctionalRequest(own, { requestKey:`${key}:vacation-approved`, serviceId:service.id, serviceVersion:service.configuration.version, description:"Solicito quinze dias de férias a partir de 7 de dezembro de 2026, com cobertura das atividades acordada com a coordenação.", values:{ contractId:contract.id, periodStart:"2025-01-02", periodEnd:"2026-01-01", kind:"GOZO", start:"2026-12-07", days:"15" }, accepted:true, attachments:[] });
  await decideFunctionalRequest(actor, { requestId:request.requestId, status:"DEFERIDA", decision:"Programação aprovada pela gestão de pessoas, com saldo aquisitivo conferido e cobertura das atividades definida." });
  console.log(JSON.stringify({ stage:"vacation", protocol:request.protocolNumber }));
  await db.insert(hrPayrollRules).values({ id:`${key}:birthdays`, ruleSetId:regime.ruleSetId, code:"PORTAL_ANIVERSARIANTES_PAULO", name:"Aniversariantes da equipe", category:"PORTAL", valueType:"JSON", value:{ origin:"ANIVERSARIANTES_FUNCIONAIS", viewerEmployeeIds:[employeeId], publishedEmployeeIds:[employeeId], legalReference:"Publicação autorizada dos dados fictícios para apresentação do Portal do Servidor." }, isActive:true }).onConflictDoNothing();
  for (const [suffix,title,completed] of [["ATENDIMENTO","Atendimento ao cidadão e comunicação institucional",true],["DOCUMENTOS","Gestão de documentos e processos digitais",false],["SAUDE","Saúde e bem-estar no trabalho",false]] as const) {
    const code = `PORTAL_CURSO_PAULO_${suffix}`;
    let [course] = await db.select().from(hrPayrollRules).where(eq(hrPayrollRules.code,code));
    if (!course) {
      const value = { origin:"CAPACITACAO_FUNCIONAL", budgetUnitId, employeeIds:[employeeId], enrollmentStartsAt:daysFromNow(-30), enrollmentEndsAt:daysFromNow(completed ? -15 : 20), startsAt:daysFromNow(completed ? -12 : 25), endsAt:daysFromNow(completed ? -10 : 26), capacity:25, hours:16, minAttendancePercentage:75, location:"Escola de Governo — Sala de Capacitações", issuerName:"Secretaria Municipal de Administração", instructions:"Capacitação funcional com atividades práticas, material de apoio e registro de participação." };
      const id = await saveCareerPolicy(actor, { ruleSetId:regime.ruleSetId, code, name:title, isActive:true, value });
      [course] = await db.select().from(hrPayrollRules).where(eq(hrPayrollRules.id,id));
    }
    if (completed) {
      // Historical participation is seeded explicitly; certificate recognition uses the domain service.
      await db.insert(employeePortalRequests).values({ id:`${key}:course:completed`, requestKey:`PORTAL:CURSO:${course.id}:${employeeId}`, employeeId, actorId:userId, kind:"CAPACITACAO_INSCRICAO", status:"INSCRITA", createdAt:new Date((course.value as {enrollmentStartsAt:string}).enrollmentStartsAt), payload:{ courseId:course.id, courseName:title, employeeName:name, policy:course.value, description:`Inscrição: ${title}` } }).onConflictDoNothing();
      await completeFunctionalCourse(actor, { requestId:`${key}:course:completed`, attendancePercentage:100, approved:true, evidenceReference:"Lista de presença e atividades concluídas — capacitação funcional de Paulo Silva." });
    } else if (suffix === "DOCUMENTOS") await enrollOwnCourse(own, {courseId:course.id});
  }
  const statements = await ownReleasedStatementIds(db,employeeId);
  const career = await listOwnCareerActivities(own), birthdays = await listFunctionalBirthdays(own,11);
  assert.equal(statements.length,3); assert.ok(career.enrollments.some(row=>row.status === "CONCLUIDA")); assert.ok(birthdays.rows.some(row=>row.name === name));
  console.log(JSON.stringify({ result:"PASS", email, employeeId, contractId:contract.id, statements, courseCount:career.courses.length, enrollments:career.enrollments.length, birthdays:birthdays.rows.length, vacationProtocol:request.protocolNumber, serviceId:service.id },null,2));
}
main().catch(error=>{ console.error(error); process.exitCode=1; }).finally(()=>connection.pool.end());
