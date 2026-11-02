# Execução dos ajustes de RH, Folha e Portal — 02/11/2026

Roteiro: [plano dos 74 itens](PLANO_AJUSTES_RH_FOLHA_PORTAL_POC_2026.md). Estado individual: [matriz de execução](MATRIZ_EXECUCAO_RH_POC_2026.md). Este registro distingue **população no banco**, **código local**, **conferências estáticas** e **homologação pendente**. A matriz inicial de 11 E / 49 P / 14 N permanece como diagnóstico de partida, não como resultado posterior.

## 1. Aplicado no banco

| Conjunto | Resultado / evidência |
| --- | --- |
| Histórico de folha | Agosto, setembro e outubro/2026: **198 demonstrativos fechados e publicados por mês, 594 no total**. `RH_PORTAL_POPULACAO_2026.json`. |
| Estimativas salariais | 198 servidores, vigência 01/11/2026, base mensal agregada de R$ 897.419,70. Manifesto individual `RH_ESTIMATIVAS_SALARIAIS_2026.json`. |
| Rateios | **396** referências, remuneração e encargo separados para cada um dos 198 contratos. Percentual de 100% em cada componente; dimensões demonstrativas, sem lançamento contábil. |
| Dotações patronais demonstrativas | Nove referências `DEMO-RH-ENC-*`, com valores orçamentários e empenhados zerados, vinculadas à natureza 3.1.90.13. Preservadas as dotações remuneratórias existentes e seus valores. |
| Demanda de pessoal | **42** combinações cargo/lotação, premissa fictícia de ocupação acrescida de 10%, arredondada para cima. Não é quadro legal ou estudo oficial. |
| Formação | Três cursos de graduação e **18** formações individuais fictícias. |
| Capacitação | Três turmas, **18 inscrições concluídas e 18 certificados** reconhecidos pelo serviço canônico de capacitação, com evidência explicitamente fictícia. |
| Tempo anterior | Seis períodos fictícios reconhecidos apenas no cenário; não foram lançados como averbação ATS universal nem incorporados às folhas já fechadas. |
| Vale-transporte | Oito adesões/itinerários e **72 movimentos** (aquisição, concessão e consumo nos três meses). A conferência deve mostrar diferenças, sem forçar igualdade com a previsão. |
| Convênios | Crédito e débito separados: **198 contas fictícias de crédito e quatro de débito**, 202 referências no total. Agência/conta deliberadamente marcadas `DEMO`, sem autorização bancária real. `RH_CENARIOS_AJUSTES_2026.json`. |
| Outros cenários | Uma pensão vitalícia documental fictícia, oito dependentes sem elegibilidade fiscal ativada, 18 anotações funcionais e quatro programações futuras de férias. Nenhum desses registros recalcula ou paga automaticamente uma folha. |
| Escalas | **186 escalas** de novembro/dezembro, quatro faixas, jornada semanal/divisor mensal e intervalo de 60 minutos separados. Doze secretários excluídos do controle automático. `RH_ESCALAS_ESTIMADAS_2026.json`. Nenhuma presença futura foi gerada. |

### Temporalidade e limites da população

- Setembro/outubro foram retomados de forma idempotente usando a revisão contratual de cada competência. O cálculo, fechamento e publicação passaram pelos serviços existentes, com propagação explícita do contexto transacional.
- As novas estimativas de novembro **não** foram usadas para reescrever os recibos de agosto–outubro. A primeira versão possui a limitação documentada de usar divisores mensais antigos como `monthlyHours/25` no ponto sintético. Não se apresenta esse histórico como jornada homologada ou recalculada.
- O executor histórico agora aceita exclusivamente agosto, setembro e outubro, evitando estender suas premissas a outras competências silenciosamente.
- A aplicação de cenários recusa divergências nas referências já existentes. A retomada posterior ampliou as contas fictícias de crédito para o cadastro inteiro, preservando os primeiros registros.
- Nenhum usuário individual foi criado ou vinculado automaticamente ao administrador. Não houve transmissão bancária, pagamento, remessa fiscal ou alteração do processamento do GED.

## 2. Alteração física de banco — separada das tabelas visuais

Foi necessária a migração **`20261102143000_hr_supplementary_references`**. O `CHECK` físico de `HrReferenceRecord.kind` impedia novas categorias, embora `details` já fosse JSONB.

- Amplia a enumeração fechada, preservando todas as categorias anteriores, e acrescenta índices de consulta por titular/contrato.
- Não cria tabelas paralelas de servidor, ponto ou folha e não altera demonstrativos fechados.
- Primeiro planejamento pelo executor oficial: 189 migrações registradas, somente essa pendente.
- Aplicação pelo mesmo executor: `PASS`, migração em `applied`. Evidência em `RH_MIGRACAO_REFERENCIAS_2026.json`. Esse resultado é execução de DDL, não publicação da aplicação na Vercel.
- A primeira tentativa de carga complementar foi revertida na transação do primeiro rateio pelo `CHECK` anterior; após a migração, a execução completou os registros documentados. As referências orçamentárias preparatórias são idempotentes e não duplicaram na retomada.

