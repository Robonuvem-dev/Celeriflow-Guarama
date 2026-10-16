# Documentos municipais de Ibema — aproveitamento por módulo

Data de referência: 11/10/2026. Originais: `docs/Novos docs/Novos docs/`.

## 1. Resultado e método

O conjunto fornece dados reais, classificações, modelos de documentos e evidências de processos municipais para orientar as implementações. Foram inventariados **141 arquivos-fonte**, com **7.805 páginas de PDF**, incluindo o PDF do ZIP do PPA e cópias repetidas. As duas partes binárias do PPA são transporte do mesmo documento, não novas fontes. A identificação foi feita por conteúdo, metadados, extração textual e OCR: o processamento principal concluiu **1.256 páginas com imagens**, em 38 fontes distintas, complementado por leituras direcionadas e conferência visual dos pontos críticos. Não se trata de uma transcrição certificada de cada lançamento dos relatórios de milhares de páginas.

Há cinco cópias redundantes, em quatro grupos de SHA-256 idêntico: `2_rdaq_2025 (1).pdf`/`2_rdaq_2025.pdf`; os dois decretos 2726; as três despesas extra; os dois relatórios de gestão do segundo quadrimestre. São **136 conteúdos distintos**. Após autorização do usuário, os hashes foram conferidos novamente e as cinco cópias com sufixo `(1)`/`(2)` foram excluídas, preservando uma fonte integral de cada grupo. Os IDs históricos 001–141 permanecem no catálogo, incluindo os registros de exclusão e seu destino.

**Não é possível demonstrar cobertura de 90% dos dados necessários apenas pela quantidade de arquivos.** O material é especialmente forte em orçamento, execução financeira, relatórios fiscais, planejamento setorial e controle interno. RH recebeu relações funcionais e quantitativos, mas não recebeu neste conjunto ficha financeira analítica, tabela salarial completa vigente, cadastro de dependentes, regras de incidência por rubrica, assentamentos individuais e todos os atos que determinam direitos. As pendências incluem dados internos, além de integrações externas.

### Distinções obrigatórias no aproveitamento

- Guardar município, entidade/unidade, competência, data de emissão, documento/página e versão normativa junto ao dado. Data de geração não define automaticamente a competência de um CSV.
- Separar dado histórico de parâmetro vigente. Não transformar totais de relatório em movimentos contábeis nem criar salários a partir de faixas sem tabela monetária.
- Importar **linhas analíticas**, preservando códigos como texto. Pais/subtotais e folhas de uma hierarquia não podem ser somados juntos.
- Diferenciar empenho, liquidação e pagamento: cada um possui evento, data, anulação e saldo próprios. A nota de empenho não comprova pagamento.
- OCR pode perder percentuais, nomes e alinhamento de colunas. Regras de cálculo precisam de conferência no original e referência por artigo/página.
- Um modelo de exportação aproveita campos e organização do original; aprovação visual e validação do total são etapas próprias. Assinaturas e certificação do original não são transferidas para documentos novos.

## 2. Achados concretos que afetam o sistema

