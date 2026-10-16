# Portal da Transparência — acessos e publicação de documentos

**Atualização:** o acervo de 136 fontes já foi carregado no Vercel Blob e publicado no banco configurado. Recursos e roteiro atuais: [Entrega e testes](PORTAL_TRANSPARENCIA_TESTES_E_ENTREGA.md).

## Endereços e navegação

- **Cidadão:** `https://www.ibema.celeriflow.com.br/portal/portaldatransparencia`.
- A página usa o cabeçalho, rodapé e recursos de acessibilidade do Portal Institucional. O menu Transparência inclui **Documentos e publicações**.
- A entrada antiga `/portal-transparencia` encaminha ao endereço institucional, preservando parâmetros.
- **Gestão autenticada:** Dashboard → card Portal e Transparência → **Configurações e upload de documentos**, em `/transparencia/publicacoes`.
- A mesma opção está na navegação interna do módulo. O botão **Abrir portal público** permite conferir o resultado como cidadão.

## Fluxo do acervo

1. Em Configurações, definir exercícios disponíveis, entidades e consultas habilitadas.
2. Selecionar PDF, CSV, TXT, PNG, JPEG ou ZIP. O upload usa envio direto ao Vercel Blob privado, até 100 MB por novo arquivo. Todos os documentos de Novos Docs foram informados pelo responsável como provenientes do Portal da Transparência anterior; a carga operacional desse acervo foi concluída.
3. Informar entidade, exercício, assunto, competência/período e consulta de destino. Separar lotes com metadados diferentes.
4. Em upload múltiplo, cada nome de arquivo é usado como título. Em upload único, é possível definir um título próprio.
5. O arquivo é enviado ao armazenamento privado da instância e registrado como **Rascunho**. O SHA-256 corresponde aos bytes do arquivo.
6. **Publicar externamente** verifica o arquivo preservado e libera consulta/download sem login. A biblioteca pública abre na fonte Documentos.
7. **Retirar do portal** mantém o registro e bloqueia novas consultas/downloads públicos. Para nova versão, enviar novo documento.

Uploads e mudanças de estado exigem permissões de criação/alteração do módulo `TRANSPARENCIA`. Downloads públicos verificam status, entidade, exercício, consulta habilitada e integridade do arquivo. Arquivos de outras áreas privadas não são liberados automaticamente.

## Configurações disponíveis

- Ano inicial e exercícios publicáveis.
- Fonte inicial das consultas: API Ibema, registros nativos, documentos ou exemplos fictícios.
- Nome e disponibilidade da Prefeitura/Câmara.
- IDs de entidades nativas e código externo confirmado; o código da Câmara não é presumido.
- Consultas habilitadas e horário de atendimento.

## Consultas públicas

Menu por assunto, contexto Prefeitura/Câmara/consolidado, fonte explícita, pesquisa, filtros específicos, datas, ordenação, paginação, detalhes e links de download.

CSV exporta o conjunto filtrado completo, com origem e proteção contra fórmulas. JSON entrega uma página com totais integrais. API indisponível não gera total zero nem troca silenciosa para exemplos. Campos financeiros ausentes deixam o total correspondente indisponível.

## Ativação operacional

- Aplicar a migration aditiva `20261013010000_transparency_publications` pelo fluxo de deploy de `prisma/migrations-ibema`.
- Configurar `BLOB_READ_WRITE_TOKEN` para o armazenamento privado da instância.
- Garantir configuração de instância e permissões `TRANSPARENCIA` dos responsáveis.
- **Carga concluída:** 136 fontes, 826.700.805 bytes, com SHA-256 conferido após upload. Os arquivos são servidos do Vercel Blob; `docs/Novos docs` continua fora dos assets de runtime/deploy.
- Conferir consulta e download sem sessão após o deploy.

## Limites registrados

Esta entrega disponibiliza consultas e gestão documental para teste, com acervo carregado, painel, formatos adicionais, configurações, consultas/grupos documentais novos e canal privado do cidadão. Validação integral da API, integração nativa de todas as famílias e auditoria/homologação PNTP permanecem no backlog T00–T09. A projeção de RP nativos expõe o acompanhamento interno existente, sem apresentá-lo como demonstrativo legal homologado.

## Verificação local

- `npm run build`: aprovado (Prisma generate, Next typegen, TypeScript e build de produção).
- ESLint direcionado aos serviços, páginas, rotas, navegação e testes alterados: sem erros ou avisos.
- 48 testes aprovados: consultas, novas consultas/grupos documentais, proteção do banco, canal do cidadão, proxy/navegação, financeiro público, planejamento e avisos públicos.
- Casos novos cobrem 180 registros com página intermediária/exportação integral, filtros combinados, origem fictícia, total ausente, falha externa sem fallback, Câmara sem código confirmado e hash de bytes divergentes.
- Migrations aplicadas e downloads reais conferidos no Vercel Blob, inclusive ZIP de 144 MB. O teste HTTP de produção local foi executado. O código desta rodada ainda não foi enviado a deploy.
