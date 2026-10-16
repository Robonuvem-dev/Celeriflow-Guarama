# Análise documental — RH, Folha e integrações da POC Ibema

**Data:** 11/10/2026. **Pacote analisado:** `docs/Docs de Rh e FOlha` (grafia registrada no Git; no pedido, “Docs de Rh e Folha”).

## 1. Conclusão executiva

O pacote é aproveitável para orientar desenvolvimento, preparar dados fictícios, definir aceites e montar demonstrações integradas. Ele contém os documentos do certame, o Estatuto municipal histórico, referências de outros entes, schemas reais do eSocial e modelos autorais. Não é um conjunto de regras pronto para importar, nem prova de atendimento dos requisitos.

Os maiores ganhos imediatos são: usar as duas matrizes como roteiro de aceite; transformar os formulários em jornadas Portal → RH → Protocolo/GED; melhorar relatórios com os exemplos Meta4; ampliar testes de férias, licença-prêmio, ATS, ponto, IRRF e integração financeira; preparar validação local de XML com os XSD existentes. Há material suficiente para continuar grande parte do desenvolvimento interno.

O pacote **não resolve sozinho** vigência municipal, incidências tributárias das rubricas, regime previdenciário por população, classificação contábil, layouts bancários, convênios ou transmissão oficial. F0–F9 permanecem parciais, conforme `RH_FOLHA_EXECUCAO.md`.

## 2. Escopo, método e evidências

- Inventário recursivo de **67 arquivos originais**: 38 PDFs, 3 ZIPs, 6 CSVs, 3 JSONs, 5 Markdown, 8 HTML, 2 Python, 1 batch e 1 atalho URL.
- Extração de texto dos PDFs e dos três PDFs internos do ZIP de leiautes; consulta às seções relevantes para RH e às interfaces. Os documentos gerais também abrangem módulos fora de RH. A classificação documental desses módulos não equivale a uma auditoria funcional integral deles.
- O Estatuto não tem camada de texto: suas 44 páginas são imagens. Foram abertas folhas de contato das páginas e conferidos visualmente os dispositivos relevantes. Não foi criada uma transcrição normativa certificada.
- Conferência SHA-256 dos **38 downloads presentes**, todos coincidentes com `DOWNLOAD_RESULTADOS.json`. Isso prova concordância dos bytes com o manifesto local; não prova vigência da norma nem autenticação jurídica do documento.
- ZIPs sem erro de CRC detectado; dois ZIPs XSD com **52 entradas cada**, XML sintaticamente bem formado. Ainda não foi validado um evento do sistema contra esses schemas.
- Catálogos CSV/JSON equivalentes: **60 fontes**. Manifesto com **39 tentativas**, sendo 38 downloads disponíveis e uma falha HTTP 404. As outras **21 fontes são páginas catalogadas**, não arquivos locais baixados.
- Matrizes: **114/114 textos de Folha e 20/20 de eSocial encontrados no trecho correspondente do PDF**, após remover cabeçalhos de páginas e normalizar espaços, acentos e pontuação. Confirmação textual, não confirmação de atendimento.
- Cenários CSV/JSON equivalentes, 40 entradas; JSONs de entrada/resultado válidos.
- `python "docs/Docs de Rh e FOlha/04_Dados_e_Casos_de_Teste/teste_calculos_referencia.py" -v`: **11 testes aprovados**. Esses testes executam o cálculo didático Python, não os serviços TypeScript da aplicação.
- Cruzamento com serviços atuais, particularmente `workforce-service.ts`, `calculation-engine.ts`, `special-simulation.ts`, `finance-bridge.ts`, e com os estados documentados em `RH_FOLHA_EXECUCAO.md` e `RH_FOLHA_POLITICAS_OPERACIONAIS.md`. A demonstração autenticada e a impressão ainda precisam de verificação de percurso.

Os relatórios de extração e scripts auxiliares desta inspeção ficaram em diretório temporário local. Este documento registra os achados necessários para continuidade em outro notebook.

## 3. Inventário e aproveitamento de todos os arquivos

Os caminhos das tabelas são relativos à pasta do pacote. “Adaptar” significa reutilizar estrutura, campos ou exemplo com dados do sistema e regra própria versionada. “Referência” significa fonte para implementação; não é evidência de função executada.

### 3.1 Documentos centrais e certame — 5 arquivos

| Arquivo | Conteúdo e uso recomendado | Limite / ação necessária |
|---|---|---|
| `DOSSIÊ_CODEX_CELERIFLOW_RH_FOLHA_IBEMA.md` | Roteiro amplo de cadastro, cálculo, direitos, provisões, Portal e eSocial; útil para backlog, arquitetura e aceites. | Propostas de implementação não descrevem automaticamente o código atual. Conferir normas citadas e atualizar o estado usando a documentação de execução. |
| `LEIA-ME_PRIMEIRO.md` | Índice e ordem de leitura. | A afirmação original de ausência dos downloads estava desatualizada; atualização registrada nesta análise. |
| `01_Documentos_da_POC/IBEMA_Checklist_Real_POC_Executivo_Camara.pdf` | 344 páginas; fonte de aceite demonstrável. Folha Executivo pp. 70–85; SST pp. 86–95; eSocial começa na p. 96 e termina na p. 98, compartilhada com IPTU. | Distinguir Executivo e Câmara: há nova seção de Folha da Câmara na p. 324 e eSocial na p. 289. As 134 linhas das matrizes não cobrem todos os módulos nem substituem leitura dos dois escopos. |
| `01_Documentos_da_POC/IBEMA_Especificacoes_Funcionais_Executivo.pdf` | 169 páginas; especificações, obrigações e integrações. Útil para detalhar contratos de dados e fluxos que o checklist resume. | Confirmar a versão do certame aplicável, retificações e distinção entre funcionalidade, implantação e obrigação contratual. Não tratar uma tela como prova de toda a especificação. |
| `01_Documentos_da_POC/IBEMA_Funcionalidades_Gerais.pdf` | 11 páginas; Cadastro Único, consistência, filtros combinados, operadores, relatórios e requisitos transversais. | Paginação de 20 e filtros básicos do RH não comprovam todos os operadores, consultas personalizadas, exportações Excel/PDF e recursos gerais pedidos. Usar como checklist transversal. |

