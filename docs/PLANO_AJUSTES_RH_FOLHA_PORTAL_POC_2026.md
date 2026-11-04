# Plano de ajustes — RH, Folha e Portal do Servidor

**Data:** 02/11/2026. **Base:** [análise dos 74 itens](ANALISE_RH_FOLHA_PORTAL_POC_2026.md).
**Diretriz do solicitante:** preparar os ajustes e popular dados fictícios verossímeis para **todos os servidores cadastrados**; testes, homologação e integrações externas ficam na etapa final. Nomes, salários e jornadas dos exemplos são referências, não uma tabela salarial obrigatória.

## 1. Escopo e decisões

- Cobrir individualmente os **74 itens**, incluindo os 11 com emissão já localizada. O ponto de partida é **11 E / 49 P / 14 N**, por inspeção de código; não é homologação.
- Usar `Person` → `Employee` → contrato/revisões → ponto/movimentos → cálculo → fechamento → publicação → Portal. Manter uma identidade de pessoa por servidor entre módulos.
- Estimar remuneração e jornada dos **198 cadastros encontrados, distribuídos em 39 cargos**, inclusive os que já tinham salário positivo. Não limitar a estimativa aos 18 salários zerados nem aos exemplos enviados.
- Preservar nomes e vínculos cadastrais existentes. Os exemplos João da Silva e Amadeu Araujo não exigem criar outros servidores além dos já cadastrados.
- Usar escopo **DEMONSTRACAO**, indicação de estimativa, origem, vigência e memória do cálculo. Salário-base não se confunde com remuneração bruta, líquido, encargos ou pagamento.
- Reutilizar tabelas e serviços existentes. Definir uma migração específica apenas quando a análise do requisito comprovar falta de estrutura; tratar migração/schema e tabelas de tela como entregas diferentes.
- Preparar dados, regras e documentos internos antes de depender de bancos, autenticação externa, órgãos fiscais/previdenciários ou serviços de terceiros.
- Executar testes e validação visual na **F7**. Consultas para conhecer o cadastro, prévias e gravações transacionais da população são operações de execução, não homologação.

## 2. Descobertas que condicionam a execução

1. O formulário de servidores e a ficha do Portal tratam `Employee.contractedHours` como **horas mensais**. Há cadastros com 20/30/40 nesse campo, valores compatíveis com jornadas semanais. O primeiro pacote os levou para o contrato mensal. Corrigir a unidade explicitamente; não multiplicar todos os valores por cinco sem analisar o cargo.
2. Na conferência inicial de população de 02/11, só agosto/2026 estava confirmado. A retomada posterior concluiu **agosto, setembro e outubro, 198 demonstrativos fechados/publicados por mês**; ver `RH_PORTAL_POPULACAO_2026.json`.
3. A execução anterior em Sandbox terminou com `ConnectionError: Stream connection was interrupted`. Retomar somente após identificar a última etapa persistida e preservar a idempotência.
4. Para preservar o histórico fechado, a nova estimativa de salário/jornada tem vigência **01/11/2026**. Agosto–outubro permanecem um conjunto histórico da versão anterior: não apresentar seus recibos como calculados pelas novas bases.
5. Os 198 contratos da versão anterior são demonstrativos. A população salarial recusa contratos de outra origem/escopo ou cadastros sem correspondência explícita de cargo, em vez de atribuir um salário genérico.
6. O diagnóstico inicial tinha apenas um usuário, sem vínculo `employeeId`. Convite preparado pelo RH não equivale a conta individual ativada nem a login demonstrado.

## 3. Ordem de execução e marcos

