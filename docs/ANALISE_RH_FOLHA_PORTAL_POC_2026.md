# RH, Folha e Portal do Servidor — análise de integração e POC

## 1. Diagnóstico observado em 02/11/2026

**Este é o retrato inicial, anterior às cargas.** O plano posterior está em [PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md](PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md), com a política atualizada de estimativas para todos os cadastros. Ver a seção 8 para os dados efetivamente aplicados depois deste diagnóstico.

Consulta somente leitura registrada em `RH_PORTAL_DIAGNOSTICO_2026.json`:

- 198 servidores ativos; todos com pessoa central, cargo e departamento.
- 18 salários-base cadastrais zerados.
- Nenhum `HrEmploymentContract`, período funcional canônico, cálculo ou demonstrativo de folha.
- Uma folha de outubro/2026 sem execução calculada.
- Nenhum ponto em 2026, nenhum cadastro auxiliar `HrReferenceRecord` e nenhum evento de integração RH.
- Um usuário de acesso, sem `employeeId`. Cadastro de servidor não equivale a conta autenticada do Portal.

Portanto, o cadastro básico estava populado, mas **a cadeia cadastro → contrato → ponto/movimento → cálculo → fechamento → publicação → Portal não estava populada**.

## 2. Modelo e integrações existentes

Não é necessário criar tabelas paralelas para servidor, folha ou ponto. As tabelas físicas e seus relacionamentos já existem:

| Camada | Fonte canônica / vínculo | Consumidores |
| --- | --- | --- |
| Pessoa | `Person` → `Employee.personId` (único) | Cadastro Único, RH, recadastramento, dependentes, GED, SST |
| Organização | `Employee.roleId`, `departmentId`, `secretariatId`, `unitId` | Administração e seletores de servidores dos módulos |
| Contrato | `HrEmploymentContract.employeeId`, `HrEmploymentRevision.contractId` | Motor de folha, ficha funcional, direitos e histórico |
| Ponto | `AttendanceRecord.employeeId` | RH e Portal consultam a mesma tabela |
| Ponto → folha | `generateAttendanceOvertime` → `HrMovement` com origem de ponto | Motor de cálculo; não há cópia manual de valores de horas extras |
| Folha | `Payroll` → `HrPayrollRun` → `HrPayrollStatement.contractId` | RH, demonstrativo pessoal, relatórios e margem |
| Projeção conciliada | `PayrollItem` + `HrPayrollItemOrigin` | Listagem de lançamentos no Portal; somente origens de demonstrativos publicados |
| Publicação | `releaseAt`, `revokedAt`, modo/status e política/hash de publicação | `ownReleasedStatementIds`, download pessoal e revogação |
| Acesso | `Usuario.employeeId` | Sessão autenticada determina o titular; receber um CPF ou ID na URL não concede acesso |
| Financeiro / eSocial | `HrIntegrationEvent` | Fechamento prepara eventos; evento pendente não comprova empenho, remessa, pagamento ou transmissão |
| Contexto SST/orçamentário | `HrEmployeeFunctionalPeriod`, `SstBenefitPayrollScope` | Origens funcionais e regras de acesso à folha; exige unidade/regime/local reais, sem inferência automática |

Patrimônio, Compras, Processos, Obras, Frotas, Saúde, Educação, SST, Assistência Social e demais áreas referenciam `Employee`/`Person` por chaves existentes. A inspeção complementar enumera os relacionamentos e a quantidade de vínculos usados por tabela. Um professor não precisa ser automaticamente cadastrado como motorista, profissional de saúde ou responsável por patrimônio: a integração usa a identidade comum, preservando a atribuição setorial.

### Limites encontrados

1. O administrador sem vínculo tem uma prévia do Portal baseada no primeiro servidor ativo em `getEmployeePortalAccess`; isso não comprova acesso individual dos 198 titulares. Relatórios pessoais usam explicitamente `context.user.employeeId`, diferentemente dessa prévia.
2. Não há contas individuais provisionadas na base observada. A criação de contrato prepara solicitações `ACESSO_PORTAL`; a ativação deve usar o titular correspondente e seu acesso autenticado.
3. `Employee.salaryBase` e salário contratual são camadas distintas. O cálculo usa a revisão do contrato. Alterar salário cadastral isoladamente não atualiza uma revisão histórica nem recalcula folha fechada.
4. Períodos funcionais SST/orçamentários não devem ser fabricados escolhendo uma unidade gestora aleatória. Os contratos demonstrativos não substituem a implantação desses períodos.
5. Na ficha funcional anterior havia contratos, atos, documentos, ocorrências e direitos; ponto e contracheques não eram consultáveis na própria ficha. A alteração desta tarefa incorpora essas duas seções e usa a tabela operacional compartilhada, paginada em 20 registros.

