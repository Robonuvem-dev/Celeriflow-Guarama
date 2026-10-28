export type AdministrationBiSource = {
  institution: { name: string } | null;
  secretariats: {
    id: string;
    name: string;
    acronym: string | null;
    isActive: boolean;
    manager: { name: string; isActive: boolean; secretariatId: string | null; role: { name: string; isActive: boolean } | null } | null;
    _count: { employees: number; departments: number; units: number };
  }[];
  departments: { id: string; name: string; _count: { employees: number } }[];
  roles: { name: string; employees: number }[];
  demands: { secretariatId: string | null; department: { secretariatId: string } | null; status: string; deadline: Date | null; createdAt: Date }[];
  unassignedEmployees: { secretariatId: string | null; isActive: boolean; _count: { _all: number } }[];
};
