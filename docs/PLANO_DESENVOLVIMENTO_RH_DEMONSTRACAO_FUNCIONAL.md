# Plano de desenvolvimento — RH, Folha e Portal do Servidor

**Referência:** 02/11/2026. **Objetivo:** completar os 85 itens classificados como **NÃO ATENDE** na análise de 219 requisitos apresentada na conversa.

**Natureza desta entrega:** planejamento apoiado em inspeção de código e documentação. Nenhuma rotina de negócio, população, migração ou integração foi executada para elaborar este plano. Os critérios abaixo são resultados a entregar, não evidências de execução.

## 1. Resultado esperado e critério de atendimento

Um item estará preparado para demonstração funcional quando houver um caminho acessível pela interface, com os campos necessários e uma ação ligada ao serviço real, capaz de produzir o resultado solicitado a partir dos dados cadastrados.

- **Relatório:** selecionar modalidade e filtros, consultar registros e emitir o conjunto filtrado integral.
- **Cadastro:** incluir, consultar e alterar os campos exigidos, mantendo vínculos e histórico.
- **Automatização:** aplicar a regra na data/competência de referência e mostrar seus efeitos no cadastro, no direito e/ou no cálculo. Um lançamento manual do valor final não substitui a automatização.
- **Arquivo específico:** selecionar destinatário, convênio e versão do layout; gerar/importar o formato correspondente, com totais e inconsistências. Trocar o nome de um CSV genérico não atende.
- **Histórico:** consultar a situação vigente na data solicitada e as alterações identificadas, sem substituir o passado pelo cadastro atual.

O critério do solicitante dispensa uma execução prévia de cada rotina nesta etapa de análise. Na implementação, a existência do botão deve corresponder a um fluxo completo; a preparação dos cenários e a conferência funcional ficam ao final dos respectivos blocos, conforme o sequenciamento acordado.

## 2. Base existente que deve ser aproveitada

- 198 servidores, com pessoa central, contratos, revisões e registros integrados.
- 19 execuções fechadas/publicadas e 3.414 demonstrativos, incluindo as competências mensais de 2026 e dezembro/2025 e folhas especiais.
- 198 comprovantes anuais de 2025. Janeiro a novembro/2025 constituem histórico de abertura de rendimentos, não onze folhas operacionais mensais.
- Catálogo de 74 relatórios com identificadores estáveis; serviços de relatórios, filtros, PDF/XLSX/CSV e impressão especial já disponíveis.
- Motores de cálculo, direitos, férias, ATS, consignações, pensões, provisões e integração financeira parcialmente reutilizáveis para os novos requisitos.

### Descobertas que afetam o desenvolvimento

| Base inspecionada | Consequência no plano |
| --- | --- |
| `report-service.ts` possui filtros limitados; TXT é restrito ao cartão 132 colunas | Criar contrato comum de filtros e renderizadores próprios para contracheques e cadastro financeiro, mantendo o formato matricial existente. |
| `accounting-reports.ts` considera somente duas modalidades como analíticas e reúne encargos em `ENCARGOS_PATRONAIS` | Desacoplar dimensões de nível analítico/sintético e preservar componentes de encargos, inclusive FGTS. |
| `Dependent` possui indicadores cadastrais, sem histórico próprio de elegibilidade | Acrescentar vigências e motivos de habilitação/baixa por benefício, preservando as competências anteriores. |
| `Leave` possui período, tipo e situação, sem estrutura completa de cessão | Criar o domínio de cessões e políticas de efeitos dos afastamentos. |
| `AttendanceRecord` guarda entrada e saída | Integrar o calendário ao espelho sem inventar marcações intermediárias. Quatro batidas não são condição nova deste plano. |
| `employment-lifecycle.ts` limita o fluxo existente a certos desligamentos/reintegrações e ao fim da competência | Desenvolver ciclo funcional com efeitos intramês, comissão, retorno e desligamentos tipados. |
| ATS possui apuração acionada por contrato/competência | Orquestrar vencimentos automaticamente, integrar faltas e admitir múltiplos direitos sem duplicação. |
| Exportador de obrigações tem conjunto restrito de campos e declara arquivo não oficial | Acrescentar adaptadores e conjuntos de dados específicos; não apenas cadastrar novos nomes de obrigações. |

## 3. Organização dos 85 itens

Os números da coluna **Itens** são os da lista de 219 requisitos da conversa. Não são novos códigos do catálogo de relatórios.

| Pacote | Entrega | Itens principais | Quantidade | Porte relativo |
| --- | --- | --- | ---: | --- |
| P01 | Catálogo ampliado, filtros, formatos e relatórios de parâmetros | 99, 105, 123, 136, 166–173, 188 | 13 | Médio |
| P02 | Cadastro temporal, ficha completa e alterações | 87, 98, 122, 190, 191, 194, 196, 199, 202 | 9 | Alto |
| P03 | Relatórios financeiros e componentes de encargos | 93, 100, 103, 107, 144, 153, 155, 156, 185, 211, 213, 215, 217 | 13 | Médio/alto |
| P04 | Cessões, comissões e cadastros funcionais especializados | 41, 77, 90, 116, 137, 139, 183, 184, 192 | 9 | Alto |
| P05 | Direitos, afastamentos, férias e calendário | 79, 83, 84, 85, 121, 125, 143, 163, 178, 189 | 10 | Alto |
| P06 | Dependentes, categorias de folha e cálculos legais | 81, 108, 111, 112, 124, 128, 140 | 7 | Muito alto |
| P07 | Pensões e consignações | 82, 109, 133, 152, 209 | 5 | Alto |
| P08 | Tempo de serviço, aposentadoria e cálculo atuarial | 89, 95, 157, 158, 164 | 5 | Muito alto |
| P09 | Avaliações e histórico de desempenho | 162, 195 | 2 | Médio |
| P10 | Obrigações governamentais e contribuição sindical | 104, 113, 131, 179, 182 | 5 | Alto; depende de especificações |
| P11 | Bancos e plataformas de consignação | 135, 138, 141, 180, 181 | 5 | Alto; depende de especificações |
| P12 | Acesso por lotação e evento | 117 | 1 | Alto; transversal |
| P13 | Histórico funcional completo e roteiro integrado | 40 | 1 | Médio; depende das demais origens |
| **Total** | | | **85** | |

