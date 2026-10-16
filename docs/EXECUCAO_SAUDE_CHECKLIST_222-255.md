# Execução da Saúde — checklist 222–255

Fontes: [plano geral](PLANO_GERAL_SAUDE_CHECKLIST_222-255.md), [matriz normativa](MATRIZ_REQUISITOS_SAUDE_222-255.md) e PDF original, páginas 222–255.

## Situação do trabalho

**Execução interna iniciada; adequação integral ainda não concluída.** A matriz original conserva suas classificações até que cada condição de fechamento tenha evidência operacional. Não atribuir conformidade aos 339 itens com base nas correções abaixo.

Por orientação do usuário, a configuração e conferência das integrações externas fica para o final, um destino por vez. Não foram executadas chamadas oficiais CADSUS, e-SUS, RNDS ou BNAFAR nesta etapa. Dados, documentos e vínculos internos exigidos por esses itens continuam no escopo das fases internas.

## Entregas da primeira execução

| Requisitos relacionados | Ajuste realizado | Evidência / limite |
|---|---|---|
| GS-001, GS-007, GS-012, GS-014 | Cadastro de paciente expõe sexo, raça/cor, filiação, telefone, celular, e-mail e ocupação; edição atualiza a mesma `Person`, além do perfil `Patient`. | `saude/pacientes/`, `contract.ts`. Filiação desconhecida estruturada, obrigatoriedade/validade e demais campos do cadastro completo ainda precisam de entrega própria. |
| GS-018 | Pesquisa de pacientes combina o termo de nome/CPF/CNS com nascimento e sexo. | `PacientesClient.tsx`; filtros sobre a lista autorizada do cadastro. |
| CR-019, CR-021, CR-029, CR-026/037 | Transições de regulação serializadas; repetição de autorização/execução/transferência não altera novamente os contadores; cancelamento agendado libera reserva; cotas incompatíveis são recusadas; total não pode ficar abaixo do consumo. | `regulation-service.ts` e teste integrado. A ligação completa com agenda, espera e distribuição por solicitante continua pendente em F03; não encerrar esses itens apenas pelo saldo corrigido. |
| AS-030, AS-031 | Desfecho em observação cria `HealthObservation` vinculada ao `MedicalRecord`; permite evolução adicional do profissional responsável durante o episódio; alta encerra essa possibilidade, preservando a narrativa concluída. | `care-service.ts`, `reception-service.ts`, tela do prontuário e teste integrado. Registros anteriores sem origem não receberam vínculos inferidos. |
| AS-034 | Digitação por voz para o campo textual selecionado no prontuário, com revisão antes de salvar. Campos desabilitados/somente leitura não são elegíveis ao início da captura. | `ClinicalDictation.tsx`. Captação real de áudio deve ser conferida manualmente em navegador com reconhecimento de voz e microfone autorizados; não contar a existência do controle como prova de transcrição real. |
| AF-011, AF-014–018 | Entrada permite múltiplos produtos, emissão/nota, doador por nome e fabricante por item; validade/lote/quantidade/custo validados; política de aprovação por estoque; pendente não gera movimento; aprovação registra autoria e efetiva uma vez. | `HealthReceiptForm.tsx`, `health-stock-service.ts`, lista de entradas e teste integrado. XML fiscal, filtros/paginação de todas as entradas e demais operações de F06 continuam pendentes. |

## Alteração de banco aplicada

Migration `20261015010000_health_internal_receipt_observation`:

- Acrescenta doador, emissão da nota e data/usuário de aprovação em `HealthStockReceipt`.
- Acrescenta fabricante em `HealthStockReceiptItem`.
- Relaciona `HealthObservation.medicalRecordId` ao prontuário, com unicidade por episódio de origem.
- Preserva os registros existentes; não cria produção clínica, doses, laudos ou saldos artificiais.

## Verificações técnicas

- `npx prisma validate`: aprovado.
- Migration aplicada e Prisma Client gerado.
- `npm run build`: aprovado após as alterações da aplicação.
- Teste integrado em banco isolado cobre entrada pendente, aprovação concorrente, replay, rejeição de dados diferentes, escopo de unidade, autorização/transferência/execução de cotas, cancelamento agendado, reabertura administrativa sem novo consumo e evolução em observação até a alta.
- Os testes anteriores de agenda, atendimento, acesso e estoque assistencial permanecem na verificação.
- Resultado do conjunto executado: 18 testes aprovados; lint e `git diff --check` aprovados.
- Conferência autenticada com o build de produção local: cinco verificações aprovadas, sem erros JavaScript, cobrindo filtros/campos do paciente, entrada com múltiplos produtos/doação, validade obrigatória, política de aprovação e acesso à regulação. Nenhum prontuário ou saldo operacional foi alterado por essa conferência.
- Não havia atendimento aberto na base consultada para verificar o ditado no navegador. A captura real de voz e a interface do episódio em observação permanecem na conferência manual; seus serviços de persistência e encerramento foram testados em banco isolado.

## Continuação necessária conforme o plano

### Retomada de 15/10/2026 — implementação interna em andamento

As verificações da primeira execução acima pertencem àquele estado do código. As alterações posteriores abaixo não devem herdar automaticamente o aceite visual ou o build anterior.