### 3.2 Catálogo, download e guia — 8 arquivos

| Arquivo em `02_Fontes_Publicas_Baixar/` | Uso recomendado | Limite / ação necessária |
|---|---|---|
| `CATALOGO_FONTES_OFICIAIS.csv` | Índice pesquisável das 60 fontes, finalidade e prioridade. | O campo `url_confirmada` é uma declaração do pacote; não é revalidação atual de todos os links. |
| `CATALOGO_FONTES_OFICIAIS.json` | Mesmos registros, consumo por ferramenta de aquisição. | Não importar como regras de folha; contém metadados e links. |
| `DOWNLOAD_RESULTADOS.json` | Rastreabilidade de URL, tamanho, data, status e hash. | 38 sucessos e um 404; não interpretar como 60 arquivos disponíveis. |
| `baixar_fontes_oficiais.py` | Aquisição por grupo/prioridade, limite de tamanho, verificação de assinatura de arquivo e hash. | `%PDF`/`PK` e hash não validam conteúdo jurídico. Conferir tratamento dos já existentes, resultados de nova execução e escolha da versão antes de substituir um download. |
| `BAIXAR_FONTES_WINDOWS.bat` | Inicializador Windows usando `py -3` ou `python`, repassando argumentos. | Ferramenta operacional; não participa do cálculo nem é requisito demonstrado. |
| `ESTATUTO_IBEMA_ABRIR_ORIGINAL.url` | Atalho para consultar a origem municipal. | A URL não atesta texto consolidado. |
| `LEIA-ME_DOWNLOADS.md` | Instruções de aquisição e limitações de acesso. | Ler com o manifesto e esta análise: downloads já estão presentes neste checkout. |
| `MAPA_ESTATUTO_IBEMA_LEITURA_OBRIGATORIA.md` | Guia dos artigos para localizar regras e conflitos. | Autoral; usar o original. Confirma-se a atenção às lacunas de faltas no art. 101; conferir também remissões aparentemente inconsistentes no art. 74. |

### 3.3 Fontes baixadas — 38 arquivos

Prefixo comum: `02_Fontes_Publicas_Baixar/DOWNLOADS_OFICIAIS/`.

