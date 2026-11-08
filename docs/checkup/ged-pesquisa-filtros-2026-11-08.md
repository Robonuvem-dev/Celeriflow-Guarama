# GED: organização do pop-up de filtros da Pesquisa avançada

## Diagnóstico visual e de código

Rota principal: `/assinatura-digital/pesquisa` → Filtros. A mesma composição é usada em `/assinatura-digital/acervo`.

Na versão anterior, a classe compartilhada `filterFields`, destinada ao contêiner de uma grade de duas colunas, estava aplicada a cada `label`. Assim, o texto do rótulo ficava numa coluna e o controle na outra; checkboxes assumiam uma caixa de aproximadamente 310 px de largura, e datas/números tinham apenas cerca de 19 px de altura. Não havia um contêiner vertical organizando os blocos, e o botão Aplicar aparecia antes do campo Setor e dos índices.

Reprodução autenticada em produção, com screenshots em 1366 × 768, 1280 × 720 e janela estreita de 390 × 844. A última é uma janela desktop estreita: não foi inferida uma política de celular somente pela largura.

## Alteração visual

- `src/components/signatures/ged/GedWorkspace.tsx`: grupos Pesquisa textual, Documentos e período e Opções da consulta; controles em duas colunas a partir do breakpoint `sm`, com rótulo acima do campo; checkboxes de 16 × 16 px junto ao texto; ações Aplicar e Limpar filtros depois dos critérios.
- `src/components/signatures/ged/GedSearchFields.tsx`: setor e índices com a mesma organização responsiva e altura de 36 px dos demais campos.

Reutilizados `OperationalFilters`, `OperationalPagedContent` e os tokens operacionais existentes. Preservados campos, modos de busca, regras de índices, permissões da Lixeira, seleção de documentos e parâmetros das consultas. A lista operacional e a paginação permanecem no shell compartilhado.

Não há alteração de banco, schema ou migração.

## Validação autenticada local

Origem: `http://localhost:3311`.

| Janela | Resultado visual | Interação |
| --- | --- | --- |
| 1366 × 768 | Uma parte; todos os controles dentro da área útil | Aplicar e limpar: HTTP 200; estado preservado ao fechar/reabrir |
| 1280 × 720 | Uma parte; todos os controles dentro da área útil | Aplicar e limpar: HTTP 200; estado preservado ao fechar/reabrir |
| 390 × 844, desktop estreito | Duas partes acessíveis; sem overflow horizontal | Critérios acessíveis pela navegação/foco; aplicar e limpar: HTTP 200 |

Conferidos modo de frase, distância, datas inicial/final, Favoritos, versões históricas e thesaurus no payload e na resposta da consulta. A limpeza restaurou os padrões (`words`, distância 5, datas vazias e opções desmarcadas). A consulta filtrada retornou zero documentos; a limpeza restaurou os 45 documentos acessíveis ao usuário de verificação. Nenhum erro JavaScript de página foi registrado.

As evidências locais de reprodução e validação estão, respectivamente, em `C:/Users/trici/AppData/Local/Temp/opencode/ged-filters-before-2026-11-08/` e `C:/Users/trici/AppData/Local/Temp/opencode/ged-filters-after-2026-11-08/`.

`npm run build` concluído com sucesso antes da publicação, incluindo as 17 partições de TypeScript e a compilação otimizada Next.js.
