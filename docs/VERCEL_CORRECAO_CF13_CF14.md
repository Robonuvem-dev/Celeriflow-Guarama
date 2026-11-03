# Correção dos deploys de Patrimônio e Frotas — 03/11/2026

## Causas identificadas nos logs

- Produção `bf518ee` e `f944550`: executor SQL bloqueado em `20261103180000_hr_functional_management`, posição 192. A migração nova de Patrimônio tinha timestamp anterior ao último recibo já instalado, alterando o prefixo obrigatório.
- Preview `8d5eaaf`: imports, variável `page` e implementação antiga duplicados em `CatalogPage.tsx`; serviço `extendedAssetReport` tipado como conexão completa embora receba e utilize o executor Drizzle.
- Previews anteriores: agendamento RH a cada quinze minutos incompatível com Hobby. O `main` atual já contém nove agendamentos diários.

## Correções

- Reposicionada a migração ainda não aplicada de Patrimônio para `20261103210000_cf13_asset_inventory`, após RH e Frotas. SQL preservado; recibos instalados não são reescritos.
- Preservada a composição operacional atual dos cadastros; removidos imports e bloco antigo duplicados.
- `extendedAssetReport` recebe `DatabaseExecutor`, compatível com seu consumidor e suas consultas.

## Verificações anteriores à publicação

- Plano oficial SQL: aprovado após reposicionamento; recibo RH instalado confirmado na posição 192.
- Replay físico de todo o histórico SQL e imutabilidade/histórico RH: 2 testes aprovados.
- Verificação de fontes da migração: 9 testes aprovados.
- ESLint dos dois arquivos TypeScript alterados: aprovado.
- `npm run build`: aprovado, incluindo as 17 partições TypeScript e o build Next.js. Foi necessário instalar as dependências já declaradas no lockfile para disponibilizar `qrcode` localmente.
- A suíte adicional `asset-catalogs.test.ts` tem falhas fora das correções de deploy: comparação de timestamp no fuso local; em UTC, avança até a fixture genérica sem situação parametrizada válida. Não equivale a validação funcional completa de Patrimônio.

Alteração de banco: reposicionamento de migração pendente. Alteração visual: remoção de código antigo inacessível, mantendo os componentes operacionais existentes. Inspeção e verificações automatizadas não substituem aceite visual.
