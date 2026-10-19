# Portal da Transparência — operação e manutenção

## Acesso público

- `/portal/portaldatransparencia`: entrada temática, atalhos, busca, seções e avaliação da página.
- `/portal/portaldatransparencia/pesquisa?q=saude`: assuntos/serviços e documentos publicados, com filtros e paginação compartilháveis.
- `/portal/portaldatransparencia?view=despesas`: consulta de registros, filtros, detalhes e exportações.
- `/portal/portaldatransparencia/estatisticas`: indicadores agregados, com avaliações de atendimento e de usabilidade em seções distintas.
- `/portal/portaldatransparencia/painel`: painel financeiro existente.
- `/portal-transparencia`: redirecionamento compatível com a rota principal, conservando parâmetros.

URLs antigas com filtros e sem `view` continuam sendo interpretadas como consulta de publicações. O hub é apresentado quando a URL não solicita uma consulta.

## Gestão editorial

Em **Portal e Transparência → Apresentação e navegação** (`/transparencia/apresentacao`), usuários com permissão de atualização do módulo podem configurar:

1. Título e apresentação da página inicial.
2. Endereço institucional usado na URL canônica e no sitemap. Sem preenchimento, usa `NEXT_PUBLIC_PORTAL_URL`, `CELERIFLOW_PUBLIC_BASE_URL`, o domínio de produção da Vercel ou o endereço padrão do projeto, nessa ordem.
3. Até oito atalhos.
4. Títulos, descrições, ordem, visibilidade e fundamentos legais das seções.
5. Sinônimos adicionais para a busca de assuntos.
6. Destinos complementares internos/externos, com responsável e data de revisão.
7. Disponibilidade da avaliação de usabilidade das páginas.

As mudanças são registradas na auditoria e verificam a versão editada para evitar sobrescrever alterações simultâneas. Os destinos externos aceitam apenas HTTP/HTTPS, sem credenciais na URL; destinos relativos usam rotas `/portal/...`.

A visibilidade de uma seção organiza a navegação do hub. A publicação das consultas e documentos permanece em **Configurações e upload de documentos** (`/transparencia/publicacoes`): ocultar uma seção não despublica seus documentos. Para retirar o acesso público a uma consulta, desative a consulta na configuração de publicação.

## Pesquisa documental

A busca considera título, assunto, categoria documental e competência, sem diferenciar acentos ou caixa. Ela não extrai nem pesquisa o conteúdo integral dos PDFs.

Somente registros `PUBLISHED` de consultas habilitadas, entidades disponíveis e exercícios publicados podem aparecer. O serviço usa SQL parametrizado e devolve apenas metadados públicos. Os arquivos são acessados pelo endpoint de publicação, que revalida o acesso no download. Rascunhos e registros retirados não aparecem.

Os filtros documentais não alteram a busca de assuntos/serviços. Dentro de cada consulta, a pesquisa e os filtros de registros seguem o contrato próprio da coleção.

## Avaliações das páginas

- Endpoint de recebimento: `POST /api/transparencia/avaliacao-pagina`.
- Dados armazenados: chave de envio, tipo de página, assunto da consulta quando aplicável, nota de 1 a 5, comentário opcional e data.
- Não solicita nome/e-mail, não armazena a query string ou IP na avaliação e não requer protocolo de atendimento.
- Validação no servidor, verificação de origem, proteção contra envios repetidos com a mesma chave, campo antispam e limitação de frequência.
- Comentários ficam em `/transparencia/avaliacoes`, sob o controle de acesso do módulo. A página pública de estatísticas divulga somente agregados.
- A avaliação de e-SIC/Ouvidoria mantém seu fluxo próprio e sua relação com o pedido respondido.

Retenção: **365 dias**. A limpeza acontece no recebimento de avaliações e na rotina diária `GET /api/transparencia/manutencao`, configurada em `vercel.json` para 10h15 UTC. A rotina exige `Authorization: Bearer <CRON_SECRET>`, seguindo o padrão dos demais agendamentos do projeto. Também remove registros de acessos com mais de 90 dias. Em implantação fora da Vercel, configurar a chamada diária no agendador do ambiente.

Migração associada: `20261019010000_transparency_page_feedback`. Ela cria a tabela de avaliações sem alterar as avaliações de atendimento existentes. A migração foi aplicada ao banco configurado durante esta implementação; outros ambientes devem receber as migrações pelo fluxo usual de implantação.

## Monitoramento de destinos

Executar periodicamente:

```powershell
node --conditions=react-server --import tsx scripts/check-transparency-links.ts
```

O comando verifica os destinos publicados, informa os status HTTP e termina com código diferente de zero quando algum destino falha. Para validar uma implantação local ou de homologação, configurar `TRANSPARENCY_CHECK_ORIGIN` com a origem desejada. Links externos continuam sendo verificados no endereço cadastrado. A conferência do status HTTP deve ser acompanhada de revisão editorial do conteúdo de destino.

## Verificações da entrega

- Regressão de consultas, exportações, publicação, fontes nativas e atendimento.
- Testes adicionais de descoberta, gestão editorial, SQL documental parametrizado, idempotência e retenção das avaliações.
- Jornada real de envio pelo navegador, confirmação de persistência e remoção do registro técnico criado pelo teste.
- Página inicial, pesquisa e consulta verificadas em 320, 390, 768, 1024 e 1440 px.
- Auditoria axe-core do conteúdo principal dessas três telas, com regras selecionadas de WCAG 2 A/AA e WCAG 2.1 AA.

Essas verificações técnicas não equivalem a certificação PNTP ou auditoria integral de acessibilidade. Conteúdos institucionais, fundamentos legais, identidade e disponibilidade das fontes devem continuar sendo revisados pelos responsáveis do município.
