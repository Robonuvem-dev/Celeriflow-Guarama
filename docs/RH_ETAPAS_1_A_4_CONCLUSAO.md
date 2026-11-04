# RH, Folha e Portal — fechamento interno de E1 a E4

Referência: 03/11/2026. Município de apresentação: **Prefeitura Municipal de Vereda das Auroras**.

**Continuidade:** este documento conserva o fechamento histórico de E1–E4. A implementação posterior dos requisitos 179, 138 e 135 e a consolidação correspondente estão em [RH / E5 — relatório sindical e arquivos bancários](RH_E5_ENTREGA_2026-11-03.md).

## Escopo e critério

Esta reconciliação substitui o inventário prospectivo de pendências de `IMPLEMENTACAO_RH_ETAPAS_1_A_4_EM_ANDAMENTO.md`. O plano original foi preservado em `PLANO_DESENVOLVIMENTO_RH_DEMONSTRACAO_FUNCIONAL.md`.

O atendimento exige ação acessível ligada ao serviço executável, com persistência, fontes e consumidores pertinentes. Não exige que um servidor já tenha passado pelo fato de negócio. Fonte histórica ausente é identificada e pode receber abertura documental; não é preenchida pelo cadastro atual. Parâmetros considerados nesta entrega são os municipais descritos em `RH_VEREDA_REGRAS_GERAIS_2026.md`.

**Classificação do recorte original de 85 pendências: 72 ATENDE e 13 NÃO ATENDE.** Dos 75 requisitos alocados aos pacotes internos, 72 estão atendidos integralmente; 82, 95 e 124 conservam partes externas necessárias e, portanto, continuam **NÃO ATENDE** como requisitos completos. Os outros dez pertencem a P10/P11. Não se usa classificação intermediária.

Na consolidação dos 219, mantendo os 134 atendimentos anteriores sem nova reavaliação nesta rodada, o resultado é **206 ATENDE / 13 NÃO ATENDE**. A tabela abaixo explicita exclusivamente os 85 itens que originaram o desenvolvimento; números são requisitos, não códigos do catálogo.

## Matriz binária e caminhos funcionais

Abreviações de menu: **RF** = RH → Registros funcionais; **REL** = RH → Relatórios; **OP** = RH → Operações; **PAR** = RH → Parametrizações. Exportações de REL usam o conjunto integral da consulta, antes da paginação.

