# Checkpoint — Campo Florido

Data: 01/11/2026. Repositório exclusivo: Robonuvem-dev/Celeriflow-Guarama.
Branch exclusiva: `feat/cf10-cf30-cf33-mateus`.
Base: `d507684ffe5a39c7b38ed1a4a5bd0d500ae73067`.

## Recuperação e segurança

O ZIP do Work anterior não foi anexado nem recuperado. Esta entrega é uma nova implementação incremental sobre a base remota conferida, baseada na auditoria e no código existente. Não afirmar que as alterações não publicadas antigas foram transferidas.

O executor desta etapa é Linux em nuvem. O checkout foi recriado após reinicialização do ambiente; não existe dependência do computador do usuário. Não confiar na sobrevivência do scratch entre turnos.

Sem migração nova, alteração de schema, consulta ou escrita em banco produtivo. Sem merge/deploy. O arquivo 33.6 de Eduardo permanece com blob d6634ce21f0f387811f313f8476beb79f0369946.

## Alterações deste incremento

- Documentação nova: source-requirements.csv, SPRINT-00.md, SPRINTS.md e este checkpoint.
- src/db/repositories/environment/recycling-catalog.ts: persistência extraída da action existente; preserva chave, lock, instância, erros de duplicidade, inclusão/edição e auditoria na mesma transação.
- src/app/app-domain/meio-ambiente/residuos/cadastros/actions.ts: mantém autenticação, autorização, schema, instância, assinatura Promise<void> e revalidação; delega somente a escrita transacional.
- src/app/app-domain/meio-ambiente/residuos/cadastros/page.tsx: mostra formulário de inclusão somente com create e edição somente com update. A proteção server-side continua obrigatória.
- tests/recycling-catalog-persistence.test.ts: cinco casos reais sobre fixture isolada PostgreSQL/PGlite com o driver Neon/Drizzle da aplicação: CRUD dos cinco catálogos, identidade/escopo, duplicidade/edição inexistente, criação concorrente e rollback de inclusão/edição se a auditoria falhar.

## Verificações executadas

- npm ci --ignore-scripts --no-audit --no-fund: concluído, 1008 pacotes.
- Testes direcionados de catálogos: 8/8 aprovados; 0 falhas; 0 skipped. Incluem 5 casos novos de persistência e 3 casos existentes de schema/identidade.
- Regressão ampliada: 39/39 aprovados; 0 falhas; 0 skipped. Inclui catálogos, perfis, planejamento, PCA auxiliar, escopo UG/ente, atomicidade de compras, estoque/valoração e GED/OCR.
- npm run build: aprovado integralmente (exit 0). Coverage sem achados, verify-files autorizado, typegen aprovado, 3.462 fontes e 1.014 validações de rotas em 15 partições de tipos aprovadas; compilação Next, geração das páginas e conclusão do build aprovadas. Checagem de tipos: 588 s; etapa Next build: 107 s. Nenhum bypass das verificações foi adicionado.
- git diff --check: passou após as alterações iniciais.
- ESLint direcionado aos três arquivos de implementação e ao teste novo: aprovado, sem avisos.
- Verificação de migrações do build: FILES_INTACT_BASELINE_AUTHORIZED; strictAdoption permanece BLOCKED por diferença histórica preexistente em 20261011010000_add_sst_clinical_services. Nenhum arquivo histórico foi alterado e nenhuma adoção/deploy foi executada; databaseAuthority=NOT_CHECKED.
- Assinatura/call sites conferidos: saveRecyclingEntry é usado pelo formulário server-side da página de catálogo. Retorno Promise<void> preservado; nenhum contrato client foi alterado.

Os testes usam fixtures locais ao executor em nuvem e DATABASE_URL sentinela 127.0.0.1:1, sem credenciais reais. O build é executado sem VERCEL_ENV=production e sem variáveis de migração: o script faz verify-files, não deploy. Não há bypass das verificações do projeto.

Comando da regressão (com DATABASE_URL sentinela):

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=tap \
  tests/recycling-catalog-persistence.test.ts tests/recycling-catalog.test.ts \
  tests/purchase-planning.test.ts tests/user-additional-profiles.test.ts \
  tests/c5-procurement-policy.test.ts tests/stock-valuation.test.ts \
  tests/ged-management.test.ts tests/ged-storage.test.ts \
  tests/procurement-auxiliary-catalogs.test.ts tests/procurement-budget-scope.test.ts \
  tests/procurement-authorization-atomicity.test.ts tests/procurement-temporal-readers.test.ts
```

## Estado das sprints

| Sprint | Estado |
|---|---|
| 00 | Inventário estático e matriz 42/42 documentados; homologação funcional dos fluxos integrada às etapas seguintes. |
| 01 | Incremento de catálogos/permissões e testes de persistência implementado; build e regressão aprovados. Movimentos e estoque ambiental não iniciados neste incremento. |
| 02 | Não iniciada; aguarda ledger ambiental e vendas. |
| 03 | Não iniciada; cadastro jurídico/versões e GED já inventariados para reuso. |
| 04 | Não iniciada; preservar 33.6 e reutilizar relações históricas após conferir DDL instalado. |
| 05 | Não iniciada; reusar requisições/planejamento/PCA auxiliar, dotações e GED. |
| 06 | Não iniciada; provedor IA e garantia/suporte contratual permanecem externos. |
| 07 | Não concluída; build do incremento não equivale a validação dos 42 requisitos. |

## Continuação

1. Conferir HEAD remoto, status e documentação; preservar quaisquer mudanças posteriores.
2. Este incremento tem regressão/build aprovados. Publicar somente os oito arquivos revisados na branch autorizada, sem PR de conclusão das sprints, merge ou deploy. Conferir o commit que contém este checkpoint e não presumir que a base antiga continua sendo HEAD.
3. Completar prova de autorização e UI dos catálogos com perfis representativos, sem solicitar credenciais em chat.
4. Retomar 10.10/10.11: definir integração de movimentos/saldos de recicláveis com os catálogos existentes. EnvWaste não é estoque. Não retirar a exigência de recebimento aprovado nem regras contábeis do patrimônio.
5. Avançar conforme SPRINTS.md, mantendo itens externos pendentes: origem dos textos 33.15, provedor IA e garantia/suporte 30.14.
