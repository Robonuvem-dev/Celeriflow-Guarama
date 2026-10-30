# Assinatura Digital — central e retenção de 90 dias

## Entrega

O módulo abre em `/assinatura-digital/assine-agora`. O menu oferece:

- **Cadastro de Usuários** (`/assinatura-digital/usuarios`): Nome, Cargo, CPF/CNPJ, Telefone, Celular, E-mail, Validade, origem, situação e indicação de senha definida. Senha é campo somente de gravação, armazenada como hash scrypt com salt, nunca exibida na tabela. Servidores podem ser importados do RH; cidadãos podem ser importados de Pessoas ou cadastrados manualmente, inclusive com CNPJ. Vínculos informados são conferidos no servidor.
- **Documentos** (`/assinatura-digital/documentos`): tipos documentais com nome, descrição e ativação.
- **Assine Agora**: original + comprovante JSON destacado, seleção do tipo e assinador, senha pessoal, método interno/A1, resultados individuais e repetição idempotente de falhas. Até 20 arquivos por lote, 3 MiB por arquivo, processados sequencialmente. PDF, JPEG, PNG, TXT, DOC, DOCX e ODT.
- **Validação** (`/assinatura-digital/validacao`): código, upload do original ou ambos, com resultado válido/inválido/indisponível e indicação explícita se os bytes foram comparados.
- **Registros e documentos** (`/assinatura-digital/registros`): assinador e documento, método, datas, código, hash, comprovante e downloads autorizados.
- **Integrações** (`/assinatura-digital/integracoes`): configuração de A1 e-CPF/e-CNPJ, comprovação do titular no certificado, cadeia pública, referência de segredo e estado de ativação. Gerenciamento exclusivo do administrador, com validação no backend.

As solicitações anteriores dos demais módulos continuam em **Solicitações dos módulos → Pendentes de assinatura / Meu histórico de solicitações**. Não foram convertidas em novos uploads desta central.

## Regra aprovada de armazenamento

A decisão posterior do proprietário substitui o pedido inicial de não guardar arquivos:

1. O original é armazenado em **Vercel Blob privado** no namespace exclusivo da instância/Central.
2. A expiração é calculada como **90 × 24 horas a partir da assinatura** e apresentada nas telas.
3. O download é bloqueado exatamente na expiração (HTTP410), mesmo antes da próxima limpeza.
4. O cron diário `/api/assinatura-digital/retencao`, às **10:30 UTC**, exclui arquivos vencidos. A exclusão física ocorre na execução agendada; falhas ficam pendentes para nova tentativa, sem serem marcadas como sucesso.
5. Registros, dados capturados do assinador, hash SHA-256 e evidência criptográfica permanecem em PostgreSQL. O comprovante e a validação continuam disponíveis depois da exclusão do Blob.
6. Intenções de upload abandonadas também são limpas. Repetições usam o mesmo identificador e caminho, evitando duplicação ou perda da referência de limpeza.

O hash é calculado no servidor sobre os bytes recebidos. O comprovante vincula arquivo/hash/tamanho, identidade, cargo, tipo, método, autor, código, instante e expiração em envelope canônico assinado. O original não é alterado; o fluxo entrega evidência **destacada**, não PAdES incorporado ao PDF.

## Validação externa e Portal do Cidadão

- Nova página externa: `/validar-assinatura`, também acessível por `/validar-assinatura/<codigo>`, sem login e com CPF/CNPJ mascarado. O arquivo enviado para conferência é processado em memória, sem gerar novo armazenamento.
- Já existia `/validar-documento/[code]` para códigos CFV dos fluxos documentais anteriores.
- Na navegação do Portal do Cidadão inspecionada em `PortalShell.tsx` e nas páginas de `/portal`, **não há opção dedicada de autosserviço para assinar documentos nem atalho específico para esta nova central de validação**. Há recursos de documentos assinados ligados a processos/Construção Civil, mas não equivalem à central pública de assinatura. A implantação desse menu/autosserviço permanece para programação do proprietário, conforme solicitado.

## Configuração e publicação

Migrações SQL futuras incluídas:

- `20261029173000_digital_signature_module`: cadastro do módulo.
- `20261029190000_signature_central`: assinadores, tipos e registros/evidências/retenção.
- `20261029190100_signature_central_a1`: integrações A1 vinculadas ao inventário de certificados.

Executar pelo fluxo SQL explícito do projeto; os testes usam bancos descartáveis. As migrações não foram aplicadas ao banco real nesta implementação.

Variáveis necessárias, sem valores secretos no código:

- `BLOB_READ_WRITE_TOKEN`, apontando para store **privado**.
- `SIGNATURE_CENTRAL_PRIVATE_KEY_PEM`, chave estável do servidor para assinatura interna (RSA >=2048, EC ou Ed25519).
- `CRON_SECRET` para a rotina de retenção.
- Para cada integração A1: `<REFERENCIA>_PRIVATE_KEY_PEM` e, quando aplicável, `<REFERENCIA>_PRIVATE_KEY_PASSPHRASE`. Certificado/cadeia públicos são cadastrados na tela; a chave privada permanece no provedor de segredos.

Configuração ausente resulta em indisponibilidade, nunca em assinatura simulada. Certificados comerciais, conectividade Blob real e execução do cron na Vercel precisam de homologação no ambiente configurado. Testes com cadeia criptográfica real isolada não substituem esse ensaio.

## Verificações executadas

- Build completo em `VERCEL_ENV=preview`: **PASS**, 15 partições de tipos e 100 páginas estáticas.
- Rodada integrada: **49 testes PASS**, incluindo senha, vínculos, A1, cadeia/titular, lote de 20 chamadas reais de API, hashes adulterados, retries concorrentes, expiração, exclusão com falha/repetição, autorização de download e rotas públicas.
- ESLint do escopo completo: **PASS**.
- Reconciliação do inventário de tabelas anterior: **PASS**.
- Smoke HTTP do build final com o hostname normal da aplicação: validação pública sem login (raiz e código) **200**, cadastro sem sessão **307** para login e cron sem autorização **401**. Servidor temporário encerrado após o teste; nenhum documento real foi enviado.
- Navegadores isolados dos lotes: cadastros (4 cenários), operação/lote/retry/validação e integrações A1 (etapas, edição e erros), com componentes reais e APIs controladas.

Os relatórios detalhados são `assinatura-digital-backend.md`, `assinatura-digital-cadastros.md`, `assinatura-digital-operacao.md` e `assinatura-digital-integracoes.md`.
