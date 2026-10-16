# Catálogo individual dos novos documentos — Ibema

Complemento de [ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md](ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md). Data: 11/10/2026.

Todos os nomes abaixo são relativos a `docs/Novos docs/Novos docs/`. `p.` indica páginas do arquivo local, não necessariamente a numeração da edição completa do diário. Modelos e parâmetros propostos não significam carga realizada no banco. Relatórios financeiros grandes foram analisados pela estrutura e conteúdo extraído; cada lançamento ainda precisa de reconciliação antes de migração.

## Numeração e comparação

Os **IDs 001 a 141** identificam os arquivos recebidos originalmente e continuam estáveis. Após a autorização para excluir duplicados, foram removidas cinco cópias idênticas, confirmadas por SHA-256: **002, 027, 043, 044 e 117**. Restam **136 documentos-fonte distintos**; os cinco registros abaixo permanecem como memória da comparação, com indicação do documento mantido. As partes binárias do PPA são transporte do ID 081, não documentos adicionais.

Para cada ID, a [comparação detalhada e importância por módulo](COMPARACAO_DOCUMENTAL_IBEMA_001_141.md) identifica documentos relacionados, diferenças de período/escopo, qual fonte priorizar e como combinar os dados.

## Saúde, gestão e fontes institucionais — 001 a 030

