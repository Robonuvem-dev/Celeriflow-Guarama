import { eq, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { cadUnicoRecords, suasProntuarioRma } from "@/db/schema/social";
import type { SuasRmaRecord } from "@/lib/contracts/social";

export interface CadUnicoQueryResult {
  nis: string;
  cpf: string;
  nomeCompleto: string;
  rendaPerCapita: number;
  composicaoFamiliar: number;
  municipio: string;
  uf: string;
  statusCadastral: string;
  elegivelBolsaFamilia: boolean;
  elegivelBPC: boolean;
}

export async function queryCadUnicoMds(
  database: DatabaseExecutor,
  searchNisOrCpf: string
): Promise<CadUnicoQueryResult> {
  const cleanSearch = searchNisOrCpf.replace(/\D/g, "");

  const [record] = await database.select().from(cadUnicoRecords).where(or(eq(cadUnicoRecords.nis, cleanSearch), eq(cadUnicoRecords.cpf, cleanSearch), eq(cadUnicoRecords.nis, searchNisOrCpf), eq(cadUnicoRecords.cpf, searchNisOrCpf))).limit(1);

  if (!record) throw new Error("Registro do CadÚnico não encontrado.");

  const renda = Number(record.rendaPerCapita);

  return {
    nis: record.nis,
    cpf: record.cpf,
    nomeCompleto: record.nomeCompleto,
    rendaPerCapita: renda,
    composicaoFamiliar: record.composicaoFamiliar,
    municipio: record.municipio,
    uf: record.uf,
    statusCadastral: record.statusCadastral,
    elegivelBolsaFamilia: renda <= 218.0,
    elegivelBPC: renda <= 353.0,
  };
}

export async function createSuasRmaRecord(
  database: DatabaseExecutor,
  data: {
    nis: string;
    nomeCidadao: string;
    unidadeAtendimento: string;
    tipoAtendimento: string;
    detalhesRma: string;
    tecnicoResponsavel: string;
  }
) : Promise<SuasRmaRecord> {
  const [record] = await database.insert(suasProntuarioRma).values({
      nis: data.nis,
      nomeCidadao: data.nomeCidadao,
      unidadeAtendimento: data.unidadeAtendimento,
      tipoAtendimento: data.tipoAtendimento,
      detalhesRma: data.detalhesRma,
      tecnicoResponsavel: data.tecnicoResponsavel,
      status: "FINALIZADO",
  }).returning();
  return record;
}
