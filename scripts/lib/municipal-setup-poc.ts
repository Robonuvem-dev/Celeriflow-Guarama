import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseConnection } from '../../src/db/connection';
import { withDatabaseTransaction } from '../../src/db/transaction';
import { Decimal } from '../../src/db/decimal';
import * as p from '../../src/db/schema/municipal-setup-personnel';
import * as t from '../../src/db/schema/municipal-setup-tools';
import { hrEmploymentContracts } from '../../src/db/schema/personnel-workforce';
import { hrIntegrationEvents } from '../../src/db/schema/personnel-workforce';
import { HR_PAYROLL_TYPES, payrollPeriod } from '../../src/lib/rh/calculation-engine';
import { INCOME_TAX_2026_BANDS, INCOME_TAX_2026_REDUCTION } from '../../src/lib/rh/income-tax';
import { enqueueHrIntegration, hrContractInputSchema, saveEmploymentContractInTransaction } from '../../src/lib/rh/workforce-service';
import { payrollReferenceNames, payrollRuleReferenceNames } from '../../src/lib/rh/payroll-labels';
import { lockMunicipal, municipalJson as json, municipalObject, municipalRequired } from './municipal-setup-tools';

// Exclusive adoption of the original bootstrap's data, not a client adapter.
export const RH_POC_CODE = 'RH_POC_DOCUMENTAL_2026_V1';
export const RH_POC_REFERENCE = 'POC: mescla Ibema LC 025/2005 histórica, Campina do Simão Lei 21/2025 arts. 106/109, modelos PR/Paranaguá e catálogo 001–141. Estimativas autorizadas em 11/10/2026; substituir conforme RH_FOLHA_PARAMETROS_ESTIMADOS_POC.md.';

