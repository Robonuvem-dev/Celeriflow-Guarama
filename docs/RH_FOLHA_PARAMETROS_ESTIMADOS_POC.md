# RH/Folha — parâmetros documentais e estimados para a POC

Data: 11/10/2026. Pacote: `RH_POC_DOCUMENTAL_2026_V1`. Autorização: utilizar fontes históricas, mescla de legislação de outro município e valores estimados para demonstrar funcionalidades; substituir os parâmetros na implantação.

## 1. O que foi colocado em funcionamento

- `/rh/poc`: instala parâmetros, prepara três titulares fictícios e nove folhas por competência de 2026; permite calcular, conferir, fechar e publicar demonstrativos em **DEMONSTRACAO**.
- Mensal mantém o motor existente; oito tipos especiais usam fórmulas específicas, parâmetros explícitos e snapshots. O modo `OFICIAL` identifica uma execução que pode ser fechada **no seu escopo**; não significa que a regra estimada passou a ser legislação municipal.
- Memória de IRRF por pessoa física, com dedução escolhida, base, imposto preliminar, redução e imposto final. Relatório `IRRF` em PDF/XLSX/CSV.
- Férias: mescla de faixas de faltas, apuração por datas distintas do ponto, perda em dias e impedimento de reaquisição silenciosa quando a frequência muda.
- ATS e licença-prêmio: opção por anos civis, incluindo bissextos, além das políticas anteriores por dias.
- `/rh/diarias`: solicitação calculada, decisão numerada, prestação circunstanciada e restituição declarada; modelos dos três documentos em PDF/CSV/XLSX.
- Modelo de remessa salarial por folha fechada, com contas fictícias e líquido reconciliável aos demonstrativos.
- Registro de pagamento **demonstrativo**, por data, para alimentar o informe anual modelo POC. Não altera a quitação bancária nem cria pagamento nativo no Financeiro.
- Parâmetros de consignação, provisões, banco de horas e extras instalados para usar os serviços já existentes.

Preparação é repetível: não apaga dados, não reinicia folha fechada e preserva ajustes do operador nas políticas existentes. A preparação tem etapas transacionais (parâmetros, entidades, contratos); se uma etapa falhar, repetir conclui as etapas faltantes. Não é uma única transação para todo o pacote.

## 2. Fontes utilizadas e como foram mescladas

| Fonte | Aplicação efetiva | Natureza |
|---|---|---|
| `IBEMA-EST-001.pdf`, Estatuto LC 025/2005 histórico | ATS 5% por quinquênio/teto 30%; férias 30 dias/12 meses/terço/abono; licença-prêmio 90 dias e limite de pecúnia 45 dias. | Referência histórica, sem consolidação de vigência. |
| ID **005**, `7c9ec788b259920d6d53329bca40ae12.pdf`, Campina do Simão Lei 21/2025 | Art. 106 §5º, p. 28: fracionamento em até três etapas de dez dias. Art. 109, p. 29: faixas 6–14, 15–23 e 24–32 faltas. | Mescla **somente demonstrativa**, autorizada pelo usuário. Não declarada como lei de Ibema. |
| Casos T11–T15 e `teste_calculos_referencia.py` do pacote antigo | Valores 4.400/5.000/1.621, RGPS progressivo e IRRF 2026/redução. | Referência aritmética; agora também exercitada no motor TypeScript. |
| IDs **089/090/137** | Nomes de cargos, referências de faixa e modelo de matrícula/lotação/jornada. | Estrutura municipal; pessoas e salários do seed são fictícios. |
| ID **128**, p. 33 | Escolha do RGPS como referência geral do pacote. | Certidão municipal; não fornece enquadramento/encargos completos. |
| ID **013**, Cartilha Diárias julho/2025, p. 2–8 | Valores por destino, campos de solicitação/autorização/prestação e referência de distância. | Fonte municipal histórica, complementada pelas decisões POC abaixo. |
| IDs **045/076/100/105/132–134** | Estrutura de consignações, passivos, fontes, contas e etapas financeiras. | Apoiam mapeamento e conciliação; não geram classificação ou convênio real automaticamente. |
| Formulários PR/Paranaguá e modelos HTML do pacote antigo | Referências de jornada, campos e organização das saídas. | Modelos de referência, sem importar automaticamente os direitos desses entes. |

