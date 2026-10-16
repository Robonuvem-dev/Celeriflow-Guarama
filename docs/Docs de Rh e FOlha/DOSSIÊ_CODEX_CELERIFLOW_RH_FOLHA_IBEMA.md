# DOSSIÊ TÉCNICO E OPERACIONAL — CELERIFLOW
## Módulo de RH e Folha de Pagamentos | Prova de Conceito de Ibema/PR

**Destinatário:** Codex / desenvolvedores do CeleriFlow  
**Data de referência:** 11 de outubro de 2026  
**Classificação:** planejamento, implantação, testes e homologação técnica. Não é parecer jurídico nem certificação de integração governamental.  
**Objetivo:** reaproveitar a aplicação atual, implementar fluxos completos de RH e Folha com regras parametrizadas, demonstrar evidências de operação na POC de Ibema e preparar integrações internas e externas sem depender da entrega imediata de dados/credenciais da Prefeitura.

> **INSTRUÇÃO PRINCIPAL AO CODEX:** Antes de criar qualquer código, descubra o que já existe. Leia o checklist original, analise pastas, rotas, tabelas Prisma, serviços, permissões e relatórios. Preencha as matrizes em `03_Matrizes_Requisitos/` com status e evidência. Não altere infraestrutura, `.env`, projetos Vercel, provedores de autenticação, base Neon ou migrations sem plano e confirmação. Desenvolva funções de ponta a ponta; não considere um item atendido apenas por existir uma tela ou botão.

---

# 1. O QUE VEM NESTE PACOTE

| Recurso | Pasta/arquivo | Como usar |
|---|---|---|
| Documento oficial fornecido pelo usuário | `01_Documentos_da_POC/IBEMA_Checklist_Real_POC_Executivo_Camara.pdf` | **Obrigatório e prioritário.** Fonte dos passos de demonstração exigidos na POC. |
| Termo de referência funcional fornecido | `01_Documentos_da_POC/IBEMA_Especificacoes_Funcionais_Executivo.pdf` | Descrição técnica mais ampla; validar itens do TR além da lista da POC. |
| Funcionalidades gerais fornecidas | `01_Documentos_da_POC/IBEMA_Funcionalidades_Gerais.pdf` | Requisitos globais (autenticação, exportação, apresentação, integrações etc.). |
| Matriz literal da POC — folha | `03_Matrizes_Requisitos/MATRIZ_OFICIAL_POC_114_ITENS_FOLHA.csv` | 114 itens numerados extraídos do PDF do usuário; marcar atendimento e evidência de cada item. |
| Matriz literal da POC — Gestão eSocial | `03_Matrizes_Requisitos/MATRIZ_OFICIAL_POC_20_ITENS_ESOCIAL.csv` | 20 itens numerados de integração/eSocial do checklist. |
| Dependências de outros módulos | `03_Matrizes_Requisitos/INTERFACES_ENTRE_MODULOS.csv` | Contratos de integração com Portal do Servidor, Contábil, Custos, SST e outros. |
| Catálogo de fontes | `02_Fontes_Publicas_Baixar/CATALOGO_FONTES_OFICIAIS.json/.csv` | **60 fontes identificadas**: URL, uso, prioridade e natureza; nem todas são documentos a baixar. |
| Estatuto de Ibema | Link oficial no catálogo + `ESTATUTO_IBEMA_ABRIR_ORIGINAL.url` | **Fonte jurídica local primária**; obter PDF pelo script; conferir alterações. |
| Script de obtenção das fontes | `02_Fontes_Publicas_Baixar/baixar_fontes_oficiais.py` | Baixar PDFs/ZIPs oficiais na máquina do desenvolvedor, validar formato e hash. |
| 42 rubricas propostas | `04_Dados_e_Casos_de_Teste/CATALOGO_RUBRICAS_PARAMETRIZAR.csv` | Sem inventar incidência; campos fiscais inicialmente marcados VALIDAR. |
| 40 cenários de validação | `04_Dados_e_Casos_de_Teste/CENARIOS_TESTE_RH_FOLHA_2026.json/.csv` | Criar testes automatizados e cenários POC com resultados justificáveis. |
| Modelos autorais | `05_Modelos_de_Relatorios/*.html` | 8 exemplos de formulários/relatórios **fictícios** e imprimíveis, para adaptação. |
| Testes de referência aritmética | `04_Dados_e_Casos_de_Teste/teste_calculos_referencia.py` | Verifica números de alguns exemplos, sem substituir o motor jurídico definitivo. |
| Prompt operacional | `06_Instrucoes_Codex/PROMPT_INICIAL_PARA_CODEX.md` | Mensagem inicial para rodar a auditoria de código/funcionalidades. |

**Limitação documental declarada:** o ZIP contém os três PDFs da POC já fornecidos nesta conversa. **Não contém fisicamente o PDF original do estatuto de Ibema nem os arquivos SEAP, Receita, eSocial e TCE-PR**, porque a gravação desses binários remotos não estava disponível no ambiente de preparação. O link oficial do estatuto foi conferido como PDF digitalizado de 44 páginas; todos os arquivos externos constam do catálogo, e o script tenta obtê-los com acesso à internet. Nunca alegar ao usuário que um PDF público foi incluído antes de verificar sua presença na pasta de downloads.

### 1.1. Como navegar no material

1. Ler este documento integralmente e gerar um sumário de riscos e pendências.
2. Ler os 3 PDFs da POC **antes** de implementar. Extrair o texto de páginas pertinentes ao RH; não despejar todo um PDF enorme no contexto do agente de uma só vez.
3. Abrir `MATRIZ_OFICIAL_POC_114_ITENS_FOLHA.csv` e `MATRIZ_OFICIAL_POC_20_ITENS_ESOCIAL.csv`; observar a redação original e numeração.
4. Rodar o downloader em computador com internet, priorizando `IBEMA-EST-001`, `PR-M4-001`, `PR-M4-002`, `PR-SIAFIC-001`, `ESOCIAL-MOS-001`, `ESOCIAL-XSD-001`, `ESOCIAL-NT07-001`.
5. Identificar se há estatuto *consolidado*, leis posteriores, plano de cargos e regras de previdência específicas de Ibema. Se não houver, classificar a regra como `EXEMPLO_HISTORICO_PENDENTE_DE_VALIDACAO`.
6. Conferir fonte, vigência, empregador, regime jurídico, categoria eSocial e hipóteses de incidência antes de ativar cálculos em produção.

---

# 2. METODOLOGIA PARA A POC — NÃO CONFUNDIR TELA COM FUNCIONALIDADE

O checklist possui **114 itens em Gestão de Folha de Pagamento**, **20 itens em Gestão eSocial** e dependências adicionais em Portal de Autoatendimento, Segurança e Medicina do Trabalho, Contabilidade, Custos e Transparência. Os 134 primeiros estão transcritos nas matrizes, mantendo seus códigos `FOLHA-001...FOLHA-114` e `ESOCIAL-001...ESOCIAL-020`.

## 2.1. Evidência mínima por item

Para cada item, produzir:

- **Status auditado:** `AUSENTE`, `PARCIAL`, `IMPLEMENTADO_NAO_TESTADO`, `TESTADO_LOCAL`, `TESTADO_INTEGRACAO`, `VALIDADO_OFICIALMENTE`, `BLOQUEADO_POR_CREDENCIAL`, `PENDENTE_DE_REGRA_LEGAL`.
- **Caminho de entrada:** menu, URL/rota, usuário/permissão.
- **Ação real:** criar, editar, autorizar, calcular, salvar, exportar, recalcular, cancelar ou homologar.
- **Persistência:** registro em tabelas reais de banco; não `localStorage`/array hardcoded para transações de produção.
- **Resultado comprovável:** relatório/CSV/PDF/XML, registro financeiro, histórico, protocolo verdadeiro ou validação local claramente identificada.
- **Teste reprodutível:** fixture sintética, entrada, saída prevista, resultado e evidência com captura/arquivo, sem dados pessoais reais.
- **Dependências/pendências:** leis a confirmar, integração não autorizada, credenciais ausentes, parametrização aguardando prefeitura.

