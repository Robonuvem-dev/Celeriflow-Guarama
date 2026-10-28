import type { Prisma } from "@prisma/client";
import { syntheticCpf, syntheticCnpj, syntheticPersonName } from "../src/lib/poc/fixture-catalog";
import { formatConsumerUnitIdentifier, reserveConsumerUnitIdentifiers } from "../src/lib/saneamento/unit-identifier";

export const sanitationCityPlan = {
  dataset: "aurora-sanitation-50k-v1",
  inhabitants: 50_000,
  residentsPerHousehold: 3,
  units: 18_500,
  categories: { Residencial: 16_000, Rural: 667, Comercial: 1_600, Industrial: 150, Pública: 83 },
  competences: ["08/2026", "09/2026", "10/2026"],
  serviceOrders: 900,
  qualityAnalyses: 720,
  portalRequests: 900,
  reports: 36,
} as const;

const key = (kind: string, index = 0) => `aurora-system-v1:${kind}:${String(index).padStart(3, "0")}`;
const date = (value: string) => new Date(`${value}T12:00:00Z`);
const neighborhoods = ["Centro", "Jardim das Acácias", "Boa Vista", "Vila Esperança", "Nova Aurora", "Parque das Veredas", "São Miguel", "Vale Verde", "Santa Clara", "Jardim Primavera", "Alto das Nascentes", "Bela Vista", "São José", "Jardim dos Ipês", "Morada do Sol", "Vila União", "Santa Luzia", "Lagoa Serena", "Distrito Industrial", "Comunidade das Palmeiras"];
const streets = ["Rua das Veredas", "Avenida do Ipê", "Rua Serra Clara", "Rua do Comércio", "Avenida das Nascentes", "Rua das Palmeiras", "Rua da Estação", "Alameda dos Cedros", "Rua dos Jacarandás", "Avenida Central", "Rua das Flores", "Rua Horizonte", "Rua da Lagoa", "Rua dos Pioneiros", "Avenida Vale Verde", "Rua das Oliveiras", "Rua dos Pinheiros", "Rua das Acácias", "Rua do Bosque", "Avenida das Araucárias"];
const given = ["Adriana", "Aline", "Amanda", "André", "Beatriz", "Bruno", "Camila", "Carlos", "Clara", "Daniel", "Diego", "Elisa", "Fabiana", "Felipe", "Gabriela", "Gustavo", "Helena", "Hugo", "Isabela", "João", "Juliana", "Larissa", "Leandro", "Letícia", "Lucas", "Mariana", "Mateus", "Natália", "Otávio", "Patrícia", "Rafael", "Renata", "Rodrigo", "Sabrina", "Thiago", "Valéria"];
const surnames = ["Azevedo", "Barbosa", "Barros", "Campos", "Cardoso", "Carvalho", "Castro", "Correia", "Costa", "Duarte", "Ferreira", "Fonseca", "Freitas", "Lima", "Machado", "Martins", "Mendes", "Mendonça", "Monteiro", "Moreira", "Nascimento", "Nogueira", "Oliveira", "Paes", "Pereira", "Ramos", "Reis", "Ribeiro", "Rocha", "Santos", "Silva", "Souza", "Teixeira", "Vasconcelos", "Viana", "Xavier"];
const personName = (index: number) => `${given[index % 36]} ${surnames[Math.floor(index / 36) % 36]} ${surnames[Math.floor(index / 1296) % 36]}`;