| Fonte e localização | Evidência | Consequência de implementação |
|---|---|---|
| `7c9ec788b259920d6d53329bca40ae12.pdf`, p. 1–2 | Estatuto de **Campina do Simão**, Lei 21 de 13/11/2025; 70 páginas | Referência comparativa de funcionalidades de RH. Não cadastrar como legislação de Ibema nem usar seus percentuais, prazos ou direitos no cálculo municipal. |
| `QUADRO DE PESSOAL.pdf`, p. 1 | Em 31/07/2026: efetivos 549 criados/208 preenchidos; temporários 11/18; comissionados 54/10; agentes políticos 9/8; empregos públicos 0/0 | Referência do quadro de vagas, com divergência aparente nos temporários. Registrar inconformidade e reconciliar com lei de cargos e vínculo; não fabricar capacidade de vagas. |
| `Lista de Servidores - Quantidade.pdf`, p. 1 | Referência impressa 03/09/2026: ativos 270, concursados 208, comissionados 12, outros 50; demitidos 29 | Não comparar diretamente com o quadro de julho nem tratar contagem de matrículas como pessoas únicas. Os subtotais de outros estão discriminados no original. |
| `SERVIDORES ATIVOS.pdf`, p. 1–9 | Matrícula, nome, cargo/função, lotação, situação, até 31/07/2026; há nomes repetidos com matrículas diferentes | Identidade da pessoa separada do vínculo; importação funcional por matrícula e referência, sem fundir contratos pelo nome. |
| `lista de Servidores Ativos.pdf` e `lista de Servidores Efetivos.pdf`, p. 1–5 | Admissão, cargo, faixa, carga horária e expediente; referências diferentes | A carga de 20/40 impressa não pode substituir `monthlyHours` de 100/200/220 sem definição da unidade e política de conversão. Faixa A-01 não informa sozinha o salário. |
| `Escala Conselho Tutelar.pdf`, p. 1 | Escala de **julho de 2024** | Modelo de escala/plantão, não calendário ou plantão vigente de 2026. |
| `EX20261008_1630.pdf`, p. 1 | Decreto 2912/2026 transfere o Dia do Servidor para **30/10/2026**, mantendo expediente normal de saúde e coleta de lixo | Calendário por unidade/serviço, com exceções, não feriado universal. O fecho traz 2025, enquanto número, publicação e art. 1º indicam 2026: conservar a divergência de origem. |
| `Cartilha Diárias Atualização Julho 2025.pdf`, p. 2–5 | Requerimento com 3 dias; prestação/restituição em 5 dias; distância superior a 70 km; períodos de 24h, >12h com/sem pernoite e >8h | Parametrização de viagem e prestação de contas. Os limites exatos de 8/12/24h, dias úteis/corridos e regra de distância exigem legislação fonte; não gerar desconto em folha só porque faltou relatório. |
| Mesma cartilha, p. 3 | Demais servidores: DF R$ 540,53, capitais R$ 405,39, demais municípios R$ 337,83; internacional US$ 130,00 | Tabela histórica por função/destino/moeda; meia diária de R$ 337,83 resulta em R$ 168,915 e requer política monetária de arredondamento. Compras de agosto mostram R$ 168,91: conciliar regra de origem antes de automatizar. |
| Mesma cartilha, p. 6–8 | Relatório circunstanciado; solicitação; autorização de diárias | Três modelos reutilizáveis de GED/Financeiro/Portal do Servidor, descritos na seção 4. |
| `pt ibema 2025.pdf`, p. 1, conferida visualmente | Captura do painel com **ano 2026**, apesar do nome 2025 | Modelo de indicadores, não fechamento de 2025. Captura não fornece série analítica nem data de corte completa. |
| `Balanço Orçamentario - Julho.pdf`, p. 1; `Orçamento anual - Receita Prevista.pdf`, p. 1 | Receitas correntes iniciais R$ 136.350.600,00 versus R$ 47.037.500,00; rubricas repetidas e deduções na receita prevista | Investigar escopo/duplicação da agregação; impedir que o primeiro total seja assumido como caso ouro sem reconciliação. |
| `LRF - DEMONSTRATIVO DAS RECEITAS E DESPESAS PREVIDENCIÁRIAS.pdf` e projeção atuarial | Modelos de RPPS com linhas zeradas | Não comprovam existência de RPPS nem alíquotas. A certidão do RACI abaixo esclarece o regime municipal; manter classificação individual de cada vínculo e não cadastrar RPPS por causa do título do anexo. |
| `Relatório Controle Interno 2025.pdf`, p. 33, conferida visualmente | Certidão de 19/02/2026: fundo municipal extinto pela Lei 002/1999, passando ao **Regime Geral de Previdência Social** | Fonte concreta para configurar RGPS na implantação municipal e explicar anexos RPPS sem movimento. A certidão não fornece tabelas INSS 2026, RAT/FAP, patronal, incidências ou enquadramento de estagiários: esses parâmetros continuam específicos. |
| `LEI ORGÂNICA.pdf` | Edição identificada como 2008 | Fonte estrutural histórica; alterações/consolidação vigente continuam necessárias para regras atuais de pessoal e competências. |
| `Plano_Diretor_-_Ibema_-_PR.pdf` | Publicação de 2021, 503 páginas, legislação e anexos territoriais | Fonte concreta para regras urbanísticas e documentos de Construção Civil, preservando mapas, escala, zona e alterações posteriores. |
| Mesmo arquivo, p. 274 e 376–380 | Código de Posturas (LC 029/2021), incluindo arts. 364–371 sobre cemitérios e registros | Requisitos reais para licenciamento, sepultamento, exumação, ossuário, titularidade/transferência e livro/ficha informatizada; falta a base operacional dos jazigos e o regulamento complementar. |
| Mesmo arquivo, p. 391–480 | LC 030/2021: ISSQN, incidência/responsabilidade/retenção e lista de serviços/alíquotas | Fonte normativa tributária adicional, além do Plano Diretor; exige correspondência de serviço/subitem e alterações para a versão atual do motor fiscal. |
| `LEI Nº 702-2025 LOA 2026.pdf`, p. 1–2 | Montante inicial R$ 44.199.100,00; correntes líquidas R$ 41.293.400,00 e capital R$ 2.905.700,00 | Referência inicial que reconcilia correntes brutas de R$ 47.037.500,00 menos dedução FUNDEB de R$ 5.744.100,00. Não confundir com previsão atualizada. |
| Leis 701/2025 e 711/2026, p. 1 | 701 altera PPA **e LDO 2026**; 711 altera PPA/LDO/LOA e inclui ação **1.053 — Aquisição de Veículo Utilitário** | Alteração coordenada dos três instrumentos; não cadastrar a 711 apenas como revisão textual do PPA. |
| `LEI Nº 677-2025 REFIMI - Tributario.pdf`, p. 1–3 | Débitos até 31/12/2024; redução de multa/juros: 90% à vista, 60% até 3 parcelas, 30% até 6; mínimos PF R$ 40/PJ R$ 70; primeira em até 3 dias úteis e seguintes dia 10 | Campanha histórica: art. 11 fixa vigência até 31/08/2025, prorrogável uma vez por até 60 dias. Não aplicar desconto no principal nem abrir adesão de 2026 sem novo fundamento. |
| `Termo de Colaboração Nº 001-2026 AACADI.pdf`, p. 1–3 | Transporte universitário; ônibus 50/van 16 passageiros; frequência mínima 80%; relatório a cada 60 dias; fevereiro–dezembro/2026 | Integração de Educação/Frotas/Convênios: elegibilidade, capacidade, frequência e prestação de contas vinculadas ao termo. |
| `Relatório Anual de Monitoramento do Portal Transparência 2025.pdf`, p. 1–3 | ITP 96,74, classificação Diamante; aponta melhorias, inclusive preços unitários/totais de obras | Requisitos do portal e da publicação de contratos/obras. A nota histórica não é avaliação do nosso sistema. |
| `Instrução Normativa CI Nº 02-2026.pdf`, p. 3–8 | Economia = previsto − contratado; despesas evitadas, restituição, glosa, renegociação; correção de folha pela despesa anual eliminada; memória e validação | Relatório de benefícios com auditoria/achado/recomendação/documentos/valores/metodologia/responsável/validação. Despesa anual evitada precisa de período/base comprovados, não multiplicação indiscriminada de um mês por 12. |
| `Declaração da Análise da Prestação de Contas Exercício 2025.pdf` versus instrução 1736/2026 | Declaração de abril informa tramitação; instrução posterior contém análise técnica | Versionar estágio do processo; instrução técnica não equivale a julgamento definitivo das contas. |

