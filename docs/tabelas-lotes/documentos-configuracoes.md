# Lote `documentos-configuracoes`

Atualizado em 29/10/2026 após disponibilização da base comum e autorização para migrar também o Atendimento legado e concluir a paginação das auditorias.

Referências lidas: `AGENTS.md`, contrato de execução, padrão de tabelas, plano/inventário e guias instalados do Next 16.4.3 `05-server-and-client-components.md`, `03-layouts-and-pages.md` e `06-fetching-data.md`. Ferramentas independentes foram executadas em paralelo; arquivos foram analisados e migrados individualmente, sem substituição em massa.

## Resultado atual

- **11 estruturas implementadas**: 10 estruturas com rota do inventário (Documentos 3, Configurações 4, Atendimento 2, Auditoria 1) e **Atendimento legado 1**.
- Todas usam `OperationalTable` e `OperationalListFrame`, com **20 registros por página**; o legado usa também `OperationalTablePanel`, com provider contextual fornecido pela base.
- As duas auditorias agora têm **total filtrado real, intervalo e primeira/anterior/próxima/última/salto**, usando consultas locais de contagem e offset. A API compartilhada por cursor permanece intacta.
- **ESLint e TypeScript direcionados: aprovados nos 17 arquivos próprios de código.** Não são build nem homologação visual.
- Mínimos horizontais das 11 tabelas entre **520 e 880 px**, todos inferiores a **1224 px**; encaixe matemático na largura de 1224 px verificado com o algoritmo comum. A política atual da base permite rolagem em tablet/celular, conforme autorização posterior do usuário.
- **Nenhuma estrutura deste lote permanece bloqueada por ausência de API ou paginação por cursor.** Integração global e homologação autenticada/visual não foram executadas nesta rodada.

## Cobertura

Caminhos relativos a `src/app/app-domain/`. “Implementada” descreve código e verificação estática; não significa homologação visual.

