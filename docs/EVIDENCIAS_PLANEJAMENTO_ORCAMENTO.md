# Planejamento e Orçamento — controle de ensaio e aceite

Data de preparação: **11/10/2026**. Meta independente: **EXE-01 99/99 e LEG-01 99/99**.

## Estado verificado da instância configurada

Consulta read-only (`scripts/verify-planning-readiness.ts`): módulos PLANEJAMENTO/CAMARA/FINANCEIRO/DOCUMENTOS/TRANSPARENCIA ativos; storage configurado; **zero instrumentos e zero orçamentos implantados**. Tabelas de catálogo/publicação ainda ausentes. Migrations pendentes:

1. `20261011200000_planning_accounting_command_integrity`.
2. `20261011210000_planning_catalog_maintenance`.
3. `20261011220000_planning_publication`.

Não foi fornecida sessão autenticada de ensaio nem instância isolada de aplicação com o ciclo e perfis configurados. **Ensaio em navegador autenticado: não executado.** As suítes PostgreSQL/HTTP são evidências técnicas e não substituem o aceite de cada item.

## Matrizes individuais

- [Prefeitura — 99 registros de evidência](EVIDENCIAS_PLANEJAMENTO_PREFEITURA.md).
- [Câmara — 99 registros de evidência](EVIDENCIAS_PLANEJAMENTO_CAMARA.md).

Cada linha referencia o texto integral do requisito de mesmo número no plano principal. Todos os subcritérios daquele texto precisam de prova; uma captura/menu ou teste relacionado não conclui a linha. Nenhuma linha foi promovida a homologada pela preparação destes documentos.

## Roteiros de ensaio

| Ref. | Cenário e pré-condições | Evidência mínima |
|---|---|---|
| R1 | Audiência/demandas/anexos: dois entes, mais de 20 registros, contato/bairro/órgão/status e arquivos GED | Navegação, cadastro/análise, arquivo e hash, leitura/download direto recusados fora do escopo |
| R2 | Catálogos/códigos: edição oficial por exercício, árvore, graus/níveis e configuração de rateio | Fonte/natureza vigentes, 101% recusado, divisão por centavos, código composto/reordenação, versões antigas preservadas |
| R3 | Elaboração/manutenção: PPA quatro anos, LDO/LOA, programas/ações/objetivos/indicadores/metas, obras, memórias e renúncia | Todos os campos oficiais; alteração/exclusão sem dependência; revisão de fechado com ato e snapshots; paginação/seletores |
| R4 | Importação/virada: origens requeridas, ano explícito, estrutura/valores/realizado, prévia/mapeamento | Totais/erros, estágio/corte, replay, mudança da prévia, rollback e origem intacta; resumo das relações não copiadas |
| R5 | Histórico/compatibilidade: dois atos e cortes, versões, realizado físico, PPA↔LDO↔LOA | Original/posição por data, hash, todas as variantes de consulta, mapeamento/propagação/estorno exatamente uma vez |
| R6 | Emendas/Câmara: proponente, aprovador, sancionador distintos; vereador/proposição/ato canônicos | Bloqueio, aprovação/rejeição/parcial nas três peças, efeitos apenas dos itens sancionados e tramitação/GED |
| R7 | Programação/cotas: três períodos e todos os métodos com históricos reais | Doze meses, previstos/realizados, reservas, contingenciamento/liberação/fechamento/redistribuição e concorrência |
| R8 | Crédito/implantação/consumidores: regras contábeis oficiais, preparação futura e exercício aberto | Reserva de anulação, partidas balanceadas, falha com rollback integral, reserva em Compras sem empenho futuro, estornos |
| R9 | Relatórios/índices: modelos oficiais e composições aprovadas, fechamentos/RCL e benefícios tributários | Cada saída/variante, todos os filtros, mesmos totais tela/PDF/CSV, execução não apurada distinta de zero |
| R10 | Emissão/publicação: storage/portal do ensaio, autor autorizado, versão legal publicada | Mesmo arquivo/hash interno/público, URL sem sessão, falha/retry/lease, retirada, integridade e não exposição de rascunho |

## Registro obrigatório ao executar cada linha

ID do ente/item; todos os subcritérios; roteiro e dados utilizados; exercício/UG/fonte/peça/versão/corte; perfil e usuário de ensaio; rota; efeito persistido/partidas quando aplicável; documento/hash/URL; captura ou vídeo; testes relacionados; commit; data/executor; resultado e pendência.

Resultado permitido: NÃO_EXECUTADO, PARCIAL, FALHOU, ATENDE_TECNICAMENTE, HOMOLOGADO. Um resultado parcial não entra no numerador 99/99. A mudança para HOMOLOGADO exige demonstração e aceite registrado por ente.

## Execução disponível nesta rodada

- Publicação foi testada no serviço/handler HTTP público com PostgreSQL local, storage controlado e comparação de bytes/hash; não é ensaio da aplicação Next em navegador.
- Os testes de integração anteriores cobrem cenários de domínio e concorrência, documentados em S1/S2/S3–S7.
- Ainda é necessário preparar a aplicação isolada com as migrations, dataset Vila das Araucárias, tabelas/layouts oficiais, regras/perfis e autenticação. A instância configurada foi consultada, sem aplicação de migrations/carga operacional implícita.
- Smoke GET-only da aplicação Next compilada executado e aprovado: API/página públicas sem sessão, zero registros públicos e redirecionamento administrativo ao login. Registro detalhado: [S8/S9](PLANEJAMENTO_S8_S9_PUBLICACAO_E_ENSAIO.md). Não é ensaio autenticado em navegador.