## 3. Implementação local de telas e emissões

### Consulta e exportação

- Nova central `/rh/relatorios`, com **74 identificadores da POC** individualmente rastreáveis em `src/lib/rh/report-catalog.ts`. IDs que compartilham um motor continuam com acessos separados no catálogo; o parâmetro `poc` evita confundir os itens 6/50 e 18/62.
- Consulta paginada em 20 linhas; exportação integral CSV/XLSX/PDF com o mesmo serviço. Campos compostos permanecem integrais no detalhe da tabela compartilhada.
- Emissões de previsão, catálogos, afastamentos, dependentes, frequência, evolução, formação, tempo, convênios e etiquetas implementadas nos serviços especializados de `src/lib/rh/`.
- ATS usa memória canônica de base temporal, dias corridos/excluídos/averbados/computados, percentual e valor, incluindo indicação de estorno.
- Histórico funcional integra contratos/revisões, atos, afastamentos/férias, direitos, formação, capacitação, ocorrências e demonstrativos liberados, conservando identificadores de origem e os escopos orçamentários pertinentes.
- Cadastros geral/lotação/local/dotação passam a aceitar referência histórica e filtros de titular/lotação. A consulta geral preserva uma linha por pessoa, com dados integrais dos vínculos; as visões por local/dotação mantêm as combinações. Vínculo orçamentário legado sem vigência não é aplicado retroativamente a uma referência explícita.
- Ocorrências exibem o motivo/data de cancelamento sem apagar o original. A relação de verbas inclui cronogramas consignados, credor, parcela e reserva na referência; não apresenta lançamento como quitação. O item 64 tem emissão própria de conferência e acesso ao importador existente com prévia/chave idempotente.
- Dimensionamento confronta ocupação com demanda explicitamente cadastrada; ocupação por cargo consulta o histórico legal quando disponível e sinaliza ausência de quadro vigente. CBO lê o mapeamento do quadro de cargos e exibe pendências sem inferir códigos pelos nomes.

### Contabilidade e banco

- Oito visões dos itens 65–72 usam a mesma base de demonstrativos fechados e rateios demonstrativos de remuneração/encargo, com dotação, fonte, natureza e lotação/local históricos.
- Arredondamento por maiores resíduos determinísticos. Os totalizadores derivam das rubricas já rateadas, preservando conciliação também dentro de cada destino. Linhas de total são explicitamente **não aditivas** às rubricas.
- Configuração identificada por hash no relatório; a apropriação não é lançamento contábil oficial, nem substitui congelamento/versionamento contábil definitivo.
- Itens 60/61 possuem modelos internos distintos: referência demonstrativa de ordem e folha de crédito por convênio. Valores vêm dos recibos históricos; contas/autorizações vêm do cadastro explicitamente vigente. Falta ou ambiguidade de destino aparece como pendência, sem multiplicar o líquido por várias contas.
- As referências `MODELO:*` não são números bancários e o relatório não altera `Payroll.status`, não transmite e não baixa pagamentos.

### Impressão e cadastros

- Etiquetas: campos, uma a três colunas, altura e margens configuráveis. Conteúdo que não caiba exige ajuste do modelo, sem truncamento silencioso.
- Modelo de 132 colunas com exportação TXT monoespaçada ASCII/transliteração e quebras controladas, além do PDF.
- `/rh/cadastros` reutiliza `OperationalTablePanel`, tabela/paginação compartilhadas e edição fora do painel. O rascunho permanece montado ao consultar páginas; o seletor de beneficiário consulta pessoas por busca paginada, sem carregar todo o Cadastro Único.
- Gravação/exclusão pela interface registra antes/depois e ator em evento de auditoria RH. As ações preservam os contratos: gravação retorna erro para a UI, exclusão via formulário retorna `void`.
- A ficha funcional reúne ponto e contracheques das mesmas origens lidas pelo Portal.

### Identidade do Portal

`getEmployeePortalAccess` deixa de selecionar o primeiro servidor ativo para um administrador sem vínculo. Telas pessoais agora exigem `Usuario.employeeId` ativo, coerente com relatórios/downloads. O administrador continua com a consulta gerencial do RH; acesso autenticado individual e eventual prévia administrativa explícita permanecem na implantação/homologação.

## 4. Pendências de implementação/parametrização — não confundir com aceite

O catálogo ter 74 acessos **não** significa que os 74 requisitos estejam integralmente concluídos. O próprio catálogo conserva limitações específicas. Permanecem, entre outros:

| IDs | Complemento necessário |
| --- | --- |
| 1–2 | Retorno ajustado à escala/feriado e vínculo completo do término com o ato de nomeação, além da previsão civil/contratual atual. |
| 11, 17, 20, 74 | Parametrizar quadro legal, escala salarial completa, códigos CBO e demanda oficiais. O código distingue ausência de configuração e cenários fictícios. |
| 13, 25 | Completar distinção causa/espécie/efeito e utilização dos motivos por desligamento, além dos catálogos/uso já emitidos. |
| 32–33 | Homologar cortes por vínculo e unidade histórica em casos de rateio temporal e mudanças no meio do mês. |
| 34, 47, 52, 73 | Regras/transições previdenciárias oficiais, reconhecimento documental, interrupções e cessação de direitos. Projeção atual usa política fictícia explícita e não concede aposentadoria/pensão. |
| 37–39 | Identificação institucional/modelo de assinatura e mapa completo de dias sem registro. Quatro batidas exigem evolução física/fluxo de marcações; não foram inventadas batidas intermediárias. |
| 40–41, 48, 53, 63 | Estruturar cessão com origem/destino/ônus, completar histórico das correções/classificações e opções de comissão. As emissões existentes não fabricam esses vínculos. |
| 43, 45–46 | Temporalidade implementada; revisar vínculo orçamentário legado sem vigência e homologar casos de múltiplos vínculos. |
| 49, 59, 64 | Relação de movimentos/parcelas e conferência própria implementadas. Completar vigências de elegibilidade dos dependentes e homologar lançamento/importação de variáveis e baixas externas de consignação. |
| 60–61, 65–72 | Leiautes/retornos e numeração bancária oficial, classificação e congelamento contábil definitivo, além da preparação interna demonstrativa. |

## 5. Conferências e sequência de validação

- ESLint direcionado da primeira revisão: **aprovado**. TypeScript direcionado de telas, serviços importados e executores: **aprovado**, após corrigir uma chamada incompatível de PDFKit.
- A verificação funcional final desta implementação foi iniciada após a preparação das emissões. **Cinco testes de centavos/calendário/132 colunas e PDFs passaram**, incluindo leitura do espelho multipágina e contracheque por PDF.js.
- `scripts/verify-rh-poc-reports-2026.ts --run-final`: primeira execução identificou erro de sintaxe no alias de data do VT; corrigido. Execução posterior **PASS para os 74 IDs (serviço + CSV)**, registrada em `RH_POC_RELATORIOS_VERIFICACAO_2026.json`.
- A mesma execução conciliou bruto/descontos/líquido/encargos das **oito visões contábeis** aos demonstrativos originais, negou escopo vazio e verificou filtros por titular, salários de outubro distintos de novembro e amostras PDF/XLSX de etiquetas/cartão/ATS/histórico.
- Há emissões válidas sem registros: IDs **2, 3, 7, 8, 12, 13, 27, 35, 51 e 53** no recorte verificado. Esse resultado comprova execução/vazio, não o cenário positivo de cada requisito. O informe anual por pagamento está vazio porque a carga não registra pagamentos reais.
- `scripts/verify-rh-portal-2026.ts`: **PASS**, 198 titulares em cada uma das três competências, nenhuma divergência cálculo/demonstrativo/projeção, publicação reconhecida pelo serviço, PDFs emitidos e acesso cruzado negado. `RH_PORTAL_VERIFICACAO_2026.json` é evidência de banco/serviço, sem login de navegador.
- **Validação visual bloqueada por navegador desktop desconectado** nesta sessão. É necessário conectar a sessão no aplicativo desktop e habilitar o navegador experimental para exercer as páginas autenticadas. Contas individuais vinculadas também continuam sem homologação real.
- Regressões de cadastro/referências/relatórios documentais/Portal e ciclo completo RH: **13 testes aprovados** ao final. Na primeira execução, uma asserção procurava o JSON configurável na última coluna; com a ampliação do contrato de exportação, ela foi ajustada para localizar o cabeçalho. O JSON permaneceu preservado. A reexecução integral do ciclo RH passou e também exercitou os relatórios de parcela cancelada/lançada e ocorrência cancelada. Com os cinco testes de impressão/primitivas, são **18 testes aprovados** nesta revisão.
- ESLint dos complementos e testes alterados e TypeScript direcionado: **PASS**. `git diff --check`: **PASS**.
- Build completo desta revisão concluído com sucesso em 02/11/2026 (`npm run build`, saída 0; typecheck em 16 partições e build Next.js concluídos). As integrações/homologações externas permanecem pendentes.
- **Código RH ainda local, sem commit/push ou deploy da aplicação.** A publicação anterior do GED permanece a versão publicada. A população e a migração descritas acima já estão no banco e devem constar da revisão do futuro deploy.
