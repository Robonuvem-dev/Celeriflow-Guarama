# Frota — execução e evidências do checklist 66–70

> **Atualização após revisão da main:** integrado `a4de0df`, preservando Frota. Conferência posterior do banco compartilhado encontrou 104 migrations aplicadas, incluindo Frota, com checksums coincidentes e sem pendências; o deploy de Frota ocorreu externamente durante a sessão. O build e a tipagem fria agora passam com quatro processos no limite de 6 GB. Os bloqueios de histórico/memória descritos abaixo são o registro anterior, superado pela revisão documentada em `REVISAO_MIGRATIONS_MAIN_VERCEL_20261013.md`. As pendências funcionais/aceite da matriz continuam válidas.

Registro de continuação em 13/10/2026. Referência: os 50 itens do PDF indicado em `ANALISE_FROTA_DUDU_CHECKLIST_IBEMA_20261013.md`. A matriz da análise descreve a main **antes** deste pacote; não representa seu estado posterior.

## Situação

Pacote local implementado sobre os IDs e fluxos canônicos existentes, com migration aditiva `20261014010000_complete_fleet_checklist`. Ainda não aplicado ao banco compartilhado. Esta matriz descreve capacidades no código e evidências locais, não homologação dos 50 itens.

### Correções desta continuação

- Consulta de utilização respeita marcador histórico: km, h ou não aplicável, inclusive leitura inicial zero e identidade canônica do condutor.
- OS com autorização não pode ser concluída pelo caminho antigo: exige execução pela autorização e conferência de oficina quando terceirizada. A UI informa a rotina correta.
- Oficina: submissão externa repetida gera um relatório; outro setor não confere; custo divergente não conclui; execução repetida não duplica gasto.
- Edição de condutor acompanha a repartição atual do RH após transferência; ID inexistente não cria silenciosamente outro cadastro.
- Consultas novas: destinos, modelos FIPE, tipos de máquina e saldo contratado/reservado/consumido/disponível. Saldos exigem leitura de Compras e escopo da secretaria.
- Autorizações de serviço expõem os relatórios de oficina e seus IDs para conferência.
- Link de relatório preserva busca, situação, motorista e período do filtro.
- Retirada de anexo e auditoria são atômicas; repetição não gera nova retirada.
- API de relatório responde erro genérico para falhas inesperadas, sem expor detalhes Prisma ao cliente.

## Matriz dos 50 itens

**Código:** capacidade implementada e localizada, ainda sem aceite UI completo por item. **Teste:** cenário automatizado executado; não equivale a POC oficial. **Parcial:** dependência/lacuna ainda aberta.

