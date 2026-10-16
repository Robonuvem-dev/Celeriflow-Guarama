# Gestão de Cemitérios — diagnóstico e plano para 100% da POC

**Fonte:** `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, **páginas 192–194 do arquivo PDF**, seção **MÓDULO: GESTÃO DE CEMITÉRIOS**, itens **1–26**. A página 192 começa com o fim do módulo anterior; a página 194 continua com Assistência Social após o item 26. Escopo deste plano: somente Cemitérios. Diagnóstico estático do código local em `main` (`44eee91`); não comprova configuração, dados ou execução em produção.

**Classificação:** **C** = cobertura funcional localizada; **P** = parcial, requer complemento e demonstração; **N** = não encontrada implementação específica. Para a POC, **P conta como NÃO ATENDE** até completar e demonstrar UI, regra de negócio, persistência, consulta e emissão quando exigida. Meta: **26/26** comprováveis; não usar apenas o limiar de aprovação (90% por módulo, isto é, 24/26).

## Base real a preservar

- A rota principal é `/cemiterios` em `src/app/app-domain/cemiterios/{page.tsx,CemiteriosClient.tsx,actions.ts}`; `/tributacao/cemiterios` redireciona para ela. Há comprovante imprimível em `src/app/app-domain/cemiterios/comprovante/[code]/page.tsx`.
- Domínio e persistência **já existem** em `src/lib/tributacao/{s9-service.ts,s9-engine.ts}` e `prisma/schema.prisma`: `TaxCemetery`, `TaxCemeterySector`, `TaxCemeteryEmployee`, `TaxFuneralHome`, `TaxDeathCause`, `CemeteryChapel`, `CemeteryOssuary`, `CemeteryLot`, `CemeteryIdentificationField`, `TaxGrave`, `TaxDeceased`, `CemeteryProcess`, `TaxBurialMovement`, `CemeteryAttachment`, `CemeteryChangeHistory`, `CemeteryFeeRule` e guias/lançamentos tributários. Reutilizar `Taxpayer`/`Person`, GED (`Document`) e motor de taxas; **não criar um segundo cadastro de falecidos ou sepulturas**.
- A tela atual combina muitos formulários e cartões em seis abas. `page.tsx` carrega coleções inteiras até limites fixos (`take: 500`, `300`, `200`) e depois filtra processos **em memória**; isso prejudica consulta, seleção e emissão além do limite. Taxpayers, documentos e históricos também são truncados. A impressão atual é `window.print()` da tela, não um relatório completo do filtro.
- Já há proteção de limite de sepulturas no lote com lock transacional; histórico de criação/ativação/ocupação; bloqueio básico de transferência antes de sepultamento; snapshot de débito do declarante; aplicação de `ESPÓLIO` e `deathDate` ao cadastro único **se o falecido foi vinculado a `deceasedTaxpayerId`**. A maioria dos formulários é de inclusão; não há manutenção campo a campo completa.
- `src/app/api/download/route.ts` autoriza download de `Document` sem vínculos especiais pelo módulo `DOCUMENTOS`; **não identifica `CemeteryAttachment` como autorização para `CEMITERIOS`**. Incluir correção de acesso e caminho de upload/vinculação na entrega de anexos. `actions.ts` é consumido via `await` no client e retorna `{error}`; preservar esse padrão.

## Comparação dos 26 itens

| Página / nº | Requisito resumido | Estado | Evidência e trabalho para completar |
|---|---|---|---|
| 192 / 01 | Integração total ao cadastro único de contribuintes | **P** | Proprietário do lote, capela, declarante e falecido podem apontar para `Taxpayer`; falecido ainda pode ser salvo só por texto e seu vínculo é opcional. Tornar seleção/identificação e sincronização auditáveis para pessoa física identificada; manter fluxo especial para não reclamado/não identificado. Resolver busca sem limite de 500, impedir duplicidades e refletir óbito no cadastro único. |
| 192 / 02 | Cadastro do cemitério: nome, observações, endereço, coveiros | **C** | `TaxCemetery` e `TaxCemeteryEmployee`, cadastro e listagem na aba Estrutura. Melhorar consulta/edição e vínculo de coveiros no novo layout, demonstrar reabertura. |
| 192 / 03 | Capela mortuária: pessoa e responsável | **C** | `CemeteryChapel` guarda `personTaxpayerId` e `responsibleTaxpayerId`; formulário existente. Exibir ambos na ficha/consulta (hoje a lista exibe responsável). |
| 192 / 04 | Funerária: nome e pública/privada | **C** | `TaxFuneralHome.ownershipType` e inclusão existentes; acrescentar consulta/edição padronizadas. |
| 192 / 05 | Ossuário com endereço | **C** | `CemeteryOssuary` registra cemitério, código, endereço, capacidade; formulário e lista existentes. |
| 192 / 06 | Campos configuráveis de lote/sepultura: texto/número | **P** | `CemeteryIdentificationField` e `additionalData` com validação server-side ao criar. Falta gerenciar edição, ativação/inativação, campos já usados e renderização dos valores na ficha; garantir configuração sem intervenção técnica e sem invalidar históricos. |
| 192 / 07 | Causas da morte vinculadas ao sepultamento | **C** | `TaxDeathCause`, `TaxDeceased.causeId`, tela de inclusão e formulário. Exibir/filtrar de modo explícito no processo. |
| 192 / 08 | Lotes livres/ocupados | **C** | `CemeteryLot.status`; `refreshCemeteryLotStatus` acompanha ocupação. Diferenciar lotes com vagas de sepulturas de lote realmente livre; exibir situação e vagas na ficha. |
| 192 / 09 | Anexos em lote/sepultura | **P** | `CemeteryAttachment` liga documento GED existente, com lista de download. Falta upload na própria ficha, descoberta sem `take: 200`, e acesso garantido para papel Cemitérios sem permissão GED geral. |
| 192–193 / 10 | Lote: identificador, cemitério, limite, proprietário | **C** | `createCemeteryLot` exige identificador, `cemeteryId`, limite positivo, proprietário `Taxpayer` ativo; UI seleciona cemitério. Exibir todos na ficha e testar obrigatoriedade. |
| 193 / 11 | Definir fórmulas e gerar taxas automaticamente por evento | **P** | `CemeteryFeeRule` suporta valor fixo ou base × quantidade e `issueCemeteryFee` emite DAM **manualmente** por regra selecionada; o evento digitado é livre e não dispara taxa automaticamente por aquisição de lote/sepultamento/outros. Criar regras vigentes por evento e disparo idempotente vinculado ao fato gerador. |
| 193 / 12 | Histórico de lote/sepultura: hora, campo, antes/depois, usuário | **P** | `CemeteryChangeHistory` registra criação, ativação e ocupação; não há edição geral dos cadastros, nem histórico para cada campo alterado. Ficha deve mostrar data/hora, campo, valores e nome do usuário, sem truncar em 300 globais. |
| 193 / 13 | Sepulturas vinculadas ao lote com limite | **C** | `createGrave` valida lote/cemitério, usa lock e `assertLotCanReceiveGrave`; existe formulário. Testar concorrência, limites e vínculos. |
| 193 / 14 | Informações adicionais sem intervenção técnica | **P** | Configuração e preenchimento no cadastro existem; falta manutenção dos campos e edição/exibição dos valores por lote/sepultura, regras para exclusão/inativação de campos usados. |
| 193 / 15 | Ativar/desativar lotes e sepulturas | **C** | `setCemeteryEntityActive` e botões; sepultura ocupada não pode ser desativada. Validar impacto de lotes desativados em agendamentos e na ficha. |
| 193 / 16 | Lóculo: cemitério e proprietário | **P** | Lóculo representado por `TaxGrave.graveType=GAVETA`, `ownerTaxpayerId` opcional; formulário não oferece opção identificada como “Lóculo” nem exige proprietário. Tornar tipo claro, cemitério/owner obrigatórios para lóculo e incluir consulta própria. |
| 193 / 17 | Agendar/acompanhamento de sepultamento: tipo, óbito, falecido, capela, funerária, causa | **P** | `registerDeceased` cria agendamento e `advanceCemeteryProcess` transita estado, com três tipos; capela/funerária/causa hoje opcionais, seleção de falecido em texto e opção de finalização imediata no agendamento. Tornar fluxo assistido, consistente com não identificado, e exibir campos/estados no acompanhamento. |
| 193 / 18 | Imprimir comprovante do agendamento | **C** | Rota `/cemiterios/comprovante/[code]` consulta processo e renderiza impressão; demonstrar com dados agendados. |
| 193 / 19 | Processo de velório com falecido, funerária, declarante, data do velório/óbito, causa | **P** | `createCemeteryProcess` referencia `TaxDeceased` (óbito/causa), funerária e declarante; formulário permite funerária vazia e não mostra/confirma óbito/causa. Validar conjunto obrigatório server-side, exibir snapshot/valores na ficha e preencher em uma jornada. |
| 194 / 20 | Processo de cremação com falecido, funerária, declarante, data/óbito, causa | **P** | Mesma rotina de velório aceita `CREMACAO` e transita para `CREMADO`; faltam validação/exibição explícitas dos campos exigidos e consistência com sepultamento/transferência prévia. |
| 194 / 21 | Anexos em velório, sepultamento, cremação | **P** | `CemeteryAttachment` aceita os três destinos; depende de `Document` criado em GED, com seleção truncada e autorização de download não específica para Cemitérios. Criar fluxo integrado de upload, vínculo, listagem e abertura. |
| 194 / 22 | Transferências por oito motivos; bloquear se não sepultado | **P** | `registerMovement` cobre `OUTRO_LOTE`, `OSSUARIO`, `EXUMACAO`, `MUDANCA_CIDADE`, `MUDANCA_CEMITERIO`, `DESAPROPRIACAO`, `CREMACAO`, `OUTRO` e bloqueia origem não sepultada. Completar validações destino × motivo, mesmo local, disponibilidade, concorrência/ocupação e trilha; exibir todos em português e comprovar os oito caminhos. |
| 194 / 23 | Consulta única de três processos e estados; filtros por status, falecido, cemitério, funerária, causa, data de óbito e sepultamento | **P** | Consulta única existe, mas filtra sobre **até 500 processos** e por `scheduledAt`/busca genérica; faltam filtros explícitos para causa, intervalo de óbito e data **real** do sepultamento (`performedAt`/movimento). Implementar consulta server-side completa, paginação real e status coerentes. |
| 194 / 24 | Relatório de sepultados: intervalo e funerária | **P** | `window.print()` imprime a tela/lista truncada, filtro temporal atual é de agendamento; criar emissão dedicada de sepultamentos finalizados pela data efetiva, intervalo inclusivo e funerária, independente da página exibida. |
| 194 / 25 | Validar débitos do declarante ao incluir sepultamento | **P** | `declarantDebtSnapshot` verifica `TaxAssessment` e `ActiveDebt`, grava snapshot e exibe aviso; consulta usa `take: 100` em cada origem, verificar filtro/status, duplicidade e visibilidade da validação **antes** da confirmação. A POC pede validar existência, não necessariamente impedir sepultamento. |
| 194 / 26 | Finalização atualiza cadastro único do falecido com “espólio” e data do óbito | **P** | `applyDeceasedRegistryUpdate` é transacional e idempotente se `deceasedTaxpayerId` existir; o vínculo é opcional e a tela permite criar pessoa identificada só por nome. Exigir vínculo para identificado, definir exceção de não reclamado, mostrar antes/depois no cadastro único, inclusive fluxo agendado → finalizado. |

## Layout/arquitetura ERP a implementar

**Referência visual do próprio sistema:** `src/app/app-domain/frotas/layout.tsx`, `FrotasClient.tsx`, `src/components/app-ui/erp/{ModuleShell.tsx,ErpListFrame.tsx,ErpPagination.tsx,ErpPageTitle.tsx}` e `PageFrame`/`PageHeader`. Adotar a linguagem visual existente (navegação lateral, cabeçalho, barra de filtros, tabela com ação “Abrir”, paginação e ficha de detalhes), responsiva, acessível e com estados vazios/carregando/erro; não criar biblioteca visual paralela ou copiar layout de fornecedores. Padrão profissional = operação rápida, legibilidade, densidade controlada, rastreabilidade e dados reais, não apenas aparência.

### Navegação proposta (dentro de `/cemiterios`)

| Grupo | Área | Tabela principal e ações na ficha |
|---|---|---|
| Estrutura | Cemitérios, quadras, capelas, funerárias, coveiros, causas, ossuários | Cadastro/edição/consulta por entidade; capela mostra pessoa e responsável; coveiro vinculado ao cemitério. |
| Ocupação | Lotes, Sepulturas/Lóculos | Lote: cemitério, identificador, proprietário, limite, cadastradas, ocupadas, vagas, status, ativo; ficha com sepulturas, informações extras, anexos, histórico. Sepultura: lote, código, tipo, proprietário, capacidade/ocupação, situação, ações permitidas. |
| Atendimento | Agendamentos, Velórios, Cremações | Tabela unificada ou filtros por tipo; data do evento, óbito, falecido, capela/funerária, declarante, status; ficha com fases, aviso de débito, anexos e comprovante. |
| Movimentação | Transferências/exumações | Origem/destino, motivo, falecido, data, operador; registrar com prévia da ocupação e confirmar uma vez, ficha de histórico. |
| Tributário | Regras de taxa, Guias e débitos | Evento/fórmula/vigência; guias vinculadas ao fato gerador, declarante, status, ação de emissão/reimpressão; sem confundir dívida prévia do declarante com taxa do novo processo. |
| Análises | Consulta unificada, Relatório de sepultados | Filtros completos, paginação server-side, emissão de todo o conjunto filtrado, cabeçalho institucional e critérios registrados. |

**Rotas:** preferir `?area=...` com `ModuleShell` como em Frotas ou subrotas em `/cemiterios/*` se a navegação existente se ajustar melhor. Manter URLs atuais e redirecionamento `/tributacao/cemiterios`; preservar `comprovante/[code]`. Seleção global de cemitério fica nos filtros/URL (persistência ao navegar), **não** em `useState` com primeiro cemitério como default silencioso. Pessoa/declarante é campo do respectivo formulário/ficha, não seletor global que altera vários cadastros acidentalmente.

**Composição de cada área:** título + ação primária contextual “Novo”; toolbar com busca, cemitério e filtros pertinentes (estado, tipo, funerária, causa, períodos); resumo do total do **mesmo filtro**; `ErpListFrame` com colunas de largura controlada, alinhamento para datas/números, linha clicável/botão Abrir; `ErpPagination` com página, total, tamanho fixo de **20 registros** e salto de página; ações secundárias na ficha (Editar, Anexos, Histórico, Emitir, Ativar/Desativar, Transferir), visíveis conforme permissão/estado. Formulários em modal ou rota de detalhe com rótulos permanentes, obrigatoriedade e erros por campo; confirmação apenas em transições irreversíveis e mensagem de resultado clara. Mobile com rolagem horizontal da tabela e ficha utilizável, sem rolagem vertical interna da listagem.

**Consultas:** Zod no servidor para filtros, datas e página; `count` + `findMany` com `where` Prisma, `skip/take`, ordenação estável por data + ID; lookup assíncrono paginado para contribuinte/falecido/sepultura/GED (evitar `take: 500` em `<select>`). Normalizar fuso horário para data civil do óbito e data/hora local da cerimônia; período inclusivo com limite superior exclusivo. Reutilizar componentes e identidade do ERP, mas centralizar regras nos serviços server-side: a interface não é a fonte da validação.

## Entregas sequenciais para o Codex

### 0. Contratos e diagnóstico de impacto

- Ler guia aplicável em `node_modules/next/dist/docs/` antes de escrever Next; revisar `AGENTS.md`. Procurar **todos** os consumidores das funções exportadas de `s9-service.ts` e das actions de `/cemiterios` **e** `/tributacao/cemiterios` antes de mudar assinaturas/retornos. Não fazer replace em massa.
- Definir fluxos e estados por tipo de processo: agendado → em realização → sepultado/cremado; velório deve ter conclusão/encerramento coerente sem receber status de sepultamento; cancelamento, transferência/exumação e múltiplos eventos do mesmo falecido com históricos separados. Decidir correspondência de falecido não identificado com cadastro único e persistência dos snapshots do óbito.
- Examinar estratégia de permissões de `CEMITERIOS` e acesso cruzado com `DOCUMENTOS`/`TRIBUTACAO` no serviço, GED e download; identificar efeitos do `ensureS9Defaults` chamado no GET (cadastro demonstrativo não pode gerar registros na abertura de página em instância real). Registrar migração/isolamento da base demonstrativa existente.

### 1. Base paginada e shell ERP (02–08, 10, 13–16, 23)

- Implantar layout/navegação e tabela paginada por área conforme especificação; filtros na URL e recorte 100% no banco. Separar consultas de cadastros e de processos para não buscar tudo a cada navegação. Ficha abre, reabre e mantém contexto ao voltar; seletores pesquisáveis alcançam registros além dos limites atuais.
- Editar cemitério, capela, funerária, lote, sepultura/lóculo, ossuário, causa e campo configurável conforme necessidade do requisito; validar invariantes (lote ativo, cemitério/setor coerentes, proprietário, capacidade, tipo lóculo) no servidor. Campos adicionais configurados geram entradas, são editáveis e aparecem na ficha; mudanças gravam `CemeteryChangeHistory` **por campo**, com usuário/data/hora e valores anterior/novo. Proteger renomeação/desativação de campo em uso sem perder o histórico.
- **Aceite:** 501+ registros continuam acessíveis; lote com limite N rejeita a (N+1)ª sepultura sob concorrência; ativação/inativação e ficha mostram estado certo; lóculo exige proprietário; histórico identifica cada campo editado.

### 2. Cadastro único, agendamento e jornada funerária (01, 07, 17–20, 25–26)

- Resolver `Taxpayer`/`Person` por busca (CPF/nome) com autorização adequada; falecido identificado referencia PF existente e exibe nome/óbito de origem; não reclamado admite identificação provisória de forma explícita sem forçar PF inexistente. Declarantes, proprietários e responsáveis usam cadastro único, não nome digitado sem vínculo.
- Na criação, coletar e validar campos obrigatórios de sepultamento, velório e cremação; ao selecionar falecido já cadastrado, preencher óbito/causa visivelmente e validar funerária/declarante. Validar débitos antes de confirmar e registrar snapshot da consulta (origem, data, estado, eventual aviso), sem confundir débito com impedimento automático. Garantir consistência de cemitério, capela, sepultura e capacidade.
- No sepultamento finalizado, em **uma transação/idempotência**, alterar processo, ocupação e movimento, aplicar `ESPÓLIO`/data de falecimento em `Person`, preservando idempotência e verificando vínculo de PF; diferenciar saída posterior para ossuário/exumação/cremação. Comprovante acessível para agendamento, reimpressão após finalização sem perder dados históricos.
- **Aceite:** identificado com vínculo único aparece no cadastro tributário com “ESPÓLIO” e data exata após finalização (não antes); não identificado segue fluxo definido; débito é mostrado e reaberto; velório/cremação registram e exibem todos os campos do checklist.

### 3. Movimentações e anexos (09, 21–22)

- Validar os oito destinos/motivos: outro lote exige sepultura ativa e diferente da origem; ossuário exige capacidade; exumação remove ocupação; outra cidade/cemitério exige destino informado; desapropriação, cremação e outros registram motivo/destino sem aceitar destino incompatível. Bloquear antes de sepultado via serviço; executar atualização de origem/destino/histórico de forma concorrente e idempotente, sem contagem negativa/dupla.
- Upload de arquivo diretamente da ficha de lote, sepultura ou processo, com vinculação segura a GED e download autenticado por permissão `CEMITERIOS` e escopo do registro; preservar possibilidade de vincular documento GED já existente. Exibir anexos na ficha da entidade correta e registrar autor/data, sem depender da listagem global truncada.
- **Aceite:** oito tipos de transferência demonstrados, pré-sepultamento bloqueado inclusive por chamada direta, ocupação/estado coerentes e anexos descarregáveis por operador autorizado ao módulo sem exigir permissão ampla de GED.

### 4. Taxas e emissão automática (11, 24)

- Criar catálogo controlado de eventos (aquisição de lote, sepultamento e novos tipos configuráveis), fórmulas parametrizadas/versionadas com vigência e cálculo `Decimal`. Associar regra ao evento real e contribuinte correto, criar lançamento/guia no motor tributário **uma única vez por evento**, com vínculo e referência reimprimível; não gerar cobrança no mero agendamento se o fato gerador escolhido for conclusão. Preservar emissão manual existente para casos autorizados sem duplicação. Mudança de regra não recalcula cobrança antiga.
- Relatório “Sepultados”: buscar exclusivamente eventos concluídos dentro do período efetivo de sepultamento, filtro por funerária, com total e todas as linhas, opção de PDF/impressão e exportação se padrão de relatórios do projeto suportar. Não usar `window.print()` da tabela paginada como relatório; adotar mecanismo de emissão/auditoria e template institucional já existente no projeto.
- **Aceite:** evento único emite uma única guia calculada pela regra vigente; valor e contribuinte conferem; reentrada não duplica; relatório mostra registros além da página 1 e intervalos limítrofes corretos.

### 5. Consulta unificada, validação e evidências (12, 23–26 + revisão 01–26)

- Consulta dos três tipos com estados esperados do edital: agendado, sepultado, cremado, desapropriado, exumado, transferido (e estados internos em realização/cancelado quando aplicáveis). Filtros explícitos por falecido, cemitério, funerária, causa, data de óbito e **data efetiva** de sepultamento, além de status/tipo; total, ordenação e exportação concordam exatamente com o recorte filtrado.
- Testes integrados com banco isolado e UI/API para criação → reabertura → edição → histórico, concorrência limite de lote/sepultura, taxas automáticas sem duplicidade, registro/regularidade de declarante, finalização e espólio, oito transferências, anexos/controle de acesso, paginação (>500) e relatório completo. Aproveitar testes de `s9-engine.test.ts`, complementando com persistência transacional real.
- Montar roteiro de POC **01–26**: dados demonstrativos identificados e não reclamados, abrir ficha, executar, recarregar, consultar, filtrar, imprimir e demonstrar cada bloqueio/automação. Registrar evidências e só marcar **ATENDE** quando o item for reproduzível ponta a ponta. Rodar testes pertinentes, lint e `npm run build` antes de eventual commit/push.

## Revisão do plano contra a fonte e início da execução

O PDF original foi conferido diretamente nas páginas 192–194: o plano mapeia **todos os 26 requisitos**, sem item omitido. Isso valida a cobertura planejada, não o atendimento do software. A execução foi autorizada pelo usuário após a conclusão das verificações possíveis de Civil.

- Item 17: testar separadamente **normal de pessoa**, **membro** e **não reclamado/não identificado**. Sepultamento de membro não pode declarar automaticamente o óbito da pessoa viva a quem pertence; a regra de espólio aplica-se ao falecido efetivo identificado.
- Itens 19/23: velório tem encerramento próprio, sem converter seu processo em sepultamento/cremação nem alterar ocupação indevidamente.
- Itens 11/25: taxa automática exige vínculo único ao fato gerador; consulta de débitos distingue cobrança original de dívida ativa para não contar duas vezes o mesmo débito.
- Item 26: finalização e atualização do cadastro único são atômicas; exceções identificadas e legados não podem ser silenciosamente aceitos como atendimento integral.
- A matriz C/P acima permanece o diagnóstico inicial. Os resultados de execução e evidências serão registrados separadamente e só substituirão a classificação após validação.

### Progresso de execução

- Diagnóstico e consumidores de serviços/actions existentes revisados; plano conferido com os 26 itens do PDF.
- Entregas integradas: estrutura/ocupação com fichas editáveis e histórico por campo; jornada e oito movimentações; taxas automáticas versionadas; consultas/relatório, lookup e anexos GED.
- **18 testes aprovados** em PostgreSQL/PGlite e regras puras; incluem 521 registros, concorrência de vagas, espólio, membro de pessoa viva, jornadas independentes, filtros, GED, PDF completo, replay e taxas/DAMs centrais. ESLint dos arquivos alterados aprovado.
- **Duas migrations novas aplicadas** ao banco configurado: `20261011010000_cemetery_integrity` e `20261011020000_cemetery_automatic_fees`. Baseline completo exercitado nos testes; registros legados preservados.
- Seed demonstrativo explícito aplicado: dois cemitérios, duas pessoas/contribuintes sintéticos, quatro lotes/quatro sepulturas, capelas, ossuários, equipe, funerária e causa. Nenhum óbito, usuário/permissão operacional ou taxa foi criado pelo seed.
- A abertura da página não gera mais defaults. Rota principal direciona às áreas ERP, listagens paginam em 20 e relatórios completos usam o conjunto real filtrado.
- Roteiro de demonstração dos 26 itens e comandos: `CEMITERIOS_AMBIENTE_E_HOMOLOGACAO.md`.
- **Build integrado aprovado (`npm run build`, código 0)**: geração Prisma, compilação Next.js, TypeScript, geração de páginas e otimização concluídas, incluindo todas as novas rotas de Cemitérios. O erro de tipo do helper de bloqueio identificado no primeiro build foi corrigido e a execução completa repetida com sucesso.
- Homologação autenticada/visual e impressão pendentes por navegador desconectado; fórmulas e fundamento legal oficiais precisam de validação municipal.

## Riscos de regressão a verificar em cada entrega

- `registerDeceased` hoje pode finalizar imediatamente e `advanceCemeteryProcess` pode finalizar agendamento; proteger transições para impedir dupla ocupação e dupla atualização de cadastro único. Mudanças em `Person.fullName` afetam outros módulos: manter identificação legal e política de apresentação de “ESPÓLIO” coerentes com o checklist, testando usos do cadastro único.
- `registerMovement` hoje atualiza contagens dentro de transação, mas regras de destino precisam ser específicas por motivo; não reaproveitar lógica de transferência para velório/cremação sem adequar processo e localização.
- Regras de taxa e `createTaxAssessment` integram Tributação: não confundir emissão com pagamento ou dívida ativa; manter vínculo ao fato gerador e conciliação com guias.
- `CemeteryAttachment` guarda referência ao GED e `api/download` hoje decide permissão pelo documento; ajustar autorização sem abrir acesso genérico a arquivos. Consultas, relatórios e comprovantes precisam de autorização server-side compatível com `CEMITERIOS`.
- Criar migrations novas (não reescrever as aplicadas), considerar registros legados ao tornar campos obrigatórios; não executar migration em banco de produção durante o planejamento. Datas civis (óbito) e horários locais (agendamento) não podem divergir por fuso.
