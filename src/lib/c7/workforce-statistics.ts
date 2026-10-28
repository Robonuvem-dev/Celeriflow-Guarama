import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { listControlRoleLegalHistory, listControlWorkforceCenters, listControlWorkforceContracts, listControlWorkforceRoles } from "@/db/repositories/internal-control/workforce";
import { z } from "zod";
import { resolveContractRevision } from "@/lib/rh/contract-timeline";
import { assertCostScope } from "@/lib/financeiro/cost-ledger";
import type { CostActor } from "@/lib/financeiro/cost-types";

export const workforceStatisticsInput = z.object({ financialYearId: z.string().min(1), referenceDate: z.iso.date(), roleId: z.string().optional(), employeeId: z.string().optional(), salaryLevel: z.string().max(200).optional(), roleStatus: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"), legalStatus: z.enum(["ALL", "EXISTING", "EXTINGUISHED", "NOT_DOCUMENTED"]).default("ALL") });

export async function readControlWorkforceStatistics(db: DatabaseConnection, actor: CostActor, raw: z.input<typeof workforceStatisticsInput>) {
  const input = workforceStatisticsInput.parse(raw);
  const reference = new Date(`${input.referenceDate}T23:59:59.999Z`);
  return withDatabaseTransaction(db, async tx => {
    const year = await assertCostScope(tx, actor, input.financialYearId);
    if (reference.getUTCFullYear() !== year.year) throw new Error("A data de referência deve pertencer ao exercício da entidade.");
    if (!year.governmentEntityId) throw new Error("Custos exige exercício vinculado à entidade.");
    const centers = await listControlWorkforceCenters(tx, year.governmentEntityId, actor.allowedBudgetUnitIds);
    const centerNames = new Map(centers.map(center => [center.id, center.name]));
    // Include contracts historically assigned to authorized centers even if
    // their current center changed. Scope is checked again in the chosen revision.
    const contracts = await listControlWorkforceContracts(tx, { centerIds: centers.map(center => center.id), reference, employeeId: input.employeeId });
    const positions = contracts.flatMap(contract => {
      if (!contract.revisions.length) return [];
      const { contract: historical, revisionId } = resolveContractRevision(contract, contract.revisions, { start: reference, end: reference });
      if (!historical.costCenterId || !centerNames.has(historical.costCenterId) || historical.admittedAt > reference || (historical.endsAt && historical.endsAt.toISOString().slice(0, 10) < input.referenceDate) || historical.status !== "ATIVO" || (input.roleId && historical.roleId !== input.roleId) || (input.salaryLevel && historical.salaryLevel !== input.salaryLevel)) return [];
      return [{ contractId: historical.id, employeeId: historical.employeeId, employeeName: contract.employee.name, registration: historical.registration, roleId: historical.roleId, salaryLevel: historical.salaryLevel ?? "", costCenterId: historical.costCenterId, costCenterName: centerNames.get(historical.costCenterId)!, workLocation: historical.workLocation, revisionId, version: historical.version }];
    });
    const roles = await listControlWorkforceRoles(tx, input);
    const legalEvents = await listControlRoleLegalHistory(tx, { governmentEntityId: year.governmentEntityId, reference, roleId: input.roleId });
    const legalByRole = new Map<string, typeof legalEvents[number]>();
    for (const event of legalEvents) if (!legalByRole.has(event.roleId)) legalByRole.set(event.roleId, event);
    const legalMemory = (roleId: string) => {
      const event = legalByRole.get(roleId);
      return { legalState: event?.state ?? "NOT_DOCUMENTED", historicalDesignation: event?.designation ?? null, authorizedSeats: event?.authorizedSeats ?? null, legalEventId: event?.id ?? null, legalEffectiveFrom: event?.effectiveFrom.toISOString().slice(0, 10) ?? null, legalReference: event?.legalReference ?? null, legalDocumentVersionId: event?.documentVersionId ?? null, legalDocumentHash: event?.documentHash ?? null };
    };
    const roleNames = new Map(roles.map(role => [role.id, role]));
    const selectedRoles = roles.filter(role => input.legalStatus === "ALL" || legalMemory(role.id).legalState === input.legalStatus);
    const selectedIds = new Set(selectedRoles.map(role => role.id));
    const rows = positions.filter(position => selectedIds.has(position.roleId)).map(position => ({ ...position, roleName: roleNames.get(position.roleId)!.name, roleCurrentlyActive: roleNames.get(position.roleId)!.isActive, ...legalMemory(position.roleId) }));
    const groups = selectedRoles.map(role => { const selected = rows.filter(row => row.roleId === role.id); return { id: role.id, name: role.name, currentlyActive: role.isActive, people: new Set(selected.map(row => row.employeeId)).size, contracts: selected.length, ...legalMemory(role.id) }; });
    return { referenceDate: input.referenceDate, governmentEntityId: year.governmentEntityId!, groups, rows, totalPeople: new Set(rows.map(row => row.employeeId)).size, totalContracts: rows.length, missingRevisionCount: contracts.filter(contract => !contract.revisions.length).length, missingRoleCount: positions.filter(position => !roleNames.has(position.roleId) && input.roleStatus === "ALL").length, undocumentedRoleCount: groups.filter(group => group.legalState === "NOT_DOCUMENTED").length, contractsInExtinguishedRoles: rows.filter(row => row.legalState === "EXTINGUISHED").length, metadata: "Nome/atividade cadastral são atuais; cargo/enquadramento/localização provêm da revisão contratual na data. Situação legal e denominação histórica usam exclusivamente posições aditivas fundamentadas em ato/versão GED do ente. Sem posição vigente: NOT_DOCUMENTED. Vínculos em cargo extinto permanecem na apuração e são destacados para conferência." };
  }, { isolationLevel: "repeatable read", timeoutMs: 60000 });
}

export function controlWorkforceStatisticsReport(data: Awaited<ReturnType<typeof readControlWorkforceStatistics>>) {
  const legalColumns = (row: typeof data.groups[number] | typeof data.rows[number]) => [row.legalState, row.historicalDesignation ?? "", row.authorizedSeats === null ? "" : String(row.authorizedSeats), row.legalEventId ?? "", row.legalEffectiveFrom ?? "", row.legalReference ?? "", row.legalDocumentVersionId ?? "", row.legalDocumentHash ?? ""];
  return { title: `Controle Interno — estatísticas funcionais em ${data.referenceDate}`, headers: ["Tipo", "Referência", "Cargo ID", "Cargo (nome atual)", "Atividade cadastral atual", "Servidor ID", "Servidor (nome atual)", "Matrícula", "Enquadramento histórico", "Centro ID", "Centro (nome atual)", "Localização histórica", "Revisão ID", "Versão", "Pessoas distintas", "Vínculos", "Memória/limites", "Situação legal na data", "Denominação histórica", "Vagas legais", "Posição legal ID", "Vigência legal", "Fundamento legal", "Versão GED ID", "SHA-256 GED"], rows: [
    ...data.groups.map(group => ["CARGO", data.referenceDate, group.id, group.name, group.currentlyActive ? "ATIVO" : "INATIVO", "", "", "", "", "", "", "", "", "", String(group.people), String(group.contracts), "Pessoas por cargo não são aditivas", ...legalColumns(group)]),
    ...data.rows.map(row => ["VINCULO", data.referenceDate, row.roleId, row.roleName, row.roleCurrentlyActive ? "ATIVO" : "INATIVO", row.employeeId, row.employeeName, row.registration, row.salaryLevel, row.costCenterId, row.costCenterName, row.workLocation, row.revisionId, String(row.version), "", "1", "Posição contratual na referência", ...legalColumns(row)]),
    ["TOTAL", data.referenceDate, "", "", "", "", "", "", "", "", "", "", "", "", String(data.totalPeople), String(data.totalContracts), data.metadata, ...Array<string>(8).fill("")],
    ["CONFERENCIA", data.referenceDate, "", "", "", "", "", "", "", "", "", "", "", "", "", "", `Candidatos sem revisão: ${data.missingRevisionCount}; vínculos sem cargo: ${data.missingRoleCount}; cargos sem posição legal: ${data.undocumentedRoleCount}; vínculos em cargo extinto: ${data.contractsInExtinguishedRoles}`, ...Array<string>(8).fill("")],
  ] };
}