| Fase | Trabalho e dependência | Marco de implementação preparado para a F7 |
| --- | --- | --- |
| **F1 — Cadastro e população** | Consolidar pessoa, cargo, unidade, lotação e contrato. Estimar salário/jornada em todos os cadastros. Registrar antes/depois, vigência e dados fictícios. | 198/198 cadastros com estimativa rastreável e contrato coerente; nenhuma unidade semanal gravada como divisor mensal. |
| **F2 — Fluxo operacional interno** | Após F1, completar parametrização, calendários, escalas, ponto, movimentos, folha, contracheque e publicação. Retomar a carga histórica de agosto–outubro. Preparar vínculo pessoal do Portal e regra única de titularidade. | Três competências históricas completas e distinguíveis da nova base; novos cálculos usam a revisão vigente; consulta RH/Portal lê a mesma origem. |
| **F3 — Relatórios cadastrais e evolução** | Após F1/F2, completar catálogos, previsões, totalizadores e séries financeiras, com um contrato compartilhado de filtros/exportação. | Cada item da fase tem consulta, filtros, colunas, agrupamentos e emissão próprios; nenhuma redução à primeira página. |
| **F4 — Histórico, direitos e benefícios** | Após F1/F2, completar capacitação/graduação, afastamentos, ATS, experiências, dependentes, pensões e regras de aposentadoria. Popular cenários específicos conforme as estruturas forem concluídas. | Históricos temporais completos, cenários fictícios identificados e memória das regras; direitos e benefícios sem aplicação indiscriminada aos 198. |
| **F5 — Apropriação contábil da folha** | Após F2 e dimensões orçamentárias internas, definir rateio por lotação, dotação, fonte e tipo/natureza de despesa. Implementar os oito relatórios contábeis. | Mesma base conciliável nos itens 65–72, rateios sem duplicação e totalizadores versionados. |
| **F6 — Formatos e preparação bancária** | Após os dados de F1–F5, concluir etiquetas, assinatura e modelos bancários internos; definir contratos de adaptadores, arquivos e retornos locais. | Etiquetas diagramadas e arquivo 132 colunas; documentos e arquivos bancários fictícios preparados, sem envio externo. |
| **F7 — Testes, integrações e homologação** | Só depois dos ajustes e cenários internos. Primeiro testes internos; depois homologação de integrações externas, validação visual e aceite dos 74 itens. | Evidências por requisito, build aprovado antes de commit/deploy e resultado explícito de cada integração. |

### Padrão obrigatório das telas durante F1–F6

- Referências: `docs/Padrão de Tabelas.md`, seção “Como adicionar uma nova tabela” de `docs/ENTREGA_PADRAO_TABELAS.md` e a tela existente `src/app/app-domain/rh/servidores/page.tsx`.
- Reutilizar `OperationalListFrame`, `OperationalTable`, `OperationalFilters`, paginação com `OPERATIONAL_PAGE_SIZE` (20) e `OperationalTablePanel` em contextos de edição/seleção.
- Manter preferência de colunas estável, permissões e ações, texto integral disponível, faixa compacta, header e menu recolhido para ícones. Desktop/notebook sem rolagem livre nas listagens; tablet/celular seguem a exceção documentada.
- Preservar rascunhos, seleções, campos e payload completo entre páginas/painéis; não aninhar formulários.
- Documentos, diagramas e calendários mantêm seu formato semântico. Exportações contêm o conjunto filtrado integral, independentemente das 20 linhas da tela.

## 4. Política de população fictícia

### 4.1 Estimativa para todos os cadastros

Executor: `scripts/estimate-rh-salaries-2026.ts`. Identidade: `RH_ESTIMATIVAS_2026_V1`.
Manifesto e progresso: `docs/RH_ESTIMATIVAS_SALARIAIS_2026.json`.

1. Ler **todos** os servidores, incluindo inativos se existirem. Na base observada, os 198 eram ativos.
2. Resolver salário-base mensal e jornada por um mapa explícito de cargo. Cargo desconhecido exige incluir sua regra antes de gravar.
3. Criar cinco referências fictícias com acréscimos de **0%, 2%, 4%, 6% e 8%**, atribuídas de forma estável pelo identificador do cadastro. Não atribuir essa variação a antiguidade, desempenho, ATS ou progressão legal. Secretários usam uma única base fictícia.
4. Estimar a jornada semanal por cargo. Usar divisor mensal **semanal × 5** somente como convenção demonstrativa: 20h → 100h; 30h → 150h; 36h → 180h; 40h → 200h. Horas efetivamente trabalhadas no mês são apuradas pelo calendário e pela escala, não igualadas automaticamente ao divisor.
5. Atualizar salário/jornada no cadastro e criar revisão do contrato canônico **na mesma transação por servidor**, com vigência em 01/11/2026. Preservar admissão, cargo, lotação e os demais dados do contrato.
6. Preservar valores anteriores no manifesto e na origem da estimativa. Reexecução deve reconhecer a aplicação anterior e recusar divergências posteriores feitas pelo operador.
7. Não reescrever recibos fechados. Se for necessário demonstrar agosto–outubro com a nova escala salarial, planejar uma versão separada e a reversão formal da demonstração anterior, preservando os registros de cancelamento. Não chamar recibos antigos de “recalculados”.