| Arquivo | Aproveitamento nos módulos | Limite / recomendação |
|---|---|---|
| `01_Ibema/IBEMA-EST-001.pdf` | 44 páginas; base municipal histórica para ATS, férias, licença-prêmio, adicionais, afastamentos e atos. Ver seção 4. | LC 025/2005; alterações e vigência em 2026 não demonstradas. Não ativar regras municipais de produção apenas com esta cópia. |
| `02_Parana_RH/PARANAGUA-001.pdf` | Requerimento de férias; campos de aquisitivo, períodos, abono e anuências. Adaptar ao Portal/RH/GED. | Antecedência de 25 dias, mínimo de 10 dias por parcela e opções de abono de 10/15 dias pertencem ao modelo de Paranaguá. |
| `02_Parana_RH/PARANAGUA-002.pdf` | Solicitação de licença-prêmio; reúne quinquênio, impedimentos, informação da unidade, RH, decisão e ciência. Excelente referência de jornada Portal/RH/Protocolo. | Solicita **60 dias** e verifica limite de **um sexto** dos servidores afastados na unidade; não copiar essas condições para os 90 dias do Estatuto histórico de Ibema. |
| `02_Parana_RH/PR-M4-001.pdf` | 396 páginas, setembro/2026; catálogo de vantagens/descontos, agrupamentos por população, bases, memórias e documentação de rubricas. | Códigos Meta4, leis estaduais, gratificações e percentuais não devem ser copiados para o motor municipal. Melhor fonte de estrutura que de parâmetro local. |
| `02_Parana_RH/PR-M4-002.pdf` | 63 páginas, julho/2021; referências de relatórios de vagas, cargos, eventos, organismos e perfis. Adaptar filtros/colunas ao relatório RH e quadro de cargos. | Tela ou relatório Meta4 não prova disponibilidade no CeleriFlow. Modelos antigos devem ser ajustados aos dados atuais. |
| `02_Parana_RH/PR-TESTES-001.pdf` | Formulário de homologação; registrar percurso, entrada, esperado, observado, responsável e evidência. | Modelo de procedimento; assinatura em branco não é homologação. |
| `03_Contabilidade/PR-SIAFIC-001.pdf` | 37 páginas; conferência da folha, NE/NL, correções, assinaturas, arquivos bancários e desembolso. Guia de jornada RH → Financeiro → Contabilidade. | Manual estadual de operação, não plano de contas municipal nem layout SIM-AM. A ponte atual cria solicitações de despesa, não encerra NE/NL/pagamento. |
| `04_Ponto_Relatorios/BH-PONTO-001.pdf` | 24 páginas, perfil servidor; espelho, justificativas e consulta de frequência. Inspirar Portal e ponto. | Regras PBH e comportamento do STOU IFPONTO não são parametrização municipal. Algumas páginas têm pouco texto extraível. |
| `04_Ponto_Relatorios/BH-PONTO-002.pdf` | 53 páginas, perfil gestor; conferência, aprovação, tratamento de frequência e hierarquia. Inspirar fluxo de chefia/RH. | Separar marcação, apuração, autorização e lançamento em banco/folha; não converter saldo bruto automaticamente. |
| `05_eSocial/ESOCIAL-MOS-001.pdf` | 426 páginas; semântica, populações, prazos e dependências dos eventos. Fonte para S-1000/S-1005/S-1010/S-1020, admissões, remuneração, pagamentos, afastamentos e SST. | MOS não substitui leiaute/XSD nem classificação municipal. S-1200, S-1202 e S-1207 atendem populações diferentes. |
| `05_eSocial/ESOCIAL-NT07-001.pdf` | 6 páginas; alterações e calendário de implantação da NT 07/2026 revisada. Essencial para selecionar pacote por data/ambiente. | Há datas diferentes por grupo de alteração; não aplicar o pacote futuro imediatamente. |
| `05_eSocial/ESOCIAL-NT07ZIP-001.zip` | Três PDFs internos: tabelas (168 pp.), regras (34 pp.) e leiautes (311 pp.). Permitem mapear campos/códigos/validações oficiais. | Incluem alterações com implantação futura; selecionar a regra vigente e versionar tabelas. |
| `05_eSocial/ESOCIAL-XSD-001.zip` | 52 XSDs; base de validação estrutural local, inclusive `tipos.xsd` e `xmldsig-core-schema.xsd`. | XML bem formado não é evento validado nem aceito. Ainda falta construir/mapeiar/validar os eventos do sistema. |
| `05_eSocial/ESOCIAL-XSD-FUT.zip` | 52 XSDs de pacote futuro; preparar regressões e migração de versão. | Mesmo namespace do outro ZIP e bytes distintos. Controlar hash, pacote, ambiente e data, não apenas `v_S_01_03_00`. |
| `06_Formularios_PR/PR-CTC-EXON.pdf` | Informação de exoneração para instrução de CTC; cruzar vacância e histórico funcional. | Não gera CTC homologada nem direito previdenciário automaticamente. |
| `06_Formularios_PR/PR-CTC-REQ.pdf` | Requerimento de CTC; inspirar solicitação no Portal e anexos. | Formulário não comprova tempo; exige apuração/documentação e regra aplicável. |
| `06_Formularios_PR/PR-CTC-RH.pdf` | Informação RH para CTC; referência de conferência de vínculo/tempo. | Averbação ATS atual não equivale à emissão completa de CTC. |
| `06_Formularios_PR/PR-EXON-CAD.pdf` | Informação cadastral de exoneração; checklist de baixa funcional. | Adaptar ao contrato canônico e preservar histórico. |
| `06_Formularios_PR/PR-EXON-FIN.pdf` | Informação financeira de exoneração; consulta de pendências/valores. | Não substituir o cálculo oficial de rescisão e conciliação. |
| `06_Formularios_PR/PR-EXON-JUR.pdf` | Informação jurídica de exoneração; etapa de instrução/parecer. | Autoridades, prazos e fundamentos devem vir do fluxo local. |
| `06_Formularios_PR/PR-EXON-REQ.pdf` | Pedido de exoneração; Portal → protocolo → decisão → ato. | Requerimento não é desligamento efetivado. |
| `06_Formularios_PR/PR-EXON-RH.pdf` | Informação RH de exoneração; conferir vínculo e efeitos. | Usar com vacância, folha, documentos e eventos; não apenas mudar status. |
| `06_Formularios_PR/PR-FERIAS-ANUENCIA.pdf` | Anuência de férias; decisão de chefia e disponibilidade. | Estrutura reaproveitável; regra estadual não importável. |
| `06_Formularios_PR/PR-FERIAS-REQ.pdf` | Requerimento de férias; período, solicitação e instrução. | Vincular ao aquisitivo e reserva existentes, evitando saldo paralelo. |
| `06_Formularios_PR/PR-FERIAS-RH.pdf` | Informação RH de férias; saldo e conferência para decisão. | Alimentar com consulta real; formulário em branco não prova controle de direitos. |
| `06_Formularios_PR/PR-FERIAS-SUSPENSAO.pdf` | Suspensão/interrupção de férias; motivo, ato e saldo remanescente. | Diferenciar interrupção de gozo e cancelamento de reserva; observar art. 105 municipal histórico. |
| `06_Formularios_PR/PR-LICCAP-CHEF.pdf` | Manifestação da chefia para capacitação; tramitação. | Licença para capacitação estadual não equivale automaticamente à licença-prêmio de Ibema. |
| `06_Formularios_PR/PR-LICCAP-DEC.pdf` | Declaração para capacitação; anexos/compromissos. | Reaproveitar documento e validação de campos, não importar direito material. |
| `06_Formularios_PR/PR-LICCAP-REQ.pdf` | Requerimento de capacitação, 2 páginas; dados da atividade e instrução. | Exige política específica se a licença existir no regime local. |
| `06_Formularios_PR/PR-LICCAP-RH.pdf` | Informação RH de capacitação; conferência de requisitos. | Serviço genérico de direitos não comprova todas as condições deste modelo. |
| `06_Formularios_PR/PR-LICESP-DECISAO.pdf` | Decisão de licença especial; emissão do despacho/ato. | Não presumir que “licença especial” estadual e municipal têm a mesma aquisição. |
| `06_Formularios_PR/PR-LICESP-REQ.pdf` | Pedido de licença especial; jornada de gozo. | Usar saldo real e autorização, com regra municipal identificada. |
| `06_Formularios_PR/PR-LICESP-RH.pdf` | Informação RH de licença especial; tempo/saldo e elegibilidade. | Quinquênios civis, impedimentos e pecúnia ainda exigem evolução/validação. |
| `06_Formularios_PR/PR-LICSEM-DEC.pdf` | Decisão de licença sem vencimentos; ato e datas. | Precisa política de efeitos sobre direitos, remuneração e previdência. |
| `06_Formularios_PR/PR-LICSEM-FIN.pdf` | Manifestação financeira de licença sem vencimentos. | Exigir reflexos reais no cálculo; o formulário não os implementa. |
| `06_Formularios_PR/PR-LICSEM-PUBL.pdf` | Publicação de licença sem vencimentos; documento/ato. | Documento interno não equivale a publicação no Diário Oficial. |
| `06_Formularios_PR/PR-LICSEM-REQ.pdf` | Pedido de licença sem vencimentos; Portal/protocolo. | Requer deferimento e aplicação temporal ao contrato. |
| `06_Formularios_PR/PR-LICSEM-RH.pdf` | Informação RH de licença sem vencimentos; análise funcional. | Mapear cessação, retorno e tempo contável conforme regra local. |

