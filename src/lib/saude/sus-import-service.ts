import "server-only";

import { and, desc, eq, isNull, ne, notInArray, or } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { healthUnits, healthTeams, healthProfessionals, healthProfessionalAssignments } from "@/db/schema/health-workforce";
import { healthHabilitations, healthRegistrationStatusHistory, healthSpecialties, healthServices } from "@/db/schema/health-administration";
import { healthSusProcedures, healthSusReferences, healthSusProcedureReferences } from "@/db/schema/health-catalogs";
import { healthCbos } from "@/db/schema/master-data";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { patients } from "@/db/schema/health-registration";
import { healthAppointments } from "@/db/schema/health-agenda";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import {
  healthSusRecordHas,
  healthSusRecordValue,
  normalizeHealthSusEntity,
  type HealthSusRecord,
  type HealthSusSource,
} from "@/lib/saude/sus-import-contract";

type Transaction = DatabaseTransaction;
type Outcome = "inserted" | "updated" | "ignored";
type Issue = { rowNumber: number; entityType: string; reason: string };

function text(record: HealthSusRecord, ...keys: string[]) {
  return healthSusRecordValue(record, ...keys);
}

function has(record: HealthSusRecord, ...keys: string[]) {
  return healthSusRecordHas(record, ...keys);
}

function nullable(value: string) {
  return value || null;
}

function active(value: string) {
  return !["0", "false", "inativo", "nao", "não"].includes(value.trim().toLowerCase());
}

function integer(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function money(value: string) {
  if (!value) return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? normalized : null;
}

function codes(value: string) {
  return [...new Set(value.split(/[;,|]/).map(item => item.trim()).filter(Boolean))];
}

function date(value: string) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)?.slice(1).reverse().join("-");
  if (!iso) return null;
  const parsed = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function issue(record: HealthSusRecord, entityType: string, reason: string): Issue {
  return { rowNumber: record.rowNumber, entityType, reason };
}

async function unitByCnes(tx: Transaction, cnes: string) {
  if (!cnes) return null;
  const [unit] = await tx.select({ id: healthUnits.id }).from(healthUnits).where(eq(healthUnits.cnes, cnes)).limit(1);
  return unit ?? null;
}

async function processUnit(tx: Transaction, record: HealthSusRecord): Promise<Outcome | Issue> {
  const cnes = text(record, "cnes", "codigo_cnes", "codigo");
  const name = text(record, "nome", "descricao");
  if (!cnes || !name) return issue(record, "UNIDADE", "Informe CNES e nome da unidade.");
  const [existing] = await tx.select({ id: healthUnits.id, isActive: healthUnits.isActive }).from(healthUnits).where(eq(healthUnits.cnes, cnes)).limit(1);
  const hasStatus = has(record, "ativo", "situacao");
  const nextActive = hasStatus ? active(text(record, "ativo", "situacao")) : existing?.isActive ?? true;
  const reason = nullable(text(record, "motivo_inativacao", "motivo"));
  if (!nextActive && (!existing || existing.isActive) && !reason) return issue(record, "UNIDADE", "Informe o motivo da inativação da unidade.");
  const type = text(record, "tipo_unidade", "classificacao", "categoria");
  const [created] = await tx.insert(healthUnits).values({ cnes, name, type: type || "Unidade de Saúde", phone: nullable(text(record, "telefone", "phone")), email: nullable(text(record, "email")), isActive: nextActive, inactivatedAt: nextActive ? null : new Date(), inactivationReason: nextActive ? null : reason }).onConflictDoUpdate({
    target: healthUnits.cnes,
    set: {
      name,
      ...(type ? { type } : {}),
      ...(has(record, "telefone", "phone") ? { phone: nullable(text(record, "telefone", "phone")) } : {}),
      ...(has(record, "email") ? { email: nullable(text(record, "email")) } : {}),
      ...(hasStatus ? { isActive: nextActive, inactivatedAt: nextActive ? null : new Date(), inactivationReason: nextActive ? null : reason } : {}),
    },
  }).returning({ id: healthUnits.id });
  if (existing && existing.isActive !== nextActive) await tx.insert(healthRegistrationStatusHistory).values({ unitId: created.id, isActive: nextActive, reason });
  return existing ? "updated" : "inserted";
}

