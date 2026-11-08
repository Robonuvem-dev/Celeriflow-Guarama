# Roteiros de população e apresentação

**Situação de todos os roteiros nesta entrega: PLANEJADO.** Quantidades são metas de conjuntos utilizáveis; aproveitar os registros compatíveis existentes. As famílias citadas abaixo são exemplos; a cobertura exaustiva das tabelas está em `MATRIZ-TABELAS.csv`.

Para cada roteiro, produzir um recibo de caso, IDs navegáveis, perfil executor, documentos aplicáveis e evidências de banco/fluxo/tela. Estados descritos em linguagem de negócio devem ser traduzidos para os valores efetivamente aceitos pelo serviço, sem inventar enums.

## Fundação e execução financeira

### F01 — Identidade, cadastros e endereços · B01
- Preparar 100 pessoas completas entre os cadastros existentes e 30 empresas; responsáveis familiares, pessoas com dois papéis e endereços residencial/comercial/rural quando suportados. Completar contribuintes, fornecedores e credores a partir dessas identidades.
- Incluir revisão cadastral e uma unificação de duplicidade controlada pelo serviço, com pedido, decisão, ledger e vínculos preservados; executar verificação de consistência e corrigir uma ocorrência real do conjunto.
- **Aceite:** CPF/CNPJ válidos e únicos; busca nominal/documental; pessoa única nos seletores dos módulos; bairro/logradouro/endereço compatíveis; resultado da revisão e da unificação rastreável.

### F02 — Estrutura, parâmetros e administração · B02
- Reutilizar a instituição, entes e UGs atuais; completar responsáveis, lotações e centros de custo. Criar 12 demandas internas em fases diferentes, agendas, feriados, substituições válidas e parâmetros por módulo.
- Preparar os perfis funcionais e associações de acesso usados nos demais roteiros; usuários do provedor e da aplicação permanecem vinculados por sua identidade efetiva.
- **Aceite:** organograma, indicadores de pessoas/demandas e filtros por unidade coerentes; operador e gestor conseguem continuar suas etapas; auditoria identifica o autor.

### F03 — Planejamento e orçamento integrado · B03
- PPA 2026–2029; LDO/LOA 2026 e 2027; ao menos 8 programas, objetivos, indicadores e ações, com metas físicas/financeiras; catálogos/versionamento e linhas de receita/despesa ligados aos instrumentos.
- Completar prioridades, riscos, memória de cálculo, regionalização, exercício, fontes, naturezas, produtos e unidades de medida. Percorrer elaboração, revisão, aprovação/publicação quando implementadas, emendas, créditos, cotas e integração de execução.
- **Aceite:** receita/despesa planejadas conciliam; instrumentos encadeados; metas e movimentações aparecem nos relatórios; comparativos e transporte de exercício usam cenário próprio.

### F04 — Despesa até pagamento · B04
- 30 empenhos, 20 liquidações e 15 pagamentos distribuídos entre fornecedores e unidades; manter casos em reserva, empenhado sem liquidação, parcialmente liquidado, pago e com estorno/anulação quando suportados.
- Vincular dotação, processo, contrato/recebimento, documento, retenção e credor. Cobrir adiantamento/diária e restituição pelos fluxos disponíveis, notas extras, redistribuição por fonte e obrigações retidas.
- **Aceite:** saldos de dotação e fontes, soma de itens, limites das etapas, retenções e ordem cronológica corretos; cada pagamento abre seu empenho e documento de origem.

### F05 — Tesouraria, receita e conciliação · B04
- 30 receitas e contas por fonte; transferências, aplicação/rendimento/resgate, solicitação de crédito, dívida fundada, cheques e talonários, metas bimestrais e programação de desembolso conforme o domínio.
- Preparar extratos OFX/CSV/retorno bancário com movimentos correspondentes a operações do conjunto, incluindo conciliação simples, agrupada/rateada, pendência e estorno. Cobrir importação, regra de classificação, fila de exceção e reprocessamento.
- **Aceite:** saldo inicial + entradas − saídas = saldo final; conciliação não duplica lançamentos; receitas e despesas identificam o fato de origem. Arquivos e retornos são processados pelos adaptadores do sistema, sem atribuir confirmação a um banco que não participou.

