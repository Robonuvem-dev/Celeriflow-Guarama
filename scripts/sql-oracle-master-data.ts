import type { MasterDataCatalog, MasterDataOption } from "../src/app/app-domain/cadastros/master-data-types";
import type { MasterDataPageData } from "../src/lib/contracts/master-data";
import type { SqlOracle } from "./sql-oracle";

type CatalogSql = { from: string; search: string; order: string; active: string; values: string; options?: Record<string, string> };
const people = `SELECT id AS value,"fullName" AS label FROM "Person" WHERE status<>'Inativo' ORDER BY "fullName" ASC LIMIT 500`;
const entities = `SELECT id AS value,name AS label FROM "GovernmentEntity" WHERE status='ATIVA' ORDER BY name ASC`;
const cities = `SELECT c.id AS value,c.name || '/' || s.uf AS label FROM "City" c JOIN "State" s ON s.id=c."stateId" WHERE c.status='ATIVA' ORDER BY c.name ASC`;
const date = (column: string) => `COALESCE(to_char(${column},'YYYY-MM-DD'),'')`;

// Independent physical SQL projections of the former page contract. Identifiers
// and ordering come only from this closed catalog; search/page remain parameters.
const catalogs: Record<MasterDataCatalog, CatalogSql> = {
  families: {
    from: `"Family" r LEFT JOIN "Person" p ON p.id=r."responsiblePersonId"`, search: `r.code ILIKE $1 OR p."fullName" ILIKE $1`, order: `r."updatedAt" DESC`, active: `r.status='ATIVA'`,
    values: `'code',COALESCE(r.code,''),'responsiblePersonId',COALESCE(r."responsiblePersonId",''),'responsible',COALESCE(NULLIF(p."fullName",''),'-'),
      'memberIds',COALESCE((SELECT json_agg(m."personId") FROM "FamilyMember" m JOIN "Person" x ON x.id=m."personId" WHERE m."familyId"=r.id AND m.status='ATIVO'),'[]'::json),
      'members',COALESCE((SELECT string_agg(x."fullName",', ') FROM "FamilyMember" m JOIN "Person" x ON x.id=m."personId" WHERE m."familyId"=r.id AND m.status='ATIVO'),''),
      'address',COALESCE((SELECT COALESCE(a."streetName",'') || ', ' || COALESCE(a.number,'') FROM "SocialFamily" s JOIN "Address" a ON a.id=s."addressId" WHERE s."masterFamilyId"=r.id LIMIT 1),'-'),'status',r.status`,
    options: { people },
  },
  entities: {
    from: `"GovernmentEntity" r LEFT JOIN "GovernmentEntity" p ON p.id=r."parentId" LEFT JOIN "Company" c ON c.id=r."companyId"`, search: `r.code ILIKE $1 OR r.name ILIKE $1`, order: `r.name ASC`, active: `r.status='ATIVA'`,
    values: `'code',r.code,'name',r.name,'type',r.type,'cnpj',COALESCE(r.cnpj,''),'companyId',COALESCE(r."companyId",''),'company',COALESCE(NULLIF(c."corporateName",''),'-'),'parentId',COALESCE(r."parentId",''),'parent',COALESCE(NULLIF(p.name,''),'-')`,
    options: { parents: entities, companies: `SELECT id AS value,"corporateName" AS label FROM "Company" WHERE status='Ativo' ORDER BY "corporateName" ASC LIMIT 500` },
  },
  costCenters: {
    from: `"CostCenter" r LEFT JOIN "CostCenter" p ON p.id=r."parentId" LEFT JOIN "GovernmentEntity" e ON e.id=r."governmentEntityId" LEFT JOIN "Secretariat" s ON s.id=r."secretariatId"`, search: `r.code ILIKE $1 OR r.name ILIKE $1`, order: `r.code ASC`, active: `r."isActive"`,
    values: `'code',r.code,'name',r.name,'description',COALESCE(r.description,''),'parentId',COALESCE(r."parentId",''),'parent',COALESCE(NULLIF(p.name,''),'-'),'governmentEntityId',COALESCE(r."governmentEntityId",''),'entity',COALESCE(NULLIF(e.name,''),'-'),'secretariatId',COALESCE(r."secretariatId",''),'secretariat',COALESCE(NULLIF(s.name,''),'-'),'departmentId',COALESCE(r."departmentId",''),'administrativeUnitId',COALESCE(r."administrativeUnitId",'')`,
    options: { parents: `SELECT id AS value,name AS label FROM "CostCenter" WHERE "isActive"`, entities: `SELECT id AS value,name AS label FROM "GovernmentEntity" WHERE status='ATIVA'`, secretariats: `SELECT id AS value,name AS label FROM "Secretariat" WHERE "isActive"`, departments: `SELECT id AS value,name AS label FROM "Department" WHERE "isActive"`, units: `SELECT id AS value,name AS label FROM "AdministrativeUnit" WHERE "isActive"` },
  },
  cities: {
    from: `"City" r JOIN "State" s ON s.id=r."stateId"`, search: `r.name ILIKE $1 OR r."ibgeCode" LIKE $1`, order: `r.name ASC`, active: `r.status='ATIVA'`,
    values: `'name',r.name,'ibgeCode',r."ibgeCode",'stateId',r."stateId",'state',s.uf || ' - ' || s.name`,
    options: { states: `SELECT id AS value,uf || ' - ' || name AS label FROM "State" WHERE status='ATIVO' ORDER BY name ASC` },
  },
  neighborhoods: {
    from: `"Neighborhood" r LEFT JOIN "City" c ON c.id=r."cityId"`, search: `r.name ILIKE $1`, order: `r.name ASC`, active: `r.status='Ativo'`,
    values: `'name',r.name,'type',r.type,'cityId',COALESCE(r."cityId",''),'city',COALESCE(NULLIF(c.name,''),r.city),'adminRegion',COALESCE(r."adminRegion",''),'notes',COALESCE(r.notes,'')`, options: { cities },
  },
  streets: {
    from: `"Street" r LEFT JOIN "City" c ON c.id=r."cityId" LEFT JOIN "Neighborhood" n ON n.id=r."neighborhoodId"`, search: `r.name ILIKE $1`, order: `r.name ASC`, active: `r.status='Ativo'`,
    values: `'name',r.name,'type',r.type,'zipCode',COALESCE(r."zipCode",''),'cityId',COALESCE(r."cityId",''),'city',COALESCE(NULLIF(c.name,''),r.city),'neighborhoodId',COALESCE(r."neighborhoodId",''),'neighborhood',COALESCE(NULLIF(n.name,''),'-')`,
    options: { cities, neighborhoods: `SELECT id AS value,name AS label FROM "Neighborhood" WHERE "cityId" IS NOT NULL AND status='Ativo' ORDER BY name ASC LIMIT 1000` },
  },
  banks: {
    from: `"Bank" r`, search: `r.name ILIKE $1 OR r.compe LIKE $1 OR r.ispb LIKE $1`, order: `r.compe ASC`, active: `r.status='ATIVO'`, values: `'compe',r.compe,'ispb',r.ispb,'name',r.name,'shortName',r."shortName"`,
  },
  branches: {
    from: `"BankBranch" r JOIN "Bank" b ON b.id=r."bankId" LEFT JOIN "City" c ON c.id=r."cityId"`, search: `r.name ILIKE $1 OR r.code LIKE $1`, order: `b.name ASC,r.code ASC`, active: `r.status='ATIVA'`,
    values: `'bankId',r."bankId",'bank',b."shortName",'code',r.code,'name',r.name,'cnpj',COALESCE(r.cnpj,''),'cityId',COALESCE(r."cityId",''),'city',COALESCE(NULLIF(c.name,''),'-')`,
    options: { banks: `SELECT id AS value,compe || ' - ' || "shortName" AS label FROM "Bank" WHERE status='ATIVO' ORDER BY name ASC`, cities: `SELECT id AS value,name AS label FROM "City" WHERE status='ATIVA' ORDER BY name ASC` },
  },
  taxes: {
    from: `"Tax" r`, search: `r.name ILIKE $1 OR r.code ILIKE $1`, order: `r.name ASC`, active: `r."isActive"`,
    values: `'code',COALESCE(r.code,''),'name',r.name,'taxType',r."taxType",'governmentLevel',COALESCE(r."governmentLevel",''),'revenueNature',COALESCE(r."revenueNature",''),'effectiveFrom',${date('r."effectiveFrom"')},'effectiveUntil',${date('r."effectiveUntil"')},'description',COALESCE(r.description,'')`,
  },
  currencies: {
    from: `"Currency" r`, search: `r.name ILIKE $1 OR r."isoCode" ILIKE $1`, order: `r."isDefault" DESC,r."isoCode" ASC`, active: `r.status='ATIVA'`,
    values: `'isoCode',r."isoCode",'name',r.name,'symbol',r.symbol,'decimalPlaces',r."decimalPlaces"::text,'isDefault',r."isDefault"`,
  },
  products: {
    from: `"CatalogItem" r`, search: `r.name ILIKE $1 OR r.code ILIKE $1`, order: `r.name ASC`, active: `r."isActive"`,
    values: `'code',COALESCE(r.code,''),'name',r.name,'description',COALESCE(r.description,''),'unit',r.unit,'category',COALESCE(r.category,''),'productKind',r."productKind",'specification',COALESCE(r.specification,''),'externalCode',COALESCE(r."externalCode",'')`,
  },
  cbos: {
    from: `"HealthCbo" r`, search: `r.description ILIKE $1 OR r.code LIKE $1`, order: `r.code ASC`, active: `r."isActive"`, values: `'code',r.code,'description',r.description`,
  },
  signers: {
    from: `"LegalReportSigner" r LEFT JOIN "Person" p ON p.id=r."personId" LEFT JOIN "Employee" e ON e.id=r."employeeId" LEFT JOIN "GovernmentEntity" g ON g.id=r."governmentEntityId"`, search: `r."signingRole" ILIKE $1`, order: `r."signatureOrder" ASC,r."createdAt" DESC`, active: `r.status='ATIVO'`,
    values: `'personId',COALESCE(r."personId",''),'employeeId',COALESCE(r."employeeId",''),'signer',COALESCE(NULLIF(p."fullName",''),NULLIF(e.name,''),'-'),'governmentEntityId',COALESCE(r."governmentEntityId",''),'entity',COALESCE(NULLIF(g.name,''),'-'),'signingRole',r."signingRole",'reportTypes',r."reportTypes",'signatureOrder',r."signatureOrder"::text,'effectiveFrom',${date('r."effectiveFrom"')},'effectiveUntil',${date('r."effectiveUntil"')}`,
    options: { people, employees: `SELECT id AS value,name AS label FROM "Employee" WHERE "isActive" ORDER BY name ASC LIMIT 500`, entities },
  },
  legalTexts: {
    from: `"LegalText" r LEFT JOIN "GovernmentEntity" g ON g.id=r."governmentEntityId" LEFT JOIN LATERAL (SELECT v.content,v."versionNumber" FROM "LegalTextVersion" v WHERE v."legalTextId"=r.id ORDER BY v."versionNumber" DESC LIMIT 1) v ON TRUE`, search: `r.number ILIKE $1 OR r.summary ILIKE $1`, order: `r."updatedAt" DESC`, active: `r.status='VIGENTE'`,
    values: `'type',r.type,'number',r.number,'summary',r.summary,'governmentLevel',r."governmentLevel",'issuingBody',r."issuingBody",'publicationDate',${date('r."publicationDate"')},'effectiveFrom',${date('r."effectiveFrom"')},'effectiveUntil',${date('r."effectiveUntil"')},'governmentEntityId',COALESCE(r."governmentEntityId",''),'entity',COALESCE(NULLIF(g.name,''),'-'),'content',COALESCE(v.content,''),'version',COALESCE(v."versionNumber",0)::text`, options: { entities },
  },
};

export async function expectedMasterData(oracle: SqlOracle, catalog: MasterDataCatalog, query: string, page: number): Promise<MasterDataPageData> {
  const spec = catalogs[catalog], values = [query ? `%${query}%` : null];
  const where = `($1::text IS NULL OR (${spec.search}))`;
  const total = await oracle.scalarCount(`SELECT count(*)::int AS count FROM ${spec.from} WHERE ${where}`, values);
  const rows = await oracle.rows<MasterDataPageData["rows"][number]>(`SELECT r.id,${spec.active} AS active,json_build_object(${spec.values}) AS values FROM ${spec.from} WHERE ${where} ORDER BY ${spec.order} LIMIT 20 OFFSET $2`, [...values, (page - 1) * 20]);
  const options: Record<string, MasterDataOption[]> = {};
  for (const [key, sql] of Object.entries(spec.options || {})) options[key] = await oracle.rows<MasterDataOption>(sql);
  return { rows, total, options };
}