## 3. Base fictícia e salários

| Titular | Cargo modelo | Faixa modelo | Salário BRL | Jornada mensal |
|---|---|---|---:|---:|
| Ana Modelo — FICTÍCIO POC | Agente administrativo — POC fictício | H-01 | 4.400,00 | 200h |
| Bruno Modelo — FICTÍCIO POC | Professor — POC fictício | LP-01 | 5.000,00 | 100h |
| Carla Modelo — FICTÍCIO POC | Auxiliar de enfermagem — POC fictício | E-01 | 1.621,00 | 200h |

Admissão/nomeação/posse: **01/01/2020**, fictícias, permitindo demonstrar aquisição de direitos. Matrículas `POC-V1-1` a `POC-V1-3`. CPFs são gerados com dígitos verificadores; não representam identificação confirmada de pessoas reais. Colisão com outro cadastro bloqueia a preparação.

Jornadas 200/100h são estimadas para o modelo de 40/20h semanais. **Não constituem conversão oficial** das cargas impressas nos documentos. Não há tabela salarial municipal completa: os valores são referências de casos de teste associados a cargos/faixas ilustrativos.

O pacote usa o regime efetivo POC nos três contratos e também cadastra modelos comissionado/temporário. Categorias eSocial 301/302/306 são referências de configuração, sujeitas ao enquadramento real de cada vínculo. Não foram criados usuários Firebase nem concedidas permissões. Para demonstrar o Portal como titular, vincular um usuário de teste autorizado à identidade funcional correspondente.

Se não houver `ConfiguracaoInstancia`, a preparação cria uma identificação explícita de **Ibema — demonstração POC**, sem CNPJ inventado e sem alterar o cadastro `Institution`. Conferir/substituir a identidade institucional na implantação.

## 4. Previdência e encargos

| Parâmetro | Valor do pacote | Origem / substituição |
|---|---|---|
| RGPS segurado | 7,5% até 1.621; 9% até 2.902,84; 12% até 4.354,27; 14% acima, até teto 8.475,55. | Pacote antigo, referência 2026; confirmar competência e população. |
| Forma de cálculo | Progressiva, teto uma vez por PF/esquema; rateio de centavos entre contratos. | Serviço existente, com testes. |
| Patronal | **22%**, base sem teto do segurado. | **Estimativa: 20% + componente adicional hipotético de 2%.** Não representa RAT/FAP confirmado nem todas as contribuições aplicáveis. |
| FGTS | Não há incidência automática no regime estatutário do pacote. | Configurar quando a população/regra exigir; não inferir FGTS para todos os servidores. |

Exemplos de referência: RGPS sobre 4.400 → **417,51**; sobre 1.621 → **121,58**. Arredondamento monetário `HALF_UP`, duas casas; cálculos usam `Prisma.Decimal`.

## 5. IRRF 2026

Tabela por base deduzida:

| Faixa superior BRL | Alíquota | Parcela a deduzir BRL |
|---:|---:|---:|
| 2.428,80 | 0% | 0,00 |
| 2.826,65 | 7,5% | 182,16 |
| 3.751,05 | 15% | 394,16 |
| 4.664,68 | 22,5% | 675,49 |
| Sem limite | 27,5% | 908,73 |

- Dedução por dependente: **189,59**; dedução simplificada mensal: **607,20**.
- Selecionar a maior entre deduções legais apuradas (previdência + dependentes neste fluxo) e simplificada, uma vez por PF.
- `base = max(0, renda tributável − dedução escolhida)`.
- `imposto preliminar = max(0, base × alíquota − parcela a deduzir)`.
- Até renda tributável **5.000**: redução limitada ao menor entre imposto preliminar e **312,89**.
- Acima de 5.000 até **7.350**: redução `max(0, 978,62 − 0,133145 × renda tributável)`, limitada ao imposto preliminar.
- Acima de 7.350: sem redução. A redução usa a **renda antes das deduções**, não a base de cálculo.
- A regra tem início em **01/01/2026** e é selecionada no fluxo mensal/complementar/férias POC. Férias/complementares são apuradas isoladamente neste incremento, sem compensação entre diferentes folhas/pagamentos do mesmo mês.

