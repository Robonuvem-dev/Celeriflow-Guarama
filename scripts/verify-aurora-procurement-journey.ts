import assert from "node:assert/strict";
import { config } from "dotenv";
import { and, count, eq, or } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import type { JsonObject } from "../src/db/json";
import { users, accessProfiles, userBudgetUnits } from "../src/db/schema/identity";
import { suppliers, documents, taxpayers } from "../src/db/schema/registry";
import { purchaseProcesses, purchaseProcessItems, procurementContracts } from "../src/db/schema/procurement-core";
import { purchaseRequests, purchaseReceipts, purchaseReceiptItems } from "../src/db/schema/procurement-requests";
import { materialStocks, materialMovements } from "../src/db/schema/assets-stock";
import { materialRequests, materialRequestItems } from "../src/db/schema/assets-requests";
import { assets } from "../src/db/schema/assets";
import { expenses } from "../src/db/schema/finance-expenses";
import { procurementCommitments, procurementSettlements, procurementPayments } from "../src/db/schema/procurement-finance";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { revenues } from "../src/db/schema/finance-revenues";
import { accountingTransactions, accountingEntries } from "../src/db/schema/finance-accounting";
import { taxAssessments } from "../src/db/schema/taxation-core";
import { taxPayments, taxFinancialMappings } from "../src/db/schema/tax-accounting";
import { taxRegistryEntries } from "../src/db/schema/taxation-registry";
import { approvePurchaseRequest, createPurchaseProcessFromApprovedRequests, approvePurchaseReceipt, approveMaterialRequest, issueMaterialRequestItem } from "../src/lib/compras/procurement-lifecycle";
import { createExpenseRequestFromApprovedPurchaseReceipt, approveExpenseRequest, createBudgetReservation, createCommitment, createPayment, updatePaymentStatus, reversePayment, getBankAccountBalance } from "../src/lib/financeiro";
import { configureTaxFinancialMapping, createTaxAssessment, generateTaxGuide, confirmTaxPayment } from "../src/lib/tributacao";
import { createSettlementFromPurchaseReceiptAuthorization } from "../src/lib/compras/procurement-finance-bridge";
import { acquireAssetFromPurchaseReceipt } from "../src/lib/patrimonio/asset-acquisition-service";
import { resolveAccountClassificationSnapshots } from "../src/lib/financeiro/account-catalog";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const key = "aurora-procurement-drafts-2026-v1";
const rollback = new Error("ROLLBACK_OPERATIONAL_REHEARSAL");
const payments = process.argv.includes("--payments");
const financial = process.argv.includes("--financial") || payments;

