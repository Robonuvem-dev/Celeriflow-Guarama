export const costSourceTypes = ["SETTLEMENT", "PAYROLL", "DEPRECIATION", "STOCK_CONSUMPTION", "MANUAL_VPD", "ADVANCE_ACCOUNTABILITY", "IMMEDIATE_MATERIAL"] as const;
export type CostSourceType = typeof costSourceTypes[number];
export type CostActor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
export type CostShare = { objectId: string; itemId: string; percentage: string };
export type CostAmount = { objectId: string; itemId: string; amount: string };
export const standardCostItems = [
  { identifier: "PESSOAL", description: "Pessoal e encargos", identificationClass: "TEXTO", behavior: "FIXED" },
  { identifier: "ENERGIA", description: "Energia elétrica", identificationClass: "TEXTO", behavior: "VARIABLE" },
  { identifier: "TELEFONIA", description: "Telefonia", identificationClass: "TELEFONE", behavior: "VARIABLE" },
  { identifier: "COMBUSTIVEL", description: "Combustíveis", identificationClass: "PLACA", behavior: "VARIABLE" },
  { identifier: "MATERIAL", description: "Material de consumo", identificationClass: "TEXTO", behavior: "VARIABLE" },
  { identifier: "DEPRECIACAO", description: "Depreciação patrimonial", identificationClass: "TEXTO", behavior: "FIXED" },
  { identifier: "SERVICOS", description: "Serviços de terceiros", identificationClass: "TEXTO", behavior: "VARIABLE" },
] as const;