| Arquivo / estrutura | Rota | Colunas | Origem, paginação e comportamentos preservados | Situação |
|---|---|---|---|---|
| `documentos/ged/GEDClient.tsx`; composição em `ged/page.tsx` | `/documentos/ged`, `?folderId=…`, `?view=recentes` | Nome, tipo, status, adicionado em, ações | Mesmos `listGedDocuments`, pastas, classes e signatários; filtro antes do recorte cliente de 20. Upload, nova pasta, exclusões confirmadas, visualização/download e seleção de signatários mantidos. Raiz, recentes, pai e contagens em sobreposições/seletores; menu documental em portal da UI. Busca reinicia ao trocar pasta/visão. | Implementada; ESLint e tipos aprovados |
| `documentos/modelos/ModelosClient.tsx` | `/documentos/modelos` | Nome do modelo, notas/descrição, status, atualizado em, ações | `listDocumentModels`; busca no conjunto completo antes do recorte cliente de 20. Novo, inputs de edição em linha por `cells`, salvar/cancelar, ativar/inativar e excluir com confirmação. Estado não salvo mantido no componente pai. | Implementada; ESLint e tipos aprovados |
| `documentos/assinaturas/AssinaturasClient.tsx`; composição em `assinaturas/page.tsx` | `/documentos/assinaturas` | Documento, tipo, data de envio, status, ações | `listPendingDocumentSignatures` do usuário; busca e recorte cliente de 20. Seleção, senha Firebase, reautenticação, token e `{ error }` preservados. Vazio mantém tabela/rodapé. | Implementada; ESLint e tipos aprovados |
| `configuracoes/perfis/PerfisClient.tsx` | `/configuracoes/perfis` | Nome do perfil, descrição, cobertura de módulos, status, ações | Mesmos dados do servidor; busca antes do recorte cliente de 20. `capabilities`, proteção de `SYSTEM_ADMINISTRATOR`, matriz, presets, rascunhos, serialização, status clicável e ações mantidos. | Implementada; ESLint e tipos aprovados |
| `configuracoes/usuarios/components/UsuariosClient.tsx` | `/configuracoes/usuarios` | Nome, e-mail, perfil, unidade/setor, status, ações | Mesmos dados do servidor; busca nome/e-mail antes do recorte cliente de 20. Novo condicionado a perfis disponíveis; edição, status, exclusão confirmada, perfil e vínculo funcional mantidos. Sem ocultar unidade/setor. | Implementada; ESLint e tipos aprovados |
| Tabela de `configuracoes/processos/page.tsx` transferida para `processos/etapas/page.tsx` | `/configuracoes/processos/etapas?q=…&page=…` | Tipo de processo, assunto, ordem, etapa, setor, SLA, ações | Mesmo `readProcessConfiguration`; filtro antes do recorte de 20; links com `q`, intervalo, primeira/anterior/próxima/última/salto. Formulários continuam em `/configuracoes/processos`; link transporta `q/page` e consulta oferece retorno. Mesma action de exclusão `Promise<void>`; revalidação da subrota adicionada às quatro actions que afetam seus dados, preservando SQL/assinaturas/retornos. | Implementada; ESLint e tipos aprovados |
| `configuracoes/auditoria/page.tsx` | `/configuracoes/auditoria` | Data/hora, usuário, e-mail, ação, entidade, identificador descrito | Contagem filtrada + consulta local `limit=20/offset`, mesmos joins de identidade/perfil e filtros validados. Indicadores globais de `loadAuditUsageSummary` separados do total filtrado do rodapé. Navegação numerada completa; compatibilidade de URL antiga por contagem real do cursor. | Implementada; ESLint e tipos aprovados; antigo B02 resolvido |
| `atendimento/central/page.tsx` | `/atendimento/central` | Protocolo, solicitante, assunto, canal, abertura, responsável, situação, ações | Contagem filtrada + `listAttendanceTickets(limit=20, offset)`, mesma ordenação `deadline-updated`. Escopo, setor gerencial, busca, status, prioridade, canal, setor, atrasados, prazo, novo e abrir mantidos. `deadline` preservado ao buscar/aplicar filtros e limpável. | Implementada; ESLint e tipos aprovados |
| `atendimento/ouvidoria/OuvidoriaClient.tsx`; composição em `ouvidoria/page.tsx` | `/atendimento/ouvidoria` | Protocolo, tipo, assunto, manifestante, abertura, situação, ações | Mesmo `listOmbudsmanSummaries`; busca/tipo antes do recorte cliente de 20. Redação de identidade permanece no servidor por `canViewOmbudsmanIdentity`; anônimo/restrito não ganha dados no cliente. Novo condicionado a ouvidor; abrir e aviso de privacidade mantidos. | Implementada; ESLint e tipos aprovados |
| `auditoria/page.tsx` | `/auditoria` | Data/hora, usuário, evento, objeto, ID do objeto, tipo bruto do objeto, perfil do ator, ID da evidência | Contagem filtrada + consulta local `limit=20/offset`, mesma ordem decrescente `(createdAt, id)` e joins de identidade/perfil. Mesmos seis filtros e resumo filtrado. Antigo detalhe expansível distribuído em atributos separados, com conteúdo integral; indicadores/distribuições em sobreposição do header. Navegação numerada completa e compatibilidade de cursor. | Implementada; ESLint e tipos aprovados; antigo B02 resolvido |
| `atendimento/AtendimentoClient.tsx` | Legado sem consumidor identificado; painel contextual pronto para reuso | Número, assunto, descrição, canal, solicitante, abertura com data/hora, prioridade, status, ação rápida | `OperationalTablePanel` + listagem de 20. Busca original por número/assunto antes do recorte. Ações Atender/Concluir, indicador Finalizado, mensagens vazias e retornos de `updateTicketStatus` mantidos. Estado de resultados, busca, página e operação pendente fica no pai, sobrevivendo ao fechamento do painel. | **Legado migrado**; ESLint e tipos aprovados |

Não havia exportador de dados nessas estruturas. Download/visualização do GED mantém a URL/proxy existente. As ações continuam recebendo o registro/seleção original, sem limitar operações indevidamente aos itens visíveis. Relatórios e integrações não tabulares mantêm seus próprios fluxos.

## Paginação real das auditorias

A API existente `loadAuditEventPage`/`getAuditEventPage` e seus consumidores externos não foram alterados. As duas páginas acrescentam suas próprias consultas de leitura usando os schemas Drizzle existentes:

1. Autorização original: módulo Auditoria ou administração do sistema, respectivamente, com `context.database ?? db`.
2. `parseAuditEventQuery` e `buildAuditEventWhere` preservam validação e semântica dos seis filtros.
3. `count()` aplica o mesmo `where` e os mesmos joins de identidade/perfil usados na listagem. `/configuracoes/auditoria` não usa seu indicador global como total filtrado.
4. Página válida limitada entre 1 e `ceil(total/20)`; valores inválidos retornam à primeira e páginas além do total são ajustadas à última.
5. Seleção ordenada por `createdAt DESC, id DESC`, `limit(20)` e `offset((page-1)*20)`. `OperationalLinkPagination` recebe página/total reais e preserva todos os filtros.
6. URLs antigas com cursor e sem `page` contam os registros antes do cursor, com desempate por ID e inclusão/exclusão conforme a direção, para localizar uma página numerada. Não há contador acumulado de navegação informado pelo cliente. A página retornada é consultada pelo próprio offset, portanto seu intervalo corresponde ao recorte real. Em limites não alinhados, a URL antiga é localizada na janela numerada correspondente; não se promete reproduzir exatamente o recorte keyset após inserções concorrentes.
7. Não foram adicionados snapshots ou transações de leitura. Como em outras listagens por offset, inserções concorrentes entre a contagem e a leitura podem deslocar a janela; a API keyset original continua disponível aos demais consumidores. Nenhuma operação foi executada no banco nesta verificação.