### F06 — Contabilidade, índices e fechamento · B04
- Completar plano contábil, catálogo de eventos, regras e componentes; obter lançamentos das despesas, receitas, patrimônio, estoque e folha criados nos outros roteiros.
- Preparar um mês encerrado e outro aberto; relatório MSC, índices fiscais/pessoal, documentos financeiros e campanha de publicidade com despesas vinculadas. Em cenário próprio, encerramento anual, restos a pagar, transporte, evento e vínculo à liquidação posterior.
- **Aceite:** débitos = créditos por transação e período; fechamento reconcilia fontes; saldos de abertura e transporte coincidem; reabertura/retificação seguem o serviço. Não encerrar o exercício usado pelos demais casos.

### F07 — Controle interno e custos · B05
- 3 planos de controle, 6 achados e ações em andamento/concluídas; completar política, objeto, itens, regras, fontes, rateios, reduções e movimentos de custo.
- Relacionar achado a compra/contrato/execução; apropriar consumo de material, liquidação, folha e depreciação sem duplicar a mesma origem.
- **Aceite:** soma dos rateios igual à origem; relatórios por centro/unidade/período conciliam; responsáveis e evidências abrem os registros vinculados.

### F08 — Demanda, fase interna e disputa · B06
- 30 demandas/requisições; 12 processos de compra; PCA, DFD, ETP, TR, pesquisa de preços com três cotações coerentes e respectivas versões/origens.
- Ao menos 3 licitações com comissão/designações, lotes/itens, participantes, habilitação, propostas/lances, fases, resultado e atos; uma contratação direta com sua justificativa e documentação. Manter exemplos em elaboração, disputa, adjudicação e conclusão conforme o serviço.
- **Aceite:** demanda/dotação/planejamento/processo conectados; valor estimado e contratado conciliam; documentos íntegros e trilha temporal; sugestão assistiva só aparece com resultado efetivo do mecanismo disponível.

### F09 — Contratos, convênios e recebimento · B06
- 6 contratos e ao menos 2 instrumentos de convênio, quando suportados; partes, representante, responsáveis, parcelas, vigência, aditivo, cronograma, medição e itens.
- Recebimento parcial e integral, devolução/recusa, vínculo à demanda e incorporação em estoque/patrimônio; manter um contrato vigente e um encerrado com cadeia completa.
- **Aceite:** quantidades recebidas não excedem as contratadas; documentos e responsáveis presentes; medição/recebimento seguem para liquidação e as parcelas conservam rastreabilidade.

### F10 — Almoxarifado e patrimônio · B07
- Reaproveitar os 120 materiais e 40 bens; selecionar ao menos 60 materiais para catálogos/subcategorias e operações. Criar entradas de recebimento, requisições, consumo, transferência e devolução, com revisões e valoração.
- Percorrer tombamento, categoria, responsabilidade/custódia, inventário, divergência e ajuste pelo serviço, transferência, manutenção, depreciação e baixa de casos próprios; configurar pendência de integração e resolvê-la.
- **Aceite:** saldo por depósito/lote e valoração conciliam; inventário tem itens; responsabilidade e valor do bem conservam histórico; relatório encontra a compra e o recebimento.

## Pessoal, frotas e trabalho

### F11 — Gestão integral da frota · B08
- Reaproveitar as 30 unidades; completar condutores, habilitações, catálogos/versionamento, itinerários, autorização, viagens, passageiros/cargas, abastecimentos e leituras.
- Casos de manutenção preventiva/corretiva, ordem e peça, inspeção, pneu/equipamento, dívida/licenciamento, pagamento, multa, sinistro, anexo e baixa/substituição conforme os recursos existentes.
- **Aceite:** patrimônio e lotação ligados; hodômetro crescente e consumo plausível; custos por veículo/período conciliados; operações, documentos e relatórios têm exemplos distintos.

### F12 — Vida funcional, direitos e folha · B09
- Completar 60 vínculos entre os 199 servidores existentes: regime, cargo, jornada, lotação, centro de custo, ato, contrato e revisão; dependentes, referências legais, benefícios e consignações.
- Folhas 08–10/2026 calculadas por motor; 11/2026 aberta. Incluir férias/aquisição/concessão, afastamento/licença, adicional por tempo, evolução funcional, recrutamento/admissão e desligamento em casos próprios; ponte SST quando aplicável.
- **Aceite:** histórico vigente na competência; bruto − descontos = líquido; origem dos eventos e consignações coerentes; cálculo/revisão não reescrevem uma folha fechada indevidamente.

### F13 — Ponto e portal do servidor · B09
- Jornada, escala e calendário para o conjunto funcional; marcação normal, ajuste justificado, falta/abono, autorização e fechamento; anexar documento funcional correspondente.
- Provisionar acesso do servidor, consulta de ficha, ponto, férias, contracheque, documento, solicitação e notificações. Arquivo de pagamento usa a folha efetivamente fechada.
- **Aceite:** portal e RH mostram os mesmos valores/direitos; permissões e vínculo pessoal corretos; PDF do contracheque completo; recuperação/controle de login produz seus registros pelo ciclo real.

