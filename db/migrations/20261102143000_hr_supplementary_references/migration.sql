-- Extend the existing reference catalog; preserve every previously accepted kind.
-- These records are internal/documentary inputs, not payroll postings or payments.
ALTER TABLE "HrReferenceRecord" DROP CONSTRAINT "HrReferenceRecord_kind_check";
ALTER TABLE "HrReferenceRecord" ADD CONSTRAINT "HrReferenceRecord_kind_check" CHECK (
  "kind" IN (
    'FERIADO','EQUIPE','FAIXA','ESCALA','PLANO_SAUDE','AMBIENTE_RISCO','PROCESSO',
    'LICENCA_EDUCACAO','PREVIDENCIA_OPTATIVA','MODELO_DOCUMENTO','LOTACAO_ORCAMENTARIA',
    'GRADUACAO_CURSO','GRADUACAO_SERVIDOR','INDICE_FINANCEIRO','TEMPO_CONTRIBUICAO',
    'PENSAO_VITALICIA','CONVENIO_BANCARIO','CONTA_CONVENIO','VT_ITINERARIO','VT_MOVIMENTO',
    'RATEIO_FOLHA','DEMANDA_PESSOAL','MOTIVO_DESLIGAMENTO'
  )
);
CREATE INDEX "HrReferenceRecord_kind_employee_idx"
  ON "HrReferenceRecord" ("kind", ("details"->>'employeeId'))
  WHERE "kind" IN ('GRADUACAO_SERVIDOR','TEMPO_CONTRIBUICAO','PENSAO_VITALICIA','CONTA_CONVENIO','VT_ITINERARIO','VT_MOVIMENTO');
CREATE INDEX "HrReferenceRecord_allocation_contract_idx"
  ON "HrReferenceRecord" (("details"->>'contractId'), ("details"->>'component'))
  WHERE "kind"='RATEIO_FOLHA';