| ID | Arquivo | Módulos e aplicação concreta | Campos/modelo e limites |
|---|---|---|---|
| 001 | `1_rdaq_-6.pdf` | Saúde/Planejamento/Financeiro: RDQA do 1º quadrimestre de 2026, 38 p. | Identificação, demografia, produção SUS, rede, profissionais, PAS/metas, execução/fontes e análise. Indicadores agregados não são prontuários. |
| 002 | `2_rdaq_2025 (1).pdf` — **excluído** | Saúde/Indicadores: conteúdo preservado no 003 | Cópia idêntica por SHA-256 ao 003; nenhuma informação exclusiva removida. |
| 003 | `2_rdaq_2025.pdf` | Saúde/Indicadores: RDQA do 2º quadrimestre de 2025, 32 p. | Rede, produção, metas e execução; baseline para comparação por período/fonte. Não somar com RAG anual. Cópia 002 excluída. |
| 004 | `5._LEVANTAMENTO_DE_PROBLEMAS_E_AREAS_CRITICAS_PARA_AUDITORIA_INTERNA_5.1_assinado.pdf` | Controle Interno: priorização de auditoria 2026, 3 p. | Riscos/áreas/processos, critérios e prioridades do PACI. Converter em objetos de auditoria e evidências, não achados já comprovados. |
| 005 | `7c9ec788b259920d6d53329bca40ae12.pdf` | RH: referência comparativa de estatuto, 70 p. | Conteúdo de **Campina do Simão**, Lei 21/2025. Regimes/cargos/direitos podem orientar capacidades genéricas; não parametrizar Ibema com esta lei. |
| 006 | `apresentacao_audiencia_2_2026.pdf` | Planejamento/Financeiro/Transparência: audiência LRF, 41 p. | Modelo de apresentação do 2º quadrimestre/2026, gráficos e resultados fiscais; confrontar com anexos contábeis da mesma competência. |
| 007 | `AVALIAÇÃO DA UNIDADE CENTRAL DO CONTROLE INTERNO ESTUDO DE QUANTITATIVO.pdf` | Controle Interno/RH: dimensionamento da equipe, 4 p. | Atribuições, capacidade e quantitativo ideal, base municipal 32/2007. Estudo não cria cargo/vaga nem nomeia servidor. |
| 008 | `balancete agosto 2026.pdf` | Financeiro/Orçamento: execução analítica agosto, 59 p. | Dotação/programática/fonte; orçado, suplemento/redução, atual, empenhado/liquidado/pago no mês e acumulado, saldos. Separar subtotal e folha analítica. |
| 009 | `balancete Julho 2026.pdf` | Financeiro/Orçamento: comparação julho, 59 p. | Mesmas dimensões de 008, competência 07/2026. Acumulado de julho não é movimento de agosto. |
| 010 | `Balanço Orçamentario - Agosto.pdf` | Financeiro: modelo mensal agosto, 7 p. | Previsão inicial/atual, receita no período/acumulada/saldo, despesas. Totais e repetições de hierarquia exigem conciliação com LOA/receita analítica. |
| 011 | `Balanço Orçamentario - Julho.pdf` | Financeiro: modelo mensal julho, 7 p. | Receita corrente inicial de R$ 136.350.600,00 difere de outras fontes; investigar agregação antes de usar como caso ouro. |
| 012 | `CARTEIRA DE SERVIÇOS.pdf` | Saúde/Atendimento/Portal: catálogo de UBS/UAPSF, 3 p. | Acolhimento, programado, enfermagem, vacinação, saúde bucal, visitas, encaminhamento; endereço/horário/equipe. Oferta declarada não é produção realizada. |
| 013 | `Cartilha Diárias Atualização Julho 2025.pdf` | RH/Financeiro/GED/Frotas: regras e modelos de viagem, 8 p. | Tabela função/destino/moeda, prazo, distância, pernoite; anexos circunstanciado/solicitação/autorização. Conferir leis 168/2015, 373/2019 e decreto 2552/2025 para automatizar cálculo. |
| 014 | `Como está no portal da transparencia.png` | RH/Transparência: referência visual de consulta | Tela/modelo de apresentação do portal. Captura não é tabela salarial completa nem base estruturada para importação. |
| 015 | `Compras - Agosto.pdf` | Compras/Financeiro: itens de 01–31/08/2026, 140 p. | Empenho/data/secretaria/credor/CPF-CNPJ/descrição/preço/quantidade/total. Importar item uma vez, ligar empenho existente. |
| 016 | `Compras - Julho.pdf` | Compras/Financeiro: itens de 01–31/07/2026, 176 p. | Mesmo modelo de 015, outra competência; inclui diárias e serviços, não somente material de estoque. |
| 017 | `Compras com Documentos Fiscais - Agosto.pdf` | Compras/Patrimônio/Financeiro: rastreio fiscal, 191 p. | Estrutura de itens mais documento/modelo/número/valor. Não duplicar 015 nem somar total do item repetido por documento. |
| 018 | `Compras com Documentos Fiscais - Julho.pdf` | Compras/Patrimônio/Financeiro: rastreio fiscal, 238 p. | NF-e, recibos e demais documentos de julho; relacionar chave de item/evento com 016. |
| 019 | `Contas e Recursos Recebidos - Agosto.pdf` | Financeiro/Convênios: transferências, 5 p. | Receita/classificação, arrecadado no mês/ano por União/Estado/FUNDEB etc. Não é extrato de conta bancária. |
| 020 | `Contas e Recursos Recebidos - Julho.pdf` | Financeiro/Convênios: transferências julho, 5 p. | Baseline anterior de 019; diferença de acumulados só após confirmar escopo e estornos. |
| 021 | `cONTRATOS EMITIDOS AT´PE AGOSTO.pdf` | Compras/Frotas/GED: contratos até 31/08/2026, 8 p. | Número/data/contratado/modalidade/número da licitação/valor/objeto. Relação não substitui contrato e aditivos integrais. |
| 022 | `Contulsta Servidores Portal da Transparencia..png` | RH/Transparência: modelo visual de filtro/listagem | Referência de navegação/consulta e campos visíveis. Não importar identidade ou remuneração a partir de screenshot. |
| 023 | `Dados Essenciais Termos de Colaboração 2022-2026.pdf` | Convênios/Educação/Controle Interno: histórico, 3 p. | Ano/termo/fiscal/entidade/objeto/situação/total/link da íntegra. Instrumento de valor zero pode representar cessão/serviço, não ausência de obrigação. |
| 024 | `Dados Prefeitura- Fale Conosco 2026 atualizado.pdf` | Administração/Atendimento/Portal: contatos, 3 p. | Titulares, endereços, telefones, e-mails e horários por órgão. Fonte atualizada, manter histórico e confrontar atos de nomeação. |
| 025 | `Declaração da Análise da Prestação de Contas Exercício 2025.pdf` | Controle Interno/Transparência: situação processual, 1 p. | Em abril/2026, contas em tramitação no TCE/PR; modelo de declaração/link. Não publicar aprovação definitiva. |
| 026 | `Decreto Nº 2082-2023 GOVERNO DIGITAL.pdf` | Protocolos/Atendimento/Portal/GED: governo digital, 4 p. | Solicitação/acompanhamento e painel de desempenho, portal oficial e integração. Decreto de 2023, aplicabilidade/alterações devem ser versionadas. |
| 027 | `DECRETO Nº 2726-2025 PAT (1).pdf` — **excluído** | Controle Interno: conteúdo preservado no 028 | Cópia idêntica por SHA-256 ao 028. Plano, objetos, atividades e cronograma continuam disponíveis no arquivo mantido. |
| 028 | `DECRETO Nº 2726-2025 PAT.pdf` | Controle Interno: PAT/PACI/PAAI 2026, 19 p. | Plano, objetos, atividades, cronograma e responsáveis. OCR lê alguns 2026 como 2028: conferir original. Plano não comprova execução nem conclusão dos trabalhos. Cópia 027 excluída. |
| 029 | `Decreto Nº 2801-2026 CMAS.pdf` | Social/Conselhos: composição CMAS, 2 p. | Titulares/suplentes, representação governamental/não governamental e mandato. Não equiparar a vínculo de conselheiro tutelar remunerado. |
| 030 | `Decreto Nº2840-2026.pdf` | Compras/Planejamento/RH: comissão PCA 2027, 2 p. | Designação intersetorial para elaborar/revisar o PCA. Nomeação da comissão não constitui PCA aprovado. |

## Financeiro, pessoal e orçamento — 031 a 060