### 3.4 Matrizes, fixtures e instruções — 8 arquivos

| Arquivo | Uso recomendado | Limite / ação necessária |
|---|---|---|
| `03_Matrizes_Requisitos/MATRIZ_OFICIAL_POC_114_ITENS_FOLHA.csv` | Roteiro requisito a requisito, fonte e aceite sugerido. Redação conferida no PDF. | Campos de implementação/evidência não comprovam execução; cruzar com a matriz atual `PLANO_FOLHA_RH_ESOCIAL_CHECKLIST_POC_70-85_96-98.md`. |
| `03_Matrizes_Requisitos/MATRIZ_OFICIAL_POC_20_ITENS_ESOCIAL.csv` | Aceites de cadastro, geração, assinatura, envio, retorno e gestão. Redação conferida. | Arquivos internos e outbox não atendem sozinhos transmissão/recibos oficiais. |
| `03_Matrizes_Requisitos/INTERFACES_ENTRE_MODULOS.csv` | 12 interfaces: Portal, SST, financeiro, custos e transparência. | Registros `NAO_AUDITADO` são backlog, não descrição atual. Registrar origem, contrato, autorização, persistência e evidência. |
| `04_Dados_e_Casos_de_Teste/CATALOGO_RUBRICAS_PARAMETRIZAR.csv` | 42 rubricas propostas; taxonomia inicial para fixtures e memória de cálculo. | Incidências `VALIDAR`, natureza eSocial `PREENCHER_CONFORME_TABELA` e conta `DEFINIR_CONFORME_PC_DESPESA`: não é arquivo pronto para importação oficial. V/D/I precisam conversão para tipos internos. |
| `04_Dados_e_Casos_de_Teste/CENARIOS_TESTE_RH_FOLHA_2026.csv` | 40 casos de aritmética, fluxo, conflitos jurídicos e acesso. | Diversos esperados são `{}` ou instruções de conferência. Completar assertivas, dados e observáveis antes de usar como regressão do sistema. |
| `04_Dados_e_Casos_de_Teste/CENARIOS_TESTE_RH_FOLHA_2026.json` | Mesmos 40 cenários, entradas estruturadas para preparação de testes. | Não é seed Prisma nem configuração de produção. |
| `04_Dados_e_Casos_de_Teste/teste_calculos_referencia.py` | Oracle didático Decimal; 11 testes passaram. Útil para valores de referência selecionados. | Cobertura parcial; não executa os 40 casos nem o motor real. ATS recebe anos inteiros e IRRF é explicitamente simplificado. |
| `06_Instrucoes_Codex/PROMPT_INICIAL_PARA_CODEX.md` | Material de continuidade e roteiro de auditoria. | É documento do pacote, não fonte normativa nem estado da implementação. Nomes/paths sugeridos devem ser confrontados com o repositório. |

### 3.5 Modelos autorais de relatórios — 8 arquivos

Prefixo: `05_Modelos_de_Relatorios/`. Todos exibem dados fictícios e caráter ilustrativo.

| Arquivo | O que reutilizar | O que ainda precisa ser real |
|---|---|---|
| `AVISO_FERIAS_EXEMPLO.html` | Matrícula, aquisitivo, gozo, dias, parecer e despacho. | Dados da reserva, decisão/ato, identificador, emissão e histórico. |
| `BANCO_DE_HORAS_EXEMPLO.html` | Saldo anterior, créditos autorizados, compensações e saldo atual. | Ledger do titular, período, origem, transferências, expiração e estornos. |
| `CONTRACHEQUE_EXEMPLO.html` | Organização de identificação, rubricas, referências e bases. | Proventos/descontos/líquido do snapshot. Exemplo mistura “estatutário” e RGPS ilustrativo: não deduzir o regime real dessa combinação. |
| `ESPELHO_PONTO_EXEMPLO.html` | Jornada, marcações, total previsto/trabalhado e ocorrências. | Apuração por intervalo, justificativas, anuência e regra de banco/extra; saldo bruto não é crédito autorizado. |
| `INFORME_RENDIMENTOS_EXEMPLO.html` | Estrutura de identificação e categorias anuais. | Apuração fiscal por pagamentos, isenções, tributação exclusiva, RRA e retificações. Histórico anual de contracheques não é informe fiscal completo. |
| `LICENCA_PREMIO_EXEMPLO.html` | Aquisitivo, saldo, gozo/pecúnia, decisão e fundamento. | Regra vigente, tempo contável, impedimentos e autorização; reserva de pecúnia não é pagamento. |
| `RESUMO_CONTABIL_FOLHA_EXEMPLO.html` | Agrupamento por centro/classificação e separação de componentes. | Mapeamento do plano de contas, despesa/empenho/liquidação/pagamento e reconciliação com folha. |
| `TERMO_EXONERACAO_EXEMPLO.html` | Identificação, datas, motivo e campos de ato. | Decisão, efeitos financeiros, documentos e evento; o HTML não representa rescisão oficial processada. |