| Item | Resultado | Caminho e entrega reconciliada / lacuna necessária |
| ---: | --- | --- |
| 40 | ATENDE | REL → Histórico completo: contratos, atos, cessões/comissões/retornos, cadastros, referências, direitos, formação, avaliações, certidões, memórias, eventos e demonstrativos; origens identificadas. |
| 41 | ATENDE | RF → Cessões e recebimentos; REL → Histórico de admissões/cedências: origem, destino, ônus, período e fundamento. |
| 77 | ATENDE | RF → Comissões: vínculo de origem, cargo e opção remuneratória; sobreposição termina pela vigência, com retorno temporal no cálculo e histórico. |
| 79 | ATENDE | RF → Regras de adicionais; OP → Direitos/processamento funcional: múltiplas concessões, averbações, aquisição devida e agendamento idempotente. |
| 81 | ATENDE | RF → Elegibilidade temporal de dependentes; motor de IRRF/família/abono aplica idade, exceção e documento por benefício, preservando a pessoa e o passado. |
| 82 | NÃO ATENDE | Fórmulas, beneficiários, desconto e recibo internos implementados. Falta remessa das destinações no layout do banco/convênio escolhido em E5. |
| 83 | ATENDE | RF → Afastamentos/cessões: efeitos por finalidade e pagamento; cálculo diário considera vigência e retomada. |
| 84 | ATENDE | REL → Planejamento de férias e licença-prêmio; OP → Direitos: aquisição, saldos, concessões, mapa de gozos, cancelamentos e prazos da política preservada. |
| 85 | ATENDE | RF → Regras de progressão; processador automático aplica interstício, averbações, impedimentos e avaliações publicadas, gerando revisão e origem idempotente. |
| 87 | ATENDE | REL → Comparação cadastral e financeira mensal: duas referências, fotografias pessoais e demonstrativos fechados. |
| 89 | ATENDE | REL → Apuração de aposentadoria; OP → Direitos: tempo, média/índices, requisitos/transições, memória numerada e concessão com ato em vínculo próprio. |
| 90 | ATENDE | REL → Movimentação de pessoal: admissões, desligamentos, cedidos e recebidos no período. |
| 93 | ATENDE | REL → Comparação salarial por cargo: remuneração, média do grupo e diferença individual na mesma competência/modalidade. |
| 95 | NÃO ATENDE | Base atuarial interna disponível. Faltam adaptadores específicos dos prestadores/versões enumerados no requisito; arquivo colunar interno não os substitui. |
| 98 | ATENDE | REL → Alterações cadastrais por campo: antes/depois, observação, servidor, período e autoria. |
| 99 | ATENDE | REL: contrato comum de intervalos, multisseleções e ordenação; revisão/fotografia e rateio próprios de cada fonte, mesma consulta para prévia e exportação. Ver aplicabilidade abaixo. |
| 100 | ATENDE | OP → Direitos → provisões; REL → Provisões analíticas: saldo inicial, apropriação, baixa, estorno e final por servidor/tipo. |
| 103 | ATENDE | REL → Contábil por lotação/dotação: dimensão individual e verbas, rateios preservados ou certificação documental explícita. |
| 104 | NÃO ATENDE | Falta adaptador do TCE destinatário, exercício e versão definidos em E5. |
| 105 | ATENDE | REL → Contracheques em texto: competência, modalidade, titular, rubricas, bases e totais; formato RH-CONTRACHEQUE-1. |
| 107 | ATENDE | REL → Evolução entre referências: natureza, global/unidade, duas referências, variação absoluta e percentual, base zero explícita. |
| 108 | ATENDE | OP → Cálculos: categorias temporais ativo/aposentado/pensionista, mensal e modalidades especiais cabíveis; bases, incidências e origens reapuradas no fechamento. Ver matriz abaixo. |
| 109 | ATENDE | RH → Consignações → cronograma/lançamento; recibo/PDF preserva acordo, parcela atual/total e origem. |
| 111 | ATENDE | RF → Pisos/tetos de pessoal e de benefícios: bases explícitas, complemento/abatimento ou bloqueio e memória; consumo mensal/especial. |
| 112 | ATENDE | PAR → Salário-família e RF → Abono-família: políticas, elegibilidades e rubricas distintas, apuração automática e conferência no fechamento. |
| 113 | NÃO ATENDE | Falta apuração/exportação SIOPE no exercício/versão e enquadramento educacional do destinatário. |
| 116 | ATENDE | RH → Servidores → excluir cadastro indevido: recusa dependências, preserva pessoa central e auditoria. Não se aplica aos titulares com histórico operacional. |
| 117 | ATENDE | Perfis RH: escopos explícitos de lotação/verba; guardas em seletores, leitura, operações, downloads e origens Financeiro/SST; folha mista exige acesso integral. |
| 121 | ATENDE | RF → Férias especiais: aquisitivo em meses e dias por cargo/regime, inclusive enquadramento de radiologia; consumidor compartilhado de aquisição e planejamento. |
| 122 | ATENDE | REL → Cadastro geral: identificação, admissão, nascimento, documentos, identificação trabalhista, contatos e endereço da referência. |
| 123 | ATENDE | REL → Auditoria de RH e consulta administrativa de auditoria: filtros de usuário/ação/entidade/objeto/período e emissão integral. |
| 124 | NÃO ATENDE | Cálculos de contribuições, IRRF, FGTS e PIS/PASEP internos conectados por aplicabilidade. Faltam arquivos legais específicos, inclusive SEFIP/GFIP quando pertinentes, em E5. |
| 125 | ATENDE | ATS diário/automático: concessão na data, tempo anterior, união de faltas/afastamentos e memória; folha e agendador compartilham fontes. |
| 128 | ATENDE | OP → Cálculos → rescisão por direitos/motivo: data, saldos/avos, férias, médias canônicas, descontos e tributação mensal/13º segregada; ato funcional separado. |
| 131 | NÃO ATENDE | Comprovante anual preservado e conciliado; faltam DIRF/RAIS nos layouts/exercícios pertinentes em E5. |
| 133 | ATENDE | REL → Consignações por entidade e verbas: múltiplas rubricas, credor, cronograma, parcela, titular e totais sem duplicação. |
| 135 | NÃO ATENDE | Falta remessa de crédito no layout do banco/convênio escolhido; relação preparatória não é remessa oficial. |
| 136 | ATENDE | REL → Dados cadastrais e financeiros: RH-CADASTRAL-FINANCEIRO-1, UTF-8, ponto e vírgula, referência preservada. |
| 137 | ATENDE | RF → Estágios: curso, instituição, natureza/nível/área, seguro, agente/CNPJ, supervisor/CPF e vigência; REL → Estágios e vencimentos. |
| 138 | NÃO ATENDE | Falta arquivo de contracheques do autoatendimento Banco do Brasil na versão do convênio. |
| 139 | ATENDE | RF → Readaptação/reabilitação: cargo, período, CID/motivo/complemento, capacidade clínica explícita; histórico geral suprime dados clínicos. |
| 140 | ATENDE | RF → Opção previdenciária: suspensão temporal de rubrica, bases pessoal/patronal distintas e restauração ao término. |
| 141 | NÃO ATENDE | Faltam adaptadores por provedor/versão de Econsig, SpConsig, Santander, Caixa e ConsigNet. |
| 143 | ATENDE | REL → Previsão de retorno de afastamentos: licenças, afastamentos e cessões, motivo/período e matrícula/lotação da referência de retorno. |
| 144 | ATENDE | REL → Contábil por dotação/local: identificação individual, dimensões e totalizadores discriminados. |
| 152 | ATENDE | REL → Recibos de pensão judicial: documento próprio por desconto/beneficiário/processo, competência, emitente e origem; não presume repasse. |
| 153 | ATENDE | REL → Saldos negativos: prévias com origem/valor; cálculo oficial preserva a política de bloqueio. |
| 155 | ATENDE | REL → Comparação salarial por cargo, mesma modalidade do item 93. |
| 156 | ATENDE | REL → Comparação salarial por lotação: universo por competência/modalidade, média e diferenças individuais. |
| 157 | ATENDE | REL → Base atuarial: posição pessoal/contratual, remuneração, contribuições, benefício/instituidor e dependentes; ausências documentais identificadas. |
| 158 | ATENDE | REL → Base atuarial colunar: dicionário de campos, linhas próprias de dependentes e totalizadores não duplicados. |
| 162 | ATENDE | RF → Questionários de treinamento; Portal → participação concluída → avaliar; REL → resumo por curso/critério/versão e participantes. |
| 163 | ATENDE | REL → Cartão de ponto com calendário personalizado: previsão, feriados, dias sem expediente, ausências, marcas efetivas e totais; futuro permanece previsto. |
| 164 | ATENDE | OP → Direitos → certidão numerada; REL → certidões emitidas: tempo/deduções/averbações, finalidade, fundamento, emitente/responsável e hash imutável. |
| 166 | ATENDE | REL → Parâmetros de FGTS: regra observada, alíquota, rubricas/incidências, fundamento e vigência. |
| 167 | ATENDE | REL → Parâmetros de 13º: avos, parcelas, médias, deduções, incidências e regras consumidas pelo cálculo. |
| 168 | ATENDE | REL → Parâmetros de contabilização: rateio, componente, dotação/fonte/natureza/percentual, vigência e fundamento. |
| 169 | ATENDE | REL → Parâmetros de contagem: regras, ocorrências e políticas por finalidade, com versão observada. |
| 170 | ATENDE | REL → Parâmetros de dependentes: limites/exceções/documentos por benefício e políticas gerais efetivamente consumidas. |
| 171 | ATENDE | RH → Quadro de cargos; REL → Plano de cargos e referências: períodos, classificações, níveis, vagas, salários e jornadas. |
| 172 | ATENDE | RF → Serviços bancários: banco, convênio, serviço, versão e vigência; REL → Serviços bancários de pessoal. Cadastro não afirma adaptador de E5. |
| 173 | ATENDE | RF → Horas-aula: tarifa temporal e enquadramento; consumo por jornada ou rubrica BASE de quantidade, com memória diária e provento próprio. |
| 178 | ATENDE | REL → Planejamento de férias/licença-prêmio com filtro de unidade/lotação: aquisitivo, saldo, prazo e últimas férias efetivamente gozadas. |
| 179 | NÃO ATENDE | Falta composição/relatório de contribuição sindical conforme a Nota Técnica a identificar em E5. |
| 180 | NÃO ATENDE | Falta arquivo de abertura de contas no layout do banco conveniado. |
| 181 | NÃO ATENDE | Falta importação bancária conveniada com prévia e chave de lote específicas do layout. |
| 182 | NÃO ATENDE | Falta arquivo CAGED no exercício/versão pertinentes, inclusive modalidade histórica quando exigida. |
| 183 | ATENDE | OP → desligamento com ato; REL → Exonerações/demissões: motivo, ato, cargo e categoria funcional. |
| 184 | ATENDE | RF → Comissões/exercício eletivo; REL → Efetivos em comissão: vínculos relacionados e registros temporais, opção e fundamento. |
| 185 | ATENDE | REL → Contábil sintético por dotação: totais sem linhas individuais. |
| 188 | ATENDE | REL → Etiqueta contratual CTPS: modelo documental com campos trabalhistas, empregador, contrato e dimensões de impressão. |
| 189 | ATENDE | REL → Expectativa de ATS: próxima aquisição, dias faltantes, exclusões e regra; respeita teto e vigência. |
| 190 | ATENDE | REL → Ficha cadastral completa: identificação/documentos/endereço/contatos/formação/vínculos/dependentes, com posição documental. |
| 191 | ATENDE | REL → Ficha para conferência: PDF próprio, referência, seções, responsável e assinatura. |
| 192 | ATENDE | REL → Histórico integrado e afastamentos/cessões: períodos, motivos, situação e revisões identificadas. |
| 194 | ATENDE | REL → Histórico salarial: anterior/novo, percentual, razão/ato e vigência da revisão. |
| 195 | ATENDE | REL → Histórico das avaliações: ciclos, critérios, comissão, notas, conclusão/data/publicação e versões preservadas. |
| 196 | ATENDE | REL → Histórico de cargos: revisões, nomeações temporais, exercício eletivo e retorno ao vínculo de origem. |
| 199 | ATENDE | REL → Histórico dos rateios: revisões observadas de dotações/fontes/naturezas/percentuais, sem reconstrução pelo cadastro atual. |
| 202 | ATENDE | REL → Histórico dos locais: revisões, origem/destino, fundamento e vigência. |
| 209 | ATENDE | REL → Pensões sintéticas: totais por beneficiário/processo/período da fonte calculada, sem duplicar analítico. |
| 211 | ATENDE | REL → Contábil por lotação/fonte: cruzamento e totalizadores da apropriação canônica. |
| 213 | ATENDE | REL → Resumo por classificação funcional orçamentária: classificação do rateio distinta da classificação do plano de cargos, com seleção e totais. |
| 215 | ATENDE | REL → FGTS por dotação: componente individualizado, conciliação com os encargos. |
| 217 | ATENDE | REL → FGTS por lotação: componente e lotação histórica da fonte, sem incluir outros encargos. |

