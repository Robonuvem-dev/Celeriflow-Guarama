# BI e Smart TV — cobertura de tabelas

Data: 31/10/2026.

## Inventário

| Tela | Estrutura compartilhada | Configuração |
| --- | --- | --- |
| Administração → Smart TV → Organizar páginas | `OperationalTablePanel`, `OperationalListFrame`, `OperationalTable`, `OperationalPagination` | Ordem, página, tipo, duração e ações; 20 registros por página; larguras por usuário; detalhe integral quando houver truncamento |

O formulário de composição é um editor com rolagem interna. O player público é uma apresentação gráfica com páginas rotativas, sem tabela operacional ou rolagem. Comparativos e conjuntos de indicadores são distribuídos em páginas conforme o espaço de exibição.

## Homologação

Ensaio conectado registrado em `docs/BI_SMARTTV_HOMOLOGACAO_RESULTADO.json`, run `7d7c52e1-b257-401f-9632-ca377e4be552`, status PASS. A programação foi duplicada apenas no estado local do editor até 21 páginas: primeira página com 20 linhas e segunda com 1. Essas duplicações não foram publicadas.

Os cabeçalhos/ações e a geometria seguem os componentes globais; não há implementação própria de redimensionamento ou popup de detalhe. Captura da tabela: `pages-table.png` no diretório de evidências indicado no JSON.

O player público foi conferido em 1280×720, 1920×1080, 3840×2160 e 390×844, sem rolagem global/overflow, incluindo composição mista com categorias longas. Isso cobre o navegador Chromium; o teste no modelo de TV do município continua previsto no plano.