## 4. Estatuto original: regras úteis e divergências relevantes

Referências abaixo usam a paginação do PDF/folhas do Estatuto. Fonte: `IBEMA-EST-001.pdf`, SHA-256 `e5e5bafd73aaebcdc0892c5771d73d979b093092c8fb1beaf33a1f351a8a1183`. São regras **históricas para análise e demonstração identificada**, pendentes de consolidação atual.

| Tema | Conteúdo observado / referência | Consequência no sistema |
|---|---|---|
| ATS | Art. 56: 5% por cinco anos, teto 30%, base vencimento. | O serviço atual usa faixas por dias explicitamente configuradas. Cinco anos civis não equivalem automaticamente a 1.825 dias: incluir calendário, ano bissexto, tempo contável e transições. Casos T01–T03 são aritmética de quinquênios, não prova de aquisição. |
| 13º | Arts. 57–59; avos, fração de exercício e remuneração elegível; art. 59 na p. 13 impede usar o 13º para calcular outras vantagens. | Oito tipos especiais existem como simulação persistida; completar avos, médias, parcelas, tributação e processamento oficial. |
| Extra | Arts. 60–61, p. 13: 50% de segunda 06h até sábado 12h; 100% de sábado 12h até segunda 06h; limite de duas horas por jornada e autorização. | Não usar apenas “dia útil/fim de semana”. Apurar segmentos que atravessam sábado 12h, segunda 06h e horário noturno, com ato e limite. |
| Noturno | Art. 62, p. 13: 22h–05h, 20%, hora de 52m30s; adicional sobre remuneração extraordinária nos casos indicados. | T10 valida apenas 420/52,5 = 8. Falta demonstrar intervalos, cruzamento de datas, extra noturna, base e lançamento sem duplicidade. |
| Terço de férias | Art. 63, pp. 13–14: 1/3 da remuneração do período; trata também vantagem de função/comissão. | Validar composição da base e evitar pagar novamente remuneração já incluída na folha. T04/T30 apenas calculam o terço. |
| Insalubridade/periculosidade | Arts. 64–67, p. 14: opção por um dos adicionais, cessação com eliminação do risco, laudo e controle de exposição. | Reutilizar SST e origens funcionais; vincular vigência do laudo/ato e não presumir percentual do manual estadual. |
| Licença-prêmio | Arts. 73–75, pp. 16–17: 90 dias, cinco anos ininterruptos e referência à permanência no Município; perda por 20 faltas ou mais, penalidade e licenças em condições especificadas. | Controle atual por dias/suspensão/reinício serve de base. Completar elegibilidade municipal, eventos contáveis e calendário; não conceder por simples aniversário ou averbação ATS. |
| Remuneração da licença-prêmio | Art. 73, p. 17: vencimento, ATS e salário-família; há regra de gratificação recebida por período superior a 60% do aquisitivo. | “90 dias” não define a base financeira. Implementar avaliação histórica da gratificação antes de cálculo oficial. |
| Pecúnia de licença-prêmio | Art. 75, p. 17: necessidade imperiosa, critério da administração, requerimento protocolado; 50% em dinheiro e outros 50% em gozo. | Serviço genérico de reservas não comprova essas condições. T19 ajuda a demonstrar 45/45, mas deve haver decisão/processo e fluxo financeiro distinto da reserva. |
| Remissões | Art. 74, p. 17, menciona incisos de afastamentos cuja correspondência no texto histórico merece conferência. | Não inferir lista de exceções a partir de remissão duvidosa; obter consolidação/interpretação antes de regra oficial. |
| Férias | Arts. 100–101, pp. 23–24: 30 dias; acumulação até dois períodos em necessidade de serviço; aquisição a cada 12 meses. | Múltiplos aquisitivos e reservas já existem, mas devem receber políticas específicas, perdas/prorrogações e limite aplicável. |
| Faltas e férias | Art. 101, p. 24: até 5 → 30 dias; mais de 6 até 14 → 24; mais de 15 até 23 → 18; mais de 24 até 32 → 12; mais de 33 → perda. | A leitura literal deixa **6, 15, 24 e 33** sem faixa. T20–T23 são bons casos de regra não resolvida; não preencher lacunas automaticamente com CLT. |
| Abono de férias | Art. 101 §5º, p. 24: conversão de 1/3 sob critério da autoridade e requerimento até 15 dias antes do fim do aquisitivo; §6º restringe outras conversões. | Não importar opções de 10/15 dias de Paranaguá. Vincular direito, prazo, autorização e regra própria. |
| Férias especiais | Arts. 102–103, p. 24: perdas em licenças indicadas e 20 dias por semestre para trabalho direto/permanente com raios X/radioatividade, sem acumulação. | Integrar ocupação/exposição SST e períodos especiais; o calendário anual genérico não cobre esse caso. |
| Desligamento e férias | Art. 104, p. 25: pagamento até dois dias antes do gozo; indenização e 1/12 por mês/fração superior a 14 dias, base no mês de publicação da exoneração. | T29 é referência numérica, mas ato/data, avos, base e fluxo oficial de rescisão permanecem necessários. |
| Interrupção | Art. 105, p. 25: hipóteses específicas e saldo restante gozado de uma só vez. | Distinguir interrupção efetiva, cancelamento e estorno de reserva. |
| Protocolo | Art. 108, p. 25, prevê encaminhamento de requerimento pelo protocolo. | Aproveitar Protocolos/GED existentes para solicitações de direitos e atos; não criar repositório documental paralelo. |