## 3. Complementação de dados autorizada

Executor: `scripts/complete-rh-portal-2026.ts`. Padrão: agosto, setembro e outubro de 2026, para os servidores ativos existentes. O modo sem `--apply` apresenta a prévia.

- Preserva pessoas, servidores, salários-base cadastrais e vínculos dos outros módulos.
- Cria contratos demonstrativos versionados com lotação/cargo e salário existentes. Para os 18 salários zerados, usa R$ 1.621,00 apenas no contrato demonstrativo, registrando a estimativa.
- Admissão em 01/01/2026 e regime RGPS do pacote são premissas demonstrativas explícitas, não fatos funcionais reconhecidos.
- Gera ponto sintético em dias úteis, excluindo 07/09 e 12/10 no recorte padrão. Horários são 08h locais, com intervalo não remunerado de uma hora e jornada diária estimada. Não substitui relógio de ponto ou calendário municipal homologado.
- Em uma amostra determinística, uma hora extra por competência é apurada pelo serviço de integração existente e incorporada ao cálculo.
- Apura ATS pelo serviço existente. Com admissão estimada em 2026, não inventa tempo anterior nem quinquênios adquiridos.
- Usa o motor existente para contribuição previdenciária progressiva e IRRF, com memória, bases e arredondamento. O pacote mantém as estimativas e referências documentais de `poc-bootstrap.ts`.
- Fecha o cálculo, concilia os lançamentos e publica os demonstrativos no escopo **DEMONSTRACAO**. Não produz quitação bancária.
- Usa chaves estáveis e preserva alterações do operador; não duplica ponto já existente no mesmo dia/titular. Não cria contas de usuário nem escolhe um servidor para vincular ao administrador.

Execução e resultado devem ser conferidos em `RH_PORTAL_POPULACAO_2026.json` e `RH_PORTAL_RESULTADO_2026.json`. A criação do executor, isoladamente, não comprova a conclusão do povoamento. Meses além do recorte exigem adequação do calendário local; o ano inteiro não é declarado populado por esta entrega.

### Descontos municipais

Não existe uma tabela única de descontos obrigatória para todas as prefeituras. INSS/RGPS e RPPS dependem do vínculo e do regime do município; IRRF depende de bases, dependentes e regras vigentes. Consignado, vale-transporte, pensão alimentícia, plano de saúde e contribuição associativa dependem de adesão, contrato, decisão ou lei. Esta carga demonstra RGPS/IRRF; não lança consignados, pensões ou benefícios não comprovados em todos os servidores. RPPS e parâmetros municipais oficiais permanecem etapa de configuração/homologação.

## 4. Relatórios e apresentação

### Contracheque

`statement-service.ts` já possuía bases, memória de cálculo, IRRF, previdência, margem, dependentes, mensagens e referências. O PDF anterior era uma sequência textual de rubricas. A revisão adiciona quadro com código, rubrica, proventos e descontos, salário contratual e totais, preservando a memória integral em seguida. Demonstração fica identificada no documento. A emissão não comprova pagamento.

Ainda devem ser homologados a identificação institucional/CNPJ no cabeçalho, os dados bancários oficiais, a referência específica por rubrica no quadro, o modelo municipal e a assinatura/autenticidade conforme a rotina de recibos. O PDF gerado não é, sozinho, homologação da folha.

### Espelho de ponto

RH e Portal usam a mesma origem. O relatório pessoal já exportava o período integral com horas, extras, banco e totalizadores configuráveis. A revisão apresenta horários no fuso `America/Sao_Paulo`, identifica servidor/período e marca origem sintética. O PDF de espelho recebe grade própria em paisagem, cabeçalho repetido, totais e campos de conferência. Não registra assinatura ou aprovação automaticamente.

O modelo físico atual tem entrada e saída, horas trabalhadas e extras/banco; não possui quatro marcações de intervalo em `AttendanceRecord`. A carga considera uma hora de intervalo no cálculo da jornada, sem inventar batidas intermediárias. Escalas noturnas, plantões, feriados locais, faltas e homologação da chefia exigem cenários próprios.