### Aplicabilidade dos filtros — item 99

- Folha/financeiro: matrícula, vínculo/regime, cargo, lotação, local, dotação/classificação, titular, competências/exercícios e modalidade usam fotografias de demonstrativo e rateio da execução/certificação.
- Cadastro e direitos: matrícula/enquadramento vêm da revisão da referência; dotações usam versões observadas. História integrada resolve o vínculo na data do evento. Regras gerais intersectam o enquadramento do contrato selecionado quando há filtro ou escopo.
- Parâmetros gerais sem titular, auditoria, bancos e documentos numerados mantêm sua semântica: vigência, busca e filtros próprios, sem fabricar relações com folhas. Competência/tipo não convertem cadastro bancário em evento financeiro.
- O comprovante anual mantém a totalidade por beneficiário/exercício; recortes que o tornariam parcial são recusados explicitamente. Ordenação usa os campos de identidade disponíveis na modalidade. A exportação não se limita às vinte linhas da página.

### Categorias e modalidades — item 108

- Ativo: mensal, adiantamento salarial, complementar, férias, 13º/adiantamento/diferença, rescisão e RRA têm caminhos de cálculo próprios com parâmetros e origens pertinentes.
- Aposentado/pensionista: vínculo próprio e valor temporal do benefício, inclusive titular inativo no cadastro de pessoal; mensal e especiais cabíveis usam incidências/contribuições e limites próprios. Pensionista nunca é calculado no contrato do instituidor.
- Férias de pessoal não são concedidas a vínculo de benefício. Comissão, afastamento e direitos de pessoal não são transportados para esse vínculo. A recusa de combinação inaplicável faz parte da matriz.
- Recálculo ocorre em folha aberta, com invalidação de cálculo desatualizado e reavaliação antes do fechamento. Execuções encerradas e suas retenções permanecem preservadas; compensações exigem política, origem fechada e limite de retenção.