Caso T13: renda 5.000, previdência 509,60 → dedução simplificada 607,20 → base 4.392,80 → imposto 312,89 → redução 312,89 → **IRRF 0,00**.

RRA POC: base líquida dividida pelo número de meses, aplicação da tabela e multiplicação pelo número de meses; sem dedução simplificada nem redução mensal. Exemplo sem outras deduções: 18.000/6 → base mensal 3.000 → 55,84 × 6 → **335,04**. Enquadramento do processo, deduções específicas e demais condições precisam ser validados na implantação.

Pendências fiscais: pensões, exterior, compensação por pagamentos no mesmo mês, classificação de rescisão, particularidades de férias/13º e demais situações não cobertas. Este incremento não conclui toda a tributação oficial.

## 6. Fórmulas das oito folhas especiais

`B = salário temporal + média informada`. Avos podem ser informados; na ausência, são contados no ano até a competência, com exercício de pelo menos 15 dias no mês. Frações não aprovadas de afastamentos ainda não entram nessa contagem.

| Tipo | Fórmula do modelo | Premissas que precisam ser substituídas |
|---|---|---|
| Complementar | Valor complementar informado. | Rubricas, incidências e compensação com folha/pagamentos anteriores. |
| Adiantamento salarial | `B × percentual / 100`; padrão **40%**. | Percentual **estimado**; sem tributação neste adiantamento; desconto futuro exige informar o abatimento. |
| 1ª parcela 13º | `B × avos / 12 / 2`. | Metade estimada do proporcional; abatimento na parcela final deve ser informado. |
| 13º | `B × avos / 12 − adiantamento informado`. | RGPS e IRRF sobre base do 13º do modelo, sem redução mensal; validar deduções e regime tributário próprio. |
| Diferença 13º | Total proporcional recalculado menos valor anterior informado. | O operador informa o que já foi pago; não calcula diferença automaticamente a partir de uma folha vinculada. |
| Férias | `B × dias / 30`, mais `remuneração de férias / 3`. | Modelo de pagamento separado. Não concilia automaticamente a remuneração já paga na mensal nem consome reservas de direitos. |
| Rescisão | Saldo salarial + 13º proporcional + férias indenizadas + terço indenizado − adiantamentos. | Modelo estatutário, sem aviso/multa FGTS. Tributação de saldo e 13º é **agregada/estimada**; não encerra o vínculo nem baixa direitos automaticamente. |
| RRA | Valor bruto informado; IRRF pela tabela multiplicada pelos meses. | Processo/distribuição, bases previdenciárias e deduções específicas ainda precisam de confirmação. |

Incidências POC: complemento, saldo, férias gozadas/terço, 13º e RRA entram em RGPS/IRRF; adiantamentos e férias indenizadas/terço indenizado não entram. Abatimento de adiantamento reduz líquido, não a base tributável. São escolhas de **modelo**, não homologação jurídica das incidências.

As execuções especiais demonstrativas podem ser fechadas e publicadas usando os serviços existentes. Reserva/gozo de direitos e desligamento permanecem operações próprias; os snapshots registram `rightsConsumed=false` e `employmentTerminated=false`.

## 7. Férias, ATS e licença-prêmio — decisões da mescla

### Férias e faltas

| Faltas injustificadas consideradas | Dias de férias | Referência |
|---:|---:|---|
| 0–5 | 30 | Ibema histórico. |
| 6–14 | 24 | Campina do Simão art. 109; resolve fronteira 6 na POC. |
| 15–23 | 18 | Campina do Simão art. 109; resolve fronteira 15 na POC. |
| 24–32 | 12 | Campina do Simão art. 109; resolve fronteira 24 na POC. |
| 33 ou mais | 0 | **Fechamento estimado da lacuna em 33**, a confirmar na implantação. |

