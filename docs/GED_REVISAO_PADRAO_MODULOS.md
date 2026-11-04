# GED — conferência de banco, formulários e layouts

Data: 01/11/2026. Método: leitura dos arquivos novos e diffs dos arquivos rastreados, comparados ao padrão global v1.2 e aos componentes operacionais compartilhados. Nenhum teste, scanner executável, build, acesso ao banco ou ensaio de navegador foi realizado nesta conferência.

## Resultado

**Houve criação/alteração de banco e interface. A implementação nova do GED não está integralmente alinhada ao padrão visual global.** A preparação do acervo da fase 9 permanece concluída; isso não equivale à aprovação de layout. As adequações identificadas abaixo precisam ser tratadas antes de declarar conformidade das telas novas.

Referências: `Padrão de Tabelas.md`, `ENTREGA_PADRAO_TABELAS.md`, `src/components/app-ui/operational/` e `src/lib/operational-tables.ts`.

## 1. Banco de dados

Migração preparada, ainda não aplicada: `db/migrations/20261102130000_ged_poc_internal/migration.sql`. A migração nova foi reposicionada após a sequência integrada de Ação Social e CF10 até `20261102120000`; nenhuma migração previamente aplicada foi renomeada.

São **27 novas tabelas**:

- Tipos/metadados: `GedTypeDefinition`, `GedMetadata`.
- Segurança: `GedGroup`, `GedGroupMember`, `GedAcl`.
- Colaboração/histórico: `GedActivity`, `GedFavorite`, `GedComment`, `GedPreference`.
- Processamento: `GedArtifact`, `GedEmbedding`.
- Fluxos: `GedFlowDefinition`, `GedFlowRun`, `GedFlowDecision`.
- Automação: `GedRule`, `GedRuleExecution`, `GedRuleVersion`, `GedRuleActionResult`, `GedEventQueue`, `GedTask`.
- Agenda/avisos: `GedCalendarEvent`, `GedMailIntent`.
- Integração/publicação: `GedPublicationLink`, `GedIntegrationLink`, `GedSourceImport`.
- Operação: `GedSetting`, `GedDisposal`.

Quatro tabelas preexistentes recebem colunas: `GedFolderAccess` (`inheritAccess`), `GedProcessingJob` (`nextAttemptAt`, `steps`), `GedUpload` (`indexValues`, `definitionId`) e `GedTextPage` (`words`). Os `ALTER TABLE` de `GedMetadata` e `GedCalendarEvent` complementam tabelas criadas na mesma migração, não representam duas outras tabelas antigas alteradas.

Também há mapeamentos novos em `src/db/schema/ged-poc.ts` e ajustes em `src/db/schema/ged-management.ts`. Esses arquivos e a migração são preparação de código; não comprovam execução no banco.

## 2. Páginas, formulários e navegação

Quatro páginas novas: `/assinatura-digital/gestao`, `/assinatura-digital/calendario`, `/assinatura-digital/meu-painel` e `/assinatura-digital/origens`.

Foram criados formulários de tipos/índices, grupos, ACL, diagnóstico de acesso, provedores, aparência, fluxos, regras, eventos, ingresso de origens e agrupamento de imagens. O detalhe ganhou metadados/validade, comentários, compartilhamento, decisões e publicação. Importação, pesquisa, histórico e visualização existentes também receberam alterações.

Nos layouts de Financeiro, Obras, Planejamento, Protocolos e RH, os diffs desta entrega acrescentam navegação para origens do GED. Não alteram a composição dos formulários nem das tabelas próprias desses módulos. Os manifestos operacionais correspondentes também receberam links. O layout do GED, diferentemente, ganhou um invólucro de aparência institucional.

## 3. Achados de padronização

