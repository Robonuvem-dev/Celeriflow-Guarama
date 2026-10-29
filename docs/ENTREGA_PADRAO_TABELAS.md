# Entrega consolidada — padrão de tabelas

**Data:** 29/10/2026. **Situação:** implementação integral do escopo reconciliado; validação efetiva delimitada abaixo. Referências: [plano e diagnóstico histórico](PLANO_ADEQUACAO_PADRAO_TABELAS.md), [inventário histórico](INVENTARIO_TABELAS_CELERIFLOW.md) e [contrato da API](TABELAS_CONTRATO_EXECUCAO.md).

## 1. Cobertura implementada

| Escopo reconciliado | Resultado |
|---|---:|
| Estruturas operacionais com rota da base | **330/330 implementadas** |
| Estruturas legadas | **6/6 implementadas**, sem presumir novas rotas consumidoras |
| Grades de edição/seleção, contadas à parte | **32/32 implementadas** |
| Formatos especiais | **7 preservados** |
| Scanner estrito | **PASS** |
| Definições atuais de renderização | **395** |
| Caminhos atuais de rota válidos | **377**, sendo **371 operacionais** |

A reconciliação das **340 rotas históricas** identifica **335 no mesmo destino, uma realocada e quatro associações falsas por importação**, sem renderização efetiva na base. Definições, caminhos e estruturas lógicas são medidas diferentes: não somar esses números. O inventário original permanece **330 + 6 + 7 = 343**, em 298 arquivos; as 32 grades não são acrescidas a esse total.

### Cobertura por módulo/origem da base reconciliada

Todas as quantidades operacionais e legadas abaixo estão implementadas; os especiais estão preservados. Componentes compartilhados são contados uma única vez na origem, inclusive os consumidos por Planejamento/Câmara.

| Módulo/origem | Operacionais | Legadas | Especiais | Total histórico |
|---|---:|---:|---:|---:|
| Administração | 7 | 1 | 0 | 8 |
| Atendimento | 2 | 1 | 0 | 3 |
| Auditoria | 1 | 0 | 0 | 1 |
| Cadastros | 8 | 0 | 0 | 8 |
| Câmara | 8 | 0 | 0 | 8 |
| Cemitérios | 4 | 1 | 2 | 7 |
| Compras e Contratos | 15 | 0 | 3 | 18 |
| Configurações | 4 | 0 | 0 | 4 |
| Controle Interno | 5 | 0 | 0 | 5 |
| Esportes e Cultura | 3 | 0 | 0 | 3 |
| Documentos/GED | 3 | 0 | 0 | 3 |
| Educação | 3 | 0 | 0 | 3 |
| Financeiro e Contábil | 25 | 3 | 0 | 28 |
| Frotas | 1 | 0 | 0 | 1 |
| Indicadores | 1 | 0 | 0 | 1 |
| Meio Ambiente | 9 | 0 | 0 | 9 |
| Obras e Construção Civil | 14 | 0 | 0 | 14 |
| Almoxarifado e Patrimônio | 14 | 0 | 0 | 14 |
| Portal do Servidor | 15 | 0 | 0 | 15 |
| Processos/Protocolo | 8 | 0 | 0 | 8 |
| RH e Folha | 23 | 0 | 1 | 24 |
| Água e Saneamento | 7 | 0 | 0 | 7 |
| Saúde | 27 | 0 | 0 | 27 |
| Segurança e Mobilidade | 1 | 0 | 0 | 1 |
| Assistência Social | 12 | 0 | 0 | 12 |
| SST | 23 | 0 | 0 | 23 |
| Transparência — administração | 8 | 0 | 0 | 8 |
| Tributação | 49 | 0 | 0 | 49 |
| Componentes compartilhados | 20 | 0 | 0 | 20 |
| Portal público | 10 | 0 | 1 | 11 |
| **Total** | **330** | **6** | **7** | **343** |

