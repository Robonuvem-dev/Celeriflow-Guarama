# RH — políticas operacionais preparadas

Configure regras JSON em **RH > Parametrizações**, dentro do conjunto do regime. Os exemplos são formatos; substitua IDs, fundamentos e valores por dados reais. Conjunto ativo e vigência não substituem homologação oficial.

## Licença-prêmio por dias contáveis (regra LICENCA_PREMIO)

```json
{"origin":"LICENCA_PREMIO","acquisitionDays":1825,"entitlementDays":90,"minSplitDays":15,"maxSplits":6,"allowsCash":true,"maxCashDays":30,"absences":[{"type":"Licença-prêmio","effect":"CONTAR"},{"type":"Sem vencimento","effect":"SUSPENDER"}],"legalReference":"Política sintética POC, substituir por fundamento aplicável"}
```

Valores acima são demonstrativos, não regra municipal nem equivalência de cinco anos civis. Operações > Direitos apura até data não futura, reserva GOZO/PECUNIA por aquisitivo e cancela reservas futuras. `SUSPENDER` prorroga pela união dos dias sem contagem; `REINICIAR` recomeça após o último dia do afastamento; tipo não configurado bloqueia apuração. Períodos de gozo são afastamentos nativos protegidos contra alteração manual. Pecúnia apenas reserva dias; geração financeira tem fluxo próprio. Consulta do titular: `/portal-servidor/licenca-premio`.

## ATS e averbação anterior (regra ATS)

```json
{"origin":"ATS","rubricCode":"ATS_POC","basis":"SALARIO_TEMPORAL","tiers":[{"minimumDays":365,"rate":"1"},{"minimumDays":1825,"rate":"5"}],"absences":[{"type":"Licença-prêmio","counts":true},{"type":"Sem vencimento","counts":false}],"legalReference":"Regra sintética de tempo de serviço"}
```

Faixas se baseiam em dias explicitamente contados até o fim da competência, não anos presumidos. Averbação exige intervalo anterior à admissão, dias reconhecidos não superiores ao intervalo e ato; período sobreposto da mesma identidade não pode ser duplicado em outro contrato. Escopo é explícito. Estorno de averbação mantém o original. Apuração ATS exige mensal integral aberta, rubrica MANUAL/PROVENTO e salário temporal. Movimento é único por contrato/competência, sem duplicar em outra folha. Estorno de ATS cria movimento contrário; mudanças de tempo/salário/afastamentos bloqueiam cálculo/fechamento de ATS não conciliado. Rateio intramês, outras bases, reposicionamento após estorno e correção retroativa possuem desenvolvimento próprio pendente.

## Provisões mensais (regra PROVISOES_FOLHA)

```json
{"origin":"PROVISOES_FOLHA","legalReference":"Classificação sintética POC","components":[{"kind":"PROVISAO_13","rubricCodes":["SALARIO"],"rate":"8.33333333","employerRate":"20"}]}
```

Tipos: `PROVISAO_FERIAS`, `PROVISAO_13`, `PROVISAO_LICENCA`. Base é soma das rubricas de provento únicas no snapshot; remuneração = base × rate/100 e patronal = remuneração × employerRate/100, com arredondamento separado HALF_UP. Apropriação usa ano da competência no ledger, quantidade 1 por mês e memória por verba. Relatório DIREITOS mostra os saldos. Estorno compensatório não apaga origem. Esse ledger RH não representa razão contábil, empenho ou pagamento.

## Lotes e expiração explícita (regra BANCO_HORAS_EXPIRACAO)

## Baixa de provisão por empenho nativo

Em Operações > Direitos, informe chave estável, empenho e alocações de apropriações:

```json
[{"entryId":"ID_DA_APROPRIACAO","amount":"100.00"}]
```

O empenho deve existir no Financeiro, ligado por reserva à despesa RH/PAYROLL_RUN já empenhada e à folha oficial fechada de produção. Exige RH/update, Financeiro/update e acesso à UG. Apropriações precisam pertencer aos contratos daquela folha, em produção, e estar disponíveis. Total acumulado das baixas não pode exceder valor vigente do empenho (incluindo reforços/anulações), nem saldo da apropriação. Nenhum empenho ou pagamento é criado por esse formulário.

Guarde `PROVISAO:BAIXA:<chave>`. Após anulação integral do empenho no Financeiro, o formulário de estorno devolve as quantias integralmente ao ledger com histórico compensatório. Empenho ativo ou apenas parcialmente anulado bloqueia devolução automática. Enquanto consumida, a apropriação original não pode ser estornada. Razão patrimonial, automatização da seleção de parcelas e anulação parcial permanecem em desenvolvimento.

## Lotes e expiração explícita — operação

```json
{"origin":"BANCO_HORAS_EXPIRACAO","method":"FIFO_PRESERVA_ORIGEM","effectiveMode":"BAIXA_EXPLICITA_NA_APURACAO","maximumAgeDays":180,"legalReference":"Vencimento sintético POC"}
```

