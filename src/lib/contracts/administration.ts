export type InstitutionInput = {
  name: string; cnpj: string | null; legalName: string | null; address: string | null;
  city: string | null; state: string | null; zipCode: string | null; phone: string | null;
  email: string | null; website: string | null; mayorName: string | null; managerName: string | null;
  logoUrl?: string | null;
};

export type CanonicalEmployeePerson = {
  personId: string; name: string; cpf: string; email: string | null; phone: string | null;
};

export type AdministrationTimestamps = { createdAt: Date; updatedAt: Date };
export type InstitutionRecord = Required<InstitutionInput> & AdministrationTimestamps & { id: string };
export type SecretariatRecord = AdministrationTimestamps & {
  id: string; name: string; acronym: string | null; managerName: string | null; managerId: string | null; isActive: boolean;
};
export type DepartmentRecord = AdministrationTimestamps & {
  id: string; name: string; description: string | null; secretariatId: string; isActive: boolean;
};
export type AdministrativeUnitRecord = AdministrationTimestamps & {
  id: string; name: string; type: string; address: string | null; managerName: string | null; secretariatId: string; isActive: boolean;
};
export type RoleRecord = AdministrationTimestamps & {
  id: string; name: string; description: string | null; level: string | null; canSign: boolean; isActive: boolean;
};
export type EmployeeRecord = AdministrationTimestamps & {
  id: string; name: string; cpf: string | null; registration: string | null; email: string | null; phone: string | null;
  isActive: boolean; salaryBase: number; contractedHours: number; roleId: string | null; secretariatId: string | null;
  departmentId: string | null; unitId: string | null; personId: string | null;
};
export type CalendarEventRecord = AdministrationTimestamps & {
  id: string; title: string; description: string | null; date: Date; isHoliday: boolean; type: string;
};
export type SecretariatListItem = SecretariatRecord & {
  manager: { id: string; name: string; registration: string | null; isActive: boolean; role: { name: string } | null } | null;
  _count: { departments: number };
};
export type EmployeeListItem = EmployeeRecord & { role: RoleRecord | null; secretariat: SecretariatRecord | null; department: DepartmentRecord | null };
export type ManagerOption = { id: string; name: string; registration: string | null; secretariatId: string | null; role: { name: string } };