| Bloco | Implementação posterior | Evidência atual e fechamento restante |
|---|---|---|
| F01 — cadastro e rede | CPF opcional no cadastro comum com exigência por idade na Saúde; perfil PRE/COMPLETE, validade por unidade, filiação desconhecida, contatos, endereços históricos, GED/foto, ficha/cartão, óbito e rede/coberturas/expediente profissional. | Migrations `20261015020000`–`20261015050000`; testes de política de CPF e validade aprovados. Conferir cadastro completo, mesclagem integral e efeitos intermodulares antes de encerrar cada GS/GF correspondente. |
| F02 — território | Domicílio detalhado, composição familiar compartilhada, histórico de movimentos, pasta familiar, visitas por integrante, solicitação/avaliação domiciliar, atividades coletivas e marcadores alimentares. | Migration `20261015060000`; interfaces em `/saude/territorio/atencao-primaria`. Fluxos transacionais e browser ainda precisam de conferência específica. |
| F03 — regulação/espera/agenda | Aprovação cria espera; agendamento cria consulta e vincula espera/pedido; bloqueios, critérios, disponibilidade por data, análises administrativas/técnicas, distribuição de cotas e painéis. | Migrations `20261015070000` e `20261015080000`. Teste integrado atualizado passou pela autorização, criação de espera/agendamento e cancelamento com liberação de cota. Avisos, expediente individual e condições restantes da matriz continuam em conferência. |
| F04 — complementos clínicos | Condições/alergias, medicamentos contínuos, questionários versionados, administração com materiais/estoque, avaliações de exames, contrarreferência, encaminhamento interno, receituários, emissão documental/GED/solicitação de assinatura e revisão por janela. | Migration `20261015090000`; `/saude/atendimentos/[id]/complementos` ligado ao prontuário. Corrigida seleção da guia especializada e rejeitada emissão sem origem correspondente. Assinatura executada, documentos PDF e revisão ainda exigem evidência operacional específica. |
| F05 — gestação | Abertura pela consulta, DUM/ultrassom, DPP, idade gestacional, medidas por consulta/trimestre, gráfico de IMC, puerpério, abortamento e encerramento administrativo com histórico preservado. | Migration `20261015100000`; `care-lines-service.ts`, página contextual e gestor `/saude/linhas-cuidado`. Testes aprovados para cálculo, unicidade da gestação ativa, consultas sem duplicação e encerramento sem apagar visitas. Conferência visual e restante de AS-049–057 continuam abertos. |
| F05 — crônicos/rastreamentos | Pressão, glicemia/HbA1c, riscos e complicações por avaliação; condição crônica longitudinal; elegibilidade, realização, resultado e acompanhamento citopatológico/mamográfico. | Teste integrado confirma duas avaliações, uma condição longitudinal e atualização do rastreamento preservando a solicitação original. Gestor oferece paciente, telefone, endereço e acesso ao acompanhamento. Indicadores completos e contratos de intercâmbio ainda pendentes. |
| F05 — odontologia/sessões | Odontograma interativo permanente/decíduo/ambos; marcações por dente/arcada/quadrante/boca/sextante e superfícies; procedimento realizado vinculado ao ato; sessões numeradas do plano com agendamento e desfecho. | Testes aprovados para dentição/região, vínculo ao procedimento, limite de sessões e repetição de conclusão sem novo contador/evolução. Conferência visual e críticas de especialidade/produção permanecem abertas. |

Verificações desta retomada:

- `npx prisma validate`: aprovado; migration `20261015100000_health_care_lines` aplicada sem reset.
- `npm run typecheck`: quatro partições aprovadas após inclusão das linhas de cuidado; ajustes posteriores nos indicativos da página principal ainda serão incluídos no build final.
- Lint dos novos serviços/páginas de linhas de cuidado e serviços clínicos: aprovado.
- `node --conditions=react-server --import tsx --test tests/health-registration-policy.test.ts tests/health-care-lines-policy.test.ts tests/health-checklist-internal-flows.test.ts`: **5 testes aprovados**, incluindo cenário integrado com várias operações em banco isolado.
- A fixture foi corrigida para identificar listas pelo schema: o DMMF desta versão não expõe `isList`. A consulta do histórico verifica preservação das listas de riscos/complicações.
- A matriz continua aberta por requisito; os blocos acima registram implementação/evidência parcial, sem declarar conformidade integral.

### Validação ampliada da retomada

- **F01:** cenário integrado verifica atualização da mesma `Person`, menor com CPF nulo sob política de 18 anos, recusa de adulto sem CPF, filiação obrigatória/desconhecida, contato socioafetivo, ligação com autoria, endereços residencial/comercial sem sobrescrita, histórico anterior/novo, vencimento cadastral, exceção de urgência e óbito refletido em `Person`/`Patient`.
- **F02:** cenário integrado verifica domicílio, família comum e perfis Saúde/Social, entrada/saída com histórico, visita com ausência/recusa/medidas, transferência de domicílio com unidade de abrangência atualizada e bloqueio de acesso cruzado. Atendimento domiciliar exige a última avaliação favorável; produção coletiva e marcadores por idade foram persistidos no teste.
- **F03:** expediente/vigência do vínculo profissional agora são consumidos na disponibilidade e na reserva. Profissional da agenda é atribuído ao agendamento; horário ocupado é bloqueado mesmo sem profissional vinculado; faltas liberam a vaga conforme política e atendimentos concluídos conservam o horário consumido. Teste inclui o último dia de vigência e horários fora do expediente.
- **F04:** gestação ativa participa da regra de questionário obrigatório; respostas de versões anteriores permanecem consultáveis e não substituem a versão ativa exigida. Revisão clínica guarda anterior/novo e autoria dentro da janela; janela desabilitada recusa alteração. Procedimentos por regra de triagem e conclusão odontológica são gerados sem duplicação no cenário integrado.
- **Condições longitudinais:** migration `20261015110000_health_condition_revisions` aplicada; alterações preservam snapshots anterior/novo, atendimento e usuário. Teste confirma duas revisões sem apagar a narrativa anterior.
- **AF-012 — NF-e:** parser fiscal dedicado (`fast-xml-parser` como dependência explícita), NF-e modelo 55 versões 3.10/4.00, emitente/CNPJ, número/série/chave/hash/emissão, itens e lotes de rastreabilidade. `/saude/farmacia/notas` permite mapear ao material único e converter unidade comercial para estoque mantendo o valor. Lote, validade e fabricação fornecidos no XML são preservados; ausência exige complementação. Entrada usa a política de aprovação e a chave fiscal para impedir duplicação. XML de até 2 MB, compatível com o limite de Server Actions configurado no projeto.
- **Teste NF-e:** fornecedor divergente e alteração de lote/datas são recusados; 2 caixas com fator 10 resultam em 20 unidades a R$ 1,25, somente após aprovação; reenvio não cria outra entrada nem saldo. Datas fiscais com fuso e emissão após 21h foram cobertas sem rejeitar a mudança do dia UTC.

