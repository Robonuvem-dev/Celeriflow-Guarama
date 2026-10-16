# Portal da Transparência — entrega funcional e roteiro de teste

**Atualização:** o fechamento posterior acrescentou fontes nativas, PNTP oficial (181 critérios), código da Câmara confirmado, prazos/recursos/integração/satisfação, classificação documental, geração preservada, avisos por frequência e 16 modelos próprios de Aurora. Referência atual: [Fechamento T00–T09](PORTAL_TRANSPARENCIA_FECHAMENTO_T00_T09.md).

## 1. Estado da entrega

O portal público e a gestão documental estão implementados para teste. Foram carregadas **136 fontes distintas do acervo Novos Docs**, totalizando **826.700.805 bytes**, no **Vercel Blob privado da instância**. Os arquivos foram relidos após upload e seu SHA-256 foi conferido. A repetição da carga reutilizou os 136 registros sem novos uploads.

O PPA, recebido em duas partes binárias, foi reconstruído em **um ZIP de 144.417.700 bytes**, preservando uma única fonte ND-081. A biblioteca de 2026 agrega **118 documentos**; as demais referências estão em 2027, 2025, 2024, 2023 e 2008. Fonte, município de origem e competência são preservados. ND-005 continua identificado como referência comparativa de Campina do Simão.

**As migrations e a carga foram aplicadas no banco/Blob configurados em `.env.local`. O código desta rodada ainda precisa ser publicado no deploy para aparecer no domínio externo.** Não foi executado commit, push ou deploy nesta rodada.

## 2. Acessos

| Acesso | Caminho |
|---|---|
| Portal público | `/portal/portaldatransparencia` |
| Painel financeiro | `/portal/portaldatransparencia/painel` |
| Gestão a partir do Dashboard | Card Portal Transparência → `/transparencia` |
| Configurações, documentos, consultas e grupos novos | `/transparencia/publicacoes` |
| Pedidos e-SIC/manifestações do portal | `/transparencia/solicitacoes` |
| Inventário e acessos/IP restritos | `/transparencia/acessos` |
| Registro e acompanhamento do cidadão | `/portal/acesso-informacao` e `/portal/ouvidoria` |

Para executar localmente: `npm run dev`, com o endereço público `http://localhost:3000/portal/portaldatransparencia`. As rotas internas exigem sessão e o domínio do sistema configurado.

## 3. Recursos disponíveis

- Catálogo de **25 consultas**, busca de consultas, grupos temáticos, Prefeitura/Câmara/consolidado e contexto preservado na URL.
- Pesquisa de registros, filtros por família, período, ordenação, paginação, totais integrais e detalhe. Remuneração usa competência, distinta da admissão.
- Fonte selecionada visível: documentos, dados nativos, API de Ibema ou exemplos fictícios. Não há fallback silencioso nem total zero para uma fonte indisponível.
- Cenários de exemplo para as 25 consultas nos três contextos: **75 combinações verificadas**, com 180 registros por entidade. PDF individual de exemplo é identificado como fictício.
- Painel financeiro com tabela equivalente ao gráfico e metodologia explícita. O pago vinculado a empenhos emitidos no mês não é rotulado como fluxo de caixa mensal.
- Exportações completas CSV, PDF, XLSX, TXT, DOCX e JSON. JPEG é entregue como ZIP de páginas, com limite explícito de 1.000 registros por conjunto. Dicionário de campos/filtros disponível mesmo sem dados da fonte externa.
- Biblioteca por assunto, exercício, competência e formato, incluindo PDF/CSV/TXT/PNG/ZIP reais do acervo.
- Upload direto do navegador ao Vercel Blob privado, até 100 MB por novo arquivo; confirmação idempotente, validação de formato e hash. A importação operacional suportou o ZIP original maior que esse limite do formulário.
- Rascunho, conferência interna, publicação, classificação/título/ordem, retirada e exclusão de rascunhos. Bytes/versão de arquivos publicados são preservados no banco. Nova versão é novo upload.
- Novas consultas documentais e grupos configuráveis (`doc-*`), sem SQL/RSQL livre; publicações por arquivo ou link externo. Links externos são identificados como origem, sem promessa de preservação dos bytes.
- Título/hint/ordem e disponibilidade das consultas, entidades/códigos/IDs nativos, exercícios, horário, Radar, aviso com imagem/vigência/fechamento e registro de visualizações configuráveis.
- Pedidos e-SIC/manifestações: protocolo e chave privada, comprovante TXT, análise/resposta pela gestão e acompanhamento sem exposição de identidade/narrativa na consulta. O canal não envia e-mail automático.
- Inventário documental e últimas visualizações com IP em área autenticada. Retenção dos acessos: 90 dias; contagem de visualizações, não pessoas únicas.
- Shell institucional com fonte/contraste, navegação e recursos de acessibilidade compartilhados. Alto contraste inclui inputs, selects e tabelas.

## 4. Roteiro manual

