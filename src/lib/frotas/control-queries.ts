import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule } from "@/lib/platform/tenant-context";
import { departmentWhere, fleetScope } from "./service";
import { controlQuerySchema, consumptionAverage, consumptionClassification, type FleetMeter } from "./control-policy";
import type { z } from "zod";
import { dateOnly, todayInBrazil } from "./contract";

export type FleetControlRow = { id: string; label: string; type: string; unitId?: string; status: string; detail: Record<string, string>; data: Record<string, unknown> };
const date = (value: Date | null | undefined) => value?.toISOString() || "Não informado";
const decimal = (value: Prisma.Decimal | null | undefined, places = 2) => value === null || value === undefined ? "Não informado" : value.toFixed(places);
const plain = (value: object) => Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, entry instanceof Date ? entry.toISOString() : entry instanceof Prisma.Decimal ? entry.toString() : entry]));

export function fleetControlUnitWhere(context: AppContext, query: z.infer<typeof controlQuerySchema>): Prisma.FleetUnitWhereInput {
  const search = { contains: query.q, mode: "insensitive" as const };
  return { AND: [departmentWhere(fleetScope(context)), ...(query.departmentId ? [{ departmentId: query.departmentId }] : []), ...(query.unitId ? [{ id: query.unitId }] : []), ...(query.unitIds ? [{ id: { in: query.unitIds.split(",") } }] : []), ...(query.area === "relatorios" && query.q ? [{ OR: [{ code: search }, { name: search }, { plate: search }, { renavam: search }] }] : []), ...(query.area === "relatorios" && query.status ? [{ status: query.status }] : [])] };
}

