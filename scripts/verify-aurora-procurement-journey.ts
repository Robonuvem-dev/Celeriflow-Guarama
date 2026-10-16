import assert from "node:assert/strict";
import { config } from "dotenv";
import { Prisma, type PrismaClient } from "@prisma/client";
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
  const { prisma } = await import("../src/lib/prisma");
  const evidence: unknown[] = [];
  const counts = async () => ({ processes: await prisma.purchaseProcess.count(), contracts: await prisma.contract.count(), receipts: await prisma.purchaseReceipt.count(), stocks: await prisma.materialStock.count(), movements: await prisma.materialMovement.count(), requests: await prisma.materialRequest.count(), expenses: await prisma.expense.count(), commitments: await prisma.commitment.count(), settlements: await prisma.settlement.count(), payments: await prisma.payment.count(), treasury: await prisma.treasuryMovement.count(), revenues: await prisma.revenue.count(), taxAssessments: await prisma.taxAssessment.count(), taxPayments: await prisma.taxPayment.count(), taxProfiles: await prisma.taxRegistryEntry.count(), assets: await prisma.asset.count(), accountingTransactions: await prisma.accountingTransaction.count(), accountingEntries: await prisma.accountingEntry.count() });
  try {
    const before = await counts();
    const mappingsBefore = await prisma.taxFinancialMapping.findMany({ orderBy: { id: "asc" } });
    const profilesBefore = await prisma.taxRegistryEntry.findMany({ where: { category: "ACCOUNTING_PROFILE" }, orderBy: { id: "asc" } });
    let failure: unknown;
    try {
      await prisma.$transaction(async tx => {
        // Domain transactions share this outer transaction; every rehearsal fact is rolled back.
        const db = new Proxy(tx, { get(target, property) {
          if (property === "$transaction") return (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx);
          return Reflect.get(target, property);
        } }) as unknown as PrismaClient;
        const user = await tx.usuario.findUniqueOrThrow({ where: { id: "cmv2sbpnj000106lbisa3zhwf" }, include: { unidadesGestoras: true } });
        const actor = { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: user.unidadesGestoras.map(item => item.budgetUnitId) };
        const supplier = await tx.supplier.findUnique({ where: { personId: "p1-poc-person-2" } }) ?? await tx.supplier.create({ data: { personId: "p1-poc-person-2", notes: "Transient supplier in rolled-back operational rehearsal" } });
        const administrator = await tx.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, include: { perfil: true } });
        assert.ok(administrator.ativo && administrator.perfil.codigo === "SYSTEM_ADMINISTRATOR");
        const requesterActor = { usuarioId: administrator.id, employeeId: administrator.employeeId };
        const document = await tx.document.create({ data: { title: "Transient receiving evidence", documentType: "Recebimento", fileUrl: "https://fixture.invalid/recebimento", status: "Válido" } });
        for (const suffix of ["exe", "leg"] as const) {
          const request = await tx.purchaseRequest.findUniqueOrThrow({ where: { id: `${key}:request:${suffix}` } });
          assert.equal(request.status, "Rascunho", "Preservar solicitações já operadas pelo usuário.");
          await approvePurchaseRequest(db, actor, request.id);
          const process = await createPurchaseProcessFromApprovedRequests(db, actor, { purchaseRequestIds: [request.id], number: `REHEARSAL-PROC-${suffix}`, type: "Comum", idempotencyKey: `REHEARSAL-PROC-${suffix}` });
          const items = await tx.purchaseProcessItem.findMany({ where: { purchaseProcessId: process.id } });
          assert.equal(items.length, 3);
          const contract = await tx.contract.create({ data: { number: `REHEARSAL-CONTRACT-${suffix}`, object: request.object, initialValue: 3835, updatedValue: 3835,
            startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "Vigente", processId: process.id, supplierId: supplier.id,
            secretariatId: request.secretariatId, sourceBudgetUnitId: `p0-current-${suffix}-ug-1` } });
          const receiverId = suffix === "exe" ? "aurora-procurement-actors-2026-v1:receiver" : `${key}:receiver:leg`;
          const receiptItems = [];
          for (const group of ["consumption", "asset"]) {
            const selectedItems = items.filter(item => (item.materialId === `${key}:material-desktop`) === (group === "asset"));
            const input = { number: `REHEARSAL-REC-${suffix}-${group}`, receivedAt: new Date("2026-10-13T12:00:00Z"), contractId: contract.id, documentId: document.id,
              receiverId, attesterId: actor.employeeId!, idempotencyKey: `REHEARSAL-REC-${suffix}-${group}`,
              items: selectedItems.map(item => ({ purchaseProcessItemId: item.id, materialId: item.materialId!, warehouseId: `${key}:warehouse:${suffix}`, quantity: item.quantity, unitCost: item.estimatedUnitValue! })),
            };
            const receipt = await approvePurchaseReceipt(db, actor, input);
            assert.equal((await approvePurchaseReceipt(db, actor, input)).id, receipt.id);
            const received = await tx.purchaseReceiptItem.findMany({ where: { purchaseReceiptId: receipt.id } });
            receiptItems.push(...received);
            if (financial && group === "asset") {
              const date = input.receivedAt, appropriationId = `${key}:appropriation:${suffix}:1`;
              const expense = await createExpenseRequestFromApprovedPurchaseReceipt(db, requesterActor, { purchaseReceiptId: receipt.id, date, description: "Equipamento recebido para uso administrativo", value: "3500", appropriationId, secretariatId: request.secretariatId });
              await approveExpenseRequest(db, actor, expense.id);
              const reservation = await createBudgetReservation(db, requesterActor, { number: `REHEARSAL-RES-${suffix}`, date, value: "3500", appropriationId, expenseId: expense.id });
              const commitment = await createCommitment(db, requesterActor, { number: `REHEARSAL-NE-${suffix}`, date, value: "3500", type: "Ordinário", history: "Aquisição de equipamento administrativo recebido", appropriationId, supplierId: supplier.id, reservationId: reservation.id, contractId: contract.id });
              assert.equal(commitment.purchaseReceiptId, receipt.id);
              const liquidation = await createSettlementFromPurchaseReceiptAuthorization(db, actor, { purchaseReceiptId: receipt.id, commitmentId: commitment.id, date, fiscalDocumentNumber: `REHEARSAL-NF-${suffix}`, fiscalDocumentIssueDate: date, retentionRuleIds: [] });
              const postings = await tx.accountingTransaction.findMany({ where: { OR: [{ sourceType: "COMMITMENT", sourceId: commitment.id }, { sourceType: "SETTLEMENT", sourceId: liquidation.settlement.id }] }, include: { entries: true } });
              assert.equal(postings.length, 2);
              for (const posting of postings) {
                assert.equal(posting.governmentEntityId, `p0-current-${suffix}`);
                assert.equal(posting.budgetUnitId, `p0-current-${suffix}-ug-1`);
                assert.equal(posting.entries.length, 2);
                for (const entry of posting.entries) {
                  const snapshot = entry.classificationSnapshot as Prisma.JsonObject;
                  const attributes = snapshot.attributes as Prisma.JsonObject;
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
                const bank = await tx.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });
                const scopedActor = { ...actor, allowedBudgetUnitIds: [budgetUnitId] };
                // Arrecadação nativa transitória financia o ensaio; nenhuma entrada de caixa é fabricada.
                await configureTaxFinancialMapping(db, requesterActor, { taxId: "tax_iptu", revenueNatureId: "aurora-revenue:1.1.1.2.50.0.1.00.00.00.00.00", resourceSourceId: bank.resourceSourceId!, defaultBankAccountId: bank.id });
                const profileId = `aurora-tax-profile:tax_iptu:${budgetUnitId}:2026:v1`;
                if (!await tx.taxRegistryEntry.findUnique({ where: { id: profileId } })) {
                  const source = await tx.taxRegistryEntry.findUniqueOrThrow({ where: { id: "aurora-tax-profile:tax_iptu:p0-current-exe-ug-1:2026:v1" } });
                  await tx.taxRegistryEntry.create({ data: { id: profileId, entityType: "TAX", entityId: "tax_iptu", category: "ACCOUNTING_PROFILE", title: "Reconhecimento tributário por UG", status: "ATIVO", source: "MUNICIPAL", effectiveFrom: source.effectiveFrom, effectiveUntil: source.effectiveUntil, actorUsuarioId: administrator.id, data: { ...(source.data as Prisma.JsonObject), budgetUnitId, governmentEntityId: `p0-current-${suffix}` } } });
                }
                const taxpayer = await tx.taxpayer.findFirst({ where: { personId: "p1-poc-person-2", status: "Ativo" } }) ?? await tx.taxpayer.create({ data: { personId: "p1-poc-person-2", taxpayerType: "PF", status: "Ativo" } });
                const opening = await getBankAccountBalance(tx, bank.id, date);
                const assessment = await createTaxAssessment(db, scopedActor, { year: 2026, taxId: "tax_iptu", taxpayerId: taxpayer.id, taxableBase: "350000", rate: "1", competence: date });
                const guide = await generateTaxGuide(db, scopedActor, { assessmentId: assessment.id, dueDate: new Date("2026-10-31") });
                await confirmTaxPayment(db, scopedActor, { guideId: guide.id, amountPaid: "3500", paymentDate: date, paymentMethod: "Manual", idempotencyKey: `REHEARSAL-FUNDING-${suffix}`, bankAccountId: bank.id });
                assert.equal((await getBankAccountBalance(tx, bank.id, date)).minus(opening).toFixed(2), "3500.00");
                const payment = await createPayment(db, scopedActor, { orderNumber: `REHEARSAL-OP-${suffix}`, date, value: "3500", commitmentId: commitment.id, settlementId: liquidation.settlement.id, bankAccountId: bank.id, supplierId: supplier.id, paymentMethod: "Transferência" });
                await assert.rejects(updatePaymentStatus(db, { ...scopedActor, allowedBudgetUnitIds: [] }, payment.id, "Paga"), /unidades autorizadas/);
                await updatePaymentStatus(db, scopedActor, payment.id, "Paga");
                await updatePaymentStatus(db, scopedActor, payment.id, "Paga");
                const posting = await tx.accountingTransaction.findFirstOrThrow({ where: { sourceType: "PAYMENT", sourceId: payment.id }, include: { entries: true } });
                assert.equal(posting.governmentEntityId, `p0-current-${suffix}`);
                assert.equal(posting.budgetUnitId, budgetUnitId);
                assert.equal(posting.entries.length, 2);
                assert.ok(posting.entries.some(entry => entry.accountId === "aurora-payment-posting-matrix-2026-v1:account:paid" && entry.type === "Crédito" && entry.valueDecimal!.eq("3500")));
                assert.equal(await tx.treasuryMovement.count({ where: { sourceType: "PAYMENT", sourceId: payment.id, eventType: "PAYMENT_CONFIRMED" } }), 1);
                assert.equal((await getBankAccountBalance(tx, bank.id, date)).toFixed(2), opening.toFixed(2));
                await reversePayment(db, scopedActor, payment.id, "Devolução fundamentada da ordem de pagamento");
                const reversal = await tx.accountingTransaction.findUniqueOrThrow({ where: { reversalOfId: posting.id }, include: { entries: true } });
                assert.equal(reversal.entries.length, 2);
                assert.equal((await getBankAccountBalance(tx, bank.id)).minus(opening).toFixed(2), "3500.00");
                evidence.push({ entity: suffix, paymentId: payment.id, nativeTaxFunding: "3500.00", paidGross: "3500.00", paymentReplay: true, unauthorizedPaymentRejected: true, originalPostingReversed: true, treasuryRefund: "3500.00", scope: budgetUnitId });
              }
            }
          }
          assert.equal(receiptItems.length, 3);
          const paper = receiptItems.find(item => item.materialId === "aurora-shared-catalogs-2026-v1:material:AUR-EXP-001")!;
          assert.ok(paper);
          const stock = await tx.materialStock.findUniqueOrThrow({ where: { warehouseId_materialId_batchNumber: { warehouseId: paper.warehouseId, materialId: paper.materialId, batchNumber: "" } } });
          assert.equal(stock.quantity, 10);
          const materialRequest = await tx.materialRequest.create({ data: { number: `REHEARSAL-REQ-${suffix}`, departmentId: request.departmentId!, requesterId: request.requesterId,
            items: { create: { materialId: paper.materialId, quantityRequested: 2 } } }, include: { items: true } });
          await approveMaterialRequest(db, actor, { requestId: materialRequest.id, quantities: [{ itemId: materialRequest.items[0].id, quantityApproved: 2 }] });
          const issued = await issueMaterialRequestItem(db, actor, { requestItemId: materialRequest.items[0].id, stockId: stock.id, quantity: 2 });
          assert.equal(issued.status, "Atendida");
          assert.equal((await tx.materialStock.findUniqueOrThrow({ where: { id: stock.id } })).quantity, 8);
          evidence.push({ entity: suffix, requestApproved: true, processItems: items.length, receiptItems: receiptItems.length, receiptReplay: true, physicalPaperBefore: 10, physicalPaperAfter: 8, materialRequestStatus: issued.status,
            limit: financial ? "Transient contract/document; budget execution and receipt-linked asset incorporation verified. Patrimonial accounting recognition, stock monetary valuation, cost and opening balances remain separate validations." : "Transient contract and document; physical stock journey only. Financial commitment, valuation, cost and asset incorporation require their own reconciled origins." });
        }
        throw rollback;
      }, { timeout: 120000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { if (error !== rollback) failure = error; }
    const after = await counts();
    assert.deepEqual(after, before, "A conferência deve devolver as contagens anteriores.");
    assert.deepEqual(await prisma.taxFinancialMapping.findMany({ orderBy: { id: "asc" } }), mappingsBefore, "Preservar os mapeamentos financeiros após o ensaio.");
    assert.deepEqual(await prisma.taxRegistryEntry.findMany({ where: { category: "ACCOUNTING_PROFILE" }, orderBy: { id: "asc" } }), profilesBefore, "Preservar os perfis contábeis após o ensaio.");
    for (const suffix of ["exe", "leg"]) assert.equal((await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: `${key}:request:${suffix}` } })).status, "Rascunho");
    console.log(JSON.stringify({ evidence, rollbackVerified: true, financialRequested: financial, paymentsRequested: payments, failure: failure instanceof Error ? failure.message : null, before, after }, null, 2));
    if (failure) throw failure;
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência de suprimentos."); process.exitCode = 1; });