O porte é comparativo. Não representa prazo contratado. Os pacotes de arquivo variam conforme quantidade de versões, bancos, tribunais e provedores exigidos.

## 4. Plano detalhado por pacote

### P01 — Catálogo, filtros e emissões comuns

**Aproveitar:** `report-catalog.ts`, `report-service.ts`, `operational-reports.ts`, `special-report-layouts.ts`, `/rh/relatorios` e a consulta de auditoria.

**Implementação compartilhada:**

1. Separar o identificador estável da modalidade do número do requisito. Manter os códigos existentes 1–74 e cadastrar as novas modalidades sem renumerá-los.
2. Substituir textos fixos de “74 itens” por apresentação compatível com o catálogo ampliado.
3. Centralizar filtros, ordenação e resolução histórica. Reutilizar os mesmos filtros em prévia, totais e exportação.
4. Expor seletores de cadastros com rótulos compreensíveis, sem exigir digitação de IDs ou JSON para os fluxos principais.
5. Acrescentar renderizadores TXT específicos, com codificação, delimitador, escapes, quebras e versão documentados.
6. Relatórios de parâmetros devem ler as regras realmente usadas pelo cálculo, com pacote, versão, vigência e fundamento.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 99 | Ordenação alfabética/numérica; intervalos de matrícula, vínculo, função, lotação, local e dotação; funcionário; competências/anos e respectivos intervalos; multisseleção de classificações; tipo de folha | Aplicar combinações de filtros e emitir os mesmos registros exibidos na consulta, em sua totalidade. |
| 105 | TXT de contracheques por competência/tipo/servidor, com rubricas, bases e totais | Selecionar folha e baixar o arquivo de contracheques. |
| 123 | Exportação/impresso da auditoria com usuário, ação, entidade, objeto e período | Filtrar a consulta de auditoria e emitir o resultado integral. |
| 136 | TXT delimitado por ponto e vírgula com identificação cadastral e valores financeiros da referência | Escolher referência e conjunto de servidores e baixar o arquivo com cabeçalho documentado. |
| 166 | Relatório dos parâmetros de FGTS por vigência | Abrir a modalidade e emitir alíquotas, bases, incidências e fundamento. |
| 167 | Relatório dos parâmetros de 13º | Emitir critérios de avos, adiantamento, quitação, médias e deduções. |
| 168 | Relatório dos parâmetros de contabilização | Emitir rubrica/encargo, classificação, dotação, fonte, natureza, percentual e vigência. |
| 169 | Relatório dos parâmetros de contagem de tempo | Emitir inclusão/exclusão de períodos e critérios por finalidade. |
| 170 | Relatório dos parâmetros de exclusão de dependentes | Emitir limites, exceções, documentos e vigência por benefício. |
| 171 | Resumo do plano de cargos/funções | Emitir estrutura, referências, níveis, jornadas e faixas salariais do plano vigente. |
| 172 | Cadastro e relatório de serviços bancários por convênio | Consultar/emitir serviço, banco, finalidade, versão e vigência. |
| 173 | Cadastro temporal e relatório dos valores de horas-aula | Selecionar cargo/referência/jornada e emitir valores; vincular rubricas que os consumam quando aplicável. |
| 188 | Modelo específico de etiqueta contratual para CTPS | Escolher contrato e imprimir os campos e dimensões do modelo. |

**Dependências:** os relatórios podem ser acrescentados desde o início; 168–170 devem ser concluídos com as regras efetivas de P03/P05/P06. O cadastro de serviço bancário deve compartilhar a configuração de P11.

### P02 — Cadastro histórico e ficha completa

**Aproveitar:** `Person`, `Employee`, contratos/revisões, recadastramento, `personnel-record-reports.ts`, `functional-history-report.ts`, Pasta Funcional e modelos de documentos.

**Implementação compartilhada:**

