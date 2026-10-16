# Portal da Transparência — fechamento do trabalho T00–T09

## Decisões finais do responsável

- Manter **Aurora das Veredas** como identidade e conjunto de entidades nativas da instância.
- Usar API/acervo de Ibema como referências externas identificadas.
- Buscar exemplos públicos e criar modelos próprios de Aurora para conteúdos ausentes. Modelos ficam em **REFERENCIA**, sem número/assinatura/publicação legal ou julgamento de tribunal presumidos.
- Vercel Blob privado é o armazenamento dos documentos, com downloads públicos específicos.

## Entidades e fontes confirmadas

- Nativo: os nomes públicos configurados corresponderam exatamente a `p0-current-exe` e `p0-current-leg`, as entidades de Aurora. Entidades de Ibema não foram somadas a esse conjunto.
- API de referência: Prefeitura = 1; Câmara = **2**, confirmado na página oficial `https://camaraibema.pr.gov.br/portal-da-transparencia/`, seção “Informações a partir de 2023”, cujo link contém `?entidade=2`.
- Os códigos PNTP 2085/7654 são identificadores da base nacional e **não** códigos da API Elotech.
- Base PNTP 2025 consultada como fonte histórica: Prefeitura de Ibema 96,74/Diamante e Câmara 77,17/Elevado. Essas notas não são atribuídas a Aurora nem ao software.

## Fechamento por fase: implementação e configuração/conteúdo

| Fase | Entrega de software/fonte nesta execução | Dependência para atendimento institucional real |
|---|---|---|
| T00 | Quatro providers, contrato, origem, entidades nativas, código da Câmara confirmado, 136 documentos e matriz/cartilha PNTP oficiais versionadas | A API antiga pode permanecer indisponível; isso é apresentado sem fallback ou zero financeiro |
| T01 | Shell, identidade, contexto, menu/pesquisa, novos grupos/consultas documentais, hints/ordem/horários, mapa dinâmico e aviso dialog com imagem/entidade/vigência/frequência | Brasão/contatos e identidade nominal devem refletir o cadastro institucional adotado |
| T02 | Filtros, períodos, ordenação, paginação, detalhes, sete formatos, dicionário e totais com exclusão de subtotais/não aplicáveis | Conferência de layouts adicionais e de cada fonte real é distinta da existência dos renderizadores |
| T03 | Cadeia financeira direta; anulação/reforço; programa/ação/função/subfunção do planejamento; previsão publicada/atualizada; RP interno; painel por datas próprias e funções 10/12 | Saldos oficiais, encerramento e relatórios legais não são homologados pela tela; os indicadores Saúde/Educação não são mínimos legais |
| T04 | DTO de vínculos/folha oficial liberada, flag nominal, histórico por revisão, contagem distinta de pessoas/vínculos, quadro/vagas/padrão, diárias/adiantamentos com origem e empenho | Publicação nativa depende do escopo/vínculo cadastrado; fontes mensais não são convertidas artificialmente em jornada semanal; nomeações/atos são conteúdos próprios |
| T05 | Adaptadores de recibos/itens/NF, ativos, frota, depósito/movimentos, obras/medições, convênios/repasses e benefícios fiscais; escopo auditado em Fontes nativas | Modelos antigos sem cronograma/fiscal/itens podem receber complementos públicos com referência. A vinculação não inventa dados ausentes |
| T06 | Biblioteca, arquivos/links, versões/hash, geração preservada de relatórios, classificação e estágio das contas, PCA Contratações vs PCA Contas, Diário nativo com endpoint específico | A classificação JULGADO precisa corresponder a decisão real; consulta gerada não pode ser rotulada como julgamento |
| T07 | Canal privado e-SIC/Ouvidoria, integração opcional com Atendimento, 20/30 dias e prorrogação, recursos/decisão, satisfação/estatística, modelos próprios para lacunas setoriais e PNTP por Poder | Normas, autoridades, PAS e decisões reais dependem de adoção/conteúdo; modelos não são prova de promulgação ou aprovação |
| T08 | Shell acessível, labels/tabelas, fonte/contraste, dialog com teclado, proteção seletiva de operações, inventário/IP restrito, validação/hash/fórmulas | Aceite visual/teclado/Libras e operação distribuída precisam ser verificados no ambiente publicado |
| T09 | Leitura dos módulos por DTOs, vínculo de fonte/entidade auditado, importação idempotente no Blob, testes/TypeScript/build e smoke HTTP | O acervo foi publicado como documentos, sem migrar seus totais para livros financeiros. Não se presume reconciliação integral de PDFs/API/contabilidade nem certificação PNTP |

