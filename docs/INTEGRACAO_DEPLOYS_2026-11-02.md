# Integração dos deploys — 02/11/2026

## Origem das alterações

- Produção anterior: `d507684f` (Smart TV/BI).
- `185fdd74` e `c189c720`: os dois Previews aprovados são incrementos sucessivos de `feat/cf10-cf30-cf33-mateus`. Integrar o segundo preserva os dois commits.
- `96338683`, já integrado em `d5059106`: requisitos CF22, CF23, CF27 e CF28. O Preview falhou por ausência do evento de auditoria `CEMETERY_EXTERNAL_ENTRY_REGISTERED`; a tentativa de produção falhou na conferência do prefixo SQL.
- `7075a015`: Ação Social e correção do contrato de auditoria, presentes no fork `thiagomorcatty/Celeriflow-Guarama`, mas ainda ausentes da `main` de `Robonuvem-dev/Celeriflow-Guarama` no início desta integração.

## Compatibilidade do banco

A consulta de planejamento, somente leitura, reconheceu os 187 recibos instalados com as fontes desta versão. As quatro migrações de Ação Social já estavam registradas no banco e precisam acompanhar o código publicado. A versão anterior do repositório de deploy continha somente 183 fontes, causando o bloqueio por prefixo desconhecido.

A migração inédita de reciclagem foi movida de `20261101120000_cf10_recycling_stock` para `20261102120000_cf10_recycling_stock`, depois do último recibo instalado (`20261101200000_social_municipal_operation`). O conteúdo SQL foi preservado. Referências no schema, teste e documentação foram atualizadas individualmente.

O branch antigo `fix/cf04-migration-order` contém uma correção superada pelo commit `7c0c8068`: os nomes CF04 efetivamente instalados são `20261031140100_ombudsman_configuration` e `20261031140200_ombudsman_classification`. Esses nomes e suas fontes permanecem preservados.

O executor continua validando a autoridade SQL, posições, checksums e provas históricas antes de aplicar novas migrações. O build de produção aplica a migração pendente pelo fluxo existente.

## Configuração e publicação

- Projeto existente: `celeriflow-dev/celeriflow-guarama`.
- Repositório conectado: `Robonuvem-dev/Celeriflow-Guarama`, branch de produção `main`.
- Publicação por push GitHub → integração Vercel, com o novo commit criado pela identidade Git `Robonuvem-dev <343586278+Robonuvem-dev@users.noreply.github.com>`.
- Variáveis de ambiente, integrações, domínios e agendamentos existentes foram mantidos.

## Verificação da integração

- `npm run build`: aprovado, com 3.531 fontes, 1.040 validações de rotas e 16 partições de tipos; compilação e geração das 109 páginas estáticas concluídas.
- Testes direcionados de reciclagem, Ação Social, Smart TV e referências fiscais: 49 aprovados, sem falhas ou ignorados.
- Renderização do estoque de reciclagem: 3 aprovados, sem falhas ou ignorados.
- O teste de replay histórico foi ajustado para conferir o checksum dos bytes realmente executados e sua normalização contra a prova arquivada. Um checkout Windows pode já conter os mesmos bytes da variante instalada; a desigualdade entre os hashes não é uma garantia válida. As verificações de integridade e de rejeição de provas alteradas continuam ativas.
- Testes do executor SQL: os 28 demais cenários passaram na execução inicial; o cenário de replay histórico passou após o ajuste de portabilidade, totalizando 29 cenários validados.

Os commits de origem e os deploys anteriores permanecem no histórico. Esta integração publica conjuntamente os incrementos existentes; o status de um deploy antigo continua sendo o registro daquela tentativa.
