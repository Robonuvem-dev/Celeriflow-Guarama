# Contrato configurado de afastamento SST → Folha

O consumidor `reconcileCertificateLeavePayroll` chama a API transacional PostgreSQL `sst_post_certificate_leave`. A interface está na ficha `/sst/atestados/[id]`, seção **Reflexos configurados e reconciliação RH/Folha**, com uma action `await` que preserva `{ error, id }`.

## Configuração obrigatória, sem padrão monetário

RH deve escolher e aprovar a política e seus documentos. O software suporta somente `RATE_PER_ATTESTED_MINUTE`, versão 1. Não há tarifa padrão, leitura de salário atual, multiplicador dias × 8, percentual implícito ou cálculo universal por regime.

O exemplo abaixo demonstra **apenas a estrutura** de `HrPayrollRule.value`. A tarifa ilustrativa não é recomendação, seed nem configuração aplicada. Substituir os IDs, a tarifa e as referências pelos aprovados por RH antes de usar produção:

```json
{
  "originKind": "SST_CERTIFICATE_LEAVE",
  "employmentRegimeIds": ["ID_REGIME_CANONICO_RH"],
  "leaveTypes": ["TIPO_EXATO_DA_LICENCA_CANONICA"],
  "effect": "CANONICAL_CALCULATION_REQUIRED",
  "rubricId": "ID_RUBRICA_APROVADA",
  "eventId": "ID_EVENTO_COMPATIVEL",
  "calculation": {
    "version": 1,
    "mode": "RATE_PER_ATTESTED_MINUTE",
    "currency": "BRL",
    "rateBRLPerMinute": "0.12345678",
    "rounding": { "mode": "HALF_UP", "scale": 2 },
    "legalReference": "ATO_LEGAL_APROVADO_PELO_RH",
    "sourceReference": "DOCUMENTO_AUTORITATIVO_DA_TARIFA_APROVADA"
  },
  "reversal": {
    "rubricId": "ID_RUBRICA_COMPENSATORIA_APROVADA",
    "eventId": "ID_EVENTO_COMPENSATORIO_COMPATIVEL",
    "legalReference": "ATO_LEGAL_APROVADO_PELO_RH"
  }
}
```

Requisitos adicionais:

- `HrPayrollRule`: `category=CALCULO`, `valueType=JSON`, ativa; `legalReference` deve coincidir exatamente com `calculation.legalReference` e, para compensar, `reversal.legalReference`.
- Regra e regime pertencem ao mesmo `HrPayrollRuleSet`, ativo, `PRODUCAO`, aprovado, sem demonstração e vigente na competência inteira. Não aceitar aprovação futura.
- `HrCalculationPolicy`: `BRL`, `HALF_UP`, escala 2 e política de líquido negativo explicitamente `BLOQUEAR` ou `PERMITIR`.
- Rubrica ativa `MANUAL` do mesmo conjunto: `DESCONTO` ↔ evento `Desconto`, ou `PROVENTO` ↔ evento `Vencimento`. Evento ativo, sem fórmula concorrente. Compensação exige o sentido oposto ao original, explicitamente mapeado na regra aprovada.
- Histórico funcional canônico integral da competência, fonte do atestado compatível, UG/entidade comprovadas e escopo explícito da folha mensal. Escopo novo exige confirmação documental do operador; reaproveita `SstBenefitPayrollScope`, sem cadastro paralelo de entidade.
- Decisão aprovada imutável, licença canônica ativa com datas idênticas e jornada planejada documentada. Intervalos são unidos; os minutos efetivamente sobrepostos à licença na competência são calculados com `NUMERIC` PostgreSQL.

## Persistência, repetição e compensação

`SstLeavePayrollRuleVersion` sela a configuração usada. `SstLeavePayrollOrigin` liga a decisão imutável, licença, período funcional, rubrica e `PayrollItem.valueDecimal`. O valor absoluto tem duas casas; o sentido vem do evento canônico. A projeção Float legada só é aceita quando representa exatamente o valor decimal. O total canônico é recalculado pela API F7 existente.

Repetir a origem da mesma decisão/licença/competência retorna `ALREADY_POSTED`. Outra origem sobreposta aos mesmos minutos exige reconciliação. Evento legado calculado sem vínculo, regra incompleta, tipo incompatível, fonte ausente ou competência fechada/paga bloqueiam novas postagens.

Compensação conserva a folha original, inclusive fechada/paga. Usa o valor decimal original, sem novo cálculo ou valor manual, e cria um item de sentido oposto em competência aberta com mapeamento aprovado. Cada origem pode ser compensada uma vez. Decisão clínica só pode mudar após compensar todas as origens e resolver reflexos legados conflitantes.

Postagem e estado `Paga` da folha não comprovam quitação bancária. Esta rotina não altera estado de pagamento nem fabrica data/recibo bancário.

Migração aditiva: `20261011110000_add_sst_leave_payroll_origins`, após as migrações de histórico RH e de origens decimais F7. Nenhuma configuração monetária ou migração operacional foi aplicada pelo agente.
