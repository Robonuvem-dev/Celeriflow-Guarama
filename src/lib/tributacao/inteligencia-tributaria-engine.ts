import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { insertTaxAuditCrossCheck, updateTaxAuditInfractionNotice } from "@/db/repositories/taxation/audit-cross-checks";
import type { TaxAuditCrossCheckRecord } from "@/lib/contracts/taxation-registry";

export interface TaxAuditCrossCheckInput {
  cnpjCpfContribuinte: string;
  razaoSocial: string;
  origemCruzamento: "DEISS_BANCOS" | "CARTORIO_DOI" | "CARTORIO_ITBI";
  valorDeclarado: number;
  valorApuradoBancos: number;
}

export interface TaxAuditCrossCheckResult {
  id: string;
  cnpjCpfContribuinte: string;
  razaoSocial: string;
  valorDeclarado: number;
  valorApuradoBancos: number;
  divergenciaImposto: number;
  statusMalha: string;
  numeroAutoInfracao?: string;
}

export async function runTaxAuditCrossCheck(
  db: DatabaseExecutor,
  input: TaxAuditCrossCheckInput
): Promise<TaxAuditCrossCheckResult> {
  const aliquotaIss = new Decimal("0.05"); // 5% ISS
  const valorDeclarado = new Decimal(input.valorDeclarado);
  const valorApuradoBancos = new Decimal(input.valorApuradoBancos);
  const diferencaFaturamento = Decimal.max(0, valorApuradoBancos.minus(valorDeclarado));
  const divergenciaImposto = diferencaFaturamento.times(aliquotaIss);

  const record = await insertTaxAuditCrossCheck(db, {
    cnpjCpfContribuinte: input.cnpjCpfContribuinte,
    razaoSocial: input.razaoSocial,
    origemCruzamento: input.origemCruzamento,
    valorDeclarado,
    valorApuradoBancos,
    divergenciaImposto,
  });

  return {
    id: record.id,
    cnpjCpfContribuinte: record.cnpjCpfContribuinte,
    razaoSocial: record.razaoSocial,
    valorDeclarado: Number(record.valorDeclarado),
    valorApuradoBancos: Number(record.valorApuradoBancos),
    divergenciaImposto: Number(record.divergenciaImposto),
    statusMalha: record.statusMalha,
  };
}

export async function issueTaxInfractionNotice(db: DatabaseExecutor, crossCheckId: string): Promise<{ record: TaxAuditCrossCheckRecord; numeroAutoInfracao: string }> {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  const numeroAutoInfracao = `AUTO-ISS-${year}-${random}`;

  const updated = await updateTaxAuditInfractionNotice(db, crossCheckId, numeroAutoInfracao);

  return { record: updated, numeroAutoInfracao };
}