## Fontes e evidências técnicas

| Área | Implementação/consumidores conferidos | Evidência |
| --- | --- | --- |
| Relatórios | `report-service.ts`, `report-filters.ts`, `operational-reports.ts`, `extended-reports.ts`, `management-reports.ts`, contabilidade e emissores específicos | `RH_ETAPAS_RELATORIOS_VERIFICACAO.json`: 130 serviços/CSV; não substitui a análise por requisito acima. |
| Temporalidade | Revisões pessoais/contratuais/de referências/configuração e `functional-history-report.ts`; apuração previdenciária usa nascimento/sexo/nome observados | `rh-stages-history.test.ts`: replay físico integral, imutabilidade, não ressurreição, rateios/FGTS, identidade histórica, regras por enquadramento e recusa de rubrica fora do escopo. |
| Direitos | Processador canônico, agendador, folha, aquisição/planejamento e regras de ausência/progressão | `RH_VEREDA_DIREITOS_VERIFICACAO.json`: 198 prévias e 198 contratos processados; regressões de tempo, férias comuns/especiais e direitos. |
| Folha | `workforce-service.ts`, categorias/incidências, bases especiais, compensação, rescisão, recibos e Financeiro | Regressão ampla `hr-workforce-service.test.ts`; regressões financeiras e de cálculo; `RH_VEREDA_FOLHA_VERIFICACAO.json`: 198 demonstrativos em transação integralmente revertida. |
| Previdência | `retirement-assessment.ts`, `retirement-time.ts`, `contribution-history.ts`, certidões, emissão/concessão e base atuarial | Inspeção dos fluxos conectados, regressões de idade/transições e integridade física, emissões de serviço. Não afirma execução de concessão para os 198 titulares. |
| Avaliações | Instrumentos, participações concluídas no Portal, respostas imutáveis, resumo e histórico; consumidor da progressão | Nove critérios instalados nos três cursos; inspeção de titularidade/instrumentos/consumidores e emissões. Não foram criadas respostas pelos servidores. |
| Autorização | `personnel-scope.ts`, `payroll-access.ts`, guardas operacionais, referências, origens aninhadas e integração Financeiro | Inspeção transversal; regressões de folha, Financeiro, páginas e recorte de direitos. Validação de dois acessos nas telas pertence ao aceite do usuário. |
| Preservação | Conferência somente leitura de titulares e execuções históricas | `RH_HISTORICO_VERIFICACAO_2025_2026.json`: 198 titulares, 19 execuções, 3.414 demonstrativos e fingerprint original `3d7da83e347a9af7801089cfb17fc48a` dos 594 de agosto–outubro. |