Último conjunto técnico executado nesta retomada:

1. `npm run build`: aprovado, incluindo quatro partições do typecheck e compilação de produção, após as correções de território, expediente, questionários e histórico clínico.
2. Conjunto de sete arquivos de testes de Saúde: **20 testes aprovados**, incluindo o cenário transacional ampliado em banco isolado.
3. Lint dos serviços e interfaces alterados nesta retomada: aprovado.
4. Navegador autenticado sobre build de produção local: **7 verificações aprovadas**, sem erros JavaScript, incluindo gestor de linhas de cuidado e prévia/mapeamento da NF-e. A prévia não registrou entrada nem estoque.
5. A base consultada não tinha `MedicalRecord` para abrir os complementos/odontograma no navegador; não contar a interação visual desses componentes como verificada. Seus serviços têm a evidência de persistência/regras descrita acima. Não houve transmissão externa nem captura real de voz.

### Catálogo e dispensação farmacêutica — continuação de F06

- Migration `20261015120000_health_pharmacy_catalog` aplicada: CATMAT, unidade de fornecimento/fator, RENAME/REMUME com referências, recomendação no receituário, componente farmacêutico, denominação DCB/CAS versionada e equivalência de unidades oficiais. As fontes/versionamentos precisam ser fornecidos no cadastro; **não foi carregada nem validada a lista oficial Anvisa de 2007**.
- `/saude/farmacia/catalogo`: filtros, paginação de 20 produtos, vínculo ao mesmo material, referência de cada relação e equivalência CATMAT. A recomendação do produto é copiada para o item prescrito e segue para a impressão da receita. O nome do medicamento selecionado é preservado do catálogo.
- Migration `20261015130000_health_dispensation_history` aplicada: situação da dispensação, prescritor, retirante do cadastro comum, parentesco/vínculo, cancelamento, estorno e eventos. Registros com item de receita receberam tipo/prescritor de sua origem; não foram inferidos prescritores ausentes de registros manuais.
- `/saude/farmacia/dispensacoes`: filtros combinados de paciente, data, unidade e situação; receitas por paciente ou código de barras; leitura do código sem distinguir maiúsculas/minúsculas, compatível com o Code39 emitido; saldos por item; disponibilidade nas unidades autorizadas; dispensação manual e identificação de outra pessoa retirante.
- Tipo especial/controlado exige prescritor; medicamento controlado não é dispensado como receita simples. Lote vencido/bloqueado e quantidade acima da receita são recusados. Repetição da mesma operação não baixa estoque novamente.
- Correção e cancelamento preservam o registro original, geram movimento compensatório e recompõem o saldo da receita na mesma transação. Correção inválida reverte toda a operação. O estorno usa `reverseStockMovementInTransaction`, extraído do serviço compartilhado de Patrimônio sem alterar a assinatura de `reverseStockMovement`.
- Declaração de recebimento contém paciente, retirante/vínculo, medicamento, quantidade, lote, data e unidade. Dispensação cancelada não emite declaração ativa. Histórico do paciente sinaliza cancelamento; consumo/gerencial/portal e saldo da receita desconsideram canceladas. Registros de histórico/unificação continuam preservados.
- Teste integrado cobre entrega a familiar, recibo com retirante, limite da receita, cancelamento repetido, nova entrega após recomposição, rollback de correção inválida, correção repetida sem novo movimento, dispensação manual, bloqueio de lote e exigência de prescritor para controlado. Verifica valores finais de estoque e saldo ativo da receita.

Verificação após essas alterações:

- Build completo aprovado, com as quatro partições do typecheck.
- **30 testes aprovados** no conjunto Saúde + estoque compartilhado de Patrimônio; **21 testes adicionais aprovados** de acesso/importações/administração/relatórios de Saúde: total de **51 testes** nesses conjuntos.
- Lint dos serviços/interfaces alterados e `git diff --check` aprovados.
- **9 verificações autenticadas de navegador aprovadas**, sem erros JavaScript; acrescentados catálogo DCB/CAS/RENAME/REMUME/unidade de fornecimento e gestor de dispensações/formulário manual. Não foram efetivadas dispensações ou alterações de cadastro/estoque no banco operacional durante o browser.
- Permanecem em F06 judicialização, kits, processo completo de requisição/transferência, demanda reprimida, inventário e reconferência das condições ainda abertas na matriz; a entrega deste bloco não encerra a fase inteira.

### Fechamentos ainda necessários

### Judicialização farmacêutica — 15/10/2026