async function processTeam(tx: Transaction, record: HealthSusRecord): Promise<Outcome | Issue> {
  const code = text(record, "codigo", "codigo_equipe");
  const name = text(record, "nome", "nome_equipe");
  const unit = await unitByCnes(tx, text(record, "unidade_cnes", "cnes_unidade", "cnes"));
  if (!code || !name || !unit) return issue(record, "EQUIPE", "Informe código, nome e um CNES de unidade já cadastrado.");
  const [existing] = await tx.select({ id: healthTeams.id, isActive: healthTeams.isActive }).from(healthTeams).where(eq(healthTeams.code, code)).limit(1);
  const isActive = has(record, "ativo", "situacao") ? active(text(record, "ativo", "situacao")) : existing?.isActive ?? true;
  await tx.insert(healthTeams).values({ code, name, unitId: unit.id, microarea: nullable(text(record, "microarea")), isActive }).onConflictDoUpdate({ target: healthTeams.code, set: { name, unitId: unit.id, ...(has(record, "microarea") ? { microarea: nullable(text(record, "microarea")) } : {}), ...(has(record, "ativo", "situacao") ? { isActive } : {}) } });
  return existing ? "updated" : "inserted";
}

async function processHabilitation(tx: Transaction, record: HealthSusRecord): Promise<Outcome | Issue> {
  const code = text(record, "codigo", "codigo_habilitacao");
  const description = text(record, "descricao", "nome");
  const unit = await unitByCnes(tx, text(record, "unidade_cnes", "cnes_unidade", "cnes"));
  const professionalCpfValue = text(record, "profissional_cpf", "cpf_profissional");
  let professional: { id: string } | null = null;
  if (professionalCpfValue) {
    let cpf: string;
    try {
      cpf = requireValidCpf(professionalCpfValue);
    } catch {
      return issue(record, "HABILITACAO", "O CPF do profissional deve ser válido.");
    }
    const [found] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(people, eq(people.id, employees.personId)).where(or(eq(employees.cpf, cpf), eq(people.cpf, cpf))).limit(1);
    professional = found ?? null;
  }
  if (!code || !description || (!unit && !professional)) return issue(record, "HABILITACAO", "Informe código, descrição e uma unidade ou profissional já cadastrado.");
  if (unit && professional) return issue(record, "HABILITACAO", "Vincule a habilitação a uma unidade ou a um profissional, não aos dois.");
  const target = unit ? { unitId: unit.id } : { professionalId: professional!.id };
  const [existing] = await tx.select({ id: healthHabilitations.id, isActive: healthHabilitations.isActive }).from(healthHabilitations).where(and(eq(healthHabilitations.code, code), unit ? eq(healthHabilitations.unitId, unit.id) : eq(healthHabilitations.professionalId, professional!.id))).limit(1);
  const isActive = has(record, "ativo", "situacao") ? active(text(record, "ativo", "situacao")) : existing?.isActive ?? true;
  if (existing) {
    await tx.update(healthHabilitations).set({ description, ...(has(record, "ativo", "situacao") ? { isActive } : {}) }).where(eq(healthHabilitations.id, existing.id));
    return "updated";
  }
  await tx.insert(healthHabilitations).values({ code, description, ...target, isActive });
  return "inserted";
}

