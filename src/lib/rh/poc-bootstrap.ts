import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { findHrIntegrationEvent, personnelJson as json } from "@/db/repositories/personnel/integration";
import { createPocInstance, ensurePocCalculationPolicy, ensurePocEmployee, ensurePocEmploymentRegime, ensurePocPayroll, ensurePocPayrollEvent, ensurePocPayrollRubric, ensurePocPayrollRule, ensurePocPerson, ensurePocRole, ensurePocRuleSet, ensurePocSocialSecurityScheme, ensurePocVacationPolicy, findFirstPocInstance, findPocContract, findPocPersonByCpf, insertPocRubricIncidences, insertPocSocialSecurityBands, lockPocBootstrap } from "@/db/repositories/personnel-poc-bootstrap/records";
import { HR_PAYROLL_TYPES, payrollPeriod } from "./calculation-engine";
import { INCOME_TAX_2026_BANDS, INCOME_TAX_2026_REDUCTION } from "./income-tax";
import { enqueueHrIntegration, hrContractInputSchema, saveEmploymentContractInTransaction } from "./workforce-service";
import { payrollReferenceNames, payrollRuleReferenceNames } from "./payroll-labels";

export const RH_POC_CODE = "RH_POC_DOCUMENTAL_2026_V1";
export const RH_POC_REFERENCE = "POC: mescla Ibema LC 025/2005 histórica, Campina do Simão Lei 21/2025 arts. 106/109, modelos PR/Paranaguá e catálogo 001–141. Estimativas autorizadas em 11/10/2026; substituir conforme RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md.";