- Migration `20261015140000_health_pharmacy_judicial` aplicada, sem reset. Advogado referencia a mesma `Person`, com inscrição/UF; processo farmacêutico referencia paciente, unidade, advogado, protocolo e pedido de compra existentes. Produtos mantêm vínculo a medicamento/material e item de receita quando fornecido.
- Gestor `/saude/farmacia/judicial`: abertura com vários produtos, filtros e 20 processos por página; fases Aberto/Análise/Aprovado/Negado/Cancelado/Arquivado com motivo, data e autoria; upload GED/download por escopo; extrato PDF da origem; dispensação contextual após aprovação; renovação com nova versão, sem sobrescrever anterior.
- A dispensação eletrônica e manual aplicam a autorização judicial na mesma transação do estoque. Paciente/medicamento/receita devem corresponder ao processo; validade e quantidade total são verificadas sob lock. Cancelar uma entrega recompõe o saldo judicial; cancelar o processo impede novas entregas. Correção preserva a origem judicial.
- Aprovar a renovação arquiva a autorização anterior com evento automático, evitando duas autorizações simultâneas do mesmo processo. Aprovação e renovação usam lock do número do processo; entregas bloqueiam a versão consultada.
- Teste em banco isolado verifica advogado comum, vínculos de protocolo/compra/receita, análise antes de aprovação, replay sem duplicar eventos/estoque, limite judicial, escopo de unidade, recomposição, cancelamento, renovação, arquivamento da autorização anterior e extrato PDF válido com identificação do processo.
- Build completo aprovado após o timeout da primeira tentativa de typecheck; as quatro partições e a compilação de produção concluíram. Lint aprovado e teste integrado ampliado aprovado.
- Navegador autenticado: conjunto ampliado para **10 verificações aprovadas**, sem erros JavaScript; formulário judicial expõe origem, compra, advogado, datas e composição múltipla. Não foram criados processos nem movimentado estoque no banco operacional durante a conferência visual. Upload/download real de nova digitalização continua sem conferência operacional; não herda o teste do vínculo GED criado na fixture.

### Demais fechamentos internos

### Vacinação, carteira e busca ativa — F07

- Migrations `20261015180000_health_vaccination_workflows` e `20261015190000_health_vaccine_transfer_metadata` aplicadas. Catálogo admite fabricante/código de produtor, mapeamentos e-SUS/RNDS por versão/fonte, autorização de remessa por imunobiológico, diluente e validade após preparo. Não foram atribuídos códigos/calendário oficiais sem fonte nem transmitidos registros aos destinos.
- Calendário versionado por dose/estratégia, idade em dias/meses/anos, intervalo, repetição, exigibilidade e vigência. Idade respeita finais de mês e anos bissextos. Relações entre imunobiológicos controlam intervalo e aplicação no mesmo dia. Campanhas guardam período e divulgação, exibida também ao paciente.
- Carteira por paciente com calendário/situação, histórico, indicação e profissional indicador, aprazamento, contraindicação temporária/permanente e encerramento preservando o registro. Resgate registra aplicação histórica com origem, sem criar movimentação atual de estoque; aprazamento não quita dose pendente.
- Aplicação registra data/hora selecionada, profissional que aplicou, usuário que registrou, grupo, estratégia, local, lote e campanha. Indicação pode pertencer a profissional diferente. Agenda e atendimento abrem a carteira contextual; paciente/unidade/origens são validados e o espelho clínico inclui aplicações vinculadas, sem duplicá-las.
- Entrada por frascos converte quantidade/custo para doses e preserva doses por frasco/fabricante no lote. Preparo abre frasco e consome diluente uma vez; aplicações seguintes usam doses remanescentes do mesmo frasco. Validade pós-abertura, lote bloqueado/vencido e saldo são respeitados. Perda tem chave de repetição e reduz doses/frascos coerentemente; conciliação de distribuição em frascos não cria saldo físico.
- Transferência de frascos fechados reutiliza F06, preserva metadados do lote no destino e não utiliza doses já alocadas a frascos abertos. Inventário reutiliza as posições/ajustes compartilhados e exige contagem inteira de doses do imunobiológico. Diluentes continuam em sua unidade material de estoque.
- ESAVI tem gestor nominal, vínculo opcional à aplicação, tipo/local de lesão, gravidade registrada e histórico de condutas por profissional/data/usuário, inclusive para paciente fora do cadastro ativo quando necessário ao histórico.
- Carteira e certidão PDF derivam do calendário/histórico/contraindicações. Certidão informa situação calculada (regular ou com pendências), não converte ausência de calendário/nascimento em regularidade. Portal resolve paciente exclusivamente pela sessão para emitir seus documentos e exibir situação/campanhas.
- Busca ativa calcula o recorte completo antes da paginação, com pendências nominais, telefone/endereço e origem na carteira. Nascimento ausente é pendência cadastral distinta de dose não realizada.
- Chamada farmacêutica exposta em `/saude/farmacia/chamadas`, reutilizando os mesmos `HealthCallPanel`/`HealthPanelCall` de F03: mensagem, notícias, setor/unidade, pedido vinculado e histórico com autoria. Sem nova fila paralela nem marcação de atendimento clínico por uma chamada.

Evidências desta consolidação:

1. **74 testes aprovados** no conjunto de Saúde/Patrimônio executado, incluindo seis testes de política vacinal e cenário integrado ampliado com frascos/diluentes, indicação/administrador distintos, datas, incompatibilidade, contraindicação/revogação, resgate sem baixa, ESAVI/conduta, PDFs e transferência seguida de aplicação na unidade destino.
2. PostgreSQL local descartável com conexões reais: cenário integrado aprovado, incluindo duas operações simultâneas para a mesma dose com chaves distintas, gerando uma única aplicação/baixa.
3. Build completo e quatro partições do typecheck aprovados. Lint das novas interfaces/serviços aprovado; primeira tentativa de lint concorrente atingiu timeout, e a execução serial concluiu.
4. **18 verificações autenticadas de navegador aprovadas**, sem erros JavaScript. Incluem calendário/entrada por frascos, campos de data/profissional/grupo, ações da carteira/ESAVI e download de PDF real do paciente autorizado. Corrigida normalização de identificador importado com `:` nas rotas reescritas da carteira e PDF; o caso real passou no navegador após a correção.
5. Checksum de **19 migrations de Saúde aplicadas** conferido com os arquivos locais; sem divergência e sem alteração de linhas operacionais por essa verificação. A validade após abertura foi confirmada como campo de precisão fracionária no banco.
6. Browser não criou aplicações, resgates, perdas, chamadas ou saldos no banco operacional; emissão de PDF mantém a auditoria normal da plataforma. Recepção/transmissão/aceite nacional e verificação de equipamento continuam na fase externa.

### Kits, vínculos programáticos, inventário e requisições — continuação

- Migrations `20261015150000_health_pharmacy_kits`, `20261015160000_health_care_program_enrollment` e `20261015170000_health_pharmacy_request_chain` aplicadas. As configurações e os vínculos novos não geram atendimentos, receitas nem saldos artificiais.
- **Kits:** composição versionada sobre o material único, quantidades padrão copiadas à geração, seleção de pacientes por endereço residencial atual, validade explícita da receita e vínculo vigente a ação programática cadastrada. Condições clínicas podem ser filtro adicional; não são usadas para presumir um vínculo programático. Encerramento do vínculo preserva o período anterior e impede novas retiradas que dependam dele.
- **Geração/entrega/retorno:** geração não baixa estoque; retirada confere cada lote e gera dispensação de origem para medicamentos ou movimento para correlatos. Falha em um item desfaz a entrega inteira. Não retirada exige justificativa. Retorno estorna apenas movimentos efetivados, recompõe receita e estoque uma vez; kit não retirado retorna sem criar entrada. Dispensa de item de kit não é corrigida/cancelada avulsamente: o gestor abre a entrega de origem.
- **Receita:** profissional responsável define validade no atendimento aberto; a data é consumida pela elegibilidade dos kits e pela emissão do receituário. A seleção do lote vazio explícito passou a respeitar a posição sem lote, mantendo FEFO quando o lote é omitido.
- **Inventário:** `/saude/farmacia/inventario` reutiliza `InventorySession`, contagem por posição/lote e encerramento aprovado de Patrimônio. Contagem e aprovação mantêm os atores da origem. Abertura e movimentação compartilham trava do estoque; contagem/envio/encerramento travam a sessão; ajustes têm chave única por item. Teste verifica abertura simultânea única, bloqueio durante a contagem, exigência de contar tudo, segregação já existente e um único ajuste no fechamento simultâneo.
- **Requisição:** gestor `/saude/farmacia/requisicoes`, vários produtos, consulta de saldo nas unidades autorizadas, origem/destino e envios parciais vinculados aos itens. Saldo em trânsito é reservado contra novo envio; quantidade atendida só aumenta no aceite. Aceite repetido não duplica quantidade/estoque; custo de entrada mantém o valor do movimento de saída. Cancelamento de pedido com remessa em trânsito é recusado até sua conclusão.
- **Demanda reprimida:** pedido de paciente é atendido por receita eletrônica/externa ou entrega de correlato, com lote, retirante e movimento vinculados. Quantidade/estado do pedido são atualizados na mesma transação. Cancelar/corrigir dispensação recompõe também o pedido; cancelar o saldo do pedido não apaga entregas anteriores. Relatório de demanda pendente exclui pedidos cancelados.
- A unificação de paciente transfere também processos judiciais, kits e vínculos programáticos. Os novos documentos e vínculos de origem usam referências persistidas.

Verificações desse bloco:

1. Build completo aprovado, incluindo as quatro partições e as rotas de kits, inventário e requisições.
2. **68 testes aprovados** no conjunto executado de Saúde e dos cinco arquivos de Patrimônio, incluindo aquisição, requisições, inventário, estorno e ciclo patrimonial.
3. Cenário integrado executado também com **PostgreSQL local descartável e múltiplas conexões reais**, pelo runner `verify-planning-postgres.mjs`; aprovado. Esse servidor não utiliza a base operacional e foi encerrado/removido pelo próprio runner.
4. Lint dos serviços/interfaces alterados aprovado. **13 verificações autenticadas de navegador aprovadas**, sem erros JavaScript; acrescentadas composição/geração de kits, vínculo programático, inventário por lote e requisições com vários produtos. Não houve gravação de pedidos, entregas, contagens ou saldos no banco operacional durante a conferência visual.
5. Permanecem abertos os itens de F06 que dependem de carga oficial DCB, conferência documental/arquivo e chamada no painel farmacêutico; não declarar a fase integralmente aceita apenas pelas entregas acima.