## 3. Uso por módulo e integração interna

| Módulo existente | Fontes principais | Uso concreto | Dados ainda necessários |
|---|---|---|---|
| Administração/Cadastros | Fale Conosco, responsáveis, organograma | Órgãos, unidades, funções, contatos, horários, assinantes e histórico de titulares | Atos vigentes e correspondência entre órgão administrativo e código orçamentário |
| RH/Folha/Portal do Servidor | Relações, quantidade, quadro, diárias, capacitação, diário oficial | Relação por referência, pessoas/vínculos, jornada com unidade, atos, capacitação, solicitação de viagem, conciliação folha–empenho–retenção | CPF/identidade confirmada, salários e incidências, dependentes, afastamentos, assentamentos, leis vigentes, arquivos bancários/eSocial |
| SST | Lotação, jornada, equipes e planos de capacitação | Vinculação funcional, planejamento de atendimento, turmas e histórico de treinamentos | GHE/riscos, ASO, exames, agentes nocivos e responsáveis técnicos; não constam das relações de pessoal |
| Planejamento/Orçamento | PPA 687/2025 e alterações 701/2025 e 711/2026, LDO 2026/2027, LOA 2026 | Programas, ações, metas, unidades, fontes, dotações, versionamento e relatórios de execução | Vinculação analítica e consolidação de alterações/créditos; anexos recortados devem ser conferidos |
| Financeiro/Contabilidade | Plano de contas, balancetes, receitas, empenhos, liquidações, pagos, extras, balanços e LRF | Catálogos; cadeia da despesa; retenções/consignações; saldos; RGF/RREO/DCASP e comparação 2025/2026 | Lançamentos de razão, saldos iniciais conciliados, extratos e regras de consolidação/eliminações |
| Compras/Contratos/Convênios | Compras/NF, contratos, PCA, termos, transferências | Itens, fornecedores, objetos, licitação/processo, recebimento/atesto, fiscalização, vigência e prestação de contas | Processos e aditivos completos, catálogo reconciliado, comprovação fiscal e documentos de execução |
| Patrimônio/Almoxarifado | Plano de contas, notas/itens, estoque CAF/Farmácia, DVP/patrimonial | Materiais/unidades, depósitos, inventário por data, integração recebimento–estoque, alienação e conciliação patrimonial | Lote/validade/custo, movimentos e tombamento; diferenças entre snapshots não comprovam dispensação |
| Saúde/Portal do Paciente | PMS, RDQA/RAG, carteira, equipes, auditoria territorial, estoques | Metas/indicadores, serviços, unidades, território/ESF, produção agregada, farmácia e modelos gerenciais | Base nominal, CNES/procedimentos atualizados, prontuários, produção enviada/retornada e integração SUS |
| Educação/Frotas | MDE/FUNDEB, auditoria transporte, AACADI, pessoal/planejamento | Recursos vinculados, professores/vínculos, fiscalização de rotas/veículos, frequência e transporte universitário | Matrículas/alunos, itinerários e medições, veículos/motoristas e comprovações atualizadas |
| Social/Conselhos | PMAS, CMAS (nomeação/regimento/PAT), relatório de gestão, termos e transferências | Rede, programas, metas, composição/paridade, comissões, agenda, atas/resoluções e acompanhamento do fundo | Beneficiários/atendimentos e regulamentos dos benefícios; conselheiro CMAS não equivale a conselheiro tutelar remunerado |
| Obras/Construção Civil | Plano Diretor, programas/ações, contratos, empenhos, auditoria/portal | Zoneamento e regras de processos, documentos urbanísticos, acompanhamento físico-financeiro de obras e publicação de custos | Geometrias e alterações normativas, projetos/memoriais, medições e aprovações de cada obra |
| Tributação | REFIMI, receita prevista/realizada, tributos mensais, Plano Diretor | Catálogos, arrecadação por tributo/fonte, renúncia e dívida; campanha de recuperação; interfaces urbanísticas | CTM e alterações, cadastro individual, base de cálculo/lançamento, dívida detalhada e integrações NFS-e |
| Iluminação pública/Iluminaflow | COSIP nas receitas/DVP, programas/ações e despesas | Indicadores e conciliação de recursos de iluminação; ligação financeira das ordens de serviço | Pontos/ativos, medições/faturas de energia, materiais/execução; preservar o acesso próprio existente |
| Meio Ambiente/Saneamento/Cemitérios | Plano Diretor/Código de Posturas, PPA, plano estratégico, receitas e contratos | Referências territoriais, fiscalização, metas/recursos; requisitos reais de licenciamento e registro dos cemitérios | Não há cadastro de jazigos/sepultamentos, contas de água ou rede geográfica suficiente neste pacote |
| Controle Interno/Auditoria/Indicadores | PAT/PACI/PAAI, IN 01/02-2026, achados, auditorias, PDMC e contas | Plano, risco, evidência, achado, recomendação, responsável/prazo, monitoramento e benefícios efetivos/potenciais | Evidência de implementação e validação dos resultados; evitar somar economia potencial com realizada |
| GED/Protocolos/Transparência/Atendimento | Governo digital, modelos, publicações, monitoramento e contatos | Solicitação/acompanhamento digital, catálogo de serviços, modelos versionados, diário oficial e exportação estruturada | Fluxos e assinantes vigentes, publicação por escopo e contratos de interoperabilidade |

