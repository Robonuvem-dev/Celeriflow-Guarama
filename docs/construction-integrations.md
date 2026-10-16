# Construção Civil — F8/F9

## Rotas

- `/obras/construcao-civil/integracoes`: validação, geração de lotes por competência, retificação e recibos manuais.
- `/obras/construcao-civil/[id]/pranchas`: upload, extração e comparativo com a versão do zoneamento.
- APIs `/api/construcao-civil/exportacoes`, `/exportacoes/[id]`, `/exportacoes/[id]/recibo`, `/pranchas` e `/pranchas/[id]`.

## F8

`MUNICIPAL_DEMO_JSON_V1` é um leiaute municipal **demonstrativo**, sem alegação de homologação federal. Somente alvarás `ConstructionIssuedDocument` do tipo `PERMIT`, com status `PUBLISHED`, publicação não futura, vigência atual e versão GED assinada com todas as assinaturas obrigatórias válidas entram no lote. `ISSUED` ainda aguarda publicação; originais corrigidos/renovados `SUPERSEDED` não são selecionados. ID de documento/versão e hash devem corresponder tanto na versão quanto nas assinaturas. Aprovação de parecer não gera número artificial de alvará. O início vem de `ConstructionLifecycleStart`.

Validação bloqueia lote sem alvará emitido, CPF/CNPJ inválido inclusive dígitos verificadores, imóveis incompletos, área não positiva, início anterior ao alvará e registros fora da competência. Cada lote contém número, versão/hash de origem, snapshot cadastral, competência, versão e SHA-256 dos bytes JSON. Download verifica o hash e entrega exatamente os bytes persistidos. Novas versões da mesma competência exigem retificação do último lote, com motivo. PostgreSQL impede UPDATE/DELETE dos lotes, itens, recibos e extrações. O recibo manual preserva protocolo, destino, data, observações, comprovante privado e hash; não representa integração automática nem aceite oficial.

## F9: extração real e adaptadores

`pdfjs-dist` lê o texto real do arquivo, página por página. O limite é 15 MB, 40 páginas e 300 mil caracteres. A origem PDF fica em Blob privado e o download verifica seu SHA-256.

O padrão `DEMO_RULES` executa um parser determinístico de rótulos explícitos no texto extraído. Não é IA e não simula extração de PDF. Campos sem evidência são omitidos. PDF digitalizado sem OCR retorna `UNIDENTIFIABLE`, sem preenchimento manual disfarçado.

Configuração do adaptador IA OpenAI-compatible:

```env
CONSTRUCTION_AI_PROVIDER=OPENAI_COMPATIBLE
CONSTRUCTION_AI_ENDPOINT=https://seu-provedor/v1/chat/completions
CONSTRUCTION_AI_MODEL=seu-modelo
CONSTRUCTION_AI_API_KEY=credencial-do-provedor
```

Endpoint e credenciais são exclusivamente de servidor. Retorno JSON com `measurements` exige campo, valor, unidade, página, trecho literal e confiança. O servidor rejeita página inexistente, trecho sem correspondência, unidade incompatível ou valor numérico sem suporte na evidência. `DEMO_RULES` continua utilizável sem credencial. Não houve execução de IA externa neste ambiente sem infraestrutura IA configurada.

OCR é um adaptador HTTP para serviço real externo, com timeout de 60 segundos:

```env
CONSTRUCTION_OCR_ENDPOINT=https://seu-ocr/extract
CONSTRUCTION_OCR_API_KEY=credencial-opcional
```

POST JSON `{pdfBase64, pages: [1, 2], language: "por"}`; resposta `{pages: [{page: 1, text: "texto reconhecido"}]}`. Somente páginas sem camada textual são enviadas para reconhecimento. A procedência `OCR` fica registrada. A credencial opcional usa Bearer. Este repositório não embute um motor OCR e não alega reconhecimento de imagens sem serviço configurado. Os testes validam o contrato OCR com adaptador de teste identificado.

O comparativo verifica área mínima e coeficiente de aproveitamento contra snapshot do zoneamento, preservando ID, versão e fundamento legal. Falta de evidência, baixa confiança ou valores conflitantes ficam inconclusivos. Múltiplos imóveis sem atribuição individual também ficam inconclusivos. Nenhuma extração aprova projeto, mede geometria/escala automaticamente ou substitui parecer técnico.

## Verificação

`node --import tsx --test tests/construction-integrations.test.ts` gera PDF real usando pdfkit, verifica texto/página/evidência/unidade, PDF sem texto, contrato OCR, rejeição de IA não ancorada, conflitos, limites, inconsistências de lote e imutabilidade dos bytes por hash. Homologação do leiaute/canal federal e instalação/configuração de IA/OCR de produção são dependências externas ainda abertas.