async function processProfessional(tx: Transaction, record: HealthSusRecord): Promise<Outcome | Issue> {
  let cpf: string;
  try {
    cpf = requireValidCpf(text(record, "cpf"));
  } catch {
    return issue(record, "PROFISSIONAL", "O CPF do profissional é obrigatório e deve ser válido.");
  }
  const [employee] = await tx.select({ id: employees.id, isActive: employees.isActive }).from(employees).leftJoin(people, eq(people.id, employees.personId)).where(or(eq(employees.cpf, cpf), eq(people.cpf, cpf))).limit(1);
  if (!employee) return issue(record, "PROFISSIONAL", "Não existe servidor vinculado ao CPF informado.");
  const unitCnes = text(record, "unidade_cnes", "cnes_unidade", "cnes");
  const unit = await unitByCnes(tx, unitCnes);
  if (unitCnes && !unit) return issue(record, "PROFISSIONAL", "A unidade informada não está cadastrada.");
  const teamCode = text(record, "equipe_codigo", "codigo_equipe");
  const team = teamCode ? (await tx.select({ id: healthTeams.id, unitId: healthTeams.unitId }).from(healthTeams).where(eq(healthTeams.code, teamCode)).limit(1))[0] : null;
  if (teamCode && !team) return issue(record, "PROFISSIONAL", "A equipe informada não está cadastrada.");
  if (team && unit && team.unitId !== unit.id) return issue(record, "PROFISSIONAL", "A equipe não pertence à unidade informada.");
  const cbo = text(record, "cbo", "codigo_cbo");
  if (cbo) await tx.insert(healthCbos).values({ code: cbo, description: text(record, "descricao_cbo") || cbo }).onConflictDoUpdate({ target: healthCbos.code, set: { isActive: true } });
  const specialtyCode = text(record, "especialidade_codigo", "codigo_especialidade");
  const specialtyName = text(record, "especialidade", "nome_especialidade");
  const conflictingSpecialty = specialtyCode && specialtyName
    ? (await tx.select({ id: healthSpecialties.id }).from(healthSpecialties).where(and(eq(healthSpecialties.name, specialtyName), ne(healthSpecialties.code, specialtyCode))).limit(1))[0]
    : null;
  if (conflictingSpecialty) return issue(record, "PROFISSIONAL", "A especialidade informada já está associada a outro código.");
  const weeklyHoursText = text(record, "carga_horaria", "horas_semanais");
  const weeklyHours = integer(weeklyHoursText);
  if (weeklyHoursText && (weeklyHours === null || weeklyHours > 168)) return issue(record, "PROFISSIONAL", "A carga horária deve ser um número inteiro entre 0 e 168.");
  const specialty = specialtyCode && specialtyName ? (await tx.insert(healthSpecialties).values({ code: specialtyCode, name: specialtyName }).onConflictDoUpdate({ target: healthSpecialties.code, set: { name: specialtyName, isActive: true } }).returning({ id: healthSpecialties.id }))[0] : null;
  const [existing] = await tx.select({ id: healthProfessionals.id, isActive: healthProfessionals.isActive }).from(healthProfessionals).where(eq(healthProfessionals.employeeId, employee.id)).limit(1);
  const hasStatus = has(record, "ativo", "situacao");
  const nextActive = hasStatus ? active(text(record, "ativo", "situacao")) : existing?.isActive ?? true;
  const reason = nullable(text(record, "motivo_inativacao", "motivo"));
  if (nextActive && !employee.isActive) return issue(record, "PROFISSIONAL", "O servidor vinculado deve estar ativo para ativar o profissional.");
  if (!nextActive && (!existing || existing.isActive) && !reason) return issue(record, "PROFISSIONAL", "Informe o motivo da inativação do profissional.");
  if (existing?.isActive && !nextActive) {
    const [pendingAppointment] = await tx.select({ id: healthAppointments.id }).from(healthAppointments).where(and(eq(healthAppointments.professionalId, existing.id), notInArray(healthAppointments.status, ["Atendido", "Faltou", "Cancelado"]))).limit(1);
    if (pendingAppointment) return issue(record, "PROFISSIONAL", "O profissional possui agendamentos pendentes e não pode ser inativado.");
  }
  const professionalData = {
      ...(has(record, "cns") ? { cns: nullable(text(record, "cns")) } : {}),
      ...(has(record, "cbo", "codigo_cbo") ? { cbo: nullable(cbo) } : {}),
      ...(has(record, "especialidade", "nome_especialidade") ? { specialty: nullable(specialtyName) } : {}),
      ...(has(record, "unidade_cnes", "cnes_unidade", "cnes") ? { unitId: unit?.id || null } : {}),
      ...(has(record, "equipe_codigo", "codigo_equipe") ? { teamId: team?.id || null } : {}),
      ...(hasStatus ? { isActive: nextActive, inactivatedAt: nextActive ? null : new Date(), inactivationReason: nextActive ? null : reason } : {}),
  };
  const inserted = tx.insert(healthProfessionals).values({ employeeId: employee.id, cns: nullable(text(record, "cns")), cbo: nullable(cbo), specialty: nullable(specialtyName), unitId: unit?.id || null, teamId: team?.id || null, isActive: nextActive, inactivatedAt: nextActive ? null : new Date(), inactivationReason: nextActive ? null : reason });
  const [saved] = Object.keys(professionalData).length ? await inserted.onConflictDoUpdate({ target: healthProfessionals.employeeId, set: professionalData }).returning({ id: healthProfessionals.id }) : await inserted.onConflictDoNothing({ target: healthProfessionals.employeeId }).returning({ id: healthProfessionals.id });
  const professional = saved ?? (await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(eq(healthProfessionals.employeeId, employee.id)).limit(1))[0];
  if (!professional) throw new Error("Profissional não encontrado após importação.");
  if (existing && existing.isActive !== nextActive) await tx.insert(healthRegistrationStatusHistory).values({ professionalId: professional.id, isActive: nextActive, reason });
  if (unit) {
    const [assignment] = await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.unitId, unit.id), specialty ? eq(healthProfessionalAssignments.specialtyId, specialty.id) : isNull(healthProfessionalAssignments.specialtyId))).limit(1);
    const assignmentData = { weeklyHours: weeklyHours || 0, isActive: nextActive };
    if (assignment) await tx.update(healthProfessionalAssignments).set(assignmentData).where(eq(healthProfessionalAssignments.id, assignment.id));
    else await tx.insert(healthProfessionalAssignments).values({ professionalId: professional.id, unitId: unit.id, specialtyId: specialty?.id || null, ...assignmentData });
  }
  return existing ? "updated" : "inserted";
}

