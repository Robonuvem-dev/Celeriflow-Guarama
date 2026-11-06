# Revisão dos dados de apresentação — 06/11/2026

## Estado aplicado

Os pacotes desta pasta foram **persistidos no banco configurado no projeto**. As correções de código da aplicação continuam locais. Arquivos JSON de prévia e aplicação preservam IDs e operações individualmente. Não houve migração/schema nesta etapa.

### Cadastro e rótulos

- Comissão e lote de Licitações com nomes úteis; situações numéricas/“Teste” de Ouvidoria conciliadas individualmente; secretaria e sigla corrigidas.
- Quatro títulos de documentos: os arquivos e seus metadados de armazenamento continuam preservados.
- Dezesseis códigos de famílias substituídos por códigos de cadastro; IDs e vínculos das famílias preservados.
- Inscrição municipal de Thiago: `TM-2026-001`. Login, credencial e identidade funcional preservados.
- Sessenta e dois contatos fictícios substituídos por endereços nominais no domínio reservado `example.com`. Registros usados por uma identidade de autenticação foram excluídos da seleção.
- **1.014 nomes de referências RH**: 792 rateios, 18 graduações, seis tempos de contribuição, oito itinerários, quatro faixas e 186 escalas. Somente os seis formatos revisados dos três pacotes conhecidos foram normalizados. A igualdade integral de `code` e `details` foi conferida em cada gravação.

As alterações de campos guardam antes/depois em `MunicipalPresentationRevision`. O trigger já existente de RH registra as revisões das referências com o ator da operação. A aplicação foi auditada também em `FinancialAuditLog`.

### Exemplos acrescentados

| Área | Exemplos |
| --- | --- |
| Compras | Três contratos em **Minuta** e dois convênios em **Em análise**, associados às referências existentes |
| Câmara | Duas atas em rascunho, duas audiências agendadas e duas minutas de lei sem publicação/vigência |
| Cemitérios | Capela, ossuário, campo adicional, quatro lotes e quatro sepulturas; proprietário conciliado nas duas gavetas |
| Tributação | Três atividades de serviço com ISS: `01.01`, `01.07` e `17.01` |
| Frota | Três rotas, três planos/ordens, três consumos, três seguros e três ocorrências; uma ordem concluída pelo serviço existente, com manutenção e despesa vinculadas |
| RH | Duas cessões funcionais futuras e um tipo de afastamento educacional |
| Portal do Servidor | Dois locais de atendimento, três serviços funcionais e dois arquivos de biblioteca com SHA-256 |
| Cadastros | Duas minutas de textos jurídicos, versionadas, em **RASCUNHO**, sem publicação/vigência |
| Segurança | Duas ordens de serviço e um equipamento de apoio operacional, em estado aberto |
| Capacitação | Curso de atendimento digital direcionado a Thiago e inscrição pelo serviço existente; sem certificado ou conclusão |
| Orçamento | Duas solicitações de despesa em **Solicitada**, de R$ 480,00 e R$ 320,00, vinculadas à dotação de material de consumo da Administração |
| SST | Duas disponibilidades de orientação ocupacional e uma consulta de Thiago em **BOOKED**, em 30/11/2026 às 9h de Brasília |
| Prevenção SST | Programação SIPAT de 23 a 27/11, com duas atividades, e visita preventiva em 19/11 às 10h; responsabilidade vinculada à pessoa de Thiago |
| Referências fiscais | Dez registros auxiliares, dois em cada catálogo: atividades, procedimentos fiscais, eventos contábeis, códigos DES-IF e códigos municipais; origem Prefeitura/UG de Administração |
| Planejamento | Minutas de LDO e LOA de 2026 encadeadas ao PPA existente, ambas em **DRAFT**; audiência programada e uma contribuição comunitária **PENDING** |
| Controle Interno / RH | Centro de custo de Thiago completado por nova revisão contratual em 06/11; estatística por unidade passa a demonstrar o vínculo |

### Proveniência e identificadores técnicos

- O ato histórico de Licitações é imutável e foi conservado.
- Códigos de rubricas, regras, matrículas, fontes e parâmetros de RH continuam estáveis para cálculos e conciliação. A apresentação usa o adaptador existente, aplicado também às telas onde a leitura autenticada revelou exposição de marcadores.
- O código técnico da cidade fictícia não foi substituído por um código IBGE oficial inventado. A listagem local informa **“Sem código IBGE oficial (município fictício)”**, preservando o cadastro no editor.
- Mensagens de ambientes e leiautes não homologados continuam expressando sua condição técnica; não foram convertidas em integração oficial.

## Validações concluídas

