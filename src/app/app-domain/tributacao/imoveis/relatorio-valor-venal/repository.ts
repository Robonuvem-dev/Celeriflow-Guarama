import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { realEstates, taxpayers, companies, addresses } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { neighborhoods, streets } from "@/db/schema/localities";
import { pageValuations } from "@/db/schema/taxation-pages";

export type VenalReportFilters = {
  localityMode?: "TODOS" | "SEDE" | "DISTRITO";
  taxpayerId?: string;
  statusMode?: "TODOS" | "ATIVOS" | "BAIXADOS";
  onlyWithVenalValue?: boolean;
};

export type VenalReportResult = Awaited<ReturnType<typeof readVenalValueReport>>;
export type VenalReportTaxpayerGroup = VenalReportResult["groups"][number];
export type VenalReportItem = VenalReportTaxpayerGroup["items"][number];

export async function readVenalValueReport(
  db: DatabaseExecutor,
  filters: VenalReportFilters
) {
  const currentYear = new Date().getFullYear();

  // Buscar imóveis com titular, endereço, bairro e valuation mais recente
  const query = db
    .select({
      id: realEstates.id,
      municipalInsc: realEstates.municipalInsc,
      registration: realEstates.registration,
      status: realEstates.status,
      streetName: realEstates.streetName,
      number: realEstates.number,
      complement: realEstates.complement,
      lot: realEstates.lot,
      block: realEstates.block,
      landArea: realEstates.landArea,
      builtArea: realEstates.builtArea,
      neighborhoodId: realEstates.neighborhoodId,
      taxpayerId: realEstates.taxpayerId,
      taxpayerType: taxpayers.taxpayerType,
      personName: people.fullName,
      personCpf: people.cpf,
      companyName: companies.corporateName,
      companyCnpj: companies.cnpj,
      neighborhoodName: neighborhoods.name,
      valuationLand: pageValuations.landUnitValue,
      valuationConstruction: pageValuations.constructionUnitValue,
      valuationTotal: pageValuations.venalValueDecimal
    })
    .from(realEstates)
    .leftJoin(taxpayers, eq(taxpayers.id, realEstates.taxpayerId))
    .leftJoin(people, eq(people.id, taxpayers.personId))
    .leftJoin(companies, eq(companies.id, taxpayers.companyId))
    .leftJoin(neighborhoods, eq(neighborhoods.id, realEstates.neighborhoodId))
    .leftJoin(
      pageValuations,
      and(
        eq(pageValuations.realEstateId, realEstates.id),
        eq(pageValuations.year, currentYear)
      )
    )
    .$dynamic();

  const rows = await query.orderBy(
    asc(companies.corporateName),
    asc(people.fullName),
    asc(realEstates.municipalInsc)
  );

  // Aplicar filtros em memória ou SQL
  const filtered = rows.filter(r => {
    // Filtro por Contribuinte
    if (filters.taxpayerId && r.taxpayerId !== filters.taxpayerId) {
      return false;
    }

    // Filtro por Situação (Ativos / Baixados / Ambos)
    if (filters.statusMode === "ATIVOS") {
      if (["Baixado", "BAIXADO", "Inativo", "INATIVO"].includes(r.status)) return false;
    } else if (filters.statusMode === "BAIXADOS") {
      if (!["Baixado", "BAIXADO", "Inativo", "INATIVO"].includes(r.status)) return false;
    }

    // Filtro Localidade (Sede / Distrito)
    if (filters.localityMode === "DISTRITO") {
      if (!r.neighborhoodName?.toLowerCase().includes("distrito") && !r.neighborhoodName?.toLowerCase().includes("rural")) {
        return false;
      }
    } else if (filters.localityMode === "SEDE") {
      if (r.neighborhoodName?.toLowerCase().includes("distrito") || r.neighborhoodName?.toLowerCase().includes("rural")) {
        return false;
      }
    }

    // Filtro Valor Venal
    const landVal = Number(r.valuationLand ?? 50) * (r.landArea ?? 0);
    const builtVal = Number(r.valuationConstruction ?? 300) * (r.builtArea ?? 0);
    const totalVal = r.valuationTotal ? Number(r.valuationTotal) : (landVal + builtVal);

    if (filters.onlyWithVenalValue && totalVal <= 0) {
      return false;
    }

    return true;
  });

  // Agrupamento por contribuinte com somatórios
  const taxpayerGroups = new Map<string, {
    taxpayerId: string;
    taxpayerName: string;
    document: string;
    items: {
      id: string;
      municipalInsc: string;
      registration: string;
      address: string;
      block: string;
      lot: string;
      status: string;
      landArea: number;
      builtArea: number;
      venalTerritorial: number;
      venalPredial: number;
      venalTotal: number;
    }[];
    sumTerritorial: number;
    sumPredial: number;
    sumTotal: number;
  }>();

  for (const row of filtered) {
    const tpId = row.taxpayerId ?? "SEM_TITULAR";
    const tpName = row.companyName ?? row.personName ?? "Contribuinte Não Identificado";
    const doc = row.companyCnpj ?? row.personCpf ?? "";

    if (!taxpayerGroups.has(tpId)) {
      taxpayerGroups.set(tpId, {
        taxpayerId: tpId,
        taxpayerName: tpName,
        document: doc,
        items: [],
        sumTerritorial: 0,
        sumPredial: 0,
        sumTotal: 0
      });
    }

    const group = taxpayerGroups.get(tpId)!;

    const landUnit = Number(row.valuationLand ?? 50);
    const builtUnit = Number(row.valuationConstruction ?? 300);
    const venalTerritorial = landUnit * (row.landArea ?? 0);
    const venalPredial = builtUnit * (row.builtArea ?? 0);
    const venalTotal = row.valuationTotal ? Number(row.valuationTotal) : (venalTerritorial + venalPredial);

    const address = [
      row.streetName ?? "Rua não informada",
      row.number ? `nº ${row.number}` : "S/N",
      row.neighborhoodName ? `- ${row.neighborhoodName}` : ""
    ].filter(Boolean).join(", ");

    group.items.push({
      id: row.id,
      municipalInsc: row.municipalInsc ?? "—",
      registration: row.registration ?? "—",
      address,
      block: row.block ?? "—",
      lot: row.lot ?? "—",
      status: row.status,
      landArea: row.landArea ?? 0,
      builtArea: row.builtArea ?? 0,
      venalTerritorial,
      venalPredial,
      venalTotal
    });

    group.sumTerritorial += venalTerritorial;
    group.sumPredial += venalPredial;
    group.sumTotal += venalTotal;
  }

  const groups = Array.from(taxpayerGroups.values());
  const grandTotalTerritorial = groups.reduce((acc, g) => acc + g.sumTerritorial, 0);
  const grandTotalPredial = groups.reduce((acc, g) => acc + g.sumPredial, 0);
  const grandTotal = groups.reduce((acc, g) => acc + g.sumTotal, 0);

  return {
    groups,
    totalProperties: filtered.length,
    grandTotalTerritorial,
    grandTotalPredial,
    grandTotal
  };
}