async function processPatient(tx: Transaction, record: HealthSusRecord): Promise<Outcome | Issue> {
  let cpf: string;
  try {
    cpf = requireValidCpf(text(record, "cpf"));
  } catch {
    return issue(record, "PACIENTE", "O CPF do paciente é obrigatório e deve ser válido.");
  }
  const fullName = text(record, "nome", "nome_completo");
  if (!fullName) return issue(record, "PACIENTE", "Informe o nome completo do paciente.");
  const birthValue = text(record, "nascimento", "data_nascimento");
  const birthDate = date(birthValue);
  if (birthValue && !birthDate) return issue(record, "PACIENTE", "A data de nascimento deve usar AAAA-MM-DD ou DD/MM/AAAA.");
  const unitCnes = text(record, "unidade_cnes", "cnes_unidade", "cnes");
  const unit = await unitByCnes(tx, unitCnes);
  if (unitCnes && !unit) return issue(record, "PACIENTE", "A unidade de referência informada não está cadastrada.");
  const teamCode = text(record, "equipe_codigo", "codigo_equipe");
  const team = teamCode ? (await tx.select({ id: healthTeams.id, unitId: healthTeams.unitId }).from(healthTeams).where(eq(healthTeams.code, teamCode)).limit(1))[0] : null;
  if (teamCode && !team) return issue(record, "PACIENTE", "A equipe informada não está cadastrada.");
  if (team && (!unit || team.unitId !== unit.id)) return issue(record, "PACIENTE", "A equipe deve pertencer à unidade de referência informada.");
  const [existingPerson] = await tx.select({ id: people.id }).from(people).where(eq(people.cpf, cpf)).limit(1);
  const cns = nullable(text(record, "cns"));
  if (cns) {
    const [cnsOwner] = await tx.select({ personId: patients.personId }).from(patients).where(eq(patients.cns, cns)).limit(1);
    if (cnsOwner && cnsOwner.personId !== existingPerson?.id) return issue(record, "PACIENTE", "O CNS já está associado a outra pessoa.");
  }
  const [person] = await tx.insert(people).values({ cpf, fullName, birthDate, gender: nullable(text(record, "sexo", "genero")), motherName: nullable(text(record, "mae", "nome_mae")) }).onConflictDoUpdate({
    target: people.cpf,
    set: {
      fullName,
      ...(has(record, "nascimento", "data_nascimento") ? { birthDate } : {}),
      ...(has(record, "sexo", "genero") ? { gender: nullable(text(record, "sexo", "genero")) } : {}),
      ...(has(record, "mae", "nome_mae") ? { motherName: nullable(text(record, "mae", "nome_mae")) } : {}),
    },
  }).returning({ id: people.id });
  const [existing] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.personId, person.id)).limit(1);
  const status = active(text(record, "ativo", "situacao")) ? "Ativo" : "Inativo";
  const patientData = {
      ...(has(record, "cns") ? { cns } : {}),
      ...(has(record, "unidade_cnes", "cnes_unidade", "cnes") ? { referenceUnitId: unit?.id || null } : {}),
      ...(has(record, "equipe_codigo", "codigo_equipe") ? { teamId: team?.id || null } : {}),
      ...(has(record, "ativo", "situacao") ? { status } : {}),
  };
  const patientInsert = tx.insert(patients).values({ personId: person.id, cns, referenceUnitId: unit?.id || null, teamId: team?.id || null, status });
  if (Object.keys(patientData).length) await patientInsert.onConflictDoUpdate({ target: patients.personId, set: patientData });
  else await patientInsert.onConflictDoNothing({ target: patients.personId });
  return existing ? "updated" : "inserted";
}