### Folha e relatórios gerais

`report-service.ts` possui 17 modalidades gerais, com CSV, XLSX e PDF. `personal-reports.ts` acrescenta 14 modalidades pessoais, vinculadas ao titular. O PDF geral é textual, não um espelho contábil diagramado. A mera existência de exportação não satisfaz todos os relatórios especializados abaixo.

## 5. Comparação inicial com os 74 itens informados da POC

**E** = emissão específica identificada no código; **P** = parcial (dados/rotina correlata, sem toda a emissão solicitada); **N** = emissão específica não localizada. Os estados são inspeção de código e não aceite visual/funcional. Os itens 6 e 50 são mantidos separadamente como enviados, embora tratem do mesmo adicional.

Contagem: **11 E, 49 P e 14 N**, totalizando os 74 itens recebidos. Isso não representa 74 relatórios implementados ou homologados.

| Nº | Relatório solicitado | Estado | Evidência / lacuna |
| --- | --- | --- | --- |
| 1 | Previsão de retorno de férias | P | `Vacation` e férias pessoais; falta projeção consolidada de retorno e filtros de previsão. |
| 2 | Previsão de término de cargo em comissão | P | Regime/natureza e término contratual; falta previsão específica por nomeação comissionada. |
| 3 | Previsão de término de contrato | P | `CONTRATOS` emite término; falta recorte de previsão e vencimentos. |
| 4 | Programa de treinamento por curso | P | Políticas de capacitação, inscrições e certificados no Portal; falta programa consolidado por curso. |
| 5 | Programa de treinamento por funcionário | P | Histórico pessoal de capacitação; falta emissão gerencial por servidor. |
| 6 | Relação dos adicionais de tempo de serviço | P | `HISTORICO_ATS` pessoal com origem e memória; falta relação coletiva. |
| 7 | Aniversariantes do mês | E | Endpoint pessoal de aniversariantes publicados, dependente da política de exposição. |
| 8 | Dias afastados | P | `AFASTAMENTOS` pessoal lista períodos/faltas; falta total consolidado de dias por causa/servidor. |
| 9 | Aquisição mensal de vale-transporte | N | Benefícios não equivalem à previsão de aquisição por calendário e tarifa. |
| 10 | Conferência de vales-transporte | N | Falta confronto aquisição/concessão/desconto/consumo. |
| 11 | Mapa de ocupação de cargos e funções | P | `position-plan.ts` e quadro de cargos possuem limites/ocupação; falta emissão específica comprovada com livres e funções. |
| 12 | Agências bancárias | P | `BankBranch` compartilhado; falta exportação RH específica. |
| 13 | Causas de afastamentos | P | Tipos/motivos de `Leave`; falta catálogo e emissão consolidada de causas. |
| 14 | Classificações funcionais | P | Cargo, regime e natureza existem; falta emissão específica de classificações. |
| 15 | Mensagens | P | `MENSAGENS_RECIBO` e memória no recibo; falta relação das mensagens com vigências/destinatários. |
| 16 | Verbas e incidências | P | Rubricas e `HrPayrollRubricIncidence` configuráveis; falta relatório integral específico. |
| 17 | Cargos e salários | P | Cadastro de cargos, faixas e salário contratual; falta emissão do plano salarial. |
| 18 | Controle de valores consignáveis | E | `MARGEM_CONSIGNAVEL`, memória de obrigatórios, limite, utilizado, disponível e excesso. |
| 19 | Bancos | P | `Bank` central; falta emissão RH específica. |
| 20 | CBO | P | CBO central (`HealthCbo`); falta emissão RH e relação cargo/CBO homologada. |
| 21 | Cursos de graduação | N | Escolaridade da pessoa não é catálogo/histórico de graduação. |
| 22 | Treinamentos por cargo/função | P | Capacitação e cargos existem, sem relatório consolidado específico. |
| 23 | Horários de trabalho | P | Referências equipe/faixa/escala e jornada contratual; falta relatório integral de horários. |
| 24 | Índices financeiros / moedas auxiliares | N | Moeda BRL e parâmetros de cálculo não equivalem a cadastro histórico e relatório de índices. |
| 25 | Motivos de desligamento | P | Ciclo contratual/ocorrências; falta relatório de catálogo de motivos. |
| 26 | Parâmetros da previdência | P | Regimes, faixas e alíquotas; `PREVIDENCIA` emite valores calculados, não todo o cadastro de parâmetros. |
| 27 | Etiquetas de aniversariantes | N | Relação de aniversariantes não tem diagramação de etiquetas. |
| 28 | Etiquetas de funcionários | N | Não localizado modelo de etiquetas. |
| 29 | Etiqueta para cartão de ponto | N | Não localizado modelo de etiquetas. |
| 30 | Etiqueta para cartão de ponto 132 colunas | N | Não localizado modelo matricial/132 colunas. |
| 31 | Evolução global da folha | P | `FOLHA` lista competências/valores; falta série evolutiva com totais e comparação. |
| 32 | Evolução da folha por funcionário | P | Ficha financeira pessoal por competência; falta modelo evolutivo com variações. |
| 33 | Evolução da folha por unidade | P | Resumo por centro/local; falta série temporal por unidade gestora. |
| 34 | Expectativa de aposentadoria | N | Sem motor de regras/transições, elegibilidade e projeção previdenciária comprovada. |
| 35 | Ficha financeira anual para IRRF | P | `INFORME_ANUAL_POC` usa ano de pagamento demonstrativo; ficha pessoal por rubrica e relatório IRRF; falta homologação do informe fiscal oficial. |
| 36 | Ficha financeira resumida por verba | P | Ficha pessoal lista rubricas e líquido; falta agrupamento anual/resumo por verba. |
| 37 | Folha de assinatura de pessoal ativo | P | `SERVIDORES_ATIVOS` lista vínculos; falta modelo com campo de assinatura. |
| 38 | Folha de frequência | P | Ponto pessoal integral; falta mapa coletivo de frequência por período/setor. |
| 39 | Folha de ponto | E | `PONTO` pessoal em PDF/CSV/XLSX, origem compartilhada e totalizadores; modelo de quatro batidas e assinatura não está implementado. |
| 40 | Histórico completo dos funcionários | P | Pasta funcional e `FICHA_REGISTRO` com revisões, atos e recadastramento; não reúne todos os eventos setoriais em uma emissão integral. |
| 41 | Histórico de admissões / cedências | P | Revisões e ciclo funcional; falta relatório próprio de admissões/cessões. |
| 42 | Ficha cadastral resumida | E | `FICHA_REGISTRO` pessoal e `CADASTRO_GERAL`; não confundir com histórico completo. |
| 43 | Cadastro pessoal por dotação | E | `CADASTRO_DOTACAO`, somente dotações explicitamente vinculadas. |
| 44 | Cadastro pessoal geral | E | `CADASTRO_GERAL`. |
| 45 | Cadastro pessoal por local de trabalho | E | `CADASTRO_LOCAL`. |
| 46 | Cadastro pessoal por lotação | E | `CADASTRO_LOTACAO`. |
| 47 | Experiências anteriores / tempo de contribuição | P | Recadastramento guarda experiências declaradas; averbação ATS é separada e não comprova contribuição previdenciária. |
| 48 | Ocorrências diversas / anotações funcionais | P | Ocorrências na pasta e eventos persistidos; falta emissão própria consolidada. |
| 49 | Verbas fixas / valores consignados | P | Movimentos, parcelas e consignações pessoais; falta relação conjunta e distinção fixo/variável. |
| 50 | Adicionais por tempo de serviço | P | Mesmo fundamento do item 6; manter rastreabilidade separada. |
| 51 | Beneficiários de pensão alimentícia | E | `PENSOES`, memória, beneficiário e processo por demonstrativo calculado; não comprova repasse. |
| 52 | Beneficiários de pensão vitalícia | N | Pensão alimentícia do cálculo não equivale a pensionista vitalício. |
| 53 | Efetivos em cargo em comissão | P | Múltiplos vínculos existem; falta classificação e emissão específica de efetivo nomeado. |
| 54 | Contratos de trabalho | E | `CONTRATOS`, vigência, salário, jornada, situação e versão. |
| 55 | Convênios bancários — contas crédito | P | Contas/remessa demonstrativa e convênios consignados; falta emissão específica do convênio de crédito. |
| 56 | Convênios bancários — contas débito | P | Consignações/parceiros; falta emissão específica de contas débito. |
| 57 | Cursos complementares realizados | P | Certificados de capacitação no Portal; falta relação gerencial completa por curso/servidor. |
| 58 | Graduação dos funcionários | N | Grau de instrução não comprova curso, instituição, datas e conclusão. |
| 59 | Dependentes | P | Dependentes na ficha pessoal e memória de elegibilidade; falta relação coletiva dedicada. |
| 60 | Bancário — depósito / ordem de pagamento | P | `REMESSA_SALARIAL_POC` é modelo CSV fictício; não é OP/remessa bancária homologada. |
| 61 | Bancário — folha de crédito / convênios | P | Mesmo limite da remessa POC; falta leiaute de convênio homologado. |
| 62 | Análise parametrizável de consignados | E | Política `MARGEM_CONSIGNAVEL`, percentual, rubricas e memória compartilhada por pessoa. |
| 63 | Movimentação de pessoal | P | Contratos/revisões/ocorrências; falta relatório gerencial de movimentos. |
| 64 | Planilha de eventos variáveis | P | Movimentos/importação existem; falta planilha específica para lançamento/conferência com retorno de erros. |
| 65 | Contábil sintético por lotação / totalizadores | P | `RESUMO_CONTABIL` por regime/centro/local; falta lotação orçamentária e política de totalizadores. |
| 66 | Contábil analítico por dotação | P | Cadastro por dotação não é rateio contábil da folha; falta emissão analítica. |
| 67 | Contábil por dotação / fonte | N | Não localizada emissão com essas dimensões e rateios da folha. |
| 68 | Contábil por dotação / fonte / tipo de despesa | N | Não localizada emissão com essas dimensões. |
| 69 | Contábil por fonte de recursos | N | Não localizada emissão da folha por fonte. |
| 70 | Contábil analítico por lotação | P | Resumo atual não constitui analítico por lotação com totalizadores configuráveis. |
| 71 | Contábil por dotação / local de trabalho | P | Fontes separadas existem; falta rateio e emissão cruzada. |
| 72 | Contábil por lotação / dotação | P | Fontes separadas existem; falta rateio e emissão cruzada. |
| 73 | Contagem de tempo | P | ATS/averbações e histórico pessoal; falta relatório de tempo municipal/previdenciário com regras próprias. |
| 74 | Dimensionamento de pessoal | P | Quantidade de servidores e quadro de vagas; falta dimensionamento por demanda/jornada/lotação. |