Operações > Direitos oferece PREVIA/APLICAR por titular e data não futura. FIFO reconstitui todos os contratos do titular no escopo, conserva datas de aquisição nas transferências e elimina pares de estorno. Créditos ordinários do dia são considerados antes de transferências e débitos ordinários, conforme a apuração por dia civil. O vencimento dá elegibilidade à baixa explícita; até aplicar, o saldo agregado permanece reconhecido. Baixa é efetiva na data da apuração, não retroativamente no aniversário do lote. Saldos insuficientes por consumo futuro, transferências sem origem íntegra e políticas de regimes não abrangidos bloqueiam a aplicação integral. Não há cron novo.

## Layouts configuráveis de obrigações (regras OBRIGACAO_LAYOUT*)

```json
{"origin":"OBRIGACAO_LAYOUT","obligation":"CONFERENCIA","version":"POC_V1","format":"FIXED_WIDTH","legalReference":"Layout sintético de conferência","fields":[{"name":"MATRICULA","source":{"type":"FIELD","path":"identity.registration"},"required":true,"width":20,"align":"LEFT","pad":"SPACE","transform":"NONE"},{"name":"LIQUIDO","source":{"type":"FIELD","path":"totals.net"},"required":true,"width":14,"align":"RIGHT","pad":"ZERO","transform":"CENTAVOS"}]}
```

Formatos CSV/FIXED_WIDTH. Fontes FIELD usam paths permitidos de identidade/competência/local/centro/regime/totais/versão; RUBRIC exige `code` único no snapshot; LITERAL exige `value`. Transformações: NONE, COMPETENCIA_AAAAMM, DIGITOS, SEM_ACENTOS_MAIUSCULO, CENTAVOS. Largura fixa é ASCII com overflow bloqueado; normalização deve ser explícita. CSV usa UTF-8/BOM, aspas, ponto e vírgula e proteção contra fórmulas. `required` é revalidado após transformação. Não aceita NUL/quebras de linha em campos.

Gere em `/rh/esocial` por regra/ano/escopo. Evento guarda bytes, SHA-256, política e versões utilizadas; download posterior não regenera o passado e revalida acesso orçamentário. `obligation` admite CONFERENCIA/DIRF/SEFIP_GFIP/MANAD/SIOPE/TCE/CADPREV como identificação; não implica homologação do respectivo layout. `officialLayout=false` até implementação/validação específica. XML/eSocial e populações externas à folha têm fluxos próprios pendentes.

## Gozo de vários aquisitivos — operação

Em `/rh/operacoes`, aba Direitos, informe contrato, chave estável, início, fundamento e a distribuição JSON:

```json
[
  {"periodStart":"2023-01-01","periodEnd":"2023-12-31","days":15},
  {"periodStart":"2024-01-01","periodEnd":"2024-12-31","days":15}
]
```

Formato demonstrativo: exige saldos já existentes e política de férias vigente do regime temporal. Ordena aquisitivos do mais antigo ao mais recente e cria gozos consecutivos com projeções distintas, respeitando mínimo e número máximo de parcelas de cada aquisitivo. O grupo admite 2–10 períodos não sobrepostos e até 90 dias ao todo. Aquisição/perda/prorrogação e concessão de pecúnia possuem fluxos próprios.

Guarde a origem retornada `FERIAS:MULTIPLOS:<chave>`. Cancelamento é integral por essa origem e fundamento, com devolução compensatória de cada saldo. Gozo iniciado ou período com folha oficial fechada exige conciliação própria. Repetir a mesma operação não duplica reservas/devoluções.

## Mensagens históricas de recibo (regra MENSAGENS_RECIBO)

```json
{
  "origin": "MENSAGENS_RECIBO",
  "messages": [{
    "id": "AVISO_POC",
    "text": "Demonstrativo sintético para conferência da POC.",
    "startsAt": "2026-10-01",
    "endsAt": "2026-10-31",
    "contractIds": [],
    "regimeIds": [],
    "payrollTypes": ["Mensal"]
  }]
}
```

Cadastre como JSON no conjunto do regime. Listas vazias abrangem todos os contratos/regimes/tipos daquele conjunto; listas preenchidas se combinam por AND. A competência precisa intersectar a vigência da mensagem. IDs são únicos; máximo 100 mensagens, texto de até 2.000 caracteres. Mensagens são texto simples. Seleção é preservada no cálculo mensal ou cenário especial, exibida na conferência e PDF, inclusive no acesso próprio do titular. Política alterada após o cálculo só repercute em cálculos novos.

## Histórico interno para preparação de obrigações

Em `/rh/esocial`, escolha ano e escopo para baixar `RH_OBRIGACOES_HISTORICO_V1`. O arquivo traz todos os demonstrativos oficiais fechados no filtro e na UG acessível, com identidade histórica, rubricas/bases/totais e hashes SHA-256. `contentSha256` cobre o conteúdo sem o próprio campo, usando JSON com chaves ordenadas e arrays na ordem exportada; `recordSha256` segue a mesma convenção. Não há timestamp de download no conteúdo, permitindo comparar exportações repetidas. `snapshotSha256` identifica a memória integral de origem, não somente os campos expostos.

Referência anual é pela competência calculada. Pagamentos, classificações fiscais, retificações e seleção da versão válida para cada obrigação requerem processamento próprio. O formato interno não é XML eSocial, DIRF, RAIS, GFIP nem comprovante anual de rendimentos.

## Horas extras reconhecidas (categoria CALCULO)