Os arts. de licenças, maternidade/adoção e vacância contêm disposições históricas sensíveis a alterações posteriores. Não carregar prazos/idades do texto de 2005 como padrão atual. Solicitar consolidação e atos aplicáveis.

## 5. eSocial: o pacote reduz a dependência documental, não a de homologação

Há material local para implementar mapeamentos, XML, tabelas, validações de negócio e regressões. Os schemas de eventos e XMLDSig estão disponíveis. Ainda são necessários especificação do cliente de serviços/retornos, gestão de certificado, assinatura efetiva, transmissão, consulta, recibos, retificação/exclusão e reconciliação.

Na NT 07 revisada, seção 3.3 (p. 3), o pacote futuro tem previsão de **produção restrita em 13/10/2026 e produção em 26/10/2026**. O caso T35 com envio em 11/10/2026 corretamente evita aplicar esse pacote. Existem outros grupos de alterações e datas, inclusive previsão em 2027; não usar uma data única para toda a nota.

Os dois ZIPs têm namespace `http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00`, mas conteúdos distintos. Identidade de versão deve incluir pacote/hash e calendário por ambiente. Incluir casos antes/no/depois da implantação; validar separadamente regras de negócio que um XSD não expressa.

Para demonstração interna, mostrar evento construído, versão escolhida, validações e status **não transmitido**. Isso é avanço demonstrável de engenharia, mas não atende por si só os itens de gerar **e assinar e enviar e receber retorno** no ambiente oficial.

`obligation-export.ts` produz arquivos configuráveis CSV/ASCII com histórico e hash e mantém `officialLayout=false`. Não é gerador XML eSocial, CADPREV, SIM-AM ou arquivo bancário homologado.

## 6. Casos, rubricas e cálculo: o que pode virar regressão

| Casos | Aproveitamento | Complementação necessária |
|---|---|---|
| T01–T03 | Percentuais e teto ATS. | Datas civis, averbação, sobreposição de vínculos, impedimentos, vigência e estornos no serviço real. |
| T04–T10 | Terço, 13º, extra 50/100 e conversão de hora noturna. | Bases reais, médias, calendários, fracionamento, integração da origem e tributação. |
| T11–T12 | RGPS progressivo com exemplos 4.400 → 417,51 e 1.621 → 121,58. | Confirmar tabela vigente por competência; teto, multivínculo/fontes externas, arredondamento e 13º separado. Não aplicar RGPS a RPPS. |
| T13–T15 | IRRF 2026, renda tributável versus base deduzida e limite de redução. | Validar faixa intermediária, teto da redução e situações especiais. O motor atual calcula tabela progressiva e deduções, mas não implementa nesse fluxo a redução mensal da Lei 15.270/2025. Não declarar T13 homologado por o script Python passar. |
| T16 | RRA e referência de seis meses. | Resultado 18.000/6 não é cálculo tributário de RRA. Exigir processo, distribuição editável, regime próprio e pagamentos. |
| T17–T19 | Licença-prêmio: aquisição, perda e reserva gozo/pecúnia. | Cinco anos civis/continuidade, faltas, penalidades, licenças e remuneração histórica; teste T18 ainda não traz resultado determinado. |
| T20–T28 | Casos limite de faltas/férias, especialmente lacunas. | Decisão jurídica e parametrização versionada; testar também cancelamentos, retorno e ajustes. |
| T29–T30 | Férias proporcionais e terço de referência. | Motor oficial especial, avos, data do ato, deduções e consumo de direitos. |
| T31–T34 | Pensões, provisões, dois vínculos e reprocessamento. | Converter `{}` em resultados verificáveis: beneficiários, parcelas, ledger, saldos, eventos, rollback e ausência de duplicidade. |
| T35–T36 | Calendário XSD e ausência de transmissão. | Validar XML real e distinguir processamento local de retorno do órgão. |
| T37–T38 | Ponto: 495 trabalhados vs. 480 previstos; banco 510 − 300 = 210 minutos. | Tolerância, aprovação, jornada, origem e lançamento autorizado; testar estorno, transferência e FIFO. |
| T39–T40 | Acesso do titular e controle de certificado. | Executar nos endpoints reais. T40 depende de existir armazenamento/uso de certificado; formulário de teste não prova esse controle. |

O catálogo de 42 rubricas pode orientar configurações demonstrativas, com origem/fundamento e escopo explícitos. Incidências, códigos eSocial e contas devem ser preenchidos a partir de classificação validada; fórmulas e tipos precisam tradução para o schema interno. Não usar `VALIDAR` como `false` ou zero.

A página oficial da Receita Federal de tabelas 2026 foi consultada como fonte complementar (`https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026`). A URL é catalogada, mas não está arquivada como PDF no pacote. A definição completa da política fiscal e seus casos ouro deve ser registrada em incremento próprio.

## 7. Cruzamento com os módulos atuais

