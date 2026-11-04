# Revisão literal — CF09, CF12, CF16, CF17, CF19, CF20, CF25 e CF26

## Escopo e método

Planilha original: [CAMPO FLORIDO — Checklist](https://docs.google.com/spreadsheets/d/1cn_ZKWtTJX-DkNYaAjrFzYxxEqeAnuevQnemhrxcsEQ/edit#gid=1023759409), aba `Checklist`.

Código inspecionado: `64a2b3bd6e2c8b708ee66edd6ebce180e8cba3d1`.

Foram confrontados texto do requisito, serviço/repositório, consumidor e interface acessível no código. Cadastro isolado, botão sem ação, relatório genérico e documentação de entrega não comprovam uma cláusula operacional ausente. O resultado é binário; uma parte necessária ausente resulta em **NÃO ATENDE**. Não foram acrescentadas condições de homologação/transmissão a requisitos que pedem somente cadastro, geração ou consulta.

Esta rodada é uma **inspeção de código**, sem aceite visual ou navegação funcional executados. O usuário conserva o aceite visual/navegação e os acessos individuais do Portal.

## Política aplicada exclusivamente aos oito módulos

- **ATENDE:** coluna C marcada, E `Thiago`, F `Implementado`.
- **NÃO ATENDE:** C desmarcada, E e F vazias, disponíveis para outro responsável.
- Todos os 37 itens de Eduardo foram preservados integralmente.
- Coluna G recebe resultado, evidência e lacuna por requisito, preservando observações anteriores.
- Os planos de edição das revisões anteriores não são reaplicados.

## Resultado

| Módulo | Total | Eduardo preservado | Avaliados | ATENDE | NÃO ATENDE |
| --- | ---: | ---: | ---: | ---: | ---: |
| CF09 — Portal do Cidadão / ISSQN | 122 | 1 | 121 | 33 | 88 |
| CF12 — Compras / Requisição de materiais | 126 | 18 | 108 | 28 | 80 |
| CF16 — Contratos | 35 | 5 | 30 | 9 | 21 |
| CF17 — Transparência / Acesso à Informação | 32 | 4 | 28 | 22 | 6 |
| CF19 — Protocolo / Processos | 118 | 5 | 113 | 55 | 58 |
| CF20 — Ponto Eletrônico | 24 | 2 | 22 | 9 | 13 |
| CF25 — Educação | 244 | 2 | 242 | 39 | 203 |
| CF26 — Arrecadação Online Service | 7 | 0 | 7 | 0 | 7 |
| **Total** | **708** | **37** | **671** | **195** | **476** |

Os totais ATENDE/NÃO ATENDE referem-se somente aos 671 itens livres. Os itens de Eduardo não foram reavaliados nem incluídos nesses dois totais.

## Principais evidências e lacunas

### CF09

- Consultas próprias de declarações bancárias, tomadas, diversas e de cartório têm filtros, vínculo fiscal e autorização: `src/db/repositories/portal-content/declarations.ts` e `src/app/portal/tributario/declaracoes/page.tsx`.
- Consulta pública de autenticidade utiliza código de verificação; autenticação, usuários, recuperação de senha e expiração possuem consumidores reais.
- Emissão/cancelamento e várias operações de RPS/DMS estão concentrados na gestão tributária; a área externa não oferece todos os fluxos exigidos ao declarante. Solicitação de avulsa não equivale à emissão da nota pelo contribuinte.
- Extrato fiscal consultável não implementa a emissão dos relatórios de conta corrente. Não foram comprovados livro fiscal, todos os certificados, declaração de cartões, mensageria fiscal e PIX operacional.

### CF12 e CF16

- Cadastros auxiliares efetivos estão em `src/lib/compras/auxiliary-catalogs.ts`, no repositório correspondente e no consumidor `compras/cadastros`.
- PCA valida compras/recebimentos anteriores; não foi localizada consolidação. Cotações unitárias e propostas globais são imprimíveis, mas não calculam média/mediana.
- Requisições efetivas de estoque estão em `/patrimonio/requisicoes`; a aprovação tem consumidor operacional. Recebimentos não comprovam por si o ciclo completo de liquidação e estorno exigido em compras.
- Transferência de cotas é transacional, inclusive para novo requisitante, com destino inicialmente zerado. Planilhas de obra, impactos, apostilamentos e aditivos têm cadastros acessíveis.
- Contrato exige processo e solicitação aprovada e preserva a secretaria; não atende cadastro sem processo nem atualização irrestrita do órgão gestor.
- Assinaturas de relatórios foram consideradas nos itens que pedem seu cadastro/parametrização. Não foi presumida aplicação automática na emissão.
- O lançamento cadastral de documentos do fornecedor existe; o upload do formulário geral ainda usa URL simulada. A classificação do item 12.9 limita-se ao lançamento exigido, sem afirmar armazenamento efetivo do arquivo.

### CF17

- Fontes, filtros, exportadores, documentos publicados e e-SIC possuem consumidores públicos em `src/lib/transparencia/` e `/portal/portaldatransparencia`.
- Recursos e-SIC alcançam a terceira instância e estatísticas contabilizam recebidos, atendidos e indeferidos.
- Faltam data inicial independente por família, períodos parametrizados por tipo de publicação, cargo/notificação do responsável SIC, classificação de pedidos por idade, agrupamento de pessoal por função programática e identificação própria de gastos COVID.

### CF19

- Abertura, sequência anual concorrente, tramitação, histórico, junção/desmembramento, estrutura e catálogos possuem consumidores em `/protocolos` e `/configuracoes/processos`.
- Pedidos externos geram processo vinculado e permitem histórico, exigências, complementação e comunicação da resposta ao titular. A integração tributária executa operações na origem.
- Upload da ficha aceita PDF/JPG/PNG; a política GED também não inclui XML/CSV. Logo, o item 19.17 não atende ao conjunto integral dos formatos exigidos.
- Impressão de movimentações não inclui suas observações: o item 19.73 não atende, embora o relatório de movimentações do item 19.81 exista.
- Não foi localizada consulta CEP com autopreenchimento no cadastro do requerente; consumidores de instituição e almoxarifado não foram usados como evidência desse fluxo.
- Catálogos de subassuntos/documentos/justificativas não comprovam sua integração integral com abertura, workflow e Portal. Também faltam remessas tipificadas e exportações CSV/HTML nos conjuntos exigidos.

### CF20

- Cadastros FERIADO/EQUIPE/FAIXA/ESCALA e relatórios efetivos de frequência/calendário estão ligados às fontes de RH.
- Upload de CSV usa temporizador/alerta, sem parsing e persistência do relógio. Lançamento manual não exige histórico de justificativa. Não foram comprovados geração automática de escala, editor de leiaute e vários relatórios especializados.

### CF25

- Cadastros compartilhados, alunos, matrícula, saída, vínculo docente, notas, presença e documentos possuem consumidores reais em `/educacao`.
- Falecimento/abandono guardam data/situação e inabilitam marcações posteriores no diário. Matrícula confere vaga e vínculo ativo duplicado.
- A chamada envia apenas presença/ausência; parâmetros de justificativa aceitos pelo serviço não são enviados pela grade. O item 25.69 permanece não atendido.
- Avaliações têm teto fixo de 100 pontos; não consomem máximo configurado por etapa. O item 25.57 permanece não atendido.
- A matriz curricular grava somente o primeiro componente; não foi localizada ação para compor as demais disciplinas. Calendário é uma listagem com botão de novo evento sem ação demonstrada.
- Documentos genéricos e CSV básicos não substituem os relatórios específicos, apurações finais, políticas de recuperação, diário completo e modelos configuráveis exigidos.
- Importação simplificada de registros não corresponde ao leiaute oficial integral do Educacenso. Cadastro de cargos não demonstra vínculo CBO para as funções escolares.

### CF26

Não foi localizado adaptador de arrecadação online FEBRABAN com os métodos exigidos: `consultarDebitoIPTUOp`, `consultarDebitoISSOp`, `consultarDebitoDividaAtivaOp`, `consultarDebitoParcelamentoOp`, `cancelamentoOp` e `confirmacaoOp`. Webhook financeiro genérico e guias internas não atendem a esse contrato. Os sete itens permanecem **NÃO ATENDE**.

## Banco e tabelas visuais

- **Banco:** esta revisão não altera schema, migrações ou registros da aplicação.
- **Tabelas visuais:** inspeção identificou implementações HTML operacionais paralelas em `compras/cadastros/AuxiliaryCatalogClient.tsx` e `educacao/disciplinas/page.tsx`, divergentes do padrão operacional compartilhado. Foram registradas como desvios de interface, sem transformar essa regra interna em exigência adicional dos requisitos licitatórios.
- Não houve medição de viewport nem validação visual dessas telas nesta revisão.

## Rastreabilidade e verificação da planilha

Artefatos locais: `C:\Users\trici\AppData\Local\Temp\opencode\revisao-cf09-cf25\`. O nome da pasta antecede a inclusão do CF26, que está presente no snapshot, matriz, plano e verificação.

- `original.xlsx` / `itens-originais.json`: snapshot dos requisitos e responsáveis.
- `review.cjs`, `conferencia.json`, `matriz.md`: 671 decisões e evidências.
- `antes-edicao-original.xlsx`, `plano-edicao-original.json`: reconciliação e plano de 1.732 alterações de valores em 449 intervalos.
- `apply.cjs`, `aplicacao-original.jsonl`: aplicação no Google Sheets original, com proteção de concorrência.
- `verify.cjs`, `depois-edicao-original.xlsx`, `status-drive.json`, `verificacao-edicao-original.json`: conferência do salvamento, células planejadas, demais conteúdos, fórmulas, estilos, validações, mesclagens e autofiltros nas oito abas.

**Verificação concluída: PASS em `2026-11-04T00:00:13.557Z` (UTC).** O Drive confirmou “Alterações salvas no Drive”. As 1.732 alterações planejadas foram confirmadas; oito abas, 670 fórmulas e os 37 itens de Eduardo foram preservados, sem diferenças inesperadas de conteúdo, estilo, validações ou estrutura.

O acesso de edição utiliza Chrome com perfil próprio e CDP em `127.0.0.1:9337`; não depende do OpenCode Desktop. Os arquivos XLSX são cópias de auditoria, não substituem a planilha original.

## Continuidade RH / E5

Esta revisão não reclassifica RH. Sua referência permanece **206/219**, com as treze lacunas de E5 registradas em `RH_ETAPAS_1_A_4_CONCLUSAO.md`. A ordem de continuidade é **179 → 138 → 135**, usando as fontes oficiais já coletadas e mantendo fornecedores regionais como referências, sem afirmar contratação vigente de Campo Florido.