```json
{
  "origin": "HORAS_EXTRAS_PONTO",
  "rubricCode": "HORAS_EXTRAS",
  "additionalRate": "50",
  "legalReference": "Identificação da norma/ato aprovado"
}
```

A rubrica precisa ser PROVENTO/MANUAL. A operação em `/rh/operacoes`, aba movimentos, usa as horas extras explicitamente reconhecidas em `/rh/ponto`, não a diferença dos horários. Por dia: salário temporal ÷ jornada mensal × horas reconhecidas × (1 + adicional/100), arredondado HALF_UP em centavos. A configuração precisa cobrir a competência inteira. A origem de cada registro é única entre vínculos; correções posteriores exigem movimentos compensatórios.

## Médias de remuneração (categoria CALCULO)

```json
{
  "origin": "MEDIA_REMUNERACOES",
  "rubricCodes": ["SALARIO", "HORAS_EXTRAS"],
  "highestPercent": "80",
  "selectionRounding": "CEIL",
  "missingMonths": "BLOQUEAR",
  "method": "NOMINAL",
  "legalReference": "Identificação da norma aplicável"
}
```

Consulta: `/rh/operacoes/medias`. Seleciona folhas mensais oficiais fechadas no escopo da regra e na UG acessível ao operador. A política escolhe as rubricas de provento e como tratar meses sem histórico (`ZERO` ou `BLOQUEAR`). `FLOOR`/`CEIL` determinam o arredondamento da quantidade selecionada. Método `ATUALIZADA` exige `indexationFactors` com fator positivo para **cada** competência, por exemplo `{"10/2026":"1.005"}`. Exibe memória e versões de origem; não concede benefício ou aposentadoria.

## Recadastramento (categoria PORTAL)

```json
{
  "origin": "CAMPANHA_RECADASTRAMENTO",
  "startsAt": "2026-11-01T00:00:00.000Z",
  "endsAt": "2026-11-30T23:59:59.000Z",
  "employeeIds": ["ID_EMPLOYEE"],
  "fields": ["email", "phonePrimary", "whatsapp"],
  "instructions": "Confira e proponha a atualização dos contatos."
}
```

Campos permitidos: email, phonePrimary, phoneSecondary, whatsapp, maritalStatus, profession, educationLevel. O Portal identifica o titular pela sessão, aceita apenas os campos habilitados e registra uma proposta por campanha/titular. RH acompanha convocados/respostas em `/rh/recadastramento` e confere o diff em `/rh/solicitacoes`. Deferimento atualiza `Person`, projeção de contato em `Employee`, decisão e auditoria na mesma transação. Dados centrais alterados depois da proposta bloqueiam o deferimento para revisão do conflito. Alterar uma campanha não apaga as respostas nem a política preservada em cada proposta.

## Solicitações de despesa no Financeiro (categoria CALCULO)

```json
{
  "origin": "FOLHA_SOLICITACOES_DESPESA",
  "legalReference": "Ato de classificação da folha",
  "mappings": [{
    "costCenterId": null,
    "gross": {
      "appropriationId": "ID_DOTACAO",
      "supplierId": "ID_CREDOR_REMUNERACAO",
      "secretariatId": "ID_SECRETARIA"
    },
    "employer": {
      "appropriationId": "ID_DOTACAO_ENCARGOS",
      "supplierId": "ID_CREDOR_ENCARGOS",
      "secretariatId": "ID_SECRETARIA"
    }
  }]
}
```

Configure um mapeamento para cada centro presente no snapshot; `null` significa ausência de centro, não curinga. O credor reutiliza `Supplier` do Financeiro. Encargos não nulos exigem classificação própria. A conferência do cálculo fechado oferece prévia e aplicação; aplicação exige produção com parâmetros oficiais aprovados, permissão RH/update e Financeiro/create e acesso à UG de cada dotação. A criação usa `createExpenseRequest`, inclusive seus controles de exercício e origem.

O plano fica preservado antes dos lançamentos. Falha parcial deixa `AGUARDANDO_RETRY`; repetir a mesma operação completa os passos faltantes sem duplicação. Mudar data/regra de um plano preparado é rejeitado. As solicitações geradas seguem os fluxos nativos de aprovação/reserva/empenho/liquidação/pagamento. Retenções, repasses, classificação por fonte/natureza além do agrupamento disponível e compensações de folha continuam requerendo desenvolvimento próprio.

## Cenários de folhas especiais (categoria CALCULO)

```json
{
  "origin": "SIMULACAO_FOLHA_ESPECIAL",
  "payrollType": "13º",
  "rubricCodes": ["DECIMO_CENARIO"],
  "inputNames": ["AVOS"],
  "legalReference": "Política sintética para conferência",
  "premises": "Avos informados e conferidos; sem tributação automática."
}
```

Uma rubrica FORMULA_CONTROLADA pode usar `SALARIO_BASE * AVOS / 12`. Parâmetros no formulário:

```json
{"AVOS":{"value":"6","sourceReference":"Documento/memória da apuração"}}
```

Em `/rh/operacoes`, aba cálculos, selecione uma folha de tipo especial, contratos, regra, dias explícitos e escopo. O conjunto e a política precisam corresponder à competência/tipo. A simulação persiste totais, rubricas, fontes e premissas; permite memória/PDF e replay. Ela **não está apta ao fechamento oficial**: não apura automaticamente IRRF/previdência por bases especiais, avos, RRA, rescisão, desligamento ou baixa de direitos. Esses fluxos continuam no plano de desenvolvimento.