## Composição e mínimos

Todas as configurações têm chaves estáveis, tipos, largura inicial/mínima, redimensionamento e `details: "overflow"` para os atributos. Controles de ações têm limites próprios; nenhuma coluna de dados foi ocultada. `values` preserva o conteúdo integral e `cells` conserva controles de edição/status. Não foi adicionada ordenação apenas sobre os 20 itens visíveis.

| Tabela | Soma dos mínimos em px |
|---|---:|
| GED | 520 |
| Modelos | 550 |
| Assinaturas | 540 |
| Perfis | 616 |
| Usuários | 587 |
| Etapas de processos | 670 |
| Auditoria de uso | 655 |
| Central de demandas | 745 |
| Ouvidoria | 650 |
| Auditoria de evidências | 880 |
| Atendimento legado | 865 |

Verificação matemática: as 11 configurações, extraídas via AST, foram passadas ao `fitOperationalWidths` comum com 1224 px; todas resultaram em `fits=true`, soma exata de 1224 e nenhuma largura abaixo do mínimo. Isso não é medição visual. O corpo de referência da tabela continua requerendo 21 × 24 = **504 px**, fora toolbar/rodapé. A base atual permite scroll em tablet/celular por autorização posterior; desktop mantém o diagnóstico de área insuficiente, sem reduzir fonte ou recortar campos.

Manifesto: `src/components/app-ui/operational/modules/documentos-configuracoes.ts`, quatro módulos e dez rotas concretas. O legado sem rota não recebe destino fictício. Menus, identidade, destinos e `exact` existentes mantidos. Os layouts do lote são delegadores simples de `ModuleShell`, que reconhece o workspace da base. `/configuracoes/processos` permanece formulário; a tabela única está na subrota, resolvendo o conflito entre formulários extensos e a área operacional.

## Revisão dos bloqueios anteriores

- **B01 resolvido:** `OperationalListFrame`, `OperationalTablePanel`, `cells`, mensagens/caption e hook opcional existem na base; os tipos dos consumidores próprios foram verificados contra essas APIs. Nenhum arquivo compartilhado foi alterado por este lote.
- **B02 resolvido:** páginas das auditorias agora calculam contagem/offset e usam a paginação numerada completa; sem mudança da assinatura do repository compartilhado.
- **C01 resolvido:** consulta de etapas em subrota própria; formulários e rascunhos não são paginados nem ocultados.

## Verificações executadas

1. **ESLint `--max-warnings 0`: aprovado nos 17 arquivos TS/TSX próprios** (16 de domínio e manifesto), incluindo a revisão integral dos arquivos da primeira entrega e `AtendimentoClient.tsx`.
2. **TypeScript direcionado: zero diagnósticos sintáticos/semânticos nos mesmos 17 arquivos**, usando compiler API com opções do projeto, `noEmit=true`, `incremental=false`, sem emitir artefatos nem executar typecheck global/build.
3. **Encaixe matemático em 1224 px: aprovado nas 11 tabelas**, inclusive mínimos, soma final e detalhes de todos os atributos.
4. Busca de `<table`, `ErpTableContainer`, `ErpListFrame` e `ErpCompactListFrame`: **nenhum remanescente nos quatro diretórios do lote**, incluindo Atendimento legado.
5. `git diff --check` limitado aos arquivos/diretórios próprios: aprovado.
6. Contrato e consumidores existentes inspecionados antes da mudança de composição. Nenhuma assinatura de action ou repository foi alterada. `updateTicketStatus` continua decidindo os estados permitidos e retornando seus erros; a migração não contorna as regras de conclusão do chamado.

Os arquivos de código verificados foram: cinco de Documentos (`assinaturas/AssinaturasClient.tsx`, `assinaturas/page.tsx`, `ged/GEDClient.tsx`, `ged/page.tsx`, `modelos/ModelosClient.tsx`); seis de Configurações (`auditoria/page.tsx`, `perfis/PerfisClient.tsx`, `processos/page.tsx`, `processos/etapas/page.tsx`, `processos/actions.ts`, `usuarios/components/UsuariosClient.tsx`); quatro de Atendimento (`AtendimentoClient.tsx`, `central/page.tsx`, `ouvidoria/OuvidoriaClient.tsx`, `ouvidoria/page.tsx`); `auditoria/page.tsx`; e o manifesto.

Não executados: build, typecheck global, consultas/mutações de banco, seed, commit/push ou navegador autenticado. Homologação visual, viewports/zoom, toque/teclado, operações reais, cenário de 21 registros e comportamento sob eventos concorrentes permanecem sem evidência de execução. Os testes estáticos e matemáticos não substituem essa homologação.
