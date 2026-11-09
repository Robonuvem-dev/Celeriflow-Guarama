# Limpeza da documentação — 09/11/2026

Executada após a entrega do [relatório dos 33 módulos da POC](RELATORIO_POC_33_MODULOS_2026-11-09.md), conforme a prioridade solicitada.

## Resultado

| Medida | Resultado |
| --- | ---: |
| `docs` antes | 1.049.500.356 bytes — aproximadamente 1,05 GB |
| Arquivos antes | 2.343 |
| Arquivos removidos | 1.852 |
| Volume removido | 989.883.601 bytes — aproximadamente 989,9 MB |
| `docs` após remoção e inclusão do relatório/evidências/manifesto | aproximadamente 66 MB |
| Redução líquida aproximada | 93,7% |

Tamanhos em unidades decimais. Os novos documentos explicativos acrescentam poucos quilobytes à medição posterior.

## Conteúdo retirado

- **137 anexos históricos** em `docs/Novos docs/Novos docs`: documentos-fonte e partes de arquivo de importações anteriores, recuperáveis no Git.
- **1.714 capturas PNG** em `docs/checkup`: evidências visuais geradas por verificações anteriores. Relatórios JSON/MD, inventários e arquivos usados como entrada por scripts foram mantidos.
- **PDF de 113 páginas da POC**, em `docs/Validação`, após a auditoria. Foram preservados texto dos 2.661 requisitos, páginas e SHA-256 em [requisitos-fonte.json](poc-auditoria-2026-11-09/requisitos-fonte.json). Uma cópia temporária do original também está identificada no manifesto.

## Documentação preservada

Padrões obrigatórios de tabelas e formulários, guias de operação, migrações e recuperação, contratos de integrações, acervo de teste GED usado por scripts, relatórios textuais/estruturados, documentação de matrículas e os novos artefatos da auditoria.

A análise de limpeza foi de uso e referências dos arquivos. O relatório da POC é inspeção funcional de código; as capturas retiradas não representam uma nova validação visual.

## Recuperação e dependências

- [Manifesto completo](limpeza-2026-11-09-manifesto.json): caminho, tamanho, SHA-256, blob Git e commit de recuperação por arquivo.
- Todos os arquivos rastreados removidos foram comparados ao commit `aeaf772b646b31ee0f1644b68d8ce9eac1eb47a4` antes da exclusão. Arquivos novos ou modificados fora do manifesto não foram removidos.
- Para recuperar um arquivo rastreado: `git restore --source=aeaf772b646b31ee0f1644b68d8ce9eac1eb47a4 --worktree -- "caminho/do/arquivo"`.
- `scripts/import-transparency-archive.ts` exige restaurar o acervo antes de uma reimportação. O catálogo documental referido pelo script já estava ausente antes da limpeza. Consulte [instruções do acervo](Novos%20docs/LEIA-ME_SINCRONIZACAO.md).
- Referências históricas a capturas PNG exigem restaurar o arquivo pelo manifesto. Scripts de checkup mantêm seus relatórios e inventários de entrada e podem gerar novas capturas.
- Não foram encontradas dependências desses diretórios em `src`; `next.config.ts` já exclui `docs` do tracing de runtime.

## Alterações técnicas

- Banco/schema: nenhuma alteração nesta limpeza/auditoria.
- Telas e tabelas visuais: nenhuma alteração nesta limpeza/auditoria.
- Histórico Git: preservado. A redução é da pasta `docs` na árvore de trabalho; os objetos já existentes em `.git` continuam no histórico.
- Não foi necessário novo build para a edição exclusivamente documental. O build completo do código auditado já estava aprovado; nenhum commit/push foi realizado nesta etapa.