## Temporalidade e reajuste coletivo

Cadastro inicial preserva admissão; alterações exigem data de vigência e versão esperada. Revisões futuras não reescrevem demonstrativos anteriores. Mudança no meio da competência é bloqueada no cálculo mensal até o rateio temporal estar implementado. Transições de regime em aquisitivos exigem política própria; programação de férias verifica vínculo e vigência da política durante a reserva.

Reajuste coletivo: informe chave estável, IDs dos contratos, vigência, percentual assinado e fundamento. Faça PREVIA, confira valores e copie o hash para APLICAR mantendo os mesmos parâmetros. Alteração concorrente invalida a prévia. Falha em qualquer contrato reverte o lote inteiro; repetir um lote aplicado preserva as revisões existentes.

## Margem consignável (categoria CONSIGNACAO)

Crie uma regra ativa com código **MARGEM_CONSIGNAVEL** no conjunto do regime:

```json
{
  "origin": "MARGEM_CONSIGNAVEL",
  "remunerationRubricCodes": ["SALARIO"],
  "compulsoryDeductionRubricCodes": ["PREVIDENCIA_RGPS", "IRRF"],
  "consignmentRubricCodes": ["CONSIGNADO"],
  "legalReference": "Norma municipal/convênio que define a base e o limite"
}
```

Informe também `maxConsignmentMarginRate` na **política de cálculo** do mesmo conjunto. Nenhum percentual, base ou código é escolhido pelo nome da verba. Os códigos do exemplo precisam ser substituídos pelos efetivamente calculados no conjunto: cada código deve existir nos itens de todos os vínculos apurados, ter tipo compatível e pertencer a apenas uma finalidade. Os descontos consignados podem ser lançados como movimentos nas rubricas de desconto autorizadas; o controle examina também verbas calculadas por fórmula.

Apuração por pessoa física, dentro da execução mensal:

1. Somar as rubricas de remuneração dos vínculos selecionados.
2. Subtrair os descontos obrigatórios configurados, limitando a base mínima a zero.
3. Aplicar o percentual máximo sobre a base agregada, arredondando HALF_UP para centavos uma única vez.
4. Subtrair os descontos consignados apurados. Excesso bloqueia tanto simulação quanto cálculo oficial antes de persistir a execução.

O motor exige a seleção de todos os vínculos da PF. Todos os demonstrativos dessa PF preservam a mesma memória agregada: o limite **não se multiplica pelo número de contratos**. Conferência disponível em `/rh/operacoes/demonstrativos/[id]`, no PDF e em `/portal-servidor/margem`. O Portal respeita titularidade, liberação, revogação e fechamento; a lista mostra um registro por execução, com filtro e páginas de 20.

A consulta é histórica, calculada na versão da folha. Alterar a política posteriormente não modifica a memória anterior. Versões antigas sem memória não recebem valores retroativamente. O cronograma interno de reservas e parcelas está disponível conforme abaixo; submargens por produto e integração com consignatárias continuam pendentes. A consulta não autoriza crédito.

## Contratos e cronogramas consignados

### Pedido de crédito no Portal

Em `/portal-servidor/credito`, o titular seleciona a última folha mensal oficial publicada por escopo, vínculo e consignatária habilitada em `CONSIGNACAO_CONTRATOS`. Informa primeira competência `MM/AAAA`, quantidade de parcelas, valor positivo com ponto decimal e descrição/autorização do pedido. O serviço exige política ativa, credor ativo, prazo permitido, publicação da referência e titularidade. Produção exige conjunto oficial aprovado. O Portal precisa ter demonstrativos habilitados.

O pedido fica em análise, sem reservar margem, e aparece em Minhas solicitações. O RH usa a decisão específica em `/rh/solicitacoes`: para deferir, informa número contratual e rubrica consignada MANUAL; as demais condições do pedido são preservadas. Para indeferir, basta o fundamento.

O deferimento revalida a referência mais recente e as reservas de todos os vínculos, por competência. Todo o cronograma, a decisão e a auditoria são uma transação única: se a margem tiver sido ocupada por outra operação, nada é gravado parcialmente e o pedido permanece em análise. Replay não gera outra consignação; dados de decisão divergentes são rejeitados. A reserva resultante aparece na consulta habitual de consignações, vinculada ao pedido por origem `PORTAL:CREDITO:<requestId>`.

O fluxo não representa autorização de liberação de dinheiro pela instituição bancária. Taxas bancárias, portabilidade, carência, submargens por produto e liberação manual por banco continuam exigindo fluxos/políticas próprios. A integração externa não é inferida da decisão do RH.

Regra ativa JSON na categoria CONSIGNACAO, no mesmo conjunto da referência mensal:

```json
{
  "origin": "CONSIGNACAO_CONTRATOS",
  "maxInstallments": 60,
  "referenceValidityMonths": 3,
  "supplierIds": ["ID_FORNECEDOR_CREDOR_CONSIGNATARIA"],
  "legalReference": "Convênio e autorização aplicáveis"
}
```