1. **F01:** CPF conforme idade sem identificador artificial, pré-cadastro/validade, contatos adicionais, endereço/foto/documentos, óbito, histórico detalhado, unificação integral, rede e cobertura assistencial.
2. **F02:** composição familiar comum, mudanças territoriais, documentos familiares, visitas por integrante, elegibilidade domiciliar, atividades coletivas e marcadores alimentares completos.
3. **F03:** cadeia regulação → espera → agenda, regras de agendas/cobertura/vigência, bloqueios por período, cotas por solicitante, contatos, avisos e painéis.
4. **F04/F05:** documentos de desfecho e assinatura, prescrição/administração e exames completos, janela de revisão, configuração/troca de profissional e biometria, gestação, crônicos, rastreamentos, odontologia e sessões.
5. **F06/F07:** XML fiscal, catálogos farmacêuticos, judicialização, kits, dispensação/correções, requisições/inventário completos; calendário, regras e ações vacinais, ESAVI, carteira e regularidade.
6. **F08/F09/F10:** laudos e benefícios TFD, transporte completo, AIH/APAC, numerações/decisões, custos/prévias, indicadores e receptores próprios de acompanhamento/regulação.
7. **F11/F12:** leiautes/catálogos oficiais e comunicação aos destinos. As verificações externas serão realizadas posteriormente, conforme a orientação do usuário.

Essas pendências continuam abertas. O encerramento deve obedecer ao resultado exigido em cada linha da matriz, com persistência, regras, efeitos, documento/retorno e histórico.

## F08 — integridade do transporte TFD (execução em andamento)

- Inclusão de passageiros, transferência, exclusão e mudança de situação compartilham bloqueio transacional por viagem; as viagens de origem/destino são bloqueadas em ordem estável. Capacidade e situação são relidas após o bloqueio. Paciente e acompanhante ocupam uma vaga cada; alterações são recusadas após a saída.
- Autorização usa atualização condicional da situação pendente: duas tentativas concorrentes não autorizam novamente o mesmo pedido. Vínculos com regulação e TFD são conferidos contra o paciente; transporte com TFD vinculado exige autorização.
- Transferência atualiza o passageiro existente, preservando seu identificador e o pedido de exclusão. Transferência para a própria viagem mantém o registro. Exclusão confirmada conserva passageiro e decisão de dupla custódia, em vez de apagar a linha e provocar exclusão em cascata da própria decisão. Registros excluídos ficam fora da lotação, listas e documentos; não são reinseridos silenciosamente.
- Tela, documentos e listagem de viagens aplicam escopo sanitário sobre os passageiros. Viagem vazia fica disponível ao seu criador dentro do escopo restrito. Viagem com integrantes de unidades não autorizadas não tem sua lista exposta. Operações de exclusão validam escopo e situação dentro da transação.
- O seletor de regulação da solicitação passou a consultar `HealthRegulationRequest`; anteriormente apresentava identificadores de solicitações TFD nesse campo.
- Não houve alteração de schema/migration neste bloco. O histórico de exclusão usa a relação já existente `HealthTfdPassengerRemoval`.

**Validação:** cenário integrado aprovado no banco isolado e também em PostgreSQL descartável com múltiplas conexões reais; inclui autorização concorrente única, última vaga disputada, acompanhante ocupando vaga, vínculos de outro paciente recusados, escopo, transferência com identidade preservada, dupla custódia, liberação da vaga com histórico mantido e bloqueio de alterações após saída. Conjunto de Saúde/Patrimônio: **74 testes aprovados**. Lint dos arquivos alterados e `npm run build` aprovados.

**F08 continua aberta:** laudo clínico estruturado/versionado e complementos, trâmites completos, benefícios, embarque/faltas, ligação operacional à agenda/saída/retorno de Frotas, auxiliares e adiantamento com origem RH/Financeiro ainda exigem implementação e evidência próprias. As correções de integridade acima não representam aceite integral da fase.

### F08 — laudos, benefícios e transporte compartilhado (continuação)

- Migration `20261015200000_health_tfd_clinical_workflow` aplicada: laudo ligado à solicitação existente, profissional e procedimento SUS; origem opcional em prontuário conferido contra paciente/profissional/unidade. Emissor deve ser o profissional autenticado e possuir vínculo na unidade. Diagnóstico/história/exames/tratamento/indisponibilidade local/transporte/acompanhante estruturados, com snapshots e revisões imutáveis.
- Revisão exige versão esperada e situação editável; glosa não passa diretamente a aprovação sem revisão. Complementos conservam data/hora/usuário e versão, sem sobrescrever o conteúdo original. Aprovação e autorização são etapas distintas, ambas com eventos. Solicitações simples anteriores continuam no caminho compatível; não são presumidas laudos clínicos completos.
- PDFs próprios de laudo e pedido autorizado; salvar o laudo abre o PDF da versão persistida, permitindo reimpressão histórica. Pedido exige autorização da versão atual e é bloqueado após cancelamento. Rotas com escopo sanitário e auditoria de emissão. Gestor `/saude/tfd/laudos` e processo individual exibem versões, complementos e linha do tempo.
- Benefícios de passagem/alimentação/hospedagem/outros têm quantidade e valor unitário Decimal opcional; cadastro → autorização → entrega, com recebedor da Person compartilhada e referência do comprovante. Autorização e entrega são serializadas, sem repetição de efeito. Cancelar tratamento cancela somente benefícios ainda não entregues e preserva entregas anteriores. Não gera execução financeira paralela.
- Relatório CSV próprio por unidade/destino/procedimento/profissional/período, com processo, paciente, diagnóstico, versão, situação e benefícios. Escopo sanitário obrigatório, conteúdo escapado e limite explícito de recorte, sem truncamento silencioso do resultado.
- Migration `20261015210000_health_tfd_fleet_boarding` aplicada: viagem vincula uma agenda real de Frotas, reutilizando veículo/rota/motorista/horário/motivo; auxiliar e responsável são servidores ativos da mesma repartição. A ponte Saúde consome apenas a agenda do setor autorizado, sem atribuir privilégios gerais de Frotas ao operador. CNH/disponibilidade usam os validadores compartilhados.
- Gestor `/saude/tfd/viagens` filtra rotas/agendas por destino. Viagem tem confirmação explícita e manifesto de pacientes/acompanhantes; origem do paciente é a autorização selecionada. Local de embarque, presença/falta e alterações são datados e auditados. Transferência mantém identidade e reinicia a presença na nova viagem; exclusão continua por dupla custódia. Ordem de tráfego PDF inclui agenda, equipe, manifesto e eventos.
- Saída na guarita de Frotas confere transporte confirmado/em embarque, presença/falta de todos, paciente embarcado, tratamento autorizado e acompanhante obrigatório. A regra é compartilhada com a atualização da Saúde. Após a saída real, manifesto não pode ser alterado mesmo que a tela Saúde ainda esteja no estado anterior. Conclusão TFD exige retorno real em Frotas e copia seus horários; utilização patrimonial continua sendo gerada uma vez pelo núcleo de Frotas.
- Adiantamento é vinculado à solicitação `ADIANTAMENTO` deferida no RH para o responsável, com validação de permissão RH/UG e snapshot do valor autorizado. Não confundir esse valor com pagamento efetivo; concessão financeira e prestação continuam na origem RH/Financeiro.

