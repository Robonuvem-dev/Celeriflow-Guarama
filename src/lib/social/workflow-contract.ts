import { z } from "zod";
import { socialDateSchema } from "./history-input";
import { socialCaseSections } from "./municipal-contract";

export type SocialField = { key: string; label: string; type?: "date" | "datetime-local" | "time" | "number" | "textarea" | "select" | "questions" | "answers" | "weekdays" | "choices" | "mapping" | "indicators" | "document"; reference?: string; options?: string[]; optional?: boolean };
const f = (key: string, label: string, type?: SocialField["type"], optional = false): SocialField => ({ key, label, type, optional });
const r = (key: string, label: string, reference: string, optional = false): SocialField => ({ key, label, type: "select", reference, optional });
const s = (key: string, label: string, options: string[], optional = false): SocialField => ({ key, label, type: "select", options, optional });
const unit = r("unitId", "Unidade de atendimento", "units");
const professional = r("professionalId", "Profissional do atendimento", "professionals");
const subject = [r("familyId", "Família (ou selecione indivíduo)", "families", true), r("personId", "Indivíduo (ou selecione família)", "people", true)];
const period = [f("startsAt", "Início", "date"), f("endsAt", "Término", "date", true)];
const sphere = s("sphere", "Esfera", ["Municipal", "Estadual", "Federal"]);
export const kinships = ["RESPONSAVEL", "CONJUGE", "FILHO", "ENTEADO", "NETO", "PAI_MAE", "SOGRO", "IRMAO", "GENRO_NORA", "OUTRO_PARENTE", "NAO_PARENTE"];
export const socialWorkflowAreas = {
  parametros: { title: "Parâmetros municipais da Assistência Social", fields: [
    f("recordTitle", "Título do prontuário"), f("monthlyTitle", "Título do relatório mensal"), f("modelVersion", "Versão dos modelos"),
    f("bolsaFamiliaIncomeLimit", "Referência de renda por pessoa — Bolsa Família (R$)", "number"), f("bpcIncomeLimit", "Referência de renda por pessoa — BPC (R$)", "number"),
    f("maxRequestItems", "Máximo de itens por solicitação", "number"), f("maxRetroactiveDays", "Dias permitidos para registro retroativo", "number"),
    f("requestWindowDays", "Período para limite de solicitações (dias)", "number"), f("requestsPerWindow", "Máximo de solicitações por família no período (0 = sem limite)", "number"),
    { ...f("deliveryTypes", "Modalidades de entrega", "choices"), options: ["RETIRADA", "DOMICILIAR", "TRANSFERENCIA"] },
    f("reviewDays", "Revisão do acompanhamento (dias)", "number"), f("healthReminderDays", "Periodicidade de saúde (dias)", "number"), f("educationReminderDays", "Periodicidade de educação (dias)", "number"), f("registrationReminderMonths", "Atualização cadastral (meses)", "number"),
    s("smsProvider", "Canal de envio de SMS", ["QUEUE", "SMSGATE", "TEXTBELT"]), f("smsBaseUrl", "URL da API SMSGate"), f("smsCredentialReference", "Referência da credencial no servidor"),
    f("smsDailyLimit", "Limite diário de mensagens", "number"), f("smsBatchLimit", "Mensagens por processamento", "number"), f("smsSender", "Identificação do remetente"), f("smsTemplate", "Texto padrão: {unidade}, {condicionalidade}, {prazo}", "textarea"),
  ] },
  prontuarios: { title: "Prontuários socioassistenciais", fields: [unit, ...subject, professional, f("receivedAt", "Data de ingresso", "date"), s("enteredVia", "Forma de ingresso", ["Demanda espontânea", "Busca ativa", "Encaminhamento da rede", "Transferência de unidade", "Registro de acompanhamento"]), f("initialDemand", "Motivo do primeiro atendimento", "textarea"), s("secrecyLevel", "Acesso ao registro técnico", ["Normal", "Restrito", "CREAS"]), ...socialCaseSections.map(([key, label, type]): SocialField => ({ key, label, type, optional: true })), s("status", "Situação do prontuário", ["ACTIVE", "ARCHIVED"])] },
  mensal: { title: "Registro mensal de atendimentos — CRAS e CREAS", fields: [unit, professional, f("competence", "Competência (AAAA-MM)"), f("declaredValues", "Indicadores informados pela unidade", "indicators"), f("observations", "Observações e fontes dos indicadores", "textarea", true), s("status", "Situação", ["DRAFT", "FINAL"])] },
  layouts: { title: "Layouts de importação cadastral", fields: [f("name", "Nome do layout"), f("version", "Versão"), s("delimiter", "Separador de colunas", ["AUTO", ";", ",", "TAB", "|"]), s("dateFormat", "Formato da data de nascimento", ["ISO", "BR"]), s("encoding", "Codificação", ["utf-8", "windows-1252"]), f("mapping", "Associação de colunas", "mapping")] },
  documentos: { title: "Documentos socioassistenciais", fields: [unit, ...subject, r("templateCode", "Modelo do documento", "templates"), f("documentData", "Conteúdo do documento", "document"), s("status", "Situação", ["DRAFT", "ISSUED"])] },
  unidades: { title: "Cadastro completo de unidades", fields: [f("name", "Nome da unidade"), f("cnpj", "CNPJ", undefined, true), f("legalName", "Razão social"), f("stateRegistration", "Inscrição estadual / isento", undefined, true), s("type", "Tipo", ["CRAS", "CREAS", "Secretaria", "Centro POP", "Centro DIA", "Acolhimento", "Outros"]), f("unitNumber", "Número da unidade"), f("phone", "Telefone"), r("managerId", "Responsável", "employees"), f("streetAddress", "Endereço completo"), f("municipality", "Município/UF")] },
  profissionais: { title: "Registro profissional SUAS", fields: [r("employeeId", "Servidor / pessoa física", "employees"), unit, r("roleId", "Cargo / função", "roles"), f("council", "Conselho profissional", undefined, true), f("registration", "Número de registro profissional", undefined, true), ...period, s("individualScope", "Acesso individual", ["UNIT", "OWN", "MUNICIPAL"]), s("familyScope", "Acesso familiar", ["UNIT", "OWN", "MUNICIPAL"])] },
  beneficiarios: { title: "Beneficiários — ficha completa", fields: [unit, f("fullName", "Nome completo"), f("socialName", "Nome social", undefined, true), f("cpf", "CPF"), f("birthDate", "Nascimento", "date"), f("birthPlace", "Naturalidade"), f("nationality", "Nacionalidade"), s("raceColor", "Raça/cor", ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não informada"]), f("maritalStatus", "Estado civil"), f("motherName", "Mãe / não informada"), f("fatherName", "Pai / não informado"), s("gender", "Sexo", ["Feminino", "Masculino", "Outro", "Não informado"]), f("religion", "Religião", undefined, true), f("phonePrimary", "Telefone", undefined, true), f("email", "E-mail", undefined, true), f("rg", "RG", undefined, true), f("nis", "NIS", undefined, true), f("birthCertificate", "Certidão de nascimento", undefined, true), f("registeredAt", "Data do cadastro", "date"), f("zipCode", "CEP", undefined, true), f("streetName", "Logradouro"), f("number", "Número"), f("complement", "Complemento", undefined, true)] },
  familias: { title: "Famílias — cadastro integrado", fields: [unit, r("representativeId", "Responsável familiar", "people"), f("familyCode", "Código familiar municipal"), f("nis", "NIS do responsável", undefined, true), f("income", "Renda familiar (R$)", "number"), f("vulnerabilities", "Condições e vulnerabilidades", "textarea", true)] },
  membros: { title: "Composição familiar", fields: [unit, r("familyId", "Família", "families"), r("personId", "Pessoa / beneficiário", "people"), s("kinship", "Parentesco", kinships)] },
  beneficios: { title: "Catálogo de benefícios eventuais", fields: [f("name", "Benefício"), sphere, f("description", "Descrição / critérios", "textarea"), s("isRecurrent", "Recorrente", ["false", "true"])] },
  programas: { title: "Programas sociais", fields: [f("name", "Programa"), sphere, f("description", "Descrição", "textarea")] },
  participacoes: { title: "Participação em programas", fields: [unit, ...subject, r("programId", "Programa", "programs"), f("registeredAt", "Cadastro", "date"), f("includedAt", "Inclusão", "date"), f("excludedAt", "Desligamento", "date", true), f("benefitValue", "Valor do benefício (R$)", "number"), f("benefitNumber", "Número do benefício", undefined, true)] },
  acompanhamentos: { title: "Acompanhamento familiar e individual", fields: [unit, ...subject, professional, s("service", "Serviço", ["PAIF", "PAEFI", "Outro"]), ...period, f("diagnosis", "Diagnóstico / condições", "textarea"), f("objectives", "Objetivos", "textarea"), f("actions", "Ações, responsáveis e prazos", "textarea"), f("reviewAt", "Próxima revisão", "date", true), s("status", "Situação", ["ACTIVE", "CLOSED"])] },
  evolucoes: { title: "Evoluções do acompanhamento", fields: [r("followupId", "Acompanhamento", "followups"), f("occurredAt", "Data da evolução", "date"), f("description", "Evolução / avaliação", "textarea"), f("nextReviewAt", "Próxima revisão", "date", true)] },
  visitas: { title: "Agendamento e realização de visitas", fields: [unit, r("familyId", "Família", "families"), professional, f("scheduledDate", "Agendada para", "datetime-local"), f("objective", "Objetivo", "textarea"), s("status", "Situação", ["Agendada", "Realizada", "Cancelada"]), f("realizedDate", "Realizada em", "datetime-local", true), f("report", "Relatório / motivo do cancelamento", "textarea", true)] },
  condicionalidades: { title: "Condicionalidades e descumprimentos", fields: [unit, r("personId", "Beneficiário", "people"), r("programId", "Programa", "programs"), s("kind", "Tipo", ["Saúde", "Educação", "Recadastramento"]), f("dueAt", "Prazo", "date"), f("occurredAt", "Ocorrência", "date", true), f("effect", "Efeito do descumprimento / sem efeito"), f("suspensionFrom", "Suspensão: início", "date", true), f("suspensionUntil", "Suspensão: término", "date", true), s("status", "Situação", ["PENDING", "COMPLIED", "NONCOMPLIANCE", "SUSPENDED"]), f("observations", "Registro e fundamento", "textarea")] },
  formularios: { title: "Formulários socioassistenciais", fields: [unit, f("title", "Título"), f("questions", "Perguntas", "questions")] },
  respostas: { title: "Respostas dos formulários", fields: [r("questionnaireId", "Formulário / versão", "questionnaires"), ...subject, f("answeredAt", "Respondido em", "date"), f("answers", "Respostas", "answers")] },
  scfv: { title: "Serviços de Convivência — SCFV", fields: [unit, r("realizationUnitId", "Unidade de realização", "units"), f("name", "Nome do SCFV"), f("serviceType", "Tipo de serviço"), f("ageMin", "Idade mínima", "number"), f("ageMax", "Idade máxima", "number"), f("registeredAt", "Cadastro", "date"), f("startsAt", "Início", "date"), f("endsAt", "Término", "date"), professional, r("referenceProfessionalId", "Técnico de referência", "professionals"), r("advisorId", "Orientador", "professionals"), r("facilitatorId", "Facilitador", "professionals"), f("weekdays", "Dias da semana", "weekdays"), f("startTime", "Horário inicial", "time"), f("endTime", "Horário final", "time")] },
  matriculas: { title: "Matrículas SCFV", fields: [r("groupId", "SCFV / unidade", "groups"), r("personId", "Beneficiário", "people"), f("enrolledAt", "Matrícula", "date"), f("leftAt", "Desligamento", "date", true), f("exitReason", "Motivo do desligamento", "textarea", true)] },
  eventos: { title: "Planejamento e eventos SCFV", fields: [r("groupId", "SCFV", "groups"), f("title", "Evento / encontro"), f("occursAt", "Data", "date"), f("planning", "Planejamento", "textarea"), s("status", "Situação", ["PLANNED", "REALIZED", "CANCELLED"]), f("report", "Relatório da execução / cancelamento", "textarea", true)] },
  presencas: { title: "Presença nos eventos SCFV", fields: [r("eventId", "Evento", "events"), r("enrollmentId", "Matrícula / beneficiário", "enrollments"), s("present", "Presença", ["true", "false"]), f("justification", "Justificativa", "textarea", true)] },
  anexos: { title: "Fotos e anexos socioassistenciais", fields: [unit, r("eventId", "Evento SCFV (ou selecione pessoa)", "events", true), r("personId", "Pessoa (ou selecione evento)", "people", true), r("documentId", "Documento do GED", "documents"), f("caption", "Descrição do documento / fotografia")] },
  comunicacoes: { title: "Fila de avisos de condicionalidades", fields: [unit, r("programId", "Programa / destinatários ativos", "programs"), s("conditionalityKind", "Condicionalidade", ["Saúde", "Educação", "Recadastramento"],true), f("dueAt", "Prazo da condicionalidade", "date"), f("body", "Mensagem SMS", "textarea")] },
} satisfies Record<string, { title: string; fields: SocialField[] }>;
export type SocialWorkflowArea = keyof typeof socialWorkflowAreas;
export type SocialWorkflowRow = { id: string; title: string; unitId: string; date: string; status: string; detail: string; values: Record<string, string>; immutable?: boolean };
export type SocialOption = { id: string; name: string };
export type SocialWorkflowData = { rows: SocialWorkflowRow[]; options: Record<string, SocialOption[]>; questionnaires: { id: string; questions: SocialQuestionInput[] }[]; administrator: boolean; defaults?: Record<string, string>; unitTypes?: Record<string, string> };
export const socialQuestionSchema = z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/), label: z.string().trim().min(2).max(250), type: z.enum(["SHORT", "LONG", "CHECKBOX", "SINGLE", "MULTIPLE"]), required: z.boolean(), options: z.array(z.string().trim().min(1).max(150)).max(30) });
export type SocialQuestionInput = z.infer<typeof socialQuestionSchema>;
export const socialQuestionsSchema = z.array(socialQuestionSchema).min(1).max(60).superRefine((questions, ctx) => {
  if (new Set(questions.map(q => q.key)).size !== questions.length) ctx.addIssue({ code: "custom", message: "Perguntas devem ter identificadores diferentes." });
  if (questions.some(q => ["SINGLE", "MULTIPLE"].includes(q.type) && (q.options.length < 2 || new Set(q.options).size !== q.options.length))) ctx.addIssue({ code: "custom", message: "Escolhas exigem ao menos duas opções distintas." });
});
export function parseWorkflowValues(area: SocialWorkflowArea, raw: unknown): Record<string, string> {
  const values = z.record(z.string(), z.string().max(50000)).parse(raw);
  for (const field of socialWorkflowAreas[area].fields as SocialField[]) {
    const value = (values[field.key] || "").trim(); values[field.key] = value;
    if (!value) { if (!field.optional) throw new Error(`Informe ${field.label}.`); continue; }
    if (field.type === "date") socialDateSchema.parse(value);
    if (field.type === "datetime-local" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(new Date(value).getTime()))) throw new Error(`${field.label}: data/hora inválida.`);
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${field.label}: horário inválido.`);
    if (field.type === "number" && !/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new Error(`${field.label}: use valor positivo ou zero, até duas casas decimais.`);
    if (field.type === "choices") {
      const choices = z.array(z.string()).min(1).parse(JSON.parse(value));
      if (new Set(choices).size !== choices.length || choices.some(choice => !field.options?.includes(choice))) throw new Error(`${field.label}: opção inválida.`);
    } else if (field.options && !field.options.includes(value)) throw new Error(`${field.label}: opção inválida.`);
    if (!["questions", "answers", "mapping", "indicators", "document"].includes(field.type || "") && value.length > (field.type === "textarea" ? 10000 : 500)) throw new Error(`${field.label}: conteúdo muito extenso.`);
  }
  for (const [from, to] of [["startsAt", "endsAt"], ["includedAt", "excludedAt"], ["enrolledAt", "leftAt"], ["suspensionFrom", "suspensionUntil"]]) if (values[to] && (!values[from] || values[to] < values[from])) throw new Error("Período invertido ou sem início.");
  return values;
}
export function validateSocialAnswers(questions: SocialQuestionInput[], input: unknown) {
  const answers = z.record(z.string(), z.union([z.string().max(10000), z.array(z.string().max(150)).max(30), z.boolean()])).parse(input);
  if (Object.keys(answers).some(key => !questions.some(q => q.key === key))) throw new Error("Resposta não pertence à versão do formulário.");
  for (const q of questions) {
    const answer = answers[q.key];
    const empty = answer === undefined || answer === "" || Array.isArray(answer) && !answer.length;
    if (q.required && empty) throw new Error(`Responda: ${q.label}.`);
    if (empty) continue;
    if (q.type === "CHECKBOX" ? typeof answer !== "boolean" : q.type === "MULTIPLE" ? !Array.isArray(answer) || answer.some(item => !q.options.includes(item)) : typeof answer !== "string" || (q.type === "SINGLE" && !q.options.includes(answer)) || (q.type === "SHORT" && answer.length > 500)) throw new Error(`Resposta inválida: ${q.label}.`);
  }
  return answers;
}
