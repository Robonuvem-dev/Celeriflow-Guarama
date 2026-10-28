import { and, asc, count, eq, gte, ilike, isNotNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { employees } from "@/db/schema/administration";
import { healthUnits } from "@/db/schema/health-workforce";
import { healthServices, healthSpecialties, healthSpecialtyGroups } from "@/db/schema/health-administration";
import { healthCbos } from "@/db/schema/master-data";
import { accessProfiles } from "@/db/schema/identity";
import { auditEvents } from "@/db/schema/audit";
import { SYSTEM_ADMIN_PROFILE_CODE, getSystemAdministratorEmail } from "@/lib/administration/c3-policy";
import type { AdministrationClientProps, AdministrationTab, AdministrationSituation, UnitRow, ProfessionalRow, SpecialtyRow, GroupRow, ServiceRow, CboRow, SchedulingGroupRow, HolidayRow, PersonRow, CompanyRow, AccessRow } from "@/app/app-domain/saude/administracao/AdministracaoClient";

type Data = Pick<AdministrationClientProps, "total" | "page" | "unitRows" | "professionalRows" | "specialtyRows" | "groupRows" | "serviceRows" | "cboRows" | "schedulingGroupRows" | "holidayRows" | "personRows" | "companyRows" | "accessRows" | "usageRows">;
const history = (rows: UnitRow["statusHistory"]) => rows.map(row => ({ ...row, occurredAt: databaseTimestamp(row.occurredAt).toISOString() }));

export async function healthAdministrationReferences(db: DatabaseExecutor) {
  const [unitOptions, specialtyOptions, serviceOptions, cboOptions, groupOptions, employeeOptions, profiles] = await Promise.all([
    db.select({ id: healthUnits.id, name: healthUnits.name, type: healthUnits.type }).from(healthUnits).where(and(eq(healthUnits.isActive, true), sql`(NOT ${healthUnits.isThirdParty} OR EXISTS (SELECT 1 FROM "HealthProfessional" p WHERE p."unitId"=${healthUnits.id} AND p."isActive") OR EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."unitId"=${healthUnits.id} AND a."isActive") OR EXISTS (SELECT 1 FROM "HealthServiceAssignment" a WHERE a."unitId"=${healthUnits.id} AND a."isActive") OR EXISTS (SELECT 1 FROM "HealthHabilitation" h WHERE h."unitId"=${healthUnits.id} AND h."isActive"))`)).orderBy(asc(healthUnits.name)),
    db.select({ id: healthSpecialties.id, code: healthSpecialties.code, name: healthSpecialties.name }).from(healthSpecialties).where(eq(healthSpecialties.isActive, true)).orderBy(asc(healthSpecialties.name)),
    db.select({ id: healthServices.id, code: healthServices.code, name: healthServices.name }).from(healthServices).where(eq(healthServices.isActive, true)).orderBy(asc(healthServices.name)),
    db.select({ id: healthCbos.id, code: healthCbos.code, description: healthCbos.description }).from(healthCbos).where(eq(healthCbos.isActive, true)).orderBy(asc(healthCbos.code)),
    db.select({ id: healthSpecialtyGroups.id, name: healthSpecialtyGroups.name }).from(healthSpecialtyGroups).where(eq(healthSpecialtyGroups.isActive, true)).orderBy(asc(healthSpecialtyGroups.name)),
    db.select({ id: employees.id, name: employees.name, registration: employees.registration, cpf: employees.cpf }).from(employees).where(and(eq(employees.isActive, true), isNotNull(employees.personId))).orderBy(asc(employees.name)),
    db.select({ id: accessProfiles.id, nome: accessProfiles.nome }).from(accessProfiles).where(and(eq(accessProfiles.ativo, true), ne(accessProfiles.codigo, SYSTEM_ADMIN_PROFILE_CODE))).orderBy(asc(accessProfiles.nome)),
  ]);
  return { unitOptions, specialtyOptions, serviceOptions, cboOptions, groupOptions, employeeOptions, profiles };
}

export async function healthAdministrationPageData(db: DatabaseExecutor, input: { tab: AdministrationTab; situation: AdministrationSituation; query: string; requestedPage: number; usageFrom: string; usageUntil: string }): Promise<Data> {
  const { tab, situation, query, requestedPage } = input;
  const out: Data = { total: 0, page: 1, unitRows: [], professionalRows: [], specialtyRows: [], groupRows: [], serviceRows: [], cboRows: [], schedulingGroupRows: [], holidayRows: [], personRows: [], companyRows: [], accessRows: [], usageRows: [] };
  const active = situation ? sql`x."isActive"=${situation === "ativo"}` : sql`true`;
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const search = (...columns: SQL[]) => query ? sql`(${sql.join(columns.map(column => sql`${column} ILIKE ${pattern}`), sql` OR `)})` : sql`true`;
  const paginate = async (from: SQL, where: SQL) => {
    const result = await db.execute<{ total: number }>(sql`SELECT count(*)::integer AS total FROM ${from} WHERE ${where}`);
    out.total = result.rows[0].total; out.page = Math.min(requestedPage, Math.max(1, Math.ceil(out.total / 20)));
    return sql`LIMIT 20 OFFSET ${(out.page - 1) * 20}`;
  };
  if (tab === "unidades") {
    const where = sql`${active} AND ${search(sql`x.name`, sql`x.type`, sql`x.cnes`, sql`x.phone`)}`;
    const limit = await paginate(sql`"HealthUnit" x`, where);
    const rows = await db.execute<UnitRow>(sql`SELECT x.id,x.name,x.type,x.cnes,x.phone,x.email,x."isActive",x."isThirdParty",
      COALESCE((SELECT json_agg(json_build_object('id',s.id,'dayOfWeek',s."dayOfWeek",'startTime',s."startTime",'endTime',s."endTime",'isActive',s."isActive") ORDER BY s."dayOfWeek",s."startTime") FROM "HealthUnitShift" s WHERE s."unitId"=x.id),'[]') AS shifts,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'isActive',a."isActive",'specialty',json_build_object('id',s.id,'code',s.code,'name',s.name))) FROM "HealthUnitSpecialty" a JOIN "HealthSpecialty" s ON s.id=a."specialtyId" WHERE a."unitId"=x.id),'[]') AS specialties,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'isActive',a."isActive",'service',json_build_object('id',s.id,'code',s.code,'name',s.name))) FROM "HealthServiceAssignment" a JOIN "HealthService" s ON s.id=a."serviceId" WHERE a."unitId"=x.id),'[]') AS services,
      COALESCE((SELECT json_agg(json_build_object('id',h.id,'code',h.code,'description',h.description,'isActive',h."isActive") ORDER BY h.code) FROM "HealthHabilitation" h WHERE h."unitId"=x.id),'[]') AS habilitations,
      COALESCE((SELECT json_agg(json_build_object('id',h.id,'isActive',h."isActive",'reason',h.reason,'occurredAt',h."occurredAt") ORDER BY h."occurredAt" DESC) FROM "HealthRegistrationStatusHistory" h WHERE h."unitId"=x.id),'[]') AS "statusHistory"
      FROM "HealthUnit" x WHERE ${where} ORDER BY x.name,x.id ${limit}`);
    out.unitRows = rows.rows.map(row => ({ ...row, statusHistory: history(row.statusHistory) }));
  } else if (tab === "profissionais") {
    const from = sql`"HealthProfessional" x JOIN "Employee" e ON e.id=x."employeeId" LEFT JOIN "Person" p ON p.id=e."personId" LEFT JOIN "HealthUnit" u ON u.id=x."unitId"`;
    const where = sql`${active} AND ${search(sql`e.name`,sql`e.cpf`,sql`x.cns`,sql`x.cbo`,sql`x.specialty`,sql`x."councilNumber"`)}`;
    const limit = await paginate(from, where);
    const rows = await db.execute<ProfessionalRow>(sql`SELECT x.id,x."employeeId",x.cns,x.treatment,x.cbo,x."councilName",x."councilNumber",x.specialty,x."isAuditor",x."consultationIntervalMinutes",x."isActive",
      json_build_object('id',e.id,'name',e.name,'registration',e.registration,'cpf',e.cpf,'email',e.email,'phone',e.phone,'isActive',e."isActive",'person',CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('rg',p.rg,'rgIssuer',p."rgIssuer",'phonePrimary',p."phonePrimary",'email',p.email,
        'addresses',COALESCE((SELECT json_agg(a) FROM (SELECT a."streetName",a.number,a.complement,a."zipCode",CASE WHEN n.id IS NULL THEN NULL ELSE json_build_object('name',n.name,'city',n.city,'state',n.state) END AS neighborhood FROM "Address" a LEFT JOIN "Neighborhood" n ON n.id=a."neighborhoodId" WHERE a."personId"=p.id LIMIT 1) a),'[]'),
        'documents',COALESCE((SELECT json_agg(json_build_object('id',d.id,'title',d.title,'documentType',d."documentType")) FROM "Document" d WHERE d."personId"=p.id),'[]')) END) AS employee,
      CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id',u.id,'name',u.name) END AS unit,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'weeklyHours',a."weeklyHours",'isActive',a."isActive",'unit',json_build_object('id',u.id,'name',u.name),'specialty',CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('id',s.id,'code',s.code,'name',s.name) END)) FROM "HealthProfessionalAssignment" a JOIN "HealthUnit" u ON u.id=a."unitId" LEFT JOIN "HealthSpecialty" s ON s.id=a."specialtyId" WHERE a."professionalId"=x.id),'[]') AS assignments,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'isActive',a."isActive",'service',json_build_object('id',s.id,'code',s.code,'name',s.name))) FROM "HealthServiceAssignment" a JOIN "HealthService" s ON s.id=a."serviceId" WHERE a."professionalId"=x.id),'[]') AS "serviceAssignments",
      COALESCE((SELECT json_agg(json_build_object('id',h.id,'code',h.code,'description',h.description,'isActive',h."isActive") ORDER BY h.code) FROM "HealthHabilitation" h WHERE h."professionalId"=x.id),'[]') AS habilitations,
      COALESCE((SELECT json_agg(json_build_object('id',h.id,'isActive',h."isActive",'reason',h.reason,'occurredAt',h."occurredAt") ORDER BY h."occurredAt" DESC) FROM "HealthRegistrationStatusHistory" h WHERE h."professionalId"=x.id),'[]') AS "statusHistory"
      FROM ${from} WHERE ${where} ORDER BY e.name,x.id ${limit}`);
    out.professionalRows = rows.rows.map(row => ({ ...row, statusHistory: history(row.statusHistory) }));
  } else if (tab === "especialidades") {
    const where = sql`${active} AND ${search(sql`x.code`,sql`x.name`)}`, limit = await paginate(sql`"HealthSpecialty" x`, where);
    out.specialtyRows = (await db.execute<SpecialtyRow>(sql`SELECT x.id,x.code,x.name,x."isActive" FROM "HealthSpecialty" x WHERE ${where} ORDER BY x.code,x.id ${limit}`)).rows;
  } else if (tab === "servicos") {
    const where = sql`${active} AND ${search(sql`x.code`,sql`x.name`,sql`x.classification`)}`, limit = await paginate(sql`"HealthService" x`, where);
    out.serviceRows = (await db.execute<ServiceRow>(sql`SELECT x.id,x.code,x.name,x.classification,x."isActive" FROM "HealthService" x WHERE ${where} ORDER BY x.code,x.id ${limit}`)).rows;
  } else if (tab === "cbo") {
    const where = sql`${active} AND ${search(sql`x.code`,sql`x.description`)}`, limit = await paginate(sql`"HealthCbo" x`, where);
    out.cboRows = (await db.execute<CboRow>(sql`SELECT x.id,x.code,x.description,x."isActive" FROM "HealthCbo" x WHERE ${where} ORDER BY x.code,x.id ${limit}`)).rows;
  } else if (tab === "grupos") {
    const where = sql`${active} AND ${search(sql`x.name`)}`, limit = await paginate(sql`"HealthSpecialtyGroup" x`, where);
    out.groupRows = (await db.execute<GroupRow>(sql`SELECT x.id,x.name,x."isActive",(SELECT count(*)::integer FROM "HealthSchedulingGroup" g WHERE g."specialtyGroupId"=x.id) AS "schedulingGroupCount",
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'specialty',json_build_object('id',s.id,'code',s.code,'name',s.name))) FROM "HealthSpecialtyGroupMember" a JOIN "HealthSpecialty" s ON s.id=a."specialtyId" WHERE a."groupId"=x.id),'[]') AS specialties,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'service',json_build_object('id',s.id,'code',s.code,'name',s.name))) FROM "HealthSpecialtyGroupService" a JOIN "HealthService" s ON s.id=a."serviceId" WHERE a."groupId"=x.id),'[]') AS services
      FROM "HealthSpecialtyGroup" x WHERE ${where} ORDER BY x.name,x.id ${limit}`)).rows;
  } else if (tab === "agendamentos") {
    const from = sql`"HealthSchedulingGroup" x JOIN "HealthUnit" u ON u.id=x."unitId" JOIN "HealthSpecialtyGroup" g ON g.id=x."specialtyGroupId"`, where = sql`${active} AND ${search(sql`x.name`)}`, limit = await paginate(from, where);
    out.schedulingGroupRows = (await db.execute<SchedulingGroupRow>(sql`SELECT x.id,x.name,x."isActive",json_build_object('id',u.id,'name',u.name) AS unit,json_build_object('id',g.id,'name',g.name) AS "specialtyGroup" FROM ${from} WHERE ${where} ORDER BY x.name,x.id ${limit}`)).rows;
  } else if (tab === "feriados") {
    const where = sql`x."isHoliday" AND ${search(sql`x.title`,sql`x.type`)}`, limit = await paginate(sql`"CalendarEvent" x`, where);
    out.holidayRows = (await db.execute<HolidayRow>(sql`SELECT x.id,x.title,x.description,x.date,x.type FROM "CalendarEvent" x WHERE ${where} ORDER BY x.date,x.title ${limit}`)).rows.map(row => ({ ...row, date: databaseTimestamp(row.date).toISOString() }));
  } else if (tab === "pessoas") {
    const where = sql`${situation ? sql`x.status=${situation === "ativo" ? "Ativo" : "Inativo"}` : sql`true`} AND ${query ? sql`(x."fullName" ILIKE ${pattern} OR x.cpf LIKE ${pattern})` : sql`true`}`, limit = await paginate(sql`"Person" x`, where);
    out.personRows = (await db.execute<PersonRow>(sql`SELECT x.id,x."fullName",x.cpf,x."birthDate",x.gender,x."raceColor",x."motherName",x.email,x."phonePrimary",x.status,
      COALESCE((SELECT json_agg(json_build_object('id',a.id,'addressType',a."addressType",'streetName',a."streetName",'number',a.number,'zipCode',a."zipCode")) FROM "Address" a WHERE a."personId"=x.id),'[]') AS addresses,
      (SELECT count(*)::integer FROM "Document" d WHERE d."personId"=x.id) AS "documentCount",EXISTS (SELECT 1 FROM "Patient" p WHERE p."personId"=x.id) AS "isPatient",
      (SELECT json_build_object('id',u.id,'nome',u.nome,'ativo',u.ativo) FROM "Employee" e JOIN "Usuario" u ON u."employeeId"=e.id WHERE e."personId"=x.id) AS usuario
      FROM "Person" x WHERE ${where} ORDER BY x."fullName",x.id ${limit}`)).rows.map(row => ({ ...row, birthDate: row.birthDate === null ? null : databaseTimestamp(row.birthDate).toISOString() }));
  } else if (tab === "empresas") {
    const where = sql`${situation ? sql`x.status=${situation === "ativo" ? "Ativo" : "Inativo"}` : sql`true`} AND ${query ? sql`(x."corporateName" ILIKE ${pattern} OR x."tradeName" ILIKE ${pattern} OR x.cnpj LIKE ${pattern} OR x.id LIKE ${pattern})` : sql`true`}`, limit = await paginate(sql`"Company" x`, where);
    out.companyRows = (await db.execute<CompanyRow>(sql`SELECT x.id,x."corporateName",x."tradeName",x.cnpj,x.phone,x."emailPrimary",x.status FROM "Company" x WHERE ${where} ORDER BY x."corporateName",x.id ${limit}`)).rows;
  } else if (tab === "acessos") {
    const from = sql`"Usuario" x JOIN "ConfiguracaoPerfil" f ON f.id=x."perfilId" LEFT JOIN "Employee" e ON e.id=x."employeeId" LEFT JOIN "Person" p ON p.id=e."personId"`;
    const where = sql`x.email<>${getSystemAdministratorEmail()} AND f.codigo<>${SYSTEM_ADMIN_PROFILE_CODE} AND ${situation ? sql`x.ativo=${situation === "ativo"}` : sql`true`} AND ${query ? sql`(x.nome ILIKE ${pattern} OR x.email ILIKE ${pattern} OR p.cpf LIKE ${pattern})` : sql`true`}`, limit = await paginate(from, where);
    out.accessRows = (await db.execute<AccessRow>(sql`SELECT x.id,x.nome,x.email,x.ativo,x."perfilId",f.nome AS "profileName",x."employeeId",NULLIF(p."fullName",'') AS "personName",NULLIF(p.cpf,'') AS cpf,
      COALESCE((SELECT m."canView" FROM "UsuarioModulo" m JOIN "ConfiguracaoModulo" c ON c.id=m."moduloId" WHERE m."usuarioId"=x.id AND c.codigo='SAUDE' LIMIT 1),false) AS "canView",
      COALESCE((SELECT m."canEdit" FROM "UsuarioModulo" m JOIN "ConfiguracaoModulo" c ON c.id=m."moduloId" WHERE m."usuarioId"=x.id AND c.codigo='SAUDE' LIMIT 1),false) AS "canEdit",
      COALESCE((SELECT json_agg(json_build_object('unitId',s."unitId",'unitName',u.name,'validFrom',s."validFrom",'validUntil',s."validUntil",'weekdays',s.weekdays,'startTime',s."startTime",'endTime',s."endTime",'isActive',s."isActive") ORDER BY u.name) FROM "HealthUserAccessScope" s JOIN "HealthUnit" u ON u.id=s."unitId" WHERE s."usuarioId"=x.id),'[]') AS scopes
      FROM ${from} WHERE ${where} ORDER BY x.nome,x.id ${limit}`)).rows;
    const events = await db.select({ createdAt: auditEvents.createdAt }).from(auditEvents).where(and(ilike(auditEvents.targetType, "HEALTH\\_%"), gte(auditEvents.createdAt, new Date(`${input.usageFrom}T00:00:00.000Z`)), lte(auditEvents.createdAt, new Date(`${input.usageUntil}T23:59:59.999Z`)))).orderBy(asc(auditEvents.createdAt));
    const byDate = new Map<string, number>();
    for (const event of events) { const date = event.createdAt.toISOString().slice(0, 10); byDate.set(date, (byDate.get(date) || 0) + 1); }
    out.usageRows = [...byDate].map(([date, count]) => ({ date, count }));
  }
  return out;
}