async function processProcedure(tx: Transaction, source: HealthSusSource, competence: string, batchId: string, record: HealthSusRecord): Promise<Outcome | Issue> {
  const code = text(record, "codigo", "codigo_procedimento", "procedimento");
  const description = text(record, "descricao", "nome");
  if (!code || !description) return issue(record, "PROCEDIMENTO", "Informe código e descrição do procedimento.");
  const unitValueText = text(record, "valor_unitario", "valor");
  const unitValue = money(unitValueText);
  if (unitValueText && unitValue === null) return issue(record, "PROCEDIMENTO", "O valor unitário deve ser numérico e ter no máximo duas casas decimais.");
  const minimumAgeText = text(record, "idade_minima");
  const maximumAgeText = text(record, "idade_maxima");
  const minimumAge = integer(minimumAgeText);
  const maximumAge = integer(maximumAgeText);
  if ((minimumAgeText && minimumAge === null) || (maximumAgeText && maximumAge === null)) return issue(record, "PROCEDIMENTO", "As idades permitidas devem ser números inteiros positivos.");
  if (minimumAge !== null && maximumAge !== null && minimumAge > maximumAge) return issue(record, "PROCEDIMENTO", "A idade mínima não pode ser maior que a idade máxima.");
  const [priorRow] = await tx.select().from(healthSusProcedures).where(and(eq(healthSusProcedures.source, source), eq(healthSusProcedures.competence, competence), eq(healthSusProcedures.code, code), eq(healthSusProcedures.isCurrent, true))).orderBy(desc(healthSusProcedures.createdAt)).limit(1);
  const prior = priorRow ? { ...priorRow, referenceLinks: await tx.select({ referenceId: healthSusProcedureReferences.referenceId, relationType: healthSusProcedureReferences.relationType }).from(healthSusProcedureReferences).where(eq(healthSusProcedureReferences.procedureId, priorRow.id)) } : null;
  const links: { referenceId: string; relationType: string }[] = [];
  for (const [fieldKeys, kind] of [
    [["cids", "codigos_cid"], "CID"],
    [["cbos", "codigos_cbo"], "CBO"],
    [["servicos", "codigos_servico"], "SERVICO"],
    [["classificacoes", "codigos_classificacao"], "CLASSIFICACAO"],
  ] as const) {
    if (!has(record, ...fieldKeys)) {
      links.push(...(prior?.referenceLinks.filter(link => link.relationType === kind) || []));
      continue;
    }
    for (const referenceCode of codes(text(record, ...fieldKeys))) {
      const [reference] = await tx.select({ id: healthSusReferences.id }).from(healthSusReferences).where(and(eq(healthSusReferences.source, source), eq(healthSusReferences.competence, competence), eq(healthSusReferences.kind, kind), eq(healthSusReferences.code, referenceCode), eq(healthSusReferences.isCurrent, true))).limit(1);
      if (!reference) return issue(record, "PROCEDIMENTO", `A referência ${kind} informada não existe na competência da carga.`);
      links.push({ referenceId: reference.id, relationType: kind });
    }
  }
  const data = {
    description,
    groupCode: has(record, "grupo_codigo", "codigo_grupo") ? nullable(text(record, "grupo_codigo", "codigo_grupo")) : prior?.groupCode || null,
    groupName: has(record, "grupo", "nome_grupo") ? nullable(text(record, "grupo", "nome_grupo")) : prior?.groupName || null,
    subgroupCode: has(record, "subgrupo_codigo", "codigo_subgrupo") ? nullable(text(record, "subgrupo_codigo", "codigo_subgrupo")) : prior?.subgroupCode || null,
    subgroupName: has(record, "subgrupo", "nome_subgrupo") ? nullable(text(record, "subgrupo", "nome_subgrupo")) : prior?.subgroupName || null,
    complexity: has(record, "complexidade") ? nullable(text(record, "complexidade")) : prior?.complexity || null,
    registrationInstrument: has(record, "instrumento_registro", "instrumento") ? nullable(text(record, "instrumento_registro", "instrumento")) : prior?.registrationInstrument || null,
    unitValue: has(record, "valor_unitario", "valor") ? unitValue === null ? null : new Decimal(unitValue) : prior?.unitValue || null,
    minimumAge: has(record, "idade_minima") ? minimumAge : prior?.minimumAge || null,
    maximumAge: has(record, "idade_maxima") ? maximumAge : prior?.maximumAge || null,
    allowedSex: has(record, "sexo_permitido", "sexo") ? nullable(text(record, "sexo_permitido", "sexo")) : prior?.allowedSex || null,
    financing: has(record, "financiamento") ? nullable(text(record, "financiamento")) : prior?.financing || null,
    cidCodes: has(record, "cids", "codigos_cid") ? nullable(text(record, "cids", "codigos_cid")) : prior?.cidCodes || null,
    cboCodes: has(record, "cbos", "codigos_cbo") ? nullable(text(record, "cbos", "codigos_cbo")) : prior?.cboCodes || null,
    serviceCodes: has(record, "servicos", "codigos_servico") ? nullable(text(record, "servicos", "codigos_servico")) : prior?.serviceCodes || null,
    classificationCodes: has(record, "classificacoes", "codigos_classificacao") ? nullable(text(record, "classificacoes", "codigos_classificacao")) : prior?.classificationCodes || null,
    isActive: has(record, "ativo", "situacao") ? active(text(record, "ativo", "situacao")) : prior?.isActive ?? true,
    isCurrent: true,
  };
  await tx.update(healthSusProcedures).set({ isCurrent: false }).where(and(eq(healthSusProcedures.source, source), eq(healthSusProcedures.competence, competence), eq(healthSusProcedures.code, code), eq(healthSusProcedures.isCurrent, true), ne(healthSusProcedures.sourceBatchId, batchId)));
  const [procedure] = await tx.insert(healthSusProcedures).values({ source, competence, code, sourceBatchId: batchId, ...data }).onConflictDoUpdate({ target: [healthSusProcedures.sourceBatchId, healthSusProcedures.code], set: data }).returning({ id: healthSusProcedures.id });
  await tx.delete(healthSusProcedureReferences).where(eq(healthSusProcedureReferences.procedureId, procedure.id));
  if (links.length) await tx.insert(healthSusProcedureReferences).values(links.map(link => ({ ...link, procedureId: procedure.id })));
  return prior ? "updated" : "inserted";
}