## Banco, interface e publicação

- Banco: migração `20261103180000_hr_functional_management` aplicada pelo executor oficial; plano posterior com 192 recibos reconhecidos e nenhuma pendência. Regras e certificações municipais instaladas com autoria. Esta reconciliação não acrescentou schema.
- Interface: os fluxos novos utilizam os componentes operacionais existentes. Documentos, etiquetas e calendário preservam sua semântica. Aderência foi inspecionada em código; validação visual/navegação e acesso individual do Portal serão realizados pelo usuário.
- Publicação: as correções posteriores ao commit do usuário `b20aec9` permanecem locais até commit/push e confirmação de deployment. O ator `RH_RIGHTS_ACTOR_USER_ID` está em Production; a ativação dessa variável e a execução do cron no ambiente publicado exigem novo deployment. O serviço de agendamento foi executado diretamente com sucesso.

## Fechamento técnico desta reconciliação

- Regressões de cálculo e histórico: dezoito testes aprovados na execução conjunta; o histórico físico foi reexecutado após os ajustes finais e passou novamente. Acrescentados casos que alteram nome/matrícula atuais e preservam seleção histórica; a apuração previdenciária também mantém nascimento/sexo observados (idade de 66 anos e regra feminina, apesar de cadastro atual com nascimento em 2000 e sexo masculino).
- Regressões documentais, direitos e histórico legal de cargos: nove testes aprovados na execução conjunta com o histórico físico.
- Última verificação municipal de relatórios: **130 PASS / 0 bloqueios / 0 falhas**, em `2026-11-03T15:10:42.716Z`, após a correção previdenciária. Evidência persistida em `RH_ETAPAS_RELATORIOS_VERIFICACAO.json`.
- Lint direcionado das alterações desta reconciliação aprovado; a rodada integral precedente teve zero erros e 25 avisos preexistentes. Partição auxiliar de tipos 10 aprovada sobre os testes atualizados.
- Inventário da matriz conferido contra os 85 identificadores originais: nenhuma omissão ou duplicação; 72 **ATENDE** e treze **NÃO ATENDE**.
- Fonte municipal preservada: SHA-256 canônico (`stablePersonnelJson`) de `RH_VEREDA_FONTES_2026.json` confirmado como `7cff28c5675b1583da33bb9bf3af603f0ef9cec97d5d1c298ed1f33a1879c73e`, igual ao utilizado nas certificações.
- Build integral de encerramento aprovado com código de saída zero (`npm run build`): verificações de migrações, tipos e compilação Next.js concluídas. Log: `C:\Users\trici\AppData\Local\Temp\opencode\rh-e1-e4-closure-build.log`. A partição auxiliar 10 e as regressões físicas também passaram sobre os ajustes finais.