- Registrar alterações cadastrais com data de efeito, data de registro, autor, origem e campos anteriores/novos.
- Resolver os dados pessoais e funcionais vigentes na referência. Não usar o telefone/endereço atual para afirmar qual era o dado de um mês anterior.
- Preservar uma fotografia cadastral da competência ao encerrá-la, sem criar uma cópia manual de todos os cadastros a cada mês.
- Para períodos anteriores sem evidência, indicar a ausência e permitir abertura histórica documentada; não inventar diferenças retroativas.
- Criar ficha completa a partir das fontes canônicas, com seções de identificação, documentos, endereço, contatos, formação, vínculos, dependentes e dados funcionais.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 87 | Consulta cadastral/financeira mensal com comparação de referências | Escolher duas referências e visualizar diferenças preservadas. |
| 98 | Relação de alterações por servidor e mês, campo, antes/depois e autor | Alterar um dado em competência aberta e emitir a relação do período. |
| 122 | Relatório básico com matrícula, nome, admissão, nascimento, CPF, RG, PIS/PASEP, telefone, e-mail e endereço | Emitir todos os campos exigidos a partir dos respectivos cadastros. |
| 190 | Ficha cadastral completa | Selecionar titular e imprimir as seções completas. |
| 191 | Versão de validação da ficha completa | Emitir ficha com data de referência, campos para conferência e identificação do responsável. |
| 194 | Histórico salarial com valor anterior/novo, percentual, ato e vigência | Emitir uma sequência de reajustes do mesmo contrato. |
| 196 | Histórico de cargos/funções com início/fim e natureza do movimento | Emitir contratos, promoções e comissões em ordem temporal. |
| 199 | Histórico das dotações e percentuais de rateio | Emitir dotação/fonte/natureza por vigência sem reconstruir o passado pelo rateio atual. |
| 202 | Histórico dos locais de trabalho | Emitir mudanças de local com origem, destino, ato e período. |

**Dependências:** 196 recebe os movimentos tipados de P04/P05; 199 utiliza a classificação temporal de P03.

### P03 — Financeiro, provisões e rateio dos encargos

**Aproveitar:** `accounting-reports.ts`, `payroll-provisions.ts`, `provision-accounting.ts`, `remuneration-average.ts` e os snapshots de folha.

**Implementação compartilhada:**

1. Definir dimensões independentes: servidor/vínculo, lotação, local, dotação, fonte, natureza, classificação funcional e rubrica/componente.
2. Configurar separadamente visão analítica/sintética e totalizadores. Não inferir o nível de detalhe apenas pelo nome da modalidade.
3. Separar FGTS, contribuição patronal previdenciária e demais encargos antes do rateio. Manter conciliação com o total patronal e distribuição determinística de centavos.
4. Versionar a classificação/rateio consumido na emissão para permitir reprodução posterior.
5. Definir média salarial de grupo, universo incluído, base remuneratória, percentual/valor de afastamento da média e tratamento de ausência de cálculo. Não reutilizar a média previdenciária individual como média do cargo.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 93 | Comparação salarial por cargo/função | Emitir servidores abaixo/acima da média, referência, média e diferença. |
| 100 | Provisões analíticas com saldo inicial, apropriação, baixa, estorno e saldo final | Abrir uma competência e emitir a movimentação conciliada por servidor/tipo. |
| 103 | Analítico funcionário/lotação/dotação | Emitir as três dimensões e as verbas na mesma modalidade. |
| 107 | Evolução por natureza, global/unidade, entre dois períodos selecionados | Mostrar período-base, período comparado e variação absoluta/percentual. |
| 144 | Analítico funcionário/dotação/local | Emitir as três dimensões e respectivos subtotais. |
| 153 | Saldos negativos por competência | Consultar e emitir os casos negativos, identificando origem e valor antes de eventual bloqueio/ajuste. |
| 155 | Comparação acima/abaixo da média por cargo/função | Reutilizar a modalidade do item 93, mantendo vínculo com ambos os requisitos. |
| 156 | Comparação acima/abaixo da média por lotação | Alterar agrupamento para lotação e emitir diferenças individuais. |
| 185 | Sintético somente por dotação | Emitir totais por dotação sem linhas individuais. |
| 211 | Análise por lotação/fonte | Emitir os valores cruzando essas duas dimensões. |
| 213 | Resumo por classificação funcional | Selecionar classificações e emitir os totais correspondentes. |
| 215 | FGTS por dotação | Emitir FGTS separado, sem incluir os demais encargos. |
| 217 | FGTS por lotação | Emitir o mesmo componente agrupado pela lotação histórica. |

**Dependências:** P01 para filtros; P02 para dimensões históricas completas. A emissão inicial usa a base já populada. Componentes que não existam individualizados nos snapshots antigos não devem ser inventados: usar novo cálculo ou origem comprovável.

### P04 — Ciclo funcional e cadastros especializados

**Aproveitar:** contratos/revisões, atos, ocorrências, `employment-lifecycle.ts`, quadro de cargos e cadastros de referência.

**Implementação compartilhada:**