Registrar os campos `status_impl`, `arquivo_codigo`, `evidencia_poc`, `pendencia_legal` nas matrizes. **Não preencher `ATENDE` por presunção.** A coluna `prioridade_proposta` indica ordem sugerida de trabalho e **não altera a exigibilidade de qualquer item** da POC.

## 2.2. Grupos para organizar as 114 verificações

| Itens | Grupo de trabalho | Entrega funcional esperada |
|---|---|---|
| 1–20 | Cadastros e vínculo funcional | Pessoa única; múltiplas matrículas/vínculos; cargos; lotação; atos legais; dependentes; previdências; anexos e histórico. |
| 21–35 | Férias, licença-prêmio e tempo de serviço | Períodos aquisitivos, perdas, prorrogações, saldos, gozo, pecúnia, certidões, cálculo de médias e reajustes. |
| 36–45 | Consignações e vales | Descontos parcelados, importações, margem e vale-transporte por roteiro, frequência e limite de desconto. |
| 46–49 | Afastamentos e ATS | Afastamento com reflexos, abono de faltas e relatório de quinquênios adquiridos no mês. |
| 50–73 | Motor de folha, rescisão e relatórios | Vários tipos de folha, fórmulas e rastreio, incidências, simulação, pensões, resumo por banco, recibos, classificação contábil e encargos. |
| 74–84 | Beneficiários, diárias e benefícios | Pensão alimentícia, renda com vínculos cumulativos, cargos comissionados, médias e margem consignável. |
| 85–90 | Provisões e contabilidade | Provisão de férias, 13º e licença-prêmio, estornos, baixas e integrações sem importar/exportar manualmente. |
| 91–107 | Integrações e automatismos | Notificações, importação de verbas, lotações, funções gratificadas, vale-alimentação, acesso e abertura de portal. |
| 108–114 | Portal, recadastramento, IRRF e CADPREV | Publicação de recibo, recadastramento, documentações de dependentes, residentes no exterior, dados do S-1210 e exportação atuarial. |

**Requisitos especialmente demonstráveis na POC:** FOLHA-049 (ATS), 050 (tipos de folha), 051–054 (consulta e rastreabilidade), 056–059 (desligamento e simulação), 062–063 (parametrização por regime/incidência), 064 (resumo), 067 (RRA), 068–073 (relatórios e contabilidade), 079 (duplos vínculos), 082 (médias), 085–089 (provisões), 108 (publicação do recibo) e 113 (IRRF/eSocial). **Importante:** implementar somente estes itens não garante aprovação dos demais.

## 2.3. Cuidado com detalhes literais do checklist

- **FOLHA-001:** número não limitado de contratos; personalização de campos sem customização.
- **FOLHA-005:** cadastro de pessoa deve ser compartilhado com o núcleo de Cadastros, não duplicado em RH.
- **FOLHA-007:** geolocalização de endereço de funcionário é dado pessoal; uso restrito e fundamentado, não mapa público.
- **FOLHA-025:** permitir fracionar férias, combinar aquisitivos, gozo e pecúnia; cálculo individual/coletivo.
- **FOLHA-031:** permitir múltiplos períodos de gozo e pecúnia para o mesmo aquisitivo de licença-prêmio.
- **FOLHA-039:** web service de consignação; se não houver parceiro/credenciais, informar status `BLOQUEADO_POR_CREDENCIAL` e demonstrar contrato/local mock identificado.
- **FOLHA-067:** RRA deve incluir número de processo, período de referência, distribuição sugerida e edição manual auditada.
- **FOLHA-071:** empenhamento integrado diretamente no Módulo Contábil; gerar somente arquivo CSV não satisfaz a redação.
- **FOLHA-082:** médias por referência, valor e valor reajustado; usar tabela de critérios por regime.
- **FOLHA-096:** bloqueio do login em férias/afastamento/desligamento precisa passar pela autorização de usuários; evitar bloquear administradores inadvertidamente.
- **FOLHA-108:** publicação de recibos por competência, regime e tipo de folha, com data programada.
- **FOLHA-114:** arquivos CADPREV demandam formato oficial e situação previdenciária; não inventar arquivos RPPS sem confirmar que o ente possui RPPS.
- **ESOCIAL-010..016:** geração, assinatura A1, envio, recebimento, histórico de XML e retorno, tanto produção quanto produção restrita. Sem credenciais reais a POC deve registrar pendência de conexão em vez de forjar retorno.

---

# 3. HIERARQUIA DAS REGRAS, FONTE E VIGÊNCIA

## 3.1. Precedência e conflitos

1. Constituição e normas federais nacionais aplicáveis ao tipo de vínculo, tributação, Previdência, eSocial, contabilidade e proteção de dados.
2. Lei municipal de Ibema **vigente e consolidada**, com atos normativos posteriores, planos de cargos, leis de remuneração e regulamentos.
3. Parecer e orientação formal do RH/Contabilidade/assessoria jurídica sobre pontos ambíguos.
4. Manuais operacionais de sistemas oficiais (eSocial, RFB, TCE-PR, SIAFIC) como fonte dos layouts e procedimentos técnicos, no período de vigência.
5. Manuais estaduais e modelos de outros municípios **exclusivamente como referência funcional/visual**, nunca como lei municipal de Ibema.
6. Casos de teste e modelos criados neste dossiê (são fictícios e não têm força normativa).

No motor de regras, toda configuração deve ter `fonte`, `jurisdicao`, `ente_id`, `regime`, `categoria`, `vigencia_inicio`, `vigencia_fim`, `versao`, `aprovado_por`, `aprovado_em`, `justificativa`, `hash_documento` e `status_validacao`. Norma de 2005 sem pesquisa de alterações **não** deve virar parametrização irrevogável da folha real.

## 3.2. Estatuto de Ibema: texto oficial de 2005 verificado visualmente

URL primária: <https://www.pibema.pr.gov.br/publicacao/oficial/Estatuto%20do%20Servidor.pdf>  
**Tipo:** PDF digitalizado de 44 páginas, publicado no site municipal. Atenção a alterações e revogações parciais desde 2005.