### 4.2 Bases mensais fictícias por cargo

Valores **antes** da variação de referência; não são pisos legais ou pesquisa salarial oficial. O manifesto contém a atribuição individual e o resumo das 39 denominações.

| Cargo/grupo | Base mensal fictícia | Jornada semanal | Divisor mensal demonstrativo |
| --- | ---: | ---: | ---: |
| Professor de Educação Básica | R$ 3.600,00 | 30h | 150h |
| Motorista | R$ 2.800,00 | 40h | 200h |
| Assistente Social | R$ 4.350,00 | 30h | 150h |
| Enfermeiro | R$ 4.750,00 | 36h | 180h |
| Técnico de Enfermagem | R$ 3.325,00 | 36h | 180h |
| Médico de Família | R$ 14.800,00 | 20h | 100h |
| Farmacêutico | R$ 5.200,00 | 40h | 200h |
| Psicólogo | R$ 4.650,00 | 30h | 150h |
| Agente Comunitário de Saúde / Combate às Endemias | R$ 3.242,00 | 40h | 200h |
| Auxiliar Administrativo | R$ 2.850,00 | 40h | 200h |
| Analista Administrativo | R$ 4.200,00 | 40h | 200h |
| Contador | R$ 6.200,00 | 40h | 200h |
| Fiscal de Tributos | R$ 3.850,00 | 40h | 200h |
| Técnico de Informática | R$ 3.680,00 | 40h | 200h |
| Auxiliar de Serviços Gerais | R$ 1.800,00 | 40h | 200h |
| Merendeiro | R$ 1.850,00 | 40h | 200h |
| Eletricista | R$ 2.790,00 | 40h | 200h |
| Pedreiro | R$ 2.490,00 | 40h | 200h |
| Operador de Máquinas | R$ 3.120,00 | 40h | 200h |
| Agente de Segurança | R$ 2.600,00 | 40h | 200h |
| Engenheiro Civil | R$ 7.800,00 | 30h | 150h |
| Analista Ambiental | R$ 4.800,00 | 40h | 200h |
| Técnico Agrícola | R$ 3.290,00 | 40h | 200h |
| Profissional de Educação Física | R$ 3.890,00 | 30h | 150h |
| Técnico em Cultura | R$ 3.200,00 | 40h | 200h |
| Diretor Administrativo da Câmara | R$ 6.500,00 | 40h | 200h |
| Secretários municipais — 12 denominações observadas | R$ 9.500,00 | 40h de referência | 200h de referência |

Secretários não recebem controle de ponto ou horas extras automaticamente por essa referência. Escalas especiais, jornada docente/atividade extraclasse e regras específicas do vínculo são parametrizações da F2.

**Aplicação concluída em 02/11:** o manifesto registra `applied: 198`. A conferência agregada posterior encontrou **198 contratos com a estimativa**, **198 cadastros coerentes com os salários/divisores dos contratos** e **nenhum salário zerado ou negativo**. Menor valor individual **R$ 1.800,00**, maior **R$ 15.984,00**, soma de salários-base mensais **R$ 897.419,70**. A soma não é líquido da folha nem despesa total com encargos. Essa conferência de população não substitui a homologação da F7.

### 4.3 Cenários adicionais a popular ao longo do plano