| ID | Arquivo | Módulos e aplicação concreta | Campos/modelo e limites |
|---|---|---|---|
| 031 | `DEMONSTRATIVO DA DISPONIBILIDADE DE CAIXA E DOS RESTOS A PAGAR - Julho.pdf` | Financeiro: RGF anexo V, 2 p. | Caixa bruta, obrigações, RP processados/não processados, insuficiência e líquido por destinação. Precisa de saldos/eventos e conciliação, não só folha. |
| 032 | `DEMONSTRATIVO DA DÍVIDA CONSOLIDADA LÍQUIDA - Julho.pdf` | Financeiro: RGF anexo 2, 2 p. | DC, deduções, DCL, RCL ajustada/limites e saldos comparativos até julho. Relatório não contém todos os contratos de financiamento. |
| 033 | `DEMONSTRATIVO DA EXECUÇÃO DAS DESPESAS POR FUNÇÃO.pdf` | Financeiro/Planejamento: RREO anexo II, 1 p. | Janeiro–agosto/2026, bimestre julho–agosto; função/subfunção, dotação, empenho/liquidação e percentuais. Preservar mês versus bimestre. |
| 034 | `DEMONSTRATIVO DA PROJEÇÃO ATUARIAL DO REGIME PREV SERVIDORES.pdf` | Financeiro/Previdência: RREO anexo 10, 4 p. | Projeção 2025–2100 de receita/despesa/resultado/saldo, linhas zeradas. Não comprova RPPS nem fornece alíquota para folha. |
| 035 | `DEMONSTRATIVO DAS GARANTIAS E CONTRAGARANTIAS DE VALORES - 1 Semestre.pdf` | Financeiro: RGF anexo 3, 1 p. | Cabeçalho janeiro–agosto e colunas por quadrimestre apesar do nome “1 Semestre”; garantias/RCL/limites. Competência vem do conteúdo. |
| 036 | `DEMONSTRATIVO DAS OPERAÇÕES DE CRÉDITO - Julho.pdf` | Financeiro: RGF anexo 4, 1 p. | Julho/2026, crédito no mês/acumulado, RCL/limites. Zero declarado não elimina o catálogo ou histórico de dívida. |
| 037 | `DEMONSTRATIVO DAS RECEITAS DE OPERAÇÕES DE CRÉDITO E DESPESAS DE CAPITAL.pdf` | Financeiro: RREO anexo 9, 1 p. | Regra de ouro, janeiro–junho/maio–junho; previsão/dotação, realizado/empenhado e saldos. Distinguir previsão de execução. |
| 038 | `DEMONSTRATIVO DAS RECEITAS E DESPESAS COM AÇÕES E SERVIÇOS DE SAUDE.pdf` | Saúde/Financeiro: RREO anexo XII, 4 p. | ASPS, receita base, despesas computáveis/deduções, limites e RP, até junho. Não somar toda despesa da secretaria como ASPS. |
| 039 | `Demonstrativo Despesa de Pessoal. - Julho.pdf` | RH/Financeiro: RGF anexo 1, 2 p. | Janela agosto/2025–julho/2026, despesa bruta/não computada, DTP, RCL ajustada/limites. Agregação fiscal não equivale ao bruto da folha mensal. |
| 040 | `DEMONSTRATIVO SIMPLIFICADO DO RELATORIO DE GESTÃO FISCAL.pdf` | Financeiro/Indicadores: RGF anexo VI, 1 p. | Até 2º quadrimestre/2026: RCL e ajustes, pessoal/dívida/garantias/crédito/caixa. Comparar somente à mesma referência temporal. |
| 041 | `DEMONSTRATIVO SIMPLIFICADO DO RELATÓRIO RESUMIDO DA EXECUCAO ORCAMENTARIA.pdf` | Financeiro/Transparência: RREO anexo XIV, 5 p. | Janeiro–junho, receitas/despesas, resultados, saúde/ensino e resumos. Linhas-resumo não são novos lançamentos. |
| 042 | `DEMOSTRATIVO DAS PARCERIAS PÚBLICO PRIVADAS.pdf` | Financeiro/Contratos: RREO anexo XIII, 1 p. | 1º bimestre/2026, saldos e impactos plurianuais de PPP. Modelo zerado não demonstra contrato ativo. |
| 043 | `despesa extra (1).pdf` — **excluído** | Financeiro/RH: conteúdo preservado no 045 | Cópia idêntica por SHA-256 ao 045; notas extra-orçamentárias e consignações permanecem no arquivo mantido. |
| 044 | `despesa extra (2).pdf` — **excluído** | Financeiro/RH: conteúdo preservado no 045 | Segunda cópia idêntica por SHA-256 ao 045; não há repasse ou informação adicional nesta cópia. |
| 045 | `despesa extra.pdf` | Financeiro/RH: extra-orçamentário, 81 p. | Nota/data/credor/conta/vencimento/processo/valor/anulado/pago/estornado/saldo até julho. Conciliação desconto em folha→passivo→repasse; total pago não prova pagamento de salário. Cópias 043/044 excluídas. |
| 046 | `Despesa Orçada por Função - orçamento anual 2026.pdf` | Orçamento: catálogo/total por função, 1 p. | Código/descrição/valor inicial. Zero preservado, sem criar execução. |
| 047 | `Despesa Orçada por Natureza - orçamento anual 2026.pdf` | Orçamento/RH: grupos de natureza, 1 p. | Pessoal/encargos R$ 21.008.750,00 e demais grupos. Não é tabela de salário nem lançamento analítico. |
| 048 | `Despesa Orçada por orgao 2026.pdf` | Orçamento/Administração: órgãos, 1 p. | Código/descrição/valor fixado; referência inicial, diferente de orçamento atualizado do CSV. |
| 049 | `Despesa Orçada por Programa - orçamento anual 2026.pdf` | Planejamento: programas, 1 p. | Código/nome/valor; vincular ao PPA e exercício sem inferir metas físicas. |
| 050 | `Despesa Orçada por Projeto - orçamento anual 2026.pdf` | Planejamento/Obras: ações, 3 p. | Projeto/atividade/código/valor. Conferir pontuação/zeros à esquerda para vincular execução. |
| 051 | `Despesa Orçada por subFunção - orçamento anual 2026.pdf` | Orçamento: subfunções, 3 p. | Código/nome/valor fixado; catálogo completo pode conter várias rubricas zero. |
| 052 | `Despesa Orçada por Unidade - orçamento anual 2026.pdf` | Administração/Orçamento: unidades, 1 p. | Código órgão.unidade, descrição e fixado. Unidade orçamentária não equivale automaticamente a local de trabalho. |
| 053 | `Despesas por Orgão.csv` | Financeiro/Indicadores: 14 órgãos | Cabeçalho real após quatro linhas; código/descrição/orçado/empenhado/liquidado/retido/pago, gerado 11/10/2026. Data de geração não define corte da execução. |
| 054 | `Documento de exemplo de pagamento de Empenho.pdf` | Financeiro/GED: modelo de **empenho**, 1 p. | Nota 8817/2026, ordinário, 07/10/2026, credor/dotação/licitação/itens/total. O nome do arquivo não a transforma em comprovante de pagamento. |
| 055 | `Empenho - Agosto.pdf` | Financeiro/Compras: notas agosto, 459 p. | Número/tipo/data, credor/banco, dotação/fonte, itens/histórico e assinatura. Dados bancários são da nota, não cadastro de todos os servidores. |
| 056 | `Empenho - Julho.pdf` | Financeiro/Compras: notas julho, 549 p. | Mesmo modelo de 055; ligar à relação emitida e eventos posteriores, não duplicar compromisso. |
| 057 | `Escala Conselho Tutelar.pdf` | Social/RH: modelo de escala, 1 p. | Sede/plantão, dias e responsáveis, **julho/2024**. Não lançar ponto/plantão 2026 a partir deste arquivo. |
| 058 | `ESTAGIÁRIOS AGOSTO.pdf` | RH/Educação: termos de estágio, 1 p. | Agosto/2026, nome/início/término/lotação. OCR de colunas exige conferência; ausência de CPF/bolsa impede carga completa de folha. |
| 059 | `EX20261007_1626.pdf` | RH/Protocolos/Compras: diário 206/2026, 2 p. | Respostas de recursos PSS 01/2026 com protocolo/cargo/decisão; retificação de pregão. Seleção não prova admissão e decisão não gera contrato automaticamente. |
| 060 | `EX20261008_1630.pdf` | RH/Calendário/Financeiro/Transparência: diário 207/2026, 8 p. | Decreto 2912: 30/10 ponto facultativo, saúde/lixo normais; demais atos/créditos da edição. Fecho 2025 diverge do ato/publicação 2026; conferir números via imagem. |