## 4. Modelos e dicionário das exportações

### RH/Folha — aplicação realizada nesta entrega

Em `src/lib/rh/report-service.ts`, os novos tipos `SERVIDORES_ATIVOS` e `QUANTIDADE_SERVIDORES` estão disponíveis na tela `/app-domain/rh/operacoes`, pela rota autenticada `/api/rh/relatorios`, em CSV/XLSX/PDF.

- Relação: referência, matrícula, nome, cargo/função, lotação, situação, regime, admissão, faixa, jornada **mensal** e versão contratual.
- Quantidade: por regime, pessoas distintas e vínculos ativos; total geral deduplica a pessoa inclusive quando possui regimes diferentes.
- `referenceDate=AAAA-MM-DD` prevalece sobre competência; sem data explícita, competência usa o fim do mês; sem ambas, data atual UTC. Revisão vigente determina admissão/término/lotação/situação; vínculo com término no dia de referência ainda é incluído.
- Nomes de cargo/regime e nome da pessoa são do cadastro atual; a versão temporal preserva os IDs e dados contratuais. Não foi criado histórico de renomeações de catálogo.
- Não foram inseridos servidores, salários ou leis em banco por nome/OCR. Relatórios usam o banco do tenant autorizado e não expõem CPF/conta bancária.
- O PDF continua no renderizador genérico do sistema: **campos documentais aproveitados**, diagramação oficial ainda a reproduzir e conferir. O quadro de vagas/demitidos não é calculado por estes dois novos tipos.