| Conjunto | População prevista | Origem/regras |
| --- | --- | --- |
| Cadastro/contrato/salário | Todos os cadastros | Estimativa individual rastreável; preservar identidades. |
| Ponto e folha histórica | Agosto, setembro e outubro/2026 | Retomar a versão anterior de forma idempotente; marcar sintético e registrar as limitações de jornada dessa versão. |
| Nova base de salário/jornada | Vigência 01/11/2026 | Revisão contratual; simulações posteriores respeitam a nova base. Não popular futuro como presença efetiva. |
| Frequência variada | Amostra identificada de cargos/lotação | Jornada regular, falta, licença, férias, feriado, extra e banco; impedir dupla remuneração extra/banco e sobreposição de afastamentos. |
| Benefícios/descontos | Amostras de adesão fictícia | VT, alimentação, dependente, consignação e pensão com vínculo e memória próprios; RGPS/IRRF conforme o pacote demonstrativo. |
| Ciclo funcional | Amostras temporais próprias | Admissão, cessão, comissão, término, ocorrência e averbação; não inventar tempo anterior para os 198 indistintamente. |
| Capacitação/graduação | Amostras completas por curso/servidor | Instituição e cursos fictícios, datas, carga horária, situação e conclusão. |
| Previdência/aposentadoria/vitalícia | Casos demonstrativos separados | Regras versionadas, beneficiários e vínculos próprios; não usar pensão alimentícia como substituto de vitalícia. |
| Rateio contábil | Todos os vínculos incluídos nos relatórios contábeis | Dimensões demonstrativas identificadas, percentuais e vigências; distinguir vínculo orçamentário de transferência real à contabilidade. |
| Banco e Portal individual | Preparação interna, conexão na F7 | Dados bancários e contas de acesso de homologação tratados na etapa final; não criar usuários/senhas nem enviar ordens automaticamente pela carga salarial. |

## 5. Matriz de ajustes dos 74 itens

**E:** emissão específica identificada; **P:** parcial; **N:** emissão não localizada.
“Pronto” abaixo é um critério para implementar e depois homologar na F7. Nenhuma linha muda para homologada apenas por constar deste plano.

