# Migração integral para Drizzle — situação

## Base e decisões

- Plano: `PLANEJAMENTO_MIGRACAO_PRISMA_PARA_DRIZZLE.md`.
- Base compartilhada: `4476c3e`; `main` sincronizada com `origin/main` e árvore limpa no início desta execução.
- Branch de execução: `feat/migracao-integral-drizzle`.
- O build anterior foi cancelado pelo reinício do servidor. Não constitui aprovação de build.
- **Decisão posterior do proprietário:** executar no banco Neon atual de produção, com o sistema sem uso até a troca integral. Esta autorização substitui a exigência de cópia Neon dos itens 3.3, lote 0 e seção 12 do plano.
- Conexões de Prisma e Drizzle usarão o mesmo destino durante a coexistência.
- Identidade de publicação: `Robonuvem-dev <343586278+Robonuvem-dev@users.noreply.github.com>`.
- Atualização remota incorporada por fast-forward: `3f05dcd` (somente documentação do build anterior). `origin/main` não continha alterações de telas nessa conferência.

## Coordenação

Responsável de backend: executor desta branch. Arquivos reservados inicialmente: `src/db/**`, `scripts/drizzle-*`, configuração de dependências e os documentos `MIGRACAO_DRIZZLE_*`.

Os arquivos visuais continuam sujeitos à coordenação descrita no plano. Toda adaptação de página deve registrar um handoff com a versão mais recente e preservar seu JSX/CSS.

## Lotes

| Lote | Situação | Evidência / próximo passo |
|---|---|---|
| 0 — inventário e baseline | Em execução | Inventários, introspecção, reprodução de 156 migrações e restauração local conferidos; build instrumentado parcial aprovado; duas divergências históricas de checksum pendentes de reconciliação |
| 1 — infraestrutura e plataforma | Em execução | Conexão/transações/utilitários, autenticação, gestão de usuários/perfis/módulos e parâmetros de instância integrados; contratos e atomicidade verificados no Neon; demais configurações e consumidores legados pendentes |
| 2 — Saneamento, Meio Ambiente, Administração, Cadastros | Em execução | Runtime dos quatro domínios adaptado, incluindo 14 catálogos, qualidade, reconciliação e mesclagem PF; carga municipal intermodular e Saneamento migrados com teste completo; cobertura residual pendente |
| 3 — Atendimento, Processos, GED, Portais, Transparência | Iniciado | Centro de notificações: leitores, reconhecimento com auditoria e resolução de links adaptados; produtores intermodulares permanecem nas transações legadas até migração integral dos seus chamadores |
| 4 — Patrimônio, Frotas, Obras, Iluminação | Pendente | — |
| 5 — Cultura, Cemitérios, Câmara, Segurança, Controle | Pendente | — |
| 6 — RH, SST, Portal do Servidor, Educação | Pendente | — |
| 7 — Saúde, Portal do Paciente, Assistência | Pendente | — |
| 8 — Financeiro, Tributação, Planejamento, Compras | Pendente | — |
| 9 — cobertura residual e remoção Prisma | Pendente | — |
| 10 — homologação e publicação | Pendente | — |

Nenhum lote funcional foi declarado concluído. O critério integral permanece o da seção 10 do plano.

## Evidências já obtidas

