import test from "node:test";
import { assertArchivedInventory, assertBoundCall, assertDrizzleOnly, assertJsxValues, assertOperationalRenderer, assertVariableValue, currentSources } from "./helpers/table-migration-contracts";

const root = "src/app/app-domain/financeiro";

test("Financeiro: inventário histórico + adições revisadas e todos os TSX Drizzle-only", () => {
  const files = currentSources(root);
  assertArchivedInventory("finance", files);
  assertDrizzleOnly(files);
});

// The former optional FINANCE_PAGES_VISUAL_BASE comparison froze authorized UI
// changes and skipped in CI. This always-on contract checks operations and data,
// while the original 64-path inventory is retained independently in provenance.
test("Financeiro atual: escopo UG, permissões de mutação, ações e payload N:N integral", () => {
  const page = `${root}/pagamentos/page.tsx`, client = `${root}/pagamentos/PagamentosClient.tsx`, actions = `${root}/pagamentos/actions.ts`;
  assertBoundCall(page, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"FINANCEIRO"']);
  assertVariableValue(page, "executor", "context.database ?? db");
  assertVariableValue(page, "access", "{ allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }");
  for (const name of ["listFinancePagePayments", "listFinancePageCommitments", "listFinancePageSettlements", "listFinancePageWithholdings"]) assertBoundCall(page, `@/db/repositories/finance-pages/${name === "listFinancePagePayments" ? "banking" : "operations"}`, name, ["executor", "access"]);
  for (const operation of ["create", "update", "delete"]) assertBoundCall(actions, "@/lib/platform/tenant-context", "getTenantContextForModuleOperation", ['"FINANCEIRO"', JSON.stringify(operation)]);
  assertBoundCall(actions, "@/lib/platform/tenant-context", "assertBudgetUnitAccess", ["context.user", "commitment.appropriation.budgetUnitId"]);
  for (const name of ["createPayment", "cancelPayment", "updatePaymentStatus", "reversePaymentAction", "settleWithholdingPayableAction"]) assertBoundCall(client, "./actions", name);
  assertOperationalRenderer(page);
  const allocation = `${root}/conciliacao-bancaria/ReconciliationAllocationForm.tsx`;
  assertBoundCall(allocation, "./actions", "allocateReconciliationAction", ["{ sessionId, reason, idempotencyKey: key, allocations: rows }"]);
  assertBoundCall(allocation, "../draft-rows", "submitDraft");
  assertJsxValues(allocation, "FinanceTablePanel", { searchable: "false", preferenceId: '"financeiro-alocacoes-rascunho"' });
  assertOperationalRenderer(allocation, "ReconciliationAllocationForm");
  for (const file of ["CostDistributionDraft", "FiscalTermsDraft", "AnnualBudgetDraft"]) assertOperationalRenderer(`${root}/${file}.tsx`);
});