export async function seedSanitationCity(tx: Prisma.TransactionClient) {
  const stats: Record<string, number> = {};
  async function insert<T>(model: string, rows: T[], save: (data: T[]) => Promise<{ count: number }>) {
    stats[model] ??= 0;
    for (let start = 0; start < rows.length; start += 500) stats[model] += (await save(rows.slice(start, start + 500))).count;
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sanitationCityPlan.dataset}))`;
  const existing = await tx.sanConsumerUnit.findMany({ where: { id: { startsWith: "aurora-system-v1:water-unit:" } }, select: { id: true, postalCode: true } });
  const existingIds = new Set(existing.map((unit) => unit.id));
  const registration = date("2026-01-15");
  const missingCount = sanitationCityPlan.units - existingIds.size;
  const reservation = missingCount > 0 ? await reserveConsumerUnitIdentifiers(tx, registration, missingCount) : null;
  let sequence = reservation?.start ?? 1;
  const categories = Object.entries(sanitationCityPlan.categories).flatMap(([category, count]) => Array.from({ length: count }, () => category));

  const units: Prisma.SanConsumerUnitCreateManyInput[] = Array.from({ length: sanitationCityPlan.units }, (_, index) => {
    const category = categories[index];
    const neighborhood = category === "Rural" ? "Comunidade das Palmeiras" : neighborhoods[Math.floor(index / 1000) % neighborhoods.length];
    const streetAddress = `${streets[Math.floor(index / 50) % streets.length]}, ${10 + (index % 50) * 8}`;
    const postalCode = `39${String(100 + Math.floor(index / 1000)).padStart(3, "0")}-${String((Math.floor(index / 50) % 20) * 10).padStart(3, "0")}`;
    return {
      id: key("water-unit", index), code: existingIds.has(key("water-unit", index)) ? "" : formatConsumerUnitIdentifier(reservation!.period, sequence++),
      streetAddress, neighborhood, postalCode, address: `${streetAddress}, ${neighborhood}, ${postalCode}`,
      category, ownerName: ["Comercial", "Industrial"].includes(category) ? `${surnames[index % 36]} ${category === "Industrial" ? "Indústria" : "Comércio"} ${surnames[Math.floor(index / 36) % 36]} Ltda.` : category === "Pública" ? `Unidade Municipal ${index - 18416}` : personName(index),
      ownerDocument: (["Comercial", "Industrial", "Pública"].includes(category) ? syntheticCnpj(90000 + index) : syntheticCpf(90000 + index)).replace(/\D/g, ""),
      status: index % 100 === 95 ? "Cortada" : index % 100 === 96 ? "Suspensa" : index % 100 >= 97 ? "Inativa" : "Ativa",
      createdAt: registration,
    };
  });
  await insert("SanConsumerUnit", units.filter((unit) => !existingIds.has(unit.id!)), (data) => tx.sanConsumerUnit.createMany({ data, skipDuplicates: true }));
  // Fill only missing CEPs on the original fixture; retain operator edits.
  for (const unit of existing.filter((unit) => !unit.postalCode)) {
    const index = Number(unit.id.split(":").at(-1));
    if (units[index]) await tx.sanConsumerUnit.updateMany({ where: { id: unit.id, postalCode: null }, data: { postalCode: units[index].postalCode } });
  }
  const meters: Prisma.SanWaterMeterCreateManyInput[] = units.map((unit, index) => ({ id: key("water-meter", index), meterNumber: `AV26${8101 + index}`, unitId: unit.id!, installation: registration, createdAt: registration }));
  await insert("SanWaterMeter", meters, (data) => tx.sanWaterMeter.createMany({ data, skipDuplicates: true }));

  for (let month = 0; month < 3; month++) {
    const competence = sanitationCityPlan.competences[month];
    const readings: Prisma.SanMeterReadingCreateManyInput[] = units.map((unit, index) => {
      const category = categories[index];
      const base = category === "Industrial" ? 150 : category === "Comercial" ? 30 : category === "Pública" ? 60 : 12;
      const consumption = base + index % 6;
      const previousValue = 120 + index * 10 - (2 - month) * consumption;
      return { id: key(month === 2 ? "water-reading" : `water-reading-2026${8 + month}`, index), competence, unitId: unit.id!, meterId: key("water-meter", index), previousValue, currentValue: previousValue + consumption, consumption, readingDate: date(`2026-${String(8 + month).padStart(2, "0")}-13`), readerName: syntheticPersonName(107 + index % 12), status: index % 29 === 0 ? "Estimada" : index % 7 === 0 ? "Revisada" : "Registrada" };
    });
    await insert("SanMeterReading", readings, (data) => tx.sanMeterReading.createMany({ data, skipDuplicates: true }));
    const invoices: Prisma.SanInvoiceCreateManyInput[] = readings.map((reading, index) => ({
      id: key(`water-invoice-2026${8 + month}`, index), invoiceNumber: `FAT-2026${String(8 + month).padStart(2, "0")}-${String(index + 1).padStart(5, "0")}`, competence,
      unitId: reading.unitId, totalAmount: Number(((24 + reading.consumption * (categories[index] === "Industrial" ? 6.4 : 3.2)) * 1.6).toFixed(2)),
      dueDate: date(`2026-${String(8 + month).padStart(2, "0")}-25`), status: index % 100 === 99 ? "Cancelada" : month === 2 && index % 5 === 0 ? "Emitida" : index % 9 === 0 ? "Vencida" : "Paga",
    }));
    await insert("SanInvoice", invoices, (data) => tx.sanInvoice.createMany({ data, skipDuplicates: true }));
  }

  const orderTypes = ["Vazamento", "Religação", "Corte", "Manutenção", "Troca de Hidrômetro"];
  await insert("SanServiceOrder", Array.from({ length: sanitationCityPlan.serviceOrders }, (_, index) => ({
    id: key("water-order", index), orderNumber: `SA-2026-${8101 + index}`, orderType: orderTypes[index % 5],
    description: `${["Verificar vazamento no ramal e recompor passeio", "Religar abastecimento após regularização", "Executar suspensão programada da ligação", "Inspecionar válvulas e abrigo do hidrômetro", "Substituir hidrômetro com desgaste de medição"][index % 5]}.`,
    unitId: key("water-unit", index * 19 % sanitationCityPlan.units), technician: syntheticPersonName(107 + index % 8),
    priority: index % 15 === 0 ? "Urgente" : index % 4 === 0 ? "Alta" : "Normal",
    status: [1, 2].includes(index % 5) ? (index % 2 ? "Aberta" : "Em Andamento") : ["Concluída", "Aberta", "Em Andamento", "Cancelada"][index % 4],
    createdAt: date(`2026-${String(8 + index % 3).padStart(2, "0")}-${String(1 + index % 27).padStart(2, "0")}`),
  })), (data) => tx.sanServiceOrder.createMany({ data, skipDuplicates: true }));

  const parameters = ["Cloro residual livre", "Turbidez", "pH", "Coliformes totais", "Escherichia coli"];
  await insert("SanWaterQualityAnalysis", Array.from({ length: sanitationCityPlan.qualityAnalyses }, (_, index) => ({
    id: key("san-quality", index), collectionPoint: `${index % 12 === 0 ? "Saída ETA" : "Rede de distribuição"} — ${neighborhoods[index % 12]}`,
    collectedAt: date(`2026-${String(8 + Math.floor(index / 240)).padStart(2, "0")}-${String(1 + Math.floor(index % 240 / 60) * 7).padStart(2, "0")}`),
    parameter: parameters[index % 5], result: ["0,8 mg/L", index % 71 === 0 ? "6,0 uT" : "0,6 uT", "7,2", "Ausente", "Ausente"][index % 5],
    limit: ["0,2 a 5,0 mg/L", "≤ 5,0 uT", "6,0 a 9,5", "Ausente em 100 mL", "Ausente em 100 mL"][index % 5],
    compliance: index % 5 === 1 && index % 71 === 0 ? "Não Conforme" : "Conforme", active: true,
  })), (data) => tx.sanWaterQualityAnalysis.createMany({ data, skipDuplicates: true }));
  await insert("SanPortalRequest", Array.from({ length: sanitationCityPlan.portalRequests }, (_, index) => ({
    id: key("san-portal-request", index), requestType: ["Segunda via de fatura", "Conferência de consumo", "Atualização cadastral", "Comunicação de vazamento", "Solicitação de religação"][index % 5],
    requesterName: personName(index * 17 % 16667), requestedAt: date(`2026-${String(8 + index % 3).padStart(2, "0")}-${String(1 + index % 27).padStart(2, "0")}`),
    source: ["Portal de serviços", "Atendimento presencial", "Central telefônica"][index % 3], status: ["Recebida", "Em análise", "Atendida", "Concluída"][index % 4], active: true,
  })), (data) => tx.sanPortalRequest.createMany({ data, skipDuplicates: true }));
  const reportTypes = ["Consumo", "Faturamento", "Inadimplência", "Serviços", "Qualidade", "Cadastro"];
  await insert("SanSavedReport", Array.from({ length: sanitationCityPlan.reports }, (_, index) => ({
    id: key("san-report", index), name: `${reportTypes[index % 6]} por ${index % 2 ? "bairro" : "categoria"}`,
    type: reportTypes[index % 6], period: sanitationCityPlan.competences[Math.floor(index / 12)], format: index % 2 ? "CSV" : "PDF", active: true,
  })), (data) => tx.sanSavedReport.createMany({ data, skipDuplicates: true }));
  return stats;
}