| Prioridade | Arquivo/composição | Evidência de código | Adequação necessária |
|---|---|---|---|
| Alta | `src/components/signatures/ged/GedQueuePanel.tsx:10` | `<table>` própria, `overflow-x-auto`, campos empilhados e navegação Anterior/Próxima própria | Usar tabela/paginação compartilhadas, colunas separadas, detalhes condicionais e painel contextual; conservar ações e consulta de servidor |
| Alta | `src/components/signatures/ged/GedSourceWorkspace.tsx:18` | Consulta operacional em cartões, título repetido, filtros expansíveis e paginação própria | Compor listagem operacional de origem com campos/ações em colunas e ingresso em painel/formulário contextual |
| Alta | `src/app/app-domain/assinatura-digital/layout.tsx:11` e `GedAppearance.module.css:1` | Invólucro com borda/faixa institucional; `.compact` modifica padding de todos os `td`/`th` descendentes | Preservar geometria global e retirar sobrescrita de densidade das tabelas; encaixar personalização nos pontos compatíveis do shell |
| Alta | `GedAdministration.tsx:27`, `:40`, `:48`, `:59` | Título e abas próprios; listas de tipos/grupos e grades repetidas de campos/ACL sem composição operacional equivalente | Organizar cadastro/seletores/grades nos componentes e painéis padrão, mantendo estado integral, campos e payloads |
| Média | `GedImageCombine.tsx:8`, consumido nas ações do `GedWorkspace` | Formulário expansível de agrupamento é renderizado dentro da área de ações do header | Manter apenas acionador compacto no header; formulário/ordenação em painel adequado |
| Média | `GedFlowDesigner.tsx:18`, `GedRuleEditor.tsx:11` e editores administrativos | Controles próprios, diagrama com largura mínima/rolagem e grades repetidas sem painel contextual | Reutilizar componentes/tokens e organizar a edição; tratar diagrama como visualização especializada, preservando conexões, edição e dados |
| Média | `GedPersonalPanel.tsx:20–39` | Header interno e formulário de evento embutido; estilos próprios de controles e cartões | Integrar ações/contexto ao shell e formulário de evento à composição comum; preservar a semântica de calendário e dashlets |
| Média | `GedDocumentManagement.tsx:21–25`, `GedProviderEditor.tsx:6`, `GedAppearanceEditor.tsx:5`, `GedAccessExplanation.tsx:7` e `GedIndexFields.tsx:5` | Formulários e campos com estilos locais repetidos | Harmonizar controles, mensagens, organização e painéis com o padrão existente; não alterar contratos de servidor |
| Conferência geométrica | `GedWorkspace.tsx:114–150`, `GedDocumentDetail.tsx:58–62` | A listagem principal e o histórico já usam `OperationalListFrame`/`OperationalTable`/paginação; Explorer e novos ancestrais alteram a área disponível | Preservar a base compartilhada e verificar orçamento de altura/largura com as composições novas na fase final |

Os achados de código são verificáveis sem navegador. Recortes, medidas finais, comportamento por dispositivo e efeitos de zoom ainda dependem da homologação. Não foram presumidos como falha visual medida nem como PASS.

## 4. Regra permanente e sequência

### Adequações de código posteriores à revisão

Em 01/11/2026, a fila passou a usar `OperationalTablePanel`, `OperationalListFrame`, `OperationalTable` e paginação compartilhada, com versão, etapas, tentativas e próxima execução em colunas distintas. A consulta de origens passou a usar a tabela e a paginação compartilhadas, com ingresso em diálogo contextual e estado dos índices mantido no componente pai. O invólucro institucional deixou de acrescentar borda/faixa e não sobrescreve mais `td`/`th`. Essas alterações são inspeção de código; orçamento geométrico e validação de navegador seguem pendentes. Os demais itens do inventário permanecem em adequação, sem aprovação integral do layout.

A seção 6 do `AGENTS.md` passa a explicitar o uso obrigatório do padrão compartilhado nas novas tabelas, formulários e layouts de todos os módulos, inclusive GED.

Esta solicitação foi uma conferência: os achados foram inventariados, sem refatoração das telas nesta revisão. A sequência de adequação é: shell/aparência → fila e origens → cadastros e grades de edição → formulários e ações contextuais → composição de calendário/diagrama → verificações da fase 11. A adequação deve analisar cada arquivo e seus consumidores, sem substituição genérica em massa.

Os arquivos de BI SmartTV que já estavam modificados antes do trabalho de GED não integram este diagnóstico de alterações do GED.
