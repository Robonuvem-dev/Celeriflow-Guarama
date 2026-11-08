# Execução da população municipal — 08/11/2026

## Situação do checkpoint de publicação

**Execução parcial.** Este checkpoint integra `origin/eduardo-07112026` em `main` e publica os carregadores, correção de build e evidências disponíveis, conforme solicitação de publicar antes do novo teste do usuário. Não representa a conclusão dos 38 pacotes, dos 56 roteiros ou da cobertura visual integral.

O inventário e `VERIFICACAO-PLANO.json` preservam o retrato inicial de planejamento; os recibos em `execucao/` registram as escritas e verificações posteriores.

## Cargas aplicadas e verificadas

| Área | Resultado | Evidência |
| --- | --- | --- |
| GED | 21 modelos, 21 pastas inteligentes e 21 documentos gerados; origem, vínculos e bytes conferidos | `execucao/ged/applied.json` |
| Educação | Núcleo acadêmico, avaliações, pré-matrícula e conteúdo interativo pelos seeds S1/S2/S3/S5; complemento de diário, frequência, biblioteca, transporte, documentos, merenda e recursos escolares | `execucao/educacao/applied.json` |
| Financeiro | 11 contas adotadas de catálogo oficial, edição publicada, conta arrecadadora, fonte e perfis tributários vinculados à UG e ao exercício existentes | `execucao/financeiro/foundation-applied.json` |
| Tributação | 20 lançamentos e guias; dez pagamentos integrais, cinco parciais e cinco guias disponíveis para continuidade | `execucao/tributacao/receipts-applied.json` |
| Assistência Social | Duas importações aplicadas sobre famílias existentes, duas visitas com atendimentos vinculados, seis documentos e dois RMA | `execucao/social/completion-applied.json` |
| Catálogos oficiais | 8.760 contas, 1.808 naturezas de receita e 3.926 de despesa importadas em edições-fonte DRAFT; hashes das três planilhas conferidos | `execucao/fontes-recuperadas.json`, `../poc-p0/CATALOGOS_OFICIAIS_P1.json` |

Saúde possui carregador com ensaio transacional completo de 42 atendimentos; o recibo `execucao/saude/care-applied.json`, quando presente e com `status: PASS`, comprova a aplicação. O ensaio isoladamente não comprova escrita persistida.

## Reconciliações de negócio

- Arrecadação tributária: pagamentos = receitas = entradas de tesouraria = **R$ 6.312,50**.
- Contabilidade dos fatos postados: débitos menos créditos = **zero**.
- Recursos escolares: R$ 12.000,00 − R$ 1.800,00 = **R$ 10.200,00**.
- Estoque alimentar: 50 − 8 = **42 unidades**.
- Importações sociais: composição integral das famílias preservada e consulta local devolvendo os snapshots importados.
- Cada carregador novo usa transação, trava de pacote e ensaio com rollback; recibos aplicados usam IDs persistentes. Cadastros compartilhados são reaproveitados.

## Censo intermediário

O censo de `execucao/censo-intermediario/` consultou as **1.130 tabelas**, sem erros: **407 preenchidas**, **723 vazias** e **262.528 registros**. **54 tabelas inicialmente vazias** passaram a ter dados. Esse retrato antecede a aplicação do complemento de Saúde.

Esses números mostram avanço de população; não equivalem à validação dos 56 roteiros. As tabelas ainda vazias e os fluxos especializados seguem no escopo do plano.

## GED: verificação visual e limite do resultado

As duas listagens passaram nos ambientes de produção e build local em 1366×768, 1920×1080 e 1280×720: 20 linhas, segunda página, retorno à primeira, busca e estado vazio, paginação visível e ausência de overflow da página. Evidências em `execucao/ged-layout-antes/` e `execucao/ged-layout-local/`.

O aviso informado pelo usuário ainda não foi reproduzido nessas dimensões. **Não foi aplicada uma correção de layout no GED.** A publicação permite o novo teste solicitado pelo usuário; a investigação deve continuar sobre o viewport real se o aviso persistir. O verificador local foi ajustado para aguardar o DOM e selecionar a tabela visível, pois o Next pode manter uma árvore oculta de navegação anterior.

## Integração e verificações

- Merge sem conflitos de `origin/eduardo-07112026`, commit de origem `29e7b1aa04e36e8d52442c89c0755ca7615dd4c8`.
- Corrigida a ordem da diretiva `"use client"` em `src/app/app-domain/planejamento/saude-15/Saude15Client.tsx`, causa do erro de build da versão recebida.
- `npm run build`: **PASS**, incluindo cobertura, integridade de arquivos de migração, 17 partições TypeScript e build Next.js completo.
- Verificação auxiliar TypeScript das partições que contêm os carregadores e seeds alterados: executada separadamente do build de produção.
- Sem alteração de schema ou nova migração neste checkpoint. Importação de catálogos e população de registros são mudanças de dados.

## Continuidade

1. Prosseguir nos demais pacotes pelas operações de domínio e reconciliar cada tabela com o censo inicial.
2. Completar os cenários especializados e seus documentos; validar perfis e navegação por roteiro.
3. Repetir o censo após as próximas cargas e registrar cobertura efetiva de banco, fluxo e navegador separadamente.
4. Reproduzir o aviso GED na versão publicada se ainda ocorrer; medir a área útil antes de alterar a composição compartilhada.