| Nº | Item / estado inicial | Fase | Ajuste e critério de conclusão |
| --- | --- | --- | --- |
| 1 | Retorno de férias — P | F3 | Emitir previsão por data de retorno, situação, servidor e lotação; tratar alterações e cancelamentos da programação. |
| 2 | Término de cargo em comissão — P | F3 | Vincular ato de nomeação/vigência e emitir vencimentos por janela, distinguindo cargo efetivo de comissão. |
| 3 | Término de contrato — P | F3 | Acrescentar janela de vencimento, dias restantes, prorrogações e situação, preservando histórico. |
| 4 | Treinamento por curso — P | F4 | Consolidar turma, participantes, período, carga horária e conclusão por curso. |
| 5 | Treinamento por funcionário — P | F4 | Emitir histórico por titular com curso, instituição, participação, carga horária e certificado. |
| 6 | Relação de adicionais de tempo — P | F4 | Criar relação coletiva de ATS com base, tempo computado, percentual, valor e origem; compartilhar cálculo com item 50. |
| 7 | Aniversariantes do mês — E | F3 | Completar filtros e emissão gerencial; respeitar a política de exposição ao publicar no Portal. |
| 8 | Dias afastados — P | F4 | Consolidar dias por servidor/causa/período, com recorte nas bordas e sem dupla contagem em sobreposições. |
| 9 | Aquisição mensal de VT — N | F4 | Calcular previsão por adesão, itinerário, tarifa vigente, dias de uso e afastamentos; separar quantidade e custo. |
| 10 | Conferência de VT — N | F4 | Confrontar previsão, aquisição, concessão, desconto e ajustes; demonstrar diferenças por competência. |
| 11 | Ocupação de cargos/funções — P | F3 | Emitir vagas autorizadas, ocupadas, livres e funções, com referência ao quadro e à vigência. |
| 12 | Agências bancárias — P | F3 | Emitir catálogo RH a partir do cadastro compartilhado, com banco, agência e situação. |
| 13 | Causas de afastamento — P | F4 | Consolidar catálogo de motivos e sua utilização; distinguir causa, espécie e efeito funcional. |
| 14 | Classificações funcionais — P | F3 | Emitir classificação por cargo, regime, natureza e vigência; explicitar classificação ausente. |
| 15 | Mensagens — P | F3 | Relacionar mensagens por vigência, destino, tipo de folha e situação; manter texto usado no recibo histórico. |
| 16 | Verbas e incidências — P | F3 | Emitir rubricas com tipo, fórmula/base, incidências, vigência e fundamento parametrizado. |
| 17 | Cargos e salários — P | F3 | Emitir cargo, referência, jornada/divisor e faixa salarial por vigência, identificando estimativas. |
| 18 | Valores consignáveis — E | F2 | Preservar margem por pessoa, obrigatórios, utilizado, disponível e excesso; compartilhar memória com folha/Portal. |
| 19 | Bancos — P | F3 | Emitir catálogo a partir do cadastro central, sem duplicar bancos no RH. |
| 20 | CBO — P | F3 | Relacionar cargos aos códigos do catálogo compartilhado e emitir mapeamentos/pendências. |
| 21 | Cursos de graduação — N | F4 | Completar catálogo de cursos/instituições e modalidades; escolaridade isolada não atende. |
| 22 | Treinamentos por cargo/função — P | F4 | Agrupar participantes e conclusões pelo cargo/função vigente no evento, mantendo o vínculo temporal. |
| 23 | Horários de trabalho — P | F2 | Emitir escala, dias, intervalos, vigências, jornada semanal e divisor mensal em campos distintos. |
| 24 | Índices financeiros/moedas auxiliares — N | F3 | Inventariar catálogo central e criar apenas o histórico necessário de índice/cotação, fonte, vigência e aplicação. |
| 25 | Motivos de desligamento — P | F4 | Emitir catálogo e utilização por desligamento, data e vínculo; manter códigos internos/externos distintos. |
| 26 | Parâmetros da previdência — P | F2 | Emitir regime, faixas, teto, alíquotas do servidor/patronal, vigência e fundamento; RGPS separado de RPPS. |
| 27 | Etiquetas de aniversariantes — N | F6 | Criar modelo com tamanho, margens, quantidade por página e seleção por mês; aplicar política de exposição. |
| 28 | Etiquetas de funcionários — N | F6 | Criar modelo configurável com campos selecionáveis e impressão do conjunto filtrado. |
| 29 | Etiqueta de cartão de ponto — N | F6 | Diagramar matrícula, nome, período, setor e jornada no formato solicitado. |
| 30 | Cartão de ponto 132 colunas — N | F6 | Criar exportação monoespaçada própria, largura fixa de 132 colunas, acentos/codificação e quebras controladas. |
| 31 | Evolução global da folha — P | F3 | Criar série por competência/tipo com bruto, descontos, líquido, encargos, diferença absoluta e percentual. |
| 32 | Evolução por funcionário — P | F3 | Criar série por pessoa/vínculo, rubricas e variação; distinguir ausência de cálculo de valor zero. |
| 33 | Evolução por unidade — P | F3 | Agrupar competências pela unidade histórica, com totalizadores coerentes com o global. |
| 34 | Expectativa de aposentadoria — N | F4 | Modelar regras/transições versionadas, tempo reconhecido, idade e lacunas; emitir projeção explicada, sem concessão automática. |
| 35 | Ficha anual para IRRF — P | F3 | Separar competência de ano de pagamento, tributáveis/isentos/exclusivos e retenções; preparar informe. Homologação fiscal oficial na F7. |
| 36 | Ficha resumida por verba — P | F3 | Consolidar ano/servidor/verba com totalizadores e distinção provento/desconto. |
| 37 | Assinatura do pessoal ativo — P | F6 | Emitir relação por setor/vigência com campo de assinatura e identificação institucional. |
| 38 | Folha de frequência — P | F2 | Criar mapa coletivo por setor/período com presenças, faltas, afastamentos e totais. |
| 39 | Folha de ponto — E | F2 | Completar escala/intervalos, ocorrências, totais e conferência; decidir evolução do modelo para quatro batidas antes de prometer esse formato. |
| 40 | Histórico completo — P | F4 | Unificar linha temporal de contratos, atos, lotações, direitos, ocorrências, capacitação e publicações, com origem e acesso restrito. |
| 41 | Admissões/cedências — P | F4 | Criar emissão de ingresso/cessão com origem/destino, período, ônus e ato, conforme dados estruturados. |
| 42 | Ficha cadastral resumida — E | F3 | Preservar emissão e completar identificação, cargo, lotação e jornada sem confundir resumo com histórico integral. |
| 43 | Cadastro por dotação — E | F3 | Preservar vínculo explícito e vigência; listar pendências sem atribuição presumida. |
| 44 | Cadastro geral — E | F3 | Preservar emissão integral filtrada e consistência com o cadastro central. |
| 45 | Cadastro por local — E | F3 | Usar local de trabalho explícito e distinguir unidade/lotação/local. |
| 46 | Cadastro por lotação — E | F3 | Agrupar pela lotação vigente na data de referência, mantendo os vínculos anteriores. |
| 47 | Experiência/tempo de contribuição — P | F4 | Distinguir experiência declarada, averbação reconhecida e contribuição comprovada; emitir fontes e períodos sem sobreposição. |
| 48 | Ocorrências/anotações — P | F4 | Criar emissão por tipo/período/servidor com origem, situação e histórico das correções. |
| 49 | Verbas fixas/consignados — P | F4 | Emitir movimentos por origem, vigência e natureza fixa/variável, parcelas, credor e saldo quando aplicável. |
| 50 | Adicionais por tempo — P | F4 | Reutilizar motor/memória do item 6, mantendo os dois identificadores de aceite. |
| 51 | Pensão alimentícia — E | F4 | Preservar cálculo e emissão com beneficiário, processo, base e valor; distinguir desconto de repasse. |
| 52 | Pensão vitalícia — N | F4 | Modelar instituidor, beneficiário, direito, cotas, duração e cessação; emissão específica independente da alimentícia. |
| 53 | Efetivos em comissão — P | F4 | Relacionar vínculo efetivo e nomeação comissionada da mesma pessoa, com período e opção remuneratória. |
| 54 | Contratos de trabalho — E | F2 | Preservar histórico/revisões; mostrar salário estimado, vigência e unidades de jornada corretamente. |
| 55 | Convênios/contas crédito — P | F6 | Emitir convênio, titular, conta, vigência e finalidade; adaptar ao banco somente na F7. |
| 56 | Convênios/contas débito — P | F6 | Emitir autorizações, convênio, conta e vigência; não assumir autorização de débito por existir consignação. |
| 57 | Cursos complementares — P | F4 | Consolidar conclusão, instituição, carga horária e comprovante por curso/servidor. |
| 58 | Graduação dos funcionários — N | F4 | Relacionar pessoa, curso, instituição, datas, situação e conclusão com histórico; não inferir graduação pela escolaridade. |
| 59 | Dependentes — P | F4 | Criar relação coletiva com parentesco, idade, vigência e elegibilidade por benefício/IRRF, resguardando acesso. |
| 60 | Depósito/ordem de pagamento — P | F6 | Preparar emissão interna e arquivo fictício conciliado à folha; numeração, banco e retorno oficial na F7. |
| 61 | Folha de crédito/convênios — P | F6 | Preparar relação por banco/convênio/conta e total; leiaute/remessa e aceite bancário na F7. |
| 62 | Consignados parametrizáveis — E | F2 | Preservar parâmetros e memória por pessoa; completar filtros e tratamento de excesso/parcelas com retorno bancário na F7. |
| 63 | Movimentação de pessoal — P | F4 | Emitir eventos por tipo/data/origem/destino com quantitativos e histórico de vigência. |
| 64 | Eventos variáveis — P | F2 | Criar planilha de lançamento/conferência com competência, rubrica, quantidade/valor, origem, erros por linha e idempotência. |
| 65 | Contábil sintético por lotação — P | F5 | Agrupar apropriação por lotação com totalizadores configuráveis e soma conciliável à folha. |
| 66 | Contábil analítico por dotação — P | F5 | Detalhar pessoa/vínculo/rubrica/encargo/rateio por dotação; não usar cadastro por dotação como substituto. |
| 67 | Contábil dotação/fonte — N | F5 | Criar visão com as duas dimensões e vigência do rateio, sem repetir o valor integral em cada fonte. |
| 68 | Dotação/fonte/tipo de despesa — N | F5 | Acrescentar tipo/natureza da despesa e política de classificação das rubricas/encargos. |
| 69 | Contábil por fonte — N | F5 | Consolidar a mesma apropriação por fonte, com pendências de classificação explícitas. |
| 70 | Contábil analítico por lotação — P | F5 | Detalhar vínculo/rubrica/encargo e subtotais por lotação com política de totalizadores. |
| 71 | Dotação/local de trabalho — P | F5 | Cruzar dotação e local histórico sobre a mesma base apropriada, com total conciliado. |
| 72 | Lotação/dotação — P | F5 | Emitir visão cruzada de lotação/dotação e preservar os mesmos totalizadores dos demais modelos. |
| 73 | Contagem de tempo — P | F4 | Emitir períodos, interrupções, averbações, sobreposições e regras; separar tempo municipal, ATS e previdenciário. |
| 74 | Dimensionamento de pessoal — P | F3 | Comparar vagas, ocupação, jornadas e demanda por unidade; registrar premissas em vez de usar só quantidade de pessoas. |