| Item | Capacidade/evidência local | Estado/limite |
|---:|---|---|
| 01 | Ficha complementar `FleetUnitControl`, aquisição patrimonial preservada | Código; demonstração do cadastro completo pendente |
| 02 | Ocorrência tipificada, avaria, coordenadas e evidência | Código; ocorrência/sinistro testados |
| 03 | Documentos/obrigações, multa e parcelas | Parcial: consolidar consulta de débitos e previsão/pagamento |
| 04 | Componente BATERIA e ciclo de instalação/retirada/troca | Código; teste de instalação usa PNEU, cenário BATERIA dedicado pendente |
| 05 | Autorização de combustível com reserva | Teste contratual concorrente entre veículos |
| 06 | Autorizações de combustível e OS de serviço | Teste dos dois fluxos |
| 07 | Agenda com trava de unidade e motorista | Teste de mesmo motorista em dois veículos |
| 08 | Saída/retorno, guarita e utilização canônica única | Teste de retorno/replay |
| 09 | Despesa canônica de quatro categorias | Suíte original e novos gastos testados |
| 10 | Patrimônio e manutenção compartilhada | Testes DEP-03 e DEP-04 preservados |
| 11 | Upload direto privado, extensões, GED/hash/retirada | Parcial: operação Blob real de 20 MB e UI por proprietário pendentes |
| 12 | Formulário de abastecimento em branco e autorização cadastrada | Código; branco não escreve no banco, testado |
| 13 | Numeração AA/AS, validade, cancelamento e credencial | Código; confirmação/replay testados; ampliar cancelamento/reemissão |
| 14 | Execução de serviço apropria gasto único | Teste oficina → conferência → execução |
| 15 | Compra/contrato reais ligados à autorização e gasto | Código; combustível contratual testado; variantes de dispensa/ordem pendentes |
| 16 | Pneus: posição, instalação/troca e gasto | Teste instalação/replay; ampliar troca/estoque |
| 17 | Manutenção própria ou oficina externa e OS avulsa | Oficina testada; cenário próprio dedicado pendente |
| 18 | Modelo FIPE publicado e conciliação com marca/modelo de origem | Parcial: catálogo oficial não carregado |
| 19 | Seguros/licenciamento/obrigações e histórico | Suíte original; ampliar integração à agenda |
| 20 | Importação CTB com fonte, versão, vigência e hash | Parcial: tabela CTB completa oficial não carregada |
| 21 | Multa com CTB, cidade, condutor e vencimento | Teste sintético CTB/multa |
| 22 | Consulta de multas/parcelas/saldo | Código e testes de isolamento |
| 23 | Parcelas com GED, replay, estorno e limite | Teste; ampliar pagamento concorrente real |
| 24 | Partida/chegada e planilhas em branco/preenchidas | Teste retorno; emissão localizada |
| 25 | Agenda VIAGEM/SERVICO/CONSERTO/OBRIGACAO | Parcial: vínculo uniforme à manutenção/obrigações reais |
| 26 | Rotas em veículos/máquinas e rota fixa | Código; máquina com horímetro testada, rota fixa dedicada pendente |
| 27 | Planos/OS/documentos previstos e executados no dossiê | Código; consolidação de taxas/débitos ainda parcial |
| 28 | Consulta de movimentos e eventos únicos de guarita | Teste com duas entradas de histórico por viagem |
| 29 | Seguro facultativo e snapshot de apólice | Teste de apólice em sinistro |
| 30 | Condutor obrigatório e elegibilidade CNH nas utilizações | Código nos caminhos novo/legado; ampliar ausente/vencida em todos os canais |
| 31 | Pessoa/RH canônicos, CNH e terceirizado | Teste RH/identidade e transferência; portal terceirizado real pendente |
| 32 | Pontos por janela, limite e referência de política | Teste bloqueio/cancelamento de multa; não declara regra universal |
| 33 | Hodômetro, horímetro e sem marcador | Teste zero, máquina 2 h e máquina sem leitura |
| 34 | Tipo de máquina, campos tipados e obrigatoriedade | Teste campo numérico obrigatório e consulta/editor |
| 35 | Escopo por repartição em leituras/ações/relatórios | Testes de outro setor e mudança RH |
| 36 | Posto externo com código+CNPJ+token limitado à autorização | Teste execução/repetição e bloqueio pós-execução |
| 37 | Destinos canônicos por repartição e consulta | Teste 23 registros, paginação, consulta integral e outro setor |
| 38 | Agenda de períodos e tipos de obrigação | Parcial: vínculo completo às obrigações e manutenção reais |
| 39 | Saldo com contrato/item/posto/evidência e reservas | Teste 100 L, tentativa concorrente 80 L, consumo 30 L e saldo 70 L |
| 40 | Estoque canônico e origem de consumo/gasto | Suíte original DEP-04; autorização própria dedicada pendente |
| 41 | Consulta de modelos FIPE com fonte/versão | Teste consulta sintética marcada parcial; fonte real pendente |
| 42 | Grupos setor/período/unidade/fornecedor, Decimal e desconhecidos | Código; ampliar teste dedicado dos agrupamentos |
| 43 | Dossiê com novas rotinas, utilização/documentos/planos/OS/gastos | Teste dossiê/isolamento; demonstração multiunidade e renderizações pendente |
| 44 | Média e classificação por marcador/tolerância | Testes puros km/L, L/h, zero e não calculável |
| 45 | Coordenadas finitas e par validado | Teste ocorrência com coordenadas |
| 46 | Sinistro único a partir da ocorrência | Teste criação de sinistro |
| 47 | Responsabilidade própria/terceiros/outros | Código; teste TERCEIROS |
| 48 | Apólice vigente e snapshot automático | Teste seleção de apólice; ampliar ambiguidade/múltiplas |
| 49 | Oficina credenciada ligada ao encaminhamento | Código; ciclo de encaminhamento dedicado pendente |
| 50 | Array validado de veículo/proprietário/condutor | Código; ampliar demonstração UI de múltiplas partes |