## Execução, normas e pessoal — 061 a 090

| ID | Arquivo | Módulos e aplicação concreta | Campos/modelo e limites |
|---|---|---|---|
| 061 | `Excução de despesa - Por Orgao.pdf` | Orçamento: execução julho, 2 p. | Órgão, orçado/atualizado e empenhado/liquidado no período/exercício. O título interno fala unidades, mas linhas iniciais são órgãos; usar nível do código. |
| 062 | `Excução de despesa - Por Unidades.pdf` | Orçamento: execução agosto, 2 p. | Estrutura equivalente a 061; não confundir agrupamento com unidades analíticas do 073. |
| 063 | `Execução orçamento - Despesa Por Grupo - Agosto.pdf` | Financeiro/RH: natureza/grupo, 1 p. | Pessoal e encargos e demais grupos, agosto/mês+acumulado. Empenhado e liquidado são etapas diferentes. |
| 064 | `Execução orçamento - Despesa Por Grupo - Julho.pdf` | Financeiro/RH: natureza/grupo julho, 1 p. | Mesmas colunas, códigos com comprimento diferente em julho/agosto: normalizar pela classificação, não por corte cego de dígitos. |
| 065 | `Execução orçamento - Despesa Por por Função de Governo - Agosto.pdf` | Orçamento/Indicadores: função agosto, 2 p. | Código/nome, inicial/atualizado, mês/exercício por etapa. Não somar com as subfunções. |
| 066 | `Execução orçamento - Despesa Por por Função de Governo - Julho.pdf` | Orçamento: função julho, 2 p. | Comparativo temporal de 065 após reconciliação da competência/escopo. |
| 067 | `Execução orçamento - Despesa Por por Programa - Agosto.pdf` | Planejamento: programa agosto, 1 p. | Programa/código/orçado/atualizado/empenhado/liquidado mês e ano. Vincular ações ao programa vigente. |
| 068 | `Execução orçamento - Despesa Por por Programa - Julho.pdf` | Planejamento: programa julho, 1 p. | Baseline de 067; acumulados não devem ser somados entre meses. |
| 069 | `Execução orçamento - Despesa Por por subFunção de Governo - Agosto.pdf` | Orçamento: subfunção agosto, 3 p. | Agrupamento detalhado por subfunção; preservar código externo e comparação com função pai. |
| 070 | `Execução orçamento - Despesa Por por subFunção de Governo - Julho.pdf` | Orçamento: subfunção julho, 3 p. | Mesma estrutura de 069; referência para relatório comparativo. |
| 071 | `Execução orçamento - Despesa Por Projeto - Agosto.pdf` | Planejamento/Obras: ação agosto, 6 p. | Projeto/atividade e valores por etapa/período; título interno “Programa” não redefine a dimensão das linhas. |
| 072 | `Execução orçamento - Despesa Por Projeto - Julho.pdf` | Planejamento/Obras: ação julho, 6 p. | Mesma estrutura de 071. Conferir ação PASEP e valores com 050/LOA, sem copiar divergências como parâmetro. |
| 073 | `Execução orçamento - Despesa Por Unidades Orçamentarias - Agosto.pdf` | Orçamento/Administração: unidade agosto, 3 p. | Código 02001 etc., nome, valores iniciais/atualizados e etapas; distinguir do órgão 02. |
| 074 | `Execução orçamento - Despesa Por Unidades Orçamentarias - Julho.pdf` | Orçamento/Administração: unidade julho, 3 p. | Fonte analítica por unidade para comparação e ligação com centros de custo, após correspondência validada. |
| 075 | `ingressos de receitas.pdf` | Financeiro/Tributação: ingresso julho, 7 p. | Código/finalidade/previsão/arrecadado no período; não adiciona nova arrecadação se já importada de 114. |
| 076 | `inst normativa 58 - empenhos apagar.pdf` | Financeiro/RH: empenhos a pagar, 45 p. | Até 31/07/2026, fonte/saldo, empenho/fornecedor/licitação/valor/acumulado/objeto. É relatório, não texto de uma instrução normativa. Mostra INSS ligado à folha. |
| 077 | `Instrução Normativa CI Nº 02-2026.pdf` | Controle Interno: benefícios da atuação, 9 p. | Metodologia, classificação financeira efetiva/potencial/não financeira, memória, validação/registro/divulgação e anexos. Não somar benefício estimado com realizado. |
| 078 | `Instrução Normativa nº 01-2026.pdf` | Controle Interno/GED: auditoria, 4 p. | Planejamento, execução, comunicação e monitoramento; conformidade/operacional/contábil/financeira/patrimonial; achados/plano de ação. |
| 079 | `Lei Nº 664-2025 LDO 2026.pdf` | Planejamento/Orçamento: LDO 2026, 64 p. | Diretrizes, metas/riscos fiscais e anexos para versão anual. Documento recortado/diário requer identificação por lei/artigo/anexo. |
| 080 | `LEI Nº 677-2025 REFIMI - Tributario.pdf` | Tributação: recuperação fiscal, 3 p. | Débitos até 31/12/2024; reduções 90%/60%/30% para à vista/3/6 parcelas, mínimos PF 40/PJ 70; art. 11: até 31/08/2025, uma prorrogação de até 60 dias. Campanha histórica, não vigente automaticamente em 2026. |
| 081 | `LEI Nº 687-2025 - PPA 2026-2029.zip` | Planejamento: PPA, PDF interno de 113 p. | Programas/ações/metas e projeções quadrienais. Original local reconstruível de `PPA_2026-2029.zip.part01` e `.part02`; não são dois documentos. Numeração do diário chega a 129: conferir recorte, não presumir páginas perdidas. |
| 082 | `LEI Nº 701-2025 ALTERA PPA 2026-2029.pdf` | Planejamento: revisão PPA/LDO, 9 p. | Altera PPA 687/2025 e LDO 664/2025; alterações/anexos de dezembro. Aplicar diferenças pela vigência nos dois instrumentos, preservando a base anterior. |
| 083 | `LEI Nº 702-2025 LOA 2026.pdf` | Orçamento: LOA, 110 p. | Receita/despesa fixadas, unidades/fontes/classificações e anexos. Lei e créditos posteriores compõem orçamento vigente, não somente tabela inicial. |
| 084 | `Lei Nº 711-2026 Altera PPA 2026-2029.pdf` | Planejamento/Orçamento: revisão abril/2026, 3 p. | Inclui ação 1.053 — Aquisição de Veículo Utilitário no PPA/LDO/LOA e estrutura/anexo necessários; preservar versões dos três instrumentos. |
| 085 | `LEI Nº 724-2026 LDO 2027.pdf` | Planejamento: próximo exercício, 65 p. | Diretrizes/metas/riscos para 2027. Não substituir regras de 2026 pelo ano de publicação 2026. |
| 086 | `LEI ORGÂNICA.pdf` | Administração/Jurídico/RH/Planejamento: competências, 84 p. | Organização/atribuições/direitos, edição 2008. Exige consolidação/alterações para parâmetros atuais; não basta como estatuto funcional vigente. |
| 087 | `Links de Transparencias e APIS.txt` | Integrações/Transparência/Social | Swagger/API Elotech e links de publicações; informação de não adoção de adiantamento/verbas. Contrato externo consultável, conector ainda não implementado. |
| 088 | `Lista de Servidores - Quantidade.pdf` | RH/Indicadores: quantitativo, 1 p. | Ativos/demitidos, concursados/comissionados/outros, referência 03/09/2026. Contagem do original não deve ser deduplicada pelo nome sem cadastro de identidade. |
| 089 | `lista de Servidores Ativos.pdf` | RH/SST: relação concursados, 5 p. | Referência 03/09/2026; matrícula/nome/lotação/admissão/expediente/cargo/faixa/carga. Unidade semanal/mensal deve ser confirmada antes de cadastro. |
| 090 | `lista de Servidores Efetivos.pdf` | RH/SST: relação concursados agosto, 5 p. | Mesma família de 089, competência Agosto/2026, conteúdo não idêntico em hash. Não considerar duplicata apenas pelo layout. |