Status `Falta` do ponto é tratado como injustificada **por escolha expressa da política POC**. Datas repetidas contam uma vez. Alterar faltas/faixas após aquisição bloqueia reapuração que mudaria o saldo, exigindo conciliação compensatória. Afastamentos continuam exigindo regra própria de perda/prorrogação; não são ignorados.

Fracionamento: até três etapas, mínimo dez dias em cada uma, inspirado no art. 106 §5º de Campina. Abono máximo dez dias; concessão de referência em doze meses. Confirmar composição, prazos e fracionamento no regime real.

### ATS/licença-prêmio

- ATS: 5% por cinco anos civis, teto 30%, salário temporal. Regras anteriores por dias continuam disponíveis.
- Licença-prêmio: cinco anos civis, 90 dias; frações mínimas 15 dias e até seis gozos são **estimativas operacionais**. Pecúnia reservável até 45 dias, sem pagamento automático.
- Convenção POC: aniversário de admissão em 29/02 ocorre em 28/02 no ano não bissexto. Averbações/exclusões em dias deslocam a referência efetiva de ATS. Confirmar convenção municipal.
- Licença sem vencimentos suspende aquisição; licença médica conta; suspensão disciplinar reinicia licença-prêmio. **Simplificação estimada de efeitos**, não transcrição integral de todos os impedimentos do Estatuto.
- Aquisição iniciada em 01/01/2020 completa cinco anos cobertos em 31/12/2024 (1.827 dias); ATS alcança o aniversário em 01/01/2025. Testes distinguem essas fronteiras.

## 8. Outros parâmetros estimados

| Tema | Modelo instalado | O que confirmar na implantação |
|---|---|---|
| Extras | 50%, origem reconhecida no ponto. | Segmentação 50/100%, noturno, autorização e limites por intervalo. |
| Banco de horas | Saldo máximo 120h; crédito máximo 2h/dia; débito máximo 8h/dia; não duplicar crédito com extra paga. | Limites, validade, regimes, compensação e acordos. |
| Margem consignável | 35% sobre remuneração menos previdência/IRRF; contratos do mesmo titular compartilham margem. | Norma, submargens, bases, produtos, banco/carência e convênio. |
| Provisão de férias | 11,11111111% sobre vencimento/ATS; patronal 22%. | Remuneração elegível, rateio, contas e integração patrimonial. |
| Provisão de 13º | 8,33333333%; patronal 22%. | Avos, bases e razão contábil. |
| Provisão de licença-prêmio | 5%; patronal 22%. | **Estimativa 90 dias em 60 meses**, política de reconhecimento/pecúnia. |

## 9. Diárias

Tabela **demais servidores** da cartilha: DF 540,53 BRL; capital 405,39 BRL; interior 337,83 BRL; internacional 130 USD. Câmbio é informado pelo operador; 5 BRL/USD exibido no formulário é apenas exemplo.

Premissas POC: distância estritamente maior que 70 km; cada 24h gera uma diária; sobra >12h com pernoite gera uma diária; sobra >8h gera meia; demais sobras não geram diária. Exatos 8h não geram e exatos 12h geram meia. As fronteiras são **interpretação estimada**, a conferir nas leis/decreto da cartilha.

Arredondamento `DOWN` em duas casas: meia diária de 337,83 → **168,91**, compatível com exemplo de execução recebido. Registrar que esta escolha difere do `HALF_UP` geral da folha.

Autorização tem número/fundamento/ator/data; decisão repetida não duplica efeitos. Prestação preserva atividades, data e restituição declarada. O valor utilizado é total autorizado menos restituição declarada. Não comprova restituição bancária nem pagamento pela Tesouraria.

## 10. Bancos e convênios que ainda precisamos obter

O modelo usa códigos bancários de exemplo **001, 104 e 756**, agência 0001 e contas fictícias. Códigos 237/341 também são catalogados como exemplos. **Não foi comprovado convênio salarial do município com esses bancos.** Relações de empenho e documentos de contas ajudam a escolher referências, mas não substituem contrato/layout de folha.