| Módulo / serviços | Reuso e demonstração possível | Lacuna principal |
|---|---|---|
| Cadastro Único / `employee-person.ts`, `contract-timeline.ts`, `contract-custom-fields.ts` | Pessoa compartilhada, identidade funcional, contratos/revisões e campos configuráveis; comparar com FOLHA-001/005/009/010. | Consultas integrais, temporalidade completa de multivínculo, progressões/designações/cessões e rateio intramês. |
| Folha / `workforce-service.ts`, `calculation-engine.ts` | Mensal, rubricas, Decimal, memória, simulação/oficial, conferência, snapshots e reprocessamento controlado. | IRRF completo 2026, políticas fiscais especiais e alocação temporal; bases municipais precisam parametrização. |
| Direitos / `vacation-rights.ts`, `vacation-multiple-periods.ts`, `service-rights.ts`, `service-time-allowance.ts` | Aquisitivos, saldos, reservas, gozo combinado, licença por dias, ATS e averbação ATS. | Regras civis municipais, perdas/exceções e pecúnia/pagamento oficial. |
| Ponto / `attendance-payroll.ts`, `time-bank*.ts`, `remuneration-average.ts` | Apuração/origens, médias, ledger, transferência, conversão, estorno e expiração explícita. | Jornada completa por regime, horas noturnas/extra segmentadas e automação de políticas. |
| Folhas especiais / `special-simulation.ts` | Oito tipos especiais com entradas/regras e simulação persistida rastreável. | Não fecham oficialmente nem tributam/consomem automaticamente todos os direitos. |
| Financeiro / `finance-bridge.ts` | Prévia por centro, bruto/patronal separados, solicitações nativas e replay. | Aplicação exige folha e parâmetros de produção; demonstração não pode ser promovida a produção só para gerar despesa real. Ainda falta ciclo contábil integral. |
| Provisões / `payroll-provisions.ts`, `provision-commitment.ts` | Memória por rubrica, ledger anual, apropriação/estorno e baixa explícita vinculada a empenho nativo. | Ledger RH não é razão patrimonial; baixas automáticas, anulações parciais, liquidação/pagamento e conciliação completa. |
| Portal / `statement-service.ts`, `portal-requests.ts`, `recertification.ts` | Publicação de demonstrativo/PDF, titularidade, mensagens, solicitações e recadastramento. | Informe anual fiscal, jornadas completas de todos os requerimentos e liberação/carência de margem por banco. |
| Consignações / `consignment-service.ts`, `consignment-margin.ts`, `credit-requests.ts` | Margem agregada, contratos/parcelas simples e reserva/decisão de crédito. | Submargens, renegociações, convênio/web service e carência do FOLHA-084. |
| SST | Usar identidade funcional, laudos/atos, afastamentos e origens de benefícios/folha já existentes. | Eventos XML S-2210/S-2220/S-2240 e regras de exposição/férias especiais, com sigilo e vigência. |
| GED/Assinaturas e Protocolos | Formulários viram requerimentos, anexos, pareceres, atos e históricos no núcleo existente. | Concluir vinculações das jornadas. GED é recurso integrado; modelos HTML não são documentos assinados. |
| eSocial / `external-configuration.ts`, `obligation-history.ts`, outbox | Configuração, preparação de dados, histórico interno; material para próximo incremento XML/XSD. | Worker/cliente, assinatura, transmissão e retorno oficial permanecem pendentes. |
| Custos / Transparência | Aproveitar centros do snapshot e parâmetros de publicidade. | Demonstrar apropriação real e publicação permitida; não expor contracheque privado como transparência pública. |

### Aproveitamento em outros módulos

Os três PDFs do certame têm utilidade além de RH. No checklist: Contábil/Financeiro começa na p. 13; Custos na p. 40; Construção Civil na p. 126; Protocolo/Processo Digital na p. 131; Serviços Públicos na p. 139; Autoatendimento na p. 151; Transparência na p. 163; Cemitérios na p. 192. Esses trechos permitem atualizar aceites e roteiros dos módulos já desenvolvidos. A situação de cada requisito deve ser verificada separadamente; a análise do pacote não os declara homologados.

Para Obras e Construção Civil e Cemitérios, usar redação do certame e fluxos compartilhados de pessoa, endereço, documento, protocolo e financeiro. Para Iluminaflow, os requisitos de Serviços Públicos/Autoatendimento ajudam a detalhar solicitações e tramitação; manter seu acesso próprio. O pacote não fornece normas técnicas completas de iluminação nem parâmetros específicos suficientes para esses módulos. A documentação RH estadual não deve introduzir regras em tais domínios.

## 8. Roteiro de demonstração recomendado

Cada jornada deve mostrar entrada, regra/versão, resultado persistido, memória, autorização, documento e comportamento de repetição/estorno. Registrar observado e evidência por requisito, usando o formulário de homologação como inspiração.

1. **Pessoa e contrato:** criar pessoa fictícia única, matrícula e dois contratos; consultar alterações e quadro de cargos. Demonstrar filtros e indicar os operadores efetivamente disponíveis.
2. **Mensal:** configurar rubricas demonstrativas, calcular, conferir memória, corrigir movimento, reprocessar e mostrar snapshot/versionamento. Evitar apresentar IRRF simplificado como tributação integral 2026.
3. **Portal:** publicar explicitamente, entrar como titular, baixar demonstrativo e testar bloqueio para outro servidor; apresentar recadastramento com decisão RH.
4. **Férias:** mostrar aquisitivos/saldos, combinação de períodos, reservas, cancelamento e aviso baseado em dados reais. Casos de faltas sem faixa devem apontar regra não resolvida.
5. **Licença-prêmio/ATS:** demonstrar política por dias identificada, aquisição, reserva, impedimento/suspensão, averbação ATS e estorno. Separar essa capacidade da regra municipal por cinco anos civis.
6. **Ponto/banco:** marcações → apuração → autorização → ledger; mostrar transferência sem rejuvenescimento, expiração explícita e compensação/estorno.
7. **Especial:** escolher 13º/férias/RRA e apresentar simulação persistida com premissas e memória; explicar estado sem fechamento oficial.
8. **Financeiro/provisões:** apresentar prévia, apropriação, ledger e vínculo de baixa. Só executar despesa real em ambiente com configuração de produção legítima; demonstrar o percurso nativo em base apropriada e identificada.
9. **eSocial:** demonstrar preparação/histórico interno hoje; acrescentar geração e validação local quando implementadas. Recibo oficial somente após retorno real.
10. **Documentos:** encaminhar requerimento e parecer usando Protocolos/GED, emitir a versão vinculada ao registro e mostrar o histórico de decisão.

