# RH e payroll: validação final de runtime

## Evidências de entrada

- `.next/cache/final-validation/unit-tail/042.tap`: RH falhava na linha 76 com
  `CPF inválido.`, em `resolveEmployeePerson` → `requireValidCpf`.
- `.next/cache/final-validation/unit-tail/074.tap`: ambos os poderes falhavam no
  assert do gatilho `injected payroll batch failure`, pois a mensagem externa
  Drizzle contém SQL/parâmetros e o erro PostgreSQL está em `cause`.

Esses logs originais foram preservados.

## Correções restritas às fixtures e testes

### Identidades RH

O único consumidor de `tests/fixtures/personnel-workforce.sql` é
`tests/hr-workforce-service.test.ts`. A pessoa `person`, compartilhada pelo
servidor `employee`, paciente, profissional clínico e contratos, passou de CPF
repetido inválido para `12345678909`. Esse mesmo CPF já estava nos snapshots de
holerites históricos da mesma pessoa, preservando a identidade entre as
referências. Os operadores e suas chaves estrangeiras permanecem preservados.

O dependente `child` recebeu inicialmente o CPF válido distinto `11144477735`.
A alteração posterior explícita para `52998224725` e o assert do cadastro
canônico foram preservados. O CPF `123` da proposta inválida de recadastramento
permanece como cenário negativo.

### Erros PostgreSQL no ciclo financeiro

Os dois asserts de falhas injetadas em
`tests/payroll-financial-cycle.test.ts` usam o helper existente `postgresError`:

| Operação | SQLSTATE | Mensagem exata |
| --- | --- | --- |
| Lote de empenhos | `P0001` | `injected payroll batch failure` |
| Estorno | `P0001` | `injected payroll reversal failure` |

Os asserts de rollback, replay, reserva, documento, partida, pagamento e
conclusão do ciclo permanecem ativos para EXECUTIVE e LEGISLATIVE.

## Execuções sequenciais

Executadas nesta ordem, com `--conditions=react-server --import tsx --test
--test-reporter=tap`:

1. `tests/hr-workforce-service.test.ts`:
   - log: `C:/Users/trici/AppData/Local/Temp/opencode/rh-runtime-final-01.tap`;
   - duração total: **89.433 ms**;
   - a validação do CPF passou e a execução avançou até a linha **734**;
   - resultado: **1 falha**, `Missing expected rejection.` no assert que exige
     bloqueio de documento de origem clínica.
2. `tests/payroll-financial-cycle.test.ts`:
   - log: `C:/Users/trici/AppData/Local/Temp/opencode/payroll-runtime-final-01.tap`;
   - duração total: **131.944 ms**;
   - resultado: **2 passaram, 0 falhas, 0 cancelados, 0 skips**;
   - EXECUTIVE: 63.287 ms; LEGISLATIVE: 62.640 ms.
3. `tests/hr-workforce-service.test.ts`, após a correção de runtime pelo parent:
   - log: `C:/Users/trici/AppData/Local/Temp/opencode/rh-runtime-final-02.tap`;
   - duração do cenário: **165.232 ms**; duração total: **171.469 ms**;
   - resultado: **1 passou, 0 falhas, 0 cancelados, 0 skips**;
   - cenário completo até o último assert, incluindo o bloqueio de documento
     clínico, exportações de 501 registros, folhas POC, férias vinculadas,
     desligamento e reintegração;
   - nenhuma correção adicional em fixture/teste foi necessária nesta rodada.

## Defeito RH identificado e corrigido pelo parent

A fixture insere `HealthClinicalDocument.id = 'occurrence-clinical'` e
`documentId = occurrenceDocument.id`, referenciando uma cadeia clínica real.
IDs distintos são importantes para expor o problema.

As subqueries de `src/lib/rh/functional-occurrences.ts:49–51` interpolavam
`documentTable.id` em uma projeção de tabela única. O `.toSQL()` do Drizzle
confirmou que essa interpolação perdia a qualificação externa:

```sql
select "id",
  (SELECT jsonb_build_object('id',h.id)
   FROM "HealthClinicalDocument" h
   WHERE h."documentId"="id")
from "Document"
where "Document"."id" = $1
```

Nesse escopo, `"id"` é a coluna da tabela interna `h`; a relação clínica não era
detectada quando os IDs são distintos. Após revisar consumidores, o parent
corrigiu as três subqueries com referência literal à tabela externa
`"Document"."id"`, sem alterar assinaturas. Runtime não foi alterado pelo agente
desta tarefa.

O assert de origem clínica foi mantido e passou na nova rodada. A execução RH
completa até o último assert passou. A ordem de operações de
cálculo/fechamento/publicação e todas as demais evidências do teste foram
preservadas. O build final após a alteração de runtime fica com o parent.

Nenhuma assinatura exportada, helper compartilhado ou arquivo runtime foi
alterado. Não foram executados build, tsc, npm ou comandos Git nesta tarefa.
