# Plano final de implantação — módulos integrados

## Escopo e controle

Este plano reorganiza a execução solicitada em 13/10/2026. Abrange Tributação, Financeiro/Contabilidade, Planejamento Prefeitura/Câmara, Custos e Controle Interno, com as dependências setoriais expressamente exigidas pelos checklists originais. A referência de requisitos continua sendo `docs/poc-p0/CONTROLE_REQUISITOS.json`: 1.052 IDs. A baseline não será reescrita para aparentar atendimento.

Os registros históricos descrevem implementações, não conclusão. Cada frente abaixo exige produtor, consumidores, interface, persistência, reversão, escopo e evidência correspondente. Situação inicial de todas as frentes: **ABERTA**. Configuração municipal ausente e homologação externa terão dependência concreta identificada por requisito; não justificam deixar desenvolvimento interno possível pendente.

## Diagnóstico de partida

- Alterações locais acumuladas em schema, serviços, actions, telas, rotas e testes; nove migrations novas de 14/10 ainda preparadas, além das anteriores conforme histórico municipal.
- P1 tem de-para, identidades e classificações locais, mas faltam dimensões analíticas completas, revisão integral das origens e integração dos consumidores.
- P2–P4 possuem cadeias canônicas, porém variantes financeiras, reversões, reconhecimento e produtores precisam da reconciliação integral com o checklist.
- P5 tem lotes anuais e jornadas tributárias, sem comprovação integral de cadastro/base/virada, parcelamento/DA/fiscalização e canais.
- P6 tem ledger de custos, valorização e fluxos de Controle; devoluções entre exercícios, transferências/reversões documentais, DDR/passivos e integralidade dos critérios permanecem abertos.
- P7 tem composições fiscais e documentos, mas não todos os subquadros/composições/layouts e formas de assinatura requeridos.
- Não há resultado de Prisma/lint/testes/build que valide o conjunto local recente.
- `main` está atrás de `origin/main` em dois commits conhecidos: `5adcd1a` e `e513831`. Integração e conferência final serão necessárias antes de encerrar o Git.

## Sequência executável

| Ordem | Frente e dependência | Trabalho a concluir | Critério de saída |
|---|---|---|---|
| 01 | Reconciliação do escopo, todas as fases | Confrontar requisito/subcritério com código, tela, origem e consumidor; registrar lacuna concreta e tarefa. Identificar alterações remotas pertinentes e preservar o trabalho local. | Cada lacuna possui ID do checklist, arquivos, comportamento esperado e condição de evidência; nenhum requisito é concluído por busca lexical. |
| 02 | Fundação P1 | Fechar ente/UG/exercício nos comandos, consultas, jobs, relatórios e portais; validar identidade completa; classificações versionadas e de-para; dimensões por linha, fonte e base MSC; Decimal e legado documentado. | Prefeitura/Câmara independentes; origens explícitas; versões e dimensões preservadas; erros e ambiguidades recusados; consolidação autorizada. |
| 03 | Cadeia fiscal-financeira P2 | Constituição, guia, arrecadação corrente de dívida histórica, excesso, restituição, compensação, dívida ativa, extinção, benefício/renúncia e estornos; fechar NFS-e/ISS/ITBI e realizado do Planejamento. | Mesma origem em débito/tesouraria/contabilidade/realizado; replay sem duplicação e rollback integral; renúncia LRF distinta do crédito do contribuinte. |
| 04 | Execução, tesouraria e ciclo anual P3 | Itens/subempenhos/liquidações, pagamentos parciais/lotes/retenções/extras, cronologia, conciliação N:N e saldos por data; encerramentos, abertura e RP por estágio, cancelamentos e desfazimentos. | Bruto/líquido/extras/fonte/banco/dotação conciliados; períodos fechados impedem todas as origens; novo exercício e RP independentes por ente. |
| 05 | Produtores e patrimônio P4 | Folha/provisões/encargos/baixas, compras/contratos/reservas, patrimônio/depreciação/estoque, obras, diárias/adiantamentos, transferências/instrumentos exigidos. Resolver consumo/devolução entre exercícios e reversões documentais. | Origem setorial e financeira preservadas na mesma transação; reconhecimento no estágio correto; reversões sem resíduos nem custo duplicado. |
| 06 | Jornadas internas P5 | Cadastro e histórico fiscal, avaliações/bases e virada, cálculo/pagamento/descontos/mínimos, lotes duráveis, parcelamento/DA/fiscalização, NFS-e/escrita/DMS/RPS/ITBI e lacunas de Planejamento. | Operações exigidas acessíveis por UI com seletores/editoração, permissões, regras ajustáveis e memória; IDs/JSON livres não substituem a interface requerida. |
| 07 | Custos e Controle P6 | Fechar os 31 critérios de Custos e os 36 de Controle: produtores, objetos/itens/regras/cópia, apropriação/estorno/restauração, documentos/auditorias/agenda, consultas e quatro diagnósticos, incluindo DDR/passivos por fonte. | Valores líquidos e histórico conciliados; fontes incompletas não avaliadas; documentos, responsáveis e independência comprovados. |
| 08 | Motor fiscal, relatórios e publicação P7 | Composições e subquadros RREO/RGF/DCASP/LOA e relatórios específicos; mesma base fiscal para Financeiro/Planejamento/Controle; formatos, assinaturas, anexos e publicação idêntica ao arquivo arquivado. | Conferência aritmética/visual por versão/ente; origem analítica; assinatura na forma exigida e bytes/hash consistentes; nenhuma síntese parcial rotulada como demonstrativo integral. |
| 09 | Canais internos P5/P7 | Contribuinte, contador, tabelionato, beneficiário, fornecedor e canal móvel NFS-e nos limites exigidos; downloads, autenticidade e ações contra o domínio canônico. | Jornada autenticada com ACL, escopo, histórico e artefatos; não depende de simulador para representar operação real. |
| 10 | Arquivos e conectores P9/P10 | Layouts versionados SIM-AM/MSC/SIOPE/SIOPS/REINF, bancos/OFC/OFX/remessas/retornos, escrita/Simples/DES-IF/CRA e conectores exigidos de banco/PIX/NFS-e/ADN/SEFAZ/eSocial/e-mail/assinatura. | Contratos implementados e arquivos originais preservados; validação e protocolos reais quando disponíveis; dependências externas identificadas individualmente. |
| 11 | Verificação agrupada P8 | Após implementação prevista: Prisma validate/generate; migrations completas em PostgreSQL descartável; lint; regressões transacionais, concorrentes e cruzadas importantes; build. Corrigir falhas até aprovação. | Resultados atuais registrados com escopo, comandos e cenários. Não usar banco municipal para testes destrutivos ou concorrentes. |
| 12 | Implantação, integração Git e aceite P11 | Conferir migrations municipais pendentes e aplicar deploy preservador; conferir configuração; integrar upstream com resolução individual de conflitos; repetir verificações afetadas; commit final do conjunto revisado. Registrar evidências por checklist/ente e dependências de conferência do usuário. | Deploy sem reset/perda de IDs, build aprovado antes do commit, árvore e integração Git conhecidas; atendimento contado por requisito, sem declarar 1.052/1.052 enquanto houver pendências. |