- Tipar admissão, cessão, recebimento em cessão, nomeação, comissão, exercício eletivo, retorno, exoneração, demissão e readmissão.
- Cessão: órgão de origem/destino, direção do movimento, ônus, vínculo, início/fim, prorrogações, ato e responsável pelo pagamento.
- Comissão: vincular ao contrato de origem, opção remuneratória e período, preservando o vínculo efetivo e os efeitos na folha.
- Aplicar encerramentos e retornos pela mesma rotina temporal, inclusive quando executada novamente, sem duplicar atos ou remuneração.
- Fornecer formulários específicos para estágio e readaptação/reabilitação, em vez de esconder os dados apenas no JSON do contrato.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 41 | Histórico de admissões/cedências estruturadas | Cadastrar cessão e emitir origem/destino, período, ônus e ato junto às admissões. |
| 77 | Nomeação comissionada com retorno automático | Encerrar a comissão pela vigência e consultar o retorno ao vínculo/cargo de origem na referência seguinte. |
| 90 | Movimentação por admitidos, demitidos, cedidos e recebidos | Selecionar período e emitir as quatro categorias separadamente. |
| 116 | Exclusão de cadastro indevido sem vínculos impeditivos | Excluir um cadastro sem uso operacional pela interface; conservar a pessoa central compartilhada e recusar exclusão de quem possui histórico dependente. |
| 137 | Cadastro completo de estágio | Informar curso, instituição, natureza, nível, área, seguro, término, agente/CNPJ e supervisor/CPF; consultar vencimentos. |
| 139 | Readaptação/reabilitação | Cadastrar cargo de exercício, período, CID, motivo e complemento, com acesso compatível com os dados clínicos. |
| 183 | Exonerações/demissões por categoria funcional | Emitir período, ato, cargo e distinção efetivo/comissionado. |
| 184 | Efetivos em comissão ou exercício eletivo | Consultar os vínculos relacionados e emitir ambas as modalidades. |
| 192 | Histórico de afastamentos/licenças/cedências | Emitir os três grupos com períodos, motivos e situação. |

**Dependências:** P02 para a linha temporal; P05/P06 para os efeitos financeiros e de direitos; P12 para escopos. A exclusão do item 116 não se aplica aos 198 titulares com registros que precisam ser preservados.

### P05 — Direitos automáticos, férias, afastamentos e calendário

**Aproveitar:** `service-time-allowance.ts`, `service-rights.ts`, `vacation-rights.ts`, `vacation-entitlement.ts`, calendário civil, escalas e ponto.

**Implementação compartilhada:**

1. Política temporal de efeitos por tipo de afastamento/falta/cessão e finalidade: férias, 13º, ATS, progressão e aposentadoria.
2. Apurador de eventos devidos por data/competência, compartilhado pelo processamento da folha e pelo agendamento do sistema. Prévia apenas informa; aplicação registra uma única vez.
3. Separar os direitos acumuláveis e seus critérios, evitando que uma mesma averbação seja contada duas vezes na mesma finalidade.
4. Integrar faltas e afastamentos em união de dias, sem duplicação por sobreposição.
5. Acrescentar férias especiais parametrizadas por enquadramento, sem aplicar suas regras ao restante do quadro.
6. Calendário previsto por vínculo, com feriados, dias sem expediente, férias, afastamentos e registros efetivos. Data futura permanece prevista, sem batidas/horas realizadas.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 79 | Múltiplos direitos e concessões futuras automáticas | Cadastrar triênio/quinquênio com início e averbação; processar a referência de aquisição e verificar o lançamento devido. |
| 83 | Efeitos dos afastamentos/cessões e retorno em folha | Aplicar política por finalidade, agrupamento de pagamento e término; mostrar a retomada do cálculo. |
| 84 | Planejamento completo de férias/licença-prêmio | Consultar saldos, aquisitivos, vencimentos e mapa com data-limite para as duas modalidades. |
| 85 | Progressões/promoções automáticas | Definir interstício, requisitos, averbação e impedimentos; gerar a revisão de cargo/nível/salário no vencimento aplicável. |
| 121 | Período aquisitivo especial para radiologia | Vincular regra especial ao enquadramento e apurar o aquisitivo correspondente. |
| 125 | ATS com concessão na data e exclusão de faltas/afastamentos | Processar a referência com memória dos dias e geração automática do adicional. |
| 143 | Previsão de retorno de afastamento | Emitir data prevista, servidor, motivo, período e lotação. |
| 163 | Cartão de ponto com calendário personalizado | Emitir todos os dias do período, previsão, feriados, ausências, marcações existentes e totais. |
| 178 | Férias por unidade com todos os campos solicitados | Emitir aquisitivo, saldo, data-limite e início das últimas férias gozadas por servidor. |
| 189 | Expectativa de aquisição de ATS | Emitir próxima aquisição, tempo faltante, exclusões e regra considerada. |

**Dependências:** P04 para cessões/comissões; P06 para integração com cálculo e categorias; P08 para finalidade previdenciária. A regra deve distinguir concessão automática por vigência de um comando manual que apenas insere valor.

### P06 — Dependentes, categorias e cálculos de folha

**Aproveitar:** `workforce-service.ts`, `calculation-engine.ts`, `dependent-eligibility.ts`, `dependent-service.ts`, previdência, incidências, cálculos especiais e referências de opção individual.

**Implementação compartilhada:**

- Separar pessoa ativa no Cadastro Único, situação do vínculo e categoria de beneficiário. Aposentado/pensionista não pode ser excluído do cálculo por uma condição genérica destinada ao empregado ativo.
- Eleger regras por regime, categoria e vigência, com memória do fundamento e das bases.
- Processar alterações intramês, rubricas devidas e recálculo somente em contexto permitido, preservando folhas encerradas.
- Baixa de dependente é encerramento da elegibilidade por benefício, não exclusão da pessoa ou do histórico de parentesco.
- Piso/teto devem identificar a base, verbas incluídas/excluídas e forma de ajuste/bloqueio prevista na política.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 81 | Elegibilidade temporal e baixa automática por benefício | Atingir limite de idade/vencimento de documento e mostrar o encerramento para IRRF e salário/abono-família, preservando o passado. |
| 108 | Matriz completa de categorias e modalidades de folha | Selecionar ativo, aposentado e pensionista e processar mensal, adiantamento salarial, complementar, férias, 13º/adiantamento, benefícios e recálculo cabível. |
| 111 | Controle efetivo de piso/teto remuneratório | Processar casos abaixo/acima do limite e demonstrar ajuste ou bloqueio conforme regra, com valor e base explicados. |
| 112 | Salário-família e abono-família distintos | Calcular automaticamente os dois benefícios por suas políticas e dependentes elegíveis, sem duplicação indevida. |
| 124 | Contribuições, tributos e insumos dos arquivos legais | Calcular individual/patronal, IRRF, FGTS e PIS/PASEP conforme aplicabilidade; concluir os arquivos correspondentes com P10. |
| 128 | Rescisão/demissão por motivo, data e direitos devidos | Selecionar direitos, conferir saldo salarial, avos, férias, médias, descontos e encargos; calcular e emitir memória. |
| 140 | Opção previdenciária individual com período | Suspender verba optativa da base pessoal RPPS no intervalo e restaurá-la após o término, conforme a regra e seus efeitos patronais aplicáveis. |