## 6. Contratos técnicos comuns aos ajustes

- **Relatórios:** consulta e exportação devem usar o mesmo escopo/filtro, ordenação estável, data de referência, competência, regime, cargo, unidade e lotação quando pertinentes. Totais são calculados sobre o conjunto completo; PDF multipágina com cabeçalho repetido e valores monetários decimais.
- **Ponto:** calendário por vínculo, fuso local, intervalo, jornada diária e divisor mensal distintos. O modelo atual só guarda entrada/saída; quatro marcações exigem decisão de modelo/migração. Nunca apresentar batidas intermediárias inventadas como registradas.
- **Folha/recibo:** preservar cálculo canônico, travas, revisões, snapshot, conciliação, fechamento e liberação. Completar cabeçalho institucional, referência por rubrica, bases, totais, mensagens e identificação de demonstração.
- **Portal:** uma política de identidade por titular para telas, relatórios e downloads. Prévia administrativa precisa ser explícita e não substituir vínculo individual autenticado. Preparar a política na F2, exercer o login real na F7.
- **Benefícios e previdência:** regras por vigência, origem e vínculo. Dados fictícios de adesão/processo/averbação somente nos casos preparados; nenhuma rubrica universal de consignação, pensão, RPPS ou plano de saúde.
- **Contabilidade:** dimensões e rateio com vigência, classificação de rubricas, arredondamento e totalizadores versionados. Percentuais devem fechar 100% por origem e resíduos monetários devem ser distribuídos de forma determinística. Separar salários, descontos, encargos e provisões.
- **Novas estruturas físicas:** revisar primeiro os catálogos/repositórios existentes de graduação, formação, pensões, tempo, índices, rateios e ponto. Registrar proposta, consumidores, migração e backfill por necessidade; não abrir uma tabela por relatório.