| Dispositivo histórico | Regra identificada no PDF | Como modelar | Risco/validação |
|---|---|---|---|
| Art. 39–40 (p. 8) | Vencimento e remuneração: remuneração abrange vencimento e vantagens permanentes. | Diferenciar vencimento, remuneração, base de vantagens, incidências. | Confrontar planos de cargos, gratificações e leis atuais. |
| Art. 43 (p. 9) | Falta sem motivo e atrasos/saídas com possibilidade de compensação conforme chefia e RH. | Ponto → ocorrência → justificativa → deferimento → desconto/compensação. | Não automatizar punição/abatimento sem regra de horário e autorização. |
| Art. 44–46 (p. 9–10) | Regras de desconto, consignação e reposição de pagamentos indevidos. | Base legal do desconto, parcelamento e histórico. | Verificar legislação atual e decisão judicial/consentimento. |
| Art. 52–55 (p. 11–12) | Espécies de adicionais e gratificações; casos de não cumulação com hora extra. | Rubricas por tipo e impedimentos configuráveis. | Verificar se norma posterior alterou vantagem. |
| **Art. 56 (p. 12)** | Quinquenal de **5% do vencimento** a cada cinco anos de efetivo serviço municipal, até **30%**. | `ATS = vencimento_base_elegivel × min(0,05×quinquenios, 0,30)`. | Revisar atos de averbação, períodos computáveis e legislação posterior. |
| **Art. 57 (p. 12)** | 13º: 1/12 por mês de efetivo exercício, fração **igual ou superior a 15 dias** vale um mês; remuneração total com vantagens; pagamento até 20/12; adiantamento até 50%. | Calendário de competências, base dezembro, médias, primeira/final/diferenças. | Não presumir que toda verba integra 13º; verificar natureza. |
| Art. 58–59 (p. 12–13) | 13º proporcional na exoneração; 13º não é base de outras vantagens. | Calcular avos na saída; evitar reflexo circular do 13º. | Conferir caso e regime. |
| **Arts. 60–61 (p. 13)** | Hora extraordinária: +50% de segunda 6h até sábado 12h; +100% de sábado 12h até segunda 6h; noturno cumulativo conforme regra; limite 2h/jornada, necessidade e ato autorizado. | Escala e janelas por horário, autorização e controle de limites. | Não basta usar flag final de semana; tratar feriado conforme fonte específica. |
| **Art. 62 (p. 13)** | Serviço noturno 22h–5h, +20%, cada hora de 52min30s; no extra, adicional incide na remuneração prevista para extra. | Converter minutos reais em horas fictas e determinar base/hierarquia de adicionais. | Exigir revisão jurídica antes de cálculo combinado. |
| **Art. 63 (p. 13)** | Acréscimo de 1/3 da remuneração correspondente ao período de férias. | Terço separado da remuneração/fruição, sem duplicidade. | Base varia conforme situação e médias. |
| Arts. 64–67 (p. 14) | Insalubridade/periculosidade, laudo e não cumulação. | Laudo, vigência, rubrica, impedimento de cumulação. | Não fixar percentual sem ato/lei e laudo. |
| **Arts. 73–75 (p. 16–17)** | Licença-prêmio de 90 dias após 5 anos ininterruptos sob condições; perdas específicas, requisitos e possível conversão de **50%** em pecúnia *somente excepcionalmente* a critério da Administração. | Períodos aquisitivos, impedimentos, saldo gozo/pecúnia, autorização e processo. | Incidência na base do pagamento e vigência demandam parecer. |
| Art. 100 (p. 23) | Férias ordinárias de até 30 dias; acúmulo limitado a dois períodos nas condições da norma. | Histórico de aquisitivos, programação, alertas. | Conferir períodos e regras atuais. |
| **Art. 101 (p. 24)** | Faixas de direito conforme faltas, requerimento de pecúnia de até 1/3 e prazo; há intervalos de faltas com redação aparentemente lacunosa. | Regra de férias por faixa versionada; bloquear resultados em lacunas até esclarecimento. | **Não inventar critérios para 6, 15, 24 e 33 faltas.** |
| Art. 102–103 (p. 24–25) | Hipóteses de perda de férias e regime especial de exposição a raios X. | Elegibilidade por afastamentos e configuração por atividade. | Exigir análise da situação e norma especial atual. |
| **Art. 104 (p. 25)** | Férias pagas até 2 dias antes do gozo; exoneração com indenização vencida/proporcional em 1/12 por mês ou fração acima de 14 dias, base remuneração da publicação do ato. | Calendário de pagamento; cálculo de desligamento. | Distinguir verba indenizada e adicional constitucional. |
| Art. 105 (p. 25) | Hipóteses restritas de interrupção das férias e fruição do remanescente. | Evento de interrupção com ato e saldo. | Ato formal necessário. |

**Observação específica do art. 101:** a redação digitalizada diz: 30 dias se não faltou **mais de 5** vezes; 24 dias se faltou **mais de 6** até 14; 18 dias se faltou **mais de 15** até 23; 12 dias se faltou **mais de 24** até 32; perda se faltou **mais de 33**. Portanto, **6, 15, 24 e 33 faltas ficam sem enquadramento literal claro**. Marcar `PENDENTE_DE_INTERPRETACAO`, impedir decisão automática com base apenas na tabela e solicitar manifestação da Prefeitura; não corrigir silenciosamente para intervalos usuais da CLT.

**Outras cautelas:** o estatuto de 2005 menciona condições antigas de licença-maternidade e aposentadoria que podem ter mudado por lei/constituição. Não aplicar automaticamente textos antigos a competências de 2026. Ibema registrou em documento de 2012 que não possuía RPPS naquela data; isso **não é prova de inexistência em 2026**. O Codex deve perguntar a previdência vigente ao ente e manter RGPS e RPPS parametrizados sem atribuição arbitrária.

## 3.3. Manual Meta4/Paraná — exemplo, não legislação municipal

- Manual de Vantagens/Descontos da SEAP Paraná, setembro/2026, **396 páginas**: usar como **inventário de rubricas, bases, fórmulas e incidências e como comparação**. Há rubricas estaduais relacionadas a professores, hospitais, carreiras e leis específicas do Estado; não aplicar nem copiar códigos diretamente para Ibema.
- Manual de Relatórios Meta4 Paraná, julho/2021, **63 páginas**: usar como **referência de UX e de resultados** (filtros, quebras e totalizações), não como prova de requisito jurídico municipal atual.
- Formulários SEAP/PR (férias, licença especial, exoneração, licença sem vencimentos, capacitação, CTC): usar para **campos, etapas e despachos**. Adotar textos legais de Ibema no processo real e não os arts. de lei estadual citados em formulários.

---

# 4. MOTOR DE CÁLCULO DA FOLHA — ESPECIFICAÇÃO

## 4.1. Catálogo e governança de rubricas

O arquivo `CATALOGO_RUBRICAS_PARAMETRIZAR.csv` traz **42 rubricas** sugeridas para iniciar cadastro. Cada rubrica necessita, no mínimo:

`codigo`, `descricao`, `tipo [provento/desconto/informativa]`, `classificacao_legal`, `vigencia`, `regime/categoria`, `formula`, `prioridade_calculo`, `dependencias`, `percentual_base`, `base_calculo`, `incidencia_rgps`, `incidencia_rpps`, `incidencia_irrf`, `incidencia_13`, `incidencia_ferias`, `incidencia_fgts`, `natureza_rubrica_esocial`, `cod_inc_cp`, `cod_inc_irrf`, `cod_inc_fgts`, `conta_contabil`, `natureza_despesa`, `fonte_recurso`, `acumulacao`, `arredondamento`, `fonte_normativa`.

**Não preencher `SIM/NÃO` nas incidências por intuição.** O CSV deixa essas colunas como `VALIDAR`. Relacionar cada código eSocial às tabelas atuais e legislação correspondente. Um mesmo nome de verba pode ter incidência diferente por regime/situação; o sistema deve suportar versões distintas da rubrica, sem sobrescrever históricos.

## 4.2. Pipeline de competência

1. Selecionar `ente`, `órgão`, `competência`, `tipo_folha`, `grupo`, vínculos e status.
2. Carregar **snapshot** da situação funcional aplicável no período (histórico salário, lotação, cargo, férias, atos, dependentes, previdência).
3. Importar/validar ocorrências: ponto, afastamentos, férias, consignações, benefícios, proventos/descontos fixos e variáveis, adicional por tempo, retroativos.
4. Determinar regras vigentes por regime e por data de referência, rejeitando duas versões conflitantes ou períodos sem cobertura.
5. Computar rubricas em ordem topológica por dependências; rejeitar ciclos; registrar memória de cálculo por rubrica, valores de entrada, fórmula/versão, resultado, arredondamento e alertas.
6. Somar bases de previdência e IRRF **por sua natureza e mês de incidência**, inclusive vínculos concomitantes; aplicar regras de retenção.
7. Consolidar `proventos`, `descontos`, `liquido`, `encargos_patronais`, `bases_legais`, `residuos_arredondamento`.
8. Expor prévia **sem efeitos colaterais** (`SIMULADO`) e validação/assinatura por operador habilitado.
9. Publicar versão fechada, gerar contracheques, resumo por banco, lote contábil e eSocial conforme autorização.
10. Reprocessamento deve ser **nova versão auditável** ou folha complementar/diferença, nunca atualização silenciosa da versão homologada.

Criar chave de idempotência `ente_id + contrato_id + competencia + tipo_folha + versao_regra + versao_processamento`. Utilizar transações Prisma/PostgreSQL para atomicidade dos lançamentos internos; contabilidade/eSocial com fila/outbox e confirmação independente. **Não emitir efeito contábil em simulação.**

## 4.3. Valores e datas

- Valores em decimal exato (`Prisma.Decimal` ou biblioteca Decimal recomendada), **não JavaScript float** para dinheiro. Armazenar BRL com escala consistente, fórmulas sem arredondamento prematuro e saídas exibidas em 2 casas com regra definida.
- Percentuais em decimal e versão de política. Guardar bases sem arredondar até o ponto normativo.
- Minutos de jornada como inteiro; converter horas noturnas sem perder frações.
- Fuso `America/Sao_Paulo`; competência mês/ano, data de nascimento e data de admissão são datas civis, não timestamps UTC arbitrários.
- Registrar `vigencia_inicio` e `vigencia_fim`, com versões históricas para reprocessar competências anteriores sem usar tabelas atuais.

## 4.4. Casos de cálculo com gabarito referencial