**Dependências:** P04/P05 para ciclo e direitos; P07 para benefícios de pensão; P08 para aposentados; P10 para a parte de arquivos do item 124. O item 108 só estará completo quando sua matriz inteira tiver caminho operacional, não apenas quando houver seleção de tipo na tela.

### P07 — Pensões e consignações

**Aproveitar:** `payroll-pensions.ts`, `pension-configuration.ts`, `consignment-service.ts`, `consignment-margin.ts` e relatórios de beneficiários.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 82 | Fórmulas de múltiplas pensões, beneficiários, arquivo e recibo | Cadastrar pensões, calcular, relacionar o desconto à destinação e gerar arquivo/recibo por beneficiário com P11. |
| 109 | Parcela atual/total no contracheque | Lançar uma parcela e emitir o recibo com número do contrato e referência, por exemplo 3/12, originados do cronograma. |
| 133 | Consignações por entidade com múltiplas verbas | Selecionar várias rubricas e emitir valores por credor, parcela, servidor e total. |
| 152 | Recibo próprio de pensão alimentícia/judicial | Emitir documento com beneficiário, titular, processo, competência e valor; usar situação de pagamento somente quando houver registro correspondente. |
| 209 | Pensão sintética | Emitir totais por beneficiário/processo e período sem duplicar a base analítica. |

**Dependências:** P01 para multisseleção e formatos; P06 para o cálculo; P11 para remessas. Preservar a diferença entre valor descontado, repasse preparado e pagamento registrado.

### P08 — Tempo, aposentadoria e atuarial

**Aproveitar:** `retirement-reports.ts`, averbações, histórico contributivo, médias e documentos institucionais.

**Implementação compartilhada:** contagem por finalidade, períodos reconhecidos, deduções, sobreposições, regimes, requisitos, transições, data de elegibilidade e memória de cálculo. Regras municipais e previdenciárias devem ser cadastradas por vigência e contexto aplicável, não como uma fórmula universal.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 89 | Apuração de tempo, certidão e cálculo de concessão | Somar averbações, explicar períodos desconsiderados, selecionar regra e apresentar elegibilidade/valor; emitir certidão. |
| 95 | Adaptadores atuariais por prestador/versão | Gerar os layouts exigidos entre PEMCAIXA, SUPREV, Banco do Brasil, DRAA, Brasilis, NAP, Aliança, Account, BRPrev, ContabilPrev e Lumens; cada combinação precisa de especificação própria. |
| 157 | Relatório atuarial | Emitir a base cadastral, funcional, remuneratória, contributiva e de beneficiários da data-base. |
| 158 | Atuarial colunar | Emitir a mesma base no modelo colunar, com dicionário de campos e totalizadores. |
| 164 | Certidão de tempo de serviço | Emitir períodos, deduções, averbações, total, finalidade, fundamento, número, emitente e responsável institucional. |

**Dependências:** P02/P04/P05/P06; especificações dos prestadores. Enquanto só houver projeção por mínimos configurados, o item 89 não pode ser tratado como cálculo completo de concessão.

### P09 — Avaliações e capacitação

**Aproveitar:** atividades funcionais, políticas de questionários, inscrições, conclusões e publicação de resultados no Portal.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 162 | Avaliação do programa de treinamento | Configurar instrumento ligado ao curso/turma, registrar respostas e emitir participação, indicadores e resultados. |
| 195 | Histórico de mérito/desempenho | Emitir por servidor/ciclo as notas, critérios, conclusão, comissão, data e publicação, preservando versões. |

**Dependências:** P01/P02/P12. O histórico deve usar a identidade central do titular e os instrumentos efetivamente aplicados.

### P10 — Arquivos governamentais e contribuição sindical

**Aproveitar:** `obligation-export.ts`, `obligation-history.ts`, classificação contábil, calendários tributários e comprovante anual existente.

**Antes dos adaptadores:** definir órgão destinatário, exercício/competência, versão, manual de campos e exemplo de arquivo. Levantar a aplicabilidade de obrigações históricas e suas substituições, sem assumir que trocar DIRF/RAIS/CAGED por outro nome satisfaz o requisito literal.