async function main() {
  const { db: database, databaseConnection: connection } = await import("../src/db/client");
  const evidence: unknown[] = [];
  const counts = async () => ({
    processes: (await database.select({ total: count() }).from(purchaseProcesses))[0].total,
    contracts: (await database.select({ total: count() }).from(procurementContracts))[0].total,
    receipts: (await database.select({ total: count() }).from(purchaseReceipts))[0].total,
    stocks: (await database.select({ total: count() }).from(materialStocks))[0].total,
    movements: (await database.select({ total: count() }).from(materialMovements))[0].total,
    requests: (await database.select({ total: count() }).from(materialRequests))[0].total,
    expenses: (await database.select({ total: count() }).from(expenses))[0].total,
    commitments: (await database.select({ total: count() }).from(procurementCommitments))[0].total,
    settlements: (await database.select({ total: count() }).from(procurementSettlements))[0].total,
    payments: (await database.select({ total: count() }).from(procurementPayments))[0].total,
    treasury: (await database.select({ total: count() }).from(reconciliationTreasuryMovements))[0].total,
    revenues: (await database.select({ total: count() }).from(revenues))[0].total,
    taxAssessments: (await database.select({ total: count() }).from(taxAssessments))[0].total,
    taxPayments: (await database.select({ total: count() }).from(taxPayments))[0].total,
    taxProfiles: (await database.select({ total: count() }).from(taxRegistryEntries))[0].total,
    assets: (await database.select({ total: count() }).from(assets))[0].total,
    accountingTransactions: (await database.select({ total: count() }).from(accountingTransactions))[0].total,
    accountingEntries: (await database.select({ total: count() }).from(accountingEntries))[0].total,
  });
  try {
    const before = await counts();
    const mappingsBefore = await database.select().from(taxFinancialMappings).orderBy(taxFinancialMappings.id);
    const profilesBefore = await database.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "ACCOUNTING_PROFILE")).orderBy(taxRegistryEntries.id);
    let failure: unknown;
    try {
      await withDatabaseTransaction(connection, async tx => {
        // Direct service reads (connection.db) and nested native savepoints must
        // both see the same uncommitted rehearsal facts.
        const db = { db: tx, pool: connection.pool };
        return inDatabaseTransactionScope(db, tx, async () => {
        const [user] = await tx.select().from(users).where(eq(users.id, "cmv2sbpnj000106lbisa3zhwf")).limit(1);
        assert.ok(user, "Usuário do ensaio não encontrado.");
        const units = await tx.select().from(userBudgetUnits).where(eq(userBudgetUnits.usuarioId, user.id));
        const actor = { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: units.map(item => item.budgetUnitId) };
        const supplier = (await tx.select().from(suppliers).where(eq(suppliers.personId, "p1-poc-person-2")).limit(1))[0]
          ?? (await tx.insert(suppliers).values({ personId: "p1-poc-person-2", notes: "Transient supplier in rolled-back operational rehearsal" }).returning())[0];
        const [administratorRow] = await tx.select({ user: users, profileCode: accessProfiles.codigo }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(eq(users.email, "admin@email.com")).limit(1);
        assert.ok(administratorRow, "Administrador do ensaio não encontrado.");
        const administrator = administratorRow.user;
        assert.ok(administrator.ativo && administratorRow.profileCode === "SYSTEM_ADMINISTRATOR");
        const requesterActor = { usuarioId: administrator.id, employeeId: administrator.employeeId };
        const [document] = await tx.insert(documents).values({ title: "Transient receiving evidence", documentType: "Recebimento", fileUrl: "https://fixture.invalid/recebimento", status: "Válido" }).returning();
        for (const suffix of ["exe", "leg"] as const) {
          const [request] = await tx.select().from(purchaseRequests).where(eq(purchaseRequests.id, `${key}:request:${suffix}`)).limit(1);
          assert.ok(request, `Solicitação ${suffix} não encontrada.`);
          assert.equal(request.status, "Rascunho", "Preservar solicitações já operadas pelo usuário.");
          await approvePurchaseRequest(db, actor, request.id);
          const process = await createPurchaseProcessFromApprovedRequests(db, actor, { purchaseRequestIds: [request.id], number: `REHEARSAL-PROC-${suffix}`, type: "Comum", idempotencyKey: `REHEARSAL-PROC-${suffix}` });
          const items = await tx.select().from(purchaseProcessItems).where(eq(purchaseProcessItems.purchaseProcessId, process.id));
          assert.equal(items.length, 3);
          const [contract] = await tx.insert(procurementContracts).values({ number: `REHEARSAL-CONTRACT-${suffix}`, object: request.object, initialValue: 3835, updatedValue: 3835,
            startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "Vigente", processId: process.id, supplierId: supplier.id,
            secretariatId: request.secretariatId, sourceBudgetUnitId: `p0-current-${suffix}-ug-1` }).returning();
          const receiverId = suffix === "exe" ? "aurora-procurement-actors-2026-v1:receiver" : `${key}:receiver:leg`;
          const receiptItems: Array<typeof purchaseReceiptItems.$inferSelect> = [];
          for (const group of ["consumption", "asset"]) {
            const selectedItems = items.filter(item => (item.materialId === `${key}:material-desktop`) === (group === "asset"));
            const input = { number: `REHEARSAL-REC-${suffix}-${group}`, receivedAt: new Date("2026-10-13T12:00:00Z"), contractId: contract.id, documentId: document.id,
              receiverId, attesterId: actor.employeeId!, idempotencyKey: `REHEARSAL-REC-${suffix}-${group}`,
              items: selectedItems.map(item => ({ purchaseProcessItemId: item.id, materialId: item.materialId!, warehouseId: `${key}:warehouse:${suffix}`, quantity: item.quantity, unitCost: item.estimatedUnitValue! })),
            };
            const receipt = await approvePurchaseReceipt(db, actor, input);
            assert.equal((await approvePurchaseReceipt(db, actor, input)).id, receipt.id);
            const received = await tx.select().from(purchaseReceiptItems).where(eq(purchaseReceiptItems.purchaseReceiptId, receipt.id));
            receiptItems.push(...received);
            if (financial && group === "asset") {
              const date = input.receivedAt, appropriationId = `${key}:appropriation:${suffix}:1`;
              const expense = await createExpenseRequestFromApprovedPurchaseReceipt(db, requesterActor, { purchaseReceiptId: receipt.id, date, description: "Equipamento recebido para uso administrativo", value: "3500", appropriationId, secretariatId: request.secretariatId });
              await approveExpenseRequest(db, actor, expense.id);
              const reservation = await createBudgetReservation(db, requesterActor, { number: `REHEARSAL-RES-${suffix}`, date, value: "3500", appropriationId, expenseId: expense.id });
              const commitment = await createCommitment(db, requesterActor, { number: `REHEARSAL-NE-${suffix}`, date, value: "3500", type: "Ordinário", history: "Aquisição de equipamento administrativo recebido", appropriationId, supplierId: supplier.id, reservationId: reservation.id, contractId: contract.id });
              assert.equal(commitment.purchaseReceiptId, receipt.id);
              const liquidation = await createSettlementFromPurchaseReceiptAuthorization(db, actor, { purchaseReceiptId: receipt.id, commitmentId: commitment.id, date, fiscalDocumentNumber: `REHEARSAL-NF-${suffix}`, fiscalDocumentIssueDate: date, retentionRuleIds: [] });
              const postings = await tx.select().from(accountingTransactions).where(or(and(eq(accountingTransactions.sourceType, "COMMITMENT"), eq(accountingTransactions.sourceId, commitment.id)), and(eq(accountingTransactions.sourceType, "SETTLEMENT"), eq(accountingTransactions.sourceId, liquidation.settlement.id))));
              assert.equal(postings.length, 2);
              for (const posting of postings) {
                assert.equal(posting.governmentEntityId, `p0-current-${suffix}`);
                assert.equal(posting.budgetUnitId, `p0-current-${suffix}-ug-1`);
                const entries = await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posting.id));
                assert.equal(entries.length, 2);
                for (const entry of entries) {
                  const snapshot = entry.classificationSnapshot as JsonObject;
                  const attributes = snapshot.attributes as JsonObject;
                  assert.equal(attributes.governmentEntityId, posting.governmentEntityId);
                  assert.equal(attributes.budgetUnitId, posting.budgetUnitId);
                  assert.equal(attributes.informationNature, "O");
                  assert.equal(entry.valueDecimal!.toFixed(2), "3500.00");
                }
              }
              await assert.rejects(resolveAccountClassificationSnapshots(tx, [{ id: "aurora-budget-posting-matrix-2026-v1:account:available" }], date, { governmentEntityId: `p0-current-${suffix}`, budgetUnitId: `p0-current-${suffix}-ug-2` }), /versão vigente única/);
              const asset = await acquireAssetFromPurchaseReceipt(db, actor, { purchaseReceiptItemId: received[0].id, categoryId: `${key}:asset-category`, departmentId: request.departmentId!, responsibleId: receiverId });
              assert.equal(asset.budgetUnitId, `p0-current-${suffix}-ug-1`);
              assert.equal(asset.acquisitionValueDecimal!.toFixed(2), "3500.00");
              evidence.push({ entity: suffix, financialExpenseApproved: true, commitmentId: commitment.id, settlementId: liquidation.settlement.id, assetId: asset.id, assetValue: "3500.00", originBudgetUnit: asset.budgetUnitId, budgetPostings: 2, frozenClassificationEntries: 4, classificationOutsideAdoptedUnitRejected: true });
              if (payments) {
                const bankAccountId = `aurora-finance-control-2026-v1:bank:${suffix}`;
                const budgetUnitId = `p0-current-${suffix}-ug-1`;
                const [bank] = await tx.select().from(reconciliationBankAccounts).where(eq(reconciliationBankAccounts.id, bankAccountId)).limit(1);
                assert.ok(bank, `Conta bancária ${suffix} não encontrada.`);
                const scopedActor = { ...actor, allowedBudgetUnitIds: [budgetUnitId] };
                // Arrecadação nativa transitória financia o ensaio; nenhuma entrada de caixa é fabricada.
                await configureTaxFinancialMapping(db, requesterActor, { taxId: "tax_iptu", revenueNatureId: "aurora-revenue:1.1.1.2.50.0.1.00.00.00.00.00", resourceSourceId: bank.resourceSourceId!, defaultBankAccountId: bank.id });
                const profileId = `aurora-tax-profile:tax_iptu:${budgetUnitId}:2026:v1`;
                if (!(await tx.select({ id: taxRegistryEntries.id }).from(taxRegistryEntries).where(eq(taxRegistryEntries.id, profileId)).limit(1))[0]) {
                  const [source] = await tx.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, "aurora-tax-profile:tax_iptu:p0-current-exe-ug-1:2026:v1")).limit(1);
                  assert.ok(source, "Perfil tributário de origem não encontrado.");
                  await tx.insert(taxRegistryEntries).values({ id: profileId, entityType: "TAX", entityId: "tax_iptu", category: "ACCOUNTING_PROFILE", title: "Reconhecimento tributário por UG", status: "ATIVO", source: "MUNICIPAL", effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, actorUsuarioId: administrator.id, data: { ...(source.data as JsonObject), budgetUnitId, governmentEntityId: `p0-current-${suffix}` } });
                }
                const taxpayer = (await tx.select().from(taxpayers).where(and(eq(taxpayers.personId, "p1-poc-person-2"), eq(taxpayers.status, "Ativo"))).limit(1))[0]
                  ?? (await tx.insert(taxpayers).values({ personId: "p1-poc-person-2", taxpayerType: "PF", status: "Ativo" }).returning())[0];
                const opening = await getBankAccountBalance(tx, bank.id, date);
                const assessment = await createTaxAssessment(db, scopedActor, { year: 2026, taxId: "tax_iptu", taxpayerId: taxpayer.id, taxableBase: "350000", rate: "1", competence: date });
                const guide = await generateTaxGuide(db, scopedActor, { assessmentId: assessment.id, dueDate: new Date("2026-10-31") });
                await confirmTaxPayment(db, scopedActor, { guideId: guide.id, amountPaid: "3500", paymentDate: date, paymentMethod: "Manual", idempotencyKey: `REHEARSAL-FUNDING-${suffix}`, bankAccountId: bank.id });
                assert.equal((await getBankAccountBalance(tx, bank.id, date)).minus(opening).toFixed(2), "3500.00");
                const payment = await createPayment(db, scopedActor, { orderNumber: `REHEARSAL-OP-${suffix}`, date, value: "3500", commitmentId: commitment.id, settlementId: liquidation.settlement.id, bankAccountId: bank.id, supplierId: supplier.id, paymentMethod: "Transferência" });
                await assert.rejects(updatePaymentStatus(db, { ...scopedActor, allowedBudgetUnitIds: [] }, payment.id, "Paga"), /unidades autorizadas/);
                await updatePaymentStatus(db, scopedActor, payment.id, "Paga");
                await updatePaymentStatus(db, scopedActor, payment.id, "Paga");
                const [posting] = await tx.select().from(accountingTransactions).where(and(eq(accountingTransactions.sourceType, "PAYMENT"), eq(accountingTransactions.sourceId, payment.id))).limit(1);
                assert.ok(posting, "Postagem do pagamento não encontrada.");
                const entries = await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, posting.id));
                assert.equal(posting.governmentEntityId, `p0-current-${suffix}`);
                assert.equal(posting.budgetUnitId, budgetUnitId);
                assert.equal(entries.length, 2);
                assert.ok(entries.some(entry => entry.accountId === "aurora-payment-posting-matrix-2026-v1:account:paid" && entry.type === "Crédito" && entry.valueDecimal!.eq("3500")));
                assert.equal((await tx.select({ total: count() }).from(reconciliationTreasuryMovements).where(and(eq(reconciliationTreasuryMovements.sourceType, "PAYMENT"), eq(reconciliationTreasuryMovements.sourceId, payment.id), eq(reconciliationTreasuryMovements.eventType, "PAYMENT_CONFIRMED"))))[0].total, 1);
                assert.equal((await getBankAccountBalance(tx, bank.id, date)).toFixed(2), opening.toFixed(2));
                await reversePayment(db, scopedActor, payment.id, "Devolução fundamentada da ordem de pagamento");
                const [reversal] = await tx.select().from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, posting.id)).limit(1);
                assert.ok(reversal, "Estorno contábil não encontrado.");
                const reversalEntries = await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, reversal.id));
                assert.equal(reversalEntries.length, 2);
                assert.equal((await getBankAccountBalance(tx, bank.id)).minus(opening).toFixed(2), "3500.00");
                evidence.push({ entity: suffix, paymentId: payment.id, nativeTaxFunding: "3500.00", paidGross: "3500.00", paymentReplay: true, unauthorizedPaymentRejected: true, originalPostingReversed: true, treasuryRefund: "3500.00", scope: budgetUnitId });
              }
            }
          }
          assert.equal(receiptItems.length, 3);
          const paper = receiptItems.find(item => item.materialId === "aurora-shared-catalogs-2026-v1:material:AUR-EXP-001")!;
          assert.ok(paper);
          const [stock] = await tx.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, paper.warehouseId), eq(materialStocks.materialId, paper.materialId), eq(materialStocks.batchNumber, ""))).limit(1);
          assert.ok(stock, "Estoque físico do papel não encontrado.");
          assert.equal(stock.quantity, 10);
          const [materialRequest] = await tx.insert(materialRequests).values({ number: `REHEARSAL-REQ-${suffix}`, departmentId: request.departmentId!, requesterId: request.requesterId }).returning();
          const [materialRequestItem] = await tx.insert(materialRequestItems).values({ requestId: materialRequest.id, materialId: paper.materialId, quantityRequested: 2 }).returning();
          await approveMaterialRequest(db, actor, { requestId: materialRequest.id, quantities: [{ itemId: materialRequestItem.id, quantityApproved: 2 }] });
          const issued = await issueMaterialRequestItem(db, actor, { requestItemId: materialRequestItem.id, stockId: stock.id, quantity: 2 });
          assert.equal(issued.status, "Atendida");
          const [stockAfter] = await tx.select().from(materialStocks).where(eq(materialStocks.id, stock.id)).limit(1);
          assert.ok(stockAfter);
          assert.equal(stockAfter.quantity, 8);
          evidence.push({ entity: suffix, requestApproved: true, processItems: items.length, receiptItems: receiptItems.length, receiptReplay: true, physicalPaperBefore: 10, physicalPaperAfter: 8, materialRequestStatus: issued.status,
            limit: financial ? "Transient contract/document; budget execution and receipt-linked asset incorporation verified. Patrimonial accounting recognition, stock monetary valuation, cost and opening balances remain separate validations." : "Transient contract and document; physical stock journey only. Financial commitment, valuation, cost and asset incorporation require their own reconciled origins." });
        }
        throw rollback;
        });
      }, { timeoutMs: 120_000, isolationLevel: "serializable" });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before, "A conferência deve devolver as contagens anteriores.");
    assert.deepEqual(await database.select().from(taxFinancialMappings).orderBy(taxFinancialMappings.id), mappingsBefore, "Preservar os mapeamentos financeiros após o ensaio.");
    assert.deepEqual(await database.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.category, "ACCOUNTING_PROFILE")).orderBy(taxRegistryEntries.id), profilesBefore, "Preservar os perfis contábeis após o ensaio.");
    for (const suffix of ["exe", "leg"]) {
      const [request] = await database.select().from(purchaseRequests).where(eq(purchaseRequests.id, `${key}:request:${suffix}`)).limit(1);
      assert.ok(request);
      assert.equal(request.status, "Rascunho");
    }
    console.log(JSON.stringify({ evidence, rollbackVerified: true, financialRequested: financial, paymentsRequested: payments, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência de suprimentos."); process.exitCode = 1; });