## 6. Sequência recomendada a partir das lacunas

1. Homologar cadastro/contratos, regimes previdenciários, histórico real e unidade orçamentária; ativar identidades individuais do Portal.
2. Homologar a cadeia ponto → extras → cálculo → fechamento → recibo no recorte de três meses, incluindo isolamento por titular e reversão/correção de origem.
3. Completar os relatórios cadastrais, férias/términos, dependentes, frequência, ATS e evolução, com filtros compartilhados e modelos de impressão.
4. Implantar graduações/treinamentos completos, vitalícias, aposentadoria e etiquetas conforme requisitos específicos.
5. Relacionar apropriação/rateio da folha a dotação, fonte e natureza de despesa do orçamento vigente; só então emitir os oito modelos contábeis e homologar totalizadores.
6. Homologar bancos/convênios/remessas e informe anual segundo as regras oficiais aplicáveis. Os dados demonstrativos não substituem essa validação.

## 7. Verificação e estado de entrega

Registrar separadamente: dados efetivamente gravados, código alterado, testes executados, build e validação visual. O navegador desktop estava desconectado nesta sessão; inspeção de código/PDF e testes não devem ser apresentados como validação visual autenticada.

Verificações já concluídas nesta revisão:

- ESLint direcionado: aprovado.
- 7 testes em `hr-print-layouts`, `hr-documentary-reports`, `personnel-cadastral-reports` e `hr-workforce-service`: aprovados. Cobrem PDF multipágina sem perda de registros/totais, separação proventos/descontos, memória, histórico, cálculos, fechamento e publicação.
- 19 testes em `functional-portal-closure`, `employee-portal-final-services` e `drizzle-personnel-pages`: aprovados. Incluem escopo por titular, conciliação compensatória, integridade de registros, datas e pasta funcional.
- Os primeiros processamentos do lote excederam o timeout interno de cálculo e foram revertidos nessas transações. Contratos e ponto já preparados permanecem preservados. O executor foi corrigido para propagar explicitamente `inDatabaseTransactionScope` ao cálculo/fechamento, usando a transação externa com prazo ampliado. A execução em Sandbox terminou com interrupção de conexão; a conferência posterior encontrou agosto fechado/publicado, mas não confirmou setembro/outubro.
- Typecheck direcionado dos executores e do teste de impressão: aprovado.
- Build completo em modo preview: aprovado após corrigir o rótulo obrigatório das linhas da tabela operacional; as 16 partições e a compilação Next.js passaram. Sem aplicação de migração por esse build.
- Validação integrada da carga: em acompanhamento. O script `verify-rh-portal-2026.ts` verifica no banco as três competências, a conciliação de totais, a publicação no serviço do Portal, PDF real e a negação de acesso cruzado. Executar depois da carga.

