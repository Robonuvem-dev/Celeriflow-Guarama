export type AdministrationBiRow = {
  id: string;
  name: string;
  acronym: string | null;
  active: boolean;
  managerName: string | null;
  managerRole: string | null;
  managerValid: boolean;
  employees: number;
  inactiveEmployees: number;
  departments: number;
  units: number;
  demands: number;
  openDemands: number;
  completedDemands: number;
  overdueDemands: number;
};

export type AdministrationBiData = {
  institution: string;
  capturedAt: string;
  selection: string;
  options: { id: string; name: string; active: boolean }[];
  rows: AdministrationBiRow[];
  departments: { id: string; name: string; employees: number }[];
  roles: { name: string; employees: number }[];
  timeline: { month: string; label: string; demands: number }[];
  unassignedEmployees: number;
  unassignedDemands: number;
  unassignedOpenDemands: number;
  unassignedCompletedDemands: number;
  unassignedOverdueDemands: number;
};

export function summarizeAdministration(rows: AdministrationBiRow[]) {
  return rows.reduce((total, row) => ({
    secretariats: total.secretariats + Number(row.active),
    managers: total.managers + Number(row.active && row.managerValid),
    employees: total.employees + row.employees,
    inactiveEmployees: total.inactiveEmployees + row.inactiveEmployees,
    departments: total.departments + row.departments,
    units: total.units + row.units,
    demands: total.demands + row.demands,
    openDemands: total.openDemands + row.openDemands,
    completedDemands: total.completedDemands + row.completedDemands,
    overdueDemands: total.overdueDemands + row.overdueDemands,
  }), { secretariats: 0, managers: 0, employees: 0, inactiveEmployees: 0, departments: 0, units: 0, demands: 0, openDemands: 0, completedDemands: 0, overdueDemands: 0 });
}

export function isCompletedDemand(status: string) {
  return ["concluida", "concluido", "encerrada", "encerrado", "cancelada", "cancelado", "resolvida", "resolvido"].includes(status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim());
}

export function summarizeAdministrationData(data: AdministrationBiData) {
  const summary = summarizeAdministration(data.rows);
  return { ...summary, employees: summary.employees + data.unassignedEmployees, demands: summary.demands + data.unassignedDemands, openDemands: summary.openDemands + data.unassignedOpenDemands, completedDemands: summary.completedDemands + data.unassignedCompletedDemands, overdueDemands: summary.overdueDemands + data.unassignedOverdueDemands };
}
