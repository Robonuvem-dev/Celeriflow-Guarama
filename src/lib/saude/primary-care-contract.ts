import { z } from "zod";

export const householdDetailsSchema = z.object({
  housingType: z.enum(["CASA", "APARTAMENTO", "COMODO", "OUTRO"]),
  possession: z.enum(["PROPRIO", "ALUGADO", "CEDIDO", "OCUPACAO", "OUTRO"]),
  location: z.enum(["URBANA", "RURAL"]), rooms: z.number().int().min(0).max(1000), residents: z.number().int().min(0).max(10000),
  construction: z.string().trim().min(1).max(100), access: z.string().trim().min(1).max(100), waterSupply: z.string().trim().min(1).max(100),
  waterTreatment: z.string().trim().min(1).max(100), sewage: z.string().trim().min(1).max(100), garbage: z.string().trim().min(1).max(100),
  electricity: z.boolean(), animals: z.array(z.string().trim().min(1)).max(30), notes: z.string().trim().max(4000).default(""),
}).strict();

export const foodMarkerQuestions = {
  UNDER_6_MONTHS: [["breastMilk", "Recebeu leite materno ontem?"], ["porridge", "Recebeu mingau?"], ["waterTea", "Recebeu água ou chá?"], ["cowMilk", "Recebeu leite de vaca?"], ["formula", "Recebeu fórmula infantil?"], ["fruitJuice", "Recebeu suco de fruta?"], ["fruit", "Recebeu fruta?"], ["saltFood", "Recebeu comida de sal?"], ["otherDrinkFood", "Recebeu outro alimento ou bebida?"]],
  SIX_TO_23_MONTHS: [["breastMilk", "Recebeu leite materno ontem?"], ["wholeFruit", "Consumiu fruta inteira?"], ["saltFood", "Consumiu comida de sal?"], ["beans", "Consumiu feijão?"], ["vegetables", "Consumiu verduras ou legumes?"], ["meatEgg", "Consumiu carne ou ovo?"], ["liver", "Consumiu fígado?"], ["ricePotato", "Consumiu arroz, batata ou massa?"], ["processedMeat", "Consumiu embutidos ou hambúrguer?"], ["sweetDrinks", "Consumiu bebidas adoçadas?"], ["instantSnacks", "Consumiu macarrão instantâneo ou salgadinhos?"], ["sweets", "Consumiu biscoitos recheados, doces ou guloseimas?"]],
  TWO_YEARS_PLUS: [["screenMeals", "Realiza refeições assistindo TV ou usando telas?"], ["breakfast", "Realiza café da manhã?"], ["lunch", "Realiza almoço?"], ["dinner", "Realiza jantar?"], ["beans", "Consumiu feijão ontem?"], ["wholeFruit", "Consumiu frutas frescas ontem?"], ["vegetables", "Consumiu verduras ou legumes ontem?"], ["processedMeat", "Consumiu hambúrguer ou embutidos ontem?"], ["sweetDrinks", "Consumiu bebidas adoçadas ontem?"], ["instantSnacks", "Consumiu macarrão instantâneo ou salgadinhos ontem?"], ["sweets", "Consumiu biscoitos recheados, doces ou guloseimas ontem?"]],
} as const;
export type FoodAgeGroup = keyof typeof foodMarkerQuestions;
export function validateFoodMarkers(group: FoodAgeGroup, raw: unknown) {
  const keys = foodMarkerQuestions[group];
  const schema = z.object(Object.fromEntries(keys.map(([key]) => [key, z.enum(["YES", "NO", "UNKNOWN"])]))).strict();
  return schema.parse(raw);
}

export const collectiveActivityTypes = ["EDUCATION", "GROUP_CARE", "ASSESSMENT", "TEAM_MEETING", "COMMUNITY_MEETING", "MOBILIZATION"] as const;
export const collectiveThemes = ["ALIMENTACAO_SAUDAVEL", "SAUDE_BUCAL", "SAUDE_MULHER", "SAUDE_CRIANCA", "SAUDE_IDOSO", "DOENCAS_CRONICAS", "SAUDE_MENTAL", "SAUDE_SEXUAL_REPRODUTIVA", "PREVENCAO_VIOLENCIA", "TABACO_ALCOOL_DROGAS", "OUTRO"] as const;
export const collectivePractices = ["ANTROPOMETRIA", "ATIVIDADE_CORPORAL", "ESCOVACAO_SUPERVISIONADA", "APLICACAO_TOPICA_FLUOR", "EDUCACAO_EM_SAUDE", "PRATICAS_INTEGRATIVAS", "AVALIACAO_CLINICA", "OUTRA"] as const;