## Verificações executadas

- `npm run test:frotas`: **18 aprovados**, zero falhas, após ajustes nesta continuação.
- `node --conditions=react-server --import tsx --test tests/fleet-control-checklist.test.ts`: **2 aprovados**, sendo um teste integrado agregado com histórico completo de migrations em PostgreSQL/PGlite isolado. Inclui oficina, marcador/maquinário, fontes sintéticas, saldo, destinos além da primeira página e transferência RH. O título “50 itens” do teste não significa 50 homologações.
- ESLint direcionado com `--max-warnings=0`: aprovado.
- TypeScript completo com heap local 8192 MB: aprovado; memória reportada cerca de **6,9 GB**.
- `npm run build`: aprovado na repetição usando cache de tipagem validado; compilação Next e geração das 84 páginas concluídas.
- **Build frio ainda bloqueado:** TypeScript com limite 6144 MB excedeu heap, inclusive com incremental desabilitado. Não alterado o limite do deploy. O build incremental aprovado não comprova que um deploy sem cache passará.
- Smoke HTTP do build de produção, sem sessão: `/portal/frota/atendimento` 200; motorista 307 para login cidadão; gestão no host `app.localhost` 307 para login ERP preservando returnTo; APIs de relatório/anexos/referências 401. Não certifica UI autenticada/mobile ou operação Blob real.

## Banco compartilhado e atualização remota

`npx prisma migrate status` identificou Frota pendente e nove migrations presentes no banco, ausentes no histórico local:

1. `20261014100000_control_final_reports`
2. `20261014110000_tax_annual_batches`
3. `20261014120000_hr_role_legal_history`
4. `20261014130000_material_subcategories`
5. `20261014140000_process_judicial_cases`
6. `20261014150000_personnel_fiscal_definitions`
7. `20261014160000_stock_valuation`
8. `20261014170000_account_classification_snapshot`
9. `20261014180000_municipal_activity_relation_integrity`

`git fetch origin main` localizou o commit novo **945eb18 (`tribut9`)** com essas ampliações. O diff alcança 134 arquivos e também `prisma/schema.prisma` e `src/lib/frotas/service.ts`. A main local permanece na base anterior; não houve integração desse commit durante esta continuação. Reconciliar a atualização e seus consumidores de estoque/custos antes de aplicar Frota. Não executar reset ou remover migrations do banco.

## Próximos passos necessários

1. Incorporar a atualização da main preservando o pacote local de Frota; revisar schema, service e mudanças de estoque/custos, e repetir validações após integração.
2. Resolver o consumo de memória da checagem fria sem simplesmente elevar o heap do deploy de 8 GB.
3. Fechar os cenários ainda parciais indicados na matriz, especialmente agenda/obrigações, combustível próprio, anexos reais, pagamentos concorrentes e UI autenticada/mobile.
4. Carregar catálogos FIPE/CTB oficiais com fonte e vigência conferidas, mantendo amostras explicitamente parciais.
5. Com histórico reconciliado, build frio aprovado e fluxos validados, aplicar somente a migration aditiva e executar demonstração de aceite item por item.