Operação: `/rh/consignacoes`. Informe chave estável, vínculo de alocação, consignatária central, número do contrato, regra, cálculo oficial fechado mais recente do titular, rubrica, primeira competência, quantidade/valor de parcelas iguais e fundamento. A primeira competência deve ser posterior à referência e respeitar o prazo da política. O conjunto deve cobrir todo o cronograma e corresponder ao vínculo e ao escopo. Produção exige conjunto oficial aprovado.

O serviço reserva cada competência na mesma transação do contrato/cronograma. As reservas de todos os vínculos do titular compartilham o limite. A ocupação é o total reservado na competência mais o consignado não gerenciado da referência. Parcelas gerenciadas identificadas pelos movimentos da referência não são deduzidas novamente. A referência é uma base conservadora; o cálculo mensal real continua conferindo a margem com a remuneração efetivamente apurada e pode bloquear descontos diante de redução salarial.

Antes de calcular a competência, gere os movimentos das parcelas reservadas, selecionando a folha mensal correspondente. Cada parcela tem uma origem única. Reservas pendentes bloqueiam cálculo/fechamento. Parcelas não lançadas podem ser canceladas com motivo, liberando a reserva por entrada compensatória; reserva e autorização anteriores permanecem imutáveis. Parcelas lançadas/competências fechadas exigem conciliação própria.

O número do contrato é único por credor/vínculo/escopo, mesmo se outra chave de origem for informada. Repetir a chave com os mesmos dados retorna o cronograma existente; modificar os dados é rejeitado. Mudanças/renegociações não reescrevem o contrato e requerem fluxo próprio, ainda pendente.

O titular consulta `/portal-servidor/consignacoes` após liberação da folha de referência. Consulta mostra reservas, parcelas lançadas e canceladas. O lançamento na folha não comprova repasse ao credor. Submargens por produto, parcelas variáveis, portabilidade, quitação financeira e transmissão a consignatárias continuam pendentes.

Implantação dirigida:

```powershell
npx tsx scripts/deploy-hr-migrations.ts --consignments
npx tsx scripts/deploy-hr-migrations.ts --consignments --apply
```

Esse comando aplica apenas a migration de consignações; requer a foundation e a migration temporal previamente implantadas.

## Dependentes, elegibilidade e salário-família

Em `/rh/dependentes`, selecione a pessoa física central. CPF/nascimento/nome não são escritos como fonte independente no RH. As flags indicam candidatura, não direito confirmado. Documentos pertencem à pessoa central; o GED/cadastro existente mantém tipo, status e validade.

Regra `DEPENDENTES_IRRF` (categoria CALCULO), JSON:

```json
{
  "relationships": [{"relationship":"Filho(a)","maxAgeYears":21}],
  "requiredDocumentTypes": ["COMPROVANTE_DEPENDENCIA"],
  "acceptedDocumentStatuses": ["Válido"],
  "allowDocumentsWithoutExpiry": false,
  "legalReference": "Norma aplicável ao público e à competência"
}
```

Parentesco/tipo/status são códigos exatos, não inferidos do nome. `maxAgeYears:null` remove o limite etário apenas para o parentesco explicitamente configurado. A idade é apurada no fim da competência; documentos precisam continuar válidos até esse instante. Quaisquer dispensas documentais devem ser explícitas na política. Exceções por deficiência/estudo/situações judiciais que exijam outros critérios ainda requerem políticas próprias.

Regra `SALARIO_FAMILIA` (categoria CALCULO), JSON:

```json
{
  "origin": "SALARIO_FAMILIA",
  "rubricCode": "SAL_FAMILIA",
  "incomeLimit": "VALOR_DECIMAL_OFICIAL",
  "quota": "VALOR_DECIMAL_OFICIAL",
  "proration": "POR_DIAS",
  "allocationBasis": "DIAS",
  "eligibility": {
    "relationships": [{"relationship":"Filho(a)","maxAgeYears":14}],
    "requiredDocumentTypes": ["COMPROVANTE_ESCOLAR"],
    "acceptedDocumentStatuses": ["Válido"],
    "allowDocumentsWithoutExpiry": false,
    "legalReference": "Norma aplicável"
  }
}
```

Substitua os placeholders por números decimais com ponto. Rubrica MANUAL/PROVENTO, sem incidências. Renda bruta e dependentes são agregados entre todos os contratos da PF. A quota total não se multiplica pelo número de vínculos. `INTEGRAL` ou `POR_DIAS` define proporcionalidade (mesmos dias de referência do motor mensal); `DIAS` ou `REMUNERACAO` define pesos do rateio entre contratos. Origem manual concorrente é bloqueada, não somada novamente.

Memória: renda/limite, candidaturas, idades, documentos, motivos de inelegibilidade, quota/fator e rateio em cada demonstrativo. Fechamento reavalia a elegibilidade preservada e exige novo cálculo se documentos/candidaturas mudaram. Conjuntos legados sem `DEPENDENTES_IRRF` continuam usando as flags anteriores; essa ausência não equivale à homologação das deduções.

## Alteração coletiva de contratos

Em `/rh/operacoes`, aba contratos, informe lote, seleção, vigência, fundamento e os campos a alterar. Exemplo:

```json
{"workLocation":"Unidade de destino","costCenterId":"ID_CENTRO","salaryLevel":"NIVEL-A","monthlyHours":180}
```