## 2. Contrato entregue

- Fonte-base **13 px**, linhas de **24 px**, paginação de **20 registros**. Filtros e ordenação antecedem o recorte; totais e exportações preservam o conjunto correspondente.
- Texto integral acessível; acionador de detalhe condicional ao overflow ou à necessidade de conteúdo composto, sem ícone redundante para texto que cabe.
- Redimensionamento redistributivo, sem ampliar a soma das larguras, com persistência da preferência do usuário, teclado e restauração.
- Sidebar de **56 px recolhida** e **208 px expandida**; header do workspace **36 px**, toolbar **32 px**, cabeçalho tabular **24 px** e rodapé **28 px**.
- Formulários e grades aninhadas usam painel operacional preservando contexto, estado e rascunhos. Conteúdos complexos e filtros no desktop usam organização paginada, sem rolagem livre.
- **Tablets e celulares:** rolagem autorizada pelo usuário. Essa exceção não se estende ao desktop nem depende apenas de um breakpoint de largura.
- Os sete especiais conservam semântica de documento, impressão ou informação: relatório de sepultados, guia de arrecadação, três tabelas do relatório imprimível de instrumento, demonstrativo de folha e tabela de cookies.

### Limites de geometria

Não existe garantia de encaixe em qualquer largura/altura arbitrária de desktop. O orçamento mínimo registrado para a área de corpo é **504 px**; 20 linhas nominais de 24 px ocupam 480 px. Toolbar, cabeçalho, rodapé e demais ancestrais também precisam caber na altura útil. Mínimos reais das colunas condicionam a largura necessária. Não reduzir automaticamente a fonte, esconder campos ou recortar registros para declarar conformidade. Zoom altera a área útil em pixels CSS e ainda requer confirmação na matriz real.

## 3. Evidências e estado de validação

| Verificação efetivamente registrada | Resultado e alcance |
|---|---|
| Scanner/reconciliação estrita | **PASS**; cobertura estrutural, não certificação visual |
| Base no navegador | **318 casos PASS** |
| Filtros no navegador | **11 casos PASS** |
| Edição de Compras no navegador | **1 caso PASS** |
| Saúde — wrappers/composições reais | **28 wrappers, 104 observações PASS** |
| Portal público real, build final | **9/9 cenários PASS, 12/12 painéis prontos, 42 capturas**, zero erros JavaScript/HTTP; as duas correções de largura foram confirmadas em produção local recompilada |
| Offline | Rodada de **20 testes de topo PASS**; agregador ampliado posteriormente |
| Contratos históricos | **47 verificações PASS**, sem trocar fingerprints históricos pela nova UI |
| Agregador final de domínio | **50/50 testes PASS em 12 suítes**, incluindo Saúde, Social, ITBI, validação de Tributação e submissão integral fora da página |
| Build completo final | **PASS** após os ajustes públicos: 14 partições de tipos, 3.245 fontes, 938 validações; Next.js **16.4.3**, 95 páginas estáticas compiladas |

**Fechamento:** `npm run build` final aprovado em ambiente `VERCEL_ENV=preview`, sem execução de deploy SQL. A revalidação das páginas públicas está em [rotas-publicas-execucao.md](tabelas-lotes/rotas-publicas-execucao.md). O agregador usa arquivos explícitos para que diretórios Next `[id]` não sejam omitidos por expansão de glob; confirmou a execução dos cinco testes clínicos nesse caminho.

**Limites da validação:** não foi percorrido o conjunto integral de rotas autenticadas, pois não havia sessão disponível. A matriz real completa de zoom ainda não está homologada. Portanto, **330/330 implementadas não significa homologação visual global**; as aprovações acima se limitam aos casos realmente exercitados.

## 4. Banco, integração e rastreabilidade

