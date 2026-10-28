import { sql, type SQL } from "drizzle-orm";
import { createDatabaseConnection } from "../../src/db/connection";
import type { DatabaseExecutor } from "../../src/db/transaction";
import { createId } from "../../src/db/ids";
import { crossDomainApplicationTables } from "./cross-domain-application-tables";

export function openCrossDomainDatabase(maxWaitMs = 10_000) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Conexão do banco não configurada.");
  if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 1) throw new Error("Espera de conexão inválida.");
  const connection = createDatabaseConnection(url);
  // Each tool owns this pool; set its acquisition deadline before first use.
  // Total transaction/lock deadlines are configured separately by the caller.
  connection.pool.options.connectionTimeoutMillis = maxWaitMs;
  return connection;
}

export function identifier(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return sql.identifier(name);
}

export async function queryRows<T extends Record<string, unknown>>(db: DatabaseExecutor, query: SQL) {
  return (await db.execute<T>(query)).rows;
}

export type PhysicalColumn = { name: string; type: string; required: boolean; hasDefault: boolean; defaultValue: string | null; isString: boolean; isArray: boolean };
export type PhysicalModel = { name: string; fields: PhysicalColumn[]; relations: { field: string; model: string; columns: string[]; required: boolean }[] };

/** Physical metadata is restricted to the explicit application-table catalog in
 * the current schema. Internal ledgers and arbitrary schemas are excluded. */
export async function readApplicationCatalog(db: DatabaseExecutor): Promise<PhysicalModel[]> {
  const columns = await queryRows<PhysicalColumn & { table: string }>(db, sql`SELECT c.relname AS "table", a.attname AS name,
    format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required, d.oid IS NOT NULL AS "hasDefault",
    pg_get_expr(d.adbin,d.adrelid) AS "defaultValue", t.typcategory='S' AS "isString", t.typcategory='A' AS "isArray"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=current_schema() AND c.relkind='r' AND c.relname=ANY(${sql.param(crossDomainApplicationTables)}::text[])
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
  const relations = await queryRows<{ table: string; model: string; columns: string[]; required: boolean }>(db, sql`SELECT c.relname AS "table", target.relname AS model,
    array_agg(a.attname::text ORDER BY key.ordinality) AS columns, bool_and(a.attnotnull) AS required
    FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class target ON target.oid=f.confrelid CROSS JOIN LATERAL unnest(f.conkey) WITH ORDINALITY key(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
    WHERE f.contype='f' AND n.nspname=current_schema() AND c.relname=ANY(${sql.param(crossDomainApplicationTables)}::text[]) GROUP BY f.oid,c.relname,target.relname,f.conname ORDER BY c.relname,f.conname`);
  const present = new Set(columns.map(column => column.table));
  return crossDomainApplicationTables.filter(name => present.has(name)).map(name => ({ name,
    fields: columns.filter(column => column.table === name),
    relations: relations.filter(relation => relation.table === name).map(relation => ({ field: relation.columns.join(",").replace(/Id$/, ""), model: relation.model, columns: relation.columns, required: relation.required })),
  }));
}

// These are the only tables written by the transversal seed/provenance tools.
// This is a bounded SQL insertion primitive, not an ORM/delegate translator.
const writableTables = new Set([
  "GovernmentEntity", "PlanningEntityScope", "PlanningEntityUnit", "Secretariat", "BudgetUnit", "CostCenter", "FinancialYear", "ResourceSource", "RevenueNature", "ExpenseNature", "AccountingPlan", "ConfiguracaoPerfil", "Usuario", "UsuarioUnidadeGestora", "Person", "Taxpayer", "RealEstate", "EconomicRegistration", "MultiYearPlan", "BudgetGuideline", "AnnualBudgetLaw", "PlanningInstrument", "FinancialAuditLog", "PlanningCatalogVersion", "PlanningCatalogEntry",
  "MaterialCategory", "CatalogItem", "Material", "HealthUnit", "HealthSpecialty", "HealthTeam", "Employee", "HealthProfessional", "HealthUnitSpecialty", "HealthProfessionalAssignment", "Patient", "HealthCareSchedule",
  "State", "City", "Department", "AdministrativeUnit", "Role", "Address", "Warehouse", "Medicine", "HealthMaterialProfile", "MaterialStock", "MaterialMovement", "MedicineBatch", "AssetCategory", "Asset", "FleetUnit", "FleetUnitControl", "FleetDocument", "FleetPlan", "PayrollEvent", "Payroll", "PayrollItem", "Vacation", "AcademicPeriod", "SchoolSubject", "SchoolShift", "ClassDiary", "ProcessMovement", "EnvLicense", "BudgetAppropriation", "BankAccount", "AuditEvent",
]);
const metadata = new WeakMap<DatabaseExecutor, Map<string, PhysicalColumn[]>>();

export async function insertToolRows(db: DatabaseExecutor, table: string, input: Record<string, unknown> | Record<string, unknown>[], conflict?: "skip" | readonly string[]): Promise<number> {
  if (!writableTables.has(table)) throw new Error(`Tabela fora do catálogo transversal: ${table}`);
  const rows = Array.isArray(input) ? input : [input];
  if (!rows.length) return 0;
  let cache = metadata.get(db);
  if (!cache) { cache = new Map(); metadata.set(db, cache); }
  let columns = cache.get(table);
  if (!columns) {
    for (const model of await readApplicationCatalog(db)) cache.set(model.name, model.fields);
    columns = cache.get(table);
    if (!columns?.length) throw new Error(`Tabela não encontrada: ${table}`);
    cache.set(table, columns);
  }
  const byName = new Map(columns.map(column => [column.name, column]));
  const defaults = columns.filter(column => column.required && !column.hasDefault && (column.name === "id" && column.type === "text" || column.name === "updatedAt" && column.type === "timestamp(3) without time zone"));
  const names = [...new Set([...rows.flatMap(row => Object.keys(row)), ...defaults.map(column => column.name)])];
  for (const name of [...names, ...(Array.isArray(conflict) ? conflict : [])]) if (!byName.has(name)) throw new Error(`Coluna não encontrada: ${table}.${name}`);
  const onConflict = conflict === "skip" ? sql`ON CONFLICT DO NOTHING` : conflict ? sql`ON CONFLICT (${sql.join(conflict.map(identifier), sql`, `)}) DO NOTHING` : sql``;
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const now = new Date();
    const tuples = rows.slice(offset, offset + 500).map(row => sql`(${sql.join(names.map(name => {
      const column = byName.get(name)!;
      let value = row[name];
      if (value === undefined && defaults.includes(column)) value = name === "id" ? createId() : now;
      if (value === undefined) return sql`DEFAULT`;
      if (value instanceof Date) value = value.toISOString();
      if (value !== null && ["json", "jsonb"].includes(column.type)) value = JSON.stringify(value);
      return sql`${sql.param(value)}`;
    }), sql`, `)})`);
    inserted += (await db.execute(sql`INSERT INTO ${identifier(table)} (${sql.join(names.map(identifier), sql`, `)}) VALUES ${sql.join(tuples, sql`, `)} ${onConflict} RETURNING 1`)).rows.length;
  }
  return inserted;
}

export async function requireAdministrator(db: DatabaseExecutor): Promise<{ id: string }> {
  const [actor] = await queryRows<{ id: string }>(db, sql`SELECT u.id FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo=true AND p.codigo='SYSTEM_ADMINISTRATOR' LIMIT 1`);
  if (!actor) throw new Error("Administrador técnico ativo não encontrado.");
  return actor;
}