## 7. Etapa final — testes, integrações externas e aceite

### 7.1 Testes internos após F1–F6

1. Cadastro: cobertura de todos os servidores, vínculo à pessoa, consistência de cargo/lotação, salário positivo, antes/depois, vigência e unidades de jornada.
2. Temporalidade: revisão de novembro não muda agosto; contratos e afastamentos nas bordas do período; correções sem sobreposição; reexecução da população sem duplicações.
3. Ponto: calendário, dias úteis, feriados, intervalos, faltas, férias/licenças, extras e banco sem dupla contabilização.
4. Folha: fórmulas, RGPS/IRRF do pacote, benefícios dos cenários, pensões, consignações, líquido, encargos e arredondamento; fechamento, cancelamento e publicação pelas rotinas canônicas.
5. Conciliação: cálculos = demonstrativos = itens projetados = totais da folha; contabilidade concilia a mesma origem em todas as oito visões.
6. Relatórios: executar os **74 IDs**, inclusive 6/50 separadamente; verificar filtros, vazios, exportação integral, totais, acentos, PDF longo, etiquetas e 132 colunas.
7. Portal: sessão individual vinculada, visualização dos três meses disponíveis, download dos próprios documentos e negação de acesso a outro titular.
8. Interface: RH, ficha funcional e Portal no navegador autenticado; 20 registros por página, conteúdo integral, edição/seleção preservadas e política de dispositivos/zoom.
9. Operação: concorrência, timeout, retomada, duplicação de requisição e falha parcial da carga/cálculo sem driblar validações.
10. Qualidade de código: lint/tipos dos arquivos afetados, testes de domínio apropriados e `npm run build` antes de commit/deploy. Os 26 testes e o build aprovados na análise anterior são evidência histórica, não aprovação dos ajustes futuros deste plano.