### F14 — SST clínico e funcional · B10
- 12 percursos ocupacionais: agenda/escala, bloqueio, avaliação, questionário/anamnese, exame, prontuário, ASO/documento e correção; profissionais, atribuições, responsáveis técnicos e acessos.
- Atestado com documento, perícia/junta e decisão revisada; confirmação de licença, fonte funcional, restrição/acompanhamento e integração à folha. CAT com evidências, leiaute, registro e emissão por caso.
- **Aceite:** servidor e vínculo de origem corretos; agenda sem sobreposição; decisão refletida na licença/restrição; documento e revisão identificam o atendimento e o profissional.

### F15 — SST preventivo, benefícios e eSocial · B10
- Programas ocupacionais, GHE/exposições, versões/revogações, prevenção e SIPAT; eleição com candidatos, eleitores, votação e comparecimento; EPI/equipamento, entrega, itens, política, requisito e evento.
- Plano de saúde, beneficiário, concessão, cancelamento e regras de integração à folha; ordem de serviço, fechamento/PPP e evento eSocial com tentativa, resultado e evidência do adaptador.
- **Aceite:** relações de exposição e vigência consistentes; entrega reduz estoque correto; benefício chega à competência correta; arquivo/evento possui conteúdo e não ganha recibo oficial fictício.

## Processos e tributação

### F16 — Processo digital completo · B11
- 30 processos: abertura, classificação, numeração, partes, setor/responsável, movimentação, despacho, documento, exigência, atendimento, conclusão e arquivamento. Conservar exemplos em cada fase.
- Workflow com definição/etapas/instâncias/eventos; juntada e separação quando suportadas; caso judicial e evento, metadados de unidade/setor, configurações de impressão e acesso de cidadão.
- **Aceite:** árvore e histórico conservam todos os passos; setor recebe a tarefa; peças e assinaturas abrem; pesquisa, caixa setorial e acompanhamento público chegam ao mesmo processo.

### F17 — Atendimento operacional · B12
- 30 chamados em canais e assuntos diferentes: iluminação, conservação de rua, coleta e atualização cadastral. Abertura com endereço/pessoa, distribuição, interação, transferência, documento, resposta e encerramento.
- Vincular chamado a processo e a ordem de serviço de Obras/Segurança/Meio Ambiente conforme o assunto; registrar avaliação e auditoria.
- **Aceite:** fila, prazo e responsável corretos; retorno visível ao cidadão; encerramento corresponde à execução e aparece nos indicadores.

### F18 — Ouvidoria e manifestações · B12
- 12 manifestações: reclamação, solicitação, sugestão, elogio e denúncia conforme tipos existentes, incluindo identificação e sigilo quando permitidos; canais, catálogos e configuração.
- Recepção, análise, encaminhamento, complementação, resposta e conclusão; registrar identidade/acesso, anexos, interações, movimentação e auditoria pelo serviço.
- **Aceite:** protocolo consultável, prazos coerentes e trilha completa; retorno no portal respeita os dados liberados ao perfil e o tipo de manifestação.

### F19 — Cadastro fiscal, econômico, DTE e ITBI · B13
- Completar 30 contribuintes e 30 imóveis ligados às pessoas/empresas; BIC/BCI, perfil, inscrição, atividades, CNAE/serviços, alteração geral, recadastramento, avaliação/PGV, reorganização e unificação com revisão.
- Alvará econômico e solicitação de serviço; ITBI com vendedor/comprador/imóvel, declaração, avaliação, impugnação/exigência e conclusão; DTE com caixa, procuração, concessão/revogação, mensagem e leitura. Exercitar confirmação de senha e preferência pelos mecanismos próprios.
- **Aceite:** cadastro e mapa/consulta equivalentes; ITBI preserva as partes e a avaliação; DTE tem ciência/evento real do usuário do caso; histórico e controle de acesso decorrem das operações.

