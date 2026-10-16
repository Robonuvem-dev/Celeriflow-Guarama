import type { PreventionPayload } from "./prevention-policy";
export type Field = { key: string; label: string; type?: "date" | "number" | "boolean" | "cost" | "long"; ref?: string; choices?: readonly string[]; optional?: boolean; many?: boolean; fields?: Field[] };
const f = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, ...extra });
const at = f("at", "Data e hora", { type: "date" });
const period = [f("startsAt", "Início", { type: "date" }), f("endsAt", "Fim", { type: "date" })];
const location = f("location", "Local");
const responsible = f("responsiblePersonId", "Pessoa responsável", { ref: "person" });
const employees = (key: string, label: string) => f(key, label, { ref: "employee", many: true });
const persons = (key = "responsiblePersonIds", label = "Responsáveis") => f(key, label, { ref: "person", many: true });
const activity = [f("title", "Atividade"), f("actions", "Ações", { type: "long" }), f("goals", "Objetivos", { type: "long" }), location, f("strategy", "Estratégia", { type: "long" }), ...period, persons()];
const cipa = f("cipaId", "Mandato CIPA", { ref: "CIPA" });
export const preventionFields: Record<PreventionPayload["kind"], Field[]> = {
  CIPA: [...period, f("members", "Membros", { many: true, fields: [f("employeeId", "Servidor", { ref: "employee" }), f("function", "Função na comissão"), f("representation", "Representação", { choices: ["EMPLOYER", "EMPLOYEE"] }), f("alternate", "Suplente", { type: "boolean" })] })],
  PLAN: [cipa, f("activities", "Atividades do plano", { many: true, fields: activity })],
  INSPECTION: [{ ...cipa, optional: true }, at, location, responsible, f("formTitle", "Título do formulário operacional"), f("questions", "Perguntas", { many: true, fields: [f("key", "Chave (ex.: protecao)"), f("label", "Pergunta"), f("section", "Seção"), f("kind", "Tipo", { choices: ["TEXT", "NUMBER", "BOOLEAN", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DATE"] }), f("required", "Obrigatória", { type: "boolean" }), f("choices", "Opções de escolha", { many: true })] })],
  MEETING: [cipa, at, f("type", "Tipo", { choices: ["ORDINARY", "EXTRAORDINARY"] }), location, f("agenda", "Pauta", { type: "long" })],
  SIPAT: [...period, persons("organizerPersonIds", "Organizadores"), f("activities", "Programação", { many: true, fields: [f("title", "Atividade"), location, at, f("cost", "Custo (R$)", { type: "cost" }), persons()] })],
  ELECTION: [cipa, f("registrationStartsAt", "Abertura de inscrições", { type: "date" }), f("registrationEndsAt", "Encerramento de inscrições", { type: "date" }), ...period, employees("commissionEmployeeIds", "Comissão eleitoral"), f("minimumParticipation", "Participação mínima (%)", { type: "number" })],
  VISIT: [f("type", "Tipo de visita"), at, location, responsible, f("details", "Detalhes", { type: "long" })],
  BRIGADE: [f("building", "Edificação"), f("floors", "Pavimentos", { many: true }), employees("memberEmployeeIds", "Brigadistas"), f("trainings", "Treinamentos", { many: true, fields: [f("title", "Treinamento"), at, f("instructorPersonId", "Instrutor", { ref: "person" }), employees("participantEmployeeIds", "Participantes")] }), f("requiredExams", "Exames necessários (sem resultados clínicos)", { many: true }), f("actionPlan", "Plano de ação", { many: true, fields: activity }), f("meetings", "Reuniões", { many: true, fields: [at, f("agenda", "Pauta", { type: "long" }), f("minutes", "Ata", { type: "long" }), employees("participantEmployeeIds", "Participantes")] })],
  EXTINGUISHER: [f("serial", "Número / identificação"), f("type", "Tipo de extintor"), location, f("installedAt", "Instalação", { type: "date" }), f("validUntil", "Validade", { type: "date" }), responsible, f("supplierId", "Fornecedor", { ref: "supplier", optional: true }), f("assetId", "Patrimônio", { ref: "asset", optional: true })],
  MAINTENANCE: [f("extinguisherId", "Extintor", { ref: "EXTINGUISHER" }), f("type", "Serviço", { choices: ["RECHARGE", "HYDROSTATIC_TEST"] }), at, f("validUntil", "Validade", { type: "date" }), f("supplierId", "Empresa fornecedora", { ref: "supplier" }), f("technicalResponsiblePersonId", "Responsável técnico", { ref: "person" }), f("certificateNumber", "Certificado / ordem de serviço")],
  ERGONOMICS: [f("scope", "Abrangência", { choices: ["COLLECTIVE", "INDIVIDUAL"] }), f("clinical", "Contém informação clínica (acesso médico restrito)", { type: "boolean" }), f("employeeId", "Servidor (somente avaliação individual)", { ref: "employee", optional: true }), f("professionalRoleId", "Autoria médica (obrigatória para conteúdo clínico)", { ref: "professional", optional: true }), responsible, at, location, ...["machines", "furniture", "equipment", "lighting", "temperature", "noise", "recommendations"].map((key, i) => f(key, ["Máquinas", "Móveis", "EPI / EPC", "Iluminação", "Temperatura", "Ruído", "Recomendações"][i], { type: "long" }))],
  PCA: [...period, responsible, f("goals", "Objetivos", { type: "long" }), f("noiseAssessment", "Avaliação do ruído", { type: "long" }), f("controls", "Controles", { type: "long" }), f("monitoring", "Monitoramento", { type: "long" }), f("activities", "Atividades", { many: true, fields: activity })],
  AUDIOMETRY: [f("pcaId", "Programa PCA", { ref: "PCA" }), f("employeeId", "Servidor", { ref: "employee" }), f("professionalRoleId", "Médico autor", { ref: "professional" }), at, f("nextAt", "Próximo exame", { type: "date" }), f("technique", "Técnica"), f("conclusion", "Conclusão", { type: "long" }), ...["right", "left"].map(key => f(key, key === "right" ? "Orelha direita" : "Orelha esquerda", { many: true, fields: [f("hz", "Frequência (Hz)", { type: "number" }), f("db", "Limiar (dB)", { type: "number" })] }))],
};
export const preventionLabels = Object.fromEntries(Object.values(preventionFields).flatMap(fields => {
  const entries = (fs: Field[]): [string, string][] => fs.flatMap(v => [[v.key, v.label] as [string, string], ...(v.fields ? entries(v.fields) : [])]);
  return entries(fields);
}));