**Implementação compartilhada:** conjuntos de dados próprios por obrigação, registros de abertura/detalhe/fechamento quando exigidos, códigos legais, codificação, totais, validação local e preservação da versão gerada. Corrigir faltas cadastrais pela tela, sem preencher campos obrigatórios com constantes inventadas.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 104 | Exportação para o TCE alvo | Selecionar tribunal/layout/período e gerar arquivo com dados e estrutura do manual aplicável. |
| 113 | Apuração e arquivo SIOPE | Classificar vínculos, exercício, despesas e campos educacionais necessários; apurar e exportar pela interface. |
| 124, parte de arquivos | Arquivos das contribuições e obrigações exigidas | Gerar os formatos aplicáveis à competência e aos regimes, incluindo a cobertura SEFIP/GFIP solicitada quando pertinente. |
| 131 | DIRF/RAIS e integração com comprovante anual | Gerar arquivos nas versões pertinentes ao exercício e manter conciliação com rendimentos/pagamentos; reutilizar o comprovante já existente. |
| 179 | Relatório de contribuição sindical | Parametrizar base, enquadramento, período e fundamento e emitir a composição prevista na Nota Técnica indicada. |
| 182 | CAGED | Gerar admissões/desligamentos no layout e período exigidos, com modalidade histórica quando aplicável. |

**Dependências:** P02/P03/P04/P06. A geração local não exige transmissão externa para demonstrar um item que pede apenas geração/exportação; exige, porém, o layout correto. Os destinatários e versões precisam estar definidos para fechar esses itens.

### P11 — Bancos e consignatárias

**Aproveitar:** bancos/agências, convênios/contas, relatórios preparatórios e contratos de consignação.

**Implementação compartilhada:** catálogo de adaptadores por instituição, serviço, convênio, direção e versão; identificação do lote, origem dos valores, totais, arquivo, retorno e inconsistências por registro. Importação deve oferecer prévia e chave de lote para não lançar duas vezes.

| Item | Entrega para atender | Ação observável |
| ---: | --- | --- |
| 135 | Crédito em conta no layout bancário | Selecionar banco/convênio/folha, gerar remessa e emitir a relação conciliada de créditos. |
| 138 | Contracheques para autoatendimento Banco do Brasil | Selecionar convênio/versão e gerar o arquivo específico a partir dos demonstrativos publicados. |
| 141 | Consignações Econsig, SpConsig, Santander, Caixa e ConsigNet | Para cada provedor exigido, importar/exportar seu layout, mostrar inconsistências e vincular parcelas às rubricas corretas. |
| 180 | Abertura de contas | Gerar arquivo no layout do banco conveniado com os dados cadastrais obrigatórios. |
| 181 | Importação bancária de consignados | Carregar o arquivo conveniado, conferir prévia e aplicar as parcelas sem duplicação. |
| 82, parte bancária | Destinação das pensões | Gerar a remessa dos beneficiários a partir dos valores calculados e das contas próprias. |

**Dependências:** P02/P06/P07 e manuais de bancos/provedores. Preparar arquivos e importações locais; pagamentos reais não fazem parte da preparação da apresentação.

### P12 — Acesso por lotação e evento

**Item principal: 117.**

- Configurar quais lotações e eventos cada perfil/usuário pode consultar, lançar, alterar, calcular e exportar.
- Aplicar a regra no servidor, inclusive em buscas, seletores, contagens, totais, downloads, importações e ações coletivas.
- Definir a semântica de folha mista: quem só acessa parte dos vínculos/eventos não pode autorizar operação global nem receber totais de registros fora do escopo.
- Reutilizar os perfis e contexto do projeto; distinguir lotação de unidade orçamentária.
- **Demonstração prevista:** dois perfis com escopos distintos, com ações e resultados limitados às respectivas lotações/eventos.

**Dependências:** iniciar antes dos novos endpoints; integrar ao longo de todos os pacotes. Não adiar a autorização para depois que os downloads estiverem prontos.

### P13 — Histórico completo e fechamento do roteiro

**Item principal: 40.**

- Consolidar cadastros, revisões, ingressos/cessões, comissões/retornos, funções, salários, lotações/locais/dotações, afastamentos, direitos, contribuições, avaliações, cursos, rescisões e documentos.
- Mostrar data do fato, vigência, registro, tipo, descrição, valores/campos alterados, ato/documento, situação e origem.
- Manter visões por seção e uma emissão integrada, sem exigir que o apresentador combine manualmente vários arquivos para atender ao “histórico completo”.
- O item 40 termina após conectar as origens anteriores. Adicionar um rótulo de histórico completo antes disso não encerra a pendência.

## 5. Ordem recomendada de desenvolvimento

| Etapa | Conteúdo | Resultado que libera a próxima etapa |
| --- | --- | --- |
| E0 — Contratos e referências | Congelar a lista de 85 itens; definir versões externas e políticas municipais necessárias; mapear consumidores; definir escopos de P12 | Backlog rastreável e dependências explícitas. A falta de manual de um banco não impede os relatórios internos. |
| E1 — Entregas de maior reaproveitamento | Núcleo de P01; ficha básica/completa de P02; relatórios de P03 sobre dados já disponíveis; início de P12 | Mais emissões acessíveis, filtros consistentes e formatos próprios. |
| E2 — Temporalidade e ciclo funcional | Restante de P02; P04; integração incremental do histórico P13 | Origem temporal confiável para atos, cessões, comissões e mudanças. |
| E3 — Automatizações e folha | P05, P06 e P07; ligar relatórios de parâmetros ao motor real | Cadastro → regra → vencimento → movimento → cálculo → recibo, com efeitos rastreáveis. |
| E4 — Previdência e avaliações | P08/P09; completar as fontes de P13 | Certidões, regras previdenciárias, base atuarial e históricos de avaliações. |
| E5 — Adaptadores específicos | P10/P11; concluir partes externas de 82, 95, 124 e 131 | Arquivos reais no formato escolhido, importações e prévias disponíveis. As especificações são levantadas desde E0. |
| E6 — Preparação final | Cenários integrados, conclusão de P12/P13, roteiro por requisito e verificações finais | Cada um dos 85 itens possui caminho, ação, dados de referência e resultado identificáveis. |