Verificações já realizadas nesta continuação: schema validado/client gerado; bloco clínico com build completo aprovado; cenário integrado clínico/benefícios/manifesto/Frotas aprovado no banco isolado e em PostgreSQL descartável com conexões reais. **22 testes de regressão de Frotas aprovados** e lint aprovado. O cenário inclui glosa/revisão, PDF de versão anterior, autorização concorrente de benefício, entrega duplicada recusada, cancelamento com transporte ativo recusado, agenda consumida uma vez, bloqueio da guarita por acompanhante ausente e conciliação de saída/retorno com uma utilização de Frotas.

Permanecem em conferência: interface autenticada dos gestores/documentos novos, build após a última ligação à guarita, concessão financeira real do adiantamento e fechamento individual de CR-058–082. Esses itens não foram declarados integralmente aceitos por existir um serviço ou tabela.

### F09 — AIH/APAC e integridade da produção (continuação)

- Migration `20261015220000_health_aih_apac_workflows` aplicada. Há 148 migrations locais após a incorporação da `origin/main`; o status do banco indicava apenas essa migration de Saúde pendente antes da aplicação. Migrations fiscais já aplicadas não foram reexecutadas nem alteradas.
- Órgãos emissores com código/tipo/fonte informados e faixas AIH/APAC com início/fim/validade/referência. Não foram criados órgãos ou números oficiais artificiais. Aritmética de numeração usa BigInt e strings, preservando zeros à esquerda; intervalos sobrepostos são recusados, inclusive entre órgãos. Consumo é exclusivo e não retorna ao saldo no cancelamento.
- Laudos AIH/APAC com paciente, unidade, profissional autenticado, diagnóstico, história, exames, justificativa, período, internação AIH, tipo inicial APAC e vários procedimentos/executores. Conteúdo possui versões imutáveis; atendimento de origem opcional é conferido contra paciente/unidade/profissional. Aprovação, glosa, revisão e arquivo geram eventos.
- Autorização individual/coletiva atômica confere tipo, vigência, saldo, laudo aprovado e ausência de autorização anterior. A próxima numeração exibida é conferida novamente na transação. PDFs próprios: laudo aberto ao salvar e autorização em duas vias com número/órgão/versão/autor/validade. Documento de autorização cancelada não é emitido como ativo.
- Cancelamento AIH pode exigir confirmação de senha por unidade; interface reautentica no Firebase e envia somente ID token, conferido no servidor quanto a identidade e recência. Não há booleano client de confirmação. Teste cobre a recusa sem confirmação quando a política está habilitada; a senha real permanece na conferência manual.
- AIH paga é identificação manual com referência/data/usuário/evento, sem gerar execução financeira paralela. Saída hospitalar por óbito reutiliza a rotina comum de falecimento na mesma transação, atualizando Person/Patient e histórico. APAC vencida origina novo laudo ligado ao anterior, sem herdar número; permanência exige inicial/autorizada/vigente e motivo obrigatório.
- Produção automática deixou de truncar as origens em 2.000 linhas. Captura considera escopo de unidade, competência local brasileira, lotes de gravação e chave única de origem; abertura/captura/processamento/fechamento/reabertura compartilham bloqueio por competência. O teste de 2.001 procedimentos e duas capturas concorrentes gerou exatamente 2.001 fatos.
- Digitação manual tem chave de repetição conferida contra os dados, revisões com before/after/versão/motivo/usuário e página de origem/correção. Produção nova/revisada invalida o processamento anterior. Triagem, atividade coletiva e finalização de ficha e-SUS passaram pelo mesmo guardião de competência fechada; falha desfaz a origem na transação.
- Críticas anteriores ficam como reprocessadas no histórico. A ação de resolução revalida a origem, sem transformar um fato inconsistente em válido apenas por clique. Fechamento exige competência processada e sem críticas abertas; usuário de escopo restrito não fecha a competência global das outras unidades. Arquivos consolidados também não são expostos ao escopo de uma única unidade.