| Falta obter | Modelo próximo para demonstrar enquanto isso |
|---|---|
| Banco da folha, número do convênio, serviço/modalidade, versão CNAB, identificação do ente, remessa e retorno reais. | `REMESSA_SALARIAL_POC` CSV/XLSX/PDF: banco/agência/conta/tipo/CPF/matrícula/favorecido/líquido/versão. Não é CNAB homologado. |
| Gestor/consignatárias, contrato de integração, códigos de rubrica/produto, layout e API/web service. | Importação existente de movimentos e cronograma/reserva próprios; sugerir CSV `matricula;rubrica;valor;inicio;fim;referencia;observacao`. Ainda sem web service do gestor. |
| TCE-PR: obrigação, módulo, leiaute/versão, tabelas e amostra aceita. | Exportador configurável existente, histórico e resumos contábeis; não chamá-los SIM-AM homologado. |
| SIOPE: classificação por profissional/vínculo/fonte/despesa e leiaute exigido. | Relatórios de folha e fontes MDE/FUNDEB como conferência; exportador específico segue pendente. |
| A1/procuração eSocial, identificação do empregador/EFR/estabelecimentos, classificação e configurações. | Preparação/outbox e documentação MOS/XSD disponíveis; geração XML, assinatura, cliente/worker/retornos ainda precisam ser implementados. |
| Operadoras de saúde/benefícios, transportadoras/linhas/tarifas e eventuais integrações. | Serviços parametrizados de benefícios já existentes; ampliar cadastros/jornadas por contrato quando recebidos. |

Se houver outro arquivo de caso ouro além dos cenários T11–T15, informar seu nome/caminho para incorporá-lo à comparação. Os arquivos aritméticos já recebidos foram aproveitados neste incremento.

## 11. Como demonstrar

1. Abrir `/rh/poc`; competência padrão 10/2026.
2. Preparar base fictícia. Conferir contratos/regras em Operações e Parametrizações.
3. Opcionalmente apurar ATS/direitos usando os IDs de regras listados na página. Para mostrar saldo/memória de férias, gerar aquisitivos e reservar gozo pela operação própria.
4. Calcular Mensal, abrir a execução, conferir memória e fechar. Exportar folha/IRRF/remessa modelo.
5. Calcular cada especial, ajustando avos/médias/dias/adiantamentos/valor/meses e fundamento. Conferir, fechar e publicar a versão demonstrativa.
6. Registrar pagamento demonstrativo com data no detalhe da execução e emitir o informe anual modelo POC pela página inicial.
7. Abrir `/rh/diarias`; solicitar, autorizar e prestar contas; emitir os três modelos.
8. Para o Portal, usar um usuário de teste legitimamente vinculado ao titular, conferir liberação e isolamento de acesso.

Alternativa operacional por CLI:

```powershell
npx tsx scripts/seed-hr-documentary-poc.ts
npx tsx scripts/seed-hr-documentary-poc.ts --apply --calculate --close
# Publicação é opcional; repetir usa os mesmos registros e execuções:
npx tsx scripts/seed-hr-documentary-poc.ts --apply --calculate --close --publish
```

## 12. Situação das fases e limites restantes

