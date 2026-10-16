# Frota — itens 03, 07, 20 e 43 e carga da POC

## Entrega para demonstração

As quatro lacunas de demonstração receberam caminhos funcionais:

| Item | Tela | Demonstração |
|---|---|---|
| 03 | `/frotas/gestao?area=debitos` | Licenciamento/seguro/multas reunidos por unidade e departamento, vencimento, situação, parcela/comprovante e saldo da multa. Resumo integral do filtro, custos ausentes separados e emissão. Cumprimento de documento é identificado como administrativo, sem afirmar pagamento bancário. |
| 07 | `/frotas/gestao?area=agenda` | Filtro explícito de departamento, veículo e motorista; listagem mostra departamento, nome do motorista, rota, finalidade e início/fim. Operador setorial continua sem acesso ao outro setor. |
| 20 | `/frotas/gestao?area=infracoes` | Consulta paginada por código/descrição/artigo/natureza/edição, fonte e emissão integral. Carga disponível com **416 enquadramentos**, incluindo dois históricos, a partir das 412 fichas dos sete anexos MBFT e quatro fichas adicionadas em 2024. |
| 43 | `/frotas/gestao?area=relatorios` | Seleção de um ou vários veículos/máquinas, departamento/período/busca/situação; dossiê contém ficha básica ampliada, RENAVAM, marca/modelo/ano, aquisição/patrimônio/responsável, controle operacional, débitos, operações, condutores/CNH, seguros, custos e anexos. Exportações preservam a seleção e o filtro. |

As fontes são as mesmas rotinas canônicas da Frota; não há uma tela de resultado estático simulando confirmação. Datas de movimentos com horário utilizam o recorte de Brasília, e datas de calendário mantêm sua representação sem deslocamento de dia.

## Catálogo CTB

- `data/frotas/ctb-mbft.json`: catálogo gerado, versionável, pronto para carga.
- `scripts/fetch-fleet-ctb.mjs`: baixa os sete ZIPs oficiais, extrai os campos das fichas, verifica que cada arquivo foi processado e registra URL/hash/arquivo/página.
- `data/frotas/ctb-alteracoes-conferidas.json`: campos essenciais de 12 fichas das alterações em PDF/imagem conferidos visualmente, com documento/página. O importador acrescenta o hash do PDF baixado.
- Fontes das alterações: 1003/2023, 1009/2024, 1012/2024, 1013/2024, 1022/2026 e 1023/2026. Fichas antigas 764-10/765-00 ficam históricas; não são oferecidas como vigentes para uma ocorrência posterior ao término.
- Corte da edição: **13/10/2026**. A alteração das fichas pela Resolução 1031/2026 entra em vigor posteriormente ao corte e não é antecipada nesta carga.
- Infrações de penalidade variável mantêm valor de referência nulo, exibido como variável; não são convertidas em custo conhecido zero.

A edição é identificada por fonte e data. Para outra data da POC, conferir alterações posteriores e publicar nova versão. Não se trata de uma integração de autuação ou remessa ao Detran.

## Script de carga

### Prévia, sem gravação

```powershell
npm run seed:frotas:poc
```

### Popular o ambiente configurado

```powershell
npm run seed:frotas:poc -- --apply
```

Selecionar um administrador existente, se necessário:

```powershell
npm run seed:frotas:poc -- --apply --actor-email=SEU_EMAIL_ADMINISTRADOR
```

Utiliza `.env.local`/variáveis do ambiente para banco, Blob privado e instância. Os PDFs fictícios são armazenados de verdade, passam pelo GED e ficam disponíveis como evidência/para download. A prévia e a carga isolada foram executadas nesta entrega; **não foi executado `--apply` no banco compartilhado**.

Os JSONs dos catálogos já acompanham a entrega. Para obter novamente as fontes:

```powershell
npm run frotas:ctb:fetch
npm run frotas:fipe:fetch
```

A segunda rotina consulta a API pública FIPE Parallelum e mantém **48 modelos Hyundai HB20S** como amostra identificada, incluindo o modelo Comfort Plus Turbo vinculado ao veículo. Não inventa código FIPE e não declara a amostra como tabela integral.

### Dados criados

| Unidade | Placa | RENAVAM | Cenário |
|---|---|---|---|
| Hyundai HB20S Comfort Plus 1.0 Turbo | BRA2E19 | 011000111 | Ficha completa, FIPE, consumo normal, débitos/multa/sinistro |
| Chevrolet Onix Plus LT 1.0 Turbo | RTA4J62 | 01304567182 | Consumo alto e motorista com 20 pontos |
| Fiat Cronos Drive 1.3 Firefly | QXR8B35 | 01401327841 | Consumo baixo |
| Toyota Hilux CD SR 2.8 Diesel 4x4 | RHE5D84 | 01290876543 | Estoque próprio, manutenção própria e avaria |
| Mercedes-Benz Sprinter 416 CDI Ambulância | RUF3H27 | 01300874562 | Repartição da Saúde e gastos em diesel |
| JCB 3CX Eco Retroescavadeira | Não aplicável | Não aplicável | Horímetro e campos de maquinário |
| Massey Ferguson 4275 Trator Agrícola | Não aplicável | Não aplicável | Máquina sem marcador |
| Stemac 75 kVA Grupo Gerador | Não aplicável | Não aplicável | Equipamento e gasto de período anterior |
| Randon Reboque Agrícola 6 Toneladas | Não aplicável | Não aplicável | Agregado vinculado à unidade principal |