Verificações: build completo pós-merge aprovado; cenário integrado com AIH/APAC, PDFs, cancelamento, óbito, renovação e captura de 2.001 procedimentos aprovado também em PostgreSQL local com conexões reais. A corrida de abertura de competência detectada nesse PostgreSQL foi corrigida com bloqueio explícito e o cenário repetido passou. Lint dos serviços/interfaces novos aprovado. Conferência autenticada ampliada para **22 verificações sem erros JavaScript**, incluindo gestores TFD/AIH/APAC e relatório TFD. A conta administrativa não tinha vínculo clínico para preencher o novo laudo, e a base não tinha processo TFD/laudo AIH/APAC para conferir seus detalhes no navegador; não foram criados registros operacionais para simular essa evidência.

Integração de código solicitada pelo usuário: `main` avançou de `6c67874` para `2a8d454` (`origin/main`, commit tribut8), com o trabalho local guardado e reaplicado sem conflitos. Dependências combinadas e schema/serviços locais preservados. Regressões fiscais de alvarás/ITBI/canal financeiro passaram em PostgreSQL real; histórico imobiliário também passou após fixar o servidor descartável em UTC, coerente com os timestamps Prisma, sem editar migrations fiscais aplicadas.

F09 ainda exige concluir e conferir preços/tabelas com vigência, prévias/custos reconciliados, documentos BPA e RAAS de origem. Os arquivos próprios legados não constituem prova de leiaute ou aceite oficial; F11/F12 continuam reservados à etapa correspondente.

### F09 — preços, prévias, consumo e preparação RAAS (continuação)

- Migration `20261015230000_health_billing_prices` aplicada; **149 migrations** no diretório da instância após o merge. Tabelas de preço e itens têm proteção imutável no PostgreSQL. Publicação do mesmo código cria versão nova; repetição do conteúdo atual recupera a mesma versão. Código concorrente para o mesmo procedimento/unidade/convênio/vigência é recusado, e tabela de convênio exige cobertura de seus itens durante toda a vigência.
- Preços de procedimento usam a tabela específica do convênio, a tabela auxiliar geral da unidade ou o valor da versão do procedimento referenciada na origem. A captura guarda fonte/tabela/versão/item/vigência/valor unitário/quantidade/total; desconhecido permanece nulo e zero é preservado. Produção manual pode declarar valor próprio e guarda essa origem. Nova tabela não reescreve o fato anterior, inclusive ao repetir a chave manual.
- Agendamento fotografa o convênio. Ingresso espontâneo fotografa a prestadora configurada, nome e CNES; captura e impressão utilizam esse contexto em vez de consultar a configuração atual e atribuir retroativamente outro prestador. Regulação conserva preço da cota quando presente. Caminhos anteriores sem snapshot não receberam vínculos inferidos.
- Gestores `/saude/producao/tabelas`, `/previas` e `/fatos/[id]`: pesquisa de procedimentos no catálogo completo, grupo/subgrupo na administração, vários itens/preços, versões, memória de cálculo, origem e revisão manual. Prévia por unidade/profissional/geral considera o recorte inteiro; a paginação visual não limita os totais ou downloads. Produção validada, criticada e pendente de processamento são separadas.
- PDFs de prévia/BPA-C/BPA-I e CSV derivam do mesmo conjunto de fatos, com paciente/CNS/nascimento/sexo/município/CID/procedimento/CBO/profissional/CNES/prestadora quando registrados. Ausências aparecem como não informadas, sem códigos fabricados. Esses documentos de conferência não validam o arquivo magnético ou comprovam aceite oficial de F11/F12.
- Custo físico por paciente deriva de dispensações ativas, administração clínica/materiais, vacinas, distribuição especializada e correlatos de pedidos/kits; referências ao mesmo movimento são deduplicadas. Estorno/devolução são considerados no movimento original. Medicamento próprio não é debitado como custo municipal, mas seus materiais auxiliares são. Diluente compartilhado tem rateio por dose/capacidade do frasco e detalhamento com seis casas. Valores de procedimentos e consumo físico são mostrados separadamente; ausência de custo não vira zero.
- Preparação `CELERIFLOW_RAAS_ORIGINS` versão `1.0.0` é derivada de atendimentos domiciliares realizados e prontuários concluídos de CAPS, com avaliação/solicitação, paciente/unidade/profissional, diagnósticos, procedimentos, datas, desfecho e críticas. Um episódio exige registro de origem identificado; nenhum atendimento individual foi estimado a partir de totais. Gestor `/saude/producao/raas` e download JSON próprios; codificação/elegibilidade/leiaute oficial RAAS continuam em F11.

Verificação desse bloco: **build completo aprovado**, incluindo quatro partições e produção; **110 testes aprovados** no conjunto de Saúde, Patrimônio, Frotas e regressões de Tributação/Proxy pós-merge. O cenário integrado foi executado em PostgreSQL real descartável, incluindo tentativa de sobrescrever tabela/item bloqueada pelo trigger, memória de preço após nova versão, repetição manual com preço antigo preservado, convênio sem cobertura recusado, prestadora histórica preservada e origens RAAS com escopo/críticas.

Conferência autenticada ampliada para **26 verificações aprovadas, zero erros JavaScript**, incluindo filtros grupo/subgrupo, formulário de preços com vários itens, prévia por profissional, PDF BPA consolidado e JSON RAAS. Sem gravação de pacientes, laudos, preços, doses, atendimento, estoque ou transmissão externa durante a navegação; emissão documental gera a auditoria normal.

F09 possui agora essas capacidades internas. O aceite normativo ainda depende da reconciliação dos caminhos legados de cobertura/execução, conferência individual dos documentos com dados completos e cargas/validação oficiais nas fases próprias. Não transformar classificações P/E em conformidade integral apenas por concluir o desenvolvimento interno.
