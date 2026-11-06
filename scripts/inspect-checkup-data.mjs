import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
const queries = {
  appointment: `SELECT a.*, (SELECT json_agg(m) FROM "BiddingAppointmentMember" m WHERE m."appointmentId"=a.id) members FROM "BiddingAppointment" a WHERE a.id='cmw2nii9q000708jr1t7xby3l'`,
  lot: `SELECT l.*,b.number "biddingNumber",p.object FROM "BiddingLot" l JOIN "Bidding" b ON b.id=l."biddingId" JOIN "PurchaseProcess" p ON p.id=b."processId" WHERE l.id='cmw2nj544000708l61ykx742r'`,
  secretariat: `SELECT s.*, (SELECT count(*) FROM "Employee" e WHERE e."secretariatId"=s.id) employees,(SELECT count(*) FROM "Department" d WHERE d."secretariatId"=s.id) departments FROM "Secretariat" s WHERE s.name='Secretaria da POC'`,
  ombudsman: `SELECT * FROM "OmbudsmanConfiguration" WHERE name='Situação Teste'`,
  references: `SELECT kind,split_part(code,':',1) source,count(*)::int count,min(name) sample FROM "HrReferenceRecord" WHERE name LIKE '% — DEMO' GROUP BY kind,split_part(code,':',1) ORDER BY kind,source`,
  documents: `SELECT id,title,status FROM "Document" WHERE title IN ('Planejamento SCFV - comprovacao POC','Registro profissional POC - homologacao')`,
  columns: `SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('TaxServiceActivity','MunicipalPresentationRevision','CamAta','CamAudiencia','CamLei','Contract','Covenant') ORDER BY table_name,ordinal_position`,
  tax: `SELECT id,code,name FROM "Tax" ORDER BY code`,
  activities: `SELECT id,code,name,"issRate","taxId","isActive" FROM "TaxServiceActivity" ORDER BY code LIMIT 10`,
  referenceKinds: `SELECT kind,count(*)::int count,min(name) sample FROM "HrReferenceRecord" WHERE name ~* '(^|[^[:alnum:]])(demo[0-9]{0,4}|poc|teste|test|exemplo|dummy|placeholder)([^[:alnum:]]|$)' GROUP BY kind ORDER BY kind`,
  cemetery: `SELECT c.id,c.code,c.name,c.address,s.id "sectorId" FROM "TaxCemetery" c LEFT JOIN "TaxCemeterySector" s ON s."cemeteryId"=c.id ORDER BY c.id`,
  employeeUnits: `SELECT e.id,e."secretariatId",u.id "budgetUnitId",u.name FROM "Employee" e LEFT JOIN "BudgetUnit" u ON u."secretariatId"=e."secretariatId" WHERE e.id='THIAGO_MORCATTY_DEMO_2026_V1:employee'`,
  planningReadiness: `SELECT 'instruments' AS kind,coalesce(json_agg(c),'[]'::json) AS records FROM (SELECT i.id,i.kind,i.code,i.title,i."governmentEntityId",i."startYear",i."endYear",s.jurisdiction,coalesce(p.status,g.status,l.status) AS status FROM "PlanningInstrument" i JOIN "PlanningEntityScope" s ON s."governmentEntityId"=i."governmentEntityId" LEFT JOIN "MultiYearPlan" p ON p.id=i."multiYearPlanId" LEFT JOIN "BudgetGuideline" g ON g.id=i."budgetGuidelineId" LEFT JOIN "AnnualBudgetLaw" l ON l.id=i."annualBudgetLawId" ORDER BY i.id) c UNION ALL SELECT 'years',coalesce(json_agg(c),'[]'::json) FROM (SELECT y.id,y.year,y.status,y."governmentEntityId",s.jurisdiction FROM "FinancialYear" y JOIN "PlanningEntityScope" s ON s."governmentEntityId"=y."governmentEntityId" WHERE s."isActive" ORDER BY y.year,y.id) c UNION ALL SELECT 'scopes',coalesce(json_agg(c),'[]'::json) FROM (SELECT e.id,e.name,e.type,s.jurisdiction,u."budgetUnitId" FROM "GovernmentEntity" e JOIN "PlanningEntityScope" s ON s."governmentEntityId"=e.id LEFT JOIN "PlanningEntityUnit" u ON u."governmentEntityId"=e.id WHERE s."isActive" ORDER BY e.id,u."budgetUnitId") c`,
  workforceReadiness: `SELECT 'thiago-contract' AS kind,coalesce(json_agg(c),'[]'::json) AS records FROM (SELECT h.id,h.status,h."costCenterId",c."governmentEntityId",c."secretariatId",(SELECT count(*) FROM "HrEmploymentRevision" r WHERE r."contractId"=h.id) revisions FROM "HrEmploymentContract" h LEFT JOIN "CostCenter" c ON c.id=h."costCenterId" WHERE h."employeeId"='THIAGO_MORCATTY_DEMO_2026_V1:employee') c UNION ALL SELECT 'centers',coalesce(json_agg(c),'[]'::json) FROM (SELECT c.id,c.code,c.name,c."governmentEntityId",c."secretariatId",u."governmentEntityId" AS "planningEntityId",(SELECT count(*) FROM "HrEmploymentContract" h WHERE h."costCenterId"=c.id) contracts FROM "CostCenter" c LEFT JOIN "BudgetUnit" b ON b."secretariatId"=c."secretariatId" LEFT JOIN "PlanningEntityUnit" u ON u."budgetUnitId"=b.id ORDER BY c.id LIMIT 30) c`,
  fleet: `SELECT id,code,name,notes FROM "FleetUnit" ORDER BY code LIMIT 3`,
  statusCatalog: `SELECT id,name,settings FROM "OmbudsmanConfiguration" WHERE kind='STATUS' ORDER BY name`,
  presentationRecords: `SELECT 'Family' AS "table",id,code AS value FROM "Family" WHERE code LIKE '%POC%' UNION ALL SELECT 'City',id,"ibgeCode" FROM "City" WHERE "ibgeCode" LIKE '%DEMO%' UNION ALL SELECT 'Taxpayer',id,"municipalInsc" FROM "Taxpayer" WHERE "municipalInsc" LIKE '%DEMO%' UNION ALL SELECT 'Person',id,email FROM "Person" WHERE email LIKE 'social.poc.%@auroradasveredas.example' ORDER BY "table",id`,
  constructionReadiness: `SELECT 'configuration' AS kind,coalesce(json_agg(c),'[]'::json) AS records FROM (SELECT id,version,"subjectIds","publishedBy",instructions FROM "ConstructionConfigVersion" ORDER BY version DESC LIMIT 1) c UNION ALL SELECT 'catalogs',coalesce(json_agg(c),'[]'::json) FROM (SELECT id,kind,name FROM "ConstructionCatalogEntry" WHERE "isActive" ORDER BY kind,name LIMIT 40) c UNION ALL SELECT 'routes',coalesce(json_agg(c),'[]'::json) FROM (SELECT t.id AS "processTypeId",s.id AS "subjectId",t.name AS type,s.name AS subject,d.id AS "departmentId",d.name AS department FROM "ProcessType" t JOIN "Subject" s ON s."processTypeId"=t.id LEFT JOIN "Department" d ON d.id=coalesce(s."initialDepartmentId",t."initialDepartmentId") WHERE t."isActive" AND t."allowsInternalOpening" AND s."isActive" AND s."allowsInternalOpening" AND (t.name ILIKE '%obra%' OR t.name ILIKE '%urban%' OR s.name ILIKE '%obra%' OR s.name ILIKE '%urban%') ORDER BY t.id,s.id LIMIT 20) c UNION ALL SELECT 'properties',coalesce(json_agg(c),'[]'::json) FROM (SELECT r.id,r."municipalInsc",r."streetName",r.number,r."landArea",r."builtArea",t."personId",t."companyId" FROM "RealEstate" r JOIN "Taxpayer" t ON t.id=r."taxpayerId" WHERE r.id LIKE 'aurora-system-v1:property:%' ORDER BY r.id LIMIT 3) c UNION ALL SELECT 'form',coalesce(json_agg(c),'[]'::json) FROM (SELECT kind,version,definition FROM "ConstructionDefinitionVersion" WHERE kind='FORM' ORDER BY version DESC LIMIT 1) c`,
};
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  for (const [key, query] of Object.entries(queries)) {
    if (process.argv[2] && key !== process.argv[2]) continue;
    await client.query("SAVEPOINT inspection");
    try { console.log(JSON.stringify({ key, rows: (await client.query(query)).rows })); }
    catch (error) { await client.query("ROLLBACK TO SAVEPOINT inspection"); console.log(JSON.stringify({ key, error: error.message })); }
  }
  await client.query("ROLLBACK");
} finally { await client.end(); }