1. Prévia transacional das inclusões e alterações, com rollback antes de aplicar.
2. Reexecução do pacote de apresentação após as três primeiras etapas: **zero alterações**. Reexecução da normalização de RH: **zero alterações**.
3. Censo após o pacote principal e o normalizador RH: **1.117 tabelas físicas**, **784 vazias**, **zero achados de marcadores em rótulos primários** e **zero erros de consulta**. Evidência: `final-audit/audit.json`; as cargas posteriores têm censos próprios abaixo.
4. Navegação autenticada de produção após os reparos: **25 destinos**, sem marcadores visíveis, erros JavaScript/aplicação ou bloqueios de tabela. Evidências: `repaired-production/report.json` (22) e `final-catalogs-production/report.json` (3).
5. Biblioteca: dois downloads autenticados HTTP 200; hashes dos bytes recebidos idênticos aos hashes cadastrados. Evidência: `library-production/report.json`.
6. Tipagem dos scripts de dados e ESLint aprovados, incluindo a última ampliação. Prévia final do pacote principal: **zero alterações**.
7. Validação de Câmara pelo quarto bundle local: sessão fictícia **8205** adicionada pela UI em **Agendada**, em 29/11/2026 às 14h de Brasília; gravação do texto inalterado de ata em rascunho e rejeição de uma segunda gravação com versão antiga. Os seis cenários passaram; evidência em `../chamber-sessions-fourth-build-retest/report.json`.
8. Reexecução da biblioteca: **zero inclusões planejadas**. O pacote `CHECKUP_FINANCE_SST_2026_V1` passou pela prévia com rollback, tipagem e ESLint, foi aplicado pelos serviços de domínio e retornou **zero alterações** na repetição. Os serviços existentes registraram as auditorias. Nenhuma aprovação de despesa, reserva, empenho, liquidação ou pagamento foi criada por esse pacote; a consulta SST não contém resultado clínico.
9. Confirmação autenticada do pacote Financeiro/SST no **quinto bundle de produção local**: **3/3 cenários aprovados**. As duas despesas aparecem em `Solicitada`, com R$ 480,00 e R$ 320,00; o agendamento de Thiago aparece em SST e no Portal às 9h de Brasília de 30/11/2026, com o próximo horário disponível às 9h30. Sem erro JavaScript, hidratação ou envio de Server Actions de negócio. Capturas revisadas em `../finance-sst-samples-fifth-build/`.
10. Pacote `CHECKUP_PREVENCAO_2026_V1`: prévia com rollback aprovada, tipagem/ESLint aprovados, aplicação pelo serviço auditado `createPrevention` e repetição com **zero alterações**. Foram incluídas duas programações futuras, não clínicas: SIPAT com duas atividades de custo R$ 0,00 e visita técnica ainda não realizada. Listagem e dois detalhes passaram em **3/3 cenários autenticados** no quinto bundle, com nomes canônicos, horários de Brasília e conteúdo integral conferidos em `../prevention-samples-fifth-build/report.json`.
11. A captura da SIPAT mostrou duas partes de conteúdo. A navegação pela ação **Próxima parte** foi exercitada e confirmou a segunda atividade dentro da área visível, com data, responsável e custo preservados. Evidência complementar: `../prevention-sipat-pagination-fifth-build/report.json`.
12. Pacote `CHECKUP_REFERENCIAS_FISCAIS_2026_V1`: dez referências criadas pelo serviço versionado `saveTaxReference`, com auditoria, após prévia com rollback, tipagem e ESLint aprovados. A reexecução retornou **zero alterações**. Os cinco catálogos passaram em **5/5 cenários autenticados** no quinto bundle, com conferência de código, origem, conteúdo e busca/restauração do filtro. A primeira tentativa falhou no seletor do verificador, sem erro da aplicação; a seleção do catálogo foi corrigida e os resultados foram preservados separadamente em `../tax-reference-samples-fifth-build-retest/report.json`. São referências auxiliares do ambiente fictício, não códigos normativos certificados nem regras automáticas de cálculo.
13. Censo posterior a Financeiro/SST, Prevenção e referências fiscais: **1.117 tabelas físicas, 777 vazias, zero achados em rótulos primários e zero erros**, em `after-finance-prevention-tax/audit.json`. As diferenças físicas incluem tabelas de auditoria populadas pela navegação; não são todas cadastros de apresentação. Este censo antecede o pacote de minutas de Planejamento.
14. Pacote `CHECKUP_PLANEJAMENTO_MINUTAS_2026_V1`: minutas **DRAFT** de LDO/LOA, audiência programada para 26/11 e contribuição comunitária em **PENDING**, pelos serviços auditados de domínio. O PPA e exercício existentes foram conferidos antes da criação; a cadeia PPA → LDO → LOA é preservada. Prévia com rollback, tipagem e ESLint passaram; a repetição retornou **zero alterações**. As listas, detalhes e alternância entre consulta/contexto passaram em **5/5 cenários** em `../planning-draft-samples-fifth-build-retest/report.json`. As duas minutas ainda não têm previsões/metas; esse estado foi conferido explicitamente. A primeira tentativa do verificador confundia as Server Actions de consulta dos seletores com mutações e procurava títulos no painel inativo; os resultados anteriores foram preservados. O reteste permite apenas `searchPlanningOptions`, identificado pelo manifesto do mesmo build, e bloqueia as outras Server Actions.
15. Censo posterior às minutas: **1.117 tabelas físicas, 773 vazias, zero marcadores em rótulos primários e zero erros**, em `after-planning-drafts/audit.json`. Foram populadas também as referências canônicas `BudgetGuideline` e `AnnualBudgetLaw`, em rascunho, além das tabelas de audiência/contribuição. A condição de rascunho não implica vigência legal.
16. A leitura de Controle Interno mostrou o cargo de Thiago sem vínculos na apuração. O contrato estava sem `costCenterId`; o centro Paço Municipal já pertencia ao mesmo ente/secretaria. `CHECKUP_THIAGO_CUSTOS_2026_V1` completou o vínculo pelo serviço contratual, com revisão **2** a partir de **06/11**, depois da competência fechada de outubro. A prévia com rollback, tipagem e ESLint passaram; conferência transacional confirmou uma pessoa/um vínculo em 31/12 e igualdade do histórico de outubro e do conteúdo integral do demonstrativo fechado. Não houve alteração de remuneração, jornada, cargo, matrícula ou detalhes. Evidências individuais em `thiago-cost-center-applied-*.json`.

