import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../src/db/transaction";
import { createId } from "../../src/db/ids";

// Only the additive municipal fixture uses this SQL batch writer. Names are
// fixed here; column types/defaults are read on its own transaction connection.
// No relation loading, predicates, updates or ORM compatibility API is exposed.
const datasetTables = [
  "Institution", "Secretariat", "Department", "Person", "Company", "Supplier", "Creditor", "Taxpayer", "Role", "Employee", "Neighborhood", "Street", "Address", "RealEstate", "GovernmentEntity", "PlanningEntityScope", "BudgetUnit", "PlanningEntityUnit",
  "InternalDemand", "CalendarEvent", "SupportChannel", "ServiceSubject", "ProcessType", "Subject", "Process", "Ticket", "Ombudsman", "School", "Teacher", "Student", "SchoolClass", "EducationalGuardian", "Enrollment", "HealthUnit", "HealthProfessional", "Patient", "SocialUnit", "SocialFamily", "SocialFamilyMember", "SocialBenefit", "SocialVisit",
  "EnvEnterprise", "EnvGreenArea", "EnvRequest", "EnvInspection", "EnvEduProgram", "CulturaAgente", "CulturaEspaco", "CulturaProjeto", "CulturaEvento", "CulturaAtividade", "CulturaPatrimonio", "ObrasObra", "ObrasEquipe", "ObrasEquipeMembro", "ObrasServico", "SegurancaGuarda", "SegurancaOcorrencia", "SegurancaMobilidadeRegistro",
  "CamLegislatura", "CamVereador", "CamComissao", "CamComissaoMembro", "CamSessao", "CamProposicao", "MultiYearPlan", "PlanningInstrument", "ProgramPPA", "ObjectivePPA", "IndicatorPPA", "ActionPPA", "GoalPPA", "CatalogItem", "PurchaseRequest", "PurchaseRequestItem", "PurchasePlanning", "PurchaseProcess", "PurchaseProcessItem", "PreliminaryTechnicalStudy", "TermOfReference", "PriceResearch", "PriceQuote",
  "MaterialCategory", "Material", "Warehouse", "AssetCategory", "Asset", "SstCertificateReason", "SstExposureGroup", "HealthTeam", "HealthUnitShift", "HealthRoom", "HealthAppointment", "DteCategory", "PortalPage", "PortalMenu", "PortalNews", "EnvComplaint", "EnvWaste", "EnvDocument", "SanPortalRequest", "SanSavedReport", "CulturaConselho", "CulturaFundo", "CulturaReserva", "ObrasServicoEmployee", "ObrasServicoEquipe", "ObrasServicoEquipamento",
  "SocialNetworkOrganization", "SocialPersonProfile", "SocialAttendance", "SocialRecord", "SocialProgram", "SocialProgramParticipation", "HealthTerritoryArea", "HealthMicroarea", "HealthHousehold", "HealthFamily", "HealthFamilyMember", "EducationLibraryTitle", "EducationLibraryCopy", "EducationSchoolMenu", "SchoolCalendarEvent", "EducationSupportRequest", "CamGabinete", "CamMesaDiretora", "CamPauta", "InformationRequest",
] as const;
export type DatasetTableName = typeof datasetTables[number];
type Column = { name: string; type: string; required: boolean; hasDefault: boolean };
const metadata = new WeakMap<DatabaseTransaction, Map<string, Column[]>>();

export async function insertMunicipalDatasetRows(tx: DatabaseTransaction, table: DatasetTableName, input: Record<string, unknown> | Record<string, unknown>[]): Promise<number> {
  if (!datasetTables.includes(table)) throw new Error("Tabela fora do catálogo da carga municipal.");
  const rows = Array.isArray(input) ? input : [input];
  if (!rows.length) return 0;
  let cache = metadata.get(tx);
  if (!cache) { cache = new Map(); metadata.set(tx, cache); }
  let columns = cache.get(table);
  if (!columns) {
    const result = await tx.execute<Column>(sql`SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,(d.oid IS NOT NULL) AS "hasDefault"
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname=${table} AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`);
    columns = result.rows;
    if (!columns.length) throw new Error(`Tabela da carga não encontrada: ${table}`);
    cache.set(table, columns);
  }
  const byName = new Map(columns.map(column => [column.name, column]));
  // These two client-side defaults are the only ones used by these 128 tables.
  // PostgreSQL supplies all physical DEFAULTs and validates every constraint.
  const clientDefaults = columns.filter(column => column.required && !column.hasDefault && (column.name === "id" && column.type === "text" || column.name === "updatedAt" && column.type === "timestamp(3) without time zone"));
  const fieldNames = [...new Set([...rows.flatMap(row => Object.keys(row)), ...clientDefaults.map(column => column.name)])];
  for (const name of fieldNames) if (!byName.has(name)) throw new Error(`Coluna fora do catálogo físico: ${table}.${name}`);
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const now = new Date();
    const tuples = rows.slice(offset, offset + 500).map(row => {
      const cells = fieldNames.map(name => {
        const column = byName.get(name)!;
        let value = row[name];
        if (value === undefined && clientDefaults.includes(column)) value = name === "id" ? createId() : now;
        if (value === undefined) return sql`DEFAULT`;
        if (value instanceof Date) value = value.toISOString();
        if (value !== null && (column.type === "jsonb" || column.type === "json")) value = JSON.stringify(value);
        return sql`${sql.param(value)}`;
      });
      return sql`(${sql.join(cells, sql`, `)})`;
    });
    const result = await tx.execute(sql`INSERT INTO ${sql.identifier("public")}.${sql.identifier(table)} (${sql.join(fieldNames.map(name => sql.identifier(name)), sql`, `)}) VALUES ${sql.join(tuples, sql`, `)} ON CONFLICT DO NOTHING RETURNING 1 AS inserted`);
    inserted += result.rows.length;
  }
  return inserted;
}
