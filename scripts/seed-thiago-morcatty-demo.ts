import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { users, accessProfiles } from "../src/db/schema/identity";
import { employees, roles, departments, secretariats, institutions } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { hrEmploymentRegimes, hrPayrollRuleSets, hrPayrollRules } from "../src/db/schema/personnel-configuration";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from "../src/db/schema/personnel-workforce";
import { addresses, taxpayers } from "../src/db/schema/registry";
import { neighborhoods, streets } from "../src/db/schema/localities";
import { attendanceRecords, personnelActs, vacations } from "../src/db/schema/personnel-records";
import { saveEmploymentContract, calculatePayrollRun, closePayrollRun, publishPayrollStatements, enqueueHrIntegration } from "../src/lib/rh/workforce-service";
import { acquireVacationRights, reserveVacationRight } from "../src/lib/rh/vacation-rights";
import { auditPersonnelMutation } from "../src/lib/rh/personnel-mutation-audit";
import { capturePersonalRevision } from "../src/lib/rh/personal-timeline";
import { ownReleasedStatementIds } from "../src/lib/portal-servidor/payroll-publication";
import { requireValidCpf } from "../src/lib/identifiers/brazilian-identifiers";

const packageId = "THIAGO_MORCATTY_DEMO_2026_V1";
const id = (entity: string) => `${packageId}:${entity}`;
const registration = "DEMO-TI-2026-001";
const reason = "Cadastro e histórico inteiramente fictícios de Thiago Morcatty, autorizados pelo titular para demonstração integrada de RH e Portal do Servidor.";
const apply = process.argv.includes("--apply");
const rehearse = process.argv.includes("--rehearse");
const verify = process.argv.includes("--verify");
if ([apply, rehearse, verify].filter(Boolean).length > 1) throw new Error("Selecione apenas um modo de execução.");
const uid = process.env.AUTH_TARGET_FIREBASE_UID;
if (!uid) throw new Error("Informe o UID da sessão autenticada em AUTH_TARGET_FIREBASE_UID.");
const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);

function fictionalCpf() {
  const digits = "993772901".split("").map(Number);
  for (const length of [9, 10]) {
    const rest = digits.slice(0, length).reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0) % 11;
    digits.push(rest < 2 ? 0 : 11 - rest);
  }
  return requireValidCpf(digits.join(""));
}

async function verification(db: DatabaseExecutor, userId: string, profileId: string) {
  const [account] = await db.select().from(users).where(eq(users.id, userId));
  const [employee] = await db.select().from(employees).where(eq(employees.id, id("employee")));
  const [person] = await db.select().from(people).where(eq(people.id, id("person")));
  const [address] = await db.select().from(addresses).where(eq(addresses.id, id("address")));
  const [taxpayer] = await db.select().from(taxpayers).where(eq(taxpayers.id, id("taxpayer")));
  const [contract] = await db.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.registration, registration));
  const [run] = await db.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.requestKey, id("payroll")));
  assert.ok(employee && person && address && taxpayer && contract && run, "Cadastro integrado incompleto.");
  assert.equal(account.employeeId, employee.id);
  assert.equal(account.perfilId, profileId);
  assert.equal(employee.personId, person.id);
  assert.equal(address.personId, person.id);
  assert.equal(taxpayer.personId, person.id);
  assert.equal(contract.employeeId, employee.id);
  assert.equal(run.scope, "DEMONSTRACAO");
  assert.equal(run.status, "FECHADA");
  const points = await db.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, employee.id));
  const holiday = await db.select().from(vacations).where(eq(vacations.employeeId, employee.id));
  const [statement] = await db.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, run.id));
  assert.ok(points.length > 0 && holiday.length === 1 && statement);
  const publishedIds = await ownReleasedStatementIds(db, employee.id, "10/2026");
  assert.ok(publishedIds.includes(statement.id), "Demonstrativo ainda não disponível pela política real do Portal.");
  return { packageId, fictional: true, name: person.fullName, registration, role: "Coordenador de TI", employeeId: employee.id, personId: person.id, taxpayerId: taxpayer.id, contractId: contract.id, address: { street: address.streetName, number: address.number, zipCode: address.zipCode }, attendance: { records: points.length, october: points.filter(row => row.date.toISOString().startsWith("2026-10")).length, november: points.filter(row => row.date.toISOString().startsWith("2026-11")).length }, vacation: holiday.map(row => ({ startsAt: row.enjoymentStart, endsAt: row.enjoymentEnd, days: row.days, status: row.status })), payroll: { competence: "10/2026", scope: run.scope, status: run.status, statementId: statement.id, gross: statement.gross.toFixed(2), deductions: statement.deductions.toFixed(2), net: statement.net.toFixed(2), availableInPortal: true }, accountProfilePreserved: true };
}