### F20 — Lançamento, guia e arrecadação · B14
- 60 lançamentos, 30 guias e 12 baixas; IPTU, ISS/taxas conforme motor. Lote anual, itens, calendário, desconto/benefício/isenção com critério, pagamento parcial/integral e estorno em casos próprios.
- Mapear receita/contabilidade e evento de integração; certidão negativa/positiva/positiva com efeito de negativa conforme os débitos. Cobrir incentivo fiscal com cupom, sorteio, execução e vencedor, se o fluxo correspondente estiver disponível.
- **Aceite:** base/alíquota/valor e parcelas calculados pelo serviço; baixa concilia arrecadação, receita e contabilidade; certidão corresponde à situação efetiva, e o caso de sorteio tem base de elegibilidade rastreável.

### F21 — Cobrança, parcelamento e dívida ativa · B14
- Preparar débitos diferentes para notificações e ações de cobrança, carteira/perfil/regra, acordo/REFIS, parcelas, apropriação de pagamento e inadimplência/regularização.
- Inscrição em dívida ativa, carteira de DA, CDA versionada, suspensão, protesto/lote/item e execução/caso/evento. Manter dívida paga, parcelada, suspensa e em cobrança em casos separados.
- **Aceite:** principal/correção/juros/multa e saldo conciliam; parcela não duplica baixa; CDA e processos encontram a origem; eventos externos mantêm a situação efetivamente obtida.

### F22 — NFS-e, NFA-e e obrigações acessórias · B15
- 20 notas para prestadores/tomadores diferentes; credenciamento com pedido/evento, RPS em lote/itens, DMS, créditos/deduções e consumo; nota emitida, substituída/cancelada e corrigida conforme o domínio.
- Completar dados fiscais da nota, eventos, carta de correção e pedido ocasional de nota avulsa. Produzir XML/PDF e guias/ISS quando o fluxo exigir.
- **Aceite:** itens/base/dedução/alíquota/imposto conciliam; documentos abrem; eventos correspondem à nota e ao status real; credenciamento não fica apenas no cadastro da empresa.

### F23 — Simples Nacional · B16
- 6 empresas com período de opção, importação, registro fiscal e rateio de pagamento; casos de divergência, regularização, termo e processo de exclusão.
- Preparar arquivos nos leiautes realmente suportados e lote DTE quando disponível na versão integrada; usar os períodos/valores das empresas fictícias.
- **Aceite:** dossiê, relatório, documento e comunicação encontram a mesma empresa/competência; regularização encerra a pendência correta e conserva os eventos.

### F24 — ISS bancário e DES-IF · B17
- 2 instituições fictícias, agências, plano PGCC, COSIF e vínculo, subtítulos, tarifas, importação e balancetes; pacotes/itens/movimentos de competências distintas.
- Apuração, auto/processo fiscal e eventos; anexos e relatórios suportados, inclusive ESTBAN quando presente na versão.
- **Aceite:** receita tributável por conta/competência e imposto conciliam; relatório e anexos têm conteúdo; código de instituição e recibos não são atribuídos a banco real alheio ao caso.

### F25 — VAF · B18
- 6 empresas/atividades/contadores, exercício, EFD/GIA, CFOP, estimativa, cruzamento, índices por empresa/município, resultado e repasse.
- Incluir protocolo, notificação e resposta; reprocessar arquivo com correção de uma divergência identificada.
- **Aceite:** operações importadas conciliam com o resultado e com o exercício; arquivos e notificações consultáveis; índice/repasses mantêm metodologia explícita.

### F26 — Fiscalização e produtividade · B18
- Plano de auditoria, seleção de contribuintes/fiscais e eventos; 6 ordens fiscais, malha/cruzamento, achados e vínculo ao auto, requisição de documentos, modelo e documento fiscal.
- Configuração de penalidade e produtividade, tarefas, período, lançamento e ledger; encerrar um caso com correção e outro com auto/penalidade.
- **Aceite:** contribuinte, ordem, fiscalização e apuração conectados; produtividade deriva de tarefas executadas; relatório e anexo abrem o fato fiscal correto.

## Saúde

### F27 — Território, cadastro e agenda · B19
- 60 pacientes com cadastro/contatos/documentos e histórico; territórios, microáreas, domicílios, famílias e membros; unidades, equipes, profissões/CBO, especialidades, serviços, salas, habilitação e vínculos.
- 30 agendas, escalas, bloqueios, grupos, fila de espera, reagendamento, cancelamento e comparecimento; chamada/painel, visita domiciliar e atividade coletiva; revisão/unificação administrativa de paciente quando suportada.
- **Aceite:** paciente corresponde à pessoa/endereço/família; acesso por unidade; profissional/sala não sobrepostos; histórico de agenda e classificação territorial íntegros.

