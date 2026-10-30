import { and, asc, eq, like, lt, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { randomUUID } from "node:crypto";
import { instanceParameters, systemInstances } from "../../schema/instance-configuration";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { cities } from "../../schema/localities";
import { employees, administrativeUnits } from "../../schema/administration";
import { users } from "../../schema/identity";
import { suppliers } from "../../schema/registry";
import { procurementContracts, contractAmendments, purchaseProcesses, priceResearches, purchaseProcessItems } from "../../schema/procurement-core";
import { purchaseReceipts } from "../../schema/procurement-requests";
import { parseProcurementAuxiliaryRecord, procurementAuxiliaryKey, type ProcurementAuxiliaryCatalog, type ProcurementAuxiliaryRecord } from "@/lib/compras/auxiliary-catalogs";

async function instanceId(db: DatabaseExecutor) {
  const [instance] = await db.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
  if (!instance) throw new Error("Configure a instância municipal antes dos cadastros de compras.");
  return instance.id;
}
export async function listProcurementAuxiliaryRecords(db: DatabaseExecutor, catalog: ProcurementAuxiliaryCatalog): Promise<ProcurementAuxiliaryRecord[]> {
  const id = await instanceId(db);
  const rows = await db.select().from(instanceParameters).where(and(eq(instanceParameters.configuracaoInstanciaId, id), like(instanceParameters.chave, `COMPRAS_CADASTRO:${catalog}:%`)));
  return rows.map(row => ({ id: row.chave.split(":")[2], ...parseProcurementAuxiliaryRecord(catalog, row.valor) })).sort((a,b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}
export async function saveProcurementAuxiliaryRecord(tx: DatabaseTransaction, catalog: ProcurementAuxiliaryCatalog, id: string | null, value: unknown) {
  const owner = await instanceId(tx);
  // Serialize catalog writes, including duplicate-code checks and subgroup links.
  await tx.execute(sql`SELECT id FROM "ConfiguracaoInstancia" WHERE id=${owner} FOR UPDATE`);
  const input = parseProcurementAuxiliaryRecord(catalog, value);
  if (["pca-requisitantes", "cotas-requisitantes"].includes(catalog) && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.fields.funcionarioId), eq(employees.isActive, true))).limit(1)).length) throw new Error("Requisitante ativo não encontrado.");
  if (catalog === "cidades-sicom" && !(await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, input.fields.cidadeId)).limit(1)).length) throw new Error("Cidade não encontrada.");
  if (catalog === "assinaturas-relatorios" && !(await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, input.fields.funcionarioId)).limit(1)).length) throw new Error("Funcionário não encontrado.");
  if (catalog === "requisitantes-finais" && !(await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.fields.funcionarioId), eq(employees.isActive, true))).limit(1)).length) throw new Error("Requisitante ativo não encontrado.");
  if (catalog === "usuarios-unidades") {
    if (!(await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.fields.usuarioId), eq(users.ativo, true))).limit(1)).length) throw new Error("Usuário ativo não encontrado.");
    if (!(await tx.select({ id: administrativeUnits.id }).from(administrativeUnits).where(and(eq(administrativeUnits.id, input.fields.unidadeAdministrativaId), eq(administrativeUnits.isActive, true))).limit(1)).length) throw new Error("Unidade administrativa ativa não encontrada.");
  }
  if (catalog === "requisitantes-finais") {
    const allowedUsers = [...new Set(input.fields.usuarios.split(",").map(value => value.trim()).filter(Boolean))];
    if (!allowedUsers.length || allowedUsers.length > 100) throw new Error("Selecione de 1 a 100 usuários autorizados.");
    for (const userId of allowedUsers) if (!(await tx.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.ativo, true))).limit(1)).length) throw new Error("Usuário autorizado não encontrado ou inativo.");
    input.fields.usuarios = allowedUsers.join(", ");
  }
  if (input.fields.fornecedorId && !(await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.fields.fornecedorId)).limit(1)).length) throw new Error("Fornecedor não encontrado.");
  if (input.fields.contratoId && !(await tx.select({ id: procurementContracts.id }).from(procurementContracts).where(eq(procurementContracts.id, input.fields.contratoId)).limit(1)).length) throw new Error("Contrato não encontrado.");
  if (catalog === "planilha-obras-aditivos" && !(await tx.select({ id: contractAmendments.id }).from(contractAmendments).where(and(eq(contractAmendments.id, input.fields.aditivoId), eq(contractAmendments.contractId, input.fields.contratoId))).limit(1)).length) throw new Error("Aditivo não pertence ao contrato informado.");
  if (input.fields.processoAlienacaoId && !(await listProcurementAuxiliaryRecords(tx, "alienacoes")).some(record => record.id === input.fields.processoAlienacaoId)) throw new Error("Processo de alienação não encontrado.");
  if (input.fields.processoId && !(await tx.select({ id: purchaseProcesses.id }).from(purchaseProcesses).where(eq(purchaseProcesses.id, input.fields.processoId)).limit(1)).length) throw new Error("Processo de compra não encontrado.");
  if (catalog === "cotacoes-itens") {
    const [research] = await tx.select().from(priceResearches).where(eq(priceResearches.id, input.fields.pesquisaId)).limit(1);
    if (!research || !(await tx.select({ id: purchaseProcessItems.id }).from(purchaseProcessItems).where(and(eq(purchaseProcessItems.id, input.fields.itemProcessoId), eq(purchaseProcessItems.purchaseProcessId, research.processId))).limit(1)).length) throw new Error("Item não pertence à pesquisa de preços.");
  }
  if (catalog === "atas-desconto") {
    const participants = [...new Set(input.fields.fornecedores.split(",").map(value => value.trim()).filter(Boolean))];
    if (!participants.length || participants.length > 100) throw new Error("Informe de 1 a 100 fornecedores participantes.");
    for (const participant of participants) if (!(await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, participant)).limit(1)).length) throw new Error("Fornecedor participante não encontrado.");
    input.fields.fornecedores = participants.join(", ");
  }
  const records = await listProcurementAuxiliaryRecords(tx, catalog);
  if (id && !records.some(record => record.id === id)) throw new Error("Cadastro não encontrado.");
  if (records.some(record => record.id !== id && record.code.toLocaleLowerCase("pt-BR") === input.code.toLocaleLowerCase("pt-BR"))) throw new Error("Código já cadastrado.");
  if (catalog === "pca-requisitantes") {
    if (!(await tx.select({ id: purchaseProcessItems.id }).from(purchaseProcessItems).where(and(eq(purchaseProcessItems.id, input.fields.itemProcessoId), eq(purchaseProcessItems.purchaseProcessId, input.fields.processoId))).limit(1)).length) throw new Error("Item não pertence à compra anterior.");
    if (!(await tx.select({ id: purchaseReceipts.id }).from(purchaseReceipts).where(and(eq(purchaseReceipts.purchaseProcessId, input.fields.processoId), lt(purchaseReceipts.receivedAt, new Date(`${input.fields.exercicio}-01-01T00:00:00Z`)))).limit(1)).length) throw new Error("Selecione uma compra com recebimento anterior ao exercício do PCA.");
  }
  if (catalog === "cotas-requisitantes") {
    const [contract] = await tx.select({ processId: procurementContracts.processId }).from(procurementContracts).where(eq(procurementContracts.id, input.fields.contratoId)).limit(1);
    if (!contract) throw new Error("Contrato não encontrado.");
    const [item] = await tx.select({ quantity: purchaseProcessItems.quantity }).from(purchaseProcessItems).where(and(eq(purchaseProcessItems.id, input.fields.itemProcessoId), eq(purchaseProcessItems.purchaseProcessId, contract.processId))).limit(1);
    if (!item) throw new Error("Item não pertence ao processo do contrato.");
    if (records.some(record => record.id !== id && record.fields.contratoId === input.fields.contratoId && record.fields.itemProcessoId === input.fields.itemProcessoId && record.fields.funcionarioId === input.fields.funcionarioId)) throw new Error("Requisitante já possui distribuição deste item.");
    const used = records.filter(record => record.id !== id && record.fields.contratoId === input.fields.contratoId && record.fields.itemProcessoId === input.fields.itemProcessoId).reduce((sum, record) => sum.plus(record.fields.quantidade.replace(",", ".")), new Decimal(0));
    if (used.plus(input.fields.quantidade.replace(",", ".")).gt(item.quantity)) throw new Error("Distribuição excede a quantidade contratada do item.");
    if (id && (await listProcurementAuxiliaryRecords(tx, "remanejamentos")).some(record => record.fields.cotaOrigemId === id || record.fields.cotaDestinoId === id)) throw new Error("Distribuição com apostilamentos só pode ser alterada por novo remanejamento.");
  }
  if (catalog === "usuarios-unidades" && records.some(record => record.id !== id && record.fields.usuarioId === input.fields.usuarioId && record.fields.unidadeAdministrativaId === input.fields.unidadeAdministrativaId)) throw new Error("Usuário já vinculado à unidade administrativa.");
  if (catalog === "requisitantes-finais" && records.some(record => record.id !== id && record.fields.funcionarioId === input.fields.funcionarioId)) throw new Error("Requisitante já cadastrado; edite seus acessos.");
  if (catalog === "remanejamentos") {
    if (id) throw new Error("Apostilamentos de remanejamento são imutáveis; registre novo ato.");
    const allocations = await listProcurementAuxiliaryRecords(tx, "cotas-requisitantes");
    const source = allocations.find(record => record.id === input.fields.cotaOrigemId);
    const target = allocations.find(record => record.id === input.fields.cotaDestinoId);
    if (!source || !target || source.id === target.id || source.fields.contratoId !== input.fields.contratoId || target.fields.contratoId !== input.fields.contratoId || source.fields.itemProcessoId !== target.fields.itemProcessoId) throw new Error("Selecione distribuições distintas do mesmo item e contrato.");
    const amount = new Decimal(input.fields.quantidade.replace(",", "."));
    const balance = new Decimal(source.fields.quantidade.replace(",", "."));
    if (amount.gt(balance)) throw new Error("Saldo insuficiente na distribuição de origem.");
    for (const [allocation, quantity] of [[source, balance.minus(amount)], [target, new Decimal(target.fields.quantidade.replace(",", ".")).plus(amount)]] as const) {
      const { id: allocationId, ...data } = allocation;
      await tx.update(instanceParameters).set({ valor: { ...data, fields: { ...data.fields, quantidade: quantity.toFixed() } } }).where(and(eq(instanceParameters.configuracaoInstanciaId, owner), eq(instanceParameters.chave, procurementAuxiliaryKey("cotas-requisitantes", allocationId))));
    }
  }
  if (catalog === "grupos-itens" && input.fields.grupoPai) {
    const parent = records.find(record => record.code === input.fields.grupoPai);
    if (!parent || parent.id === id || parent.fields.grupoPai) throw new Error("Selecione um grupo principal existente.");
  }
  if (catalog === "grupos-itens" && id) {
    const current = records.find(record => record.id === id)!;
    if ((current.code !== input.code || input.fields.grupoPai) && records.some(record => record.fields.grupoPai === current.code)) throw new Error("Preserve o código e o nível do grupo que possui subgrupos.");
  }
  const key = procurementAuxiliaryKey(catalog, id || randomUUID());
  await tx.insert(instanceParameters).values({ configuracaoInstanciaId: owner, chave: key, valor: input }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: input } });
  return key;
}