async function main() {
  const matches = await connection.db.select({ user: users, profile: accessProfiles }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(eq(users.firebaseUid, uid!));
  if (matches.length !== 1 || !matches[0].user.ativo || !matches[0].profile.ativo) throw new Error("A sessão deve corresponder a um único usuário e perfil ativos.");
  const { user, profile } = matches[0];
  if (verify) {
    console.log(JSON.stringify(await verification(connection.db, user.id, user.perfilId), null, 2));
    return;
  }
  const [existingEmployees, existingPeople, existingRoles, departmentRows, secretariatRows, institutionRows, regimes, contracts] = await Promise.all([
    connection.db.select().from(employees).where(or(ilike(employees.name, "%Morcatty%"), user.employeeId ? eq(employees.id, user.employeeId) : undefined)),
    connection.db.select({ id: people.id, name: people.fullName }).from(people).where(ilike(people.fullName, "%Morcatty%")),
    connection.db.select().from(roles).where(ilike(roles.name, "%TI%")),
    connection.db.select({ id: departments.id, name: departments.name, secretariatId: departments.secretariatId }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name)),
    connection.db.select({ id: secretariats.id, name: secretariats.name }).from(secretariats).where(eq(secretariats.isActive, true)).orderBy(asc(secretariats.name)),
    connection.db.select({ name: institutions.name, city: institutions.city, state: institutions.state }).from(institutions).limit(1),
    connection.db.select({ id: hrEmploymentRegimes.id, code: hrEmploymentRegimes.code, name: hrEmploymentRegimes.name, setId: hrPayrollRuleSets.id, setCode: hrPayrollRuleSets.code, scope: hrPayrollRuleSets.scope }).from(hrEmploymentRegimes).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrEmploymentRegimes.ruleSetId)).where(and(eq(hrEmploymentRegimes.isActive, true), eq(hrPayrollRuleSets.isDemo, true), eq(hrPayrollRuleSets.scope, "DEMONSTRACAO"))),
    connection.db.select({ id: hrEmploymentContracts.id, employeeId: hrEmploymentContracts.employeeId, registration: hrEmploymentContracts.registration }).from(hrEmploymentContracts).where(eq(hrEmploymentContracts.registration, registration)),
  ]);
  const selectedRegime = regimes.find(row => row.setCode === "RH_POC_DOCUMENTAL_2026_V1" && row.code === "COMISSIONADO_POC");
  const rules = selectedRegime ? await connection.db.select({ code: hrPayrollRules.code, value: hrPayrollRules.value }).from(hrPayrollRules).where(and(eq(hrPayrollRules.ruleSetId, selectedRegime.setId), eq(hrPayrollRules.isActive, true))) : [];
  if (apply || rehearse) {
    assert.ok(selectedRegime, "Regime comissionado demonstrativo não encontrado.");
    assert.ok(!user.employeeId || user.employeeId === id("employee"), "A conta já possui outro vínculo funcional.");
    assert.ok(existingEmployees.every(row => row.id === id("employee")) && existingPeople.every(row => row.id === id("person")), "Existe outro cadastro Morcatty; concilie antes de criar.");
    const department = departmentRows.find(row => row.id === "aurora-mg-50k-v1:department:003");
    assert.ok(department && /Tecnologia da Informação/.test(department.name), "Lotação de TI não encontrada.");
    const cpf = fictionalCpf();
    const cpfMatches = await connection.db.select({ id: people.id }).from(people).where(eq(people.cpf, cpf));
    assert.ok(cpfMatches.every(row => row.id === id("person")), "CPF sintético já utilizado por outra pessoa.");
    const rollback = new Error("REHEARSAL_ROLLBACK");
    let result: Awaited<ReturnType<typeof verification>> | undefined;
    try {
      await withDatabaseTransaction(connection, tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId})), set_config('celeriflow.actor_id',${user.id},true)`);
        const [currentUser] = await tx.select().from(users).where(eq(users.id, user.id)).for("update");
        assert.ok(currentUser.ativo && currentUser.perfilId === user.perfilId && (!currentUser.employeeId || currentUser.employeeId === id("employee")), "A identidade foi alterada durante a preparação.");
        await tx.insert(roles).values({ id: id("role"), name: "Coordenador de TI", level: "Coordenação", description: reason, canSign: false }).onConflictDoNothing({ target: roles.id });
        await tx.insert(people).values({ id: id("person"), fullName: "Thiago Morcatty", cpf, rg: "MG-DEMO-2026001", rgIssuer: "SSP/MG — fictício", birthDate: new Date("1990-05-15T00:00:00Z"), gender: "Masculino", nationality: "Brasileira", birthPlace: "Aurora das Veredas/MG — fictício", maritalStatus: "Solteiro", profession: "Coordenador de TI", educationLevel: "Superior completo", motherName: "Helena Morcatty (fictícia)", fatherName: "Carlos Morcatty (fictício)", phonePrimary: "33999990001", email: "thiago.morcatty@example.com" }).onConflictDoNothing({ target: people.id });
        await tx.insert(neighborhoods).values({ id: id("neighborhood"), name: "Jardim das Acácias (fictício)", type: "Bairro", city: institutionRows[0]?.city || "Aurora das Veredas", state: institutionRows[0]?.state || "MG", notes: reason }).onConflictDoNothing({ target: neighborhoods.id });
        await tx.insert(streets).values({ id: id("street"), name: "Rua das Acácias (fictícia)", type: "Rua", zipCode: "39999000", city: institutionRows[0]?.city || "Aurora das Veredas", state: institutionRows[0]?.state || "MG", neighborhoodId: id("neighborhood") }).onConflictDoNothing({ target: streets.id });
        await tx.insert(addresses).values({ id: id("address"), personId: id("person"), streetId: id("street"), neighborhoodId: id("neighborhood"), streetName: "Rua das Acácias (fictícia)", number: "150", complement: "Casa — endereço de demonstração", zipCode: "39999000", addressType: "Residencial", zone: "Urbana", referencePoint: "Endereço inteiramente fictício" }).onConflictDoNothing({ target: addresses.id });
        await tx.insert(taxpayers).values({ id: id("taxpayer"), personId: id("person"), taxpayerType: "PF", municipalInsc: "DEMO-TM-2026-001", fiscalNotes: reason }).onConflictDoNothing({ target: taxpayers.id });
        const [createdEmployee] = await tx.insert(employees).values({ id: id("employee"), personId: id("person"), name: "Thiago Morcatty", cpf, registration, email: "thiago.morcatty@example.com", phone: "33999990001", roleId: id("role"), departmentId: department.id, secretariatId: department.secretariatId, salaryBase: 8500, contractedHours: 200 }).onConflictDoNothing({ target: employees.id }).returning();
        if (createdEmployee) {
          await auditPersonnelMutation(tx, user.id, { employeeId: createdEmployee.id, entity: "Employee", id: createdEmployee.id, operation: "INCLUIR", before: null, after: createdEmployee });
          await capturePersonalRevision(tx, createdEmployee.id, user.id, reason);
        }
        await tx.insert(personnelActs).values({ id: id("appointment"), employeeId: id("employee"), type: "Nomeação (demonstração)", actNumber: "DEMO-TI-001/2025", date: new Date("2025-01-01T00:00:00Z") }).onConflictDoNothing({ target: personnelActs.id });
        let [contract] = await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.registration, registration));
        if (!contract) contract = await saveEmploymentContract(connection, user.id, { employeeId: id("employee"), registration, regimeId: selectedRegime.id, roleId: id("role"), departmentId: department.id, workLocation: department.name, admittedAt: "2025-01-01", appointedAt: "2025-01-01", swornAt: "2025-01-02", endsAt: "", monthlyHours: 200, salary: "8500.00", reason, details: { seedPackage: packageId, fictional: true, estimated: true, scope: "DEMONSTRACAO", attendanceSource: "Marcações sintéticas, com uma hora de intervalo não remunerado", identitySource: reason } });
        assert.equal(contract.employeeId, id("employee"));
        const existingPoints = await tx.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, id("employee")));
        const civilToday = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
        for (let date = new Date("2026-10-01T00:00:00Z"); date.toISOString().slice(0, 10) <= civilToday && date < new Date("2026-12-01T00:00:00Z"); date = new Date(date.getTime() + 86400000)) {
          const civil = date.toISOString().slice(0, 10);
          if ([0, 6].includes(date.getUTCDay()) || ["2026-10-12", "2026-10-28", "2026-11-02", "2026-11-20"].includes(civil) || civil === civilToday) continue;
          if (existingPoints.some(row => row.date.toISOString().slice(0, 10) === civil)) continue;
          const [point] = await tx.insert(attendanceRecords).values({ id: id(`attendance:${civil}`), employeeId: id("employee"), date, entryTime: new Date(`${civil}T11:00:00Z`), exitTime: new Date(`${civil}T20:00:00Z`), hoursWorked: 8, contractedHours: 8, status: "Presente" }).returning();
          await auditPersonnelMutation(tx, user.id, { employeeId: id("employee"), entity: "AttendanceRecord", id: point.id, operation: "INCLUIR", before: null, after: point });
        }
        await acquireVacationRights(connection, user.id, contract.id, "2026-11-05");
        await reserveVacationRight(connection, user.id, { contractId: contract.id, sourceKey: id("vacation"), periodStart: "2025-01-01", periodEnd: "2025-12-31", kind: "GOZO", start: "2026-12-01", days: 30, reason });
        await tx.insert(payrolls).values({ id: id("payroll"), competence: "10/2026", type: "Mensal", status: "Aberta" }).onConflictDoNothing({ target: payrolls.id });
        const run = await calculatePayrollRun(connection, user.id, { payrollId: id("payroll"), requestKey: id("payroll"), mode: "OFICIAL", scope: "DEMONSTRACAO", contractIds: [contract.id] });
        await closePayrollRun(connection, user.id, run.id);
        const [published] = await tx.select({ releaseAt: hrPayrollStatements.releaseAt }).from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, run.id));
        await publishPayrollStatements(connection, user.id, run.id, published?.releaseAt ?? new Date());
        await tx.update(users).set({ nome: "Thiago Morcatty", employeeId: id("employee") }).where(eq(users.id, user.id));
        await enqueueHrIntegration(tx, { sourceKey: id("account-link"), domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "USUARIO_VINCULADO_SERVIDOR_DEMONSTRACAO", payload: { actorId: user.id, employeeId: id("employee"), personId: id("person"), packageId, reason, profilePreserved: user.perfilId } });
        result = await verification(tx, user.id, user.perfilId);
        if (rehearse) throw rollback;
      }), { timeoutMs: 240000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.ok(result);
    const report = { checkedAt: new Date().toISOString(), mode: apply ? "APPLIED" : "REHEARSED_ROLLED_BACK", ...result };
    if (apply) {
      await mkdir("docs/checkup", { recursive: true });
      await writeFile("docs/checkup/thiago-morcatty-demo.json", JSON.stringify(report, null, 2) + "\n");
    }
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(JSON.stringify({ mode: "PREVIEW", packageId, account: { id: user.id, name: user.nome, profile: profile.codigo, employeeId: user.employeeId }, existingEmployees, existingPeople, existingRoles, departments: departmentRows, secretariats: secretariatRows, institution: institutionRows[0], regimes, contracts, rules: rules.map(rule => ["QUADRO_CARGOS", "CAMPOS_CONTRATO"].includes(rule.code) ? rule : { code: rule.code }), proposed: { name: "Thiago Morcatty", role: "Coordenador de TI", registration: "DEMO-TI-2026-001", salary: "8500.00", monthlyHours: 200, admittedAt: "2025-01-01", payroll: "10/2026", vacation: "01/12/2026 a 30/12/2026", fictional: true } }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => connection.pool.end());
