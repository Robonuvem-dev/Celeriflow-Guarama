import { z } from "zod";

type Field = { name: string; label: string; type?: "date" | "time" | "textarea"; options?: string[] };
const field = (name: string, label: string, options?: string[]): Field => ({ name, label, options });
const dateField = (name: string, label: string): Field => ({ name, label, type: "date" });
const periodFields = [dateField("from", "Vigência inicial"), dateField("until", "Vigência final")];
export const supplementaryKinds = ["GRADUACAO_CURSO", "GRADUACAO_SERVIDOR", "INDICE_FINANCEIRO", "TEMPO_CONTRIBUICAO", "PENSAO_VITALICIA", "CONVENIO_BANCARIO", "CONTA_CONVENIO", "VT_ITINERARIO", "VT_MOVIMENTO", "RATEIO_FOLHA", "DEMANDA_PESSOAL", "MOTIVO_DESLIGAMENTO"] as const;
export type SupplementaryKind = typeof supplementaryKinds[number];
export const supplementaryDefinitions: Record<SupplementaryKind, { title: string; fields: Field[] }> = {
  GRADUACAO_CURSO: { title: "Cursos de graduação", fields: [field("institution", "Instituição"), field("level", "Grau", ["Bacharelado", "Licenciatura", "Tecnológico"]), field("modality", "Modalidade", ["Presencial", "Remota", "Híbrida"])] },
  GRADUACAO_SERVIDOR: { title: "Graduação dos servidores", fields: [field("employeeId", "Servidor"), field("courseId", "Curso de graduação"), ...periodFields, field("status", "Situação", ["Em curso", "Concluído", "Interrompido"]), field("evidence", "Diploma / referência documental")] },
  INDICE_FINANCEIRO: { title: "Índices e cotações históricas", fields: [field("currencyId", "Moeda auxiliar"), dateField("date", "Data de referência"), field("value", "Valor decimal"), field("source", "Fonte / fundamento")] },
  TEMPO_CONTRIBUICAO: { title: "Experiência e tempo de contribuição", fields: [field("employeeId", "Servidor"), ...periodFields, field("employer", "Empregador anterior"), field("regime", "Regime previdenciário"), field("recognizedDays", "Dias reconhecidos"), field("status", "Situação", ["Declarado", "Reconhecido", "Revogado"]), field("source", "Certidão / ato / origem")] },
  PENSAO_VITALICIA: { title: "Pensões vitalícias", fields: [field("employeeId", "Instituidor (servidor)"), field("beneficiaryPersonId", "Pessoa beneficiária"), ...periodFields, field("quota", "Cota percentual"), field("amount", "Benefício mensal BRL"), field("status", "Situação", ["Ativa", "Suspensa", "Cessada"]), field("source", "Ato concessório / fundamento")] },
  CONVENIO_BANCARIO: { title: "Convênios bancários de pessoal", fields: [field("bankId", "Banco"), field("direction", "Finalidade", ["CREDITO", "DEBITO"]), ...periodFields, field("source", "Convênio / fundamento")] },
  CONTA_CONVENIO: { title: "Contas e autorizações por convênio", fields: [field("employeeId", "Servidor"), field("conventionId", "Convênio"), field("agency", "Agência"), field("account", "Conta"), field("accountType", "Tipo", ["CORRENTE", "SALARIO", "POUPANCA"]), ...periodFields, field("authorization", "Autorização / referência")] },
  VT_ITINERARIO: { title: "Itinerários e tarifas de vale-transporte", fields: [field("employeeId", "Servidor"), field("route", "Itinerário"), field("fare", "Tarifa por viagem BRL"), field("trips", "Viagens por dia"), field("weekdays", "Dias 1=segunda a 7=domingo"), ...periodFields, field("source", "Adesão / fundamento")] },
  VT_MOVIMENTO: { title: "Aquisição e conferência de vale-transporte", fields: [field("employeeId", "Servidor"), field("competence", "Competência MM/AAAA"), field("type", "Movimento", ["AQUISICAO", "CONCESSAO", "CONSUMO", "DEVOLUCAO", "DESCONTO"]), field("quantity", "Quantidade"), field("amount", "Valor BRL"), field("source", "Documento / origem")] },
  RATEIO_FOLHA: { title: "Rateios demonstrativos da folha", fields: [field("contractId", "Contrato"), field("appropriationId", "Dotação"), field("percentage", "Percentual"), field("component", "Componente", ["REMUNERACAO", "ENCARGO"]), ...periodFields, field("source", "Critério / fundamento")] },
  DEMANDA_PESSOAL: { title: "Demanda e dimensionamento de pessoal", fields: [field("departmentId", "Lotação"), field("roleId", "Cargo"), field("positions", "Postos necessários"), field("weeklyHours", "Horas semanais por posto"), ...periodFields, field("method", "Premissa / critério de demanda")] },
  MOTIVO_DESLIGAMENTO: { title: "Motivos de desligamento", fields: [field("externalCode", "Código externo / referência"), field("description", "Descrição e aplicação")] },
};
const text = z.string().trim().min(1).max(1000);
const amount = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/);
const integer = z.string().regex(/^\d{1,6}$/);
const percentage = z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/).refine(entry => Number(entry) > 0 && Number(entry) <= 100, "Percentual deve ser maior que zero e até 100.");
const period = { from: z.iso.date(), until: z.iso.date() };
const schemas = {
  GRADUACAO_CURSO: z.object({ institution: text, level: z.enum(["Bacharelado", "Licenciatura", "Tecnológico"]), modality: z.enum(["Presencial", "Remota", "Híbrida"]) }).strict(),
  GRADUACAO_SERVIDOR: z.object({ employeeId: text, courseId: text, ...period, status: z.enum(["Em curso", "Concluído", "Interrompido"]), evidence: text }).strict(),
  INDICE_FINANCEIRO: z.object({ currencyId: text, date: z.iso.date(), value: z.string().regex(/^\d{1,15}(?:\.\d{1,8})?$/), source: text }).strict(),
  TEMPO_CONTRIBUICAO: z.object({ employeeId: text, ...period, employer: text, regime: text, recognizedDays: integer, status: z.enum(["Declarado", "Reconhecido", "Revogado"]), source: text }).strict(),
  PENSAO_VITALICIA: z.object({ employeeId: text, beneficiaryPersonId: text, ...period, quota: percentage, amount, status: z.enum(["Ativa", "Suspensa", "Cessada"]), source: text }).strict(),
  CONVENIO_BANCARIO: z.object({ bankId: text, direction: z.enum(["CREDITO", "DEBITO"]), ...period, source: text }).strict(),
  CONTA_CONVENIO: z.object({ employeeId: text, conventionId: text, agency: text, account: text, accountType: z.enum(["CORRENTE", "SALARIO", "POUPANCA"]), ...period, authorization: text }).strict(),
  VT_ITINERARIO: z.object({ employeeId: text, route: text, fare: amount.refine(entry => Number(entry) > 0), trips: integer.refine(entry => Number(entry) > 0 && Number(entry) <= 10), weekdays: z.string().regex(/^[1-7](,[1-7])*$/).refine(entry => new Set(entry.split(",")).size === entry.split(",").length), ...period, source: text }).strict(),
  VT_MOVIMENTO: z.object({ employeeId: text, competence: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/), type: z.enum(["AQUISICAO", "CONCESSAO", "CONSUMO", "DEVOLUCAO", "DESCONTO"]), quantity: integer, amount, source: text }).strict(),
  RATEIO_FOLHA: z.object({ contractId: text, appropriationId: text, percentage, component: z.enum(["REMUNERACAO", "ENCARGO"]), ...period, source: text }).strict(),
  DEMANDA_PESSOAL: z.object({ departmentId: text, roleId: text, positions: integer, weeklyHours: integer.refine(entry => Number(entry) > 0 && Number(entry) <= 60), ...period, method: text }).strict(),
  MOTIVO_DESLIGAMENTO: z.object({ externalCode: text, description: text }).strict(),
};
export function parseSupplementaryDetails(kind: SupplementaryKind, raw: unknown): Record<string, string> {
  const data: Record<string, string> = schemas[kind].parse(raw);
  if (data.from && data.until && data.from > data.until) throw new Error("Fim da vigência anterior ao início.");
  if (kind === "TEMPO_CONTRIBUICAO") {
    const days = (new Date(data.until).getTime() - new Date(data.from).getTime()) / 86400000 + 1;
    if (Number(data.recognizedDays) > days) throw new Error("Dias reconhecidos excedem o intervalo informado.");
  }
  return data;
}