| Fase | Ganho deste incremento | Pendências para conclusão integral |
|---|---|---|
| F0 | Pacote repetível, parâmetros segregados e cadastro demonstrativo institucional quando ausente. | Temporalidade/rateio intramês e validação do ambiente implantado. |
| F1 | Três identidades/contratos com cargos/faixas/jornadas/bancos de modelo. | Cadastro integral, progressões/funções/cessões/estágio e todos os campos/filtros da POC. |
| F2 | IRRF 2026 com redução/memória; referências RGPS 2026 no motor real. | Demais exceções fiscais, compensação entre folhas/pagamentos e rateio temporal. |
| F3 | Pacote habilita margem/consignação e rubricas de movimento. | Pensões, benefícios avançados, renegociação/submargens e integrações. |
| F4 | ATS/licença por calendário civil; faixas de faltas mescladas com ledger de perdas. | Afastamentos/transições, aquisição especial, pagamentos/baixas e automatizações completas. |
| F5 | **Ciclo de cálculo→conferência→fechamento→publicação dos oito tipos especiais disponível em DEMONSTRACAO.** | Tributação e efeitos oficiais completos, desligamento/reintegração/TRCT, médias/baixas automáticas e diferença vinculada a folha anterior. |
| F6 | Diárias e documentos; remessa/pagamento **modelos POC** e parâmetros de provisão. | Ciclo nativo contábil/financeiro até pagamento, repasses, razão e baixa automática. |
| F7 | Publicação dos especiais e informe anual **modelo POC por data de pagamento demonstrativo**. | Informe fiscal oficial, usuários/percurso autenticado e demais jornadas do Portal. |
| F8 | Dados/modelos de referência preparados. | XML/XSD/assinatura/cliente/worker/retornos e exportadores oficiais específicos. |
| F9 | Casos ouro aritméticos, calendários e percurso transacional automatizado ampliados. | Homologação autenticada/visual e evidência individual dos 134 requisitos. |

O uso de dados estimados remove dependência da base municipal completa **para demonstrar os fluxos aqui implementados**. Não elimina funcionalidades ainda não construídas nem transforma os modelos em atendimento integral dos 114+20 itens. A matriz inicial continua histórica; o registro de execução informa os incrementos atuais.

## 13. Execução no banco configurado e evidências

Executado `--apply --calculate --close` e depois `--publish` para **10/2026**, com três titulares, nove execuções fechadas e **27 demonstrativos publicados**. Identificador do conjunto: `cmv4ggnz600003chyw0retkus`. A segunda execução reutilizou os mesmos registros/cálculos. A consulta como titular exige usuário de teste vinculado à pessoa/servidor correspondente.

| Folha | Bruto BRL | Descontos BRL | Líquido BRL |
|---|---:|---:|---:|
| Mensal | 11.021,00 | 1.040,60 | 9.980,40 |
| Complementar | 450,00 | 33,75 | 416,25 |
| Rescisão | 34.899,84 | 4.558,16 | 30.341,68 |
| RRA | 54.000,00 | 3.524,76 | 50.475,24 |
| Férias | 14.694,67 | 2.495,25 | 12.199,42 |
| 1ª parcela 13º | 4.592,08 | 0,00 | 4.592,08 |
| 13º | 9.184,17 | 1.023,03 | 8.161,14 |
| Diferença 13º | 9.184,17 | 1.023,03 | 8.161,14 |
| Adiantamento salarial | 4.408,40 | 0,00 | 4.408,40 |

Cada tipo representa **um cenário independente**, não uma cadeia de todos esses pagamentos devidos às mesmas pessoas. Na execução inicial, o abatimento anterior é zero e avos são automáticos (dez na competência outubro); por isso 13º e diferença 13º têm o mesmo resultado. Informar o valor anterior para demonstrar a diferença efetiva.

Validação: 23 testes unitários/documentais/de direitos aprovados; um teste transacional PostgreSQL/PGlite aprovado com preparação repetível, nove cálculos/fechamentos/publicações, PDF, remessa, pagamento/informe anual, diárias e aquisição de férias com faltas; 14 testes de integração SST aprovados no lote anterior. Total de **38 testes aprovados em lotes**, após correções. ESLint aprovado. Verificação visual autenticada não executada: ferramenta de navegador sem conexão nesta sessão. Resultado final de build registrado em `RH_FOLHA_EXECUCAO.md`.

## 14. Continuação: fluxos vinculados, rateio, pensões e efeitos funcionais

Esta seção atualiza as limitações descritas nos itens anteriores para os novos **fluxos opcionais**. Os cenários antigos sem vínculo continuam sendo modelos independentes.

### 14.1 Rateio mensal por dias civis

Em `/rh/poc`, a opção **Aplicar rateio civil POC** seleciona a política `RATEIO_MENSAL_CIVIL`:

- Particionar exercício por vigências de salário, jornada e lotação; mudanças de regime/previdência exigem política própria de transição.
- Para cada trecho, calcular a remuneração de referência do mês com seus salário/jornada/fórmulas; multiplicar pelo fator `dias ativos do trecho / dias civis do mês`.
- **Divisor estimado:** dias efetivos do mês (28/29/30/31). Não é confirmação do divisor municipal /30. A opção anterior /30 permanece disponível.
- Valores manuais são tratados como **montantes integrais já autorizados**, distribuídos entre os trechos ativos; não recebem desconto automático pela admissão parcial. O operador deve informar o valor devido do movimento.
- Rateio de centavos pelo maior resto, preservando o total da rubrica; bases previdenciárias/fiscais consolidadas antes de aplicar tetos por PF.
- Admissão, término e reintegração delimitam dias ativos. Inativação e períodos sem exercício não geram segmentos remunerados.
- Memória de cada segmento conserva salário, jornada, local, centro e valores. O resumo contábil mantém lotações históricas; descontos automáticos e encargos são distribuídos proporcionalmente aos proventos, com dias como fallback. O planejamento de despesas usa os centros dos segmentos.
- Fechamento compara vigências e política novamente. Correção de dados depois da apuração exige recálculo.

Exemplo executado: Ana recebe 4.400/200h até 15/11; a partir de 16/11, recebe **6.400/100h** em outra lotação. Novembro tem 30 dias: `4.400 × 15/30 + 6.400 × 15/30 = 5.400`. Valores/jornada da segunda vigência são **fictícios estimados** para o cenário.

Pendências: transições de regime, movimentos cuja proporcionalidade dependa de horas/dias específicos, atualização automática do ATS intramês, critérios municipais de divisor e integração de toda a cadeia contábil.

### 14.2 Pensões alimentícias

Página `/rh/pensoes`, configurador demonstrativo, relatório `PENSOES` em PDF/XLSX/CSV e memória no recibo:

- Beneficiário do Cadastro Único; identificador estável, processo/ato, início/fim e tipos de folha explicitamente selecionados.
- Valor **FIXO** ou **PERCENTUAL**.
- Bases **BRUTO**, **APOS_PREVIDENCIA** ou **APOS_IRRF**. A última significa bruto menos previdência e IRRF, sem deduzir consignações/outras pensões.
- Dedução fiscal explícita, somente para pensões calculadas antes do IRRF. Base APOS_IRRF com dedução do próprio imposto é rejeitada por circularidade.
- A política registra os termos estimados; não presume percentual ou incidência universal de uma decisão judicial real.
- Não há redução silenciosa do desconto por limite de líquido; insuficiência segue a política de líquido negativo da folha. Vigência parcial intramês da pensão exige decisão específica, sem proporcionalidade inventada.
- Configuração alterada após cálculo impede fechamento até recálculo. Histórico anterior conserva sua política/beneficiário.

Modelo executado: **20%** do bruto após previdência de Ana, destinado a Carla (ambas identidades fictícias), processo **POC-002/2026 fictício**, aplicado somente à Mensal e dedutível de IRRF. Referência: 4.400 − 417,51 = 3.982,49; 20% → **796,50**. O relatório não comprova repasse ao beneficiário; conta/decisão judicial real ainda precisa ser recebida.

### 14.3 Primeira parcela, final e diferença de 13º

Adicionar `sourceRunId` aos parâmetros:

- **13º**: fonte deve ser primeira parcela fechada; buscar o adiantamento por contrato automaticamente. `previousAdvance` manual deve permanecer zero.
- **Diferença 13º**: fonte deve ser 13º final fechado. `provento da diferença = total proporcional recalculado − bruto da fonte`.
- Fonte/destino exigem mesmo conjunto, escopo, ano e seleção exata de contratos; competência da origem não pode ser posterior.
- Diferença previdenciária/patronal: recalcular sobre a base acumulada e subtrair o valor anterior. IRRF: recompor renda/deduções acumuladas e subtrair a retenção anterior. Ratear somente o incremento entre vínculos.
- Imposto PF mostrado na memória da diferença corresponde ao **total acumulado**; o item IRRF e a coluna **IRRF alocado** do relatório mostram a retenção incremental dessa folha.
- Fechamento registra utilização única da fonte para cada parcela/diferença. Outra execução pode ser simulada, mas não duplicar o fechamento da mesma fonte.
- Diferenças negativas de remuneração, imposto ou encargos exigem restituição/compensação própria. Mudança de esquema previdenciário exige conciliação específica. Encadeamento de sucessivas diferenças ainda não foi implementado.