**Caso 1 — Quinquênio (art. 56 histórico):** vencimento-base elegível R$ 4.000,00; 10 anos elegíveis → 2 quinquênios → 10% → **R$ 400,00**; 35 anos → limitar a 30% → **R$ 1.200,00**. Não incluir vantagens que não integrem o vencimento-base definido.

**Caso 2 — 13º:** remuneração de referência sem médias adicionais R$ 4.400,00; 8 avos → R$ 4.400 × 8/12 = **R$ 2.933,33**. Mês com 15 dias de efetivo exercício gera avo; 14 dias não. Há necessidade de mapear vantagens variáveis, adiantamentos e desconto próprio de 13º.

**Caso 3 — Terço de férias:** base ilustrativa R$ 4.400,00 → **R$ 1.466,67**. Não pagar novamente a remuneração já antecipada; demonstrativo separa pagamento, fruição, adicional e descontos.

**Caso 4 — Horas extras:** hora-base hipotética R$ 20,00; duas horas a 50% → R$ 20 × 2 × (1 + 0,50) = **R$ 60,00**; duas a 100% → **R$ 80,00**. A hora-base real depende da jornada e das rubricas integrantes, conferidas na norma vigente. A aplicação ao adicional noturno exige composição na ordem correta.

**Caso 5 — Hora noturna:** 420 minutos reais entre 22h e 5h ÷ 52,5 min/hora reduzida = **8 horas noturnas fictas**; valor adicional calculado com base elegível, +20% conforme art. 62 no texto histórico.

**Caso 6 — Licença-prêmio:** servidor com 5 anos elegíveis pode atingir 90 dias segundo o estatuto histórico. Conversão em dinheiro de 45 dos 90 dias **não é automática**: depende de necessidade de serviço, requerimento e decisão administrativa. O exemplo de R$ 6.600,00 (45 × 4.400/30) é apenas referência de proporcionalidade e **não** autoriza a fórmula/tributação final.

**Caso 7 — Exoneração:** base R$ 4.400,00, 8/12 férias proporcionais → **R$ 2.933,33**; terço ilustrativo **R$ 977,78**; 13º proporcional e saldo de férias vencidas devem ser apurados em componentes separados, deduzindo parcelas já pagas. Exoneração estatutária ≠ rescisão CLT com FGTS/multa automaticamente.

### 4.5. INSS / RGPS — 2026

Fonte oficial: <https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal> (Portaria MPS/MF nº 13/2026, tabela a partir de janeiro/2026).

| Salário de contribuição | Alíquota da parcela |
|---|---:|
| Até R$ 1.621,00 | 7,5% |
| De R$ 1.621,01 até R$ 2.902,84 | 9% |
| De R$ 2.902,85 até R$ 4.354,27 | 12% |
| De R$ 4.354,28 até R$ 8.475,55 | 14% |

`INSS = soma_por_faixa[(min(base, teto_faixa) − piso_acumulado_faixa) × aliquota]`, com limites não negativos e tratamento correto de centavos por competência. Para salário de contribuição de **R$ 4.400,00**, desconto de referência = **R$ 417,51**. O décimo terceiro usa cálculo previdenciário separado e vínculos concomitantes RGPS possuem regras de soma de remunerações e teto. **RGPS não substitui RPPS**; consultar regime local antes de configurar servidores.

### 4.6. IRRF — 2026

Fonte: <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026> e exemplos <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025>.

| Base mensal após deduções permitidas | Alíquota | Parcela a deduzir |
|---|---:|---:|
| Até 2.428,80 | Isenta | 0,00 |
| 2.428,81–2.826,65 | 7,5% | 182,16 |
| 2.826,66–3.751,05 | 15% | 394,16 |
| 3.751,06–4.664,68 | 22,5% | 675,49 |
| Acima de 4.664,68 | 27,5% | 908,73 |

**Nova redução 2026 (Lei 15.270/2025):** rendimentos tributáveis mensais sujeitos ao ajuste de até R$ 5.000,00 → redução limitada ao imposto normal devido (até R$ 312,89), para que o IRRF chegue a zero; de R$ 5.000,01 até R$ 7.350,00 → redução calculada `978,62 − (0,133145 × rendimentos_tributaveis_mensais)`, limitada ao imposto apurado; acima de 7.350,00 não há redução. **A faixa da redução considera rendimentos tributáveis sujeitos ao ajuste, e NÃO simplesmente a base do imposto já deduzida.**

Quando permitido, comparar deduções legais vs dedução simplificada mensal e usar a mais vantajosa conforme a norma. Para a Receita, exemplo com renda mensal **R$ 5.000**, contribuição previdenciária **R$ 509,60**, desconto simplificado **R$ 607,20**, base **R$ 4.392,80**, IR preliminar **R$ 312,89** e redução igual ao IR → **IRRF R$ 0**. Isso deve ser teste obrigatório. A redução tem regras específicas para 13º conforme a lei; não aplicar automaticamente a RRA, verbas exclusivamente tributadas ou exercícios pretéritos.

### 4.7. RRA — Rendimentos Recebidos Acumuladamente

- Persistir `tipo_origem` (administrativo/judicial), `nro_processo`, `orgao_judicial` se houver, período/competências, `quantidade_meses`, rubricas individuais, valores e deduções legalmente permitidas, retenções e situação.
- Separar RRA **referente a anos anteriores** de diferenças dentro do ano corrente e de 13º, conforme tratamento RFB/eSocial; confrontar IN RFB nº 1.500/2014 atualizada e MOS S-1.3.
- Exibir distribuição sugerida por competência **editável com histórico** conforme FOLHA-067, mas não confundir a divisão aritmética com cálculo de IRRF definitivo.
- Simular R$ 18.000 referentes a seis meses (valor médio de exibição R$ 3.000/mês); **não tributar o total como uma única remuneração mensal comum**; só gerar IR RRA mediante regra fiscal validada.
- Vincular a demonstrativos específicos em eventos remuneratórios e de pagamentos eSocial, quando devidos; validação de `qtdMesesRRA` e demais campos depende do leiaute em vigência.

### 4.8. Análise de incidências e bases

Criar **matriz de incidência multi-regime**, incluindo no mínimo: RGPS empregado, RGPS temporário, CLT, estatutário RGPS (se aplicável), estatutário RPPS (se existir), comissionado sem vínculo, agente político, aposentado, pensionista, estágio, previdência complementar. Um mesmo vínculo pode demandar mais de um cadastro previdenciário (FOLHA-013). Nunca somar duas fontes de contribuição às cegas nem cobrar FGTS do empregado.

## 4.9. Afastamentos, férias e banco de horas

- `Afastamento` tem motivo, categoria eSocial, início/fim, ato, protocolo, situação, impacto em folha/ATS/férias/licença e autorização.
- Férias devem ter `periodo_aquisitivo` (direito, perda, prorrogação, compensações), `programacao`, `fruicao`, `pecunia`, `pagamentos`, histórico de movimentações, comprovantes, disponibilização portal, cancelamentos autorizados.
- **Não basta exibir saldo do banco de horas:** entradas e saídas originais, apuração por escala, tolerâncias, justificativas, autorização, geração de crédito, consumo, estorno e trilha precisam ser persistidos. Guardar minutos inteiros e origem de cada saldo. `saldo_final = saldo_inicial + créditos_autorizados − débitos_aprovados − ajustes_documentados`.
- Ponto é uma referência de interface, mas regras de controle eletrônico de jornada para CLT e para estatutário podem divergir. Portaria 671/2021 e requisitos REP exigem análise específica de aplicabilidade, não presumir que toda prefeitura usa REP de CLT.

---

# 5. RELATÓRIOS E DOCUMENTOS PARA DEMONSTRAR

## 5.1. Saídas recomendadas

**Núcleo Folha:** folha analítica, folha sintética, resumo por proventos/descontos, folha por regime/cargo/lotação/centro de custo, resumo por banco com agência/conta/CPF mascaráveis, recibo/contracheque, demonstrativo de cálculo por verba, rubricas de incidência, encargos RGPS/RPPS e FGTS, consignatárias, previsão e baixa de provisões, planilha contábil, valores líquidos e histórico de cálculos.