export async function queryFleetControl(context: AppContext, raw: unknown, full = false) {
  const query = controlQuerySchema.parse(raw), db = context.prisma, scope = fleetScope(context);
  const units = await db.fleetUnit.findMany({ where: fleetControlUnitWhere(context, query), select: { id: true, code: true, name: true, plate: true, departmentId: true, category: true, asset: { select: { acquisitionDate: true } } }, orderBy: { code: "asc" } });
  const unitIds = units.map((unit) => unit.id), names = new Map(units.map((unit) => [unit.id, `${unit.code} · ${unit.name}`]));
  const q = query.q ? { contains: query.q, mode: "insensitive" as const } : undefined;
  const interval = { ...(query.from ? { gte: new Date(`${query.from}T00:00:00-03:00`) } : {}), ...(query.to ? { lt: new Date(new Date(`${query.to}T00:00:00-03:00`).getTime() + 86400000) } : {}) };
  const calendarInterval = { ...(query.from ? { gte: dateOnly(query.from) } : {}), ...(query.to ? { lt: new Date(dateOnly(query.to).getTime() + 86400000) } : {}) };
  const matchesStatus = query.status ? { status: query.status } : {};
  let total = 0, rows: FleetControlRow[] = [], page = query.page;
  let catalog: { id: string; reference: string; sourceReference: string; complete: boolean; records: number } | null = null;
  let debtSummary: { outstandingKnown: string; unknownValues: number; finePayments: string; administrativeClosures: number } | null = null;
  const paginate = (count: number): { take?: number; skip?: number } => { total = count; page = Math.min(page, Math.max(1, Math.ceil(count / 20))); return full ? {} : { take: 20, skip: (page - 1) * 20 }; };
  if (query.area === "cadastro") {
    const selected = q ? units.filter((unit) => `${unit.code} ${unit.name}`.toLocaleLowerCase("pt-BR").includes(query.q.toLocaleLowerCase("pt-BR"))) : units;
    paginate(selected.length);
    const records = full ? selected : selected.slice((page - 1) * 20, page * 20);
    const controls = await db.fleetUnitControl.findMany({ where: { unitId: { in: records.map((unit) => unit.id) } } });
    const auths = await db.fleetAuthorization.findMany({ where: { unitId: { in: records.map((unit) => unit.id) }, kind: "ABASTECIMENTO", status: "EXECUTADA", executedAt: interval }, select: { unitId: true, reading: true, actualQuantity: true, executedAt: true } });
    rows = records.map((unit) => {
      const control = controls.find((row) => row.unitId === unit.id), meter = (control?.meterType || "HODOMETRO") as FleetMeter;
      const average = consumptionAverage(meter, auths.filter((row) => row.unitId === unit.id).map((row) => ({ reading: row.reading === null ? null : row.reading.toNumber(), quantity: row.actualQuantity?.toNumber() || 0, date: row.executedAt! })));
      return { id: unit.id, label: names.get(unit.id)!, type: "UNIT_CONTROL", unitId: unit.id, status: consumptionClassification(meter, average, control?.expectedConsumption?.toNumber() || null, control?.tolerancePercent.toNumber() || 0) || "NAO_CALCULAVEL", detail: { Categoria: unit.category, Espécie: control?.species || "Não informado", Cor: control?.color || "Não informado", Combustível: control?.fuelType || "Não informado", Tanque: decimal(control?.tankCapacity, 3), Marcador: meter, Leitura: decimal(control?.currentReading, 3), Aquisição: date(unit.asset?.acquisitionDate || control?.acquisitionDate), "Modelo FIPE": control?.fipeModelId || "Sem vínculo", "Média no período": average === null ? "Não calculável" : `${average.toFixed(3)} ${meter === "HORIMETRO" ? "L/h" : "km/L"}`, "Tipo de máquina": control?.machineTypeId || "Não configurado", "Campos da máquina": JSON.stringify(control?.machineValues || {}) }, data: { ...plain(control || {}), unitId: unit.id, version: control?.updatedAt.toISOString() || "", acquisitionDate: unit.asset?.acquisitionDate.toISOString().slice(0, 10) || control?.acquisitionDate?.toISOString().slice(0, 10) || "" } };
    });
  } else if (query.area === "debitos") {
    const unitSearch = q ? units.filter(unit => `${unit.code} ${unit.name} ${unit.plate || ""}`.toLocaleLowerCase("pt-BR").includes(query.q.toLocaleLowerCase("pt-BR"))).map(unit => unit.id) : [];
    const dueRange = query.from || query.to ? { dueAt: calendarInterval } : {};
    const documents = await db.fleetDocument.findMany({ where: { unitId: { in: unitIds }, kind: { in: ["SEGURO", "OBRIGACAO"] }, ...dueRange, ...(q ? { OR: [{ title: q }, { reference: q }, { type: q }, { unitId: { in: unitSearch } }] } : {}) } });
    const fines = await db.fleetFine.findMany({ where: { unitId: { in: unitIds }, ...dueRange, ...(query.driverId ? { driverId: query.driverId } : {}), ...(q ? { OR: [{ aitNumber: q }, { city: q }, { unitId: { in: unitSearch } }] } : {}) }, include: { payments: true } });
    const today = dateOnly(todayInBrazil());
    const debts = [
      ...documents.map(item => {
        const closed = item.status === "CUMPRIDA";
        const status = closed ? "CUMPRIDA_ADMINISTRATIVAMENTE" : item.dueAt < today ? "VENCIDO" : "PENDENTE";
        return { dueAt: item.dueAt, amount: closed ? new Prisma.Decimal(0) : item.value, finePaid: new Prisma.Decimal(0), closed, row: { id: item.id, label: `${names.get(item.unitId)} — ${item.title}`, type: "DEBT_DOCUMENT", unitId: item.unitId, status, detail: { Natureza: `${item.kind} / ${item.type}`, Referência: item.reference, Vencimento: date(item.dueAt), "Valor informado": decimal(item.value), "Valor pendente administrativo": closed ? "0.00" : decimal(item.value), "Cumprimento administrativo": date(item.fulfilledAt), Providência: item.fulfillmentNote || "Não registrada", "Pagamento financeiro": "Não comprovado por esta rotina; cumprimento administrativo não é pagamento bancário." }, data: plain(item) } satisfies FleetControlRow };
      }),
      ...fines.map(item => {
        const paid = item.payments.filter(payment => !payment.reversedAt).reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
        const balance = item.status === "CANCELADA" ? new Prisma.Decimal(0) : item.amount.sub(paid);
        const status = item.status === "CANCELADA" ? "CANCELADA" : balance.eq(0) ? "PAGA" : item.dueAt < today ? "VENCIDO" : paid.gt(0) ? "PAGA_PARCIAL" : item.status;
        return { dueAt: item.dueAt, amount: balance, finePaid: paid, closed: false, row: { id: item.id, label: `${names.get(item.unitId)} — Multa ${item.aitNumber}`, type: "DEBT_FINE", unitId: item.unitId, status, detail: { Natureza: "MULTA", Referência: item.aitNumber, Cidade: item.city, Vencimento: date(item.dueAt), "Valor notificado": decimal(item.amount), "Pagamentos registrados": paid.toFixed(2), "Saldo da multa": balance.toFixed(2), "Situação original": item.status, "Parcelas e comprovantes": item.payments.map(payment => `${date(payment.paidAt)} · ${payment.amount} · ${payment.reversedAt ? "ESTORNADO" : "REGISTRADO"} · GED ${payment.proofVersionId}`).join("\n") || "Sem parcelas" }, data: plain(item) } satisfies FleetControlRow };
      }),
    ].filter(item => !query.status || item.row.status === query.status).sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime() || left.row.id.localeCompare(right.row.id));
    debtSummary = { outstandingKnown: debts.reduce((sum, item) => sum.add(item.amount || 0), new Prisma.Decimal(0)).toFixed(2), unknownValues: debts.filter(item => item.amount === null).length, finePayments: debts.reduce((sum, item) => sum.add(item.finePaid), new Prisma.Decimal(0)).toFixed(2), administrativeClosures: debts.filter(item => item.closed).length };
    paginate(debts.length); rows = (full ? debts : debts.slice((page - 1) * 20, page * 20)).map(item => item.row);
  } else if (query.area === "motoristas") {
    const currentDrivers = await db.$queryRaw<{ id: string }[]>`SELECT d."id" FROM "FleetDriver" d LEFT JOIN "Employee" e ON e."id"=d."employeeId" WHERE (${scope.administrator} OR COALESCE(e."departmentId",d."departmentId")=${scope.departmentId}) AND (${query.departmentId || null}::text IS NULL OR COALESCE(e."departmentId",d."departmentId")=${query.departmentId || null})`;
    const drivers = await db.fleetDriver.findMany({ where: { AND: [{ id: { in: currentDrivers.map((row) => row.id) } }, ...(query.driverId ? [{ id: query.driverId }] : [])] }, orderBy: { id: "asc" } });
    const people = await db.person.findMany({ where: { id: { in: drivers.map((driver) => driver.personId) }, ...(q ? { fullName: q } : {}) }, select: { id: true, fullName: true } });
    const selected = drivers.filter((driver) => people.some((person) => person.id === driver.personId)); paginate(selected.length);
    rows = (full ? selected : selected.slice((page - 1) * 20, page * 20)).map((driver) => ({ id: driver.id, label: people.find((person) => person.id === driver.personId)!.fullName, type: "DRIVER", status: driver.active ? "ATIVO" : "INATIVO", detail: { CNH: driver.cnhNumber, Categorias: JSON.stringify(driver.cnhCategories), Validade: date(driver.cnhExpiresAt), "Vínculo RH": driver.employeeId || "Terceirizado", "Política de pontuação": `${driver.pointLimit} pontos / ${driver.pointWindowMonths} meses — ${driver.policyReference}`, Suspensão: date(driver.suspensionUntil) }, data: { ...plain(driver), personId: driver.employeeId ? "" : driver.personId, version: driver.updatedAt.toISOString() } }));
  } else if (query.area === "destinos") {
    const where = { ...departmentWhere(scope), ...(q ? { OR: [{ name: q }, { city: q }] } : {}) };
    const items = await db.fleetDestination.findMany({ where, ...paginate(await db.fleetDestination.count({ where })), orderBy: [{ name: "asc" }, { id: "asc" }] });
    rows = items.map(item => ({ id: item.id, label: `${item.name} — ${item.city}`, type: "DESTINATION", status: item.active ? "ATIVO" : "INATIVO", detail: { Cidade: item.city, Endereço: item.address || "Não informado", "Distância (km)": decimal(item.distance, 3), Repartição: item.departmentId }, data: plain(item) }));
  } else if (query.area === "tiposMaquina") {
    const where = q ? { OR: [{ code: q }, { name: q }] } : {};
    const items = await db.fleetMachineType.findMany({ where, ...paginate(await db.fleetMachineType.count({ where })), orderBy: [{ code: "asc" }, { id: "asc" }] });
    rows = items.map(item => ({ id: item.id, label: `${item.code} — ${item.name}`, type: "MACHINE_TYPE", status: item.active ? "ATIVO" : "INATIVO", detail: { "Campos e obrigatoriedade": JSON.stringify(item.fields), "Última configuração": date(item.updatedAt) }, data: { ...plain(item), version: item.updatedAt.toISOString() } }));
  } else if (query.area === "modelos") {
    const where = { version: { kind: "FIPE", published: true }, ...(q ? { OR: [{ code: q }, { name: q }] } : {}) };
    const items = await db.fleetCatalogEntry.findMany({ where, ...paginate(await db.fleetCatalogEntry.count({ where })), include: { version: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    rows = items.map(item => ({ id: item.id, label: `${item.code} — ${item.name}`, type: "FIPE_MODEL", status: item.version.complete ? "FONTE_COMPLETA_DECLARADA" : "AMOSTRA/PARCIAL", detail: { "Marca/modelo/ano/referência": JSON.stringify(item.details), Versão: item.version.reference, Fonte: item.version.sourceReference, Hash: item.version.sha256 }, data: plain(item) }));
  } else if (query.area === "saldos") {
    const contracts = canViewModule(context.user, "COMPRAS") ? await db.contract.findMany({ where: scope.administrator ? {} : { secretariatId: context.user.secretariatId || "__NONE__" }, select: { id: true, number: true } }) : [];
    const where = { contractId: { in: contracts.map(item => item.id) }, ...(q ? { fuelType: q } : {}) };
    const items = await db.fleetFuelAgreement.findMany({ where, ...paginate(await db.fleetFuelAgreement.count({ where })), orderBy: [{ contractId: "asc" }, { id: "asc" }] });
    rows = items.map(item => ({ id: item.id, label: `${contracts.find(contract => contract.id === item.contractId)?.number} — ${item.fuelType}`, type: "FUEL_AGREEMENT", status: item.active ? "ATIVO" : "INATIVO", detail: { "Contratado (L)": decimal(item.contracted, 3), "Reservado (L)": decimal(item.reserved, 3), "Consumido (L)": decimal(item.consumed, 3), "Disponível (L)": decimal(item.contracted.sub(item.reserved).sub(item.consumed), 3), "Preço unitário": decimal(item.unitPrice, 6), Prestador: item.providerId, "Item da contratação": item.purchaseItemId, "Evidência GED": item.evidenceVersionId }, data: plain(item) }));
  } else if (query.area === "agenda") {
    const where = { unitId: { in: unitIds }, ...matchesStatus, ...(query.driverId ? { driverId: query.driverId } : {}), startsAt: interval, ...(q ? { purpose: q } : {}) };
    const items = await db.fleetBooking.findMany({ where, ...paginate(await db.fleetBooking.count({ where })), orderBy: [{ startsAt: "desc" }, { id: "asc" }] });
    const departments = await db.department.findMany({ where: { id: { in: units.flatMap(unit => unit.departmentId ? [unit.departmentId] : []) } }, select: { id: true, name: true } });
    const drivers = await db.fleetDriver.findMany({ where: { id: { in: items.flatMap(item => item.driverId ? [item.driverId] : []) } }, select: { id: true, personId: true } });
    const people = await db.person.findMany({ where: { id: { in: drivers.map(driver => driver.personId) } }, select: { id: true, fullName: true } });
    const routes = await db.fleetRoute.findMany({ where: { id: { in: items.flatMap(item => item.routeId ? [item.routeId] : []) } }, select: { id: true, code: true, name: true } });
    rows = items.map((item) => ({ id: item.id, label: `${names.get(item.unitId)} — ${date(item.startsAt)}`, type: "BOOKING", unitId: item.unitId, status: item.status, detail: { Departamento: departments.find(department => department.id === units.find(unit => unit.id === item.unitId)?.departmentId)?.name || "Não informado", Tipo: item.kind, Finalidade: item.purpose, Início: date(item.startsAt), Fim: date(item.endsAt), Motorista: people.find(person => person.id === drivers.find(driver => driver.id === item.driverId)?.personId)?.fullName || "Sem condutor", "Rota fixa/selecionada": routes.find(route => route.id === item.routeId)?.name || "Sem rota", "Reprogramação de": item.previousId || "Primeira programação" }, data: { ...plain(item), previousId: item.id } }));
  } else if (query.area === "guarita") {
    const where = { unitId: { in: unitIds }, ...(query.driverId ? { driverId: query.driverId } : {}), departedAt: interval, ...(query.status === "ABERTO" ? { returnedAt: null } : query.status === "CONCLUIDO" ? { returnedAt: { not: null } } : {}), ...(q ? { OR: [{ destination: q }, { purpose: q }] } : {}) };
    const items = await db.fleetTrip.findMany({ where, ...paginate(await db.fleetTrip.count({ where })), orderBy: [{ departedAt: "desc" }, { id: "asc" }] });
    rows = items.map((item) => ({ id: item.id, label: `${names.get(item.unitId)} — ${item.destination}`, type: "TRIP", unitId: item.unitId, status: item.returnedAt ? "CONCLUIDO" : "ABERTO", detail: { Finalidade: item.purpose, Saída: date(item.departedAt), Retorno: date(item.returnedAt), Motorista: (item.driverSnapshot as { name: string }).name, Marcador: item.meterType, Inicial: decimal(item.startReading, 3), Final: decimal(item.endReading, 3), "Percorrido (unidade do marcador)": item.endReading && item.startReading ? item.endReading.sub(item.startReading).toString() : "Não aplicável/aberto", Checklist: JSON.stringify(item.checklist) }, data: plain(item) }));
  } else if (query.area === "abastecimento" || query.area === "autorizacoes") {
    const where = { unitId: { in: unitIds }, kind: query.area === "abastecimento" ? "ABASTECIMENTO" : "SERVICO", ...matchesStatus, issuedAt: interval, ...(query.driverId ? { driverId: query.driverId } : {}), ...(q ? { OR: [{ code: q }, { description: q }] } : {}) };
    const items = await db.fleetAuthorization.findMany({ where, ...paginate(await db.fleetAuthorization.count({ where })), orderBy: [{ issuedAt: "desc" }, { id: "asc" }] });
    const workshopReports = query.area === "autorizacoes" ? await db.fleetWorkshopReport.findMany({ where: { authorizationId: { in: items.map(item => item.id) } }, orderBy: { createdAt: "asc" } }) : [];
    rows = items.map((item) => ({ id: item.id, label: `${item.code} — ${names.get(item.unitId)}`, type: "AUTHORIZATION", unitId: item.unitId, status: item.status === "EMITIDA" && item.validUntil <= new Date() ? "EXPIRADA" : item.status, detail: { Tipo: item.kind, Origem: item.origin, Descrição: item.description, Validade: date(item.validUntil), "Volume autorizado": decimal(item.authorizedQuantity, 3), "Volume executado": decimal(item.actualQuantity, 3), "Valor limite": decimal(item.authorizedAmount), "Valor realizado": decimal(item.actualAmount), Contrato: item.contractId || "Não vinculado", "Processo de contratação": item.purchaseProcessId || "Não vinculado", OS: item.workOrderId || "Não aplicável", "Consumo de origem": item.consumptionId || "Não realizado", "Gasto de origem": item.expenseId || "Não realizado", "Relatórios da oficina": workshopReports.filter(report => report.authorizationId === item.id).map(report => `${report.id} · ${report.status} · ${date(report.createdAt)}\n${report.performed}\nPeças: ${report.parts || "Não informadas"}\nValor: ${decimal(report.amount)}`).join("\n\n") || "Sem relatório" }, data: { ...plain(item), tokenHash: undefined } }));
  } else if (query.area === "componentes") {
    const where = { unitId: { in: unitIds }, installedAt: interval };
    const items = await db.fleetComponentInstallation.findMany({ where, ...paginate(await db.fleetComponentInstallation.count({ where })), include: { component: true }, orderBy: [{ installedAt: "desc" }, { id: "asc" }] });
    rows = items.map((item) => ({ id: item.id, label: `${item.component.kind} ${item.component.identifier} — ${names.get(item.unitId)}`, type: "INSTALLATION", unitId: item.unitId, status: item.removedAt ? "RETIRADO" : "EM_USO", detail: { Marca: item.component.brand, Especificação: item.component.specification, Posição: item.position, Instalação: date(item.installedAt), Retirada: date(item.removedAt), Motivo: item.reason, Custo: decimal(item.cost), "Saída de estoque": item.stockMovementId || "Sem vínculo", "Gasto único": item.expenseId || "Não identificado" }, data: plain(item) }));
  } else if (query.area === "multas") {
    const where = { unitId: { in: unitIds }, ...matchesStatus, occurredAt: calendarInterval, ...(query.driverId ? { driverId: query.driverId } : {}), ...(q ? { OR: [{ aitNumber: q }, { city: q }] } : {}) };
    const items = await db.fleetFine.findMany({ where, ...paginate(await db.fleetFine.count({ where })), include: { payments: true }, orderBy: [{ occurredAt: "desc" }, { id: "asc" }] });
    rows = items.map((item) => { const paid = item.payments.filter((payment) => !payment.reversedAt).reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0)); return { id: item.id, label: `${item.aitNumber} — ${names.get(item.unitId)}`, type: "FINE", unitId: item.unitId, status: item.status, detail: { Cidade: item.city, Infração: JSON.stringify(item.ctbSnapshot), Data: date(item.occurredAt), Vencimento: date(item.dueAt), Valor: decimal(item.amount), "Pagamentos informados": paid.toFixed(2), Saldo: item.amount.sub(paid).toFixed(2), "Histórico de parcelas": item.payments.map((payment) => `${payment.id}: ${payment.amount} / ${date(payment.paidAt)} / ${payment.reversedAt ? "ESTORNADO" : "REGISTRADO"} / comprovante ${payment.proofVersionId}`).join("\n") }, data: plain(item) }; });
  } else if (query.area === "sinistros") {
    const where = { unitId: { in: unitIds }, occurredAt: calendarInterval, ...(q ? { description: q } : {}) };
    const items = await db.fleetOccurrence.findMany({ where, ...paginate(await db.fleetOccurrence.count({ where })), orderBy: [{ occurredAt: "desc" }, { id: "asc" }] });
    const claims = await db.fleetClaim.findMany({ where: { occurrenceId: { in: items.map((item) => item.id) } } });
    rows = items.map((item) => { const claim = claims.find((row) => row.occurrenceId === item.id); return { id: item.id, label: `${names.get(item.unitId)} — ${item.type}`, type: "OCCURRENCE", unitId: item.unitId, status: claim?.status || "SEM_SINISTRO", detail: { Data: date(item.occurredAt), Descrição: item.description, "Valor envolvido (não é gasto)": decimal(item.involvedValue), Latitude: decimal(item.latitude, 7), Longitude: decimal(item.longitude, 7), Sinistro: claim?.id || "Não aberto", Responsabilidade: claim?.responsibility || "Não definida", "Apólice congelada": JSON.stringify(claim?.policySnapshot || {}), "Partes envolvidas": JSON.stringify(claim?.parties || []), Oficina: claim?.workshopProviderId || "Não vinculada" }, data: { ...plain(item), claimId: claim?.id } }; });
  } else if (query.area === "infracoes") {
    const version = await db.fleetCatalogVersion.findFirst({ where: { kind: "CTB", published: true, ...(query.catalogVersionId ? { id: query.catalogVersionId } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { _count: { select: { entries: true } } } });
    if (version) {
      catalog = { id: version.id, reference: version.reference, sourceReference: version.sourceReference, complete: version.complete, records: version._count.entries };
      const where: Prisma.FleetCatalogEntryWhereInput = { versionId: version.id, ...(query.nature ? { details: { path: ["nature"], equals: query.nature } } : {}), ...(q ? { OR: [{ code: q }, { name: q }, { details: { path: ["article"], string_contains: query.q } }] } : {}) };
      const entries = await db.fleetCatalogEntry.findMany({ where, ...paginate(await db.fleetCatalogEntry.count({ where })), orderBy: [{ code: "asc" }, { id: "asc" }] });
      rows = entries.map(entry => { const detail = entry.details as Prisma.JsonObject; return { id: entry.id, label: `${entry.code} — ${entry.name}`, type: "CTB_ENTRY", status: String(detail.nature), detail: { Artigo: String(detail.article), Natureza: String(detail.nature), Pontos: String(detail.points), "Valor de referência": detail.amount === null ? "Variável / conforme enquadramento" : String(detail.amount), Penalidade: String(detail.penalty || "Conforme CTB"), "Vigência inicial": String(detail.validFrom), "Vigência final": detail.validUntil ? String(detail.validUntil) : "Sem término informado", Versão: version.reference, Fonte: String(detail.sourceUrl || version.sourceReference) }, data: plain(entry) }; });
    }
  } else if (query.area === "catalogos") {
    const where = { published: true, ...(q ? { OR: [{ reference: q }, { sourceReference: q }] } : {}) };
    const items = await db.fleetCatalogVersion.findMany({ where, ...paginate(await db.fleetCatalogVersion.count({ where })), include: { _count: { select: { entries: true } } }, orderBy: { createdAt: "desc" } });
    rows = items.map((item) => ({ id: item.id, label: `${item.kind} — ${item.reference}`, type: "CATALOG", status: item.complete ? "FONTE_COMPLETA_DECLARADA" : "AMOSTRA/PARCIAL", detail: { Origem: item.sourceReference, Hash: item.sha256, Registros: String(item._count.entries), Data: date(item.createdAt) }, data: plain(item) }));
  } else if (query.area === "anexos") {
    const where = { unitId: { in: unitIds }, withdrawnAt: null, ...(q ? { filename: q } : {}) };
    const items = await db.fleetAttachment.findMany({ where, ...paginate(await db.fleetAttachment.count({ where })), orderBy: { createdAt: "desc" } });
    rows = items.map((item) => ({ id: item.id, label: item.filename, type: "ATTACHMENT", unitId: item.unitId, status: "DISPONIVEL", detail: { Unidade: names.get(item.unitId) || "", Tipo: item.ownerType, Registro: item.ownerId, Tamanho: String(item.size), Formato: item.mimeType, "Versão GED": item.versionId, Data: date(item.createdAt) }, data: plain(item) }));
  }
  return { query, rows, total, page, pageSize: 20, catalog, debtSummary };
}

export async function fleetControlReferences(context: AppContext, kind: string, search: string, unitId: string) {
  const db = context.prisma, scope = fleetScope(context), contains = { contains: search.slice(0, 100), mode: "insensitive" as const };
  const unit = unitId ? await db.fleetUnit.findFirst({ where: { id: unitId, ...departmentWhere(scope) }, select: { departmentId: true } }) : null;
  if (unitId && !unit) return [];
  if (kind === "drivers") {
    return db.$queryRaw<{ id: string; label: string }[]>`SELECT d."id",p."fullName" AS "label" FROM "FleetDriver" d JOIN "Person" p ON p."id"=d."personId" LEFT JOIN "Employee" e ON e."id"=d."employeeId" WHERE d."active"=true AND p."status"='Ativo' AND (${scope.administrator} OR COALESCE(e."departmentId",d."departmentId")=${scope.departmentId}) AND (${unit?.departmentId || null}::text IS NULL OR COALESCE(e."departmentId",d."departmentId")=${unit?.departmentId || null}) AND p."fullName" ILIKE ${`%${search.slice(0, 100)}%`} ORDER BY p."fullName",d."id" LIMIT 20`;
  }
  if (kind === "people") {
    if (!canViewModule(context.user, "CADASTROS")) return [];
    return (await db.person.findMany({ where: { status: "Ativo", fullName: contains }, select: { id: true, fullName: true }, take: 20, orderBy: { fullName: "asc" } })).map((row) => ({ id: row.id, label: row.fullName }));
  }
  if (kind === "costCenters") return (await db.costCenter.findMany({ where: { ...(scope.administrator ? {} : { secretariatId: context.user.secretariatId || "__NONE__" }), name: contains }, select: { id: true, name: true }, take: 20 })).map((row) => ({ id: row.id, label: row.name }));
  if (kind === "destinations") return (await db.fleetDestination.findMany({ where: { active: true, ...(scope.administrator ? {} : { departmentId: scope.departmentId! }), ...(unit?.departmentId ? { departmentId: unit.departmentId } : {}), name: contains }, take: 20 })).map((row) => ({ id: row.id, label: `${row.name} — ${row.city}` }));
  if (kind === "machineTypes") return (await db.fleetMachineType.findMany({ where: { active: true, name: contains }, take: 20 })).map((row) => ({ id: row.id, label: row.name }));
  if (kind === "FIPE" || kind === "CTB") return (await db.fleetCatalogEntry.findMany({ where: { version: { kind, published: true }, OR: [{ code: contains }, { name: contains }] }, include: { version: { select: { reference: true, complete: true } } }, take: 20, orderBy: { name: "asc" } })).map((row) => ({ id: row.id, label: `${row.code} — ${row.name} (${row.version.reference}${row.version.complete ? "" : "; parcial"})` }));
  if (kind === "providers_POSTO" || kind === "providers_OFICINA") {
    const providers = await db.fleetProvider.findMany({ where: { active: true, kind: kind.split("_")[1] } });
    const suppliers = await db.supplier.findMany({ where: { id: { in: providers.map((row) => row.supplierId) }, status: "Ativo", company: { corporateName: contains, status: "Ativo" } }, select: { id: true, company: { select: { corporateName: true } } }, take: 20 });
    return suppliers.flatMap((row) => providers.filter((provider) => provider.supplierId === row.id).map((provider) => ({ id: provider.id, label: row.company!.corporateName })));
  }
  if (kind === "components") return (await db.fleetComponent.findMany({ where: { status: "ESTOQUE", OR: [{ identifier: contains }, { brand: contains }] }, take: 20 })).map((row) => ({ id: row.id, label: `${row.kind} ${row.identifier} — ${row.brand}` }));
  if (kind === "contracts" || kind === "purchaseItems" || kind === "purchaseProcesses") {
    if (!canViewModule(context.user, "COMPRAS")) return [];
    const base = scope.administrator ? {} : { secretariatId: context.user.secretariatId || "__NONE__" };
    if (kind === "contracts") return (await db.contract.findMany({ where: { ...base, status: "Vigente", OR: [{ number: contains }, { object: contains }] }, select: { id: true, number: true, object: true }, take: 20 })).map((row) => ({ id: row.id, label: `${row.number} — ${row.object}` }));
    if (kind === "purchaseProcesses") return (await db.purchaseProcess.findMany({ where: { ...base, OR: [{ number: contains }, { object: contains }] }, select: { id: true, number: true, object: true }, take: 20 })).map((row) => ({ id: row.id, label: `${row.number} — ${row.object}` }));
    return (await db.purchaseProcessItem.findMany({ where: { purchaseProcess: base, OR: [{ customName: contains }, { material: { name: contains } }, { catalogItem: { name: contains } }] }, include: { material: { select: { name: true } }, catalogItem: { select: { name: true } }, purchaseProcess: { select: { number: true } } }, take: 20 })).map((row) => ({ id: row.id, label: `${row.purchaseProcess.number} — ${row.material?.name || row.catalogItem?.name || row.customName} (${row.quantity})` }));
  }
  if (kind === "agreements") {
    const items = await db.fleetFuelAgreement.findMany({ where: { active: true, fuelType: contains } });
    const contracts = await db.contract.findMany({ where: { id: { in: items.map((row) => row.contractId) }, ...(scope.administrator ? {} : { secretariatId: context.user.secretariatId || "__NONE__" }) }, select: { id: true, number: true } });
    return items.flatMap((row) => contracts.filter((contract) => contract.id === row.contractId).map((contract) => ({ id: row.id, label: `${contract.number} / ${row.fuelType} — disponível ${row.contracted.sub(row.reserved).sub(row.consumed)} L` }))).slice(0, 20);
  }
  if (kind === "evidence") {
    return (await db.fleetAttachment.findMany({ where: { withdrawnAt: null, ...(unitId ? { unitId } : { unitId: { in: (await db.fleetUnit.findMany({ where: departmentWhere(scope), select: { id: true } })).map((row) => row.id) } }), filename: contains }, select: { versionId: true, filename: true }, take: 20 })).map((row) => ({ id: row.versionId, label: row.filename }));
  }
  return [];
}