async function processReference(tx: Transaction, source: HealthSusSource, competence: string, batchId: string, kind: string, record: HealthSusRecord): Promise<Outcome | Issue> {
  const code = text(record, "codigo", `codigo_${kind}`);
  const description = text(record, "descricao", "nome", `nome_${kind}`);
  if (!code || !description) return issue(record, kind.toUpperCase(), "Informe código e descrição da referência.");
  const normalizedKind = kind.toUpperCase();
  const [existing] = await tx.select({ id: healthSusReferences.id, classification: healthSusReferences.classification, isActive: healthSusReferences.isActive }).from(healthSusReferences).where(and(eq(healthSusReferences.source, source), eq(healthSusReferences.competence, competence), eq(healthSusReferences.kind, normalizedKind), eq(healthSusReferences.code, code), eq(healthSusReferences.isCurrent, true))).limit(1);
  const isActive = has(record, "ativo", "situacao") ? active(text(record, "ativo", "situacao")) : existing?.isActive ?? true;
  const classification = has(record, "classificacao") ? nullable(text(record, "classificacao")) : existing?.classification || null;
  if (kind === "especialidade") {
    const [conflict] = await tx.select({ id: healthSpecialties.id }).from(healthSpecialties).where(and(eq(healthSpecialties.name, description), ne(healthSpecialties.code, code))).limit(1);
    if (conflict) return issue(record, "ESPECIALIDADE", "A descrição da especialidade já está associada a outro código.");
  }
  await tx.update(healthSusReferences).set({ isCurrent: false }).where(and(eq(healthSusReferences.source, source), eq(healthSusReferences.competence, competence), eq(healthSusReferences.kind, normalizedKind), eq(healthSusReferences.code, code), eq(healthSusReferences.isCurrent, true), ne(healthSusReferences.sourceBatchId, batchId)));
  await tx.insert(healthSusReferences).values({ source, competence, kind: normalizedKind, code, description, classification, isActive, isCurrent: true, sourceBatchId: batchId }).onConflictDoUpdate({ target: [healthSusReferences.sourceBatchId, healthSusReferences.kind, healthSusReferences.code], set: { description, classification, isActive, isCurrent: true } });
  if (kind === "cbo") await tx.insert(healthCbos).values({ code, description, isActive }).onConflictDoUpdate({ target: healthCbos.code, set: { description, isActive } });
  if (kind === "especialidade") await tx.insert(healthSpecialties).values({ code, name: description, isActive }).onConflictDoUpdate({ target: healthSpecialties.code, set: { name: description, isActive } });
  if (kind === "servico") await tx.insert(healthServices).values({ code, name: description, classification, isActive }).onConflictDoUpdate({ target: healthServices.code, set: { name: description, classification, isActive } });
  return existing ? "updated" : "inserted";
}