**Núcleo Funcional:** ficha funcional com vínculos e anexos, atos legais, movimentações, ATS adquiridos no mês, férias vencidas/a vencer/em dobro, aviso/recibo de férias, licença-prêmio e certidão de tempo de serviço, faltas/afastamentos, contratos simultâneos, funções gratificadas e cessões.

**Núcleo Ponto:** espelho por dia/mês, batidas originais, jornadas, abonos, atrasos, saídas antecipadas, adicional noturno, horas extraordinárias com aprovação, extrato de banco de horas com origem e saldos, pendências por gestor.

**Núcleo Fiscal/Externo:** comprovante anual de rendimentos, dados do eSocial S-1210, DARFs/obrigações, documentos de prestação de contas e relatório de inconsistências eSocial. A antiga DIRF/SEFIP/GFIP/MANAD aparecem no edital, mas Codex deve conferir se e quando esses formatos ainda têm aplicação; não afirmar envio 2026 como substituto do eSocial.

## 5.2. Templates incluídos

`05_Modelos_de_Relatorios/` possui HTMLs autorais imprimíveis de:

1. Contracheque;
2. Espelho de ponto;
3. Extrato de banco de horas;
4. Aviso/requerimento de férias;
5. Licença-prêmio;
6. Termo/simulação de exoneração;
7. Comprovante anual de rendimentos (estrutura, **não formulário fiscal oficial**);
8. Resumo contábil da folha.

São modelos **não oficiais com dados fictícios**. Usá-los como referência de campos/UX, nunca copiar o cabeçalho do Estado ou brasão municipal como se fossem documentos reais nem reutilizar seus números ilustrativos para cálculos definitivos. Incluir número verificável, QR/protocolo interno opcional, data de emissão, versão da folha, autor, máscara de dados, controle de acesso e botão Imprimir/PDF/CSV onde pertinente. O mesmo resultado deve ser produzido a partir da base de dados, não por HTML fixo.

### 5.3. Filtros e apresentação

Manter padrão de UI/UX CeleriFlow: header enxuto, filtros compactos, tabela com sticky header e rolagem interna, limite de 20 registros por página quando viável, caixa modal para campos extensos, menus consistentes e hierarquia visual limpa. Sempre que relatório do edital mencionar filtro/agrupamento, implementar e demonstrar seu efeito na consulta (por exemplo, regime, centro de custo, banco, local de trabalho e cargo).

---

# 6. eSOCIAL — LAYOUT, VIGÊNCIA E INTEGRAÇÃO

**Fonte de verdade técnica:** <https://www.gov.br/esocial/pt-br/documentacao-tecnica>. Em 11/10/2026 a documentação lista MOS S-1.3 até NO 11/2026, leiautes S-1.3/NT 06 e NT 07 e XSD distintos com datas de produção. **A NT 07/2026 possui implantações escalonadas, por exemplo schema com entrada em produção em 26/10/2026, 23/11/2026, 14/12/2026 e 18/01/2027; não aplicar um schema futuro em 11/10/2026 só porque foi publicado.**

## 6.1. Eventos para mapear

| Evento | Origem e uso | Aceite local |
|---|---|---|
| S-1000 | Ente empregador | Cadastro válido do ente, ambiente/certificado, versionamento. |
| S-1005 | Estabelecimentos e unidades | CNPJ/CNO/estabelecimento e consistência com o ente. |
| S-1010 | Tabela de rubricas | Rubricas com incidências e natureza oficial validadas na tabela vigente. |
| S-1020 | Lotação tributária | Lotação/terceiros quando aplicável. |
| S-2200 | Admissão/ingresso de trabalhadores conforme categoria | Vínculos, regime/categoria, campos obrigatórios. |
| S-2205 | Alteração dados cadastrais | Apenas quando houver alteração cabível. |
| S-2206 | Alteração contratual | Histórico de vínculo e salário/lotação. |
| S-2230 | Afastamento temporário | Motivo, datas, retornos, eventos retroativos. |
| S-2299 | Desligamento | Conjunto adequado ao vínculo e regra eSocial. |
| S-2300 | Trabalhador sem vínculo/estatutário, se enquadrado no evento | Categoria determinada pelo MOS, não só pelo título da tela. |
| S-2399 | Término de TSV | Conforme categoria e vínculo. |
| S-1200 | Remuneração de trabalhadores cobertos pelo evento | Demonstrativos da folha. |
| S-1202 | Remuneração servidores vinculados a RPPS e situações previstas | Somente conforme categoria/regime e MOS. |
| S-1207 | Benefícios previdenciários de RPPS | Se houver benefício/regime aplicável. |
| S-1210 | Pagamentos de rendimentos do trabalho | Ligar demonstrativo de pagamento à remuneração e IRRF/RRA. |
| S-1299 | Fechamento periódicos | Conferir pré-requisitos e retornos. |
| S-3000 | Exclusões | Autorizações, referências corretas e registro de estorno. |
| S-5001, S-5002 | Retornos totalizadores | Confrontar bases/IRRF em eventos aceitos. |
| S-2210, S-2220, S-2240 | CAT, monitoração da saúde e condições ambientais | Vincular ao módulo de SST somente nos casos devidos. |

**Não** presumir que todo estatutário está em RPPS; a categoria e os grupos do MOS definem a escolha do evento. Não tratar S-1202 como sinônimo genérico de folha municipal.

## 6.2. Ambientes e desenho do conector

`LOCAL_VALIDACAO` → `PRODUCAO_RESTRITA` → `PRODUCAO`, com isolamento de endpoint, certificados, logs, números de recibo e status. Especificar:

- Versão MOS/XSD por data de **produção oficial**, grupo de evento e competência, com rollback/reprocessamento controlado.
- Geração XML baseado nos campos das entidades reais + validação contra XSD assinalado (sem hardcode estático de um XML exemplo para todas as matrículas).
- Certificado A1 `.pfx/.p12`: **criptografia forte em repouso**, segredo fora do repositório, acesso por backend autorizado, não expor senha/client-side ou Blob público. Controle de validade, cadeia, assinatura XML e representação legal; escolher gerência de chaves adequada à arquitetura.
- Fila/outbox para lotes; idempotência da solicitação; estados `RASCUNHO → XML_GERADO → VALIDADO_XSD → ASSINADO → ENVIADO → EM_PROCESSAMENTO → ACEITO/REJEITADO`.
- Guardar XML de envio assinado, XML do lote, retorno oficial, recibos, erros e histórico técnico conforme exigência do edital e controles de proteção de dados; não expor os XMLs publicamente.
- Produção restrita não compartilha recibos/status e não produz obrigações efetivas de produção. Simulação interna deve exibir tarja `SIMULAÇÃO — NÃO TRANSMITIDO AO ESOCIAL` e protocolos de demonstração com namespace próprio.
- Não depender de sistema terceiro para assinatura/integração se o item ESOCIAL-012 exigir solução integrada. Validar limites do runtime Vercel e processar jobs com arquitetura suportada (fila/worker/cron seguro), sem confiar em requisição HTTP de longa duração.
- Testar cadeia de pré-requisitos e retornos reais **somente com certificado e autorização válidos**.

## 6.3. Campo a campo

Para cada evento expor painel diagnóstico: campo XSD, caminho da informação no Prisma, situação do dado, origem cadastral, regra do MOS, obrigatoriedade, código de validação, ação corretiva, status do recibo. Esse painel atende especialmente ESOCIAL-008/009 e favorece POC mesmo sem transmissão.

**ESOCIAL-001..007:** DIRF, SEFIP/GFIP, MANAD, SIOPE, TCE-PR, qualificação cadastral. Alguns são fluxos legados; pesquisar vigência legal por ano e se o edital pede exportação histórica/de legado. Classificar `LAYOUT_LEGADO_DEMONSTRADO` quando o arquivo é produzido para compatibilidade, sem afirmar sua transmissão efetiva ou obrigatoriedade atual.

---

# 7. CONTABILIDADE, FINANCEIRO E CONTROLE DE CUSTOS

**Módulos distintos, base integrada.** Gestão de RH/Folha é responsável por cálculo, memória, retenções, encargos, rubrica e centros de custo. Financeiro/Contábil é responsável por dotações, naturezas de despesa, empenho, liquidação, pagamento, provisões, baixas e registros do PCASP. Planejamento/Orçamento fornece dotação e classificação; Gestão de Custos recebe apropriação; BI/Controle Interno fiscaliza. Não criar contabilidade paralela dentro de RH.