**Prioridade prática:** entregar primeiro consultas e emissões que reutilizam dados; depois garantir temporalidade e cálculos; por fim fechar cada adaptador específico. Não adiar o levantamento dos layouts até E5.

## 6. Banco de dados e tabelas visuais — entregas separadas

### 6.1 Estruturas físicas candidatas

As necessidades abaixo são decisões de modelagem a detalhar antes de migrar, e não nomes de tabelas já existentes nem autorização para criar duplicatas.

| Domínio | Necessidade | Direção de implementação |
| --- | --- | --- |
| Cadastro temporal | Vigência e alterações pessoais/funcionais | Reutilizar revisões contratuais; acrescentar histórico pessoal e fotografia da competência onde ausentes. |
| Cessão/comissão | Relações entre vínculos, órgãos e efeitos | Estrutura com referências, vigências e restrições de sobreposição; ato/documento associado. |
| Direitos | Concessões, políticas e efeitos de ausências | Reutilizar ledger de direitos e regras; acrescentar eventos de concessão e estado temporal indispensáveis. |
| Dependentes/opções | Elegibilidade por benefício e escolhas individuais | Períodos, motivos e decisões; não apagar a pessoa central. |
| Folha/contabilidade | Categoria, componentes de encargo e classificação histórica | Reutilizar cálculo/snapshot/rateio; versionar os elementos que ainda não estejam preservados. |
| Estágio/readaptação | Campos especializados e períodos | Verificar os cadastros centrais e SST antes de estender a estrutura RH. |
| Arquivos | Adaptador, versão, lote, arquivo e importação | Reutilizar integração/eventos e armazenamento do projeto; estrutura própria apenas quando necessária a vínculos/consulta transacional. |
| Permissões | Escopos por lotação e rubrica | Integrar perfis/contexto e persistir apenas as relações específicas ausentes. |

Para cada migração: identificar consumidores, índices, referências, política de preenchimento inicial, reversão e impacto nas rotinas existentes. Não alterar funções exportadas sem localizar todos os consumidores. Alterações monetárias usam os tipos decimais do projeto.

### 6.2 Tabelas visuais e formulários

- Aplicar `OperationalListFrame`, `OperationalTable`, `OperationalFilters`, paginação e `OPERATIONAL_PAGE_SIZE` de 20.
- Reutilizar `OperationalTablePanel` e os painéis RH em seleções/edições, com rascunhos e payload preservados ao paginar ou abrir/fechar.
- Referências: `docs/Padrão de Tabelas.md`, seção 6 de `docs/ENTREGA_PADRAO_TABELAS.md` e `/rh/servidores` como tela equivalente.
- Preservar header, faixa compacta, menu recolhido para ícones, preferência estável e texto integral. Desktop/notebook seguem o encaixe operacional; tablet/celular seguem a exceção documentada.
- Não criar listagens paralelas em cartões nem sobrescrever geometria global com CSS do módulo.
- Documentos, etiquetas e calendários preservam sua semântica. Exportações não ficam limitadas às 20 linhas da tela.
- Ler os guias pertinentes de `node_modules/next/dist/docs/` antes de implementar páginas, rotas e ações.

**Desvios observados:** o catálogo ainda se apresenta como fechado em 74 itens; várias operações exigem JSON/IDs. Ajustá-los faz parte da preparação funcional. Não houve medição visual autenticada das telas nesta análise; aderência visual será registrada separadamente da inspeção de código.

## 7. Dados e roteiro de apresentação

### Preservação da base

- Conservar os mesmos 198 titulares, identidades centrais, relações e documentos históricos.
- Preservar as 594 versões originais de agosto–outubro/2026 e demais folhas encerradas. Não reabrir nem regravar snapshots para fabricar novos cenários.
- Preparar novos eventos em recortes abertos e com vigência apropriada, ou numa base de apresentação derivada e isolada quando o caso for incompatível com o histórico publicado.
- Não converter janeiro–novembro/2025 em folhas operacionais apenas para preencher um relatório.
- Manter nomes de telas/documentos em terminologia municipal normal e emitente **Prefeitura Municipal de Vereda das Auroras**. Origem e rastreabilidade permanecem nas evidências técnicas.

### Cenários mínimos propostos