### F28 — Assistência, prontuário e vigilância · B19
- 20 atendimentos: recepção/acolhimento, risco, triagem, consulta, diagnóstico, procedimento, evolução e revisão; questionários, documentos clínicos, pedidos/revisão de exames, prescrição e encaminhamento/contrarreferência.
- Casos próprios de gestante/pré-natal/puerpério, acompanhamento crônico, odontologia, marcador alimentar, atenção domiciliar, observação/leito, administração de medicamento e terapia. Vigilância: estabelecimento, denúncia, inspeção/itens e licença.
- **Aceite:** linha do tempo e documento correspondem à consulta; idade/sexo/condição clínica compatíveis; leito tem ocupação coerente; retorno e vigilância têm desfecho rastreável.

### F29 — Farmácia, prescrição e abastecimento · B20
- 30 medicamentos com apresentação/DCB/CATMAT, unidade, dosagem e interações; reaproveitar os lotes existentes. Nota/recebimento, política de estoque, transferência, requisição com itens/atendimento/eventos, inventário e ajuste pelos serviços.
- Receita/itens/modelo, dispensação total e parcial, retorno e escrituração de controlado; kits e entrega, caso judicial com advogado/documento/itens e acompanhamento.
- **Aceite:** lote/validade/saldo de medicamento e material conciliam; dispensação ligada ao paciente e à receita; kit/judicial não contorna as quantidades efetivamente movimentadas.

### F30 — Vacinação · B20
- Calendário/código/fabricante, vacinas, interações, campanha, perfil do lote e frasco aberto; 12 aplicações com dose, via, lote e responsável.
- Incluir atraso/resgate de esquema e caso específico de evento adverso com acompanhamento; emitir cartão/documento e evento correspondente.
- **Aceite:** faixa etária, intervalo entre doses e condição clínica válidos; consumo e frasco conciliam; cartão mostra a aplicação e sua origem.

### F31 — Regulação e centro especializado · B21
- 12 solicitações com setor, documento/anexo, revisão, cota e alocação; autorização, prestador/acesso, convênio/cobertura, local/dispositivo assistencial e fila.
- Plano terapêutico especializado, itens, distribuição, escala e sessões; relatório/procedimentos, revisão, emissor e faixa de numeração de autorização.
- **Aceite:** cota diminui pela autorização correta; retorno liga paciente ao atendimento; relatório e documento abrem a solicitação e o prestador.

### F32 — Laboratório · B21
- 12 pedidos com modelo de exame, material, grupos/perguntas/questionário; configuração, prestador/cota, agenda, coleta, execução e resultado.
- Resultado normal e alterado em pacientes distintos; correção pelo fluxo de revisão, laudo e disponibilização ao paciente.
- **Aceite:** pedido/amostra/resultado/laudo coerentes; resultado não antecede coleta; consulta e documento preservam unidades e referências.

### F33 — TFD e transporte assistencial · B21
- Solicitação, relatório clínico e complemento/revisão; benefício, análise e autorização; viagens, passageiros, acompanhante, remoção de passageiro e eventos em casos próprios.
- Relacionar veículo/condutor e serviço externo ao atendimento; manter viagem programada e viagem concluída com datas coerentes.
- **Aceite:** capacidade, itinerário, datas e necessidade clínica compatíveis; guia/relatório identificam paciente, autorização e deslocamento.

### F34 — Produção SUS, e-SUS e acompanhamento · B21
- Importar referências de procedimento e preço pela rotina do sistema; registrar lote e críticas. Criar competências, fatos de produção e revisões a partir dos atendimentos, metas e teto por unidade.
- Gerar arquivo SUS, crítica/resolução e fechamento; SISAB/e-SUS com formulário/lote/itens; intercâmbio de acompanhamento com vínculo, lote, item, receptor, chave processada, recibo e resultado.
- **Aceite:** quantidades/valores conciliam com atendimento/competência; leiaute e hash correspondem ao arquivo; rejeição/correção/reenvio idempotente. Recebimento local e confirmação externa são estados distintos registrados conforme a execução real.

## Educação, desenvolvimento social e território

### F35 — Vida escolar e ensino · B22
- 60 alunos, 6 turmas, professores/atribuição e registros acadêmicos, responsáveis, períodos, turnos, disciplinas, matriz/itens e quadro de horários.
- Pré-matrícula/processo, matrícula, transferência/movimento, diário, frequência, notas, avaliações, atividade/perguntas/entrega e recurso pedagógico/liberação/tentativa; emitir declaração/histórico e preparar Educacenso pelo recurso disponível.
- **Aceite:** aluno/turma/escola/ano coerentes; docente tem acesso; notas e frequência aparecem no documento; mudança de turma conserva o histórico.