## Planejamento, controle e bases setoriais — 091 a 120

| ID | Arquivo | Módulos e aplicação concreta | Campos/modelo e limites |
|---|---|---|---|
| 091 | `LRF - DEMONSTRATIVO DAS RECEITAS E DESPESAS COM MANUTENÇÃO E ENSINO.pdf` | Educação/Financeiro: RREO anexo 8, 5 p. | MDE/FUNDEB, impostos/transferências, receitas/despesas, deduções, RP e limites até junho. Classificar despesas computáveis, não toda folha da Educação. |
| 092 | `LRF - DEMONSTRATIVO DAS RECEITAS E DESPESAS PREVIDENCIÁRIAS.pdf` | Financeiro/Previdência: RREO anexo 4, 4 p. | Janeiro–fevereiro/2026, RPPS/fundos e linhas zero. Modelo de relatório não valida existência/regime/alíquotas. |
| 093 | `LRF - DEMONSTRATIVO DOS RESULTADOS PRIMÁRIO E NOMINAL.pdf` | Financeiro: RREO anexo 6, 3 p. | Receita/despesa primária, acima/abaixo da linha, metas e ajustes até junho. Regras de exclusão não são inferidas do nome da conta. |
| 094 | `LRF - DEMONSTRATIVO RECETA ALIENAÇÃO DE ATIVOS E APLICAÇÃO DOS RECURSOS.pdf` | Financeiro/Patrimônio: RREO anexo XI, 1 p. | Previsão/arrecadação/aplicação/saldos; vincular alienação ao ativo e destinação sem tratar toda receita patrimonial como alienação. |
| 095 | `LRF - DEMOSTRATIVO DOS RESTOS A PAGAR POR PODER E ÓRGÃ.pdf` | Financeiro: RREO anexo VII, 1 p. | RP processados/não processados, inscritos/pagos/cancelados/liquidados/saldo por poder/órgão. Segregar exercício de origem e evento atual. |
| 096 | `LRF - RELATÓRIO RESUMIDO DA EXECUÇÃO ORÇAMENTÁRIA.pdf` | Financeiro/RH: RCL, RREO anexo 3, 2 p. | Agosto/2025–julho/2026, evolução de 12 meses, deduções/ajustes e previsão. Nome genérico, conteúdo específico de RCL. |
| 097 | `MATRIZ DE ACHADOS EMPENHOS, LIQUIDAÇÕES E PAGAMENTOS.pdf` | Controle Interno/Financeiro: matriz, 1 p. | Achado/evidência/critério/causa/efeito/recomendação/responsável/prazo; atesto/ordem cronológica. Verificações propostas não são conclusões já provadas. |
| 098 | `MATURIDADE CONTROLE INTERNO pedmc-parcial-constatacoes-ibema-2025.pdf` | Controle Interno/Indicadores: PDMC, 2 p. | Autodiagnóstico 2025, gerado 18/08/2026, maturidade 69,4 versus média PR 47,2 e categorias. Métrica da prefeitura, não cobertura do software. |
| 099 | `ORGANOGRAMA MUNICÍPIO DE IBEMA.pdf` | Administração/RH: estrutura, 1 p. | Conselhos/secretarias/divisões e hierarquia, anexo da Lei 037/92. Confrontar contatos/atos vigentes antes de importar árvore. |
| 100 | `Orçamento Anual - Despesa Por Fonte de recursos.pdf` | Orçamento/Educação/Saúde: fontes, 2 p. | Código/descrição/fixado, FUNDEB 101/102, demais vínculos. Código externo como texto; não substituir ID interno por número de fonte. |
| 101 | `Orçamento anual - Receita Prevista.pdf` | Orçamento/Tributação: classificação da receita, 8 p. | Código/natureza/descrição/previsão, restituições/descontos/deduções e hierarquias. Receitas correntes brutas e deduções precisam de subtotal correto. |
| 102 | `PLANEJAMENTO ESTRATÉGICO Junho 2026.pdf` | Planejamento/Indicadores/Administração: biênio 2025–2026, 24 p. | Gestores, objetivos, ações e responsabilidades setoriais. Nomes por gestão não equivalem a titular atual confirmado. |
| 103 | `PLANO ANUAL DE TRABALHO CMAS -2026.pdf` | Social/Conselhos: agenda e comissões, 25 p. | Política, financiamento/orçamento, inscrição de entidades, Bolsa Família; atividades/calendário e responsabilidades. Distinto do PAT de Controle Interno. |
| 104 | `PLANO DE CAPACITACAO 2026.pdf` | RH/SST/Controle Interno: capacitação, 5 p. | Plano anual, áreas/necessidades/ações e acompanhamento. Planejar turma/custo; não registrar curso concluído/certificado automaticamente. |
| 105 | `Plano de Contas.pdf` | Contabilidade/RH/Patrimônio: catálogo, 198 p. | Reduzido, conta hierárquica, descrição/natureza D/C e contas analíticas. Confirmar classificações e contas de passagem; catálogo não é razão/saldo. |
| 106 | `PLANO MUNICIPAL DE ASSISTÊNCIA SOCIAL 2026-2029.pdf` | Social/Planejamento/Financeiro: PMAS, 83 p. | Diagnóstico/rede, objetivos/metas, ações/recursos e monitoramento quadrienal. Não contém prontuário individual dos beneficiários. |
| 107 | `PLANO MUNICIPAL DE SAÚDE 2026-2029.pdf` | Saúde/Planejamento: PMS, 49 p. | Identificação, diagnóstico, organização/rede, diretrizes/objetivos/metas/indicadores; vincular PAS e avaliação RDQA/RAG. |
| 108 | `Plano_Diretor_-_Ibema_-_PR.pdf` | Obras/Construção Civil/Tributação/Meio Ambiente/Cemitérios: 503 p. | Arquivo composto: LC 023–031/2021, incluindo zoneamento, parcelamento, vias, perímetro, Obras/Posturas, cemitérios, ISSQN e liberdade econômica/taxas. Intervalos e aplicações detalhados no relatório principal; OCR não substitui mapa/tabela conferidos. |
| 109 | `Prestação de Contas 2025 Instrução 1736-2026.pdf` | Controle Interno/Indicadores: TCE, 47 p. | Processo 171660/26, análise financeira/atuação setorial, tabelas e conclusões. Instrução técnica não é decisão final; usar achados por estágio. |
| 110 | `pt ibema 2025.pdf` | Transparência/Indicadores: capturas do painel, 3 p. | Imagem mostra dados de **2026**, valores/arrecadação/despesa e gráficos. Nome do arquivo não define competência; não importar séries do gráfico. |
| 111 | `QUADRO DE PESSOAL.pdf` | RH: vagas criadas/preenchidas, 1 p. | Referência 31/07/2026; categorias e quantitativos. Temporários 11/18 exigem reconciliação; não é tabela salarial/cargo analítico. |
| 112 | `RAG MUNICIPAL 2025 saude.pdf` | Saúde/Planejamento: RAG, 36 p. | Ano 2025, publicado março/2026; demografia/produção/rede/profissionais/metas/execução/análise. Baseline anual, não somar aos RDQA. |
| 113 | `Receita Realizada - agosto 2026.pdf` | Financeiro/Tributação: receita agosto, 19 p. | Código/descrição/tipo de operação, arrecadação mês/ano, deduções. Separar rubricas analíticas de pais repetidos. |
| 114 | `Receita Realizada - Julho 2026.pdf` | Financeiro/Tributação: receita julho, 20 p. | Mesma família de 113, inclui renúncia/deduções. Não somar acumulados entre relatórios. |
| 115 | `Receitas.csv` | Financeiro/Tributação/Indicadores: 410 linhas | Código/descrição/previsto/atualizado/arrecadado, gerado 11/10/2026. Importar hierarquia sem dupla soma; preservar vírgula decimal/código textual. |
| 116 | `REGIMENTO INTERNO CMAS.pdf` | Social/Conselhos/GED: governança, 8 p. | Natureza/paridade, atribuições, funcionamento/deliberação e controle do fundo. Confrontar com leis/alterações e nomeação 2801. |
| 117 | `RELATORIO 2 QUADRIMESTRE DE GESTAO (1).pdf` — **excluído** | Social/Planejamento: conteúdo preservado no 118 | Cópia idêntica por SHA-256 ao 118; relatório de maio–agosto/2026 mantido integralmente no arquivo canônico. |
| 118 | `RELATORIO 2 QUADRIMESTRE DE GESTAO.pdf` | Social/Planejamento: gestão, 40 p. | Maio–agosto/2026: estrutura, conselhos, CRAS/PAIF/SCFV, CadÚnico, benefícios, acolhimento, carteiras, ações e atendimentos; narrativa/quadros/resultados. Numeração interna anuncia 41 páginas: conferir recorte. Cópia 117 excluída. |
| 119 | `RELATORIO FINAL AUDITORIA SAÚDE TERRITORIALIZAÇÃO E VÍNCULOS.pdf` | Saúde/Controle Interno: auditoria ESF, 3 p. | Objeto, período da auditoria 2025, conclusão 16/04/2026, cobertura/vínculos/território e recomendações. Evidência de processo, não cadastro nominal completo. |
| 120 | `relatorio_estoque CAF 05-10-2026.pdf` | Saúde/Almoxarifado: CAF outubro, 8 p. | Competência 202610, unidade CAF(3)/CNES, material/apresentação/código/unidade/quantidade/conferência. Não informa lote/validade/custo de todas as unidades. |