export async function installMunicipalPocParameters(connection: DatabaseConnection, actorId: string) {
  return withDatabaseTransaction(connection, async tx => {
    await lockMunicipal(tx, 'RH:POC:BOOTSTRAP:V1');
    let [instance] = await tx.select().from(p.instances).orderBy(asc(p.instances.createdAt)).limit(1);
    if (!instance) [instance] = await tx.insert(p.instances).values({ id: 'rh-poc-ibema-instance-v1', nomePrefeitura: 'Prefeitura Municipal de Aurora das Veredas', municipio: 'Aurora das Veredas', uf: 'MG', status: 'Ativa' }).returning();
    const effectiveFrom = new Date('2020-01-01T00:00:00Z');
    await tx.insert(p.ruleSets).values({ configuracaoInstanciaId: instance.id, code: RH_POC_CODE, name: 'Aurora das Veredas — parâmetros de pessoal e folha', status: 'ATIVA', scope: 'DEMONSTRACAO', isDemo: true, effectiveFrom, effectiveUntil: new Date('2030-12-31T23:59:59.999Z'), legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: [p.ruleSets.configuracaoInstanciaId, p.ruleSets.code, p.ruleSets.effectiveFrom] });
    const set = municipalRequired((await tx.select().from(p.ruleSets).where(and(eq(p.ruleSets.configuracaoInstanciaId, instance.id), eq(p.ruleSets.code, RH_POC_CODE), eq(p.ruleSets.effectiveFrom, effectiveFrom))).limit(1))[0], 'Conjunto POC');
    if (!set.isDemo || set.scope !== 'DEMONSTRACAO') throw new Error('Pacote POC existente foi convertido para outro escopo.');
    await tx.insert(p.policies).values({ ruleSetId: set.id, roundingMode: 'HALF_UP', roundingScale: 2, negativeNetPayPolicy: 'BLOQUEAR', maxConsignmentMarginRate: new Decimal('35'), freezeOnClose: true, legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: p.policies.ruleSetId });
    await tx.insert(p.schemes).values({ ruleSetId: set.id, code: 'RGPS_POC', name: 'Regime Geral de Previdência Social — referência 2026', regime: 'RGPS', employeeCalculationMethod: 'PROGRESSIVA', ceilingValue: new Decimal('8475.55'), employerContributionRate: new Decimal('22'), legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: [p.schemes.ruleSetId, p.schemes.code] });
    const scheme = municipalRequired((await tx.select({ id: p.schemes.id }).from(p.schemes).where(and(eq(p.schemes.ruleSetId, set.id), eq(p.schemes.code, 'RGPS_POC'))).limit(1))[0], 'Regime previdenciário');
    await tx.insert(p.bands).values([
      { sequence: 1, lowerLimit: '0', upperLimit: '1621.00', employeeRate: '7.5' },
      { sequence: 2, lowerLimit: '1621.00', upperLimit: '2902.84', employeeRate: '9' },
      { sequence: 3, lowerLimit: '2902.84', upperLimit: '4354.27', employeeRate: '12' },
      { sequence: 4, lowerLimit: '4354.27', upperLimit: null, employeeRate: '14' },
    ].map(band => ({ ...band, socialSecuritySchemeId: scheme.id, lowerLimit: new Decimal(band.lowerLimit), upperLimit: band.upperLimit === null ? null : new Decimal(band.upperLimit), employeeRate: new Decimal(band.employeeRate) }))).onConflictDoNothing();
    await tx.insert(p.vacationPolicies).values({ ruleSetId: set.id, code: 'FERIAS_MESCLA_POC', name: 'Férias anuais — aquisição e fracionamento', employmentNature: 'ESTATUTARIO', acquisitionMonths: 12, concessionMonths: 12, entitlementDays: 30, maxSplits: 3, minFirstSplitDays: 10, minOtherSplitDays: 10, additionalPayRate: new Decimal('33.333333'), allowsCashAbono: true, maxCashAbonoDays: 10, requiresApproval: true, legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: [p.vacationPolicies.ruleSetId, p.vacationPolicies.code] });
    const vacation = municipalRequired((await tx.select({ id: p.vacationPolicies.id }).from(p.vacationPolicies).where(and(eq(p.vacationPolicies.ruleSetId, set.id), eq(p.vacationPolicies.code, 'FERIAS_MESCLA_POC'))).limit(1))[0], 'Política de férias');
    const regimes = [];
    for (const [code, name, nature, category] of [['EFETIVO_POC', 'Efetivo', 'ESTATUTARIO', '301'], ['COMISSIONADO_POC', 'Comissionado', 'COMISSIONADO', '302'], ['TEMPORARIO_POC', 'Temporário', 'TEMPORARIO', '306']]) {
      await tx.insert(p.regimes).values({ ruleSetId: set.id, code, name, employmentNature: nature, esocialCategory: category, defaultMonthlyHours: 200, socialSecuritySchemeId: scheme.id, vacationPolicyId: vacation.id, legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: [p.regimes.ruleSetId, p.regimes.code] });
      regimes.push(municipalRequired((await tx.select().from(p.regimes).where(and(eq(p.regimes.ruleSetId, set.id), eq(p.regimes.code, code))).limit(1))[0], 'Regime POC'));
    }
    const definitions = [
      { code: 'VENCIMENTO', name: 'Vencimento', type: 'PROVENTO', method: 'FORMULA_CONTROLADA', formula: 'SALARIO_BASE * DIAS / 30', incidences: ['RGPS', 'IRRF'] },
      ...['ATS', 'EXTRA', 'VARIAVEL'].map(code => ({ code, name: code, type: 'PROVENTO', method: 'MANUAL', formula: null, incidences: ['RGPS', 'IRRF'] })),
      { code: 'CONSIGNADO', name: 'Parcela consignada', type: 'DESCONTO', method: 'MANUAL', formula: null, incidences: [] },
      ...['POC_COMPLEMENTO', 'POC_FERIAS', 'POC_TERCO', 'POC_DECIMO_13', 'POC_SALDO', 'POC_RRA'].map(code => ({ code, name: code.replaceAll('POC_', '').replaceAll('_', ' '), type: 'PROVENTO', method: 'MANUAL', formula: null, incidences: ['RGPS', 'IRRF'] })),
      ...['POC_ADIANTAMENTO', 'POC_ADIANTAMENTO_13', 'POC_FERIAS_IND', 'POC_TERCO_IND'].map(code => ({ code, name: code.replaceAll('POC_', '').replaceAll('_', ' '), type: 'PROVENTO', method: 'MANUAL', formula: null, incidences: [] })),
      { code: 'POC_ABATIMENTO', name: 'Abatimento de valores já adiantados', type: 'DESCONTO', method: 'MANUAL', formula: null, incidences: [] },
    ];
    const mapping: Record<string, string> = {};
    for (const [priority, definition] of definitions.entries()) {
      await tx.insert(p.rubrics).values({ ruleSetId: set.id, code: definition.code, name: payrollReferenceNames[definition.code] || definition.name, type: definition.type, calculationMethod: definition.method, formulaExpression: definition.formula, priority: priority + 10, legalReference: RH_POC_REFERENCE }).onConflictDoNothing({ target: [p.rubrics.ruleSetId, p.rubrics.code] });
      const rubric = municipalRequired((await tx.select({ id: p.rubrics.id }).from(p.rubrics).where(and(eq(p.rubrics.ruleSetId, set.id), eq(p.rubrics.code, definition.code))).limit(1))[0], 'Rubrica POC');
      if (definition.incidences.length) await tx.insert(p.incidences).values(definition.incidences.map(incidenceType => ({ rubricId: rubric.id, incidenceType, isIncluded: true }))).onConflictDoNothing();
      const code = `POC_V1_${definition.code}`;
      await tx.insert(p.payrollEvents).values({ code, name: payrollReferenceNames[definition.code] || definition.name, type: definition.type === 'DESCONTO' ? 'Desconto' : 'Vencimento', isActive: true }).onConflictDoNothing({ target: p.payrollEvents.code });
      mapping[definition.code] = municipalRequired((await tx.select({ id: p.payrollEvents.id }).from(p.payrollEvents).where(eq(p.payrollEvents.code, code)).limit(1))[0], 'Evento POC').id;
    }
    for (const code of ['PREVIDENCIA_RGPS_POC', 'IRRF']) {
      await tx.insert(p.payrollEvents).values({ code: `POC_V1_${code}`, name: payrollReferenceNames[code] || code, type: 'Desconto', isActive: true }).onConflictDoNothing({ target: p.payrollEvents.code });
      mapping[code] = municipalRequired((await tx.select({ id: p.payrollEvents.id }).from(p.payrollEvents).where(eq(p.payrollEvents.code, `POC_V1_${code}`)).limit(1))[0], 'Evento de desconto POC').id;
    }
    const rules = [
      { code: 'FOLHA_EVENTOS', value: mapping },
      { code: 'IRRF_FAIXAS', value: INCOME_TAX_2026_BANDS }, { code: 'IRRF_REDUCAO_MENSAL', value: INCOME_TAX_2026_REDUCTION },
      { code: 'IRRF_DEDUCAO_DEPENDENTE', value: '189.59' }, { code: 'IRRF_DEDUCAO_SIMPLIFICADA', value: '607.20' },
      { code: 'PREVIDENCIA_BASE_PATRONAL_RGPS_POC', value: 'SEM_TETO' },
      { code: 'FOLHAS_ESPECIAIS_POC', value: { origin: 'FOLHAS_ESPECIAIS_POC', legalReference: RH_POC_REFERENCE, estimated: true, version: 1 } },
      { code: 'RATEIO_MENSAL_CIVIL', value: { origin: 'RATEIO_MENSAL_CIVIL', divisor: 'DIAS_CIVIS_MES', manualMovements: 'VALOR_INTEGRAL_RATEADO', legalReference: 'POC: vencimento/fixos/fórmulas por proporção de dias civis do mês; movimentos informados são integrais e distribuídos entre vigências. Substituir divisor e critérios municipais.', estimated: true } },
      { code: 'DIARIAS_POC', value: { origin: 'DIARIAS_POC', rates: { DF: '540.53', CAPITAL: '405.39', INTERIOR: '337.83', INTERNACIONAL: '130.00' }, minimumDistanceKm: 70, rounding: 'DOWN', legalReference: 'Cartilha Diárias julho/2025, p. 2–8; demais servidores. Limites de horas e truncamento estimados para POC.', estimated: true } },
      { code: 'FALTAS_FERIAS_POC', value: { origin: 'FALTAS_FERIAS_POC', estimated: true, legalReference: 'Ibema art. 101 histórico + Campina do Simão Lei 21/2025 art. 109 p. 29. >=33 faltas é fechamento estimado da lacuna para POC.', attendanceStatuses: ['Falta'], bands: [{ minimumAbsences: 0, maximumAbsences: 5, days: 30 }, { minimumAbsences: 6, maximumAbsences: 14, days: 24 }, { minimumAbsences: 15, maximumAbsences: 23, days: 18 }, { minimumAbsences: 24, maximumAbsences: 32, days: 12 }, { minimumAbsences: 33, maximumAbsences: null, days: 0 }] } },
      { code: 'ATS', value: { origin: 'ATS', rubricCode: 'ATS', basis: 'SALARIO_TEMPORAL', tiers: Array.from({ length: 7 }, (_, i) => ({ minimumDays: i * 1825, minimumYears: i * 5, rate: String(i * 5) })), absences: [{ type: 'Licença sem vencimentos', counts: false }, { type: 'Licença médica', counts: true }], legalReference: RH_POC_REFERENCE } },
      { code: 'LICENCA_PREMIO', value: { origin: 'LICENCA_PREMIO', acquisitionDays: 1825, acquisitionYears: 5, entitlementDays: 90, minSplitDays: 15, maxSplits: 6, allowsCash: true, maxCashDays: 45, absences: [{ type: 'Licença sem vencimentos', effect: 'SUSPENDER' }, { type: 'Licença médica', effect: 'CONTAR' }, { type: 'Suspensão disciplinar', effect: 'REINICIAR' }], legalReference: RH_POC_REFERENCE } },
      { code: 'HORAS_EXTRAS_PONTO', value: { origin: 'HORAS_EXTRAS_PONTO', rubricCode: 'EXTRA', additionalRate: '50', legalReference: RH_POC_REFERENCE } },
      { code: 'BANCO_HORAS_PONTO', value: { origin: 'BANCO_HORAS_PONTO', maxBalanceHours: '120', maxCreditPerDayHours: '2', maxDebitPerDayHours: '8', allowedStatuses: ['Presente'], forbidPaidOvertimeForCredit: true, legalReference: RH_POC_REFERENCE } },
      { code: 'PROVISOES_FOLHA', value: { origin: 'PROVISOES_FOLHA', legalReference: RH_POC_REFERENCE, components: [{ kind: 'PROVISAO_FERIAS', rubricCodes: ['VENCIMENTO', 'ATS'], rate: '11.11111111', employerRate: '22' }, { kind: 'PROVISAO_13', rubricCodes: ['VENCIMENTO', 'ATS'], rate: '8.33333333', employerRate: '22' }, { kind: 'PROVISAO_LICENCA', rubricCodes: ['VENCIMENTO', 'ATS'], rate: '5', employerRate: '22' }] } },
      { code: 'MARGEM_CONSIGNAVEL', value: { origin: 'MARGEM_CONSIGNAVEL', remunerationRubricCodes: ['VENCIMENTO', 'ATS', 'EXTRA', 'VARIAVEL'], compulsoryDeductionRubricCodes: ['PREVIDENCIA_RGPS_POC', 'IRRF'], consignmentRubricCodes: ['CONSIGNADO'], legalReference: RH_POC_REFERENCE } },
      { code: 'MENSAGENS_RECIBO', value: { origin: 'MENSAGENS_RECIBO', messages: [{ id: 'POC_V1', text: 'DEMONSTRAÇÃO POC — parâmetros documentais e estimados. Consulte o registro de substituição antes da implantação.', startsAt: '2020-01-01', endsAt: null, contractIds: [], regimeIds: [], payrollTypes: [] }] } },
      { code: 'POC_FONTES_E_ESTIMATIVAS', value: { version: 1, reference: RH_POC_REFERENCE, sourceIds: [13, 39, 45, 58, 60, 88, 89, 90, 100, 105, 111, 128, 137], conventionModels: ['REMESSA_SALARIAL_CSV_POC', 'CONSIGNACAO_CSV_POC', 'DIARIAS_SOLICITACAO_POC'], bankCodesForExamples: ['001', '104', '237', '341', '756'] } },
    ];
    for (const rule of rules) await tx.insert(p.rules).values({ ruleSetId: set.id, code: rule.code, name: payrollRuleReferenceNames[rule.code] || rule.code, category: 'CALCULO', valueType: 'JSON', value: json(rule.value), legalReference: RH_POC_REFERENCE, isActive: true }).onConflictDoNothing({ target: [p.rules.ruleSetId, p.rules.code] });
    const sourceKey = `POC:PARAMETROS:${set.id}`;
    if (!(await tx.select({ id: hrIntegrationEvents.id }).from(hrIntegrationEvents).where(eq(hrIntegrationEvents.sourceKey, sourceKey)).limit(1)).length) await enqueueHrIntegration(tx, { sourceKey, domain: 'AUDITORIA', environment: 'DEMONSTRACAO', eventType: 'PARAMETROS_POC_INSTALADOS', payload: { ruleSetId: set.id, version: 1, reference: RH_POC_REFERENCE, actorId } });
    return { ruleSetId: set.id, regimeId: regimes[0].id, regimeIds: regimes.map(regime => regime.id), scope: set.scope };
  }, { timeoutMs: 60000 });
}