/** Additive, versioned package. Repeating installation preserves operator edits. */
export async function installDocumentaryPocParameters(connection: DatabaseConnection, actorId: string) {
  return withDatabaseTransaction(connection, async tx => {
    await lockPocBootstrap(tx, "RH:POC:BOOTSTRAP:V1");
    const instance = await findFirstPocInstance(tx) ?? await createPocInstance(tx, { id: "rh-poc-ibema-instance-v1", nomePrefeitura: "Prefeitura Municipal de Aurora das Veredas", municipio: "Aurora das Veredas", uf: "MG", status: "Ativa" });
    const effectiveFrom = new Date("2020-01-01T00:00:00Z");
    const set = await ensurePocRuleSet(tx, { configuracaoInstanciaId: instance.id, code: RH_POC_CODE, name: "Aurora das Veredas — parâmetros de pessoal e folha", status: "ATIVA", scope: "DEMONSTRACAO", isDemo: true, effectiveFrom, effectiveUntil: new Date("2030-12-31T23:59:59.999Z"), legalReference: RH_POC_REFERENCE });
    if (!set.isDemo || set.scope !== "DEMONSTRACAO") throw new Error("Pacote POC existente foi convertido para outro escopo.");
    await ensurePocCalculationPolicy(tx, { ruleSetId: set.id, roundingMode: "HALF_UP", roundingScale: 2, negativeNetPayPolicy: "BLOQUEAR", maxConsignmentMarginRate: "35", freezeOnClose: true, legalReference: RH_POC_REFERENCE });
    const scheme = await ensurePocSocialSecurityScheme(tx, { ruleSetId: set.id, code: "RGPS_POC", name: "Regime Geral de Previdência Social — referência 2026", regime: "RGPS", employeeCalculationMethod: "PROGRESSIVA", ceilingValue: "8475.55", employerContributionRate: "22", legalReference: RH_POC_REFERENCE });
    await insertPocSocialSecurityBands(tx, [
      { sequence: 1, lowerLimit: "0", upperLimit: "1621.00", employeeRate: "7.5" },
      { sequence: 2, lowerLimit: "1621.00", upperLimit: "2902.84", employeeRate: "9" },
      { sequence: 3, lowerLimit: "2902.84", upperLimit: "4354.27", employeeRate: "12" },
      { sequence: 4, lowerLimit: "4354.27", upperLimit: null, employeeRate: "14" },
    ].map(band => ({ ...band, socialSecuritySchemeId: scheme.id })));
    const vacation = await ensurePocVacationPolicy(tx, { ruleSetId: set.id, code: "FERIAS_MESCLA_POC", name: "Férias anuais — aquisição e fracionamento", employmentNature: "ESTATUTARIO", acquisitionMonths: 12, concessionMonths: 12, entitlementDays: 30, maxSplits: 3, minFirstSplitDays: 10, minOtherSplitDays: 10, additionalPayRate: "33.333333", allowsCashAbono: true, maxCashAbonoDays: 10, requiresApproval: true, legalReference: RH_POC_REFERENCE });
    const regimes = [];
    for (const [code, name, nature, category] of [["EFETIVO_POC", "Efetivo", "ESTATUTARIO", "301"], ["COMISSIONADO_POC", "Comissionado", "COMISSIONADO", "302"], ["TEMPORARIO_POC", "Temporário", "TEMPORARIO", "306"]]) {
      regimes.push(await ensurePocEmploymentRegime(tx, { ruleSetId: set.id, code, name, employmentNature: nature, esocialCategory: category, defaultMonthlyHours: 200, socialSecuritySchemeId: scheme.id, vacationPolicyId: vacation.id, legalReference: RH_POC_REFERENCE }));
    }
    const definitions = [
      { code: "VENCIMENTO", name: "Vencimento", type: "PROVENTO", method: "FORMULA_CONTROLADA", formula: "SALARIO_BASE * DIAS / 30", incidences: ["RGPS", "IRRF"] },
      ...["ATS", "EXTRA", "VARIAVEL"].map(code => ({ code, name: code, type: "PROVENTO", method: "MANUAL", formula: null, incidences: ["RGPS", "IRRF"] })),
      { code: "CONSIGNADO", name: "Parcela consignada", type: "DESCONTO", method: "MANUAL", formula: null, incidences: [] },
      ...["POC_COMPLEMENTO", "POC_FERIAS", "POC_TERCO", "POC_DECIMO_13", "POC_SALDO", "POC_RRA"].map(code => ({ code, name: code.replaceAll("POC_", "").replaceAll("_", " "), type: "PROVENTO", method: "MANUAL", formula: null, incidences: ["RGPS", "IRRF"] })),
      ...["POC_ADIANTAMENTO", "POC_ADIANTAMENTO_13", "POC_FERIAS_IND", "POC_TERCO_IND"].map(code => ({ code, name: code.replaceAll("POC_", "").replaceAll("_", " "), type: "PROVENTO", method: "MANUAL", formula: null, incidences: [] })),
      { code: "POC_ABATIMENTO", name: "Abatimento de valores já adiantados", type: "DESCONTO", method: "MANUAL", formula: null, incidences: [] },
    ];
    const mapping: Record<string, string> = {};
    for (const [priority, definition] of definitions.entries()) {
      const rubric = await ensurePocPayrollRubric(tx, { ruleSetId: set.id, code: definition.code, name: payrollReferenceNames[definition.code] || definition.name, type: definition.type, calculationMethod: definition.method, formulaExpression: definition.formula, priority: priority + 10, legalReference: RH_POC_REFERENCE });
      await insertPocRubricIncidences(tx, definition.incidences.map(incidenceType => ({ rubricId: rubric.id, incidenceType, isIncluded: true })));
      const event = await ensurePocPayrollEvent(tx, { code: `POC_V1_${definition.code}`, name: payrollReferenceNames[definition.code] || definition.name, type: definition.type === "DESCONTO" ? "Desconto" : "Vencimento", isActive: true });
      mapping[definition.code] = event.id;
    }
    for (const code of ["PREVIDENCIA_RGPS_POC", "IRRF"]) {
      const event = await ensurePocPayrollEvent(tx, { code: `POC_V1_${code}`, name: payrollReferenceNames[code] || code, type: "Desconto", isActive: true });
      mapping[code] = event.id;
    }
    const rules = [
      { code: "FOLHA_EVENTOS", value: mapping },
      { code: "IRRF_FAIXAS", value: INCOME_TAX_2026_BANDS }, { code: "IRRF_REDUCAO_MENSAL", value: INCOME_TAX_2026_REDUCTION },
      { code: "IRRF_DEDUCAO_DEPENDENTE", value: "189.59" }, { code: "IRRF_DEDUCAO_SIMPLIFICADA", value: "607.20" },
      { code: "PREVIDENCIA_BASE_PATRONAL_RGPS_POC", value: "SEM_TETO" },
      { code: "FOLHAS_ESPECIAIS_POC", value: { origin: "FOLHAS_ESPECIAIS_POC", legalReference: RH_POC_REFERENCE, estimated: true, version: 1 } },
      { code: "RATEIO_MENSAL_CIVIL", value: { origin: "RATEIO_MENSAL_CIVIL", divisor: "DIAS_CIVIS_MES", manualMovements: "VALOR_INTEGRAL_RATEADO", legalReference: "POC: vencimento/fixos/fórmulas por proporção de dias civis do mês; movimentos informados são integrais e distribuídos entre vigências. Substituir divisor e critérios municipais.", estimated: true } },
      { code: "DIARIAS_POC", value: { origin: "DIARIAS_POC", rates: { DF: "540.53", CAPITAL: "405.39", INTERIOR: "337.83", INTERNACIONAL: "130.00" }, minimumDistanceKm: 70, rounding: "DOWN", legalReference: "Cartilha Diárias julho/2025, p. 2–8; demais servidores. Limites de horas e truncamento estimados para POC.", estimated: true } },
      { code: "FALTAS_FERIAS_POC", value: { origin: "FALTAS_FERIAS_POC", estimated: true, legalReference: "Ibema art. 101 histórico + Campina do Simão Lei 21/2025 art. 109 p. 29. >=33 faltas é fechamento estimado da lacuna para POC.", attendanceStatuses: ["Falta"], bands: [{ minimumAbsences: 0, maximumAbsences: 5, days: 30 }, { minimumAbsences: 6, maximumAbsences: 14, days: 24 }, { minimumAbsences: 15, maximumAbsences: 23, days: 18 }, { minimumAbsences: 24, maximumAbsences: 32, days: 12 }, { minimumAbsences: 33, maximumAbsences: null, days: 0 }] } },
      { code: "ATS", value: { origin: "ATS", rubricCode: "ATS", basis: "SALARIO_TEMPORAL", tiers: Array.from({ length: 7 }, (_, i) => ({ minimumDays: i * 1825, minimumYears: i * 5, rate: String(i * 5) })), absences: [{ type: "Licença sem vencimentos", counts: false }, { type: "Licença médica", counts: true }], legalReference: RH_POC_REFERENCE } },
      { code: "LICENCA_PREMIO", value: { origin: "LICENCA_PREMIO", acquisitionDays: 1825, acquisitionYears: 5, entitlementDays: 90, minSplitDays: 15, maxSplits: 6, allowsCash: true, maxCashDays: 45, absences: [{ type: "Licença sem vencimentos", effect: "SUSPENDER" }, { type: "Licença médica", effect: "CONTAR" }, { type: "Suspensão disciplinar", effect: "REINICIAR" }], legalReference: RH_POC_REFERENCE } },
      { code: "HORAS_EXTRAS_PONTO", value: { origin: "HORAS_EXTRAS_PONTO", rubricCode: "EXTRA", additionalRate: "50", legalReference: RH_POC_REFERENCE } },
      { code: "BANCO_HORAS_PONTO", value: { origin: "BANCO_HORAS_PONTO", maxBalanceHours: "120", maxCreditPerDayHours: "2", maxDebitPerDayHours: "8", allowedStatuses: ["Presente"], forbidPaidOvertimeForCredit: true, legalReference: RH_POC_REFERENCE } },
      { code: "PROVISOES_FOLHA", value: { origin: "PROVISOES_FOLHA", legalReference: RH_POC_REFERENCE, components: [{ kind: "PROVISAO_FERIAS", rubricCodes: ["VENCIMENTO", "ATS"], rate: "11.11111111", employerRate: "22" }, { kind: "PROVISAO_13", rubricCodes: ["VENCIMENTO", "ATS"], rate: "8.33333333", employerRate: "22" }, { kind: "PROVISAO_LICENCA", rubricCodes: ["VENCIMENTO", "ATS"], rate: "5", employerRate: "22" }] } },
      { code: "MARGEM_CONSIGNAVEL", value: { origin: "MARGEM_CONSIGNAVEL", remunerationRubricCodes: ["VENCIMENTO", "ATS", "EXTRA", "VARIAVEL"], compulsoryDeductionRubricCodes: ["PREVIDENCIA_RGPS_POC", "IRRF"], consignmentRubricCodes: ["CONSIGNADO"], legalReference: RH_POC_REFERENCE } },
      { code: "MENSAGENS_RECIBO", value: { origin: "MENSAGENS_RECIBO", messages: [{ id: "POC_V1", text: "DEMONSTRAÇÃO POC — parâmetros documentais e estimados. Consulte o registro de substituição antes da implantação.", startsAt: "2020-01-01", endsAt: null, contractIds: [], regimeIds: [], payrollTypes: [] }] } },
      { code: "POC_FONTES_E_ESTIMATIVAS", value: { version: 1, reference: RH_POC_REFERENCE, sourceIds: [13, 39, 45, 58, 60, 88, 89, 90, 100, 105, 111, 128, 137], conventionModels: ["REMESSA_SALARIAL_CSV_POC", "CONSIGNACAO_CSV_POC", "DIARIAS_SOLICITACAO_POC"], bankCodesForExamples: ["001", "104", "237", "341", "756"] } },
    ];
    for (const rule of rules) await ensurePocPayrollRule(tx, { ruleSetId: set.id, code: rule.code, name: payrollRuleReferenceNames[rule.code] || rule.code, category: "CALCULO", valueType: "JSON", value: json(rule.value), legalReference: RH_POC_REFERENCE, isActive: true });
    const sourceKey = `POC:PARAMETROS:${set.id}`;
    if (!await findHrIntegrationEvent(tx, sourceKey)) await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "PARAMETROS_POC_INSTALADOS", payload: { ruleSetId: set.id, version: 1, reference: RH_POC_REFERENCE, actorId } });
    return { ruleSetId: set.id, regimeId: regimes[0].id, regimeIds: regimes.map(regime => regime.id), scope: set.scope };
  }, { timeoutMs: 60000 });
}