### Construção Civil: resultado da revisão de prontidão

A consulta somente leitura de 06/11 constatou catálogos urbanísticos e imóveis existentes, porém **nenhuma configuração urbanística publicada, nenhum formulário de abertura publicado e nenhum tipo/assunto urbanístico ativo para abertura interna**. A tela de nova solicitação depende explicitamente dessas referências. A ausência de solicitações não é falha de busca nem perda dos imóveis cadastrados; a preparação de exemplos de processos depende de configurar esse roteiro. O antigo `seed-construction-demo.ts` contém nomes com “DEMONSTRAÇÃO” e parâmetros próprios; ele não foi executado nesta revisão. Nenhuma regra urbanística ou tributária foi publicada por este checkup.

## Cobertura e vazios

O levantamento autenticado percorreu 540 destinos de menus/listagens. As mensagens de vazio incluem filtros sem resultado, inexistência de pendências, falta de vínculos e fluxos ainda sem operações. Elas não significam automaticamente tabela defeituosa. O estado físico inicial tinha 809 tabelas vazias; após as cargas, 784. O censo físico não substitui a inspeção das telas.

As cargas acima resolvem os exemplos inspecionados e acrescentam exemplos de solicitação orçamentária, agendamento/prevenção SST, catálogos fiscais e minutas de Planejamento. Permanecem telas sem amostras em outros fluxos, especialmente execução financeira, documentos clínicos SST, processos urbanísticos e parte das operações de Saúde/Tributação. Esse trabalho não homologa todos os CRUDs, integrações ou estados. Os destinos e mensagens da coleta inicial estão em `browser-production/report.json`; ela antecede parte dos reparos e não representa o estado atual de todas as telas.

A releitura de dados visíveis nos menus do quinto bundle concluiu **459 destinos**, sem erros ou bloqueios. Houve três ocorrências técnicas, revistas individualmente em código/capturas: ID explícito de cargo, tipo de evento de auditoria e aviso de integração não homologada. Nenhuma delas é nome primário inadequado. A reconciliação substitui as três observações antigas de Planejamento pelo reteste posterior à carga, preservando ambas as fontes. Resultado: **116 telas com ao menos uma tabela visível sem linhas** e **145 com mensagem de vazio**, no filtro/identidade padrão. São medidas diferentes e incluem ausência legítima de pendências; continuam exigindo revisão por fluxo. Evidência integral em `current-visible-review/REPORT.md` e `report.json`.

A navegação ampliada de variantes e detalhes locais concluiu **1.169 destinos**, usando como ponto de partida a cobertura de menus já concluída na mesma origem/bundle. Resultado: **1.159 abertos**, quatro exigências de identidade de paciente, duas restrições legítimas do Portal de Construção Civil, **três 404 e um erro de manutenção do PPA**. Esses quatro problemas adicionais foram localizados em parâmetros de IDs codificados, corrigidos em fonte e seguem para o sexto build/reteste. A rodada original é preservada em `../all-screens-fifth-build/report.json`.

O vínculo de custos de Thiago passou também em **2/2 cenários autenticados**, incluindo a consulta histórica, em `../thiago-workforce-cost-samples-fifth-build/report.json`; reexecução da carga retornou zero alterações.

## Scripts

```powershell
# Prévia rollback / aplicação do pacote principal:
node --conditions=react-server --import tsx scripts/repair-checkup-demonstration-data.ts
node --conditions=react-server --import tsx scripts/repair-checkup-demonstration-data.ts --apply

# Normalização de rótulos RH, com preservação de códigos/details:
node --conditions=react-server --import tsx scripts/normalize-checkup-rh-labels.ts

# Censo somente leitura em diretório novo:
$env:CHECKUP_AUDIT_OUTPUT='docs/checkup/demonstration-data/after-all-repairs'
npx tsx scripts/checkup-demonstration-data.ts
```
