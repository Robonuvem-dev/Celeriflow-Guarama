import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import type { PermissionUser } from "@/lib/contracts/identity";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { mergeFiscalAccountants } from "./fiscal-accountant-merge";

export const registryMergeInput = z.object({ kind: z.enum(["cep", "bairro", "cidade", "contador"]), source: z.string().trim().min(1).max(100), target: z.string().trim().min(1).max(100), reason: z.string().trim().min(10).max(2000) }).refine(value => value.source !== value.target, "Origem e destino devem ser diferentes.");
const models = { bairro: { table: "Neighborhood", column: "neighborhoodId" }, cidade: { table: "City", column: "cityId" }, contador: { table: "VafAccountant", column: "accountantId" } } as const;
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
export async function mergeTaxRegistries(connection: DatabaseConnection, user: PermissionUser, raw: unknown) {
  // These reference catalogs are shared across departments, so merging is an
  // explicit technical-administrator operation rather than an ordinary edit.
  if (!isSystemAdministrator(user)) throw new Error("Agrupamentos de cadastros compartilhados exigem administrador do sistema.");
  const input = registryMergeInput.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const ids = [input.source, input.target].sort();
    for (const id of ids) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`TAX_REGISTRY_MERGE:${input.kind}:${id}`}))`);
    let snapshot: unknown = { source: input.source, target: input.target };
    if (input.kind === "cep") {
      if (digits(input.source).length !== 8 || !/^\d{8}$/.test(input.target) || digits(input.source) !== input.target) throw new Error("Agrupe somente variações do mesmo CEP; destino deve conter oito dígitos.");
    } else {
      const model = models[input.kind];
      const records = await tx.execute(sql`SELECT * FROM ${sql.identifier(model.table)} WHERE id IN (${input.source},${input.target}) FOR UPDATE`);
      if (input.kind === "contador" && records.rows.length === 0) return mergeFiscalAccountants(tx, user.id, input.source, input.target, input.reason);
      const source = records.rows.find(row => row.id === input.source), target = records.rows.find(row => row.id === input.target);
      if (!source || !target) throw new Error("Origem ou destino não encontrados.");
      if (input.kind === "contador") {
        if (!source.active || !target.active || digits(source.cpfCnpj) !== digits(target.cpfCnpj) || ![11,14].includes(digits(target.cpfCnpj).length)) throw new Error("Contadores devem ter o mesmo CPF/CNPJ e estar ativos.");
      } else {
        if (normalize(source.name) !== normalize(target.name)) throw new Error("Nomes não correspondem a cadastros duplicados.");
        if (input.kind === "cidade" && source.stateId !== target.stateId || input.kind === "bairro" && (source.cityId !== target.cityId || normalize(source.city) !== normalize(target.city) || source.state !== target.state)) throw new Error("Localidades de estados/cidades diferentes não podem ser agrupadas.");
        if (normalize(target.status).startsWith("agrupad") || normalize(source.status).startsWith("agrupad")) throw new Error("Cadastro já agrupado; selecione o destino canônico ativo.");
      }
      snapshot = { source, target };
    }
    const column = input.kind === "cep" ? "zipCode" : models[input.kind].column;
    // Discover all current physical consumers, including scalar references left
    // by historical migrations; do not silently abandon references in a domain.
    const consumers = await tx.execute<{ table_name: string }>(sql`SELECT table_name FROM information_schema.columns WHERE table_schema=current_schema() AND column_name=${column} AND data_type IN ('text','character varying') ORDER BY table_name`);
    const moved: Record<string, number> = {};
    for (const consumer of consumers.rows) {
      const result = await tx.execute(sql`UPDATE ${sql.identifier(consumer.table_name)} SET ${sql.identifier(column)}=${input.target} WHERE ${sql.identifier(column)}=${input.source} RETURNING 1 AS moved`);
      if (result.rows.length) moved[consumer.table_name] = result.rows.length;
    }
    if (input.kind === "cep" && Object.keys(moved).length === 0) throw new Error("Nenhum cadastro com o CEP de origem foi encontrado.");
    if (input.kind !== "cep") {
      const model = models[input.kind];
      if (input.kind === "contador") await tx.execute(sql`UPDATE ${sql.identifier(model.table)} SET active=false, "updatedAt"=CURRENT_TIMESTAMP WHERE id=${input.source}`);
      else await tx.execute(sql`UPDATE ${sql.identifier(model.table)} SET status='Agrupado', "updatedAt"=CURRENT_TIMESTAMP WHERE id=${input.source}`);
    }
    const id = createId();
    await tx.execute(sql`INSERT INTO "TaxRegistryMerge" (id,kind,"sourceId","targetId",reason,"actorId",snapshot,moved) VALUES (${id},${input.kind},${input.source},${input.target},${input.reason},${user.id},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify(moved)}::jsonb)`);
    return { id, moved };
  });
}