Campos aceitos: `regimeId`, `roleId`, `departmentId`, `costCenterId`, `workLocation`, `salaryLevel`, `salary` (string decimal), `monthlyHours` (inteiro), `endsAt` (AAAA-MM-DD; string vazia para remoção). `departmentId`, `costCenterId` e `salaryLevel` podem receber `null` para limpeza. Campo omitido é preservado. Identidade, matrícula e admissão não fazem parte deste lote.

PREVIA mostra antes/depois sem gravação; APLICAR exige o hash correspondente. Usa a mesma validação temporal/referencial de alteração individual. Falha em um vínculo reverte todos. `CONTRATO_LIMITE_DIAS_<codigoDoRegime>` aceita inteiro positivo e bloqueia duração acima do limite, inclusive em alteração coletiva.

## Banco de horas reconhecido no ponto

Regra JSON (categoria CALCULO):

```json
{
  "origin":"BANCO_HORAS_PONTO",
  "maxBalanceHours":"40",
  "maxCreditPerDayHours":"4",
  "maxDebitPerDayHours":"8",
  "allowedStatuses":["Presente"],
  "forbidPaidOvertimeForCredit":true,
  "legalReference":"Acordo/política aprovada"
}
```

No ponto, informe banco reconhecido positivo (crédito) ou negativo (compensação), com até quatro casas. O serviço não infere reconhecimento dos horários. Em Operações > Direitos, escolha contrato de alocação, regra e competência para gerar o ledger. Limites diários consideram todas as origens do dia, não apenas cada linha. Saldo é validado cronologicamente, incluindo efeitos em débitos já registrados: crédito futuro não cobre déficit anterior.

Origem única do ponto impede duplicação/alocação em outro vínculo. Replay preserva a entrada; falha reverte lote e auditoria. Ponto integrado não aceita edição/exclusão pelas actions RH. Produção exige conjunto oficial aprovado. Saldo e extrato são separados por escopo; entradas legadas sem escopo precisam de saneamento explícito. O titular consulta `/portal-servidor/banco-horas`.

Em Operações > Direitos, o estorno recebe ID da entrada original e fundamento. Gera quantidade oposta na mesma data civil e preserva ponto/entrada/auditoria. A retirada de crédito é bloqueada se algum débito posterior ficar sem cobertura; primeiro concilie os débitos. Repetição com mesmo fundamento retorna o estorno existente; fundamento diferente e estorno de estorno são rejeitados. Estorno não libera a origem do ponto para novo lançamento.

Expiração, transferência entre vínculos e conversão em pagamento continuam pendentes. Não usar o extrato como prova de pagamento.

## Campos configuráveis de contratos funcionais

Em RH > Parametrizações, cadastre uma regra ativa `CAMPOS_CONTRATO`, categoria GERAL e tipo JSON, no conjunto associado ao regime funcional. A definição passa pelo controle de alteração/aprovação já existente de Parametrizações. Exemplo sintético:

```json
{
  "origin": "CAMPOS_CONTRATO",
  "legalReference": "Ato municipal que define os dados adicionais",
  "fields": [
    {"code":"ATO_NOMEACAO","label":"Ato de nomeação","type":"TEXTO","required":true,"maxLength":160},
    {"code":"ORDEM","label":"Ordem","type":"INTEIRO","required":false,"minimum":"0","maximum":"999"},
    {"code":"INDICE","label":"Índice cadastral","type":"DECIMAL","required":false,"minimum":"0.0000","maximum":"100.0000"},
    {"code":"DATA_REFERENCIA","label":"Data de referência","type":"DATA","required":false},
    {"code":"DEDICACAO","label":"Dedicação exclusiva declarada","type":"BOOLEANO","required":true},
    {"code":"CLASSE","label":"Classe cadastral","type":"OPCAO","required":true,"options":[{"value":"A","label":"Classe A"},{"value":"B","label":"Classe B"}]}
  ]
}
```

Até 50 campos por política. Código estável com letra inicial maiúscula e letras/números/sublinhado; até 64 caracteres. Códigos/opções duplicados e limites invertidos são rejeitados.

- TEXTO exige `maxLength`, entre 1 e 4000. Valores são aparados nas extremidades.
- INTEIRO aceita strings com até 15 dígitos, sinal opcional e sem fração. `minimum`/`maximum` são strings inteiras opcionais.
- DECIMAL aceita strings com até 15 dígitos inteiros e até quatro casas, usando ponto decimal. Limites também são strings decimais; a comparação é exata.
- DATA exige data civil válida AAAA-MM-DD.
- BOOLEANO usa escolha explícita Sim/Não. `false` é um valor válido, inclusive em campo obrigatório.
- OPCAO aceita somente um dos valores explícitos em `options`, até 100 opções.

Em Operações > Contratos, os campos aparecem ao selecionar o regime. O hash da definição apresentada é conferido no servidor. Se a regra mudar, recarregue a ficha e confira os campos antes de salvar.

O serviço grava valores normalizados em `details.customFields` e memória de definição em `details.customFieldsPolicy` (`ruleId`, `hash`, `definition`). A memória da definição vem do servidor e substitui qualquer metadata enviada no JSON de informações adicionais. As revisões preservam valores e definição para consulta histórica. Reajustes e alterações coletivas mantêm os valores e reaplicam a validação do regime de destino.

