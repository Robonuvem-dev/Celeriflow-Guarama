# Pós-carga — Pastas inteligentes e Modelos

**Pedido adicional do usuário:** verificar essas duas telas depois de concluir a população. Se a tabela não atender aos itens do fluxo, implementar uma composição que atenda.

**Situação:** inspeção de código iniciada; reprodução visual, correção e reteste pendentes. Executar a etapa funcional/visual após os dados de B32/F48 estarem prontos.

## Achados de código

- Rotas: `/assinatura-digital/pastas-inteligentes` e `/assinatura-digital/modelos`.
- Ambas utilizam `src/components/signatures/ged/GedWorkspace.tsx`, `OperationalListFrame` e `OperationalTable`.
- As seções usam `listColumns`: Nome, Tipo/fase, Situação, Detalhes e Ações.
- A soma das larguras mínimas dessas colunas é **515 px**, antes de escalonar pela fonte raiz.
- `OperationalTable.tsx` calcula altura mínima de `(20 + 1) × 24 = 504 px` para o corpo da tabela, também escalonada pela fonte raiz. Header da página, filtros, margens e paginação demandam espaço adicional.
- Em desktop/notebook, o conflito é acionado se a largura não comporta as colunas **ou** a altura útil fica abaixo da mínima. A mensagem literal encontrada é: **“Esta área ainda não comporta a tabela no padrão.”**
- O componente expõe `data-fit`, `data-required-width`, `data-required-height` e `data-layout-conflict`, úteis para coletar evidência.

Esses achados localizam a condição da mensagem. Ainda é necessário medir os ancestrais, o viewport, a fonte, os cabeçalhos e a paginação da versão efetivamente acessada pelo usuário para confirmar a causa das duas ocorrências.

## Dados necessários à reprodução

1. **Pastas inteligentes:** ao menos 21 consultas elegíveis ao mesmo usuário/escopo, com nomes operacionais como “Contratos vigentes”, “Processos aguardando assinatura” e “Documentos da Educação”. Variar regra simples/composta, tipo, situação e compartilhamento; cada consulta encontra documentos existentes.
2. **Modelos:** ao menos 21 modelos úteis de tipos distintos, como “Despacho de encaminhamento”, “Termo de recebimento de materiais”, “Declaração de matrícula” e “Ofício de solicitação de documentos”. Cada modelo tem conteúdo/marcadores reais, versão e caso de geração.
3. Incluir nome longo, detalhes extensos, texto com acentos e permissões diferentes; manter os documentos gerados vinculados ao modelo correto.

## Diagnóstico e implementação

1. Abrir as duas rotas na versão alvo com o perfil do caso; registrar URL, versão, viewport e escala da fonte.
2. Medir largura/altura disponíveis do corpo e dos ancestrais, espaço de header/filtros/paginação, sidebar e wrappers. Conferir preferências de colunas por usuário, primeiro carregamento e redimensionamento.
3. Comparar com tela equivalente no shell operacional e com `docs/Padrão de Tabelas.md` e a seção 6 de `docs/ENTREGA_PADRAO_TABELAS.md`.
4. **Se o problema for espaço/composição:** corrigir distribuição e contenção com o shell compartilhado, reservando a área do corpo e da paginação e mantendo o menu recolhido em ícones.
5. **Se faltarem dados/ações no contrato da tabela:** criar a configuração de colunas/composição necessária ou estender o componente compartilhado. Para regra de consulta ou conteúdo de modelo, usar detalhe/editor contextual com `OperationalTablePanel` quando aplicável, conservando a semântica e o texto integral.
6. Preservar busca, paginação, IDs de preferência, permissões e todas as ações. Pastas: abrir consulta, editar regra/nome e excluir a própria consulta. Modelos: criar/importar, editar/nova versão, preencher marcadores e gerar documento.
7. Manter rascunho do editor, valores dos marcadores e seleção ao abrir/fechar painéis ou paginar. Não aninhar formulários.
8. A implementação deve cumprir o contrato global: 20 registros, fonte legível, colunas redimensionáveis, detalhes disponíveis, texto integral e rolagem conforme a política de dispositivo. Não ocultar o aviso por CSS, cortar conteúdo ou criar uma listagem HTML paralela para contornar a medição.

## Aceite

- Primeira página com 20 registros, segunda página e última página acessíveis.
- Busca/filtro abre o resultado esperado e mantém a paginação coerente.
- Todos os dados e ações continuam disponíveis nos perfis adequados.
- Regra de pasta abre os documentos correspondentes e permanece correta após edição.
- Modelo preserva versão, conteúdo e marcadores; documento gerado pode ser aberto/baixado e referencia a origem.
- Nomes/detalhes extensos são acessíveis integralmente; os campos legíveis não recebem detalhe redundante.
- Tela de notebook/desktop suportada sem conflito ou recorte, com a política documentada para tablet/celular. Medir especialmente 1366×768 e 1920×1080; coletar área útil, não apenas a resolução nominal.
- Estados vazio, carregando e erro permanecem utilizáveis; preferências e rascunhos são preservados.
- Registrar os testes executados e a evidência visual separadamente da inspeção. Rodar as verificações pertinentes e `npm run build` antes de commit/deploy da correção.

**Alterações de schema necessárias:** nenhuma identificada na inspeção inicial. **Alterações visuais:** a definir após medição e conferência dos requisitos das duas telas.