## 7.1. Fontes que precisam ser lidas

1. **MCASP/STN:** <https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-contabilidade-aplicada-ao-setor-publico-mcasp-1>;
2. **PCASP/STN:** <https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/federacao/plano-de-contas-aplicado-ao-setor-publico-pcasp-1>;
3. **TCE-PR — plano de contas 2026 e PC Despesa PR:** <https://www.tce.pr.gov.br/para-o-fiscalizado/sistemas/sim-sistema-de-informacoes-municipais/plano-de-contas.htm>;
4. **TCE-PR — leiautes SIM-AM de 2026:** <https://www.tce.pr.gov.br/para-o-fiscalizado/sistemas/sim-sistema-de-informacoes-municipais/layout.htm>;
5. **SIAFIC/PR — Manual de Folha:** documento PDF na fonte `PR-SIAFIC-001` do catálogo.

Naturezas usuais que devem ser verificadas para rubricas específicas: `3.1.90.04` (contratação por tempo determinado), `3.1.90.11` (vencimentos e vantagens fixas), `3.1.90.13` (obrigações patronais), `3.1.91.13` (obrigações patronais intraorçamentárias), `3.1.90.16` (despesas variáveis), `3.1.90.91` (sentenças judiciais), `3.1.90.92` (exercícios anteriores) e `3.1.90.94` (indenizações e restituições trabalhistas). **São exemplos de famílias classificatórias, não classificação final de todas as rubricas.** Consultar PC Despesa PR detalhado e situação econômica da despesa.

## 7.2. Contrato de integração sugerido

- `FolhaFechadaEvento` com `ente_id`, `folha_id`, `competencia`, `tipo_folha`, `versao`, `totais` e `hash`;
- linhas de empenho por `rubrica_id`, `natureza_despesa`, `dotacao_id`, `fonte_recurso`, `centro_custo`, `valor`, `regime`, `encargo/retencao`;
- apropriação por funcionário/contrato e histórico de centro de custo dentro da competência (FOLHA-055);
- `ProvisaoCompetencia` e `BaixaProvisao` para férias, 13º, licença-prêmio, revisão e estorno na rescisão (FOLHA-085..089);
- validação de dotação, autenticação intermodular e transação idempotente; sucesso somente após haver registro contábil real;
- reconciliação: bruto = soma proventos; líquido = bruto − descontos; encargos como obrigações próprias, não descontos do funcionário; folha×empenho×liquidação×pagamento;
- resumo por banco e arquivos de pagamento somente com **layout de banco/convênio validado**; modelos genéricos não podem ser rotulados como arquivo bancário homologado.

**SIM-AM não equivale a transmissão direta em tempo real ao TCE-PR:** primeiro gerar dados conforme leiautes oficiais, conferir campos, versão e exercício; não exibir recibo sem retorno externo.

---

# 8. ARQUITETURA DE IMPLEMENTAÇÃO NA STACK CELERIFLOW

Stack de referência do projeto: TypeScript, React, Next.js, Prisma, Neon/PostgreSQL, Firebase Auth, Vercel e Vercel Blob. O Codex deve **confirmar as versões atuais no repositório**; não inventar caminhos nem substituir ferramentas existentes desnecessariamente.

## 8.1. Camadas sugeridas

- **Cadastros compartilhados**: `Pessoa`, documentos, endereço, contatos, dependentes (com perfil de acesso).
- **RH**: `ServidorVinculo`, `Contrato`, `Cargo`, `NivelSalarial`, `LotacaoHistorico`, `AtoLegal`, `Afastamento`, `Ocorrencia`, `TempoAverbado`, `PeriodoAquisitivoFerias`, `MovimentacaoFerias`, `PeriodoLicencaPremio`, `MovimentacaoLicenca`, `FrequenciaMarcacao`, `BancoHorasLancamento`, `Beneficio`, `Consignacao`, `PensaoAlimenticia`.
- **Configuração normativa**: `RegraMunicipalVigencia`, `Rubrica`, `FormulaRubricaVersao`, `IncidenciaRubrica`, `TabelaPrevidencia`, `TabelaIRRF`, `MapeamentoEsocial`, `NaturezaDespesaRubrica`.
- **Cálculo**: `FolhaCompetencia`, `FolhaProcessamento`, `FolhaContrato`, `LancamentoRubrica`, `MemoriaCalculo`, `BaseTributaria`, `EncargoPatronal`, `SimulacaoFolha`, `DiferencaFolha`, `Provisao`.
- **Saídas**: `DocumentoRH`, `LoteBancario`, `IntegracaoContabilOutbox`, `EsocialEvento`, `EsocialLote`, `EsocialRecibo`, `EsocialAmbiente`, `EsocialCertificadoRef`, `ExportacaoPrestacaoContas`.
- **Auditoria**: `RegistroAuditoria`, `EvidenciaPOC`, `AlteracaoRegra`, `AprovacaoWorkflow`, `ErroIntegracao`, com retenção parametrizada e sigilo.

Esses são **nomes propostos**, não instrução para criar tabelas duplicadas: se já há entidades equivalentes, adaptar/migrar com cautela. Conferir relações e índices, restrições de unicidade por ente/contrato/competência, chaves estrangeiras e integridade entre dados funcionais e financeiros.

## 8.2. Multiempresa/multi-ente e segurança

- Cada registro de servidor, folha, rubrica e documento precisa de isolamento por `tenant_id`/`ente_id`/`orgao_id` aplicável, inclusive no backend e nas consultas Prisma.
- Firebase Auth cuida de identidade; **autorização funcional** de RH/Financeiro/Portal precisa ser avaliada em serviço/servidor e por recurso, nunca apenas escondendo botão no cliente.
- Perfis: `Admin_Robonuvem` (suporte controlado), `Admin_Ente`, `Gestor_RH`, `Operador_Folha`, `Auditor`, `Contador`, `Chefia`, `Servidor`, `Responsavel_eSocial`. Segregação de quem lança, autoriza e fecha folha.
- Dados pessoais (CPF, endereço, conta, dependentes, renda) e sensíveis (atestados, CID, dados de saúde e afastamentos) exigem mínimo privilégio, trilhas e proteção reforçada; o portal de transparência tem regramento próprio, não pode simplesmente republicar ficha funcional privada.
- Usar mascaramento em logs, exportações de demonstração e e-mails; nunca registrar senha A1, certificado privado ou `.env` no Git.
- Exigir autenticação reforçada para certificação eSocial, homologação de folha, exclusões de contratos, publicação ampla de demonstrativos e operações monetárias; não presumir nível de autenticação por apenas login Google/Firebase.

## 8.3. Simulação versus execução real

Criar modo `tenant_demo_ibema` apenas com **dados inventados**. Interface deve diferenciar:

- **Regra histórica de referência:** configurada para comparação, pendente de validação jurídica;
- **Cálculo validado localmente:** fórmula executada e resultado persistido;
- **Integração interna validada:** registros efetivamente criados em outros módulos do CeleriFlow;
- **Arquivo exportado localmente:** arquivo de acordo com formato documentado, sem envio;
- **Ambiente oficial produção restrita:** transmissão e recibo externo verdadeiros;
- **Produção:** somente com autorização e cadastro reais.

Não rotular `integrado`, `homologado`, `transmitido` ou `assinado pelo município` quando houve apenas mock. Para importações externas fictícias, manter painel técnico que mostre claramente endpoint, ambiente, data da última conexão, tamanho da fila, arquivo e situação.

## 8.4. Conflitos de desenvolvimento em dois computadores

Caso as implementações ocorram em máquinas diferentes, usar branches por domínio (`feature/rh-ferias`, `feature/rh-folha`, `feature/esocial`) e commits pequenos. **Alterações em `schema.prisma` e migrations devem ter dono/integrador único por janela de trabalho**, revisar branch base e aplicar migrations sequenciais. Não copiar `node_modules` ou `.next`; cada PC roda instalação local. `.env` fica fora do Git e configurações equivalentes devem ser geridas por canal seguro.

---

# 9. TELAS, AÇÕES E JORNADAS QUE O CODEX DEVE ENTREGAR

