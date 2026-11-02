# GED — operação das funcionalidades internas

Data: 01/11/2026. Referência: `PLANO_DESENVOLVIMENTO_GED_POC_52_ITENS.md`.

## Estado desta entrega

Código e migração aditiva preparados para os incrementos internos. **Sem homologação:** não foram executados testes, typecheck, lint, build, migração de banco ou ensaios de navegador nesta execução. Não houve commit, push ou deploy. Os resultados históricos de homologação anteriores não validam estes incrementos.

**Revisão de padrão dos módulos (01/11/2026):** a conferência posterior identificou adequações pendentes de tabelas, formulários e layout do GED. O encerramento da preparação do acervo não significa conformidade visual das telas. Inventário e evidências de código em `GED_REVISAO_PADRAO_MODULOS.md`.

As conexões permanentes de serviços e o agendamento continuam na fase 10. Por decisão de 01/11/2026, a busca semântica será interna, o envio real de e-mail permanece pendente para o final, FTP/WebDAV está fora do escopo (acesso somente pelo sistema) e LDAP/AD foi removido do plano atual. A verificação técnica e o aceite funcional pertencem à fase 11. A aplicação depende da migração abaixo para usar as consultas novas.

**Pacote próprio da fase 10 preparado:** ver `GED_SERVICOS_INTERNOS_FASE_10.md` para OCR, conversão/PDF-A, semântica interna, Docker Compose, configuração e worker. A instalação/ativação depende de host e domínio ainda não definidos; não há publicação ou homologação comprovada.

## Navegação

| Área | Endereço | Recursos |
|---|---|---|
| Acervo | `/assinatura-digital/acervo` | Árvore expansível, contagens autorizadas, lotes e lixeira |
| Pesquisa | `/assinatura-digital/pesquisa` | Modalidades de pesquisa, histórico, filtros e exportação |
| Documento | `/assinatura-digital/acervo/{id}` | Versões, metadados, validade, colaboração, derivados, workflow e publicação |
| Administração | `/assinatura-digital/gestao` | Tipos, índices, grupos, ACL, designer, regras e operação |
| Meu painel | `/assinatura-digital/meu-painel` | Preferências, favoritos, tarefas, participações e vencimentos |
| Calendário | `/assinatura-digital/calendario` | Mês, semana, dia, lista e eventos pessoais |
| Origens internas | `/assinatura-digital/origens` | Consulta autorizada e ingresso explícito de cópias dos módulos |

As capacidades GED aparecem no cadastro existente de perfis. `delete` e `share` são capacidades independentes. Administrar a configuração exige `configure`; isso não substitui automaticamente as permissões de objeto de um usuário não administrador do sistema.

## Banco e persistência

Migração: `db/migrations/20261102130000_ged_poc_internal/migration.sql` (ainda não aplicada, posicionada após a integração das migrações de Ação Social e CF10 até `20261102120000`).

- Executar pelo fluxo oficial do projeto, após a verificação exigida para aplicação da migração. Não executar trechos avulsos em produção.
- A migração acrescenta definições de índices versionadas, valores, grupos, ACL, colaboração, workflow, regras, eventos, derivados, embeddings, intenções de e-mail e descarte.
- As funções SQL `ged_normalize`, `ged_similarity`, `ged_cosine` e `ged_access` evitam exigir extensões novas do banco. O cálculo vetorial é exato sobre candidatos autorizados; ainda não há índice ANN. Dimensionar com volume representativo na fase 11.
- Os originais e as evidências de assinatura permanecem associados às versões existentes.
- Os metadados de ingressos novos guardam a definição usada no upload. A edição não migra silenciosamente documentos antigos para uma nova definição.
- Desativar um tipo preserva seu histórico. Não excluir fisicamente definições referenciadas.

## Segurança e acesso

A autorização combina capacidade global com proprietário/setor, ACL direta, ACL herdada, grupos ativos, perfis e participação editorial. Uma negação explícita aplicável vence uma concessão. A quebra de herança documental também remove o acesso padrão de setor. O proprietário continua como vínculo direto, sujeito a negação explícita. O administrador do sistema tem acesso administrativo explícito.