export async function processHealthSusRecords(tx: Transaction, input: { source: HealthSusSource; competence: string; batchId: string; records: HealthSusRecord[] }) {
  const counters = { processed: input.records.length, inserted: 0, updated: 0, ignored: 0 };
  const issues: Issue[] = [];
  const sourceEntities: Record<HealthSusSource, Set<string>> = {
    CNES: new Set(["unidade", "profissional", "equipe", "habilitacao"]),
    CADSUS: new Set(["paciente"]),
    SIA: new Set(["procedimento", "unidade", "especialidade", "servico", "cbo", "cid", "classificacao"]),
    SIGTAP: new Set(["procedimento", "especialidade", "servico", "cbo", "cid", "classificacao"]),
  };
  const priority: Record<string, number> = { unidade: 1, especialidade: 1, servico: 1, cbo: 1, cid: 1, classificacao: 1, equipe: 2, procedimento: 2, profissional: 3, habilitacao: 4 };
  const orderedRecords = input.records.map(record => ({ record, entity: normalizeHealthSusEntity(text(record, "tipo", "entidade", "registro")) }))
    .sort((left, right) => (priority[left.entity] || 10) - (priority[right.entity] || 10) || left.record.rowNumber - right.record.rowNumber);
  for (const { record, entity } of orderedRecords) {
    if (!sourceEntities[input.source].has(entity)) {
      issues.push(issue(record, entity.toUpperCase() || "REGISTRO", `O tipo de registro não é aceito para a origem ${input.source}.`));
      continue;
    }
    let outcome: Outcome | Issue;
    if (entity === "unidade") outcome = await processUnit(tx, record);
    else if (entity === "equipe") outcome = await processTeam(tx, record);
    else if (entity === "habilitacao") outcome = await processHabilitation(tx, record);
    else if (entity === "profissional") outcome = await processProfessional(tx, record);
    else if (entity === "paciente") outcome = await processPatient(tx, record);
    else if (entity === "procedimento") outcome = await processProcedure(tx, input.source, input.competence, input.batchId, record);
    else outcome = await processReference(tx, input.source, input.competence, input.batchId, entity, record);
    if (typeof outcome === "string") counters[outcome] += 1;
    else issues.push(outcome);
  }
  counters.ignored = issues.length;
  return { counters, issues };
}