### 7.2 Integrações externas somente no final

| Integração | Preparação interna anterior | Execução/homologação na F7 |
| --- | --- | --- |
| Identidade individual do Portal | Vínculo de pessoa/servidor, autorização e convites | Contas de homologação no provedor configurado, login, recuperação e sessão por titular. |
| Bancos e convênios | Contrato de adaptador, arquivos fictícios, contas demonstrativas e conciliação | Credenciais/leiautes do banco, envio de homologação, rejeições/retornos e vínculo ao lote; arquivo CSV genérico não vale como homologação. |
| eSocial/obrigações fiscais | Mapeamentos, eventos e arquivos locais | Ambiente de homologação, certificados, transmissão/retorno e protocolos quando exigidos pelo requisito. |
| RPPS/aposentadoria/informe fiscal | Motor parametrizável, memória e cenários demonstrativos | Parametrização oficial aplicável, regras e validação técnica/legal do município; demonstrativo fictício não é documento oficial. |
| Financeiro/contabilidade externa | Apropriação interna versionada e contratos de integração | Transmissão/retorno se houver sistema externo; registrar conciliação e estorno, sem gerar pagamento real pela população. |

### 7.3 Critério de encerramento

Entregar matriz com **implementado / testado internamente / validado visualmente / integrado externamente / homologado**, evidência por item e pendências explícitas. “Não se aplica” exige decisão registrada, não substitui um relatório ausente. Publicar somente após build aprovado, com a identidade GitHub do projeto e confirmação do deploy.

## 8. Controle de execução desta entrega

| Entrega | Situação |
| --- | --- |
| Plano com rastreabilidade dos 74 itens | Criado neste documento. |
| Mapa salarial/jornadas dos 198 cadastros | Concluído, cobrindo os 39 cargos; nenhum cargo sem critério. |
| População das estimativas no banco | **Concluída: 198/198**; manifesto individual e conferência agregada de cadastro/contrato registrados. Vigência 01/11/2026. |
| Histórico agosto–outubro da versão anterior | **Concluído: 198 demonstrativos fechados/publicados em cada mês, 594 no total**; limitações da primeira jornada histórica preservadas e documentadas. |
| Implementação das lacunas dos 74 itens | Central de relatórios e primeira implementação F2–F6 preparadas no código local; limitações e complementos ainda necessários em `EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md` e no catálogo. Não homologada. |
| Testes, integrações externas e homologação deste plano | F7 interna iniciada após preparação das emissões: 74 consultas/CSV e conciliação dos três meses aprovadas; visual/integrações/homologação ainda pendentes. |
| Migração/schema | Nenhuma na etapa salarial. Na execução posterior, **`20261102143000_hr_supplementary_references` aplicada** pelo executor oficial; amplia categorias/índices da referência existente, separada das tabelas visuais. |
| Cenários e escalas | Rateios para os 198, amostras de benefícios/formação/previdência e 186 escalas explícitas; manifestos próprios, sem pagamento/conta de acesso. |

Registro posterior de execução e pendências: [EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md](EXECUCAO_AJUSTES_RH_FOLHA_PORTAL_2026.md). Esse registro não altera retroativamente a classificação inicial dos 74 itens nem declara F2–F6 integralmente encerradas.

### Comandos da população salarial

```powershell
# Prévia: somente leitura
node --conditions=react-server --import tsx scripts/estimate-rh-salaries-2026.ts

# Aplicação: cadastro + revisão contratual por servidor; retoma por identidade estável
node --conditions=react-server --import tsx scripts/estimate-rh-salaries-2026.ts --apply
```

A população salarial não ativa contas individuais, não transmite arquivos e não recalcula recibos fechados. A evidência de aplicação é o manifesto, não a execução de um teste de homologação.