As consultas aplicam o escopo antes da contagem, paginação e dos trechos. A explicação do detalhe apresenta as regras aplicáveis ao usuário atual; o editor completo de ACL exige compartilhamento. O acesso a um documento não libera automaticamente os demais documentos da pasta.

`GedIntegrationLink` é rastreabilidade, não concessão de acesso. `ged-source-ingress.ts` define o contrato de ingresso/consulta para Processos, Planejamento, Financeiro, Obras e RH: cada módulo deve fornecer um callback servidor que autoriza o registro e a exportação da cópia. **O contrato genérico não instala automaticamente esses adaptadores nas telas de cada módulo.** Saúde/SST não foram incluídos nesse contrato genérico. A ponte já existente com a Central permanece disponível.

## Worker e processamento

Execução local, após disponibilizar banco migrado e configuração de servidor:

```powershell
npm run ged:worker
# Um ciclo:
npm run ged:worker -- --once
```

O worker executa indexação, eventos internos e alertas de validade em ciclos. A execução contínua e o agendador hospedado deverão ser instalados na fase 10. Não presumir que a fila está sendo consumida apenas porque o upload terminou.

Estados de indexação: `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED`. Há lease, tentativas, próximo instante de tentativa e estados de original/extração/derivados/índice. Falhas podem ser retomadas pela tela de operação. O worker usa a identidade atual do proprietário, sem criar uma identidade com acesso irrestrito.

Limites principais: original/derivado de 20 MiB, 200 páginas, imagem de até 16 milhões de pixels, texto total limitado pelo extrator, seleções de até 50 arquivos. A geração de relatório limita a 2000 resultados. Relatórios usam a mesma consulta de pesquisa e identificam as versões.

### Extratores e conversores

| Família | Implementação |
|---|---|
| TXT UTF-8 | Decodificação e indexação direta |
| DOCX | Mammoth para texto; LibreOffice para PDF de visualização |
| PDF textual | PDF.js |
| PNG/JPEG e páginas PDF sem texto | Serviço Tesseract existente, agora com palavras/coordenadas |
| TIFF/GIF e imagens multipágina | Sharp → PDF → extração/OCR |
| BMP | Decodificador limitado a BMP Windows sem compressão, 1/4/8/24/32 bits → PNG/PDF |
| DOC/XLS/PPS/RTF/HTML/PPTX/ODF e similares | Adaptador LibreOffice local ou endpoint de conversão |
| PDF/A | veraPDF local ou endpoint de validação; relatório registrado na atividade |

Receber um PDF não comprova PDF/A. A validação não converte automaticamente um PDF comum para PDF/A. BMP comprimido exige normalização prévia. Essas fronteiras devem constar nos ensaios reais por formato.

Variáveis de servidor:

- `GED_OCR_ENDPOINT`, `GED_OCR_API_KEY`.
- `GED_CONVERSION_ENDPOINT`, `GED_CONVERSION_API_KEY`; local: `GED_LIBREOFFICE_PATH` (padrão `soffice`).
- `GED_PDFA_ENDPOINT`, `GED_PDFA_API_KEY`; local: `GED_VERAPDF_PATH` (padrão `verapdf`).
- `GED_SEMANTIC_ENDPOINT`, `GED_SEMANTIC_API_KEY`.

Segredos permanecem no ambiente. A tela configura processamento automático, tentativas e habilitação das etapas semântica/PDF-A. Os endereços dos serviços são configuração do servidor nesta implementação.

### OCR e derivados

O contrato OCR recebe páginas e devolve texto, confiança e palavras em coordenadas normalizadas com origem superior esquerda. Um derivado pesquisável é gerado com camada textual posicionada. O original não é substituído. `GedArtifact` armazena versão, tipo, caminho e SHA-256 do derivado. O download passa pela autorização do documento e pela conferência de integridade.

Agrupar imagens produz um novo PDF gerenciado na ordem da seleção, com os identificadores de origem no histórico. Os modelos DOCX importados continuam gerando novo DOCX a partir do conteúdo textual; não há promessa de reprodução do layout original.