1. **Biblioteca:** abrir o portal, selecionar Documentos, Prefeitura e 2026. Navegar por Saúde, RREO/RGF, Planejamento, Compras e demais assuntos. Procurar PMS, RAG, LOA, LDO e PPA. Alternar 2025/2027 para localizar documentos históricos/futuros.
2. **Downloads reais:** baixar PDF, CSV, PNG e o ZIP do PPA. O arquivo baixado deve ter o formato original; nenhuma parte `.part01`/`.part02` é publicada isoladamente.
3. **Consultas:** selecionar uma consulta e usar o atalho “Testar esta consulta com exemplos fictícios”. Trocar Prefeitura/Câmara/consolidado, combinar filtros e ordenar valores. Verificar página intermediária e total filtrado.
4. **Pessoal:** testar competência `07/2026`, nome/cargo/lotação/situação/faixa de remuneração; comparar com a data de admissão. Ver estagiários, inativos, cessões, vagas e padrão remuneratório.
5. **Diárias/obras/compras:** abrir detalhes, conferir quantidade × unitário, itens e campos de origem; baixar o PDF explicitamente fictício.
6. **Exportações:** em um conjunto com mais de 125 registros, baixar CSV/PDF/XLSX/TXT/DOCX/JSON/JPEG. A exportação não deve ficar limitada à página de 20 registros. Consultar o dicionário.
7. **Painel:** selecionar Exemplos fictícios, comparar totais e tabela mensal; trocar entidade e fonte.
8. **Upload e publicação:** entrar na gestão, enviar um arquivo ou lote pequeno; conferir o rascunho; editar título/assunto/competência; publicar e baixar em janela sem sessão.
9. **Retirada:** retirar um documento de teste; o link público deve retornar 404. O registro continua na gestão. Usar um arquivo de teste, sem retirar documentos do acervo para a apresentação.
10. **Nova consulta/grupo:** criar `doc-teste-setorial`, vincular um documento/link, publicar e localizar no menu público. Desativar a consulta e verificar bloqueio do acesso externo.
11. **Configuração:** testar hint, ordem, disponibilidade, ano inicial, horário e aviso. Ativar visualizações, navegar e consultar Inventário e acessos.
12. **Pedido do cidadão:** registrar e-SIC, guardar comprovante/chave, responder em `/transparencia/solicitacoes` e consultar a resposta. Chave incorreta não deve revelar dados. Testar manifestação sem nome, quando cabível.
13. **Acessibilidade:** testar fonte, contraste, Tab/Enter, labels, ordenação, tabela com scroll e layout móvel. A inspeção visual/teclado final é parte do aceite humano; não foi substituída por teste HTTP.

## 5. Evidências executadas

- Build de produção com Prisma generate, Next typegen e TypeScript aprovado.
- **48 testes** de domínio/contrato, proteção do banco, consultas/grupos novos, canal do cidadão, proxy, financeiro público, planejamento e avisos públicos aprovados. ESLint direcionado sem apontamentos.
- Verificação operacional do acervo: 136 registros publicados, 118 documentos no exercício 2026, 75 cenários de exemplo; downloads de PDF/CSV/PNG e ZIP de 144 MB com hash conferido.
- Smoke HTTP sobre `next start`: seis páginas públicas, paginação, sete formatos de exportação, dicionário sem chamada externa, entrada antiga preservando filtros, bloqueio de gestão sem sessão e ciclo real registro → resposta → consulta privada. A solicitação temporária do smoke foi excluída ao final.
- Foi corrigido um problema de PDFKit empacotado pelo Next, detectado apenas no teste HTTP de produção: `pdfkit` agora usa `serverExternalPackages` e tracing dos arquivos de fontes.
- Foi corrigida a validação de Origin para a normalização de URL do Next/Vercel, comparando o domínio público do cabeçalho Host.

Comandos de reprodução:

```text
npm run build
node --conditions=react-server --import tsx --test tests/transparency-consultations.test.ts tests/transparency-preservation.test.ts tests/portal-proxy.test.ts tests/public-finance.test.ts tests/planning-publication.test.ts tests/c4-public-notice-policy.test.ts
npx tsx --conditions=react-server scripts/verify-transparency-portal.ts
npx tsx scripts/smoke-transparency-http.ts
npx tsx scripts/import-transparency-archive.ts
```

O importador é somente leitura sem `--apply`; com `--apply`, faz carga/reutilização idempotente e registra auditoria.

## 6. Escopo ainda dependente de integração/homologação

O planejamento integral T00–T09 e o atendimento legal/PNTP não são encerrados por cenários de apresentação. Permanecem:

- Auditoria integral da cartilha/matriz PNTP, evidências por Poder e homologação legal dos relatórios.
- Projeções automáticas de todas as famílias dos módulos instalados, especialmente publicação nominal de folha, patrimônio/frota/estoque, obras e demais categorias com escopo de entidade e histórico completo.
- Confirmação do código da Câmara na API antiga e validação integral de seus campos. A tentativa desta rodada apresentou timeout nos endpoints de receitas, servidores e liquidações; o portal sinaliza indisponibilidade.
- Homologação contábil/reconciliação do histórico estruturado: os PDFs foram publicados como documentos, sem transformar seus totais em novos lançamentos.
- Fluxos legais ampliados de e-SIC (recursos, prorrogações, notificações oficiais) e integração da fila do portal com as rotinas nativas de Atendimento/Ouvidoria.
- Aceite humano de aparência, mobile, teclado e Libras e teste de upload autenticado no navegador após deploy.

Quando uma família nativa não está conectada/publicada, a UI informa isso. Seus exemplos de teste têm origem fictícia explícita; não comprovam integração em tempo real.