Ao introduzir campo obrigatório, preencha-o na próxima revisão de cada contrato. Não retire definições usadas por contratos existentes nem desative sua política antes do saneamento: alterações que perderiam campos históricos são bloqueadas. As definições e os valores anteriores permanecem nos snapshots das revisões.

O filtro de contratos aceita código e valor exato. Número/data/opção são armazenados como strings; booleano usa `true` ou `false` e o tipo BOOLEANO do filtro. A exportação integral respeita o filtro e inclui coluna de valores configuráveis em JSON. A consulta usa a última revisão cadastrada, que pode ter vigência futura.

Esses campos são extensões cadastrais do contrato; sua definição não cria rubricas, incidências, cargos, designações ou regras fiscais automaticamente. Extensões próprias de funções/designações continuam no planejamento de F1.

## Transferência de banco de horas entre vínculos

Regra JSON `BANCO_HORAS_TRANSFERENCIA`, exemplo **sintético**:

```json
{
  "origin": "BANCO_HORAS_TRANSFERENCIA",
  "conversion": "HORA_POR_HORA",
  "maxTransferHours": "8.0000",
  "allowedRegimePairs": [
    {"sourceRegimeId":"ID_REGIME_ORIGEM","targetRegimeId":"ID_REGIME_DESTINO"}
  ],
  "legalReference": "Ato ou norma que autoriza a transferência de horas"
}
```

Operações > Direitos > Transferir horas: informe chave estável, contrato origem/destino, política de transferência, política `BANCO_HORAS_PONTO` de cada vínculo, data civil e horas positivas com até quatro casas decimais, mais fundamento/ato. Os vínculos devem ser distintos e pertencer à mesma identidade funcional do Cadastro Único, ativos na data segundo suas revisões. Políticas dos bancos correspondem ao regime de cada vínculo e ao escopo da transferência. Produção exige parâmetros oficiais aprovados.

O par é direcional: para autorizar o caminho contrário, cadastre também o par inverso. `HORA_POR_HORA` conserva horas, não valor monetário. Não há transferência entre titulares ou entre escopos, nem conversão automática de salário/jornada. Débito e crédito, memória de políticas/versões e auditoria são uma transação única. Limites de saldo vêm das políticas dos bancos; `maxTransferHours` é o limite por operação e não altera os limites diários do reconhecimento do ponto.

O saldo é validado em toda a linha temporal. Não se pode consumir crédito futuro nem retirar saldo necessário a débitos já programados. O destino não pode exceder seu limite de saldo em datas posteriores. Não há reset de ponto nem duplicação da origem de frequência. Transferências ainda não representam lotes de crédito com prazo de expiração preservado; expiração será uma política própria.

Estorno exige a origem completa `BANCO_HORAS:TRANSFERENCIA:<chave>` e fundamento. As duas entradas inversas têm a data original. Se o destino já consumiu as horas, a operação pode ser bloqueada e deve ser conciliada antes; o estorno não toma crédito futuro para financiar a devolução. Originais permanecem no extrato, e replay retorna as entradas anteriores. Nova transferência após estorno exige nova chave.

## Conversão de banco de horas em movimento de folha

Regra JSON `BANCO_HORAS_PAGAMENTO`, exemplo **sintético**:

```json
{
  "origin": "BANCO_HORAS_PAGAMENTO",
  "calculation": "SALARIO_JORNADA",
  "multiplier": "1.5000",
  "maxHoursPerCompetence": "20.0000",
  "rubricCode": "BANCO_PAGO",
  "legalReference": "Norma ou ato autorizador do pagamento das horas"
}
```

Antes, cadastre a rubrica `BANCO_PAGO` MANUAL de PROVENTO no conjunto, com incidências e mapeamento legado próprios para o fechamento. Não são inferidas normas ou incidências pelo nome da rubrica. Os parâmetros do exemplo não são regra municipal oficial.

Em Operações > Direitos > Converter banco: informe chave estável, vínculo, folha Mensal aberta, regra de pagamento, política do banco, quantidade positiva de horas (até quatro casas) e fundamento. O vínculo e as políticas precisam cobrir a competência integral. Produção exige conjunto aprovado/não demonstrativo. Alterações intramês continuam sujeitas ao bloqueio de rateio temporal do motor.

Valor bruto = salário da revisão vigente na competência / jornada mensal daquela revisão × horas × multiplicador. O serviço usa Decimal e arredonda somente o valor monetário final a duas casas com HALF_UP. Valor arredondado zero é rejeitado. `maxHoursPerCompetence` soma todas as conversões e seus estornos no contrato/escopo durante a competência; dividir o pedido em origens distintas não supera o limite.

A baixa de horas ocorre no fim da competência, com conferência de toda a cronologia do saldo. Baixa, movimento de provento e memória da origem são gravados juntos; qualquer falha reverte todos. A origem aparece no banco como PAGAMENTO; o movimento entra no cálculo mensal e em suas incidências configuradas. Isto gera provento, não confirma depósito bancário.

Estorno usa origem completa `BANCO_HORAS:PAGAMENTO:<chave>`, gera movimento compensatório negativo e devolve horas na data original. É permitido somente em folha Mensal aberta sem fechamento oficial da competência do titular, respeitando limite cronológico do banco. Competência fechada/paga exige conciliação própria. Depois da conversão ou estorno, recalcule a folha para atualizar os movimentos; cálculos anteriores preservam seus snapshots.