- Inventário inicial em `docs/drizzle-inventory/`: 973 modelos, 1.858 arquivos candidatos, 18.281 chamadas candidatas, 1.330 transações e 156 migrações. A análise automática inclui falsos positivos possíveis; não substitui revisão individual.
- Catálogo PostgreSQL 18.6: 1.006 tabelas de dados em todos os schemas, 154.016 registros, 163 funções, 255 triggers, 2.773 índices e 12.020 constraints (incluindo `NOT NULL` do PostgreSQL 18).
- Captura local consistente `REPEATABLE READ READ ONLY`: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/`. Manifesto/checksums públicos em `docs/drizzle-inventory/database-before.json`; dados permanecem fora do Git. Restauração offline aprovada conforme evidência abaixo.
- `drizzle-kit pull` concluído: 997 tabelas públicas, 10.837 colunas, 6 enums, 2.047 FKs, 479 checks e uma view; artefatos locais em `.agent/drizzle/introspection`. O SQL gerado não foi aplicado.
- Cliente sem registro global de tabelas; pool WebSocket Neon com cinco conexões e espera de conexão de dez segundos. Transações em uma conexão, com timeout total PostgreSQL 17+, timeout de instrução/ociosidade e locks.
- IDs cuid v1 via `@bugsnag/cuid@3.2.2`; decimal independente via `decimal.js@10.6.0`, com comparação temporária ao comportamento anterior.
- `tests/drizzle-primitives.test.ts`: três testes aprovados.
- `tests/drizzle-database.test.ts`: oito subtestes e teste-pai aprovados no Neon. Cobrem identidade, perfis e usuário ativos, escopos UG/Saúde, auditoria, unicidade/FK, savepoints, timestamps, decimal/JSON, BI e liderança. Fixtures revertidas ao final e ausência conferida.
- `scripts/drizzle-verify-bi.ts`: paridade dos seis conjuntos de dados em 15 cenários (consolidado, 13 secretarias, inexistente).
- `scripts/drizzle-verify-sanitation.ts`: 17 comparações aprovadas. Confirmados 18.500 consumidores, 55.500 leituras, 900 OS; 18.500 leituras em cada competência 08/2026, 09/2026 e 10/2026; nenhuma em 10/2024 e 10/2025.
- `tests/drizzle-sanitation.test.ts`: três subtestes e teste-pai aprovados no Neon; sequência, leitura por competência, corte/religação atômicos, rollback parcial e faturamento legado. Fixtures revertidas e ausência conferida.
- Oito páginas de Saneamento adaptadas somente na camada de dados. Comparação AST confirmou JSX idêntico à base, normalizando apenas finais de linha.
- Checagem isolada estrita `tsconfig.database.json` aprovada em duas execuções; não equivale à checagem de produção completa.
- `scripts/drizzle-verify-administration.ts`: 18 comparações aprovadas de todas as consultas das páginas administrativas, com projeções completas, contagens e relações. Ordenações com nomes iguais preservam o critério primário legado, sem inventar um desempate.
- `tests/drizzle-administration.test.ts`: cinco testes aprovados; pessoa canônica do servidor, hierarquia, responsável, manutenção da logo, calendário e rollback da mutação quando a auditoria falha.
- `scripts/drizzle-verify-environment.ts`: 23 comparações aprovadas; consultas de todas as páginas, filtros, relações opcionais, totais e licenças emitidas pelo motor legado.
- `tests/drizzle-environment.test.ts`: cinco testes aprovados; CRUDs, nulabilidade, medidas, unicidade/FK de licença, hash e rollback. Runtime de Meio Ambiente sem referências Prisma na conferência.
- `scripts/drizzle-verify-registry.ts`: 86 comparações aprovadas, incluindo dez consultas de Cadastros e 19 cenários de fornecedores com quatro conferências por cenário (contagem, fontes completas, paginação/serialização e fonte do relatório).
- `tests/drizzle-registry.test.ts`: seis testes aprovados; PF/endereço, contribuinte PF/PJ, upsert mantendo ID, CNAE/anexos, omissão versus null, limites de validade à meia-noite/fim do 30º dia e histórico imobiliário com ator/versões. Histórico e fixtures ausentes após rollback.
- `tests/supplier-support.test.ts`: três testes aprovados após adaptação do consumidor do construtor de filtros para SQL parametrizado.
- Timeout total transacional conferido após a correção para `client.release(true)`: callback retomado não grava. Reserva mensal concorrente de Saneamento aprovada em conexões distintas, com números consecutivos e limpeza explícita das duas reservas commitadas.
- `scripts/drizzle-verify-handoffs.mjs`: comparação de raízes JSX via AST e `getText` aprovou **55 arquivos TSX alterados**, incluindo notificações, configurações e `InstitutionForm`; normalizados somente CRLF/LF. Conferência contra `3f05dcd`, sem mudanças visuais nos handoffs.
- Checagem isolada fria (`--incremental false`) aprovada: 724 arquivos, 12,39 s, `Memory used: 406232K`; não mede a aplicação inteira. Ampliações posteriores também passaram na checagem incremental.
- `scripts/drizzle-verify-master-data.ts`: **93 comparações** aprovadas; 14 catálogos × seis cenários, incluindo busca com curingas/injeção literal, segunda página, DTOs, colunas e campos/seletores extraídos por AST da página legada. Também compara dashboard, organograma, integridade canônica e paginação da qualidade. Seletores de centros de custo sem ordenação no legado são comparados como conjuntos; os demais conservam a ordem.
- `tests/drizzle-master-data.test.ts`: **nove testes/subtestes** aprovados no Neon; família/membros históricos, ciclos, vínculos ativos, localidades, unicidade de agência, moeda padrão, versões jurídicas, assinantes, alternância dos 14 catálogos, consistência e rollback de auditoria. Todas as mutações da suíte foram revertidas.
- `tests/drizzle-reconciliation.test.ts`: **cinco testes/subtestes** aprovados; PF/PJ e três papéis, IDs/dados preservados, auditoria sem CPF/CNPJ, replay idempotente sem alterar timestamp, conflito de chave/identidade/tipo/papel e rollback por falha de auditoria. Ausência das fixtures/auditoria conferida após rollback.
- `scripts/drizzle-verify-construction-links.ts`: **122 comparações somente leitura** aprovadas; atualizações imobiliárias por administrador/setor, busca literal, paginação e papéis vigentes de Construção Civil.
- `tests/construction-lifecycle-list.test.ts`: **três testes** aprovados usando Drizzle/PGlite real, sem bridge ORM simulada; verifica paginação/limites, setor, hidratação completa/JSON/datas, curingas literais e vigência inclusiva com servidor/departamento ativos.
- Checagem isolada incremental após catálogos/reconciliação: 746 arquivos, 8,24 s, `Memory used: 363055K`; ampliação posterior com consultas intermodulares passou. ESLint de infraestrutura, contratos, Cadastros completo e reconciliação passou antes da ampliação intermodular.
- `scripts/drizzle-verify-recovery.mjs --replay --restore`: **156 migrações executadas em banco vazio**, sem diferenças no catálogo público; **1.006 tabelas e 154.016 registros restaurados** com verificação de hashes exatos de todas as linhas, incluindo o ledger legado. Catálogo completo restaurado sem diferenças, inclusive sequência e seu estado. Artefatos `.agent/drizzle/recovery-2026-10-28T03-24-45.842Z/`; evidência pública em `docs/drizzle-inventory/recovery.json`. PGlite/PostgreSQL 17.5 local; invariável NOT NULL de PostgreSQL 18 comparada pelas colunas, e owner da sequência pertence ao servidor local.
- `scripts/drizzle-verify-migration-history.mjs`: 156 entradas concluídas, 125 checksums idênticos e 29 correspondentes após normalização CRLF/LF. **Duas divergências históricas reais**: `20261011010000_add_sst_clinical_services` e `20261015220000_health_aih_apac_workflows`. Ambas já constam assim no commit inicial; não há versão anterior no histórico local. Checksums instalado/local/LF registrados em `docs/drizzle-inventory/migration-history.json`; ledger e SQL preservados. O comando retorna exit 1 enquanto essas proveniências estiverem pendentes.
- `scripts/drizzle-verify-schema.ts`: **69 tabelas, 718 colunas e 74 FKs declaradas** conferidas contra o catálogo físico; sem diferenças em tipos, nulabilidade e ações referenciais, incluindo notificações e parâmetros da instância.
- Mesclagem PF: `scripts/drizzle-verify-person-merge.ts` aprovou **12 comparações** de página/candidatos. **13 testes** aprovados entre política existente, elegibilidade SQL (todas as 16 relações protegidas e assinatura) e execução/reversão no Neon. Mantidos dupla aprovação, isolamento serializável, manifesto imutável, documentos bloqueados e proteção contra alterações posteriores; fixtures revertidas e ausência conferida.
- `readCanonicalIdentityIssues` e `scripts/inspect-canonical-identities.ts` agora usam Drizzle; inspeção real `REPEATABLE READ READ ONLY` concluída. Teste PostgreSQL legado de integridade adaptado para Drizzle/PGlite e aprovado. O oráculo de catálogos foi reexecutado com o leitor Prisma original extraído do Git, preservando as **93 comparações independentes**.
- Auditoria: `scripts/drizzle-verify-audit.ts` aprovou **35 comparações** de DTOs, filtros, cursores nas duas direções, distribuições e resumo de uso. Teste PGlite confirma empates de timestamp em três páginas, limites inclusivos e busca literal. `tests/audit-evidence.test.ts` aprovou **15 testes**, incluindo proteção append-only no Neon; seu writer legado permanece para transações de outros módulos. Login/logout e endpoint de interação agora gravam pela infraestrutura Drizzle.
- Notificações: **24 comparações somente leitura** e **sete testes Drizzle/PGlite** aprovados; deduplicação, destinatário, reconhecimento, rollback de auditoria e escopo atual/histórico de Processos. ESLint e checagem isolada aprovados.
- `scripts/municipal-system-dataset.ts` e `sanitation-city-dataset.ts`, os dois runners e `tests/municipal-system-dataset.test.ts` usam Drizzle/SQL parametrizado. **129 expressões de dados em 128 tabelas** comparadas por AST com o legado, na mesma ordem. Writer restrito à carga aditiva, sem API de compatibilidade ORM; introspecção física por transação fornece tipos/defaults, sem DMMF. Contagem por `RETURNING` funciona no Neon e PGlite; arrays são parâmetros únicos e JSON mantém seus tipos.
- Teste municipal completo aprovado no PGlite (156 migrações): preservação de registros preexistentes, vínculos intermodulares, 18.500 unidades/hidrômetros e 55.500 leituras/faturas, repetição sem duplicação, CEP preenchido preservado/NULL reparado, rollback por FK e falha de auditoria. Os runners não foram executados com `--apply` no Neon nesta rodada.
- Administração de acesso: `scripts/drizzle-verify-system-administration.ts` aprovou **64 comparações somente leitura**. Usuários, perfis, ACLs individuais legadas, módulos, dashboard, instância/JSON e seletores preservados. **Cinco subtestes e teste-pai** aprovados no Neon: edição remove ACL atomicamente, rollback da auditoria, códigos/IDs/timestamps preservados, status/exclusão com FK e upsert JSON sem trocar ID. Fixtures inteiramente revertidas e ausência conferida; regras C3/provisionamento Firebase e parâmetros existentes também passaram.
- PostgreSQL 18: classificação ampliada para `23001` (RESTRICT), além de `23503`, mantendo a mensagem de vínculos na UI de usuários/catálogos. Regressão conferida por exclusão realmente bloqueada no Neon e teste de tradução.

## Execuções e pendências imediatas

1. Build instrumentado concluído, shell `sh_1801f2f030013s13hYZurP6bQV`, exit 0. Oito partições estritas aprovadas e Next compilado/95 páginas estáticas geradas; duração total 4.536.203 ms. Artefatos `.agent/drizzle/metrics/2026-10-28T01-28-10.180Z/`. Pico amostrado de heap TypeScript 6.325.892.888 bytes, ainda acima da meta de 4 GiB.
2. A primeira partição mediu a base antes da ligação dos serviços migrados. O código continuou evoluindo durante as demais partições; a execução inteira não é um baseline imutável nem aprovação das últimas edições.
3. Segundo `npm run build` completo, shell `sh_1807786da001d4AR74EnfjrDAv`, **exit 0**: oito partições, Next compilado e 95 páginas estáticas. Typecheck 2.559 s, Next 205 s, maior `Memory used` 6.274.088 KiB; execução com cache. Mesclagem/auditoria/notificações/cargas mudaram durante sua execução; configurações foram adaptadas depois. Não constitui aprovação imutável do código final.
4. ESLint passou para infraestrutura, contratos, domínios adaptados, APIs e oráculos/testes Drizzle, incluindo cargas e administração de acesso. `tsconfig.database.json` ampliado passou, mas não cobre toda a aplicação. `tsconfig.migration.json` agrega as actions/páginas adaptadas e todos os oráculos TypeScript; checagem ampliada em andamento no shell `sh_180abd2e0001k247jcCRsE0RO7`.
5. Completar cobertura residual de scripts/testes do lote 2. O verificador municipal ainda depende do legado tributário; certificados, integrações, relatórios e workflows de Configurações continuam pendentes com seus domínios compartilhados.
6. Migrar a auditoria compartilhada preservando cada transação ainda atendida por Prisma; não substituir silenciosamente seu cliente transacional.
7. Histórico SQL continua sob a trilha antiga. Reprodução vazia e restauração offline aprovadas; adoção do banco instalado requer registrar/reconciliar as duas proveniências históricas divergentes, preservando o ledger. Remoção do Prisma pendente.

Não houve commit/push desta migração nem promoção de deploy nesta branch.