## Estoques, balanços e execução — 121 a 141

| ID | Arquivo | Módulos e aplicação concreta | Campos/modelo e limites |
|---|---|---|---|
| 121 | `relatorio_estoque CAF 28-09-2026.pdf` | Saúde/Almoxarifado: CAF setembro, 7 p. | Competência 202609, snapshot anterior a 120. Diferença de estoque não distingue compra/transferência/perda/dispensação. |
| 122 | `relatorio_estoque FARMÁCIA 05-10-2026.pdf` | Saúde/Farmácia: depósito Farmácia(4), 7 p. | Mesmo CNES, depósito diferente de CAF; material/unidade/quantidade. Não fundir saldos dos locais nem inferir lote. |
| 123 | `RelatorioDCBalancoFinanceiro_1-6 2025.pdf` | Financeiro: DCASP financeiro, 1 p. | Conteúdo **12/2025**, atual/anterior; receita/despesa orçamentária, extra e saldo. Sufixo 1-6 não define competência semestral. |
| 124 | `RelatorioDCBalancoOrcamentario_2-6 2025.pdf` | Financeiro: DCASP orçamentário, 3 p. | 12/2025, previsão inicial/atualizada/realizado, dotação/execução e RP. Separar receita bruta/deduções e confronto de exercícios. |
| 125 | `RelatorioDCBalancoPatrimonial_1-6 2025.pdf` | Financeiro/Patrimônio/RH: DCASP patrimonial, 2 p. | 12/2025, ativos/passivos/patrimônio e quadros; obrigações trabalhistas/previdenciárias. Saldos agregados não são cadastro de bens individual. |
| 126 | `RelatorioDCDemVariacoesPatrimoniais_1-6 2025.pdf` | Financeiro/Patrimônio/Iluminação: DVP, 3 p. | 12/2025, VPA/VPD, resultado e comparação; contribuição de iluminação. Receita patrimonial não substitui controle físico de pontos/bens. |
| 127 | `Relatório Anual de Monitoramento do Portal Transparência 2025.pdf` | Transparência/Controle Interno/Obras: requisitos, 3 p. | ITP/nota/classificação e pontos de melhoria, custos unitários/totais de obras. Criar evidência de publicação; não atribuir nota histórica ao sistema. |
| 128 | `Relatório Controle Interno 2025.pdf` | Controle Interno/Financeiro/RH: RACI, 125 p. | Gestão/controles e evidências por área. P. 33: certidão 19/02/2026 confirma RGPS e extinção do fundo municipal pela Lei 002/1999 (conferida visualmente). Não fornece alíquotas/incidências nem audita os eventos do nosso banco. |
| 129 | `RELATÓRIO DE GESTÃO E ATIVIDADES - Abril 2026.pdf` | Administração/Planejamento/Portal: memória de gestão, 54 p. | Período 2021–abril/2026, atividades/conquistas e dados setoriais. Preservar datas e referências; texto institucional não valida todos os indicadores. |
| 130 | `Relatório Final de Auditoria _assinado.pdf` | Educação/Frotas/Controle Interno: transporte escolar, 4 p. | Objeto/legalidade/eficiência/segurança, achados/conclusão; conclusão 16/07/2026 anterior a fim cadastrado 03/08/2026 exige registrar divergência. |
| 131 | `RELATÓRIO RESUMIDO DA EXECUÇÃO ORÇAMENTÁRIA - BALANÇO.pdf` | Financeiro: RREO anexo 1, 3 p. | Janeiro–junho/maio–junho, previsão/dotação, realizado e saldos/percentuais. Distinto do balanço mensal 010/011 e DCASP anual 124. |
| 132 | `RELAÇÃO DE EMPENHOS EMITIDOS - TRANSPARÊNCIA.pdf` | Financeiro/Compras/Obras/RH: emitidos, 673 p. | Janeiro–julho/2026, número/data/credor/programática/fonte/valor/modalidade/processo/objeto. Um registro por compromisso, eventos posteriores separados. |
| 133 | `RELAÇÃO DE EMPENHOS LIQUIDADOS - TRANSPARÊNCIA.pdf` | Financeiro/Compras/Obras: liquidações, 1.397 p. | Empenho inclusive de exercício anterior; liquidação/data/valor/documento. Chave de evento inclui exercício da liquidação, não apenas empenho. |
| 134 | `RELAÇÃO DE EMPENHOS PAGOS - TRANSPARÊNCIA.pdf` | Financeiro/RH/Transparência: pagos, 1.320 p. | Compromisso+pagamento/data/valor e elementos da execução; relacionar liquidação sem somar valor original a cada pagamento. |
| 135 | `relação de transferências financeiras a terceiros.pdf` | Convênios/Social/Educação/Financeiro: repasses, 1 p. | Convênio/lei/objeto/convenente/dotação/vigência/total/liberação/saldo. Repasses não comprovam entrega ou prestação de contas aprovada. |
| 136 | `Responsáveis pela Gestão Poder Executivo 2.3.pdf` | Administração/Portal/GED: responsáveis, 1 p. | Prefeita/vice e contatos/horários; ligar função e titular com vigência. Não substituir cadastro de assinantes atuais apenas pelo texto. |
| 137 | `SERVIDORES ATIVOS.pdf` | RH/SST/Transparência: relação ativa, 9 p. | Até 31/07/2026; matrícula/nome/cargo/lotação/situação. Base dos campos do novo relatório autenticado de ativos; múltiplas matrículas preservadas. |
| 138 | `Termo de Colaboração Nº 001-2026 AACADI.pdf` | Educação/Frotas/Convênios/GED: termo, 3 p. | Objeto/atribuições, veículos/capacidade, frequência 80%, fiscalização, vigência e prestação a cada 60 dias. Fonte específica, não regra de todos os convênios. |
| 139 | `transferências voluntárias receitas estaduais e federais.pdf` | Convênios/Planejamento/Financeiro: recebimento, 1 p. | Julho/2026, convênio/repassador/finalidade/receita/destinação/previsto/recebido/saldo/prazo. Conferir prazos históricos e status atual. |
| 140 | `Tributos areecadados Mensal - julho 2026.pdf` | Tributação/Financeiro: arrecadação julho, 2 p. | Receita/fonte/operação/arrecadado mês/ano, renúncia e deduções. Agregado por tributo, sem dívida/contribuinte individual. |
| 141 | `Tributos arrecadados Mensal - Agosto 2026.pdf` | Tributação/Financeiro: arrecadação agosto, 2 p. | Mesma estrutura de 140, referência agosto/2026, emissão 30/09. Reconciliar com receitas, não importar o agregado como novo recebimento. |

## Uso deste catálogo nas entregas

Cada implementação deve apontar o ID/fonte/página, campo de destino e regra de transformação. Para regras legais, adicionar artigo, vigência e município. Para exportações, adicionar versão do layout, origem dos dados e resultado da conferência aritmética/visual. Para migração, guardar chave externa e impedir duplicidade entre PDFs, CSVs, API e cópias idênticas.

Os dois novos relatórios RH estão descritos no relatório principal; os demais aproveitamentos acima são especificações de implementação e conciliação, não funcionalidades já concluídas.