| Cenário | Conteúdo a preparar | Pacotes principais |
| --- | --- | --- |
| S01 — Referências cadastrais | Alteração de endereço/contato, salário, cargo, local e dotação em datas diferentes | P01/P02/P03 |
| S02 — Ciclo funcional | Cessão com ônus, recebimento, comissão com retorno e exercício eletivo em casos separados | P04/P05 |
| S03 — Direitos | Triênio/quinquênio, averbação, falta, afastamento, progressão e próximos vencimentos | P05/P06 |
| S04 — Férias e calendário | Férias vencidas/a vencer, licença-prêmio e férias especiais; calendário com feriado/ausência | P05 |
| S05 — Dependentes e RPPS | Limite de idade, documentação, salário/abono-família e suspensão temporária de verba | P06 |
| S06 — Categorias e rescisão | Ativo, aposentado, pensionista e tipos de folha; rescisão intramês com direitos distintos | P06/P08 |
| S07 — Descontos e beneficiários | Duas pensões, múltiplas consignações, parcela 3/12 e entidades beneficiárias | P07/P11 |
| S08 — Contabilidade | Rateio entre dotações/fontes, encargos separados, provisão/baixa e comparação entre períodos | P03 |
| S09 — Capacitação | Curso com avaliação, dois ciclos de desempenho e histórico publicado | P09 |
| S10 — Arquivos | Lotes completos por layout, importação com inconsistência e reapresentação do mesmo lote | P10/P11 |
| S11 — Acesso e histórico | Dois perfis e um servidor com sequência funcional completa | P12/P13 |

Selecionar os casos a partir da base existente, sem distribuir pensão, dependente, aposentadoria ou direitos especiais indistintamente aos 198. Categorias incompatíveis devem usar casos/recortes separados.

O roteiro deve registrar por requisito: titular/contrato, referência, pré-condições, menu/tela, botão, resultado esperado e arquivo/documento produzido. O Portal exige vínculo individual configurado para os percursos do titular; acesso administrativo sem `employeeId` não substitui esse vínculo.

## 8. Dependências que precisam ser definidas

1. **Regras municipais:** ATS, licença-prêmio, progressões, piso/teto, abono-família, férias especiais, efeitos dos afastamentos e opções RPPS.
2. **Previdência:** regimes/planos aplicáveis, regras de concessão/transição e finalidade das certidões.
3. **Layouts:** TCE destinatário, bancos/convênios, serviço BB, consignatárias, prestadores atuariais, exercícios e versões dos arquivos governamentais.
4. **Classificações:** plano de cargos, classificação funcional, rubricas, naturezas/fontes e enquadramentos educacionais do SIOPE.
5. **Acesso de apresentação:** perfis operacionais e vínculo do titular para o Portal.

Essas definições são insumos do desenvolvimento. Os demais pacotes avançam enquanto cada especificação externa é obtida. Não atribuir atendimento a layout ou regra ainda indefinidos.

## 9. Critério de entrega e conferência final

Cada pacote deve encerrar com:

1. Serviços integrados às fontes canônicas e ações disponíveis no menu/tela pertinente.
2. Campos e seletores de uso funcional, com mensagens compreensíveis de erro e sucesso.
3. Modos de consulta/prévia/aplicação coerentes, preservando histórico e impedindo duplicação de efeitos.
4. Migrações/schema documentados separadamente das mudanças visuais.
5. Cenário preparado e roteiro que permita ao apresentador acionar a rotina sem scripts auxiliares.
6. Relação de requisitos cobertos, dependências ainda abertas e evidências obtidas.

**Sequência de conferência futura:** implementar → preparar dados/cenários → executar as verificações técnicas e funcionais pertinentes → validar a navegação/visual → atualizar a matriz binária. Não foram executadas essas verificações nesta entrega de planejamento.

As verificações devem focar os riscos reais: temporalidade, não duplicação de eventos/parcelas, conciliação de totais, autorização de consulta/download, preservação dos fechamentos e integridade dos layouts. Reutilizar a suíte existente e acrescentar casos necessários a mudanças de cálculo, autorização e persistência; não criar testes redundantes de simples rótulos.

Antes de qualquer commit/push de implementação, executar `npm run build`. Publicações devem seguir as regras de identidade e deploy do `AGENTS.md` e confirmar o resultado no ambiente publicado.

**Meta final:** os 85 itens passam a ter ação funcional demonstrável. O item continua **NÃO ATENDE** enquanto faltar parte necessária, ainda que a tela ou um botão já tenha sido criado. Itens de exportação podem ser demonstrados com geração local no layout correto; um protocolo de aceite externo só se afirma quando realmente existente.

## 10. Referências técnicas

- `docs/EXPANSAO_HISTORICA_RH_2025_2026.md` — população e preservação histórica concluídas.
- `docs/PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md` — plano anterior, restrito aos 74 relatórios; este documento amplia o escopo para as pendências da lista de 219.
- `src/lib/rh/report-catalog.ts`, `report-service.ts`, `operational-reports.ts` — catálogo, consulta e exportação.
- `src/lib/rh/personnel-record-reports.ts`, `functional-history-report.ts`, `accounting-reports.ts` — cadastros, históricos e apropriação.
- `src/lib/rh/workforce-service.ts`, `employment-lifecycle.ts`, `dependent-eligibility.ts`, `dependent-service.ts` — cálculo, ciclo funcional e dependentes.
- `src/lib/rh/service-time-allowance.ts`, `service-rights.ts`, `vacation-rights.ts`, `retirement-reports.ts` — direitos e contagem.
- `src/lib/rh/obligation-export.ts`, `obligation-history.ts`, `external-configuration.ts` — preparação das obrigações e limites atuais.
- `src/db/schema/personnel-records.ts`, `personnel-workforce.ts`, `personnel-configuration.ts`, `personnel-reference-records.ts` — estruturas a reutilizar/analisar antes das migrações.
- `src/app/app-domain/rh/` e `src/app/app-domain/configuracoes/auditoria/` — telas e ações de integração.
