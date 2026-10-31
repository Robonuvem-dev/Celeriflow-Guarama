# Implementação — GED e Assinatura Digital

Data: 31/10/2026. Referência funcional: [plano de unificação](PLANO_UNIFICACAO_GED_ASSINATURA_DIGITAL.md).

## Entrega no código

- Cartão, painel, shell e manifesto do módulo `ASSINATURA_DIGITAL` com nome **GED e Assinatura Digital**. Cadastro existente `/documentos` da Central identificado como **Tipos documentais**.
- Acervo, pesquisa avançada, pastas inteligentes, importações/lotes, processamento, tarefas, fluxos, modelos, classes e thesaurus sob `/assinatura-digital`.
- Rotas anteriores de Documentos redirecionadas, mantendo filtros/pastas da operação anterior. As listagens antigas de arquivos e cadastros de modelos permanecem em `acervo/integrados` e `modelos/anteriores`, com autorização `DOCUMENTOS`; não são um backfill automático para o acervo gerenciado.
- Fila de pendentes única em `/assinatura-digital/pendentes`, mantendo a reautenticação e o retorno `{ error }` da action client.
- Persistência exclusivamente Drizzle, DTOs próprios e duas migrações SQL aditivas pela autoridade existente.

## Recursos do novo acervo

| Requisito | Implementação | Limite de homologação |
| --- | --- | --- |
| Legado digitalizado | Upload direto ao Blob privado; intenção por arquivo/UUID e lote; confirmação por conteúdo/hash; manifesto CSV opcional com `filename,title,folderPath,classCode,legacyReference`; hierarquia criada pela importação | Conferir Blob real e arquivos controlados da POC; retomada mantém UUID na sessão e recupera upload ambíguo pelo caminho registrado |
| Pesquisa avançada / thesaurus | PostgreSQL full text por versão/página; todas as palavras, frase, fragmento literal, proximidade bidirecional de duas palavras e equivalentes persistidos | Sem `pg_trgm`, parser booleano livre ou ranking linguístico português; `simple` com normalização de acentos |
| Pastas inteligentes | Consulta validada em JSON, executada novamente sobre o escopo do usuário; pessoal e compartilhada por capacidade administrativa | Regra compartilhada nunca compartilha os documentos de seu autor |
| Árvore | Expansão de subpastas, navegação por caminho, criação, movimentação/renomeação com bloqueio de ciclos, seleção de destino para documento; exclusão somente vazia | Não importa ACL histórica por inferência |
| Circuito editorial | Elaboração → consenso → aprovação → homologação, responsáveis múltiplos, decisões por usuário/fase, comentário, prazo e notificações; devolução encerra o ciclo e permite corrigir em nova versão | O prazo é exibido; não há escalonamento automático de atrasos |
| Full text | Extração real de PDF com texto, TXT e DOCX; OCR para imagens/páginas sem texto; página e trecho nos resultados | Provedor OCR externo precisa estar configurado |
| Check-out / check-in | Um checkout ativo por documento; concorrência serializada, responsável, versão-base, cancelamento próprio, comentário e nova versão; originais/assinaturas anteriores preservados | Nova versão exige encerramento das tarefas/assinaturas pendentes |
| Lotes | Upload sequencial com resultado individual/repetição dos pendentes; seleção de versões entre páginas; ZIP com manifesto e SHA-256 conferido antes do download | GED: 20 MiB/arquivo; ZIP: até 50 itens e 60 MiB; Central mantém 20 arquivos de até 3 MiB |
| OCR por zonas | Visualizador PDF/imagem, seleção por arraste/coordenadas normalizadas, página, campo, texto e confiança; validação da resposta e indexação | Ensaio local verifica o protocolo; não comprova acurácia de um motor OCR real |
| Modelos | Conteúdo com marcadores, importação física de DOCX, versões de modelo e geração de DOCX real com vínculo aos valores preenchidos | A importação extrai texto; a geração não preserva o layout/estilos do DOCX importado |

## Assinaturas e retenção

- A solicitação interna do GED usa o serviço original, exige homologação e vincula explicitamente a versão exata. O mecanismo de assinatura/reautenticação anterior é preservado.
- A tela **Assine Agora** recebe uma versão autorizada do acervo por identificadores, sem reenviar seus bytes pelo navegador. Reutiliza credencial pessoal/A1, rate limit, idempotência e comprovante da Central; aplica a política da classe.
- `GedCentralSignature` relaciona comprovante da Central e versão GED. O documento original não é substituído por um PDF assinado; os verificadores continuam discriminados por origem.
- A assinatura originada no GED reserva uma lease persistida de cinco minutos, compatível com Neon em transaction pooling, enquanto a Central executa suas transações. A intenção de upload da Central é confirmada antes da escrita Blob e sobrevive à falha. A lease é liberada em `finally` e expira se o processo morrer; a repetição do mesmo UUID completa o vínculo se houver falha após assinar.
- Validação no módulo permite escolher evidência da Central ou código `CFV` de uma versão GED, utilizando os verificadores existentes.
- Um registro avulso pode ser preservado no GED antes de expirar. O arquivamento bloqueia a mesma linha usada pela retenção, verifica evidência/hash original, copia para namespace documental e relê a cópia para conferir o hash antes de registrar o vínculo.
- O cron original continua excluindo somente seu namespace temporário. A cópia no GED registra a retenção configurada em meses; não herda os 90 dias da Central.