### F36 — Merenda, biblioteca e recursos escolares · B22
- Cardápio e refeições servidas, entrada/saída de alimento vinculada a material e escola; biblioteca com título/exemplar, empréstimo, reserva e devolução.
- Conta/movimento financeiro escolar, plano de aplicação, prestação e atendimento de solicitação de apoio onde implementados.
- **Aceite:** consumo e estoque conciliam; exemplar não tem empréstimos incompatíveis; saldo escolar e aplicação correspondem aos documentos e períodos.

### F37 — Transporte escolar · B22
- Veículos/ônibus vinculados às escolas e à frota, rotas/paradas, alunos elegíveis, viagens, eventos, troca de rota e exceção justificada.
- Manter ida/volta e capacidade compatíveis com turno/horário; registrar responsáveis e documentos aplicáveis.
- **Aceite:** aluno matriculado aparece na rota correta; escola/veículo/motorista vinculados; viagem e relatório mostram os passageiros e eventos.

### F38 — Assistência social completa · B23
- 30 famílias com membros, cadastro, fatos pessoais, renda, CadÚnico/snapshot e importação/layout/linhas; unidades, profissionais e rede referenciada.
- 20 atendimentos e prontuários, questionários, acompanhamento/anotações, visitas/presenças, encaminhamento/detalhes, programas/condicionalidades e SCFV/grupo/inscrição/evento/frequência.
- 12 concessões: cadastro de beneficiário, pedido/itens, classificação/cota, análise, benefício, estoque/movimento e lançamento financeiro/extrato mensal; mensagens/despacho, anexo e documento/RMA. A tabela técnica de controle `SocialPocDataset`, se usada pelo serviço, mantém seu papel de metadado sem transportar o nome técnico aos cadastros exibidos.
- **Aceite:** composição/renda per capita, critério, estoque, concessão e financeiro conciliam; prontuário mantém vínculo de unidade/família; relatório e documento abrem o atendimento correto.

### F39 — Obras e serviços urbanos · B24
- 6 obras com contratos, cronogramas e medições; 24 ordens em estados diferentes, equipes/membros, executores, equipamentos patrimoniais, material, compra e documento.
- Relacionar demanda de atendimento e local/endereço; caso com execução parcial e um com conclusão, fotos e custos.
- **Aceite:** quantidade/valor medido dentro do contrato; consumo de material e equipamento ligados à ordem; retorno encerra a solicitação de origem.

### F40 — Abertura, viabilidade e análise urbanística · B25
- 12 processos com interessado, empresa/profissional/empregador, cadastro de staff, termo/aceite, imóvel/zoneamento, finalidade e categoria; parâmetros/formulários/modelos versionados e regras de distribuição.
- Protocolo e projeto/anexos, viabilidade automática/manual, análise, exigência, revisão/correção e redistribuição/substituição de analista; casos de aprovação e indeferimento.
- **Aceite:** áreas/índices e propriedade coerentes; prazos e carga de trabalho verificáveis; interessado consegue atender à exigência com novo documento e preservar a versão anterior.

### F41 — Licença, fiscalização e conclusão urbanística · B25
- Regra/taxa/guia e análise financeira, licença, correção/renovação, vistoria, fiscalização/autuação e regularização; pedido de conclusão/habite-se, documento e histórico.
- Demonstrar comunicação, integração e retomada de processo em fases próprias; guardar as versões dos projetos e documentos emitidos.
- **Aceite:** emissão usa a regra/versionamento correto, não pula pendência impeditiva; vistoria e conclusão correspondem ao imóvel e ao projeto; integração tributária e PDF conferem.

### F42 — Gestão cemiterial · B26
- Reaproveitar cemitérios e estrutura; completar capela/ossuário, campos de identificação, quadra/lote/sepultura, funerária e causas catalogadas.
- 12 processos funerários com falecido/responsável, óbito, concessão, sepultamento, exumação/transferência quando suportadas, regra/taxa/guia, anexo e histórico; casos em aberto e concluídos.
- **Aceite:** uma ocupação vigente coerente por espaço; falecido/responsável com papéis diferentes; taxa e movimento ligados ao evento; mapa, consulta e documento refletem a posição real.

### F43 — Meio ambiente e reciclagem · B27
- 10 empreendimentos com atividade, licença, documento, vistoria e infração; solicitações de poda, área verde, programa educativo e denúncia com retorno.
- Catálogos/depósitos e vínculo ao material; coleta, entrada, saída/venda, estoque e receita de recicláveis, por tipo e competência.
- **Aceite:** saldo e quantidade em kg conciliam; venda não vira apenas texto de destinação; receitas/gráficos e licença encontram a origem e o período.

