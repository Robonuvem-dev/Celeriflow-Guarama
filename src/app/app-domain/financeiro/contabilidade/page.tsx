import { accountingTrialBalance } from "@/lib/financeiro";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import ContabilidadeClient from "./ContabilidadeClient";

export const dynamic = "force-dynamic";

export default async function ContabilidadePage() {
  const { prisma, user } = await getTenantContextForModule("FINANCEIRO");
  const permittedUnits = await prisma.budgetUnit.findMany({ where: isSystemAdministrator(user) ? {} : { id: { in: user.allowedBudgetUnitIds } }, select: { id: true, name: true, planningEntityUnit: { select: { governmentEntityId: true, governmentEntity: { select: { name: true, type: true } } } } }, orderBy: { code: "asc" } });
  const units = permittedUnits.flatMap((unit) => unit.planningEntityUnit ? [{ id: unit.id, name: unit.name, governmentEntityId: unit.planningEntityUnit.governmentEntityId, governmentEntityName: unit.planningEntityUnit.governmentEntity.name, governmentEntityType: unit.planningEntityUnit.governmentEntity.type }] : []);
  const entityIds = [...new Set(units.map((unit) => unit.governmentEntityId))];
  const budgetUnitIds = units.map((unit) => unit.id);
  const [years, accounts, transactions, monthlyCloses, annualCloses] = await Promise.all([
    prisma.financialYear.findMany({ where: { governmentEntityId: { in: entityIds } }, include: { governmentEntity: { select: { name: true } } }, orderBy: { year: "desc" } }),
    prisma.accountingPlan.findMany({ orderBy: { code: "asc" } }),
    prisma.accountingTransaction.findMany({ where: { budgetUnitId: { in: budgetUnitIds } }, include: { entries: { include: { account: true } } }, orderBy: { date: "desc" }, take: 20 }),
    prisma.monthlyAccountingClose.findMany({ where: { financialYear: { governmentEntityId: { in: entityIds } } }, include: { events: { include: { requestedByUsuario: { select: { nome: true } }, authorizedByUsuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" } }, financialYear: { select: { year: true, governmentEntity: { select: { name: true } } } } }, orderBy: { competence: "desc" }, take: 24 }),
    prisma.annualAccountingClose.findMany({ where: { financialYear: { governmentEntityId: { in: entityIds } } }, include: { financialYear: { select: { year: true, governmentEntity: { select: { name: true } } } }, closedByUsuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const activeYear = years.find((year) => year.status === "Aberto") ?? years[0];
  const trialBalance = activeYear ? await accountingTrialBalance(prisma, activeYear.id, undefined, budgetUnitIds) : [];
  return <ContabilidadeClient units={units} years={years.map((year) => ({ id: year.id, year: year.year, status: year.status, governmentEntityId: year.governmentEntityId, governmentEntityName: year.governmentEntity?.name ?? "Legado sem entidade" }))} accounts={accounts.map((account) => ({ id: account.id, code: account.code, name: account.name }))} transactions={transactions.map((transaction) => ({ id: transaction.id, date: transaction.date.toISOString(), history: transaction.history, status: transaction.status, entries: transaction.entries.map((entry) => ({ id: entry.id, type: entry.type, value: entry.valueDecimal?.toString() ?? String(entry.value), account: `${entry.account.code} - ${entry.account.name}` })) }))} trialBalance={trialBalance.map((row) => ({ account: `${row.account.code} - ${row.account.name}`, debit: row.debit.toString(), credit: row.credit.toString(), balance: row.balance.toString() }))} monthlyCloses={monthlyCloses.map((close) => ({ id: close.id, year: close.financialYear.year, competence: close.competence.toISOString(), status: close.status, closedAt: close.closedAt?.toISOString(), events: close.events.map((event) => ({ id: event.id, action: event.action, justification: event.justification, requestedBy: event.requestedByUsuario.nome, authorizedBy: event.authorizedByUsuario?.nome, requestedAt: event.requestedAt.toISOString(), authorizedAt: event.authorizedAt?.toISOString() })) }))} annualCloses={annualCloses.map((close) => ({ id: close.id, year: close.financialYear.year, status: close.status, closedBy: close.closedByUsuario?.nome, closedAt: close.closedAt?.toISOString() }))} />;
}
