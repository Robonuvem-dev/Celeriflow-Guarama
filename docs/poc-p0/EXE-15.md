# P0 — EXE-15: Gestão de Receitas Diversas

Ente: **PREFEITURA**. 9 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-15.1

**Fonte:** PDF p.110–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir configurar taxas e serviços a serem realizados,
possibilitando   definir   a   fórmula   de   cálculo   e   seus
respectivos parâmetros de cálculo. O sistema deverá
calcular automaticamente as taxas sem precisar que o
usuário digita os valores de forma manual.

- **Diagnóstico da faixa:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Gap a conferir:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Fases:** P2, P5. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s4-service.ts:23; src/lib/tributacao/s3-service.ts:39; src/lib/tributacao/index.ts:29; src/lib/tributacao/s7-service.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.2

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastrar o vínculo dos débitos de uma taxa
diversa, sendo: contribuinte, imóvel ou empresa.

- **Diagnóstico da faixa:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Gap a conferir:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Fases:** P2, P5. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s2-service.ts:4; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223; src/app/app-domain/tributacao/pessoas/page.tsx:35; src/lib/tributacao/s3-service.ts:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.3

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   cadastrar   e   configurar   o   cancelamento
automático   das   taxas   por   serviços   não   realizados.
Podendo definir a quantidade de dias vencidos.

- **Diagnóstico da faixa:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Gap a conferir:** PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto
- **Fases:** P2, P5. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/index.ts:49; src/lib/tributacao/s9-service.ts:4; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:309; src/app/app-domain/tributacao/nfse/NfseClient.tsx:477
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.4

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar e gerenciar as notas avulsas emitidas no
sistema, diferenciando as notas emitidas de forma on-
line e as emitidas internamente.

- **Diagnóstico da faixa:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Gap a conferir:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Fases:** P5, P7. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:120; src/app/app-domain/tributacao/page.tsx:22; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:80; src/lib/tributacao/s6-service.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.5

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   consulta   e   gerenciamento   das   notas   fiscais
possibilitar copiar uma nota avulsa, cancelar e alterar.

- **Diagnóstico da faixa:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Gap a conferir:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Fases:** P5, P7. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:370; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.6

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir definir a quantidade de notas que podem ser
emitidas   por   prestador   pessoa   física   e/ou   pessoa
jurídica, permitindo definir o limite se mensal ou anual.

- **Diagnóstico da faixa:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Gap a conferir:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Fases:** P5, P7. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:124; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:44; src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/pessoas/page.tsx:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.7

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inserir anexos nas notas fiscais avulsas.

- **Diagnóstico da faixa:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Gap a conferir:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Fases:** P5, P7. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:64; src/app/app-domain/tributacao/economico/[id]/page.tsx:6; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:370
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.8

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar liberar a emissão da nota avulsa via portal
do   cidadão,   permitindo   configurar   o   método   de
liberação da nota avulsa no portal, se libera a emissão
da nota mediante ao pagamento da mesma, se verifica
débitos do prestador, tipos de pessoa que poderão
acessar o serviço, podendo ser física, jurídica ou ambos
e o tipo de nota disponível: Normal, com retenção, Com
Retenção (INSS e IRRF). Possibilitar configurar um
termo de li e concordo para o usuário dar ciência do
processo e da veracidade das informações.

- **Diagnóstico da faixa:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Gap a conferir:** PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento
- **Fases:** P5, P7. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:32; src/lib/tributacao/s9-service.ts:9; src/lib/tributacao/s4-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:44
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-15.9

**Fonte:** PDF p.111–111. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir guias de recolhimento em padrão bancário, com
cálculo automático de acréscimos quando em atraso,
permitindo   a   configuração   e   emissão   de   diversos
layouts;

- **Diagnóstico da faixa:** PARCIAL no DAM; concluir cálculo temporal e documento; layout/convênio bancário na fase externa
- **Gap a conferir:** PARCIAL no DAM; concluir cálculo temporal e documento; layout/convênio bancário na fase externa
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:592; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:22; src/lib/tributacao/fiscal-engine.ts:31; src/lib/tributacao/nfse-danfse.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