Além das unidades, cria as dependências e cenários relacionados da Frota:

- três departamentos/centros e bens patrimoniais;
- sete pessoas e seis condutores canônicos (RH, terceirizado, CNH vencida, 20 pontos e servidor sem CNH);
- operadores Marcos André Ribeiro, Roberto Carlos Nogueira e Ana Paula Ferreira, vinculados ao RH e a perfil setorial de Frota;
- posto Serra Clara, Horizonte Auto Center e Veredas Seguros, com identificadores fictícios;
- processos de pregão/dispensa, contratos, itens de combustível, saldos, cotas e estoque próprio em litros;
- autorizações/consumos/gastos, uma autorização externa pendente para a apresentação do frentista;
- rotas fixas/destinos, agendas de viagem/serviço/conserto/obrigação e saídas/retornos com histórico;
- pneus Pirelli e baterias Moura identificados, com substituições na mesma posição e gasto automático;
- AS própria/terceirizada, relatório externo de oficina, conferência, execução, plano preventivo e OS prevista;
- seguros facultativos, exemplo histórico demonstrativo de seguro obrigatório (sem declarar exigência vigente), licenciamento vencido/pendente/cumprido administrativamente, multas, parcela com comprovante;
- avaria e acidente com coordenadas, sinistro, apólice automática, oficina e duas partes;
- documentos PDF fictícios privados/GED/hash, registros de confirmação, sequências e auditoria.

Isso cobre as tabelas funcionais de Frota e dependências utilizadas nos cenários, não popula indiscriminadamente outros módulos ou tabelas técnicas de cache/limitação de tentativas. Não gera lançamentos tributários, pagamentos bancários ou atos legais reais.

### Reexecução

IDs de dependências usam o namespace `poc-frota-v1`; operações usam chaves estáveis de confirmação. A data-base fica registrada na primeira unidade. A carga foi executada **duas vezes no mesmo banco isolado**, preservando quantidade de gastos, viagens, anexos e eventos.

Não limpa tabelas e não reseta saldos já movimentados. Dados que passaram pelas rotinas continuam com histórico. Reexecutar com o mesmo administrador e os mesmos catálogos; nova edição de fonte deve ser importada com nova chave/versão, não sobrescrita sobre a confirmação anterior.

As contas operadoras não recebem senha local nem alteram credenciais existentes. Para login desses operadores na apresentação, usar o vínculo Firebase da rotina de usuários. O administrador existente já pode apresentar os quatro itens.

Na primeira carga, o resultado imprime a credencial da autorização externa pendente. Na recuperação dessa autorização, a credencial não é repetida pelo ledger: reemitir pela tela quando necessário.

## Roteiro dos quatro checks

1. **03:** selecionar HB20S em Débitos. Mostrar licenciamento vencido, seguro e multa de R$ 195,23 com parcela R$ 95,23/saldo R$ 100,00. Imprimir o filtro. Comparar com o licenciamento da Hilux cumprido administrativamente.
2. **07:** escolher Administração; mostrar Marcos André Ribeiro e a agenda administrativa. Mudar para Obras; mostrar Roberto, máquinas e demais tipos de agenda. Repetir com operador setorial para mostrar isolamento.
3. **20:** abrir Tabela de infrações CTB, mostrar edição/quantidade/fontes, pesquisar 518-51 e 779-00 e filtrar natureza. Emitir lista integral, além da primeira página da consulta.
4. **43:** selecionar somente HB20S e retroescavadeira; emitir PDF. Conferir RENAVAM/placa/ficha/CNH/seguro/multa e informações da JCB; Onix deve ficar fora. Repetir com departamento/período.

## Verificação

- Suíte original: 18 testes aprovados.
- Novo controle: 3 testes aprovados, incluindo a carga/reexecução e os quatro itens com isolamento setorial, saldo, catálogo integral, PDF multiveículo, médias alto/normal/baixo e baixa de estoque própria.
- `npm run build`: aprovado.
- Prévia do script: aprovada, sem gravação no banco configurado.
- Login autenticado/UI e downloads Blob no ambiente de apresentação devem ser ensaiados depois da carga; os testes isolados usam armazenamento injetado para os documentos.
