import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { departments as departmentTable } from "@/db/schema/administration";
import { costCenters } from "@/db/schema/master-data";
import { people } from "@/db/schema/people";
import { assetCatalogRecords } from "@/db/schema/assets-catalogs";
import { fleetDatabase, fleetDepartmentFilter, readFleetUnits } from "@/db/repositories/fleet/records";
import { readFleetSupplier } from "@/db/repositories/fleet/sources";
import { fleetDates } from "@/db/repositories/fleet/filters";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import type { InternalReportDataset } from "@/lib/financeiro/report-delivery";
import { fleetScope } from "./service";
import { fleetControlUnitWhere, queryFleetControl } from "./control-queries";
import { controlQuerySchema, consumptionAverage, type FleetMeter } from "./control-policy";
import { FleetControlError, scopedFleetUnit } from "./control-access";

export const fleetControlReports = [
  "frota",
  "vencimentos",
  "abastecimentos",
  "gastos",
  "manutencoes",
  "agendamentos",
  "multas",
  "movimentacaoPneus",
  "pneusBaixados",
  "trocaOleo",
  "combustivel",
  "escolar",
  "hospitalar",
  "gastosGerais",
  "consumo",
  "relacaoRequisicoes",
  "saidaViagem",
  "quilometragem",
  "comunidade",
  "acompanhamento",
  "incorporacoes",
  "cnh",
  "pontuacao",
  "custoKm",
  "movimentacoes",
  "requisicoesEncerradas",
] as const;

