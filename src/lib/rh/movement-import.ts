import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";

/** Quoted semicolon CSV, including escaped quotes and embedded line breaks. */
function parseCsv(text: string) {
  const result: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index++; }
      else if (!quoted && value !== "") throw new Error("Aspas devem iniciar o campo CSV.");
      else quoted = !quoted;
    } else if (character === ";" && !quoted) { row.push(value); value = ""; }
    else if (character === "\n" && !quoted) { row.push(value); if (row.some(cell => cell.trim())) result.push(row); row = []; value = ""; }
    else value += character;
  }
  if (quoted) throw new Error("CSV com aspas não encerradas.");
  row.push(value); if (row.some(cell => cell.trim())) result.push(row);
  return result;
}

const columns = ["matricula", "rubrica", "valor", "inicio", "fim", "referencia", "observacao"];
function date(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data deve ser AAAA-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Data inválida.");
  return parsed;
}

export function parsePayrollMovementImport(text: string) {
  const rows = parseCsv(text);
  if (rows[0]?.map(value => value.trim().toLowerCase()).join(";") !== columns.join(";")) throw new Error(`Cabeçalho esperado: ${columns.join(";")}`);
  if (rows.length < 2) throw new Error("CSV sem movimentos.");
  return rows.slice(1).map((row, index) => {
    try {
      if (row.length !== columns.length) throw new Error("Quantidade de colunas inválida.");
      const [registration, rubricCode, rawAmount, start, end, reference, notes] = row.map(value => value.trim());
      const amount = rawAmount.replace(",", ".");
      if (!registration || !rubricCode || !/^-?\d{1,16}(?:\.\d{1,2})?$/.test(amount) || notes.length < 3) throw new Error("Matrícula, rubrica, valor ou observação inválidos.");
      const startsAt = date(start); const endsAt = end ? date(end) : null;
      if (endsAt && endsAt < startsAt) throw new Error("Fim anterior ao início.");
      return { line: index + 2, registration, rubricCode, amount, startsAt, endsAt, reference: reference || null, notes };
    } catch (error) { throw new Error(`Linha ${index + 2}: ${error instanceof Error ? error.message : "Dados inválidos."}`); }
  });
}

export async function importPayrollMovements(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ batchKey: z.string().trim().min(1).max(100), csv: z.string().min(1), mode: z.enum(["PREVIA", "APLICAR"]) }).strict().parse(raw);
  const rows = parsePayrollMovementImport(input.csv);
  const hash = createHash("sha256").update(input.csv).digest("hex");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:import:${input.batchKey}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:import-hash:${hash}`}))`;
    const importedFile = await tx.hrIntegrationEvent.findFirst({ where: { domain: "AUDITORIA", eventType: "IMPORTACAO_MOVIMENTOS", payload: { path: ["hash"], equals: hash } } });
    if (importedFile && importedFile.sourceKey !== `IMPORTACAO:${input.batchKey}`) throw new Error("Este arquivo já foi importado com outra chave de lote. Reutilize a origem original para evitar duplicação.");
    const contracts = await tx.hrEmploymentContract.findMany({ where: { registration: { in: [...new Set(rows.map(row => row.registration))] }, status: "ATIVO" }, orderBy: { id: "asc" } });
    for (const contract of contracts) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contract.id}`}))`;
    const regimes = await tx.hrEmploymentRegime.findMany({ where: { id: { in: [...new Set(contracts.map(contract => contract.regimeId))] }, isActive: true } });
    const rubrics = await tx.hrPayrollRubric.findMany({ where: { ruleSetId: { in: [...new Set(regimes.map(regime => regime.ruleSetId))] }, isActive: true } });
    let created = 0; let reused = 0;
    for (const [index, row] of rows.entries()) {
      const contract = contracts.find(contract => contract.registration === row.registration);
      const regime = regimes.find(regime => regime.id === contract?.regimeId);
      if (!contract || !regime || !rubrics.some(rubric => rubric.ruleSetId === regime.ruleSetId && rubric.code === row.rubricCode)) throw new Error(`Linha ${row.line}: contrato/regime/rubrica ativo não encontrado.`);
      const sourceKey = `IMPORT:${input.batchKey}:${index + 1}`;
      const previous = await tx.hrMovement.findUnique({ where: { sourceKey } });
      if (previous) {
        if (previous.contractId !== contract.id || previous.rubricCode !== row.rubricCode || !previous.amount.eq(row.amount) || previous.startsAt.getTime() !== row.startsAt.getTime() || previous.endsAt?.getTime() !== row.endsAt?.getTime() || previous.notes !== row.notes || previous.reference !== row.reference) throw new Error(`Linha ${row.line}: lote repetido com conteúdo diferente.`);
        reused++;
      } else {
        if (input.mode === "APLICAR") await tx.hrMovement.create({ data: { contractId: contract.id, sourceKey, rubricCode: row.rubricCode, startsAt: row.startsAt, endsAt: row.endsAt, amount: new Prisma.Decimal(row.amount), reference: row.reference, notes: row.notes, actorId } });
        created++;
      }
    }
    if (input.mode === "APLICAR" && !importedFile) await enqueueHrIntegration(tx, { sourceKey: `IMPORTACAO:${input.batchKey}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "IMPORTACAO_MOVIMENTOS", payload: { batchKey: input.batchKey, hash, csv: input.csv, actorId, rows: rows.length } });
    return { lines: rows.length, created, reused, mode: input.mode, hash };
  }, { timeout: 60000 });
}