## 9.1. Visão RH/Folha sugerida

- **Painel RH:** matrículas ativas, férias a vencer, licenças, ocorrências, simulações pendentes, folhas abertas, último cálculo e integração eSocial.
- **Pessoas/Servidores:** cadastro unificado, contratos, folha histórica, dependentes, vínculos previdenciários, documentos, pasta funcional, atos, período de função, local/centro de custo.
- **Cargos e tabelas:** cargos, níveis, planos de carreira, gratificações e rubricas/incidências por data.
- **Frequência:** escalas, marcações, espelho de ponto, justificativas, aprovações, horas extras e banco de horas.
- **Férias:** aquisitivos, saldos, programação, requerimentos, aprovações, gozo, conversão, pagamento, avisos e recibos.
- **Licença-prêmio:** aquisição, elegibilidade/impedimentos, gozo, pecúnia sob autorização, saldos e relatório.
- **Afastamentos:** licença, atestados, atos, reflexos no cálculo e retorno.
- **Folha:** competência, filtros exigidos no checklist, prévia, cálculo e memória, conferência, fechamento, relatórios, retificações e histórico.
- **Folhas especiais:** mensal complementar, 13º adiantamento/final/diferença, férias, rescisão/exoneração, RRA, adiantamentos.
- **Provisões:** constituição, apropriação, reversões, estornos e vínculos contábeis.
- **Integrações:** eSocial, contabilidade, consignações, prestação de contas, arquivos bancários (se houver layout).
- **Portal Servidor:** meus contracheques, informe anual, férias, licença, espelho de ponto, banco de horas, recadastramento e solicitações.

Gestão eSocial pode aparecer como menu/submódulo independente conforme o checklist, mas **os dados devem ser do mesmo núcleo RH/Folha**. Deixar claro o pertencimento da Segurança e Medicina do Trabalho, Previdência e Portal sem duplicar cadastros.

## 9.2. Fluxos para a apresentação (demonstrar com dados que mudam de fato)

**Fluxo A — Admitir servidor fictício:** criar pessoa → validar CPF fictício apenas se permitido pelo ambiente de demonstração → gerar contrato → regime/categoria → lotação → nível/valor → ficha e histórico → aparecer no universo da competência.

**Fluxo B — ATS automático:** inserir contrato com período elegível → selecionar regra histórica de Ibema → calcular folha → rubrica ATS + memória cálculo → relatório de adquirentes de quinquênio → refletir no contracheque e no resumo.

**Fluxo C — Férias:** verificar aquisitivo e faltas → registrar requerimento → chefia autoriza → RH calcula → movimentos de fruição/pecúnia → aviso/recibo + atualização de saldo → reflexo financeiro/contábil. Em limites ambíguos do art. 101, mostrar pendência de regra, sem calcular à força.

**Fluxo D — Licença-prêmio:** aquisitivo → impedir caso inelegível → requerimento → chefia/RH/ato → gozo/pecúnia se autorizado → saldo e provisão → demonstrativo auditável.

**Fluxo E — Folha mensal:** importar marcações e lançamentos → simular → detalhar fórmula e bases previdenciária/IRRF → conferir R$ 417,51 no cenário RGPS → validar → fechar → gerar recibo, resumo por banco, empenhamento eSocial (segundo modo de integração disponível).

**Fluxo F — Desligamento simulado:** escolher contrato → prévia de verbas devidas → documento → confirmar simulação sem inativar vínculo e sem transmitir ao eSocial → em outro teste autorizado, efetivar com histórico/estorno/provisão.

**Fluxo G — RRA:** lançar processo e seis competências → distribuição sugerida → ajuste individual registrado → apuração tributária específica **somente se validada** → demonstrativo e dados para eSocial.

**Fluxo H — eSocial:** selecionar ambiente e data de vigência → validar cadastro/rubricas → gerar XML → validar XSD → visualizar erros/soluções. Se houver certificado/autorização, assinar/enviar em produção restrita e mostrar recibo; se não, deixar como validação local.

**Fluxo I — Ponto:** registrar batidas fictícias → mostrar jornada 8h15 em 05/10/2026, prevista 8h → chefia avalia/autoriza crédito → extrato de banco de horas aumenta e compensação reduz → aparecer no relatório do servidor.

**Fluxo J — Contábil:** abrir folha fechada → gerar solicitação de empenho interno → registro contábil real por dotação/conta → consultar vínculo e valores; apenas quando implantação do Financeiro permitir.

---

# 10. TESTES AUTOMATIZADOS, EVIDÊNCIAS E REVISÃO

## 10.1. Fixtures e testes

- `CENARIOS_TESTE_RH_FOLHA_2026.json` contém **40 cenários**, distinguindo **cálculo fechado**, **controle de fluxo**, **pendência legal**, **integração** e **segurança**. **Não gerar assert numérico para casos sem `resultado_esperado` definido.**
- Para cada cálculo automático, validar precisão decimal, meses/avos/competência, arredondamentos, base de cada desconto, situação administrativa, regime e vigência.
- Para cada processamento da folha, conferir `idempotência`, isolamento de tenants, transação e auditoria, reprocessamento sem duplicar rubricas e consistência dos resultados.
- Para cada relatório, testar filtros, competência, paginação, PDF/CSV, autenticação, mascaramento e coerência com linhas de cálculo persistidas.
- Para eSocial, testar payload e XSD corretos, campos obrigatórios, evento anterior, idempotência, versionamento temporal, endpoint adequado e exibição do retorno. **Sem acesso real não pode haver teste aprovado de transmissão oficial.**
- Rodar testes de regressão de módulos externos após mudanças de Prisma e permissões, porque CeleriFlow é integrado.

## 10.2. Critério de aceite de implementação

`VALIDADO_LOCAL` = código e teste unitário E2E no banco de homologação + relatório reproduzível; `VALIDADO_INTERNO` = evento gerou registro real no módulo vizinho; `VALIDADO_OFICIALMENTE` = retorno autêntico externo conferido, quando aplicável. A aprovação final deve seguir a ordem e os itens reais do checklist da Prefeitura, não a prioridade inventada pelo desenvolvedor.

Documentar por etapa:

1. Resumo de arquivos analisados (`app`/`src`, Prisma, Next routes, auth, tabelas, UI e relatórios);
2. Matriz antes/depois com commit/rotas/serviços e evidência;
3. Migration/seed/dados fictícios, plano de rollback;
4. Testes executados com comandos e resultados;
5. Pendências jurídicas, dados da Prefeitura e integrações externas;
6. Demonstração curta, item a item, com tempo de execução e usuário de teste;
7. **Quais itens da POC NÃO estão cobertos** — nunca esconder incompletudes.

---

# 11. PLANO DE EXECUÇÃO (SPRINTS SUGERIDAS, SEM PRAZOS INVENTADOS)

### Sprint 0 — Auditoria e conformidade documental

- Ler 3 PDFs e transcrição CSV; identificar exatamente as rotas/tabelas/serviços de RH existentes.
- Verificar divergências de números e títulos do checklist original; corrigir qualquer erro de extração, registrando razão.
- Baixar Estatuto e manuais e listar ausências de vigência; criar cadastro `RegraJuridica` com estado `HISTORICO_NAO_VALIDADO`.
- Resumir cobertura `ATENDE/PARCIAL/AUSENTE` sem mudar código.

### Sprint 1 — Base cadastral, rubricas e motor

- Cadastro de múltiplos vínculos, níveis, atos, lotações e históricos (reaproveitar entidades existentes).
- Rubricas, versão/autorizações e motor de cálculo com memória, folha prévia, fechamento e reprocessamento.
- Tabelas nacionais 2026 RGPS/IRRF e a regra de redução, sem impor RGPS a quem tem RPPS.
- 13º, ATS e férias sob regas históricas claramente identificadas para demonstração; testes T01–T16 e T20–T30.

### Sprint 2 — Folha especial, documentos e ponto

- Férias/13º/rescisão/RRA, períodos de licença, consignações e afastamentos com efeitos de folha.
- Relatórios e filtros, contracheque, comprovante anual, espelho de ponto e banco de horas, HTML/PDF e histórico/auditoria.
- Portal do servidor com direitos de acesso e controle de publicação.

### Sprint 3 — Financeiro, Contábil, Custos, integração