Sem nova migração/schema nesta tarefa: as tabelas físicas necessárias para contrato, ponto, cálculo e publicação já estavam instaladas. A mudança de tabela visual na pasta funcional é independente do banco.

## 8. Plano solicitado e população salarial posterior

O solicitante pediu o plano completo dos 74 itens, reservando testes e integrações externas para o final, e esclareceu que salários/jornadas devem ser estimados para **todos os servidores cadastrados**, não apenas para os dois exemplos.

- Plano de execução: `docs/PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md`, com sete fases, dependências, matriz individual dos 74 itens e critérios de aceite.
- Executor: `scripts/estimate-rh-salaries-2026.ts`; pacote `RH_ESTIMATIVAS_2026_V1`.
- **Aplicados 198/198 salários e jornadas estimados**, cobrindo os **39 cargos** existentes, no cadastro e por revisão contratual canônica na mesma transação por servidor.
- Corrigida, na nova vigência, a unidade de jornada mensal: jornada semanal estimada por cargo, divisor mensal demonstrativo semanal × 5; sem reutilizar automaticamente 20/30/40 como horas mensais.
- Vigência da nova base: **01/11/2026**. As revisões e os demonstrativos anteriores são preservados; a folha histórica não foi recalculada com esses novos salários.
- Manifesto com critérios, valores anteriores/estimados e progresso: `docs/RH_ESTIMATIVAS_SALARIAIS_2026.json`. A conferência agregada registrou 198 contratos estimados, 198 cadastros coerentes com salário/divisor contratual e nenhum salário zerado/negativo.
- Bases mensais estimadas de **R$ 1.800,00 a R$ 15.984,00**; soma **R$ 897.419,70**, antes de proventos adicionais, descontos e encargos.
- A mesma consulta encontrou **agosto/2026 fechado, com 198 demonstrativos publicados** no pacote histórico `RH_PORTAL_2026_V1`. Setembro/outubro permanecem pendentes de retomada; não declarar três meses completos.
- Não foram executadas novas suítes de testes ou integrações externas nesta etapa de planejamento/população. Elas estão reservadas à fase final do plano; consulta agregada não é validação visual nem homologação.
- Sem nova migração de banco e sem nova publicação do código de interface nesta etapa.