## Pesquisa semântica local

Serviço preparado em `services/ged-semantic/server.py`, dependências em `services/ged-semantic/requirements.txt`. Modelo padrão: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`. O primeiro carregamento pode exigir download do modelo; provisionar o cache antes da operação isolada de rede.

A indexação semântica exige habilitação na administração e endpoint configurado. Alterar o modelo exige reindexar o acervo; a consulta filtra pelo identificador do modelo. A pesquisa semântica combina similaridade vetorial e relevância lexical, preservando a autorização documental.

Exemplos de pesquisa booleana:

```text
titulo:contrato AND NOT meta.situacao:cancelado
(conteudo:educacao OR conteudo:ensino) AND tipo:PORTARIA
titulo:"plano municipal" AND arquivo:plano*
```

`AND` tem precedência sobre `OR`; `NOT` e parênteses são suportados. As expressões são compiladas para SQL parametrizado. Curingas usam `*` e `?` por palavra. Fuzzy usa similaridade de trigramas. Proximidade mantém exatamente duas palavras.

## Workflow, automação e validade

O designer usa elaboração → consenso → aprovação → homologação como modelo inicial. Cada instância fica vinculada a uma versão exata do documento e da definição. Todos os responsáveis configurados para uma etapa participam da conclusão. Alterações compatíveis podem ser adotadas no próximo acesso; mudanças de fase/participantes de etapas ativas ou já decididas preservam a definição antiga.

Regras são evento → condições de pasta/tipo/etiqueta → ações. Há snapshots da regra, registro por execução e por ação, chaves de deduplicação de tarefas/notificações e fila de eventos. Retomadas de falhas precisam ser verificadas no aceite de concorrência e interrupção de processo. Uma classificação não dispensa os campos obrigatórios do tipo de destino.

Validade gera tarefa interna, notificação e intenção de e-mail deduplicada pelo documento/prazo. O envio real permanece pendente para o final, conforme decisão de 01/11/2026. Uma nova validade gera um novo ciclo, sem apagar o histórico do anterior.

## Exclusão e descarte

1. Exclusão lógica para a lixeira, sujeita à capacidade específica e a reservas/tarefas/assinaturas pendentes.
2. Restauração enquanto não houver descarte encaminhado ou consumado.
3. Solicitação de descarte somente após retenção e sem vínculos/evidências impeditivos.
4. Fila de descarte por arquivo, com retomada e resultado auditado.

O consumidor diferencia `BlobNotFoundError` de falha do serviço. Não confirma descarte em caso de indisponibilidade do Blob. Caminhos fora dos namespaces gerenciados são recusados. Arquivos ainda referenciados por versões, outros documentos ou publicações não são descartados.

## Publicação

O detalhe permite publicar uma versão homologada mediante compartilhamento GED e autorização na Transparência. Hash, versão e publicação são vinculados. Uma nova versão não atualiza automaticamente a publicação anterior. A operação servidor de retirada é `withdraw-publication`; não retirar evidências históricas ao retirar uma publicação do portal.

## Fechamento das fases

### Complementos internos desta retomada

- Adaptadores concretos e navegação de Processos, Planejamento (Executivo/Legislativo), Financeiro (documentos de liquidações), Obras (emitidos publicados) e RH (documentos funcionais emitidos em texto). Consulta e ingresso reavaliam o escopo da origem. A cópia mantém versão/hash de origem e reserva persistida de ingresso; não migra automaticamente o acervo das origens.
- A consulta legada de integrados direciona à tela de origens autorizadas. Saúde/SST continuam sujeitos aos seus fluxos especializados.
- Administração de URLs/executáveis de OCR, conversão, semântica e PDF/A, com fallback para ambiente; segredos permanecem no servidor. A instalação/hospedagem e conexão real continuam na fase 10.
- Fila paginada por estado, com etapas, tentativas e reprocessamento; filtros de pesquisa por setor e índices; ordenação/limites dos campos; ordenação explícita de imagens com seleção da versão; aparência institucional configurável.
- Diagnóstico administrativo da origem das regras de acesso por usuário/objeto: ACL direta/herdada, usuário/grupo/perfil, proprietário, setor e participação editorial. A tela diferencia a decisão de objeto das capacidades globais e do bypass administrativo.
- TXT normalizado de UTF-8, UTF-16 com BOM e Windows-1252, preservando os bytes originais.
- `scripts/ged-prepare-fixtures.mjs` foi executado **somente para criar dados sintéticos**, sem chamadas à aplicação ou banco e sem ensaios/assertivas. O acervo está em `docs/ged-poc-acervo/`, com hashes em `manifesto.json`. Inclui palavras exclusivas, modelo DOCX, planilha XLSX, ODT, texto/RTF/HTML, PDF textual, digitalizado sem texto e imagens PNG/JPEG/GIF/TIFF/BMP, com duas páginas para reordenação.
- Os seis perfis e grupos estão especificados em `docs/ged-poc-profiles.json`, sem alterar contas reais. Aplicação aos usuários e criação de versões/tarefas/assinaturas são ações do roteiro final.

### Acervo preparado e encerramento da fase 9

Foi executado também `node scripts/ged-prepare-fixtures.mjs docs/ged-poc-acervo --public`, para complementar exclusivamente os dados: DOC/XLS/PPTX/ODS/ODP do repositório LibreOffice e quatro PDFs do corpus veraPDF (classes públicas pass/fail de PDF/A-1b e PDF/A-2b), com URL de origem e hash no manifesto. Também foram gerados ODF de fórmula e TIFF de duas páginas. A classificação da origem não é resultado de validação local: os arquivos serão processados/validados apenas na fase 11.

**Preparação da fase 9 concluída em 01/11/2026, sem homologação.** A última amostra de formato foi obtida pelo comando `node scripts/ged-prepare-pps-fixture.mjs`: `docs/ged-poc-acervo/referencia-fapes-prazos-pitch-gov.pps`, apresentação pública “Prazos Pit Gov”, de 10/09/2021, da FAPES (Governo do Espírito Santo). É uma referência pública estadual, não um documento municipal nem uma apresentação sintética.

- Página de origem: https://fapes.es.gov.br/orientacoes
- Download: https://fapes.es.gov.br/media/Importacao/Arquivos/Prazos%20Pit%20Gov.pps
- Tamanho: 198.656 bytes.
- SHA-256: `db9601be6f74487c265718de1c9c49d5e2efc97c4bc35b0a34d5b34acb4be215`.
- O preparador conferiu a assinatura binária CFB do Office legado, preservou os bytes baixados e atualizou o manifesto. Isso identifica a amostra; não comprova extração/conversão pelo GED.
- `scripts/ged-prepare-fixtures.mjs ... --public` também inclui essa amostra para futuras preparações completas.

Não há LibreOffice ou veraPDF disponível no PATH desta sessão. Instalação/conexão dos serviços pertence à fase 10. Versões/tarefas/assinaturas devem ser criadas pelo fluxo da aplicação no roteiro da fase 11, sem aplicar dados a usuários reais nesta preparação.

Internet Explorer continua dependendo de decisão contratual explícita. Não houve autorização para substituí-lo automaticamente por Edge.

O roteiro de cenários finais está em `GED_CENARIOS_ACEITE_FASES_1_A_9.md`. Para o aceite funcional da fase 11, conferir especialmente:

- Homologação dos adaptadores concretos e da navegação de origens internas implementados nesta retomada.
- Homologação da configuração de provedores e visualização de armazenamento por interface.
- Isolamento dos participantes compartilhados no calendário e evolução incompatível de fluxos.
- Cada formato real, PDF/A-1/2, cópia/localização do texto no derivado, volume e retomada de automação.
- Internet Explorer: permanece pendência contratual, sem aceite presumido de substituição.

Esses pontos não devem ser convertidos em PASS por inspeção de código. A matriz dos 52 itens somente poderá ser atualizada para atendimento comprovado após a fase 11.