Os itens acima fecham as implementações descritas para a apresentação autorizada e indicam os campos/fontes que precisam de adoção/configuração real. Não representam declaração automática de atendimento de todas as obrigações legais.

## Novos recursos para teste

- `/transparencia/fontes`: escopo e registros nativos, referência documental e complementos públicos validados. Alterações nos registros de origem são lidas pelos adapters; dados bancários/clínicos/contracheques não integram o DTO.
- `/transparencia/pntp`: matriz oficial, aplicabilidade e registro de evidências. Ciclo 2026: **181 critérios nacionais**, **96 Executivo** e **83 Legislativo**.
- `/portal/portaldatransparencia/pntp`: evidências e pendências, sem selo/nota oficial.
- `/portal/portaldatransparencia/mapa`: catálogo publicado, incluindo consultas documentais criadas na gestão.
- `/portal/portaldatransparencia/estatisticas`: pedidos e satisfação agregados, sem identificação/narrativa/protocolo de terceiros.
- Consultas adicionais: medicamentos/estoque de farmácias, filas de saúde/creches por códigos anônimos e quantitativo de pessoas/vínculos. Filas/estoque correntes não são apresentados como histórico inexistente de outro exercício.
- Configurações: publicação nominal nativa, canais/departamento do Atendimento, unidades/autoridades do SIC, aviso por entidade e frequência, declaração documental de não adoção/não publicação por contexto/tipo.
- Gestão documental: gerar rascunho preservado de uma consulta, classificar categoria/estágio, publicar/retirar e ordenar. Modelos próprios são pesquisáveis por “MODELO/PROPOSTA”.

## Conteúdos próprios criados

**16 PDFs**, oito modelos para cada Poder, preservados no Vercel Blob:

1. Minuta de regulamentação da LAI, baseada na Lei federal 12.527/2011.
2. Organização do SIC, Ouvidoria e autoridades recursais, sem nomeação fictícia de pessoas reais.
3. PAS 2026 de Aurora, com metas ilustrativas explicitamente identificadas e base na Portaria de Consolidação 1/GM/MS/2017.
4. Declaração/modelo de situação das contas, sem fabricar decisão do TCE ou aprovação final.
5. Rol de classificação/desclassificação, sem afirmar inexistência de sigilo sem conferência.
6. Proposta de governo digital e dados abertos.
7. Responsabilidades/canal de proteção de dados, sem presumir encarregado nomeado.
8. Carta de Serviços alinhada aos fluxos implementados.

Fontes oficiais usadas: Planalto para LAI; BVS/Ministério da Saúde para planejamento/PAS; Atricon para matriz/cartilha PNTP; site oficial da Câmara de Ibema para o código da API e estrutura de referência. Tentativas que retornaram 404/restrição de conteúdo não foram tratadas como documentos obtidos.

Foram cadastradas **60 evidências parciais** por entidade/critério, com notas que distinguem implementação local, endereço de deploy e modelo não adotado. Critérios sem conferência permanecem explícitos como UNVERIFIED; nenhum foi convertido automaticamente em SATISFIED por haver uma URL ou modelo.

## Verificação executada

- **59 testes** aprovados nesta rodada, incluindo native scopes/DTOs, preços/NF, estoque, obras, benefício fiscal, hierarquia da previsão, prazos/recursos/Atendimento/satisfação, modelos próprios e regressões de financeiro/planejamento/proxy.
- TypeScript, ESLint direcionado e build de produção aprovados.
- Smoke HTTP: **nove páginas**, sete formatos, dicionário sem fetch externo, login obrigatório na gestão e ciclo real pedido/resposta/recurso/avaliação, com dados temporários excluídos ao final.
- Acervo: 136 fontes de Ibema, cartilha/matriz PNTP e 16 modelos de Aurora no Blob. As leituras de PDF/CSV/PNG e ZIP original de 144 MB confirmaram os hashes.
- **29 consultas / 87 cenários** Prefeitura/Câmara/consolidado na fonte EXEMPLO, separada dos dados nativos/documentais.

## Limite de fechamento institucional

O responsável autorizou criação de modelos para Aurora, não a falsificação de fontes institucionais. Adoção legal, nomeação nominal, publicação no Diário, assinatura de plano, julgamento final, reconciliação financeira e certificação Atricon continuam sendo atos/fontes reais. O portal já oferece os campos, fluxos e evidências para registrá-los, e não os apresenta como ocorridos antes disso.

O código desta rodada permanece local até commit/push/deploy autorizados; migrations, documentos/modelos e matriz foram aplicados no ambiente configurado. Verificar as URLs externas após publicar a versão.