## Regras de execução

1. Trabalhar na ordem das dependências. Uma nova descoberta volta à frente de origem e recebe tarefa concreta; não abre outra arquitetura paralela.
2. Conferir todos os consumidores antes de alterar contratos exportados. Preservar os retornos de erro esperados pelas UIs.
3. Modelos/migrations devem preservar IDs, evidências, valores e histórico. Classificação ou saldo sem prova não recebe inferência automática.
4. Parâmetros municipais estimados são explícitos, ajustáveis e versionados. Não inventar lei, conta bancária, certificado, convênio ou protocolo oficial.
5. Configuração externa ausente não impede concluir serviços, validações, UI, contratos e testes internos correspondentes.
6. Não efetuar commit final nem declarar implantação pronta enquanto houver bloqueador interno conhecido ou verificação técnica obrigatória pendente.

## Verificação e preservação do ambiente

- Prisma usa `prisma.config.ts` e `prisma/migrations-ibema`.
- Regressão PostgreSQL descartável: `scripts/verify-planning-postgres.mjs`, com ferramentas instaladas no diretório temporário aprovado. Sem reset municipal.
- Lint: `npm run lint` no escopo pertinente; ampliar para o conjunto após correções que exijam isso.
- Build obrigatório: `npm run build`, com memória Node adequada ao projeto.
- Deploy municipal: `prisma migrate deploy`, somente após validação das migrations e integração do código.
- Git: revisar diffs/untracked, integrar os commits remotos identificados, resolver conflitos individualmente e validar o resultado antes do commit final. Não incluir arquivos sensíveis nem artefatos temporários.

## Registro de execução corrente

- Plano refeito e registrado. Inventário inicial do Git, scripts, schema/configuração e registros de pendência lidos.
- Primeira lacuna selecionada na cadeia 02 → 05 → 07: dimensões analíticas e reconhecimento/retorno de consumo entre exercícios. Esta seleção não encerra as demais tarefas da sequência.
- Migrations, lint, testes e build ainda não executados nesta retomada.
- Fila individual criada em `docs/poc-p0/CONTROLE_IMPLANTACAO_FINAL.json` com 1.052 IDs e baseline preservada. Implementações/revisões correntes e limites estão em [registro da sequência final](poc-p0/EXECUCAO_PLANO_FINAL_2026_10_13.md).