- Contratos de integração direta e outbox, reflexos de provisões, empenho e reconciliação contábil.
- eSocial com geração XML e validação XSD, mapeamento de campos, logs, certificados com criptografia e ambientes segregados.
- Eventual submissão real em produção restrita se recebidas credenciais e autorização.

### Sprint 4 — Auditoria final de POC

- Percorrer **114 + 20** itens e os requisitos de portal/SST/conjuntos gerais realmente exigidos, um por um, sem saltos.
- Validar com dados fictícios reproduzíveis, registrar telas/evidências, corrigir falhas, emitir relatório de lacunas.
- Encerrar com visão de riscos jurídicos/tecnológicos e roteiro de demonstração.

**Política de commits:** pequenas entregas com testes; nunca fazer refatoração massiva e simultânea em banco, Firebase, RH e contabilidade; apenas um dono de schema/migrations por rodada.

---

# 12. PENDÊNCIAS QUE PRECISAM SER SOLICITADAS À PREFEITURA DE IBEMA

Priorizar solicitação dos documentos abaixo; falta deles **não impede construir referência e demonstração**, mas impede afirmar correspondência integral com a folha atual:

| Prioridade | Informação | Por quê? |
|---|---|---|
| Crítica | Estatuto consolidado e todas as leis posteriores de alteração | Percentuais, prazos, direitos e casos omissos de 2005. |
| Crítica | Plano de cargos, carreira, vencimentos e tabelas vigentes por grupo/cargo | Base real de vencimento, adicional, gratificação e retroativo. |
| Crítica | Regime jurídico/previdenciário por categoria; existência ou não de RPPS em 2026 | INSS/RPPS, S-1200/S-1202, contribuições e CADPREV. |
| Crítica | Catálogo de rubricas atual com fórmulas e incidências/eSocial | Cálculo correto, memória e integração. |
| Crítica | Exemplos anonimizados de folhas/contracheques e cálculos de férias, ATS, 13º, exoneração, licença-prêmio | Homologação comparativa contra cálculo praticado. |
| Alta | Regras de ponto, escala, banco de horas, horas extras e tolerâncias | Processamento de jornada. |
| Alta | Layouts bancários, convênios de consignação, dados do banco oficial | Integração bancária/consignações. |
| Alta | Conta contábil/dotação, PC Despesa e parametrização de empenho e provisões | Integração RH → Financeiro. |
| Alta | CNPJ e cadastros eSocial, procuração eletrônica/certificado A1 e autorização de produção restrita | Teste externo real, se possível. |
| Alta | Procedimentos e layouts TCE-PR/SIM-AM usados atualmente | Exportação verdadeira conforme órgão. |
| Média | Modelos oficiais de aviso, recibo, ficha, relatório e informe de rendimentos | Identidade e estrutura visual. |
| Média | Política de transparência, acessos, retenção de dados e LGPD | Privacidade e acesso no portal. |
| Média | Prazos e modelos de atos, portarias, requerimentos, pareceres e assinaturas | Fluxos e rastreabilidade. |

Criar painel de `Pendências de Integração e Normas` em ambiente de homologação, com fonte, data solicitada, status, responsável, evidência e plano alternativo. Não inventar credenciais, recibos governamentais ou documentos municipais.

---

# 13. BIBLIOGRAFIA OPERACIONAL E MANUTENÇÃO

O índice **completo com 60 entradas**, links e utilidades está em `02_Fontes_Publicas_Baixar/CATALOGO_FONTES_OFICIAIS.csv`/`.json`. Fontes decisivas:

- **Ibema — Estatuto digitalizado:** <https://www.pibema.pr.gov.br/publicacao/oficial/Estatuto%20do%20Servidor.pdf>.
- **SEAP-PR — manual de vantagens e descontos (2026):** `PR-M4-001` no catálogo.
- **SEAP-PR — manual de relatórios:** `PR-M4-002` no catálogo.
- **SEAP-PR — formulários editáveis:** <https://www.administracao.pr.gov.br/Recursos-Humanos/Pagina/Formularios-Direitos>.
- **SIAFIC Paraná — Folha e despesa:** `PR-SIAFIC-001` no catálogo.
- **INSS — contribuição 2026:** <https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal>.
- **Receita Federal — IRRF 2026:** <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026>.
- **Receita Federal — exemplos Lei 15.270:** <https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025>.
- **eSocial — documentação atual:** <https://www.gov.br/esocial/pt-br/documentacao-tecnica>.
- **TCE-PR — plano de contas:** <https://www.tce.pr.gov.br/para-o-fiscalizado/sistemas/sim-sistema-de-informacoes-municipais/plano-de-contas.htm>.
- **TCE-PR — SIM-AM:** <https://www.tce.pr.gov.br/para-o-fiscalizado/sistemas/sim-sistema-de-informacoes-municipais/layout.htm>.
- **STN — MCASP e PCASP:** links no catálogo.
- **PBH — espelho e banco de horas:** <https://gestaodefrequencia.pbh.gov.br/sites/gestaodefrequencia.pbh.gov.br/files/manual_servidor.pdf>.
- **Paranaguá/Cruz Machado — formulários municipais:** links no catálogo.

**Revisão de conteúdo:** novas versões podem surgir após 11/10/2026. Antes de processar outra competência ou de transmitir eSocial, o Codex/desenvolvedor deve revalidar se a norma e o layout continuam vigentes. Anotar `consultado_em` e manter arquivos originais (com hash) separados das notas técnicas e das interpretações internas. Fonte desatualizada não deve ser sobrescrita silenciosamente: manter versões por exercício.

---

# 14. INSTRUÇÕES DE SAÍDA QUE O CODEX DEVE SEGUIR

**PRIMEIRA RODADA — SOMENTE AUDITORIA:**

1. Mapear repositório, Prisma, Firebase Auth, sistemas já existentes, componentes, regras, testes e integrações.
2. Atualizar matrizes indicando presença parcial/total, com caminho de arquivo/rota. Nenhum item deve ser presumido atendido.
3. Listar os 15 gaps mais importantes **para a POC**, mas sem ignorar os demais, com complexidade relativa, dependências e riscos legais.
4. Sinalizar inconsistências entre checklist, TR, leis e dados do município.
5. Entregar o plano de execução em lotes por arquivos e tabelas a alterar, preservando outros módulos.
6. **Esperar a aprovação para executar migrations ou alterações estruturais.**

**RODADAS POSTERIORES — IMPLEMENTAÇÃO:**

- Implementar cada fluxo em domínio isolado, com backend de verdade, testes e relatório/recibo real quando apropriado.
- Apresentar antes/depois, scripts, alterações Prisma e eventual migração com rollback, testes, observações jurídicas e pendências externas.
- Não produzir operações de competência real sem credenciais e autorização, nem afirmar que legislação histórica está vigente sem confirmação.
- Sempre entregar evidências POC e a matriz atualizada, explicitando o que continua não atendido.

---

## APÊNDICE A — ERROS A EVITAR

- Aplicar as regras da SEAP/Meta4 (servidor **estadual**) diretamente à prefeitura de Ibema.
- Dizer que PDF escaneado de 2005 é texto consolidado de 2026.
- Usar `Number`/float sem controle para descontos monetários.
- Calcular IRRF 2026 sem a redução da Lei 15.270 ou aplicar redução indevida à base já deduzida.
- Aplicar INSS RGPS a todos os estatutários sem confirmar regime previdenciário.
- Usar rescisão CLT/FGTS automaticamente para exoneração estatutária.
- Dar 30/24/18/12 dias de férias em fronteiras não previstas literalmente no art. 101 sem validação.
- Calcular licença-prêmio pecuniária sem requerimento e deferimento.
- Copiar o leiaute eSocial de data futura para transmissão anterior à vigência.
- Exibir `Sucesso de transmissão` sem XML recebido/autorizado e recibo externo.
- Criar rubricas sem mapeamento de natureza/incidência/conta/versão.
- Tratar relatório estático ou dado `mock` como registro de banco.
- Expor CPF, salário, saúde, certificado digital ou dados bancários entre tenants e perfis.
- Executar migrations concorrentes nos dois computadores ou alterar `.env` via Git.
- Afirmar 100% de aderência à POC sem evidência para todos os itens.

**Fim.**