## Acesso e compatibilidade

Capacidades `read`, `import`, `edit`, `review`, `models`, `configure` na matriz do perfil. Acesso à assinatura avulsa não implica leitura de acervo. Perfis históricos `DOCUMENTOS` mantêm seu caminho de autorização, sem um alias global entre módulos.

As novas entradas são delimitadas por proprietário/setor ou responsável pela fase editorial ativa; administrador técnico tem o escopo administrativo. As mesmas condições são aplicadas à pesquisa, totais, páginas, tarefas e download. O download genérico reconhece versões do acervo e encaminha à autorização documental.

Documentos de Saúde, SST, processos, Planejamento/Câmara e demais origens não recebem `GedEntry` automaticamente. As integrações originais continuam com seus contratos. A busca full text do novo acervo cobre entradas gerenciadas, não todo o banco compartilhado. As listagens antigas excluem entradas/pastas gerenciadas para não contornar o novo escopo.

## Dados e ativação

Migrações novas:

1. `db/migrations/20261031120000_ged_management/migration.sql` — entradas, arquivos por versão, pastas/ACL, intenções/lotes, checkout, texto/GIN, jobs, consultas salvas, thesaurus, editorial, modelos e geração.
2. `db/migrations/20261031120100_ged_central_archive/migration.sql` — vínculos entre acervo, arquivos preservados e comprovantes da Central.

As migrações foram executadas em fixtures locais descartáveis. Aplicação na base configurada/produção precisa do destino explícito `DATABASE_MIGRATION_URL` e do executor oficial `npm run db:migrate:deploy`. Não foram executadas migrações em banco externo nesta entrega.

### Protocolo OCR

Variáveis do servidor: `GED_OCR_ENDPOINT` (HTTPS; HTTP somente loopback para ensaio) e `GED_OCR_API_KEY` opcional. Nenhuma chave é enviada ao navegador.

Requisição JSON: `{ contentBase64, mimeType, pages, language: "por" }`. Para zona acrescenta `zones: [{ page,label,x,y,width,height,rotation }]` e `coordinateSystem: "normalized-top-left"`. `x,y,width,height` variam de 0 a 1. O visualizador usa rotação 0 e coordenadas da página não rotacionada.

Resposta: `{ pages: [{ page,text,confidence?,label? }] }`, com confiança de 0 a 1. Para zona, o serviço precisa repetir a página e o nome do campo. Páginas duplicadas, ausentes ou diferentes das solicitadas são recusadas.

Processamento é acionado na interface, com job persistido, tentativas, lease e repetição após expiração/falha. Não há um worker agendado de OCR nesta versão.

## Verificações

Rodada de regressão dirigida: **61 testes aprovados, zero falhas e zero skips**, abrangendo dez arquivos de teste. Após a troca do bloqueio de assinatura pela lease compatível com transaction pooling, o recorte de assinatura GED e gestão documental foi repetido: **11 aprovados, zero falhas**. Um teste adicional das actions do cadastro anterior comprovou que documentos comuns/gerenciados não podem ser editados ou excluídos por esse caminho e que campos fora do cadastro são descartados. ESLint dos fontes alterados passou. A checagem TypeScript dirigida cobriu 64 raízes de fontes/testes, sem diagnósticos; o ajuste final das actions e seu teste também passaram em checagem dirigida.

As duas execuções integrais de `npm run build` terminaram com código **0**, incluindo as 15 partições de tipos, compilação de produção e geração das 103 páginas estáticas. A segunda execução consolidou a validação das correções finais: checagem de tipos concluída em 496 segundos e etapa Next concluída em 181 segundos. As rotas do acervo, processamento, modelos, tarefas e assinatura GED foram incluídas no build.

O scanner estático reconheceu duas estruturas compartilhadas novas (workspace e histórico), com mapeamento das dez listagens e do detalhe. Não encontrou contêiner ancestral de scroll nem células empilhadas nessas estruturas; o dimensionamento real não foi medido no navegador.

- `tests/ged-management.test.ts`: escopo/setor e ausência de vazamento nos totais, paginação 20/20/1, full text/frase/fragmento/proximidade, thesaurus, concorrência de checkout, quatro níveis e ciclos, pasta vazia/movimentação, consenso com vários participantes, homologação e consulta dinâmica.
- `tests/ged-storage.test.ts`: extração de PDFs/DOCX reais e contrato OCR com servidor HTTP local controlado; rejeição de resposta de outra região/página.
- `tests/ged-central-signature.test.ts`: recriação completa do banco, falha Blob com intenção durável, repetição idempotente, comprovante verificável, vínculo à versão, escopo e política ICP.
- `tests/central-operation-ui.test.ts`: lote original e envio por identificadores da origem GED.
- Regressões dirigidas de assinatura, fluxo documental, consultas correlacionadas e download por origem.
- ESLint dos arquivos alterados, checagem de tipos dirigida, auditoria estática das tabelas e build integral integram a verificação final. O resultado final do build deve ser consultado na entrega da execução, não inferido desta lista de comandos.

Homologação visual autenticada, precisão OCR em arquivos da POC, Blob real, certificados reais e deploy não são comprovados pelos testes com fixtures. A comparação de viewport ainda precisa de navegação autenticada em ambiente com as migrações aplicadas.