Testes: `tests/hr-documentary-reports.test.ts`: revisão histórica, mudança no meio do mês, término inclusivo, jornada mensal e deduplicação de pessoas/vínculos.

### Modelos reutilizáveis identificados

| Modelo | Fonte | Campos/estrutura a implementar | Origem dos dados |
|---|---|---|---|
| Relatório circunstanciado | Cartilha, anexo I, p. 6 | Usuário/CPF, órgão, período/destino, valor requisitado, atividades, objetivo, local/data, declaração e assinatura | Viagem + pessoa + prestação de contas; não valor líquido de holerite |
| Solicitação e autorização de diárias | Cartilha, anexo II, p. 7–8 | Servidor/matrícula, saída/retorno com hora, finalidade, destino/placa, banco/agência/conta, quantidade/unitário/total, número da autorização e autoridades | RH + Frotas + Financeiro + assinantes vigentes |
| Nota de empenho | Exemplo 8817/2026 p. 1 e notas julho/agosto | Identificação municipal, número/exercício/tipo/data, credor, dotação/fonte, processo/licitação, itens/quantidade/preço/total, histórico e assinaturas | Empenho e itens; não criar recibo de pagamento a partir dela |
| Compras e compras com documentos fiscais | PDFs julho/agosto | Data/empenho/secretaria/credor/CPF-CNPJ, descrição, unidade/quantidade/preço/total; documento fiscal/modelo/número/valor na variante detalhada | Compras/recebimentos + Financeiro; evitar repetir total do item por NF |
| Relações de emitidos/liquidados/pagos/a pagar | Relações de transparência e IN58 | Cabeçalho por exercício/período; empenho/credor/programática/fonte/licitação/processo/objeto; eventos analíticos com documento/data/valor | Eventos nativos de cada etapa, conciliados e sem duplicar empenho |
| Quadro e quantidade de pessoal | Quadro p. 1 e quantidade p. 1 | Criadas/preenchidas por categoria; ativos/demitidos e subcategorias por referência | Lei/plano de cargos + vínculos/atos; distinta da contagem apenas ativa |
| RGF/RREO | Anexos individuais e simplificados | Linhas/códigos/fórmulas, colunas mensais/bimestrais/quadrimestrais, RCL ajustada, limites, notas de fonte e responsáveis | Agregação contábil por período/escopo; não mera soma da folha fechada |
| DCASP | Quatro relatórios de dezembro/2025 | Exercício atual/anterior, ingressos/dispêndios, ativo/passivo, variações, notas e assinantes | Razão/saldos classificados no plano de contas municipal |
| Estoque CAF/Farmácia | Três consultas de estoque | Filtros, competência/unidade, material/apresentação/código, unidade, quantidade e conferência | Inventário do depósito na data; lote/validade não aparecem no relatório |
| RDQA/RAG e planos setoriais | Saúde e Social | Identificação, indicadores, metas/resultado, produção/rede/profissionais, execução por fonte, análises e considerações | Indicadores versionados + produção + financeiro, preservando fonte externa |
| Auditoria e benefícios | IN01/02, matriz e relatórios finais | Achado, evidência, critério, causa, efeito, recomendação, responsável, prazo, resposta, acompanhamento; memória do benefício e validação | Controle Interno, com vínculo às evidências de processos |