### F44 — Água e saneamento · B28
- Reutilizar as 18.500 unidades consumidoras, hidrômetros e 55.500 leituras/faturas; selecionar um conjunto de pessoas/unidades para roteiros narrativos sem duplicar a carga extensa.
- Solicitação de ligação/revisão, troca de hidrômetro, leitura/correção, emissão, situação de pagamento quando implementada, ordem de serviço, qualidade da água e relatório salvo; conferir a relação entre fontes atuais e a tabela histórica `WaterMeterReading` antes de planejar sua ocupação específica.
- **Aceite:** leitura anterior/atual/consumo e fatura conciliam; titular e endereço corretos; manutenção/qualidade e portal têm documentação e desfecho.

### F45 — Cultura, esporte e lazer · B29
- 12 agentes, espaços, patrimônio cultural, atividades/oficinas e 6 projetos com incentivo/avaliação; evento, reserva, conselho, fundo e documentos associados.
- Programação, inscrição/participação quando suportada, análise, aprovação/indeferimento de projeto, ocupação de espaço e encerramento com resultados.
- **Aceite:** horários sem reserva incompatível; agente/projeto/evento/documentos ligados; relatórios de público, recursos e reservas correspondem aos fatos.

### F46 — Segurança, trânsito e mobilidade · B30
- Guarda/equipes, 12 ocorrências, despacho e execução; rondas/câmeras, defesa civil, mobilidade/rotas, sinalização e ordem de serviço/equipamento.
- Auto de infração de trânsito e outra ocorrência com orientação/encerramento; anexar documento e manter vínculos com Frota/Obras quando aplicáveis.
- **Aceite:** agente, local, data e providência consistentes; documentos e relatórios localizam ocorrência/auto; OS não fica sem origem e retorno.

## Legislativo, documentos, portais e suporte

### F47 — Câmara e processo legislativo · B31
- Reaproveitar legislatura e 9 vereadores; gabinetes/assessores, mesa e comissões/membros; 4 sessões com pauta, presença, proposição, parecer e documento legislativo.
- Votação/votos, ata, lei/ato e audiência; casos em tramitação, aprovados e rejeitados; vínculo à publicação e ao orçamento do Legislativo.
- **Aceite:** presenças/quórum/votos e resultado coerentes; sessão/proposição/lei conservam origem; portal e PDF abrem o texto/documento correto.

### F48 — GED e automação documental · B32
- 30 documentos com classe/tipo/metadados, pasta e grupo/membros/ACL; originais, upload, versão/arquivo, texto por página/OCR, processamento e artefatos.
- Checkout/devolução, comentário, revisão/decisão, favorito/preferência, pasta inteligente, thesaurus e pesquisa; modelo/versionamento e documento gerado; importação de fonte, publicação, arquivo central e destinação conforme regras.
- Workflow com definição/execução/decisão, tarefa/calendário; regra/versão/execução/resultado, fila, intenção de mensagem e vínculo de integração; embeddings somente pelo indexador configurado.
- **Aceite:** busca encontra conteúdo real; arquivo/hash/versão correspondem; revisões, tarefas e automações foram executadas; filas/leases podem esvaziar após processamento e precisam de evidência do ciclo.

### F49 — Assinaturas e certificados · B32
- Tipos documentais e registros da central, signatários, certificado, assinatura e auditoria de uso; integração A1 quando o ambiente efetivamente a disponibilizar.
- Documento interno com assinatura realizada pelo mecanismo disponível; recusa/cancelamento e conclusão em casos distintos, arquivo final e verificação.
- **Aceite:** assinante e bytes finais verificáveis; assinatura interna é identificada pelo tipo correto; evidência ICP só existe quando houve processamento criptográfico compatível, sem certificado/recibo inventado.

### F50 — Atos e textos jurídicos · B33
- 12 normas com número/tipo/ementa/texto integral, vigência, versões e relação de alteração/revogação/regulamentação; signatário, comentário e documento original.
- DOCX/ODT/PDF preservados, vinculação e armazenamento em banco/BLOB conforme o serviço, fonte legada/importação e portal de consulta.
- **Aceite:** busca simples/combinada encontra conteúdo; impressão inclui texto integral; versões/relações apontam a norma correta; original pode ser baixado e aberto.

