import { sql, type SQLWrapper } from "drizzle-orm";
import type { PermissionUser } from "@/lib/contracts/identity";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { personnelDepartmentWhere, personnelEmployeeWhere, personnelRubricWhere } from "./personnel-scope";
import { accessiblePayrollWhere } from "./payroll-access";
import { canAccessPersonnelClinicalData } from "./clinical-access";

/** Match before counting/paging. Every referenced origin must be authorized, not merely one matching holder. */
export function integrationEventWhere(user: PermissionUser, payload: SQLWrapper) {
  if (isSystemAdministrator(user)) return canAccessPersonnelClinicalData(user) ? sql`true` : sql`NOT jsonb_path_exists(${payload}, '$.**.kind ? (@ == "READAPTACAO")')`;
  const references = (keys: string[]) => sql.join(keys.map(key => sql`SELECT value #>> '{}' id FROM jsonb_path_query(${payload}, ${`$.**.${key}`}::jsonpath) value WHERE jsonb_typeof(value)='string' AND length(btrim(value #>> '{}'))>0`), sql` UNION `);
  const holderIds = references(["employeeId", "employeeIds[*]"]), contractIds = references(["contractId", "previousContractId", "sourceContractId", "targetContractId", "benefitContractId", "contractIds[*]"]);
  const runIds = references(["runId", "sourceRunId", "runIds[*]"]), payrollIds = references(["payrollId", "payrollIds[*]"]);
  const rightIds = references(["entryId", "sourceEntryId", "targetEntryId", "provisionEntryId", "consumptionEntryId", "appropriationEntryId", "entryIds[*]"]), statementIds = references(["statementId", "statementIds[*]"]);
  return sql`EXISTS (WITH referenced_requests AS (${references(["requestId", "requestIds[*]"])}),
    holder_ids AS (${holderIds} UNION SELECT request."employeeId" FROM "HrPortalRequest" request JOIN referenced_requests ref ON ref.id=request.id),
    referenced_contracts AS (${contractIds} UNION SELECT request.payload->'input'->>'contractId' FROM "HrPortalRequest" request JOIN referenced_requests ref ON ref.id=request.id WHERE nullif(request.payload->'input'->>'contractId','') IS NOT NULL), referenced_rights AS (${rightIds}),
    contract_ids AS (SELECT id FROM referenced_contracts UNION SELECT r."contractId" FROM "HrRightEntry" r JOIN referenced_rights ref ON ref.id=r.id),
    referenced_statements AS (${statementIds}), referenced_runs AS (${runIds}),
    run_ids AS (SELECT id FROM referenced_runs UNION SELECT s."runId" FROM "HrPayrollStatement" s JOIN referenced_statements ref ON ref.id=s.id
      UNION SELECT right_entry.details->>'runId' FROM "HrRightEntry" right_entry JOIN referenced_rights ref ON ref.id=right_entry.id WHERE nullif(right_entry.details->>'runId','') IS NOT NULL),
    referenced_payrolls AS (${payrollIds}),
    rubric_ids AS (SELECT trim(unnest(string_to_array(id,','))) id FROM (${references(["rubricCode", "quantityCode", "floorRubric", "ceilingRubric", "rubricCodes", "rubricCodes[*]", "includedCodes", "affectedCodes", "integralityCodes"])}) rubric_lists
      UNION SELECT right_entry.details->>'rubricCode' FROM "HrRightEntry" right_entry JOIN referenced_rights ref ON ref.id=right_entry.id WHERE nullif(right_entry.details->>'rubricCode','') IS NOT NULL),
    payroll_ids AS (SELECT id FROM referenced_payrolls UNION SELECT r."payrollId" FROM "HrPayrollRun" r JOIN run_ids ref ON ref.id=r.id
      UNION SELECT right_entry.details->>'payrollId' FROM "HrRightEntry" right_entry JOIN referenced_rights ref ON ref.id=right_entry.id WHERE nullif(right_entry.details->>'payrollId','') IS NOT NULL)
    SELECT 1 WHERE (EXISTS(SELECT 1 FROM holder_ids) OR EXISTS(SELECT 1 FROM contract_ids) OR EXISTS(SELECT 1 FROM payroll_ids))
      AND NOT EXISTS(SELECT 1 FROM referenced_requests ref WHERE NOT EXISTS(SELECT 1 FROM "HrPortalRequest" request WHERE request.id=ref.id))
      AND NOT EXISTS(SELECT 1 FROM holder_ids ref WHERE NOT EXISTS(SELECT 1 FROM "Employee" scoped_holder WHERE scoped_holder.id=ref.id AND ${personnelEmployeeWhere(user, sql`scoped_holder."departmentId"`, sql`scoped_holder.id`)}))
      AND NOT EXISTS(SELECT 1 FROM contract_ids ref WHERE NOT EXISTS(SELECT 1 FROM "HrEmploymentContract" scoped_contract JOIN "Employee" scoped_holder ON scoped_holder.id=scoped_contract."employeeId" WHERE scoped_contract.id=ref.id AND ${personnelDepartmentWhere(user, sql`scoped_contract."departmentId"`)} AND ${personnelEmployeeWhere(user, sql`scoped_holder."departmentId"`, sql`scoped_holder.id`)}))
      AND NOT EXISTS(SELECT 1 FROM referenced_rights ref WHERE NOT EXISTS(SELECT 1 FROM "HrRightEntry" r WHERE r.id=ref.id))
      AND NOT EXISTS(SELECT 1 FROM referenced_statements ref WHERE NOT EXISTS(SELECT 1 FROM "HrPayrollStatement" s WHERE s.id=ref.id))
      AND NOT EXISTS(SELECT 1 FROM run_ids ref WHERE NOT EXISTS(SELECT 1 FROM "HrPayrollRun" r WHERE r.id=ref.id))
      AND NOT EXISTS(SELECT 1 FROM payroll_ids ref WHERE NOT EXISTS(SELECT 1 FROM "Payroll" WHERE "Payroll".id=ref.id AND ${accessiblePayrollWhere(user)}))
      AND NOT EXISTS(SELECT 1 FROM (${references(["departmentId"])}) department_refs WHERE NOT coalesce(${personnelDepartmentWhere(user, sql`department_refs.id`)},false))
      AND NOT EXISTS(SELECT 1 FROM (${references(["budgetUnitId", "budgetUnitIds[*]"])}) budget_refs WHERE NOT coalesce(budget_refs.id=ANY(${sql.param(user.allowedBudgetUnitIds)}::text[]),false))
      AND NOT EXISTS(SELECT 1 FROM rubric_ids rubric_refs WHERE rubric_refs.id<>'' AND NOT (${personnelRubricWhere(user, sql`rubric_refs.id`)}))
      ${canAccessPersonnelClinicalData(user) ? sql`` : sql`AND NOT jsonb_path_exists(${payload}, '$.**.kind ? (@ == "READAPTACAO")')`})`;
}