O seed demonstrativo precisa confirmar Dados da Prefeitura (nome, município e UF), perfis de acesso, configuração do ente e migrações sincronizadas. A presença dos PDFs não corrige essas pré-condições. A última evidência registrada de seed indicava falta desses dados; não houve nova execução nesta análise.

## 9. Prioridades de desenvolvimento sem dependência externa

| Prioridade | Entrega interna | Aceite objetivo |
|---|---|---|
| P0 | Consolidar evidências por requisito e fazer percurso autenticado/impressão. | ID da matriz → tela/serviço → entrada → resultado/evidência → limitação; sem marcar “atendido” por existência de arquivo. |
| P0 | Política IRRF 2026 e testes do motor real. | Casos oficiais de renda até 5.000, faixa de redução, 7.350/acima, deduções, dependentes e vínculos; regra temporal e memória explicando redução. |
| P1 | Direitos por calendário civil e políticas de faltas/exceções. | Anos bissextos, datas limite, continuidade, remissões resolvidas/configuradas e separação de regime; casos históricos em escopo demo até confirmação. |
| P1 | Jornadas de requerimentos/atos e relatórios com dados reais. | Portal → RH → Protocolo/GED; decisão, saldo e documento derivam do mesmo registro; sem planilha paralela. |
| P1 | Evoluir folhas especiais oficiais. | Avos/médias, impostos, direitos, fechamento, retificação/estorno e conciliação; não promover a simulação existente sem completar efeitos. |
| P1 | Gerador XML eSocial e validação local versionada. | Eventos mínimos por população, schemas e regras vigentes, erros por campo, calendário/hash e fixtures sem transmissão. |
| P2 | Razão/retencões/repasses e ciclo nativo até pagamento. | Reconciliação bruto/descontos/líquido/patronal, empenho, liquidação, pagamento, baixa de provisões e anulações. Implementação pode avançar com mapeamentos demo explicitados. |
| P2 | Informe fiscal anual, consultas/exportações e margem avançada. | Histórico por pagamento/categoria fiscal, saídas integrais, filtros exigidos e jornada por banco. |

Cada entrega deve atualizar `RH_FOLHA_EXECUCAO.md` e a matriz atual; manter testes pertinentes e build antes de eventual commit. Esta inspeção documental não alterou o motor, seed ou dados do banco.

## 10. O que falta pedir ao usuário

### Necessário para parametrização municipal oficial

1. **Estatuto consolidado/alterações da LC 025/2005 e atos vigentes**, especialmente férias, ATS, licença-prêmio, adicionais, maternidade/adoção e tempo contável. Incluir interpretação/correção das faixas 6/15/24/33 faltas e remissões do art. 74.
2. **Plano de cargos/salários e tabelas vigentes**, jornadas, regras de função/gratificação, autorização de extra, banco, benefícios e consignações; datas de efeitos e diferenças por população.
3. **Regimes previdenciários por categoria/vínculo**, leis locais, alíquotas/base RPPS, patronal/suplementar, aposentados/pensionistas e regras de múltiplas fontes. O pacote não contém um arquivo local identificado como Portaria MTP 1.467/2022 ou manual FGTS Digital; eventual citação no dossiê não significa anexo disponível.
4. **Uma folha mensal e casos especiais conferidos, anonimizados**, com rubricas/incidências, memória, totais e dados de pagamento; preferencialmente incluir dois vínculos, férias, 13º, rescisão e RRA. Servem de casos ouro para confronto do motor real.

### Necessário para integrações específicas

5. **Mapeamentos contábeis municipais, exercício e layouts de prestação de contas** (PCASP/PCASPM-PR, despesa, SIM-AM/CADPREV conforme exigência), com exemplo aceito. O pacote traz links de consulta, não todos esses artefatos preenchidos.
6. **Bancos e layouts contratados**, arquivos exemplo anonimizados, retorno e convênios de consignação. Não há layout bancário suficiente nos HTMLs/manuais para declarar exportação homologada.
7. **Populações/classificações eSocial do ente** e parâmetros de estabelecimentos/lotações/rubricas; para homologação de envio, ambiente e acesso autorizado ao certificado/serviços. A preparação XML local pode avançar antes desses acessos; não enviar chaves/senhas no chat ou versioná-las.
8. **Versão final do edital/retificações e escopo da apresentação** (Executivo/Câmara e módulos avaliados), para confirmar que a matriz selecionada corresponde à sessão de POC.

O formulário de General Carneiro que falhou (`GENERALCARNEIRO-001`, HTTP 404) é referência opcional e não bloqueia os desenvolvimentos: os modelos de requerimento existentes já permitem estruturar o fluxo.

## 11. Continuidade e resultado desta análise

O aproveitamento dos **67 arquivos originais** está registrado nas tabelas, com separação entre requisito do certame, norma histórica, referência externa, fixture e modelo autoral. O inventário é um retrato anterior à criação deste relatório/nota de atualização.

Próximo incremento recomendado: evidências/percurso da POC e IRRF 2026, seguido por calendário de direitos e jornadas documentais. O desenvolvimento interno pode seguir com parâmetros demonstrativos identificados; a homologação municipal/oficial depende dos dados listados na seção 10.

Validações desta entrega: 11 testes do pacote aprovados, paridade dos catálogos/cenários, correspondência dos 134 textos, hashes dos downloads, integridade dos ZIPs e sintaxe dos XSDs. Não houve novo build da aplicação nesta entrega documental, nem commit/push.