Sem `sourceRunId`, mantém-se o cenário independente/manual anterior. A origem comprova **cálculo fechado**, não pagamento bancário.

### 14.4 Férias vinculadas aos direitos

Adicionar `vacationEntryIds`, objeto `ID_CONTRATO → lista de IDs das reservas de gozo`:

- Todos os contratos selecionados devem ter reservas; somar os dias por contrato e substituir os dias manuais pelo total encontrado.
- Validar titular, aquisitivo, programação, quantidade e cancelamentos; início do gozo deve estar na competência da folha.
- As reservas já têm quantidade negativa no ledger. O fechamento **concilia a reserva com a folha**, sem debitar dias outra vez.
- Cada reserva só pode integrar uma folha fechada. Cancelamento posterior exige compensação financeira; a programação e os dias são conferidos novamente no fechamento.
- Férias por múltiplos aquisitivos podem fornecer vários IDs. Pecúnia não entra neste fluxo de gozo.
- `rightsConsumed=true` neste cenário identifica aproveitamento das reservas **já debitadas**, com origem `RESERVAS_JA_DEBITADAS_NO_LEDGER`.

Permanece pendente conciliar automaticamente a remuneração de férias com a mensal e demais regras tributárias/abonos. Os cenários livres sem reservas continuam sem efeitos no ledger.

### 14.5 Desligamento e reintegração demonstrativos

No detalhe da rescisão fechada, operação própria registra ato/número/fundamento e nova revisão contratual:

- Desligamento automático deste modelo usa **último dia da competência**; inativação começa no dia seguinte. Desligamento intramês permanece pendente.
- Reintegração exige o desligamento vinculado, data posterior e conferência do quadro de cargos; nova vigência volta a ATIVO. Rateio civil remunera somente os dias ativos após retorno.
- Operação repetida não duplica ato/revisão; alterações concorrentes de contrato e competências posteriores fechadas impedem sobrescrever o histórico.
- Demonstrativos antigos permanecem preservados. O cadastro global do empregado não é inativado indiscriminadamente, preservando outros vínculos e consulta histórica.
- Não calcula salários retroativos, indenizações/restituições, TRCT oficial ou direitos do intervalo entre desligamento e reintegração. Os eventos registram essas pendências expressamente; o tratamento jurídico do intervalo precisa ser definido.

### 14.6 Cenários adicionais preparados no banco

Executado `npx tsx scripts/seed-hr-poc-linked-workflows.ts --apply --publish`:

| Cenário | Competência | Bruto BRL | Líquido BRL |
|---|---|---:|---:|
| Mensal com segunda vigência e pensão | 11/2026 | 12.021,00 | 9.871,90 |
| 13º com primeira parcela vinculada | 12/2026 | 13.021,00 | 6.135,98 |
| Diferença vinculada, média estimada +300 por contrato | 12/2026 | 900,00 | 649,15 |
| Férias de dez dias por titular, reservas vinculadas | 12/2026 | 5.787,11 | 5.325,71 |

Quatro execuções fechadas e **12 demonstrativos adicionais publicados**. Cenários de outubro preservados. A rotina evita substituir contrato/pensões previamente ajustados por outro fluxo e pode concluir etapas remanescentes após falha. Desligamento/reintegração foram exercitados no banco isolado de testes, não aplicados aos titulares desta base demonstrativa.

Comando sem `--apply` mostra prévia sem gravações. Para executar, a primeira parcela de outubro precisa estar fechada. O pacote continua marcado DEMONSTRACAO; configuração/credenciais externas e exportadores oficiais seguem pendentes.