export const fleetControlReportLabels: Record<(typeof fleetControlReports)[number], string> = {
  frota: "Cadastro de veículos no período",
  agendamentos: "Agendamentos dos veículos",
  multas: "Relação de multas dos veículos",
  manutencoes: "Manutenções de peças e serviços",
  movimentacaoPneus: "Movimentação de pneus",
  pneusBaixados: "Pneus baixados",
  trocaOleo: "Troca de óleo",
  combustivel: "Combustível / empenhos",
  escolar: "Combustível transporte escolar",
  hospitalar: "Combustível transporte hospitalar",
  gastosGerais: "Gastos gerais (combustível, peças, pneus)",
  consumo: "Planilha de consumo de combustível",
  relacaoRequisicoes: "Relação de requisições de abastecimento",
  saidaViagem: "Saída de viagem com roteiro",
  quilometragem: "Controle de quilometragem",
  comunidade: "Solicitações da comunidade",
  acompanhamento: "Acompanhamento de veículos e máquinas",
  incorporacoes: "Incorporações / desincorporações TCE-MG",
  cnh: "Vencimentos de CNH",
  pontuacao: "Controle de pontuação de CNH",
  custoKm: "Gastos por km rodado",
  movimentacoes: "Monitoramento de movimentações",
  requisicoesEncerradas: "Requisições finalizadas / canceladas",
  vencimentos: "Vencimentos de documentos",
  gastos: "Gastos realizados",
  abastecimentos: "Abastecimentos por veículo",
};
export type FleetControlReportInput = { query: unknown; documentType?: "authorization" | "trip" | "blankFuel" | "blankTrip" | "fineTerm"; documentId?: string; unitIds?: string[]; report?: typeof fleetControlReports[number] };
const date = (value: Date | null | undefined) => value?.toISOString() || "Não informado";
const amount = (value: Decimal | null | undefined, scale = 2) => value === null || value === undefined ? "Não informado" : value.toFixed(scale);
export async function buildFleetControlReport(context: AppContext, input: FleetControlReportInput): Promise<InternalReportDataset> {
  const query = controlQuerySchema.parse(input.query), scope = fleetScope(context), db = fleetDatabase(context);
  let title = "Frota — relatório operacional", sections: InternalReportDataset["sections"] = [];
  const warnings: string[] = [];
  if (input.documentType === "blankFuel" || input.documentType === "blankTrip") {
    title = input.documentType === "blankFuel" ? "Autorização de abastecimento — formulário em branco" : "Deslocamento/guarita — planilha em branco";
    const fields = input.documentType === "blankFuel" ? ["Número/ano", "Veículo/placa", "Setor", "Motorista", "Posto/fornecedor", "Combustível", "Litros autorizados", "Leitura", "Data de emissão", "Validade", "Assinatura do responsável", "Confirmação de execução"] : ["Veículo/placa", "Motorista/CNH", "Setor", "Finalidade", "Destino", "Data/hora de saída", "Marcador de saída", "Data/hora de chegada", "Marcador de chegada", "Assinatura/observações"];
    sections = [{ title: "Preenchimento manual", rows: fields.map((field) => ({ Campo: field, Preenchimento: "________________________________________________" })) }];
    warnings.push("Formulário em branco: impressão não cria autorização, consumo, viagem, despesa ou pagamento no banco.");
  } else if (input.documentType === "fineTerm") {
    const [fine] = await db.select().from(f.fleetFines).where(eq(f.fleetFines.id, input.documentId || "")).limit(1);
    if (!fine) throw new FleetControlError("Multa não encontrada.");
    const unit = await scopedFleetUnit(db, scope, fine.unitId, false);
    const [driver] = fine.driverId ? await db.select().from(f.fleetDrivers).where(eq(f.fleetDrivers.id, fine.driverId)).limit(1) : [];
    const [person] = driver ? await db.select().from(people).where(eq(people.id, driver.personId)).limit(1) : [];
    title = `Termo de autorização de desconto — ${fine.aitNumber}`;
    sections = [{ title: "Identificação da multa", rows: [{ Motorista: person?.fullName || "________________________________", CNH: driver?.cnhNumber || "________________________________", Veículo: `${unit.code} · ${unit.name}`, Placa: unit.plate || "Não informada", Auto: fine.aitNumber, Data: date(fine.occurredAt), Local: fine.city, Valor: amount(fine.amount), Situação: fine.status }] }, { title: "Autorização do motorista", rows: [{ Declaração: "Autorizo o desconto do valor da multa acima identificada, conforme procedimento administrativo aplicável.", "Local e data": "________________________________", "Assinatura do motorista": "________________________________", "Responsável administrativo": "________________________________" }] }];
    warnings.push("A emissão ou reemissão deste termo não comprova assinatura, não autoriza automaticamente desconto e não altera a Folha de Pagamento.");
  } else if (input.documentType === "authorization") {
    const [authorization] = await db.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, input.documentId || "")).limit(1);
    if (!authorization) throw new FleetControlError("Autorização não encontrada.");
    const unit = await scopedFleetUnit(db, scope, authorization.unitId, false);
    const provider = authorization.providerId ? (await db.select().from(f.fleetProviders).where(eq(f.fleetProviders.id, authorization.providerId)).limit(1))[0] : null;
    const supplier = provider ? await readFleetSupplier(db, provider.supplierId, false) : null;
    title = `${authorization.kind === "ABASTECIMENTO" ? "Autorização de abastecimento" : "Autorização de serviço"} ${authorization.code}`;
    sections = [{ title: "Autorização cadastrada", rows: [{ Código: authorization.code, Situação: authorization.status, Unidade: `${unit.code} · ${unit.name}`, Placa: unit.plate || "Não aplicável", Origem: authorization.origin, Prestador: supplier?.company?.corporateName || "Próprio", CNPJ: supplier?.company?.cnpj || "Não aplicável", Finalidade: authorization.description, Emissão: date(authorization.issuedAt), Validade: date(authorization.validUntil), "Litros autorizados": amount(authorization.authorizedQuantity, 3), "Valor limite": amount(authorization.authorizedAmount), "Execução efetiva": date(authorization.executedAt), "Litros executados": amount(authorization.actualQuantity, 3), "Custo realizado": amount(authorization.actualAmount), Contrato: authorization.contractId || "Sem vínculo", "Compra/dispensa/licitação": authorization.purchaseProcessId || "Sem vínculo", "Ordem de serviço": authorization.workOrderId || "Não aplicável" }] }];
    warnings.push("A autorização não comprova execução/pagamento. O código externo de conferência é entregue separadamente ao prestador.");
  } else if (input.documentType === "trip") {
    const [trip] = await db.select().from(f.fleetTrips).where(eq(f.fleetTrips.id, input.documentId || "")).limit(1); if (!trip) throw new FleetControlError("Viagem não encontrada.");
    const unit = await scopedFleetUnit(db, scope, trip.unitId, false);
    title = `Planilha de deslocamento — ${unit.code}`;
    const gates = await db.select().from(f.fleetGateEvents).where(eq(f.fleetGateEvents.tripId, trip.id)).orderBy(asc(f.fleetGateEvents.occurredAt));
    sections = [{ title: "Saída, acompanhamento e retorno", rows: [{ Unidade: `${unit.code} · ${unit.name}`, Motorista: (trip.driverSnapshot as { name: string }).name, Finalidade: trip.purpose, Destino: trip.destination, Saída: date(trip.departedAt), Retorno: date(trip.returnedAt), Marcador: trip.meterType, Inicial: amount(trip.startReading, 3), Final: amount(trip.endReading, 3), "Percorrido (unidade do marcador)": trip.startReading !== null && trip.endReading !== null ? trip.endReading.sub(trip.startReading).toString() : "Não aplicável/aberto", Rota: trip.routeSnapshot || "Sem rota", Checklist: JSON.stringify(trip.checklist) }] }, { title: "Eventos únicos da guarita", rows: gates.map((gate) => ({ Movimento: gate.kind, Horário: date(gate.occurredAt), Leitura: amount(gate.reading, 3) })) }];
    sections.push({ title: "Preenchimento pelo motorista durante a viagem", rows: ["Abastecimentos", "Lubrificantes", "Manutenções", "Trocas de pneus"].map(Campo => ({ Campo, "Data / local / quantidade / valor / observações": "________________________________________________" })) });
  } else if (input.report) {
    const reportQuery = { ...query, area: "relatorios" as const, unitIds: input.unitIds?.length ? input.unitIds.join(",") : query.unitIds };
    const units = await readFleetUnits(db, fleetControlUnitWhere(context, reportQuery));
    const ids = units.map(unit => unit.id), names = new Map(units.map(unit => [unit.id, `${unit.code} · ${unit.plate || unit.name}`]));
    title = (input.report && fleetControlReportLabels[input.report]) || (input.report ? `Frota — ${input.report}` : "Frota — relatório operacional");
    if (input.report === "comunidade") {
      const records = await db.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, "solicitacoes"), eq(assetCatalogRecords.active, true), scope.administrator ? undefined : eq(assetCatalogRecords.departmentId, scope.departmentId!), query.departmentId ? eq(assetCatalogRecords.departmentId, query.departmentId) : undefined, fleetDates(assetCatalogRecords.createdAt, query.from, query.to, true))).orderBy(asc(assetCatalogRecords.createdAt), asc(assetCatalogRecords.code));
      const requestedIds = query.unitId ? [query.unitId] : reportQuery.unitIds ? reportQuery.unitIds.split(",") : [];
      const selected = records.filter(record => (!requestedIds.length || requestedIds.includes(record.details.unitId)) && (!query.status || record.details.status === query.status) && (!query.q || [record.code, record.name, ...Object.values(record.details)].join(" ").toLocaleLowerCase("pt-BR").includes(query.q.toLocaleLowerCase("pt-BR"))));
      title = "Solicitações da comunidade — Frota";
      sections = [{ title: "Solicitações cadastradas no período", rows: selected.map(record => ({ Código: record.code, Nome: record.name, Cadastro: date(record.createdAt), Setor: record.departmentId, Solicitante: record.details.requester, Contato: record.details.contact, Solicitação: record.details.description, Situação: record.details.status, Veículo: names.get(record.details.unitId) || record.details.unitId || "Não vinculado", Agendamento: record.details.bookingId || "Não vinculado", Início: record.details.startsAt || "Não informado", Fim: record.details.endsAt || "Não informado", Motivo: record.details.reason || "Não informado" })) }, { title: "Total do recorte", rows: [{ Solicitações: selected.length }] }];
    } else if (input.report === "agendamentos") {
      const where = and(inArray(f.fleetBookings.unitId, ids), fleetDates(f.fleetBookings.startsAt, query.from, query.to, true), query.driverId ? eq(f.fleetBookings.driverId, query.driverId) : undefined, query.status ? eq(f.fleetBookings.status, query.status) : undefined);
      const bookings = await db.select().from(f.fleetBookings).where(where).orderBy(asc(f.fleetBookings.startsAt));
      const driverRows = await db.select({ id: f.fleetDrivers.id, personId: f.fleetDrivers.personId }).from(f.fleetDrivers).where(inArray(f.fleetDrivers.id, bookings.flatMap(b => b.driverId ? [b.driverId] : [])));
      const persons = await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, driverRows.map(d => d.personId)));
      const driverMap = new Map(driverRows.map(d => [d.id, persons.find(p => p.id === d.personId)?.fullName || "Condutor"]));
      const routeRows = await db.select({ id: f.fleetRoutes.id, name: f.fleetRoutes.name }).from(f.fleetRoutes).where(inArray(f.fleetRoutes.id, bookings.flatMap(b => b.routeId ? [b.routeId] : [])));
      const routeMap = new Map(routeRows.map(r => [r.id, r.name]));
      title = "Agendamentos dos veículos";
      sections = [
        {
          title: "Agendamentos programados no período",
          rows: bookings.map(b => ({
            Veículo: names.get(b.unitId) || b.unitId,
            Início: date(b.startsAt),
            Fim: date(b.endsAt),
            Tipo: b.kind,
            Finalidade: b.purpose,
            Motorista: driverMap.get(b.driverId || "") || "Não informado",
            Rota: routeMap.get(b.routeId || "") || "Livre / não vinculada",
            Situação: b.status,
            Origem: b.previousId ? `Reprogramação (${b.previousId})` : "Original",
          })),
        },
        {
          title: "Total do período",
          rows: [{ "Total de agendamentos": bookings.length, "Agendados": bookings.filter(b => b.status === "AGENDADO").length, "Cancelados": bookings.filter(b => b.status === "CANCELADO").length, "Concluídos": bookings.filter(b => b.status === "CONCLUIDO").length }],
        },
      ];
    } else if (input.report === "multas") {
      const where = and(inArray(f.fleetFines.unitId, ids), fleetDates(f.fleetFines.occurredAt, query.from, query.to, false, true), query.driverId ? eq(f.fleetFines.driverId, query.driverId) : undefined, query.status ? eq(f.fleetFines.status, query.status) : undefined);
      const fines = await db.select().from(f.fleetFines).where(where).orderBy(desc(f.fleetFines.occurredAt));
      const driverRows = await db.select({ id: f.fleetDrivers.id, personId: f.fleetDrivers.personId, cnhNumber: f.fleetDrivers.cnhNumber }).from(f.fleetDrivers).where(inArray(f.fleetDrivers.id, fines.flatMap(fine => fine.driverId ? [fine.driverId] : [])));
      const persons = await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, driverRows.map(d => d.personId)));
      const driverMap = new Map(driverRows.map(d => [d.id, { name: persons.find(p => p.id === d.personId)?.fullName || "Não identificado", cnh: d.cnhNumber }]));
      const payments = await db.select().from(f.fleetFinePayments).where(inArray(f.fleetFinePayments.fineId, fines.map(f => f.id)));
      title = "Relação de multas dos veículos";
      sections = [
        {
          title: "Multas e infrações registradas no período",
          rows: fines.map(fine => {
            const driverInfo = driverMap.get(fine.driverId || "");
            const finePayments = payments.filter(p => p.fineId === fine.id && !p.reversedAt);
            const paid = finePayments.reduce((sum, p) => sum.add(p.amount), new Decimal(0));
            return {
              Veículo: names.get(fine.unitId) || fine.unitId,
              "Auto de Infração (AIT)": fine.aitNumber,
              "Data do Fato": date(fine.occurredAt),
              Vencimento: date(fine.dueAt),
              Município: fine.city,
              Motorista: driverInfo?.name || "Não informado",
              CNH: driverInfo?.cnh || "Não informada",
              Pontos: fine.points,
              "Valor Notificado": amount(fine.amount),
              "Total Pago": paid.toFixed(2),
              Saldo: fine.amount.sub(paid).toFixed(2),
              Situação: fine.status,
              "Termo de Desconto": fine.driverId ? "Disponível para emissão individual" : "Sem condutor vinculado",
            };
          }),
        },
        {
          title: "Totais das multas do período",
          rows: [{
            "Quantidade de infrações": fines.length,
            "Total em pontos": fines.reduce((sum, f) => sum + f.points, 0),
            "Valor total das multas": fines.reduce((sum, f) => sum.add(f.amount || 0), new Decimal(0)).toFixed(2),
            "Multas pendentes": fines.filter(f => f.status === "PENDENTE" || f.status === "NOTIFICADA").length,
          }],
        },
      ];
      warnings.push("O Termo de Autorização para desconto em folha do motorista pode ser emitido individualmente via documentType=fineTerm com o identificador do auto.");
    } else if (input.report === "manutencoes") {
      const orders = await db.select().from(f.fleetWorkOrders).where(and(inArray(f.fleetWorkOrders.unitId, ids), fleetDates(f.fleetWorkOrders.scheduledAt, query.from, query.to, false, true), query.status ? eq(f.fleetWorkOrders.status, query.status) : undefined)).orderBy(desc(f.fleetWorkOrders.scheduledAt));
      const expenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), eq(f.fleetExpenses.nature, "MANUTENCAO"), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true))).orderBy(desc(f.fleetExpenses.occurredAt));
      const compInstalls = await db.select({ installation: f.fleetComponentInstallations, component: f.fleetComponents }).from(f.fleetComponentInstallations).innerJoin(f.fleetComponents, eq(f.fleetComponents.id, f.fleetComponentInstallations.componentId)).where(and(inArray(f.fleetComponentInstallations.unitId, ids), fleetDates(f.fleetComponentInstallations.installedAt, query.from, query.to, true))).orderBy(desc(f.fleetComponentInstallations.installedAt));
      title = "Relação das manutenções de peças, acessórios e serviços";
      sections = [
        {
          title: "Ordens de serviço de manutenção",
          rows: orders.map(o => ({
            Veículo: names.get(o.unitId) || o.unitId,
            OS: o.id,
            Tipo: o.type,
            Programação: date(o.scheduledAt),
            Conclusão: date(o.completedAt),
            Serviços: o.services,
            "Serviços executados": o.performed || "—",
            Resultado: o.result || "—",
            "Custo previsto": amount(o.estimatedCost),
            "Custo realizado": amount(o.actualCost),
            Situação: o.status,
          })),
        },
        {
          title: "Substituição de peças e acessórios instalados",
          rows: compInstalls.map(({ installation, component }) => ({
            Veículo: names.get(installation.unitId) || installation.unitId,
            Item: `${component.kind} · ${component.identifier}`,
            Marca: component.brand,
            Especificação: component.specification,
            Posição: installation.position,
            Instalação: date(installation.installedAt),
            Motivo: installation.reason,
            Custo: amount(installation.cost),
          })),
        },
        {
          title: "Despesas de manutenção apropriadas",
          rows: expenses.map(e => ({
            Veículo: names.get(e.unitId) || e.unitId,
            Data: date(e.occurredAt),
            Descrição: e.description,
            Fornecedor: e.supplierName || "Não informado",
            Valor: amount(e.amount),
            Referência: e.reference || "—",
          })),
        },
        {
          title: "Totais das manutenções",
          rows: [{
            "Ordens de serviço": orders.length,
            "Peças/acessórios instalados": compInstalls.length,
            "Total realizado em OS": orders.reduce((sum, o) => sum.add(o.actualCost || 0), new Decimal(0)).toFixed(2),
            "Total despesas de manutenção": expenses.reduce((sum, e) => sum.add(e.amount || 0), new Decimal(0)).toFixed(2),
          }],
        },
      ];
    } else if (input.report === "movimentacaoPneus") {
      const items = await db.select({ installation: f.fleetComponentInstallations, component: f.fleetComponents }).from(f.fleetComponentInstallations).innerJoin(f.fleetComponents, eq(f.fleetComponents.id, f.fleetComponentInstallations.componentId)).where(and(inArray(f.fleetComponentInstallations.unitId, ids), eq(f.fleetComponents.kind, "PNEU"), or(fleetDates(f.fleetComponentInstallations.installedAt, query.from, query.to, true), fleetDates(f.fleetComponentInstallations.removedAt, query.from, query.to, true)))).orderBy(desc(f.fleetComponentInstallations.installedAt));
      title = "Movimentação de pneus por veículo";
      sections = [
        {
          title: "Instalações e retiradas de pneus",
          rows: items.map(({ installation, component }) => ({
            Veículo: names.get(installation.unitId) || installation.unitId,
            "Identificador do Pneu": component.identifier,
            Marca: component.brand,
            Dimensões: component.specification,
            Posição: installation.position,
            "Data de Instalação": date(installation.installedAt),
            "Data de Retirada": date(installation.removedAt),
            "Situação Atual": component.status,
            Motivo: installation.reason,
            Custo: amount(installation.cost),
          })),
        },
        {
          title: "Resumo da movimentação",
          rows: [{
            "Total de movimentações": items.length,
            "Pneus atualmente em uso": items.filter(i => !i.installation.removedAt).length,
            "Pneus retirados": items.filter(i => !!i.installation.removedAt).length,
          }],
        },
      ];
    } else if (input.report === "trocaOleo") {
      const consumptions = await db.select().from(f.fleetConsumptions).where(and(inArray(f.fleetConsumptions.unitId, ids), eq(f.fleetConsumptions.type, "LUBRIFICANTE"), fleetDates(f.fleetConsumptions.occurredAt, query.from, query.to, false, true))).orderBy(desc(f.fleetConsumptions.occurredAt));
      const workOrders = await db.select().from(f.fleetWorkOrders).where(and(inArray(f.fleetWorkOrders.unitId, ids), fleetDates(f.fleetWorkOrders.scheduledAt, query.from, query.to, false, true), sql`lower(${f.fleetWorkOrders.services}) like '%oleo%' or lower(${f.fleetWorkOrders.services}) like '%óleo%' or lower(${f.fleetWorkOrders.services}) like '%lubrific%'`)).orderBy(desc(f.fleetWorkOrders.scheduledAt));
      title = "Movimentação de troca de óleo dos veículos";
      sections = [
        {
          title: "Trocas e reposições de óleo / lubrificantes registradas",
          rows: consumptions.map(c => ({
            Veículo: names.get(c.unitId) || c.unitId,
            Data: date(c.occurredAt),
            Material: c.material,
            "Quantidade (L)": `${c.quantity} ${c.measurementUnit}`,
            Origem: c.origin === "PROPRIO" ? "Próprio (Almoxarifado)" : "Terceiro",
            Fornecedor: c.supplierName || "Não informado",
            Custo: amount(c.cost),
            Referência: c.reference || "—",
          })),
        },
        {
          title: "Ordens de serviço com serviços de troca de óleo",
          rows: workOrders.map(o => ({
            Veículo: names.get(o.unitId) || o.unitId,
            OS: o.id,
            Data: date(o.completedAt || o.scheduledAt),
            Serviços: o.services,
            Execução: o.performed || "—",
            Custo: amount(o.actualCost || o.estimatedCost),
            Situação: o.status,
          })),
        },
        {
          title: "Totais de lubrificantes do período",
          rows: [{
            "Registros de consumo": consumptions.length,
            "Litros consumidos": consumptions.reduce((sum, c) => sum.add(c.quantity || 0), new Decimal(0)).toFixed(2),
            "Custo conhecido": consumptions.reduce((sum, c) => sum.add(c.cost || 0), new Decimal(0)).toFixed(2),
          }],
        },
      ];
    } else if (input.report === "gastosGerais") {
      const expenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true))).orderBy(desc(f.fleetExpenses.occurredAt));
      const groupsByNature = new Map<string, { total: Decimal; count: number }>();
      const groupsByUnit = new Map<string, { total: Decimal; count: number }>();
      for (const exp of expenses) {
        const nat = exp.nature || "OUTROS";
        const natGroup = groupsByNature.get(nat) || { total: new Decimal(0), count: 0 };
        natGroup.count++;
        if (exp.amount) natGroup.total = natGroup.total.add(exp.amount);
        groupsByNature.set(nat, natGroup);

        const unitGroup = groupsByUnit.get(exp.unitId) || { total: new Decimal(0), count: 0 };
        unitGroup.count++;
        if (exp.amount) unitGroup.total = unitGroup.total.add(exp.amount);
        groupsByUnit.set(exp.unitId, unitGroup);
      }
      title = "Gastos gerais com combustíveis, peças, pneus e manutenções no período";
      sections = [
        {
          title: "Resumo consolidado por natureza de despesa",
          rows: [...groupsByNature.entries()].map(([natureza, grp]) => ({
            Natureza: natureza,
            "Quantidade de registros": grp.count,
            "Total conhecido (R$)": grp.total.toFixed(2),
          })),
        },
        {
          title: "Resumo consolidado por veículo / máquina",
          rows: [...groupsByUnit.entries()].map(([unitId, grp]) => ({
            Veículo: names.get(unitId) || unitId,
            "Registros de gastos": grp.count,
            "Total conhecido (R$)": grp.total.toFixed(2),
          })),
        },
        {
          title: "Demonstrativo analítico de despesas",
          rows: expenses.map(e => ({
            Veículo: names.get(e.unitId) || e.unitId,
            Data: date(e.occurredAt),
            Natureza: e.nature,
            Descrição: e.description,
            Fornecedor: e.supplierName || "Não informado",
            Valor: amount(e.amount),
            Referência: e.reference || "—",
          })),
        },
        {
          title: "Total geral do período",
          rows: [{
            "Total de despesas": expenses.length,
            "Valor global conhecido (R$)": expenses.reduce((sum, e) => sum.add(e.amount || 0), new Decimal(0)).toFixed(2),
            "Despesas sem valor": expenses.filter(e => e.amount === null).length,
          }],
        },
      ];
    } else if (input.report === "relacaoRequisicoes") {
      const auths = await db.select().from(f.fleetAuthorizations).where(and(inArray(f.fleetAuthorizations.unitId, ids), eq(f.fleetAuthorizations.kind, "ABASTECIMENTO"), fleetDates(f.fleetAuthorizations.issuedAt, query.from, query.to, true), query.status ? eq(f.fleetAuthorizations.status, query.status) : undefined)).orderBy(desc(f.fleetAuthorizations.issuedAt));
      const providers = await db.select().from(f.fleetProviders).where(inArray(f.fleetProviders.id, auths.flatMap(a => a.providerId ? [a.providerId] : [])));
      const suppliersMap = new Map();
      for (const p of providers) {
        const s = await readFleetSupplier(db, p.supplierId, false);
        if (s?.company?.corporateName) suppliersMap.set(p.id, s.company.corporateName);
      }
      title = "Relação das Requisições de Abastecimento";
      sections = [
        {
          title: "Requisições de abastecimento emitidas no período",
          rows: auths.map(a => ({
            "Número / Código": a.code,
            Veículo: names.get(a.unitId) || a.unitId,
            Emissão: date(a.issuedAt),
            Validade: date(a.validUntil),
            "Posto / Fornecedor": suppliersMap.get(a.providerId || "") || "Próprio",
            Descrição: a.description,
            "Litros Autorizados": amount(a.authorizedQuantity, 3),
            "Litros Executados": amount(a.actualQuantity, 3),
            "Valor Limite (R$)": amount(a.authorizedAmount),
            "Valor Executado (R$)": amount(a.actualAmount),
            "Executado em": date(a.executedAt),
            Situação: a.status,
          })),
        },
        {
          title: "Totais das requisições",
          rows: [{
            "Total de requisições": auths.length,
            "Volume autorizado (L)": auths.reduce((sum, a) => sum.add(a.authorizedQuantity || 0), new Decimal(0)).toFixed(2),
            "Volume executado (L)": auths.reduce((sum, a) => sum.add(a.actualQuantity || 0), new Decimal(0)).toFixed(2),
            "Valor total executado (R$)": auths.reduce((sum, a) => sum.add(a.actualAmount || 0), new Decimal(0)).toFixed(2),
            "Pendentes / Emitidas": auths.filter(a => a.status === "EMITIDA").length,
            "Executadas": auths.filter(a => a.status === "EXECUTADA").length,
            "Canceladas": auths.filter(a => a.status === "CANCELADA").length,
          }],
        },
      ];
    } else if (input.report === "saidaViagem") {
      const trips = await db.select().from(f.fleetTrips).where(and(inArray(f.fleetTrips.unitId, ids), fleetDates(f.fleetTrips.departedAt, query.from, query.to, true), query.driverId ? eq(f.fleetTrips.driverId, query.driverId) : undefined)).orderBy(desc(f.fleetTrips.departedAt));
      title = "Relatório de Saída de Viagem com Roteiro";
      sections = [
        {
          title: "Deslocamentos e saídas de viagem no período",
          rows: trips.map(t => ({
            Veículo: names.get(t.unitId) || t.unitId,
            Motorista: (t.driverSnapshot as { name: string })?.name || "Não informado",
            Destino: t.destination,
            Finalidade: t.purpose,
            Roteiro: t.routeSnapshot || "Itinerário padrão",
            Saída: date(t.departedAt),
            Retorno: date(t.returnedAt),
            Marcador: t.meterType,
            "Km/Hor Inicial": amount(t.startReading, 3),
            "Km/Hor Final": amount(t.endReading, 3),
            Percorrido: t.startReading !== null && t.endReading !== null ? t.endReading.sub(t.startReading).toFixed(3) : "Em trânsito",
          })),
        },
        {
          title: "Campos para anotações do motorista na viagem",
          rows: [
            { "Campo": "Abastecimento no trajeto (Posto, Litros, R$, Odômetro)", "Anotações do motorista": "________________________________________________" },
            { "Campo": "Troca de óleo / Lubrificante (Tipo, Litros, Valor)", "Anotações do motorista": "________________________________________________" },
            { "Campo": "Manutenção emergencial / Serviços / Pneus", "Anotações do motorista": "________________________________________________" },
            { "Campo": "Pedágios / Despesas acessórias", "Anotações do motorista": "________________________________________________" },
            { "Campo": "Ocorrências / Intercorrências no trajeto", "Anotações do motorista": "________________________________________________" },
            { "Campo": "Assinatura do motorista e data", "Anotações do motorista": "________________________________________________" },
          ],
        },
      ];
    } else if (input.report === "acompanhamento") {
      const controls = await db.select().from(f.fleetUnitControls).where(inArray(f.fleetUnitControls.unitId, ids));
      const docs = await db.select().from(f.fleetDocuments).where(and(inArray(f.fleetDocuments.unitId, ids), eq(f.fleetDocuments.status, "PENDENTE")));
      const orders = await db.select().from(f.fleetWorkOrders).where(and(inArray(f.fleetWorkOrders.unitId, ids), inArray(f.fleetWorkOrders.status, ["EMITIDA", "EM_EXECUCAO"])));
      const expenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true)));
      title = "Relatório de acompanhamento de veículos e máquinas";
      sections = [
        {
          title: "Situação operacional e acompanhamento da frota",
          rows: units.map(u => {
            const ctrl = controls.find(c => c.unitId === u.id);
            const pendDocs = docs.filter(d => d.unitId === u.id);
            const openOrders = orders.filter(o => o.unitId === u.id);
            const unitExp = expenses.filter(e => e.unitId === u.id);
            const expTotal = unitExp.reduce((sum, e) => sum.add(e.amount || 0), new Decimal(0));
            return {
              Veículo: names.get(u.id)!,
              Categoria: u.category,
              Situação: u.status,
              "Disponibilidade Operacional": u.operationalStatus,
              "Placa / RENAVAM": `${u.plate || "S/P"} / ${u.renavam || "—"}`,
              Marca: u.brand || "—",
              Modelo: u.model || "—",
              Ano: String(u.year || "—"),
              "Marcador / Leitura Atual": `${ctrl?.meterType || "HODOMETRO"}: ${amount(ctrl?.currentReading, 3)}`,
              "OS em Aberto": openOrders.length,
              "Documentos / Seguros Pendentes": pendDocs.length,
              "Gastos Conhecidos no Período": expTotal.toFixed(2),
            };
          }),
        },
        {
          title: "Resumo da frota",
          rows: [{
            "Total de veículos/máquinas": units.length,
            "Operacionais / Ativos": units.filter(u => u.status === "ATIVO").length,
            "Em manutenção": units.filter(u => u.status === "EM_MANUTENCAO").length,
            "Inativos": units.filter(u => u.status === "INATIVO").length,
          }],
        },
      ];
    } else if (input.report === "movimentacoes") {
      const gates = await db.select({ gate: f.fleetGateEvents, trip: f.fleetTrips }).from(f.fleetGateEvents).innerJoin(f.fleetTrips, eq(f.fleetTrips.id, f.fleetGateEvents.tripId)).where(and(inArray(f.fleetTrips.unitId, ids), fleetDates(f.fleetGateEvents.occurredAt, query.from, query.to, true))).orderBy(desc(f.fleetGateEvents.occurredAt));
      title = "Relatório de controle e monitoramento de movimentações dos veículos";
      sections = [
        {
          title: "Eventos de entrada e saída na guarita",
          rows: gates.map(({ gate, trip }) => ({
            Veículo: names.get(trip.unitId) || trip.unitId,
            Movimento: gate.kind === "SAIDA" ? "Saída da garagem" : "Retorno / Entrada",
            "Data / Horário": date(gate.occurredAt),
            Leitura: amount(gate.reading, 3),
            Motorista: (trip.driverSnapshot as { name: string })?.name || "Não informado",
            Destino: trip.destination,
            Finalidade: trip.purpose,
          })),
        },
        {
          title: "Totais das movimentações",
          rows: [{
            "Total de passagens na guarita": gates.length,
            "Saídas registradas": gates.filter(g => g.gate.kind === "SAIDA").length,
            "Entradas / Retornos": gates.filter(g => g.gate.kind === "RETORNO").length,
          }],
        },
      ];
    } else if (input.report === "frota") {
      title = "Cadastro de Veículos no período";
      sections = [
        {
          title: "Veículos e máquinas cadastrados",
          rows: units.map(u => ({
            Código: u.code,
            Descrição: u.name,
            Categoria: u.category,
            Situação: u.status,
            "Disponibilidade Operacional": u.operationalStatus,
            Placa: u.plate || "Não aplicável",
            RENAVAM: u.renavam || "—",
            "Marca / Modelo / Ano": `${u.brand || "—"} / ${u.model || "—"} / ${u.year || "—"}`,
            "Setor": u.departmentId || "Sem setor",
            "Patrimônio": u.assetId || "Sem vínculo",
          })),
        },
        {
          title: "Totais",
          rows: [{
            "Total cadastrado": units.length,
            "Veículos": units.filter(u => u.category === "VEICULO").length,
            "Máquinas": units.filter(u => u.category === "MAQUINA").length,
            "Equipamentos": units.filter(u => u.category === "EQUIPAMENTO").length,
            "Agregados": units.filter(u => u.category === "AGREGADO").length,
          }],
        },
      ];
    } else if (input.report === "vencimentos") {
      const docs = await db.select().from(f.fleetDocuments).where(and(inArray(f.fleetDocuments.unitId, ids), fleetDates(f.fleetDocuments.dueAt, query.from, query.to, false, true), query.status ? eq(f.fleetDocuments.status, query.status) : undefined)).orderBy(asc(f.fleetDocuments.dueAt));
      title = "Vencimentos de documentos e seguros";
      sections = [{
        title: "Documentos e seguros com vencimento no período",
        rows: docs.map(d => ({
          Veículo: names.get(d.unitId) || d.unitId,
          Documento: `${d.title} / ${d.reference}`,
          Tipo: `${d.kind} · ${d.type}`,
          Seguradora: d.insurerName || "—",
          "Início Vigência": date(d.startsAt),
          Agendamento: date(d.scheduledAt),
          Vencimento: date(d.dueAt),
          Situação: d.status,
          Valor: amount(d.value),
        })),
      }, {
        title: "Totais",
        rows: [{
          "Total de documentos": docs.length,
          "Pendentes": docs.filter(d => d.status === "PENDENTE").length,
          "Cumpridos": docs.filter(d => d.status === "CUMPRIDA").length,
        }],
      }];
    } else if (input.report === "abastecimentos") {
      const consumptions = await db.select().from(f.fleetConsumptions).where(and(inArray(f.fleetConsumptions.unitId, ids), eq(f.fleetConsumptions.type, "COMBUSTIVEL"), fleetDates(f.fleetConsumptions.occurredAt, query.from, query.to, false, true))).orderBy(desc(f.fleetConsumptions.occurredAt));
      title = "Abastecimentos por período e veículo";
      sections = [{
        title: "Abastecimentos realizados",
        rows: consumptions.map(c => ({
          Veículo: names.get(c.unitId) || c.unitId,
          Data: date(c.occurredAt),
          Material: c.material,
          Quantidade: `${c.quantity} ${c.measurementUnit}`,
          Origem: c.origin === "PROPRIO" ? "Próprio (Almoxarifado)" : "Posto Terceirizado",
          Fornecedor: c.supplierName || "Não informado",
          Custo: amount(c.cost),
          Referência: c.reference || "—",
        })),
      }, {
        title: "Totais de abastecimento",
        rows: [{
          "Registros de abastecimento": consumptions.length,
          "Litros totais": consumptions.reduce((sum, c) => sum.add(c.quantity || 0), new Decimal(0)).toFixed(2),
          "Gasto total realizado": consumptions.reduce((sum, c) => sum.add(c.cost || 0), new Decimal(0)).toFixed(2),
        }],
      }];
    } else if (input.report === "gastos") {
      const expenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true), query.nature ? eq(f.fleetExpenses.nature, query.nature) : undefined)).orderBy(desc(f.fleetExpenses.occurredAt));
      title = "Gastos realizados da frota";
      sections = [{
        title: "Gastos registrados no período",
        rows: expenses.map(e => ({
          Veículo: names.get(e.unitId) || e.unitId,
          Data: date(e.occurredAt),
          Descrição: e.description,
          Natureza: e.nature,
          Fornecedor: e.supplierName || "Não informado",
          Valor: amount(e.amount),
          Referência: e.reference || "—",
          Origem: `${e.sourceType}:${e.sourceId}`,
        })),
      }, {
        title: "Totais",
        rows: [{
          "Registros": expenses.length,
          "Total conhecido (R$)": expenses.reduce((sum, e) => sum.add(e.amount || 0), new Decimal(0)).toFixed(2),
          "Despesas sem valor": expenses.filter(e => e.amount === null).length,
        }],
      }];
    } else if (input.report === "requisicoesEncerradas") {
      const rows = [];
      for (const area of ["abastecimento", "autorizacoes"] as const) {
        const list = await queryFleetControl(context, { ...query, area, status: "", unitIds: reportQuery.unitIds }, true);
        rows.push(...list.rows.filter(row => ["EXECUTADA", "CANCELADA"].includes(row.status) && (!query.status || row.status === query.status)).map(row => ({ Requisição: row.label, Situação: row.status, ...row.detail })));
      }
      sections = [{ title: "Requisições finalizadas e canceladas de abastecimento, manutenção e serviços", rows }];
    } else if (["combustivel", "escolar", "hospitalar"].includes(input.report)) {
      const records = await db.select().from(assetCatalogRecords).where(and(eq(assetCatalogRecords.kind, "empenhosCombustivel"), eq(assetCatalogRecords.active, true), inArray(assetCatalogRecords.departmentId, units.flatMap(unit => unit.departmentId ? [unit.departmentId] : []))));
      const allocations = records.filter(record => ids.includes(record.details.unitId) && (input.report === "combustivel" || record.details.purpose === input.report!.toUpperCase()) && (!query.from || record.year >= Number(query.from.slice(0, 4))) && (!query.to || record.year <= Number(query.to.slice(0, 4))));
      const annualExpenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), eq(f.fleetExpenses.nature, "COMBUSTIVEL")));
      const expenses = annualExpenses.filter(expense => (!query.from || expense.occurredAt.toISOString().slice(0, 10) >= query.from) && (!query.to || expense.occurredAt.toISOString().slice(0, 10) <= query.to));
      const linked = (expense: typeof expenses[number], allocation: typeof allocations[number]) => expense.unitId === allocation.details.unitId && expense.reference === allocation.details.reference && expense.occurredAt.getUTCFullYear() === allocation.year;
      const selected = input.report === "combustivel" ? expenses : expenses.filter(expense => allocations.some(allocation => linked(expense, allocation)));
      sections = [{ title: "Controle de abastecimentos por veículo", rows: selected.map(expense => ({ Veículo: names.get(expense.unitId) || expense.unitId, Data: date(expense.occurredAt), Descrição: expense.description, Empenho: expense.reference || "Sem referência", "Gasto conhecido": amount(expense.amount) })) }, { title: "Gastos e saldo operacional por empenho / veículo", rows: allocations.map(allocation => {
        const costs = expenses.filter(expense => linked(expense, allocation)), known = costs.reduce((sum, expense) => sum.add(expense.amount || 0), new Decimal(0));
        const limit = new Decimal(allocation.details.limit), annual = annualExpenses.filter(expense => linked(expense, allocation)), annualKnown = annual.reduce((sum, expense) => sum.add(expense.amount || 0), new Decimal(0));
        return { Empenho: allocation.details.reference, Exercício: allocation.year, Veículo: names.get(allocation.details.unitId)!, Finalidade: allocation.details.purpose, "Limite cadastrado": limit.toFixed(2), "Gastos conhecidos no período": known.toFixed(2), "Gastos conhecidos no exercício": annualKnown.toFixed(2), "Saldo operacional do exercício": limit.sub(annualKnown).toFixed(2), "Custos desconhecidos no exercício": annual.filter(expense => expense.amount === null).length };
      }) }, { title: "Total geral do recorte", rows: [{ "Gasto conhecido": selected.reduce((sum, expense) => sum.add(expense.amount || 0), new Decimal(0)).toFixed(2), "Valores desconhecidos": selected.filter(expense => expense.amount === null).length }] }];
      warnings.push("Saldo operacional calculado pelo limite cadastrado e despesas com a mesma referência de empenho, veículo e exercício; não representa saldo contábil oficial. Classifique finalidade e empenho no cadastro de controles de combustível. Despesas sem vínculo não entram no recorte escolar/hospitalar.");
    } else if (input.report === "cnh" || input.report === "pontuacao") {
      const drivers = await queryFleetControl(context, { ...query, area: "motoristas" }, true);
      const fines = await db.select().from(f.fleetFines).where(inArray(f.fleetFines.unitId, ids));
      const expiryStart = query.from || new Date().toISOString().slice(0, 10), expiryEnd = query.to || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      sections = [{ title: "Motoristas e habilitações", rows: drivers.rows.filter(row => input.report !== "cnh" || String(row.data.cnhExpiresAt).slice(0, 10) >= expiryStart && String(row.data.cnhExpiresAt).slice(0, 10) <= expiryEnd).map(row => {
        const end = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date(), start = new Date(end);
        start.setUTCMonth(start.getUTCMonth() - Number(row.data.pointWindowMonths));
        const selected = fines.filter(fine => fine.driverId === row.id && fine.status !== "CANCELADA" && fine.occurredAt >= start && fine.occurredAt <= end && (!query.from || fine.occurredAt.toISOString().slice(0, 10) >= query.from));
        return { Motorista: row.label, ...row.detail, "Pontos registrados no recorte": selected.reduce((sum, fine) => sum + fine.points, 0), "Autos considerados": selected.map(fine => fine.aitNumber).join(", ") || "Nenhum" };
      }) }];
      warnings.push("Pontuação calculada pelas multas não canceladas registradas na frota autorizada; não substitui consulta ao órgão de trânsito. Use o período para selecionar vencimentos de CNH.");
    } else if (input.report === "incorporacoes") {
      const events = await db.select().from(f.fleetAssetEvents).where(and(inArray(f.fleetAssetEvents.unitId, ids), fleetDates(f.fleetAssetEvents.createdAt, query.from, query.to, true))).orderBy(asc(f.fleetAssetEvents.createdAt));
      sections = [{ title: "Movimentações patrimoniais de veículos", rows: events.map(event => ({ Veículo: names.get(event.unitId) || event.unitId, Patrimônio: event.assetId, Evento: event.type, Data: date(event.createdAt), "Situação anterior": event.fromStatus || "Não informada", "Situação atual": event.toStatus || "Não informada" })) }];
      warnings.push("Relação interna de eventos patrimoniais para conferência do TCE-MG; não constitui arquivo de prestação de contas homologado.");
    } else if (input.report === "pneusBaixados") {
      const items = await db.select({ installation: f.fleetComponentInstallations, component: f.fleetComponents }).from(f.fleetComponentInstallations).innerJoin(f.fleetComponents, eq(f.fleetComponents.id, f.fleetComponentInstallations.componentId)).where(and(inArray(f.fleetComponentInstallations.unitId, ids), eq(f.fleetComponents.kind, "PNEU"), fleetDates(f.fleetComponentInstallations.removedAt, query.from, query.to, true)));
      sections = [{ title: "Pneus baixados", rows: items.filter(item => item.installation.removedAt && item.component.status === "BAIXADO").map(({ installation, component }) => ({ Veículo: names.get(installation.unitId) || installation.unitId, Pneu: component.identifier, Situação: component.status, Instalação: date(installation.installedAt), Retirada: date(installation.removedAt), Motivo: installation.reason })) }];
    } else {
      const usages = await db.select().from(f.fleetUsages).where(and(inArray(f.fleetUsages.unitId, ids), fleetDates(f.fleetUsages.startedAt, query.from, query.to, true), query.driverId ? eq(f.fleetUsages.driverId, query.driverId) : undefined));
      const expenses = await db.select().from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, ids), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true)));
      const fills = await db.select().from(f.fleetAuthorizations).where(and(inArray(f.fleetAuthorizations.unitId, ids), eq(f.fleetAuthorizations.kind, "ABASTECIMENTO"), eq(f.fleetAuthorizations.status, "EXECUTADA"), fleetDates(f.fleetAuthorizations.executedAt, query.from, query.to, true)));
      sections = [{ title: "Quilometragem das viagens", rows: usages.map(row => ({ Veículo: names.get(row.unitId) || row.unitId, Saída: date(row.startedAt), Retorno: date(row.endedAt), Marcador: row.meterType, Inicial: amount(row.initialReading, 3), Final: amount(row.finalReading, 3), Percorrido: row.initialReading !== null && row.finalReading !== null ? row.finalReading.sub(row.initialReading).toFixed(3) : "Não informado", Roteiro: row.routeSnapshot || "Sem roteiro" })) }, { title: "Consumo e gastos por veículo", rows: units.map(unit => {
        const runs = usages.filter(row => row.unitId === unit.id && row.meterType === "HODOMETRO" && row.initialReading !== null && row.finalReading !== null);
        const km = runs.reduce((sum, row) => sum.add(row.finalReading!.sub(row.initialReading!)), new Decimal(0)), costs = expenses.filter(row => row.unitId === unit.id);
        const total = costs.reduce((sum, row) => sum.add(row.amount || 0), new Decimal(0)), unknown = costs.filter(row => row.amount === null).length;
        const consumption = consumptionAverage((unit.control?.meterType || "HODOMETRO") as FleetMeter, fills.filter(row => row.unitId === unit.id && row.executedAt && row.actualQuantity).map(row => ({ reading: row.reading === null ? null : Number(row.reading), quantity: Number(row.actualQuantity), date: row.executedAt! })));
        return { Veículo: names.get(unit.id)!, "Km registrados": km.toFixed(3), "Gasto conhecido": total.toFixed(2), "Custos desconhecidos": unknown, "Gasto conhecido / km": km.gt(0) ? total.div(km).toFixed(4) : "Sem quilometragem", "Consumo (km/L ou L/h conforme marcador)": consumption === null ? "Dados insuficientes" : consumption.toFixed(3), Qualificação: unknown ? "TOTAL PARCIAL" : "REGISTROS DO FILTRO" };
      }) }];
      warnings.push("Quilometragem considera viagens concluídas registradas. Consumo usa abastecimentos autorizados executados com leituras; abastecimentos sem leitura não permitem calcular a média.");
    }
  } else if (query.area === "relatorios") {
    const requestedIds = input.unitIds?.length ? input.unitIds : query.unitIds ? query.unitIds.split(",") : [];
    if (requestedIds.length && (await db.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(and(fleetDepartmentFilter(scope), inArray(f.fleetUnits.id, requestedIds)))).length !== new Set(requestedIds).size) throw new FleetControlError("Uma das unidades está fora da repartição autorizada.");
    const selectedQuery = { ...query, unitIds: requestedIds.join(",") };
    const units = await readFleetUnits(db, fleetControlUnitWhere(context, selectedQuery));
    const departments = await db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(inArray(departmentTable.id, units.flatMap(unit => unit.departmentId ? [unit.departmentId] : [])));
    const centers = await db.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(inArray(costCenters.id, units.flatMap(unit => unit.control?.costCenterId ? [unit.control.costCenterId] : [])));
    title = "Dossiê integral de veículos, máquinas e equipamentos";
    for (const unit of units) {
      sections.push({ title: `${unit.code} · ${unit.name} — ficha completa`, rows: [{ Unidade: unit.code, Descrição: unit.name, Categoria: unit.category, Situação: unit.status, "Disponibilidade operacional": unit.operationalStatus, Placa: unit.plate || "Não aplicável", RENAVAM: unit.renavam || "Não informado", Marca: unit.asset?.brand || unit.brand || "Não informada", Modelo: unit.asset?.model || unit.model || "Não informado", Ano: unit.year || "Não informado", Espécie: unit.control?.species || "Não informada", Cor: unit.control?.color || "Não informada", Departamento: departments.find(department => department.id === unit.departmentId)?.name || "Sem setor", "Centro de custo": centers.find(center => center.id === unit.control?.costCenterId)?.name || "Não informado", Patrimônio: unit.asset?.patrimonyNumber || "Sem vínculo", "Situação patrimonial": unit.asset?.status || "Sem vínculo", Responsável: unit.asset?.responsible?.name || "Não informado", Aquisição: date(unit.asset?.acquisitionDate || unit.control?.acquisitionDate), "Documento de aquisição": unit.asset?.invoiceNumber || "Não informado", Combustível: unit.control?.fuelType || "Não informado", "Tanque (L)": amount(unit.control?.tankCapacity, 3), Marcador: unit.control?.meterType || "HODOMETRO", Leitura: amount(unit.control?.currentReading, 3), "Consumo esperado": amount(unit.control?.expectedConsumption, 3), "Tolerância (%)": amount(unit.control?.tolerancePercent, 3), "Modelo FIPE": unit.control?.fipeModelId || "Não vinculado", "Tipo de máquina": unit.control?.machineTypeId || "Não aplicável", "Campos da máquina": JSON.stringify(unit.control?.machineValues || {}), "Categorias CNH": JSON.stringify(unit.control?.allowedLicenseCategories || []), "Unidade principal": unit.parent ? `${unit.parent.code} · ${unit.parent.name}` : "Não aplicável", Observações: unit.notes || "Não informadas" }] });
      for (const area of ["cadastro", "debitos", "agenda", "guarita", "abastecimento", "autorizacoes", "componentes", "multas", "sinistros", "anexos"] as const) {
        const list = await queryFleetControl(context, { ...query, area, q: "", status: "", unitIds: "", unitId: unit.id, page: 1 }, true);
        sections.push({ title: `${unit.code} — ${area}`, rows: list.rows.map((row) => ({ Registro: row.id, Identificação: row.label, Situação: row.status, ...row.detail })) });
      }
      const usages = await db.select().from(f.fleetUsages).where(and(eq(f.fleetUsages.unitId, unit.id), fleetDates(f.fleetUsages.startedAt, query.from, query.to, true), query.driverId ? eq(f.fleetUsages.driverId, query.driverId) : undefined)).orderBy(asc(f.fleetUsages.startedAt));
      const documents = await db.select().from(f.fleetDocuments).where(and(eq(f.fleetDocuments.unitId, unit.id), fleetDates(f.fleetDocuments.dueAt, query.from, query.to, false, true))).orderBy(asc(f.fleetDocuments.dueAt));
      const plans = await db.select().from(f.fleetPlans).where(and(eq(f.fleetPlans.unitId, unit.id), fleetDates(f.fleetPlans.nextDueAt, query.from, query.to, false, true)));
      const orders = await db.select().from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.unitId, unit.id), fleetDates(f.fleetWorkOrders.scheduledAt, query.from, query.to, false, true)));
      const consumptions = await db.select().from(f.fleetConsumptions).where(and(eq(f.fleetConsumptions.unitId, unit.id), fleetDates(f.fleetConsumptions.occurredAt, query.from, query.to, false, true)));
      const expenses = await db.select().from(f.fleetExpenses).where(and(eq(f.fleetExpenses.unitId, unit.id), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true))).orderBy(asc(f.fleetExpenses.occurredAt));
      const events = await db.select().from(f.fleetControlEvents).where(and(eq(f.fleetControlEvents.unitId, unit.id), fleetDates(f.fleetControlEvents.createdAt, query.from, query.to, true))).orderBy(asc(f.fleetControlEvents.createdAt));
      sections.push({ title: `${unit.code} — utilização canônica (uma por retorno)`, rows: usages.map((row) => ({ Registro: row.id, Início: date(row.startedAt), Fim: date(row.endedAt), Finalidade: row.purpose, Condutor: row.employeeName || "Não informado", Marcador: row.meterType, Inicial: amount(row.initialReading, 3), Final: amount(row.finalReading, 3), Rota: row.routeSnapshot || "Sem rota" })) });
      const driverIds = [...new Set(usages.flatMap(usage => usage.driverId ? [usage.driverId] : []))];
      const drivers = await db.select().from(f.fleetDrivers).where(inArray(f.fleetDrivers.id, driverIds));
      const persons = await db.select({ id: people.id, fullName: people.fullName }).from(people).where(inArray(people.id, drivers.map(driver => driver.personId)));
      sections.push({ title: `${unit.code} — condutores vinculados às utilizações`, rows: drivers.map(driver => ({ Condutor: persons.find(person => person.id === driver.personId)?.fullName || "Não informado", CNH: driver.cnhNumber, Categorias: JSON.stringify(driver.cnhCategories), Validade: date(driver.cnhExpiresAt), Vínculo: driver.employeeId ? "Servidor RH" : "Terceirizado", "Política de pontos": `${driver.pointLimit} / ${driver.pointWindowMonths} meses · ${driver.policyReference}` })) });
      sections.push({ title: `${unit.code} — seguros/licenciamento/obrigações previstos e realizados`, rows: documents.map((row) => ({ Registro: row.id, Tipo: `${row.kind} / ${row.type}`, Documento: row.title, Apólice: row.reference, Seguradora: row.insurerName || "Não informada", Início: date(row.startsAt), Programação: date(row.scheduledAt), Vencimento: date(row.dueAt), Cumprimento: date(row.fulfilledAt), Valor: amount(row.value), Situação: row.status })) });
      sections.push({ title: `${unit.code} — planos e OS`, rows: [...plans.map((row) => ({ Registro: row.id, Tipo: "PLANO", Serviços: row.services, Programação: date(row.nextDueAt), Realizado: "Não é execução", Previsto: amount(row.estimatedCost) })), ...orders.map((row) => ({ Registro: row.id, Tipo: row.type, Serviços: row.services, Programação: date(row.scheduledAt), Realizado: date(row.completedAt), Previsto: amount(row.estimatedCost), "Custo realizado": amount(row.actualCost), Situação: row.status }))] });
      sections.push({ title: `${unit.code} — consumos e origem (não somar novamente ao gasto)`, rows: consumptions.map((row) => ({ Registro: row.id, Origem: row.origin, Material: row.material, Quantidade: `${row.quantity} ${row.measurementUnit}`, Custo: amount(row.cost), Fornecedor: row.supplierName || "Não informado", "Saída de estoque": row.stockMovementId || "Sem vínculo" })) });
      const unknown = expenses.filter((row) => row.amount === null).length, known = expenses.reduce((sum, row) => sum.add(row.amount || 0), new Decimal(0));
      if (unknown) warnings.push(`${unit.code}: ${unknown} gasto(s) sem valor. Total conhecido parcial, não equivalente a zero para os desconhecidos.`);
      sections.push({ title: `${unit.code} — gastos canônicos únicos`, rows: [...expenses.map((row) => ({ Registro: row.id, Natureza: row.nature, Data: date(row.occurredAt), Descrição: row.description, Valor: amount(row.amount), Fonte: `${row.sourceType}:${row.sourceId}`, Fornecedor: row.supplierName || "Não informado", Contrato: row.contractId || "Não vinculado" })), { "Total realizado conhecido": known.toFixed(2), "Valores desconhecidos": unknown, Conciliação: unknown ? "PARCIAL" : "COMPLETO_DO_FILTRO" }] });
      sections.push({ title: `${unit.code} — histórico imutável de operações`, rows: events.map((row) => ({ Operação: row.operation, Registro: row.targetId, Data: date(row.createdAt), Ator: row.actorId, "Hash da confirmação": row.payloadHash })) });
    }
  } else {
    const list = await queryFleetControl(context, query, true);
    title = `Frota — ${query.area}`;
    sections = [{ title: "Recorte completo autorizado", rows: list.rows.map((row) => ({ Identificação: row.label, Registro: row.id, Situação: row.status, ...row.detail })) }, { title: "Total do filtro", rows: [{ Registros: list.total }] }];
    if (list.debtSummary) sections.push({ title: "Débitos e pendências administrativas", rows: [{ "Pendente conhecido": list.debtSummary.outstandingKnown, "Valores não informados": list.debtSummary.unknownValues, "Pagamentos registrados": list.debtSummary.payments, "Cumprimentos administrativos": list.debtSummary.administrativeClosures, Observação: "Baixa administrativa de documento não comprova pagamento financeiro." }] });
    if (list.catalog) sections.push({ title: "Fonte do catálogo", rows: [{ Versão: list.catalog.reference, Fonte: list.catalog.sourceReference, Registros: list.catalog.records, Cobertura: list.catalog.complete ? "Integral da edição declarada" : "Parcial/amostra" }] });
  }
  const unitIds = await db.select({ id: f.fleetUnits.id, departmentId: f.fleetUnits.departmentId, code: f.fleetUnits.code, name: f.fleetUnits.name }).from(f.fleetUnits).where(fleetControlUnitWhere(context, { ...query, unitIds: input.unitIds?.length ? input.unitIds.join(",") : query.unitIds }));
  if (!input.documentType) {
    const expenses = await db.select({ unitId: f.fleetExpenses.unitId, nature: f.fleetExpenses.nature, occurredAt: f.fleetExpenses.occurredAt, supplierId: f.fleetExpenses.supplierId, supplierName: f.fleetExpenses.supplierName, amount: f.fleetExpenses.amount }).from(f.fleetExpenses).where(and(inArray(f.fleetExpenses.unitId, unitIds.map(row => row.id)), fleetDates(f.fleetExpenses.occurredAt, query.from, query.to, false, true)));
    const unitMap = new Map(unitIds.map((row) => [row.id, row.departmentId || "SEM_SETOR"]));
    const groups = new Map<string, { known: Decimal; unknown: number; count: number }>();
    for (const expense of expenses) for (const [dimension, value] of [["REPARTICAO", unitMap.get(expense.unitId)!], ["VEICULO", expense.unitId], ["FORNECEDOR", expense.supplierName || expense.supplierId || "NAO_INFORMADO"], ["PERIODO", expense.occurredAt.toISOString().slice(0, 7)]]) { const key = `${dimension}:${value}`, group = groups.get(key) || { known: new Decimal(0), unknown: 0, count: 0 }; group.count++; if (expense.amount === null) group.unknown++; else group.known = group.known.add(expense.amount); groups.set(key, group); }
    sections.push({ title: "Despesas agrupadas — fonte única FleetExpense", rows: [...groups].map(([key, group]) => ({ Agrupamento: key, Registros: group.count, "Valor conhecido": group.known.toFixed(2), "Custos desconhecidos": group.unknown, Qualificação: group.unknown ? "TOTAL_PARCIAL" : "TOTAL_DO_FILTRO" })) });
  }
  const filters = [`${query.from || "início"} a ${query.to || "sem limite final"}`, `Unidades: ${unitIds.map(unit => `${unit.code} · ${unit.name}`).join("; ") || "nenhuma unidade no filtro"}`, ...(query.departmentId ? [`Departamento: ${query.departmentId}`] : []), ...(query.driverId ? [`Condutor selecionado: ${query.driverId}`] : []), ...(query.q ? [`Busca: ${query.q}`] : []), ...(query.status ? [`Situação: ${query.status}`] : []), ...(query.nature ? [`Natureza: ${query.nature}`] : [])].join(" | ");
  return { title, year: Number((query.from || new Date().toISOString()).slice(0, 4)), warnings, metadata: { status: warnings.length ? "INTERNAL_PARTIAL" : "INTERNAL_REVIEW", scope: scope.administrator ? "Frota — setores autorizados" : "Frota — repartição atual", referencePeriod: filters, statutoryCompleteness: "NOT_STATUTORY", publicSnapshotEligible: false, publicSnapshotCondition: "Relatório operacional privado" }, sections };
}
