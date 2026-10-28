export type InfrastructureServiceRecord = {
  id: string;
  protocolo: string;
  tipo: string;
  descricao: string;
  local: string;
  status: string;
  active: boolean;
  scheduledFor: Date | null;
  completedAt: Date | null;
  estimatedCost: number | null;
  departmentId: string | null;
  targetAssetId: string | null;
  budgetAppropriationId: string | null;
  commitmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