### F51 — Portal institucional e transparência · B34
- Páginas, menus, notícias, banners, diário/publicação e documentos públicos; fontes nativas ligadas aos contratos, despesas, receitas, obras, frota e pessoal efetivamente carregados.
- Critério/evidência PNTP, vinculação, acesso e feedback; consulta por competência/unidade, arquivo e exportação integral.
- **Aceite:** portal e módulo reconciliam os mesmos fatos; nenhuma publicação aponta para arquivo ausente; menu, busca e documento abrem o destino efetivo.

### F52 — Autoatendimento e e-SIC · B34
- Serviços com configuração/versão, avisos, agenda, solicitação, upload e eventos; favoritos e avaliação; cidadão acompanha o próprio processo, pedido e resposta.
- e-SIC com pedido, análise, resposta e recurso; pesquisa de satisfação e identidades de acesso; validar também os portais de paciente e servidor com os casos F13/F28/F32.
- **Aceite:** solicitação pública cria a demanda interna e recebe retorno; agendamento respeita disponibilidade; anexos e recurso persistem; o histórico atravessa portal e operação.

### F53 — BI, painéis, indicadores e auditoria · B35
- Séries mensais dos módulos, filtro por ente/unidade/período; canal de exibição, versão, snapshot e mídia; visão de administração e da apresentação em TV.
- Auditoria de cadastros/fluxos/revisões, consulta de evento e origem; snapshots produzidos pela geração real dos painéis, sem totais aleatórios.
- **Aceite:** número do gráfico corresponde à consulta de origem; filtro muda o agregado; versão exibida é identificada; logs e revisões refletem as ações executadas.

### F54 — Integrações, processamento e suporte · B36
- Conexão, execução, importação/exportação e processamento por adaptador; preparar arquivos locais compatíveis e casos de aceitação, rejeição com motivo e reprocessamento idempotente.
- Configurações/atendimento de suporte e contato comercial quando apresentados no produto; registrar a finalidade da tabela `Lead` e um cadastro verossímil pelo canal que a utiliza.
- **Aceite:** payload/arquivo têm origem, hash e resultado compatíveis; falha não se torna sucesso artificial; uma integração sem adaptador disponível recebe impedimento concreto e tarefa na matriz, permanecendo pendente.

### F55 — Ciclo técnico de autenticação Neon · T01
- Verificar se o Neon Auth está ativo para algum fluxo: a resolução de usuário inspecionada usa Firebase UID e não foram localizados consumidores de `neon_auth` no código da aplicação.
- Se integrado ao fluxo efetivo, exercitar organização, usuário/conta, associação, convite, sessão e recuperação pelo provedor. `jwks` e configuração são produzidos/administrados pelo próprio serviço; verificar chave/configuração, sem criar linhas artificiais de credencial.
- **Aceite:** as nove tabelas têm função e resultado registrados. Caso não haja integração, registrar ausência de consumidor e o trabalho necessário para torná-la demonstrável; não contar a tabela como populada ou o ciclo como executado. Sessão/verificação podem voltar a zero após expiração/consumo.

### F56 — Controle técnico de migrações · T02
- Reconciliar `_celeriflow_sql_migrations`, `_celeriflow_sql_state` e `_prisma_migrations` com o histórico real, incluindo o papel legado desta última na migração já realizada para Drizzle.
- Tratar eventual divergência pelo migrador e pelos artefatos de proveniência existentes; inserir histórico apenas como consequência de migração real aplicável.
- **Aceite:** histórico e schema coerentes; não adicionar migração fictícia ou linha de negócio para aumentar a contagem. Essas três tabelas já têm registros no snapshot inicial.

## Fechamento de cada roteiro

1. Selecionar pessoas, empresas e unidades do dicionário e resolver os IDs existentes.
2. Conferir as tabelas do pacote na matriz, incluindo especialidades que o caso central ainda não alcançou.
3. Inspecionar o serviço gravador e traduzir os estados para os valores admitidos pela implementação.
4. Construir casos específicos para cada tabela persistente ainda vazia, ramo alternativo e relação faltante.
5. Ensaiar/aplicar/verificar com recibos e reexecução idempotente; registrar os efeitos externos à transação separadamente.
6. Navegar por todas as páginas/handlers associados, preencher parâmetros dinâmicos com os IDs dos casos e acrescentar abas/ações descobertas na inspeção.
7. Conferir documentos, relações, valores e aparência dos dados; atualizar os estados de banco, fluxo e visual de forma independente.
8. Encerrar somente com evidência ou manter a pendência específica. A contagem de uma tabela preenchida não substitui os oito passos.
