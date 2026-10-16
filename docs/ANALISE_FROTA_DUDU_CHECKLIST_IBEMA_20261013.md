# Frota — comparação da main com Dudu e checklist Ibema

Data: 13/10/2026. Análise solicitada pelo responsável, restrita à Frota. Portal institucional, Autoatendimento e Portal do Servidor atuais são preservados.

## 1. Conclusão

**Compensa reaproveitar seletivamente as ampliações de Frota do Dudu, sobre a base atual. Não compensa substituir o módulo atual nem mesclar sua branch integralmente.**

Nossa base já tem persistência, escopo de setor, controle de edição/repetição, vínculo patrimonial, manutenção preventiva, estoque, despesas e relatórios testados. Dudu acrescenta rotinas pertinentes às lacunas do checklist: autorizações de abastecimento/serviço, motoristas/CNH, agenda, guarita, baterias, multas, seguros tipificados, sinistros, anexos e confirmação externa de posto/oficina.

Entretanto, telas e modelos novos não comprovam atendimento integral. Há problemas concretos de autorização, concorrência, fontes/custos, migrations e integração dos novos fluxos com os antigos. Incorporar por grupos pequenos, com adaptações e teste de ponta a ponta.

## 2. Código localizado no GitHub

- Branch: [`Dudu`](https://github.com/Celeriflow-Hub/Celeriflow-Ibema/tree/Dudu).
- Commit analisado: `b81c155c4aec23caa54ec43521a04e70ee4ca2f8`, de 12/10/2026, `Created Ibema compliance list`.
- Histórico registrado pelo bot `gpt-engineer-app[bot]`; a associação ao parceiro é pelo nome da branch informado pelo responsável, não por autoria pessoal comprovada do commit.
- Não há ancestral Git comum entre a main atual e Dudu. O histórico foi reconstruído/importado independentemente; diferenças também alcançam muitos módulos fora de Frota.
- A consulta de PRs retornou somente um PR antigo de RH, encerrado sem merge; não foi localizado PR Dudu → main.
- O status Vercel do commit Dudu é **failure** em 13/10/2026: [deployment registrado](https://vercel.com/celeriflow-hub/celeriflow-ibema/81AY6Q3oqhgY7ALvTC24UiQZtfeB). A API de deployments filtrada por Dudu não retornou ambiente/URL de Preview. Não foi confirmado um Preview funcional.
- Existe outra branch `codex/modulo-frotas-independente`, de setembro, com a criação original do módulo. Não é o pacote novo identificado na branch Dudu.

## 3. Fonte e interpretação do checklist

Fonte conferida: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas 66–70: **50 itens de Gestão de Frota**. O módulo de Folha começa depois do item 50.

Legenda do estado atual:

- **C:** capacidade aderente identificada no código e, quando indicado, testes; ainda requer demonstração/aceite municipal.
- **P:** cobertura parcial do enunciado.
- **N:** operação específica não localizada na main.

O diagnóstico conservador atual mantém **3 C, 21 P e 26 N**. Isso não é resultado oficial de POC nem percentual de homologação. Os códigos `FRO-*` dos testes anteriores não equivalem automaticamente à numeração 1–50 do checklist real.

## 4. O que manter da nossa Frota

Arquivos: `src/lib/frotas/{contract,service,queries,report,indicators}.ts`, `src/app/app-domain/frotas/`, APIs de referências/patrimônio/emissão, modelos `FleetUnit` até `FleetAssetEvent` e triggers patrimoniais existentes.

- Cadastro das quatro categorias: veículo, máquina, equipamento e agregado.
- Fonte patrimonial única, bloqueios de baixa/inatividade e projeção de setor/responsável/status.
- Validação Zod, `FleetMutation`/requestId, operações transacionais, replay protegido e versões otimistas.
- Escopo por setor em leitura, escrita, referência e relatório.
- Rotas, utilizações, planos periódicos, OS, consumos e gastos com origem e custo desconhecido preservados.
- Estoque canônico e manutenção patrimonial sem apropriação duplicada.
- Relatórios completos do filtro em PDF, XLSX, CSV, TXT e impressão; indicadores pela `FleetExpense`, sem somar novamente os consumos que ela já projeta.
- Integrações consumidoras em Patrimônio, Transporte Escolar, Saúde/TFD e Transparência. Os IDs e contratos utilizados por essas áreas devem ser preservados.

Verificação executada nesta análise: `npm run test:frotas`, **18 testes aprovados, zero falhas**, em banco isolado. Abrange reabertura, quatro categorias, concorrência, setor, manutenção compartilhada, estoque/rollback, despesas, custos desconhecidos e exportação além da primeira página. Não usa o banco de produção.

## 5. Comparação requisito por requisito

Na coluna de aproveitamento, **alto** significa uma boa base para adaptação, não código liberado para copiar sem revisão.

| Item | Requisito | Main | Contribuição Dudu / recomendação |
|---:|---|:---:|---|
| 01 | Cadastro completo, espécie/cor/combustível/tanque/aquisição | P | Alto: campos adicionais e editor. Aquisição de bem vinculado continua vindo de Patrimônio; impedir divergência na cópia local. |
| 02 | Ocorrências e avarias | P | Alto: avaria tipificada, coordenadas e ligação ao sinistro. Completar validação de datas/números e anexos. |
| 03 | Débitos de licenciamento, seguro e multas | P | Médio: multa estruturada e seguros. Consolidar débitos sem confundir previsão, despesa e pagamento. |
| 04 | Bateria, marca e histórico de troca | N | Alto: `FleetBattery` e encerramento da anterior. Trava, idempotência e estoque/origem ainda necessários. |
| 05 | Autorização de abastecimento | N | Alto: `FleetFuelOrder`, cota e confirmação compartilhada. Corrigir reserva de saldo contratual. |
| 06 | Autorização de abastecimento e OS | P | Alto: complementar nossa OS com novas autorizações, sem trocar o fluxo periódico existente. |
| 07 | Agenda por veículo/setor/motorista | N | Alto: `FleetSchedule` e UI. Corrigir concorrência do mesmo motorista em veículos diferentes. |
| 08 | Entrada/saída do pátio e posse | P | Alto: `FleetGateEvent`/`FleetTrip`. Unificar com `FleetUsage`, em vez de manter três históricos independentes. |
| 09 | Gastos de veículos/máquinas/equipamentos | C | Manter a base atual; harmonizar gastos gerados pelas novas rotinas e impedir dupla contagem. |
| 10 | Integração patrimonial sem duplicação | C | Manter as relações/triggers atuais. Os novos campos não devem sobrepor a fonte patrimonial. |
| 11 | Anexos nos 14 formatos | N | Alto: tipos/extensões e escopo por proprietário. Adaptar para upload direto, hash/GED, retenção e recuperação. |
| 12 | Autorização de combustível em branco/preenchida | N | Parcial: impressão localizada de autorização de serviço não encerra os dois modos de abastecimento. |
| 13 | Autorizações de serviço/abastecimento | N | Alto: modelos e estados próprios. Integrar à numeração e ao replay do módulo atual. |
| 14 | Despesa gerada pela autorização de serviço | P | Alto: execução gera gasto vinculado e transação. Validar validade, origem e repetição. |
| 15 | Despesa a partir de ordem/dispensa/licitação | N | Parcial: referências de contratação ainda são textos. Ligar aos registros canônicos de Compras. |
| 16 | Troca de pneus com despesa automática | N | Parcial: cadastro/desgaste de pneu localizado; ciclo de retirada/troca/gasto automático não localizado. |
| 17 | Manutenção própria/terceiros e serviços variados | P | Alto: oficina envia relatório, setor confere, OS compara valor. Completar OS avulsa e peças/óleo/pneus. |
| 18 | Vínculo FIPE de marca/modelo | N | Não encerra: código textual e tabela de modelo, sem lookup/validação de vínculo localizado. |
| 19 | Obrigações de seguro/licenciamento | P | Alto: apólice/vigência adicionais. Separar licenciamento de seguro obrigatório e do financeiro. |
| 20 | Tabela completa CTB | N | Parcial: tabela nova com amostra de **10 infrações** na migration. Exige catálogo completo, fonte/vigência e gestão. |
| 21 | Multa com cidade/CTB/motorista/vencimento | P | Alto: dados estruturados e formulário. Corrigir escopo do motorista e validações. |
| 22 | Consulta de multas | P | Alto: consulta específica. Completar filtros/paginação, incluindo inativos e histórico integral. |
| 23 | Registro de dados de pagamento de multa | N | Alto como base de registro: valor/data/referência. Completar histórico de parcelas, Decimal, replay e comprovante. |
| 24 | Partida/chegada/km e planilhas | P | Alto: viagem aberta/encerramento. Integrar ao histórico atual e implementar planilha em branco e preenchida. |
| 25 | Agenda de viagens/serviços/consertos | P | Alto: tipos de agenda. Unificar reservas com indisponibilidade, utilização e manutenção reais. |
| 26 | Rotas de veículo/máquina e rota fixa | P | Não encerra: nossas rotas permanecem, sem atribuição fixa nova localizada; uso antigo continua restrito a veículo. |
| 27 | Manutenção/taxas previstas e realizadas | P | Alto como consulta: políticas/agenda/manutenção. Consolidar as fontes e os estados corretos. |
| 28 | Guarita e consulta de movimentos | N | Alto: saída/entrada com trava de veículo. Aplicar elegibilidade completa e gerar utilização única. |
| 29 | Seguro facultativo | P | Alto: política tipificada, vigência e apólice. Preservar histórico e fornecedor/seguradora canônicos. |
| 30 | CNH ausente/vencida bloqueia utilização | N | Alto: helpers e bloqueios novos. Aplicar também às rotinas antigas e a todos os canais. |
| 31 | Motorista RH/terceiro e CNH | N | Alto: dados de CNH/terceiro. O vínculo `employeeId` é opcional e cadastro de motorista ainda duplica nome/CPF. |
| 32 | Pontuação da CNH na saída | N | Parcial: pontos e limite 20 existem, mas nem todos os caminhos de saída os verificam. Parametrizar política/fonte temporal. |
| 33 | Hodômetro/horímetro/sem marcador | P | Parcial: três valores existem; viagens/confirmadores ainda exigem leitura e alguns cálculos assumem km. |
| 34 | Campos e obrigatoriedade das máquinas | N | Não encerra: `machineFields` JSON localizado sem editor/validador de obrigatoriedade por máquina. |
| 35 | Privilégios por repartição | C | Preservar o escopo atual e corrigir novos endpoints que confiam no ID submetido sem conferir setor. |
| 36 | Frentista externo confirma autorização | N | Alto: código + CNPJ + token, conferidos na transação, com limite/reuso. Endpoints exclusivos da Frota. |
| 37 | Cadastro de destinos | P | Alto: tabela/consulta de destinos. Completar escopo, edição e vínculo tipado nas rotas/agenda. |
| 38 | Períodos de uso/obrigações pela agenda | N | Alto: agenda, mas falta ligação uniforme às obrigações e aos movimentos reais. |
| 39 | Saldo de combustível proveniente da licitação | N | Parcial: `FleetFuelBalance` referencia contrato. Falta ligar posto/ordem ao contrato correto e reservar autorizações pendentes. |
| 40 | Estoque próprio/terceiros e origem da despesa | P | Manter nossa baixa/vínculo canônicos; integrar autorizações ao estoque e ao financeiro atual. |
| 41 | Consulta de modelos de veículos | P | Não encerra: tabela FIPE sem consulta funcional nova localizada; os dados de cadastro atuais são texto. |
| 42 | Despesas agrupadas por setor/período/veículo/fornecedor | P | Alto como apresentação; aproveitar agrupamentos, preservando Decimal, completos/ desconhecidos e filtros. |
| 43 | Dossiê integral de um/vários veículos | P | Alto como estrutura de seções; corrigir período, totais desconhecidos e inclusão das novas fontes. |
| 44 | Consumo médio e alto/normal/baixo | N | Alto: funções puras e tela. Corrigir zero de marcador, unidade, janela e tolerância consistente/configurada. |
| 45 | Coordenadas na ocorrência | N | Alto: latitude/longitude e link de mapa. Acrescentar validação finita e consistência do par. |
| 46 | Sinistro a partir de ocorrência | N | Alto: referência única da ocorrência. Restringir tipo elegível e preservar alterações. |
| 47 | Responsabilidade própria/terceiro/outros | N | Alto: enum validado. Registrar decisão/histórico. |
| 48 | Apólice/seguradora automáticas no sinistro | N | Alto: snapshot de apólice vigente. Tratar múltiplas apólices/ambiguidade e cadastro canônico. |
| 49 | Oficina de encaminhamento no sinistro | N | Alto como campos: nome/CNPJ. Completar vínculo a fornecedor/oficina e histórico de encaminhamento. |
| 50 | Partes: veículo/proprietário/condutor | N | Alto como modelo: array JSON. A UI atual oferece uma parte; ampliar para múltiplas com validação/histórico. |

## 6. Ajustes concretos antes de aproveitar

### 6.1 Autorizações e concorrência

- `frotas/controle/actions.ts:saveDriverPoints` atualiza por ID, sem conferir setor do motorista.
- `eligibleDriver` usado em agenda/guarita verifica CNH/pontos, mas não o setor nem a categoria do veículo. `registerFine` também altera pontos de `driverId` sem validar sua repartição.
- `createSchedule` trava somente o veículo. Dois veículos podem reservar simultaneamente o mesmo motorista; a checagem de conflito em memória não basta.
- Viagens administrativas e portal do motorista verificam CNH/categoria, mas não utilizam o bloqueio de pontos. O `FleetUsage` antigo não foi integrado à nova validação.
- Autorização de serviço usa `count + 1`: concorrência/retry pode colidir. Instalação de bateria cria novo gasto a cada repetição; pagamento de multa soma fora de transação sem histórico por parcela.
- Emissão de abastecimento lê `FleetFuelBalance` por combustível e saldo consumido, sem reserva dos volumes já autorizados e sem trava do contrato. Uma sondagem isolada mostra duas solicitações de 80 L aceitas pelo helper para saldo 100 L e consumo 0. Vincular contrato/posto/combustível e reservar/liberar saldo na emissão/cancelamento.

### 6.2 Não regredir valores, fontes e relatórios

- `report-dossie.ts` soma `(value || 0)` para custos ausentes e anuncia total geral sem avisar que é parcial. Sondagem com abastecimento de custo desconhecido retorna total de combustível **0**, enquanto nossa base mantém desconhecidos separados.
- O dossiê usa o histórico antigo `FleetUsage`, não as novas viagens `FleetTrip`; não reúne todas as novas fontes do checklist. O carregamento desse ramo não aplica o período às listas.
- `FleetExpense` já projeta consumo/manutenção. Não somar novamente o consumo, ocorrência/multa ou liquidação quando seu custo já foi apropriado.
- Preservar `src/lib/frotas/indicators.ts`: esse arquivo não está no Dudu, embora exista na main e evite dupla contagem.
- Vínculos de compras da autorização ainda são textos (`procurementKind`/`procurementRef`), não validação de dispensa/licitação/ordem.
- Não sobrepor a data de aquisição patrimonial com o campo editável local da ficha complementar.

### 6.3 Banco e arquivos

- O diretório ativo da branch é `prisma/migrations-ibema`, conforme `prisma.config.ts`.
- A migration `20261011200000_frota_termo_referencia` importa boa parte das estruturas e uma amostra CTB; `20261012000000_frota_autorizacao_motorista_destino` complementa a autorização.
- **`FleetFuelBalance`, `FleetFuelOrder.balanceId` e tabelas de histórico SAGRES não foram localizados nas migrations ativas de Ibema.** Foram localizados somente em `migrations-cacimba`. A página de Gestão consulta saldo/contratos e ordens incondicionalmente, portanto esse descompasso deve ser resolvido antes de instalar o pacote.
- Migrar apenas os modelos/colunas necessários, em novas migrations aditivas sobre a main, incluindo FKs/checks/índices. Não copiar baseline nem alterar migrations já aplicadas.
- Anexo de 20 MB atualmente atravessa Server Action e sobe para Blob dentro da transação. Adaptar para upload direto, consumo posterior e limpeza de falha, mantendo hash/versão/GED quando pertinente. A exclusão atual ignora falha de Blob e remove a linha, o que pode deixar órfão.
- Converter valores/quantidades por `Decimal` e tratar as leituras de zero: `averageConsumption` descarta marcador inicial 0; viagens sempre exigem leitura, mesmo para sem marcador.

### 6.4 Portal preservado e tribunal correto

- Excluir do aproveitamento: PortalShell, PortalLoginCard, autenticação/sessão gerais, middleware amplo, Portal do Servidor/RH, Autoatendimento, Transparência e mudanças institucionais do Dudu.
- Se desejado, incorporar somente as superfícies **exclusivas da Frota**: posto, oficina e motorista. O item 36 precisa de operação externa restrita; ela pode usar nossa sessão/políticas e rotas próprias sem substituir o Portal.
- Área pública de transparência da Frota é opcional fora desse checklist de 50 itens; preferir as projeções já existentes em nossa Transparência quando suficiente.
- O pacote SAGRES encontrado é **TCE-PB** (adaptadores PB/ES; transporte sandbox PB). Isso não comprova integração SIM-AM/TCE-PR para Ibema. Não trazer automaticamente no primeiro pacote de Frota.

## 7. Testes e limites da análise

- Main: **18 testes de Frota aprovados**, com fixture PostgreSQL/PGlite independente.
- Dudu: **17 testes puros aprovados** de gestão, regras, token/checklist, CSV e estrutura do dossiê. Foram executados a partir de uma worktree temporária isolada, usando o runner já instalado.
- As sondagens de saldo/zero de marcador/totais desconhecidos são isoladas, sem banco nem credenciais de produção.
- Não foi executado build completo de Dudu nem teste de concorrência PostgreSQL independente da branch: esse teste exige explicitamente `TEST_POSTGRES_URL` em `localhost/.../vette_frota_ci`. Testes puros não substituem as verificações de banco/HTTP/integração.
- Nenhuma migration, seed ou código do parceiro foi aplicado à main/banco nesta análise. Foi criado apenas este relatório no workspace.

## 8. Sequência de aproveitamento recomendada

1. **Base, anexos e condutores:** schema aditivo, referências RH/Patrimônio, escopo, CNH/categoria/pontos configurados e upload protegido. Preservar fontes e os IDs atuais.
2. **Autorizações e abastecimento:** emissão/consulta/impressão vazia e preenchida, posto restrito, saldo contratual reservado, confirmação única e consumo/gasto canônicos. Este é um ganho forte sobre o checklist.
3. **Agenda, viagem e guarita:** identidade do motorista, reservas com travas de veículo/condutor, saída/retorno e uma única utilização real, sem duplicar nossos históricos.
4. **Oficina, pneus, bateria, multas e sinistro:** completar os ciclos e harmonizar gastos, documentos, pagamentos e apólices; reaproveitar formulários/regras existentes do parceiro.
5. **FIPE, CTB, máquinas e dossiê:** completar o que ele só iniciou, ligar catálogos reais/versionados e emitir o recorte completo com fonte/total correto.
6. **Aceite dos 50 itens:** cenário de UI → persistência → reabertura → consulta → emissão → autorização/isolamento por item; build e testes após cada pacote.

Prioridade: ganhos funcionais dos grupos 1–3, depois fechar os ciclos incompletos. O material reduz trabalho de desenho/implementação, mas o retrabalho de integrar tudo indiscriminadamente seria maior que o ganho.