function sampleCpf(index: number) {
  const digits = `993771${String(index).padStart(3, "0")}`.split("").map(Number);
  for (const length of [9, 10]) {
    const remainder = digits.slice(0, length).reduce((sum, digit, i) => sum + digit * (length + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}

export async function prepareDocumentaryPocDataset(connection: DatabaseConnection, actorId: string, competence: string) {
  const period = payrollPeriod(competence);
  if (period.start.getUTCFullYear() !== 2026) throw new Error("Este pacote usa tabelas de referência 2026; selecione competência de 2026.");
  const installed = await installDocumentaryPocParameters(connection, actorId);
  const entities = await withDatabaseTransaction(connection, async tx => {
    await lockPocBootstrap(tx, "RH:POC:DATASET:V1");
    const roles = [];
    for (const [i, name] of ["Agente administrativo", "Professor", "Auxiliar de enfermagem"].entries()) roles.push(await ensurePocRole(tx, { id: `rh-poc-role-v1-${i}`, name, description: `Atividades de ${name.toLowerCase()} no serviço municipal.`, isActive: true }));
    const employees = [];
    for (const [i, name] of ["Ana Carolina Ribeiro", "Bruno Henrique Cardoso", "Carla Beatriz Almeida"].entries()) {
      const cpf = sampleCpf(i + 1), id = `rh-poc-person-v1-${i}`;
      const collision = await findPocPersonByCpf(tx, cpf);
      if (collision && collision.id !== id) throw new Error("CPF sintético coincide com cadastro existente. Pacote não alterado.");
      const person = await ensurePocPerson(tx, { id, cpf, fullName: name, birthDate: new Date("1985-06-15"), status: "Ativo", nationality: "Brasileira" });
      const employeeId = `rh-poc-employee-v1-${i}`;
      const employee = await ensurePocEmployee(tx, { id: employeeId, personId: person.id, cpf: person.cpf, name: person.fullName, registration: `POC-${i + 1}`, roleId: roles[i].id, isActive: true });
      if (employee.personId !== person.id) throw new Error("Identidade demonstrativa alterada; confira o cadastro.");
      employees.push(employee);
    }
    const payrolls = [];
    for (const [i, type] of HR_PAYROLL_TYPES.entries()) {
      const id = `rh-poc-payroll-v1-${competence.replace("/", "-")}-${i}`;
      const payroll = await ensurePocPayroll(tx, { id, competence, type, status: "Aberta" });
      if (payroll.competence !== competence || payroll.type !== type) throw new Error("Folha POC existente teve sua identidade alterada.");
      payrolls.push(payroll);
    }
    return { roles, employees, payrolls };
  }, { timeoutMs: 60000 });
  const contracts = await withDatabaseTransaction(connection, async tx => {
  await lockPocBootstrap(tx, "RH:POC:CONTRACTS:V1");
  const rows = [];
  for (const [i, employee] of entities.employees.entries()) {
    const registration = `POC-V1-${i + 1}`;
    const previous = await findPocContract(tx, registration, employee.id);
    if (previous) {
      if (!previous.details || typeof previous.details !== "object" || Array.isArray(previous.details) || !previous.details.pocPackage || previous.regimeId !== installed.regimeId) throw new Error("Contrato POC existente exige conciliação de escopo/regime.");
      rows.push(previous);
    } else rows.push(await saveEmploymentContractInTransaction(tx, actorId, hrContractInputSchema.parse({ employeeId: employee.id, registration, regimeId: installed.regimeId, roleId: entities.roles[i].id, workLocation: ["Administração — POC", "Educação — POC", "Saúde — POC"][i], salaryLevel: ["H-01", "LP-01", "E-01"][i], admittedAt: "2020-01-01", appointedAt: "2020-01-01", swornAt: "2020-01-01", endsAt: "", monthlyHours: [200, 100, 200][i], salary: ["4400.00", "5000.00", "1621.00"][i], details: { pocPackage: RH_POC_CODE, salarySource: "Valores fictícios dos casos T11–T13; faixas e cargos inspirados nos IDs 089/090", pocBankAccount: { bank: ["001", "104", "756"][i], agency: "0001", account: `90000${i + 1}-0`, accountType: "CORRENTE", estimated: true } }, reason: RH_POC_REFERENCE })));
  }
  return rows;
  }, { timeoutMs: 60000 });
  return { ...installed, contractIds: contracts.map(contract => contract.id), payrollIds: entities.payrolls.map(payroll => payroll.id), competence };
}