CSV municipal: separador `;`, decimal com vírgula, códigos textuais, preâmbulo de identificação/geração e coluna vazia terminal. Para importação, localizar cabeçalho real e preservar fonte. Para exportação, distinguir versão fiel ao modelo de versão analítica interoperável; nunca misturar moeda USD/BRL ou jornada semanal/mensal.

## 5. Integrações externas encontradas

O link informado em `Links de Transparencias e APIS.txt` respondeu em 11/10/2026. O Swagger usa configuração `/portaltransparencia-api/v3/api-docs/swagger-config`, que aponta para `/portaltransparencia-api/v3/api-docs` (OpenAPI 3.0.1, Elotech). Há grupos de empenhos, liquidações, receitas, licitações, servidores e dívida ativa. Isso fornece **contrato de consulta**, não integração implementada nem garantia de permissão, completude ou atualização.

Base informada: `http://transparencia.pibema.pr.gov.br:8087/portaltransparencia-api`. O servidor gerado no OpenAPI omite a porta 8087: validar a base configurada ao implementar. Paginação é zero-indexed nos endpoints examinados. Usar chave de origem (entidade+exercício+número/evento), data de coleta, importação idempotente e reconciliação por etapa; não importar o mesmo evento dos PDFs e API duas vezes.

O TXT informa que adiantamento de despesas e verbas de gabinete não são adotados. Registrar como característica operacional da fonte/data, sem presumir inexistência perpétua ou eliminar os recursos genéricos do sistema.

## 6. Ordem de implementação derivada dos documentos

1. **Cadastros/planejamento**: reconciliar órgãos/unidades/fontes/programas/ações/contas; histórico de titulares; orçamento inicial e alterações. Guardar código externo separado do ID interno.
2. **RH**: importação funcional por matrícula com identidade confirmada e unidade de jornada; tabela salarial e rubricas/incidências; classificação de vínculos/cargos; calendário de 30/10 com exceções; conciliação das quantidades/vagas. Os relatórios ativos já foram adicionados.
3. **Financeiro e compras**: cadeia emitido→liquidado→pago, extra/retido/consignado, itens/NF/atesto, modelos de empenho e diárias; alinhar com a ponte de folha existente.
4. **Relatórios oficiais**: versões de RGF/RREO/DCASP por competência, entidade e edição de layout; conferir fórmulas e saldos contra fontes reconciliadas. Comparação visual com originais.
5. **Saúde/estoque e Educação/Frotas**: cadastros e metas reais, estoque por unidade, territorialização, rotas/termos e prestação de contas; sem inferir movimentação individual de agregados.
6. **Social, Controle Interno e Portal**: comissões, agendas/atas, achados/monitoramento/benefícios, publicação de obras com custos unitários e totais, modelos GED e serviços digitais.
7. **Obras/territorial e demais módulos**: regras/mapas do Plano Diretor, alterações e integração cadastral; completar bases específicas de iluminação, saneamento, SST e cemitérios.

## 7. Catálogo individual

O catálogo complementar [CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md](CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md) referencia **cada um dos 141 arquivos**, identificando módulo, conteúdo/estrutura reaproveitável e limite de uso. Nomes grafados como no diretório original. A análise anterior dos 67 arquivos de RH permanece em [ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md](ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md).