function sampleCpf(index: number) {
  const digits = `993771${String(index).padStart(3, '0')}`.split('').map(Number);
  for (const length of [9, 10]) {
    const remainder = digits.slice(0, length).reduce((sum, digit, i) => sum + digit * (length + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join('');
}

export async function prepareMunicipalPocDataset(connection: DatabaseConnection, actorId: string, competence: string) {
  const period = payrollPeriod(competence);
  if (period.start.getUTCFullYear() !== 2026) throw new Error('Este pacote usa tabelas de referência 2026; selecione competência de 2026.');
  const installed = await installMunicipalPocParameters(connection, actorId);
  const entities = await withDatabaseTransaction(connection, async tx => {
    await lockMunicipal(tx, 'RH:POC:DATASET:V1');
    const roles = [];
    for (const [i, name] of ['Agente administrativo', 'Professor', 'Auxiliar de enfermagem'].entries()) {
      const id = `rh-poc-role-v1-${i}`;
      await tx.insert(t.roles).values({ id, name, description: `Atividades de ${name.toLowerCase()} no serviço municipal.`, isActive: true }).onConflictDoNothing({ target: t.roles.id });
      roles.push(municipalRequired((await tx.select().from(t.roles).where(eq(t.roles.id, id)).limit(1))[0], 'Cargo POC'));
    }
    const employees = [];
    for (const [i, name] of ['Ana Carolina Ribeiro', 'Bruno Henrique Cardoso', 'Carla Beatriz Almeida'].entries()) {
      const cpf = sampleCpf(i + 1), id = `rh-poc-person-v1-${i}`;
      const [collision] = await tx.select({ id: t.people.id }).from(t.people).where(eq(t.people.cpf, cpf)).limit(1);
      if (collision && collision.id !== id) throw new Error('CPF sintético coincide com cadastro existente. Pacote não alterado.');
      await tx.insert(t.people).values({ id, cpf, fullName: name, birthDate: new Date('1985-06-15'), status: 'Ativo', nationality: 'Brasileira' }).onConflictDoNothing({ target: t.people.id });
      const person = municipalRequired((await tx.select().from(t.people).where(eq(t.people.id, id)).limit(1))[0], 'Pessoa POC');
      const employeeId = `rh-poc-employee-v1-${i}`;
      await tx.insert(t.employees).values({ id: employeeId, personId: person.id, cpf: person.cpf, name: person.fullName, registration: `POC-${i + 1}`, roleId: roles[i].id, isActive: true }).onConflictDoNothing({ target: t.employees.id });
      const employee = municipalRequired((await tx.select().from(t.employees).where(eq(t.employees.id, employeeId)).limit(1))[0], 'Servidor POC');
      if (employee.personId !== person.id) throw new Error('Identidade demonstrativa alterada; confira o cadastro.');
      employees.push(employee);
    }
    const payrolls = [];
    for (const [i, type] of HR_PAYROLL_TYPES.entries()) {
      const id = `rh-poc-payroll-v1-${competence.replace('/', '-')}-${i}`;
      await tx.insert(t.payrolls).values({ id, competence, type, status: 'Aberta' }).onConflictDoNothing({ target: t.payrolls.id });
      const payroll = municipalRequired((await tx.select().from(t.payrolls).where(eq(t.payrolls.id, id)).limit(1))[0], 'Folha POC');
      if (payroll.competence !== competence || payroll.type !== type) throw new Error('Folha POC existente teve sua identidade alterada.');
      payrolls.push(payroll);
    }
    return { roles, employees, payrolls };
  }, { timeoutMs: 60000 });
  const contracts = await withDatabaseTransaction(connection, async tx => {
    await lockMunicipal(tx, 'RH:POC:CONTRACTS:V1');
    const rows = [];
    for (const [i, employee] of entities.employees.entries()) {
      const registration = `POC-V1-${i + 1}`;
      const [previous] = await tx.select().from(hrEmploymentContracts).where(and(eq(hrEmploymentContracts.registration, registration), eq(hrEmploymentContracts.employeeId, employee.id))).limit(1);
      if (previous) {
        if (!municipalObject(previous.details).pocPackage || previous.regimeId !== installed.regimeId) throw new Error('Contrato POC existente exige conciliação de escopo/regime.');
        rows.push(previous);
      } else rows.push(await saveEmploymentContractInTransaction(tx, actorId, hrContractInputSchema.parse({ employeeId: employee.id, registration, regimeId: installed.regimeId, roleId: entities.roles[i].id, workLocation: ['Administração — POC', 'Educação — POC', 'Saúde — POC'][i], salaryLevel: ['H-01', 'LP-01', 'E-01'][i], admittedAt: '2020-01-01', appointedAt: '2020-01-01', swornAt: '2020-01-01', endsAt: '', monthlyHours: [200, 100, 200][i], salary: ['4400.00', '5000.00', '1621.00'][i], details: { pocPackage: RH_POC_CODE, salarySource: 'Valores fictícios dos casos T11–T13; faixas e cargos inspirados nos IDs 089/090', pocBankAccount: { bank: ['001', '104', '756'][i], agency: '0001', account: `90000${i + 1}-0`, accountType: 'CORRENTE', estimated: true } }, reason: RH_POC_REFERENCE })));
    }
    return rows;
  }, { timeoutMs: 60000 });
  return { ...installed, contractIds: contracts.map(contract => contract.id), payrollIds: entities.payrolls.map(payroll => payroll.id), competence };
}