## 9. Execução posterior do plano — atualização de estado

O estado das seções 7/8 é histórico da etapa inicial/salarial. A retomada posterior concluiu setembro e outubro: **agosto–outubro agora têm 198 demonstrativos fechados e publicados por mês, total de 594**. As bases de novembro não reescrevem esse histórico.

Foram aplicados cenários complementares de formação, VT, convênios, tempo anterior, pensão vitalícia e rateios demonstrativos, além de **186 escalas com intervalo explícito**, preservando os 12 secretários fora do controle automático. Houve uma migração física posterior para ampliar as categorias de referência, aplicada pelo executor oficial; não houve deploy do código da aplicação.

A central `/rh/relatorios` e os serviços especializados preparam emissões para os 74 IDs, com limitações individuais. ATS, evolução, formação, contabilidade demonstrativa, etiquetas/132 colunas e modelos bancários internos foram ampliados. A política local do Portal foi unificada: não há mais seleção automática do primeiro servidor para conta sem vínculo.

Consultar [EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md](EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md) para evidências, separação banco/telas e complementos pendentes. A etapa final interna foi iniciada posteriormente: **74 consultas/CSV e conciliação dos três meses aprovadas**, além de amostras PDF/XLSX e cinco testes de impressão/primitivas. A validação visual está bloqueada por navegador desconectado; integrações externas e homologação seguem pendentes. **74 IDs executados não equivalem a 74 requisitos integralmente implementados ou homologados.**
