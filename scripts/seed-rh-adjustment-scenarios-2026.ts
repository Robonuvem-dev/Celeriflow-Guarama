import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction, type DatabaseTransaction } from "../src/db/transaction";
import { employees, roles, secretariats } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { banks, currencies } from "../src/db/schema/master-data";
import { budgetAppropriations } from "../src/db/schema/finance-budget";
import { setupExpenseNatures } from "../src/db/schema/finance-setup-tools";
import { hrEmploymentContracts, hrPortalRequests } from "../src/db/schema/personnel-workforce";
import { hrPayrollRules, hrPayrollRuleSets } from "../src/db/schema/personnel-configuration";
import { hrReferenceRecords } from "../src/db/schema/personnel-reference-records";
import { dependents, personnelActs, vacations } from "../src/db/schema/personnel-records";
import { saveReferenceRecord, type ReferenceKind } from "../src/lib/rh/reference-records";
import { coursePolicySchema, completeFunctionalCourse } from "../src/lib/portal-servidor/career-service";
import { retirementProjectionPolicySchema } from "../src/lib/rh/retirement-reports";
import { users } from "../src/db/schema/identity";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { PermissionUser } from "../src/lib/contracts/identity";
import { RH_POC_CODE } from "../src/lib/rh/poc-bootstrap";