## Roteiro de apresentação e aceite do usuário

1. Em REL, escolher uma modalidade da matriz, titular/referência e filtros pertinentes; conferir prévia e baixar emissão integral. Para o comprovante anual de 2025, usar **Ficha financeira anual para IRRF**, ano **2025**.
2. Em RF, cadastrar a ocorrência/regra pertinente com vigência e fundamento; usar prévia dos direitos antes da aplicação. Para efeitos incompatíveis com o histórico, utilizar contexto isolado; não editar competências encerradas.
3. Em OP → Cálculos, usar folha aberta, seleção de contratos e parâmetros da modalidade. Conferir memória e totais; fechamento e publicação são ações próprias. Não registrar pagamentos reais.
4. Para aposentadoria, apurar → emitir memória → encerrar vínculo de serviço pelo fluxo próprio → conceder em contrato de benefício próprio. Memória, ato e pagamento são fatos distintos.
5. No Portal, validar com conta individual vinculada e autorizada os documentos e a participação de curso concluída. Não há criação automática de contas. Acesso administrativo sem vínculo de titular não substitui esse percurso.
6. Conferir os dois perfis de escopos distintos, inclusive consulta, download e recusa de operação global em folha mista.
7. Encerrado esse aceite, configurar E5 individualmente: TCE, obrigações/exercícios, bancos/convênios, BB, consignatárias e prestadores atuariais. Os treze requisitos restantes estão identificados como **NÃO ATENDE** na matriz.

GED permanece em `https://guarama.celeriflow.com.br`. E-mail segue adiado; FTP/WebDAV e LDAP/AD não integram este fechamento.
