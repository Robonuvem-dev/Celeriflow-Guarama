export type PermissionUser = {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  role: string;
  profileCode: string;
  permissions?: string | null;
  additionalProfiles?: { id: string; code: string; name: string; permissions: string }[];
  modulePermissions: { code: string; canView: boolean; canEdit: boolean }[];
  allowedBudgetUnitIds: string[];
  allowedHealthUnitIds?: string[];
  hasHealthAccessScope?: boolean;
  employeeId: string | null;
  departmentId: string | null;
  secretariatId: string | null;
};

export type HealthAccessScopeRecord = {
  unitId: string;
  validFrom: string | null;
  validUntil: string | null;
  weekdays: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type IdentityRecord = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfil: { id: string; nome: string; codigo: string; ativo: boolean; permissoes: string };
  additionalProfiles?: { id: string; codigo: string; nome: string; permissoes: string }[];
  employee: { id: string; departmentId: string | null; secretariatId: string | null } | null;
  modulePermissions: { code: string; canView: boolean; canEdit: boolean }[];
  allowedBudgetUnitIds: string[];
  healthAccessScopes: HealthAccessScopeRecord[];
};