- **Drizzle como única dependência ORM**, zero imports Prisma; gate de dependências/CI aprovado.
- Histórico SQL de **156 + 2 arquivos verificado e preservado**. A integração conciliou as correções de consultas SQL em três páginas de Patrimônio, sem reescrever o histórico validado.
- Merge fast-forward registrado de `cb281d4b` para `b9fad738`; backup de stash: `1b20f5f681182593626d74aa39126efee7ae709f`.
- Pulls concorrentes observados: `ef0fd523` e `b199957c`. Durante o fechamento apareceu o commit concorrente **`9d0b98e1 — padronização de tabelas`**, com `main` sincronizada com `origin/main`. O código de produção validado já está nesse commit; relatório consolidado, registro público e ajustes finais do agregador/verificador permanecem no estado local de trabalho.
- O executor realizou a integração por fast-forward e a conciliação dos arquivos. Não executou novo commit, push ou deploy; publicação Vercel não foi verificada nesta entrega.

## 5. Reprodução das verificações

Executar na raiz do repositório. Os comandos de scanner são de leitura; os demais produzem os artefatos de verificação/build correspondentes.

```powershell
# Reconciliação atual, incluindo todos os IDs e consumidores.
node scripts/verify-operational-coverage.mjs --strict
node scripts/verify-operational-coverage.mjs --check-reconciliation
node scripts/verify-operational-coverage.mjs --json

# Resumo da base no navegador e execução das rotas.
node scripts/verify-operational-browser.mjs --summary
node scripts/verify-operational-routes.mjs --run

# Contratos da base e filtros.
node --import tsx --test tests/operational-table.test.ts
node --test tests/operational-filters.browser.test.mjs

# Gate de migração/dependências e integridade dos arquivos SQL.
npm run verify:database-migration
npm run db:migrate:verify

# Reproduzir a compilação completa.
npm run build
```

As execuções de navegador dependem do ambiente e das URLs de teste configurados nos respectivos verificadores; rotas autenticadas exigem sessão válida. Esses comandos permitem reproduzir verificações, mas não substituem o registro de resultados do build final e das interações reais.

## 6. Como adicionar uma nova tabela

1. Declarar `OperationalColumn[]` em conformidade com `src/lib/operational-tables.ts`: chave, rótulo, tipo, larguras inicial/mínima/máxima e política de detalhe. Não ocultar campos para caber.
2. Preparar `OperationalRow[]` para `OperationalTable`, com `id` estável e `values` contendo texto integral. Usar `cells`/`actions` para preservar links, controles, seleção e permissões.
3. Aplicar filtros/ordenação antes da paginação e passar no máximo `OPERATIONAL_PAGE_SIZE` (**20**) registros. A tabela não filtra nem recorta dados automaticamente. Ajustar a página ao filtrar ou excluir.
4. Compor `OperationalListFrame`, `OperationalTable` e `OperationalPagination`; para paginação de servidor/URL, usar `OperationalLinkPagination`. Definir `preferenceId` estável e exclusivo; usar `resetVersion` quando necessário para invalidar preferências incompatíveis.
5. Manter busca na faixa compacta e filtros excedentes em `OperationalFilters`. Em formulários, usar `OperationalTablePanel` e manter estado/rascunho no contexto apropriado, inclusive ao paginar e abrir/fechar painéis.
6. Registrar rotas reais no manifesto de `src/components/app-ui/operational/modules/`, integrado pelo índice. Variantes de formulário e documentos precisam da composição correspondente, preservando parâmetros e ações.
7. Validar 21 registros, última página, vazio/carregamento/erro, texto longo, detalhes condicionais, redimensionamento, persistência, filtros e estado não salvo. Conferir o orçamento desktop e a exceção de tablet/celular; registrar separadamente implementação e evidência visual. Executar reconciliação estrita e build.

Assinaturas e propriedades detalhadas estão no contrato de integração e nos componentes atuais em `src/components/app-ui/operational/`. Preservar contratos de Server Actions e seus consumidores ao integrar a nova listagem.