const packageId = "RH_CENARIOS_AJUSTES_2026_V1";
const actorId = `SYSTEM:${packageId}`;
const note = "DEMONSTRAÇÃO — dado fictício autorizado; não representa documento, pagamento ou direito oficial.";
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function reference(tx: DatabaseTransaction, kind: ReferenceKind, key: string, name: string, details: Record<string, string>) {
  const code = `${packageId}:${key}`;
  const [previous] = await tx.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.kind, kind), eq(hrReferenceRecords.code, code)));
  if (previous) {
    if (previous.name !== name || JSON.stringify(Object.entries(previous.details).sort()) !== JSON.stringify(Object.entries(details).sort())) throw new Error("Cenário existente alterado pelo operador; concilie antes de retomar.");
    return previous;
  }
  return saveReferenceRecord(tx, undefined, { kind, code, name, details });
}
async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const workers = await connection.db.select({ employee: employees, contract: hrEmploymentContracts, role: roles.name, secretariat: secretariats.name }).from(employees)
      .innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.employeeId, employees.id)).leftJoin(roles, eq(roles.id, employees.roleId)).leftJoin(secretariats, eq(secretariats.id, employees.secretariatId))
      .where(sql`${hrEmploymentContracts.details}->>'seedPackage'='RH_PORTAL_2026_V1'`).orderBy(asc(employees.id));
    if (!process.argv.includes("--apply")) { console.log(JSON.stringify({ mode: "PREVIEW", packageId, employees: workers.length, data: ["396 rateios remuneratórios/patronais", "demanda por cargo/lotação", "graduação", "contribuição anterior", "VT", "convênios", "capacitação", "pensão vitalícia fictícia", "férias futuras"], createsUsers: false, realPayments: false })); return; }
    if (workers.length !== 198) throw new Error("Confira a população antes de executar os cenários esperados para 198 servidores.");
    const [set] = await connection.db.select().from(hrPayrollRuleSets).where(and(eq(hrPayrollRuleSets.code, RH_POC_CODE), eq(hrPayrollRuleSets.isDemo, true), eq(hrPayrollRuleSets.scope, "DEMONSTRACAO")));
    if (!set) throw new Error("Pacote demonstrativo de folha não encontrado.");
    const budget = await connection.db.select().from(budgetAppropriations).where(sql`starts_with(${budgetAppropriations.id},'aurora-mg-50k-v1:appropriation:')`).orderBy(asc(budgetAppropriations.code));
    const budgetNames = await connection.db.execute<{ id: string; name: string; nature: string }>(sql`SELECT a.id,u.name,n.code nature FROM "BudgetAppropriation" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId" JOIN "FinancialYear" y ON y.id=a."financialYearId" WHERE y.year=2026 AND starts_with(a.id,'aurora-mg-50k-v1:appropriation:')`);
    const remunerationBudget = budget.filter(row => budgetNames.rows.some(item => item.id === row.id && item.nature.replace(/\D/g, "") === "319011"));
    if (!remunerationBudget.length) throw new Error("Dotações demonstrativas de pessoal de 2026 não encontradas.");
    const [bank] = await connection.db.select().from(banks).where(eq(banks.compe, "001"));
    const [currency] = await connection.db.select().from(currencies).where(eq(currencies.isoCode, "BRL"));
    if (!bank || !currency) throw new Error("Banco/moeda compartilhados não encontrados.");
    await withDatabaseTransaction(connection, async tx => {
      await tx.insert(setupExpenseNatures).values({ id: `${packageId}:nature:319013`, code: "3.1.90.13", name: "Obrigações patronais — referência de classificação" }).onConflictDoNothing();
    });
    const [employerNature] = await connection.db.select().from(setupExpenseNatures).where(eq(setupExpenseNatures.code, "3.1.90.13"));
    const employerBudget = new Map<string, string>();
    for (const appropriation of remunerationBudget) {
      const id = `${packageId}:employer:${appropriation.id}`;
      await connection.db.insert(budgetAppropriations).values({ ...appropriation, id, code: `DEMO-RH-ENC-${appropriation.code}`, expenseNatureId: employerNature.id, annualBudgetExpenseFixationId: null, initialValue: 0, initialValueDecimal: new Decimal(0), updatedValue: 0, updatedValueDecimal: new Decimal(0), committedValue: 0, committedValueDecimal: new Decimal(0) }).onConflictDoNothing({ target: budgetAppropriations.id });
      employerBudget.set(appropriation.id, id);
    }
    let completed = 0;
    const demand = new Map<string, { departmentId: string; roleId: string; quantity: number; weeklyHours: number }>();
    for (const { employee, contract, secretariat } of workers) {
      const sector = normalize(secretariat ?? "administracao");
      const names = ["educacao", "saude", "assistencia", "obras", "cultura", "meio ambiente", "seguranca", "fazenda"];
      const word = names.find(name => sector.includes(name)) ?? "administracao";
      const appropriation = remunerationBudget.find(row => normalize(budgetNames.rows.find(item => item.id === row.id)?.name ?? "").includes(word));
      if (!appropriation) throw new Error(`Sem dotação demonstrativa para setor ${word}.`);
      await withDatabaseTransaction(connection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
        for (const [component, appropriationId] of [["REMUNERACAO", appropriation.id], ["ENCARGO", employerBudget.get(appropriation.id)!]]) await reference(tx, "RATEIO_FOLHA", `allocation:${contract.id}:${component}`, `${employee.name} — ${component} — DEMO`, { contractId: contract.id, appropriationId, percentage: "100", component, from: "2026-08-01", until: "2026-12-31", source: `${note} Apropriação estimada pelo setor ${word}; sem execução orçamentária.` });
      }, { timeoutMs: 60000 });
      if (employee.departmentId && employee.roleId) {
        const key = `${employee.departmentId}:${employee.roleId}`, group = demand.get(key) ?? { departmentId: employee.departmentId, roleId: employee.roleId, quantity: 0, weeklyHours: employee.contractedHours / 5 };
        group.quantity++; demand.set(key, group);
      }
      completed++;
      if (completed % 40 === 0) console.log(JSON.stringify({ event: "scenario-allocations", employees: completed }));
    }
    for (const [key, group] of demand) await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      await reference(tx, "DEMANDA_PESSOAL", `demand:${key}`, "Demanda estimada de pessoal — DEMONSTRAÇÃO", { departmentId: group.departmentId, roleId: group.roleId, positions: String(Math.ceil(group.quantity * 1.1)), weeklyHours: String(group.weeklyHours), from: "2026-01-01", until: "2026-12-31", method: `${note} Cenário: ocupação cadastral acrescida de 10%, arredondada para cima; não é estudo técnico oficial.` });
    });
    const catalogs = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      const courses = [];
      for (const [index, name] of ["Pedagogia", "Administração Pública", "Gestão de Serviços de Saúde"].entries()) courses.push(await reference(tx, "GRADUACAO_CURSO", `degree:${index}`, `${name} — DEMONSTRAÇÃO`, { institution: "Instituto Municipal de Estudos de Aurora — fictício", level: index === 0 ? "Licenciatura" : "Bacharelado", modality: "Presencial" }));
      const credit = await reference(tx, "CONVENIO_BANCARIO", "credit", "Crédito salarial — convênio fictício", { bankId: bank.id, direction: "CREDITO", from: "2026-01-01", until: "2026-12-31", source: note });
      const debit = await reference(tx, "CONVENIO_BANCARIO", "debit", "Débitos autorizados — convênio fictício", { bankId: bank.id, direction: "DEBITO", from: "2026-01-01", until: "2026-12-31", source: note });
      for (const [code, name] of [["01", "Término do prazo contratual"], ["02", "Exoneração a pedido"], ["03", "Exoneração de cargo em comissão"]]) await reference(tx, "MOTIVO_DESLIGAMENTO", `termination:${code}`, name, { externalCode: "DEMO — sem equivalência externa homologada", description: note });
      for (const date of ["2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15"]) await reference(tx, "FERIADO", `holiday:${date}`, `Feriado nacional ${date}`, { date, scope: "Nacional" });
      for (const month of ["08", "09", "10"]) await reference(tx, "INDICE_FINANCEIRO", `index:${month}`, "Índice auxiliar de demonstração — sem reajuste automático", { currencyId: currency.id, date: `2026-${month}-01`, value: `1.00${month}`, source: note });
      return { courses, credit, debit };
    }, { timeoutMs: 120000 });
    for (const [index, { employee }] of workers.entries()) await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      await reference(tx, "CONTA_CONVENIO", `credit-account:${employee.id}`, `Conta fictícia de ${employee.name}`, { employeeId: employee.id, conventionId: catalogs.credit.id, agency: "0001-DEMO", account: `DEMO-${String(index + 1).padStart(6, "0")}`, accountType: "SALARIO", from: "2026-01-01", until: "2026-12-31", authorization: note });
    });
    for (const [index, { employee, contract }] of workers.slice(0, 18).entries()) await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('hr-reference-records'))`);
      await reference(tx, "GRADUACAO_SERVIDOR", `education:${employee.id}`, `Graduação de ${employee.name} — DEMO`, { employeeId: employee.id, courseId: catalogs.courses[index % 3].id, from: "2015-02-01", until: "2018-12-15", status: "Concluído", evidence: note });
      if (index < 6) await reference(tx, "TEMPO_CONTRIBUICAO", `prior-time:${employee.id}`, `Tempo anterior de ${employee.name} — DEMO`, { employeeId: employee.id, from: "2020-01-01", until: "2022-12-31", employer: "Instituição Regional de Aurora — fictícia", regime: "RGPS demonstrativo", recognizedDays: "1096", status: "Reconhecido", source: `${note} Reconhecimento somente no cenário fictício.` });
      if (index < 4) await reference(tx, "CONTA_CONVENIO", `debit-account:${employee.id}`, `Débito fictício de ${employee.name}`, { employeeId: employee.id, conventionId: catalogs.debit.id, agency: "0001-DEMO", account: `DEMO-${String(index + 1).padStart(6, "0")}`, accountType: "CORRENTE", from: "2026-01-01", until: "2026-12-31", authorization: note });
      if (index < 8) {
        await reference(tx, "VT_ITINERARIO", `transport:${employee.id}`, `Vale-transporte de ${employee.name} — DEMO`, { employeeId: employee.id, route: "Linha Municipal Aurora / Centro — fictícia", fare: "4.80", trips: "2", weekdays: "1,2,3,4,5", from: "2026-08-01", until: "2026-10-31", source: note });
        for (const month of ["08", "09", "10"]) for (const type of ["AQUISICAO", "CONCESSAO", "CONSUMO"]) await reference(tx, "VT_MOVIMENTO", `transport:${employee.id}:${month}:${type}`, `${type} fictícia de vale-transporte`, { employeeId: employee.id, competence: `${month}/2026`, type, quantity: "42", amount: "201.60", source: note });
      }
      await tx.insert(personnelActs).values({ id: `${packageId}:act:${employee.id}`, employeeId: employee.id, type: "Anotação demonstrativa", actNumber: `DEMO-2026-${index + 1}`, date: new Date("2026-10-15T00:00:00Z"), documentUrl: null }).onConflictDoNothing({ target: personnelActs.id });
      if (index < 8) await tx.insert(dependents).values({ id: `${packageId}:dependent:${employee.id}`, employeeId: employee.id, name: `${["Lucas", "Helena", "Miguel", "Sofia"][index % 4]} Aurora — dependente fictício`, birthDate: new Date(`201${index % 8}-05-12T00:00:00Z`), relationship: "Filho(a)", irrfDependent: false, familyWage: false }).onConflictDoNothing({ target: dependents.id });
      if (index < 4) await tx.insert(vacations).values({ id: `${packageId}:vacation:${contract.id}`, employeeId: employee.id, acquisitionStart: new Date("2026-01-01T00:00:00Z"), acquisitionEnd: new Date("2026-12-31T00:00:00Z"), enjoymentStart: new Date("2027-01-11T00:00:00Z"), enjoymentEnd: new Date("2027-01-25T00:00:00Z"), days: 15, status: "Programada" }).onConflictDoNothing({ target: vacations.id });
    }, { timeoutMs: 120000 });
    await withDatabaseTransaction(connection, async tx => {
      const beneficiaryId = `${packageId}:beneficiary`;
      await tx.insert(people).values({ id: beneficiaryId, fullName: "Helena Martins — beneficiária fictícia", birthDate: new Date("1960-04-10T00:00:00Z"), status: "Ativo" }).onConflictDoNothing({ target: people.id });
      await reference(tx, "PENSAO_VITALICIA", "lifetime-pension", "Pensão vitalícia demonstrativa", { employeeId: workers[0].employee.id, beneficiaryPersonId: beneficiaryId, from: "2026-01-01", until: "2200-12-31", quota: "100", amount: "2600.00", status: "Ativa", source: note });
      const policy = retirementProjectionPolicySchema.parse({ origin: "PROJECAO_APOSENTADORIA", isDemo: true, regimeIds: [...new Set(workers.map(row => row.contract.regimeId))], gender: "Todos", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", minimumAgeYears: 65, minimumContributionDays: 10950, minimumPublicDays: 3650, minimumRoleDays: 1825, legalReference: note, assumptions: "Limiares fictícios em dias civis para demonstrar projeção. Sem equivalência a uma regra/transição municipal oficial." });
      await tx.insert(hrPayrollRules).values({ ruleSetId: set.id, code: "PROJECAO_APOSENTADORIA_DEMO_2026", name: "Expectativa de aposentadoria — cenário fictício", category: "RELATORIOS", valueType: "JSON", value: policy, isActive: true }).onConflictDoNothing({ target: [hrPayrollRules.ruleSetId, hrPayrollRules.code] });
    });
    // Use the actual operator's stored permissions for the canonical course-conclusion service.
    const operators = await connection.db.select().from(users).where(eq(users.ativo, true));
    const operator = operators.find(user => user.firebaseUid);
    if (!operator?.firebaseUid) throw new Error("Operador cadastrado não encontrado para reconhecer os cenários de capacitação.");
    const identity = await findIdentityByFirebaseUid(connection.db, operator.firebaseUid);
    if (!identity) throw new Error("Identidade operacional não encontrada.");
    const user: PermissionUser = { id: identity.id, firebaseUid: operator.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null };
    for (const [index, month] of ["08", "09", "10"].entries()) {
      const policy = coursePolicySchema.parse({ origin: "CAPACITACAO_FUNCIONAL", budgetUnitId: remunerationBudget[0].budgetUnitId, employeeIds: workers.slice(0, 18).map(row => row.employee.id), enrollmentStartsAt: `2026-${month}-01T00:00:00Z`, enrollmentEndsAt: `2026-${month}-03T23:59:00Z`, startsAt: `2026-${month}-10T08:00:00Z`, endsAt: `2026-${month}-12T17:00:00Z`, capacity: 30, hours: 20, minAttendancePercentage: 75, location: "Centro de Formação de Aurora — fictício", issuerName: "Município fictício de Aurora — DEMONSTRAÇÃO", instructions: note });
      const [course] = await connection.db.insert(hrPayrollRules).values({ id: `${packageId}:training:${month}`, ruleSetId: set.id, code: `PORTAL_CURSO_DEMO_AJUSTES_${month}`, name: `${["Atendimento ao cidadão", "Gestão de documentos públicos", "Planejamento do serviço municipal"][index]} — DEMONSTRAÇÃO`, category: "PORTAL", valueType: "JSON", value: policy, isActive: true }).onConflictDoNothing({ target: hrPayrollRules.id }).returning();
      const storedCourse = course ?? (await connection.db.select().from(hrPayrollRules).where(eq(hrPayrollRules.id, `${packageId}:training:${month}`)))[0];
      for (const { employee } of workers.slice(index * 6, index * 6 + 6)) {
        const requestId = `${packageId}:training:${month}:${employee.id}`;
        await connection.db.insert(hrPortalRequests).values({ id: requestId, employeeId: employee.id, requestKey: requestId, kind: "CAPACITACAO_INSCRICAO", status: "INSCRITA", actorId, payload: { courseId: storedCourse.id, courseName: storedCourse.name, employeeName: employee.name, policy, description: note }, createdAt: new Date(`2026-${month}-02T10:00:00Z`) }).onConflictDoNothing({ target: hrPortalRequests.id });
        await completeFunctionalCourse({ database: connection.db, user }, { requestId, attendancePercentage: 100, approved: true, evidenceReference: note }, connection);
      }
    }
    await mkdir("docs", { recursive: true });
    const { rows: counts } = await connection.db.execute<{ kind: string; records: number }>(sql`SELECT kind,count(*)::int records FROM "HrReferenceRecord" WHERE starts_with(code,${packageId}) GROUP BY kind ORDER BY kind`);
    const { rows: certificates } = await connection.db.execute<{ total: number }>(sql`SELECT count(*)::int total FROM "HrIntegrationEvent" WHERE "eventType"='CERTIFICADO_CURSO_EMITIDO' AND starts_with(payload->>'courseId',${packageId})`);
    const result = { packageId, recordedAt: new Date().toISOString(), scope: "DEMONSTRACAO", employees: workers.length, counts, certificates: certificates[0]?.total ?? 0, realPayments: false, createsUsers: false, bankTransmission: false, validationLayer: "population-business-services-not-browser-or-homologation", note };
    await writeFile("docs/RH_CENARIOS_AJUSTES_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