## Quadro temporal de cargos, vagas e níveis

Cadastre regra JSON `QUADRO_CARGOS` (categoria GERAL) no conjunto compartilhado pelos regimes do quadro. Os cargos são IDs de `Role` do cadastro central; não se cria cargo paralelo em RH. Exemplo sintético:

```json
{
  "origin": "QUADRO_CARGOS",
  "legalReference": "Lei municipal de criação do quadro",
  "periods": [{
    "startsAt": "2026-01-01",
    "endsAt": null,
    "roles": [{
      "roleId": "ID_CARGO_CENTRAL",
      "authorizedSeats": 10,
      "classification": "Efetivo",
      "cbo": "411005",
      "education": "Ensino médio",
      "legalReference": "Lei de criação e enquadramento do cargo",
      "duties": "Atribuições previstas na norma",
      "competencies": "Competências previstas na norma",
      "documentIds": [],
      "levels": [
        {"code":"A1","vertical":0,"horizontal":0,"salary":"1500.00","monthlyHours":200},
        {"code":"A2","vertical":0,"horizontal":1,"salary":"1600.00","monthlyHours":200}
      ],
      "initialLevel":"A1",
      "finalLevel":"A2"
    }]
  }]
}
```

Cada período tem início e término civil inclusivo, sem sobreposição. Para contratos indeterminados, o quadro precisa de cobertura futura sem término, e o conjunto não pode expirar antes do período contratual. Lacunas de cobertura são bloqueadas. Quando há quadro ativo, o cargo deve estar previsto e o contrato deve informar nível com salário/jornada exatamente iguais à escala vigente.

`authorizedSeats` admite zero. Cargos, níveis e coordenadas não podem se repetir na mesma vigência. Níveis inicial/final precisam existir na escala. `documentIds` referencia documentos já existentes no GED; as referências legais e os valores do exemplo devem ser substituídos pelos oficiais.

A ocupação é contada por contrato ativo, não apenas por pessoa: dois vínculos ocupam duas vagas. Todos os regimes do mesmo conjunto são agregados. Conjuntos distintos têm quadros separados; não use conjuntos separados para representar o mesmo limite legal sem configuração específica de agregação.

Revisões definem os intervalos reais de ocupação, incluindo mudanças futuras de cargo/regime e término contratual. O término libera a vaga no dia seguinte. Dois ocupantes que se sucedem na fronteira do período não duplicam a vaga. Inativar apenas a identidade funcional não apaga intervalos históricos do contrato.

Em `/rh/quadro-cargos`, confira ocupação máxima e disponibilidade mínima de toda a vigência. Estas métricas incluem contratos futuros; não representam apenas a ocupação de hoje. Incompatibilidade cadastral interrompe a conferência com o motivo, em vez de presumir vagas disponíveis.

Para nova tabela salarial, prepare a vigência no quadro e aplique as revisões coletivas correspondentes. O lote valida todos os contratos após preparar as revisões na mesma transação, mantendo rollback integral. Reajuste que difere da escala é rejeitado. Progressões automáticas, critérios de avaliação/tempo e anexos específicos de designações permanecem pendentes.

## Ocorrências funcionais e pasta agregada

Em `/rh/ocorrencias`, registre chave estável, contrato, tipo, data civil, ato de pessoal, fundamento, observação e IDs de documentos GED. Tipos: ADVERTENCIA, ELOGIO, MULTA, OUTRA. MULTA exige valor positivo decimal; os demais tipos não recebem valor.

O ato precisa pertencer ao titular e ter data não posterior à ocorrência. O contrato deve estar ativo na data, conforme sua revisão temporal. Anexos são referências a documentos do GED, com titularidade conferida; documentos clínicos de Saúde/SST são rejeitados. A action exige permissão de consulta ao GED quando há anexos. A memória conserva o ato, a versão contratual e metadata dos documentos na data do registro.

Replay de mesma origem/dados retorna o registro existente, mesmo com outro operador. Correção é feita por cancelamento fundamentado e novo registro, preservando o original. O cancelamento tem origem única, rejeita fundamento divergente e não admite cancelamento de cancelamento. Atos com ocorrências integradas ficam protegidos contra edição/exclusão pelas actions de RH, inclusive após cancelamento da ocorrência.

Ocorrência de multa não gera desconto automaticamente. Reflexo financeiro exige apuração própria, rubrica/origem de movimento e validação na folha. Referência GED não substitui preservação/versionamento do arquivo pela rotina de documentos.

Na ficha histórica do contrato, o link Pasta funcional abre `/rh/pasta-funcional/<employeeId>`. A pasta agrega contratos, atos, documentos cadastrais da pessoa central, ocorrências e entradas assinadas de direitos, com filtros e paginação de 20 em cada seção. Consulta de documentos respeita acesso ao GED e não expõe documentos clínicos/atestados ou URLs brutas de arquivos. Contratos e ocorrências mantêm links para suas rotinas de origem.

Upload/vinculação específica de anexos ao contrato, progressões e demais jornadas de designação/estágio/cessão continuam no planejamento de F1.