A [comparação dos IDs 001–141](COMPARACAO_DOCUMENTAL_IBEMA_001_141.md) aprofunda as relações entre fontes, estabelece importância por módulo e registra os hashes das cópias excluídas.

### Desdobramento do arquivo composto “Plano Diretor” (ID 108)

O nome do PDF não revela todas as leis nele contidas. Os intervalos abaixo são páginas locais da edição, incluindo anexos, e fornecem referências de implementação:

| Páginas | Conteúdo identificado | Destino e transformação |
|---|---|---|
| 1–86 | LC 023/2021 — Plano Diretor e anexos | Planejamento territorial, instrumentos/diretrizes, mapas. Distinguir meta pública de parâmetro individual de licenciamento. |
| 87–132 | LC 024/2021 — Zoneamento, Uso e Ocupação do Solo | Construção Civil/Base Territorial: zona, uso permitido/condicionado, parâmetros de ocupação, vínculo com mapa. Conferência célula a célula das tabelas antes de ativar regra. |
| 133–154 | LC 025/2021 — Parcelamento do Solo | Processos de loteamento/desmembramento, aprovação prévia, documentos e condicionantes. Não confundir subdivisão cadastral com autorização urbanística. |
| 155–177 | LC 026/2021 — Sistema Viário | Hierarquia/dimensionamento de vias, continuidade de arruamento, infraestrutura e mobilidade. Geometria/medidas do projeto ainda necessárias. |
| 178–185 | LC 027/2021 — Perímetro Urbano | Poligonal e memorial de coordenadas. Conferir datum/projeção/unidades e vértices no original; coordenadas OCR não devem decidir automaticamente se um imóvel é urbano. |
| 186–273 | LC 028/2021 — Código de Obras | Tipos de obra, elaboração/execução, projetos, licenciamento, fiscalização e anexos. Número da lei conferido visualmente porque o OCR omitiu a linha do título. |
| 274–390 | LC 029/2021 — Código de Posturas | Fiscalização de atividades, higiene, bem-estar, ambiente, publicidade, eventos e cemitérios. Valores em unidades de referência exigem tabela anual vigente. |
| 391–480 | LC 030/2021 — ISSQN | Incidência/local do fato gerador, responsabilidade/retenção, base e anexos de serviços/alíquotas. Validar legislação nacional e alterações municipais antes de parametrizar produção. |
| 481–503 | LC 031/2021 — Liberdade Econômica, localização e fiscalização de funcionamento | Cadastro econômico/Alvarás/Tributação: CNAE, grau de risco, dispensa/exigibilidade, taxas e procedimentos. CNAE/subitem ISS e grau de risco são classificações diferentes. |

Exemplo de requisito concreto para **Cemitérios**: na p. 378, art. 370, registrar sepultamentos de corpos/partes, exumações, ossos e direitos sobre jazigos, com titular/qualificação/endereço e transferências; ocorrências com hora/data, pessoa falecida e, para sepultamento, filiação/idade/sexo/certidão. Art. 371 prevê livro/ficha/arquivo informatizado com referência ao histórico integral e consulta por jazigo e ordem alfabética. Isso se mapeia às estruturas de ocupação/processos/transferências já existentes; não determina, por si só, prazo de concessão, tarifa atual ou intervalo de exumação.

Exemplo de requisito para **Tributação/Construção Civil**: LC 030/2021, p. 392, trata o fato gerador de serviços de construção continuada por medição mensal; p. 400 relaciona retenção e informações de dedução da base no documento fiscal. Mapear medição→serviço→documento fiscal→tributo, evitando usar valor global contratado como uma única medição efetivamente executada.

### Evidências de verificação

- Catálogo conferido automaticamente: 141 linhas e todos os 141 nomes do inventário presentes, sem arquivo-fonte omitido.
- SHA-256 identificou as cópias idênticas; o PPA foi reconstruído/conferido conforme o README de sincronização.
- Regressão do domínio após a aplicação dos relatórios: **32 testes aprovados**, incluindo a integração RH/PostgreSQL e as origens SST, além dos dois testes documentais novos.
- `npm run build` concluído com código 0 após os novos relatórios: compilação, TypeScript e geração das páginas aprovados. Aprovação de build/testes não constitui homologação visual/normativa dos modelos oficiais.
