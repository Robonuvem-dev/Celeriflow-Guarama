# Sprint 04 — consulta de textos jurídicos

## Incremento 01 — impressão, requisito 33.7

O cadastro jurídico oferece **Imprimir texto jurídico** também para perfis de consulta. O link fixa a versão exibida na tabela. A página de impressão permite imprimir ou salvar em PDF pelo navegador, com texto integral, parágrafos, ementa e data de publicação da versão. Tipo, número, esfera e órgão continuam vindos da identificação atual do ato, pois esses campos não têm snapshot na versão legada.

A rota exige acesso ao módulo CADASTROS antes de consultar. A versão pedida é filtrada no banco; versão inexistente retorna 404, sem substituição silenciosa. O HTML escapa dados, preserva quebras de linha e bloqueia scripts/conexões externas por CSP. Resposta privada sem cache. Não depende de GED, novo schema, migração ou alteração do portal 33.6.

**Validação:** 2 testes de renderização, 3 testes da rota com dependências de identidade e banco simuladas e 4 testes de navegador do cadastro com fixture, incluindo o link para a versão exibida e a geometria padrão. Tipos dos arquivos alterados, dependências e teste TypeScript aprovados. Sem homologação autenticada ou build integral; este permanece pendente pelo bloqueio Windows/Turbopack registrado.

Próximos itens: consulta e filtros jurídicos (33.1/33.3/33.5), vínculos entre atos (33.10) e comentários (33.13). 33.6 continua sob responsabilidade do Eduardo. Pendências da Sprint 03: armazenamento binário direto e desempenho (33.11), e origem da integração (33.15).
