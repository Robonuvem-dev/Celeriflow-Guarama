# CeleriFlow — Integração eSocial | POC funcional com retornos simulados

**Destinatário:** Codex / equipe de desenvolvimento CeleriFlow  
**Contexto:** item 6 — eSocial (Web), 26 requisitos do edital anexados em imagens  
**Município demonstrativo:** Prefeitura Municipal de Aurora das Veredas/MG (fictícia)
**Complemento solicitado:** receber S-5001 a S-5013 quando acionado o comando na tela, com XMLs de consulta gerados pelo simulador.  
**Data-base da especificação:** 08/11/2026  
**Cenários:** competência mensal 10/2026 e 13º salário de 2026  
**Stack:** Next.js App Router, React, TypeScript, Neon PostgreSQL e persistência existente; usar Drizzle/Prisma conforme padrão real do projeto.

> **INSTRUÇÃO CRÍTICA AO CODEX:** IMPLEMENTAR UM MÓDULO DEMONSTRÁVEL E OPERACIONAL COM SIMULAÇÃO DE TRANSPORTE E DE RESPOSTA DO eSOCIAL, NÃO UMA TELA ESTÁTICA. O município, os dados, os protocolos e os recibos são **100% fictícios**. Nenhuma requisição deve chegar a endpoints oficiais do Governo Federal nesta POC. Identificar em toda a interface e nos arquivos: **"AMBIENTE DE DEMONSTRAÇÃO — RESPOSTAS SIMULADAS, SEM TRANSMISSÃO AO eSOCIAL"**. Não apresentar um recibo fictício como recibo governamental. A migração futura ativará um adaptador de produção com CNPJ real, credenciais autorizadas, certificados válidos, XSD vigentes e autorização formal.

## 0. Objetivo e critério geral de aceite

Preparar um módulo **RH e Folha > eSocial** que permita ao avaliador percorrer um fluxo igual ao operacional real: conferir dados > gerar evento/XML > pré-validar > preparar/enviar lote > obter protocolo > consultar processamento assíncrono > receber retorno individual com recibo/erro/advertência > interpretar totalizadores > corrigir > retransmitir > exportar e auditar. Tudo persistido no banco; recarregar a página não pode zerar a demonstração.

- Não sobrescrever a folha, as pessoas, rubricas ou tabelas já existentes: **integrar com dados reais do ambiente de demonstração** e completar somente lacunas com *seed* isolada e idempotente.
- Não inventar campo de retorno oficial. Os dados de apresentação devem passar por um modelo interno padronizado (a seguir), com um adaptador `DemoEsocialTransport` que emula as etapas e um futuro `OfficialEsocialTransport` inicialmente **desativado**.
- O motor deve responder dinamicamente às ações do usuário. Ex.: se corrigir a rubrica inexistente, a próxima tentativa precisa ser aceita; se excluir, o histórico permanece; se tentar reenviar sem alterações, deve demonstrar duplicidade/idempotência.
- Não usar `setTimeout` somente no frontend para fingir envio; estados/tempo de processamento são persistidos no backend. É aceitável um scheduler de simulação local/worker que progrida os lotes ao consultar, com relógio determinístico configurável para POC.
- Exigir separação por `tenantId`, órgão declarante, competência, evento, lote e usuário; garantir RBAC e histórico de auditoria. Toda implementação respeita os padrões e a segurança existentes no CeleriFlow.

## 1. Referências oficiais e diferenças importantes

- Documentação técnica oficial (revisar a versão na implantação): https://www.gov.br/esocial/pt-br/documentacao-tecnica/
- Manual de Orientação do Desenvolvedor v1.16 (agosto/2026): https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/996775-manualorientacaodesenvolvedoresocialv1-16.pdf
- Leiaute S-1.3 e suas atualizações: página oficial acima; base do simulador deve permitir versionamento por evento e competência.
- Eventos de **envio**: S-1000, S-1005, S-1010, S-1020, S-2200, S-1200 (RGPS), S-1202 (RPPS), S-1210, S-1298, S-1299, S-2230, S-2299, S-2300, S-2399, S-3000 e outros conforme a situação.
- Eventos **de retorno/totalizadores**: S-5001, S-5002, S-5003, S-5011, S-5012 e S-5013 **não são enviados pelo CeleriFlow**. Aparecem associados ao processamento de eventos elegíveis. Pelo manual v1.16: S-1200/S-2299/S-2399 podem retornar S-5001 e S-5003; S-1210 retorna S-5002; S-1299 retorna S-5011/S-5012/S-5013. Para S-1202, o S-5001 é condicional à existência de `infoPisPasep` no retorno descrito pelo manual; **não gerar S-5001/S-5003 automaticamente para todo servidor RPPS**.
- **Competência anual 13º:** folha S-1200/S-1299 usam `perApur=2026` para o período anual, quando aplicável. **S-1210 não possui período de apuração anual**: pagamentos entram na competência mensal de pagamento (ex.: `perApur=2026-12`, com referência `perRef=2026`). Aplicação de regras a RPPS deve seguir o leiaute e o regime correspondente.
- **Fornecedores:** não enviar toda nota de fornecedor ao eSocial. Pagamentos a pessoas jurídicas e retenções podem pertencer à **EFD-Reinf**, não ao eSocial. Para pessoas físicas, classificar relação de trabalho, trabalhador sem vínculo, pagamento sem relação de trabalho, regime e obrigação aplicável. Diárias devem ser vinculadas ao beneficiário e rubrica eSocial somente se enquadráveis, sem tratamento tributário presumido.
- A referência legal transcrita no item 11 do edital deve ser checada juridicamente antes da configuração definitiva; prevalecem as obrigações oficiais e os leiautes vigentes, não interpretação automática de uma numeração possivelmente equivocada no quadro.
- **Recebimento de lote não significa aceitação do evento**. `protocoloEnvio` é do lote; `nrRecibo` é do evento aceito. Sem recibo = não comprova aceitação. Rejeições não ganham recibo fictício.

## 2. Configuração funcional obrigatória (CeleriFlow)

Adicionar no menu **RH e Folha > eSocial** as abas:

1. **Visão geral:** cartões A enviar / Validados / Em processamento / Aceitos / Advertências / Erros / Excluídos; gráficos/quadros por competência e tipo; botão `Preparar eventos` e `Simular envio`.
2. **Pré-validação:** inconsistências por evento e origem (pessoa, vínculo, lotação, rubrica, folha, diária, prestador), com links diretos de edição no módulo gerador; opção `Validar novamente`.
3. **Eventos e arquivos:** colunas compactas (sem rolagem horizontal), 20 linhas por página, filtros data, competência, tipo, fase, CPF mascarado, status; detalhes em modal; `Visualizar`, `XML de envio`, `HTML`, `CSV`.
4. **Lotes e transmissão:** prévia do lote (até 50 eventos, conforme documentação da consulta), agrupamento compatível por categoria/precedência, botão de transmissão, acompanhamento de protocolo e detalhes individuais; botão `Consultar retorno`.
5. **Retornos do eSocial:** status do lote, data/hora de recepção, processamento, resposta de cada evento, ocorrências (código, tipo, mensagem, localização), recibo quando existir, XML de retorno, totalizadores vinculados, comparação com folha.
6. **Totalizadores e conciliação:** S-5001, S-5002, S-5003, S-5011, S-5012 e S-5013; filtros mensal, anual/13º, pessoa, regime, estabelecimento, totalizador; valores previstos vs simulados, diferença e status da conciliação.
7. **Diárias e prestadores:** duas consultas específicas; filtros e prévia da classificação eSocial / EFD-Reinf / fora do escopo; sem disparo automático indevido.
8. **Importação / migração:** importar XMLs/ZIPs de eventos previamente enviados por sistema concorrente, reconciliar CPF+matrícula+tipo+período+recibo+ID, exibir conflito e opção de manter registro existente; aceitar XMLs demonstrativos do kit nesta POC; em produção usar os webservices de consulta/download autorizados e regras atuais.
9. **Automação e notificações:** programação por competência e estágio, validação automática, envio automático **somente após autorização e na modalidade configurada**, alertas in-app e por e-mail para usuário habilitado; em demo pode registrar e-mails em outbox sem envio real se SMTP não estiver configurado.
10. **Configurações e auditoria:** ambiente com etiqueta DEMO, órgão/declarante, versão de leiaute, certificados, funções, notificações, histórico de ações imutável, documentação oficial acessível, botão de reset de cenário restrito ao administrador DEMO.

Aplicar diretrizes existentes de UX: sem rolagem horizontal, 20 itens/página, colunas ajustáveis sem quebrar o layout, filtro de texto/data/status, modais para texto longo, ações com ícones, menu e permissões de acordo com o CeleriFlow.

## 3. Motor de retorno: comportamento exigido

### 3.1 Máquina de estados

```text
DRAFT -> VALIDATING -> VALIDATED -> QUEUED -> SENT -> RECEIVED (protocolo)
  -> PROCESSING (cdResposta=101 no retorno de consulta)
  -> ACCEPTED (evento 201 + recibo)
  -> ACCEPTED_WITH_WARNING (evento 202 + recibo + ocorrência tipo 2)
  -> REJECTED (evento 4xx + ocorrência tipo 1 + sem recibo)
  -> TRANSPORT_ERROR (falha de comunicação, sem inventar resposta do governo)

CORRECTION_REQUIRED -> CORRECTED -> NEW_ATTEMPT -> ...
ACCEPTED -> EXCLUSION_REQUESTED -> S-3000 enviado/aceito -> EXCLUDED (com histórico preservado)
```

Atenção: status de lote e status de evento são diferentes; o lote `201` indica processamento do lote e seus resultados precisam ser lidos individualmente. Um lote pode conter eventos aceitos e rejeitados; preservar os status independentes. **Não misturar no mesmo lote exemplos de eventos de tabelas, não periódicos e periódicos: use lotes próprios por grupo e precedência, bem como um lote de fechamento separado.** `101` = aguardando processamento, `201` = processado, `202` = processado com advertências, `401` = erro de preenchimento/conteúdo, `402` = erro de schema (a semântica depende de se tratar de lote ou evento). **Não fazer mapeamento cego de códigos entre as duas camadas.**

### 3.2 Interface de transporte

```ts
type EsocialMode = 'DEMO' | 'PRODUCAO_RESTRITA' | 'PRODUCAO';
type EventOutcome = 'ACCEPTED' | 'ACCEPTED_WITH_WARNING' | 'REJECTED';

type EsocialOccurrence = {
  tipo: 1 | 2 | 3; // erro, advertência, histórico de validação
  codigo: string; // em DEMO usar prefixo DEMO-
  descricao: string;
  localizacao?: string; // XPath/caminho do campo
  correctionUrl?: string; // URL interna para corrigir a origem
};

type EsocialEventReturn = {
  eventId: string;
  eventType: string;
  batchId: string;
  eventStatusCode: 201 | 202 | 301 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409 | 410 | 411;
  eventStatusDescription: string;
  outcome: EventOutcome;
  receiptNumber: string | null;
  receptionAt: string;
  processedAt: string;
  duplicated: boolean;
  occurrences: EsocialOccurrence[];
  totalizers: Array<{ type: 'S-5001'|'S-5002'|'S-5003'|'S-5011'|'S-5012'|'S-5013'; id: string }>;
  source: 'SIMULATED' | 'GOVERNMENT';
  rawXmlObjectKey: string;
};

type EsocialBatchReturn = {
  batchId: string;
  protocolNumber: string | null; // só após recepção bem-sucedida
  batchStatusCode: number; // retorno de consulta
  batchStatusDescription: string;
  receivedAt: string | null;
  processedAt: string | null;
  estimatedCompletionSeconds?: number;
  events: EsocialEventReturn[];
  source: 'SIMULATED' | 'GOVERNMENT';
};

interface EsocialTransport {
  sendBatch(batchId: string): Promise<{ protocolNumber: string; batchStatusCode: number }>;
  consultBatch(protocolNumber: string): Promise<EsocialBatchReturn>;
  consultEventIdentifiers?(request: unknown): Promise<unknown>;
  downloadEvents?(request: unknown): Promise<unknown>;
}
```

Implementar `DemoEsocialTransport`, `OfficialEsocialTransport` **não configurado/inacessível nesta POC**, fábrica por órgão/ambiente, repositórios, serviço de pré-validação, serviço de conciliação e persistência dos XMLs imutáveis. Caso já exista uma arquitetura equivalente, adaptar em vez de duplicar.

### 3.3 Fluxo demonstrativo ao clicar em 'Simular envio'

1. Validar permissão, competência e se há pelo menos um evento aprovado para transmissão.
2. Persistir snapshot das informações de origem e XML de envio, versão do leiaute, `sha256` local e identificador do evento.
3. Criar lote; gerar `protocolNumber='DEMO-PROT-202610-0001'` após recebimento com `cdResposta=201` de **recepção**; gravar hora e autoria.
4. Mostrar situação `Recebido — aguardando processamento`. Uma consulta inicial devolve `cdResposta=101`, **sem recibo**.
5. Na consulta seguinte, segundo o roteiro configurado, gerar `cdResposta=201/202` de **processamento do lote** e retornos por evento.
6. Para cada evento aceito, vincular `DEMO-REC-...` e carimbo de data; para rejeitados, deixar recibo nulo e registrar mensagens de correção.
7. Quando S-1200 for aceito (cenário RGPS), anexar S-5001 e S-5003. Quando S-1210 aceito, anexar S-5002. No fechamento S-1299, anexar S-5011, S-5012, S-5013. Não inventar totalizador elegível para outro evento.
8. Desbloquear downloads XML `enviado` e `retorno` e acesso ao registro de origem; salvar ambos como arquivos diferentes.
9. Se usuário corrigir evento rejeitado, gerar nova tentativa com histórico e mostrar correção; não sobrescrever resposta anterior.
10. Se evento já aceito for reenviado com mesmo identificador e conteúdo, demonstrar recebimento de duplicidade / recuperação do recibo anterior; **não criar outro vínculo trabalhista**.

**Identificação de simulação:** usar sempre prefixos `DEMO-` nos protocolos e recibos da demonstração, mensagem visual no cabeçalho e atributo interno `source=SIMULATED`. Os códigos de resposta `101/201/202/401/...` reproduzem os **códigos oficiais**, mas códigos de ocorrência `DEMO-...`, nomes, valores e mensagens de detalhe são ilustrativos. As amostras XML seguem a *estrutura conceitual* dos retornos oficiais, não substituem o XSD nem uma resposta efetivamente assinada pelo governo.

## 4. Dados de demonstração

**Órgão:** Prefeitura Municipal de Aurora das Veredas/MG; `tenantId=aurora-das-veredas`; CNPJ representado por zeros `00000000000000` (deliberadamente não utilizável para transmissão oficial); `modoInterno=DEMO` e `tpAmb=2` **somente nos exemplos que imitam a Produção Restrita**. `tpAmb=9` **não** é valor oficial e não deve constar como se fosse ambiente eSocial. Não existe comunicação externa nesta POC. Competência `2026-10`.

**Pessoas (identidades sintéticas):**

| Matrícula | Nome | Vínculo | Regime | Evento principal | Base ilustrativa |
|---|---|---|---|---|---:|
| VA-0001 | Ana Martins | Estatutária | RPPS | S-1202 | R$ 5.400,00 |
| VA-0002 | Carlos Lima | Empregado público | RGPS | S-1200 | R$ 7.200,00 |
| VA-0003 | Bruno Souza | Temporário enquadrado no RGPS | RGPS | S-1200 | R$ 3.200,00 |
| VA-0004 | Elisa Oliveira | Estatutária | RPPS | S-2200/S-2230 | — |

O registro detalhado está em `fixtures/municipio.json`; CPFs são identificadores de demonstração, nunca base oficial. Dados, bases e tributos ilustrativos **não são cálculos tributários válidos**, portanto o sistema não deve aplicar a alíquotas reais sem um motor fiscal versionado.

### 4.1 Totalizadores ilustrativos e reconciliação

| Totalizador de retorno | Origem | Base/valor simulado pelo retorno | Exibição |
|---|---|---:|---|
| S-5001 (Carlos) | S-1200 | CP segurado R$ 815,00 | Individual RGPS |
| S-5001 (Bruno) | S-1200 | CP segurado R$ 260,00 | Individual RGPS |
| S-5002 (Carlos/Bruno) | S-1210 | IRRF R$ 470,00 / R$ 0,00 | Individual |
| S-5003 (Carlos/Bruno) | S-1200 | FGTS R$ 576,00 / R$ 256,00 | Individual RGPS |
| S-5011 | S-1299 | CP segurado acumulada R$ 1.075,00 | Consolidado; exemplo reduzido de conciliação |
| S-5012 | S-1299 | IRRF consolidado R$ 470,00 | Consolidado |
| S-5013 | S-1299 | FGTS consolidado R$ 832,00 | Consolidado |

**Divergência proposital para teste:** o CeleriFlow prevê CP do segurado RGPS em R$ 1.080,00, enquanto os retornos demonstrativos somam R$ 1.075,00 (diferença de **R$ -5,00**); a tela deve exibir alerta mesmo com S-1299 aceito. Para IRRF, `470-470=0`; para FGTS, `832-832=0`. Não tratar o S-5011 como se obrigatoriamente contivesse apenas CP de segurado: na implementação real ele possui composição detalhada, inclusive bases e valores por categorias/códigos, a importar conforme XSD.

### 4.2 Casos de teste com erro e advertência

- **Rubrica ausente no S-1010:** `S-1200` preparado com rubrica `RUB-999` não cadastrada; pré-validação exibe erro com link para cadastro; se forçado cenário de retorno, servidor simulado devolve evento `401`, ocorrência `DEMO-RUB-001`, caminho de rubrica e **sem recibo**. Criar rubrica correspondente, validar e retransmitir; nova tentativa aceita.
- **Advertência de cadastro:** `S-2200` com alerta não impeditivo definido no roteiro; resposta de evento `202`, ocorrência tipo `2` e recibo. Não misturar advertência com rejeição.
- **Lote de schema inválido:** falha `402` em recepção do lote, sem protocolo de recepção válido/sem eventos processados; pode ser demonstrada em cenário alternativo, não fazer mockar erro de XSD como erro de rubrica.
- **Lote pendente:** primeira consulta `101`, sem recibos, botão consultar permanece ativo, sem finalização imediata.
- **Duplicidade:** reenviar `S-2200` com mesmo ID de evento previamente aceito, não duplicar servidor; mostrar `evtDupl=true` e o recibo original recuperado.
- **Exclusão:** simular evento S-3000 de um evento elegível anteriormente aceito; preservação de recibos e trilha; não apagar definitivamente o dado.
- **Problema de comunicação:** timeout simulado ou HTTP indisponível => erro do transportador, não resposta `401` oficial.

## 5. Exemplos de dados de retorno que o simulador deve devolver

Os arquivos sob `fixtures/` são **exemplos prontos** a serem importados pelo Codex. O arquivo `lote-processado.xml` exemplifica um lote **periódico S-1200**; `lote-pagamento.xml`, `lote-advertencia.xml` e `retorno-totalizadores.xml` representam operações em **outros lotes**, conforme a ordem de precedência: `lote-recebido.xml`, `lote-pendente.xml`, `lote-processado.xml`, `retorno-evento-aceito.xml`, `retorno-evento-rejeitado.xml`, `retorno-evento-advertencia.xml`, `retorno-totalizadores.xml`, `eventos.json` e `totalizadores.json`.

### 5.1 Recepção de lote (antes do processamento)

```xml
<eSocial xmlns="urn:celeriflow:esocial:demo:retorno-envio">
  <retornoEnvioLoteEventos>
    <status><cdResposta>201</cdResposta><descResposta>Lote recebido com sucesso.</descResposta></status>
    <dadosRecepcaoLote>
      <protocoloEnvio>DEMO-PROT-202610-0001</protocoloEnvio>
      <dhRecepcao>2026-11-08T14:00:00-03:00</dhRecepcao>
    </dadosRecepcaoLote>
  </retornoEnvioLoteEventos>
</eSocial>
```

**Nota:** o namespace `urn:celeriflow:...:demo` sinaliza que este XML não é um documento validado pelos esquemas oficiais, e sim uma estrutura de amostra. Em integração real, usar o **namespace e os campos exatos do XSD vigente** (e assinatura quando aplicável). O arquivo de demonstração pode ter campos representativos simplificados; não afirmar que é XML do Governo.

### 5.2 Consulta pendente

```xml
<eSocial xmlns="urn:celeriflow:esocial:demo:retorno-processamento">
  <retornoProcessamentoLoteEventos>
    <status><cdResposta>101</cdResposta><descResposta>Lote Aguardando Processamento.</descResposta></status>
    <dadosRecepcaoLote><protocoloEnvio>DEMO-PROT-202610-0001</protocoloEnvio></dadosRecepcaoLote>
  </retornoProcessamentoLoteEventos>
</eSocial>
```

### 5.3 Processamento: aceitação, advertência e rejeição

| Tipo | Status de retorno | Recibo | Ação da tela |
|---|---:|---|---|
| S-1200 Carlos | 201 | DEMO-REC-000010 | Mostrar recibo e S-5001/S-5003 |
| S-1210 Carlos | 201 | DEMO-REC-000011 | Mostrar recibo e S-5002 |
| S-2200 Elisa | 202 | DEMO-REC-000012 | Mostrar advertência e recibo |
| S-1200 Rubrica ausente | 401 | — | Mostrar erro, campo, origem, botão corrigir |
| S-1299 Fechamento (lote próprio) | 201 | DEMO-REC-000013 | Mostrar consolidados S-5011/S-5012/S-5013 |

Detalhes dos retornos reais simulados devem ser representados em XML e no JSON normalizado; persistir `source=SIMULATED` em todas as operações.

### 5.4 Visualização de erro no CeleriFlow

**Evento S-1200 — VA-0003 — rejeitado**  
`Protocolo: DEMO-PROT-202610-0001` (cenário de rejeição em lote periódico separado)  
`Código do evento: 401 — Erro no conteúdo do evento`  
`Ocorrência: DEMO-RUB-001 — Rubrica RUB-999 não encontrada na tabela S-1010 vigente para 10/2026`  
`Localização: /eSocial/evtRemun/dmDev/infoPerApur/ideEstabLot/remunPerApur/itensRemun/codRubr`  
`Recibo: não gerado`  
Ações: **Corrigir rubrica** → **Validar novamente** → **Gerar novo XML** → **Simular reenvio** → **Consultar** → **Aceito**. A primeira tentativa continua no histórico como rejeitada.

### 5.5 Totalizadores pós-fechamento (S-1299)

Depois de aceitar o S-1299, registrar S-5011, S-5012 e S-5013 como **totalizadores retornados**, não arquivos que o CeleriFlow envia. O usuário deve poder abrir cada um, visualizar memória comparativa de valores, exportar HTML/CSV/XML demonstrativo e ver os eventos de origem que compõem o consolidado. Na tela, demonstrar que um retorno individual de um S-1200 pode coexistir com um retorno consolidado da competência.

### 5.6 Seis XMLs de totalizadores para abrir durante a POC

O kit contém, além do arquivo consolidado `retorno-totalizadores.xml`, seis **arquivos de retorno separados** para a visualização detalhada na aba `Retornos / Totalizadores`:

| XML de amostra | Evento | Comportamento demonstrado |
|---|---|---|
| `retorno-totalizador-s5001-carlos.xml` | S-5001 / `evtBasesTrab` | Contribuição previdenciária individual simulada, R$ 815,00 |
| `retorno-totalizador-s5002-carlos.xml` | S-5002 / `evtIrrfBenef` | IRRF do beneficiário, R$ 470,00 |
| `retorno-totalizador-s5003-carlos.xml` | S-5003 / `evtBasesFGTS` | Base FGTS R$ 7.200,00, FGTS R$ 576,00 |
| `retorno-totalizador-s5011-fechamento.xml` | S-5011 / `evtCS` | CP do segurado consolidada, R$ 1.075,00 |
| `retorno-totalizador-s5012-fechamento.xml` | S-5012 / `evtIrrf` | IRRF mensal consolidado, R$ 470,00 |
| `retorno-totalizador-s5013-fechamento.xml` | S-5013 / `evtFGTS` | Base FGTS R$ 10.400,00, FGTS R$ 832,00 |

**Restrições importantes:** estes XMLs usam **namespace privado `urn:celeriflow:esocial:demo:*`**, CNPJ/CPF intencionalmente inválidos e nós auxiliares `referenciaSimulacao` que **não fazem parte do XSD oficial**. Os nomes das raízes se aproximam dos totalizadores reais, mas **não presumir que a hierarquia interna seja fiel ao leiaute vigente**; o Codex deverá usar os XSD oficiais para o futuro adaptador de produção. Durante a demonstração, usar os campos normalizados de `totalizadores.json` para renderização e conciliação, e oferecer o XML conceitual como conteúdo de auditoria de testes. Para a POC, a visualização de cada XML deve ter uma faixa informando que se trata de retorno demonstrativo, não retornado pelo governo.

## 6. Importação de arquivos de sistema concorrente — comportamento

1. Importar XML/ZIP local (DEMO) ou obter identificadores/baixar arquivos pelos serviços oficiais (futuro).
2. Detectar tipo, competência, CNPJ declarante, `Id`, CPF, matrícula, período de referência, recibo, hash e fonte.
3. Exibir prévia: **Registros identificados / Existentes / Novos / Divergentes / Inválidos**.
4. Chave de deduplicação em camadas: `(tenantId, eventId)` e `(tenantId, tipo, cpf, matricula, competencia, demonstrativo/recibo conforme evento)`; não usar apenas CPF, que pode possuir múltiplos vínculos, e não presumir unicidade da matrícula entre declarantes.
5. Ao importar XML originalmente enviado por outro sistema, **não reenviar** automaticamente; marcar `IMPORTED_EXTERNAL`, preservar procedência e XML original; mostrar opção de vincular ao cadastro e histórico.
6. Eventos rejeitados **não aparecem no Download de Eventos aceitos do eSocial**; recuperação de falhas precisa consultar históricos do sistema de origem ou protocolos de lotes disponíveis. O simulador pode importar rejeições exclusivamente do seu próprio kit demonstrativo, claramente sinalizadas.
7. Tratar restrições oficiais dos serviços de consulta/download, inclusive autenticação, períodos de indisponibilidade e limites operacionais; não implementar varredura agressiva de produção.

## 7. E-mails, permissões e certificados

- **Perfis:** `ESOCIAL_VIEW`, `ESOCIAL_PREPARE`, `ESOCIAL_VALIDATE`, `ESOCIAL_SEND`, `ESOCIAL_ADMIN`, `ESOCIAL_AUDIT`. Enviar/retransmitir/excluir/alterar ambiente exigem permissão explícita e logs.
- **Notificações:** por evento/competência e estados `ACCEPTED`, `ACCEPTED_WITH_WARNING`, `REJECTED`, `EXCLUDED`, `TRANSPORT_ERROR`, `PENDING_TOO_LONG`; destinatários cadastrados; deduplicação por transição de estado; assunto expõe somente referências mínimas e link ao CeleriFlow, sem CPF completo/folha no corpo do e-mail.
- **Certificado:** interface para upload de A1 (.pfx/.p12) com senha em fluxo protegido, validação de expiração/CNPJ/perfil e armazenamento criptografado apropriado; **nenhuma chave privada real deve ser persistida em Vercel Blob público, banco em texto puro, logs ou bundle do cliente**. Para DEMO, exibir certificado sintético e dados de teste; não pedir uma chave real nem tentar assinar a resposta simulada como governo.
- **Histórico de erros:** ação `Arquivar erros resolvidos` pode limpar a visualização operacional, nunca apagar XML de tentativa anterior, ocorrência, usuário, hora, motivo e recibo; o item do edital que fala em "limpar histórico" não autoriza eliminar trilha probatória.
- **Múltiplas prefeituras:** configurar dados e credenciais por tenant; nunca compartilhar um certificado de cliente com outro sem autorização e modelo jurídico/técnico compatível.

## 8. Estrutura técnica recomendada

```text
src/modules/rh/esocial/
  domain/events.types.ts
  domain/state-machine.ts
  domain/event-classifier.ts
  ports/esocial-transport.ts
  transports/demo-esocial.transport.ts
  transports/official-esocial.transport.ts  # stub inativo nesta POC
  services/event-prevalidation.ts
  services/event-builder.ts
  services/xml-export.ts
  services/batch-service.ts
  services/processing-service.ts
  services/totalizer-reconciliation.ts
  services/import-competitor-events.ts
  services/esocial-notifications.ts
  repository/esocial.repository.ts
  fixtures/                                 # cópia da seed deste kit
  components/EsocialOverview.tsx
  components/EsocialEventsTable.tsx
  components/EsocialBatchDetails.tsx
  components/EsocialReturnViewer.tsx
  components/EsocialTotalizers.tsx
  components/EsocialCorrections.tsx
  components/EsocialSettings.tsx
```

### Entidades de persistência (mínimo)

- `esocial_environment`: tenant, declarante, modo, XSD/leiaute por vigência, status configuração.
- `esocial_event`: ID, tenant, tipo, competência, origem, servidor, matrícula, conteúdo serializado, hash, status atual, XML objeto-chave, versão.
- `esocial_event_attempt`: tentativa, id, lote, instante, status, protocolo, recibo, XML envio, XML retorno, fonte simulada/oficial; **append-only**.
- `esocial_batch`: lote, tenant, protocolo, data recepção, status batch, payload snapshot, XML de recepção, XML de consulta.
- `esocial_occurrence`: tentativa, tipo, código, descrição, localização, link origem, status resolvido/arquivado.
- `esocial_totalizer`: evento origem, totalizador, competência, valores estruturados e XML de retorno.
- `esocial_reconciliation`: rubrica/tributo, valor origem, valor retorno, diferença, tolerância, status, diagnóstico.
- `esocial_import`: arquivo, hash, origem, resultados, conflitos, usuário.
- `esocial_notification_subscription` e `esocial_notification_delivery`.
- `esocial_audit_log`: autor, antes/depois, operação, data, tenant, IP quando já usado no sistema.

Não duplicar dados integrais de CPF, PIS ou endereço em tabelas de logs; referenciar registros do RH e mascarar em UI. Armazenar XML em objeto privado com controle de acesso e metadados em banco, sem URLs públicas de download sem autenticação.

### Endpoints internos (adequar às rotas existentes)

```text
GET  /api/rh/esocial/dashboard?competencia=2026-10
POST /api/rh/esocial/seed-demo                 # ADMIN_DEMO only, idempotente
POST /api/rh/esocial/events/prepare
POST /api/rh/esocial/events/validate
GET  /api/rh/esocial/events?type=S-1200&status=REJECTED
GET  /api/rh/esocial/events/:id
GET  /api/rh/esocial/events/:id/xml?kind=sent|return
POST /api/rh/esocial/batches
POST /api/rh/esocial/batches/:id/send
GET  /api/rh/esocial/batches/:id/status
POST /api/rh/esocial/batches/:id/consult
GET  /api/rh/esocial/totalizers?competencia=2026-10
GET  /api/rh/esocial/reconciliation?competencia=2026-10
GET  /api/rh/esocial/events/:id/export?format=html|csv
POST /api/rh/esocial/import
GET  /api/rh/esocial/notifications
POST /api/rh/esocial/notifications/subscriptions
```

Usar autenticação existente, CSRF/autorizações no servidor, idempotency key no envio, mutex/concurrency por órgão/competência e rastreabilidade de cada operação. Não expor endpoint DEMO em produção para usuários não habilitados.


## 8-A. INSTRUÇÃO NOVA E PRIORITÁRIA — Simular recebimento dos totalizadores S-5001 a S-5013 por comando

> **REQUISITO DE ACEITE INEGOCIÁVEL:** Na Prefeitura Municipal de **Aurora das Veredas/MG**, o usuário autorizado deve clicar em **`Simular recebimento do eSocial`** e ver o próprio CeleriFlow consultar um serviço de demonstração local que devolve **as respostas dos lotes com os respectivos totalizadores**, sem instalar arquivos manualmente, sem acessar o Governo e sem mostrar apenas uma lista estática. As seis espécies S-5001, S-5002, S-5003, S-5011, S-5012 e S-5013 devem aparecer **como recebidas, nunca como transmitidas**. O sistema deve permitir abrir e baixar cada XML ilustrativo e localizar o servidor, o evento de origem, a competência e o recibo do evento originário.

### 8-A.1. Referência exata de comportamento oficial

No eSocial oficial o sistema do empregador **envia eventos** (S-1200, S-1210, S-1299 etc.) por Web Service de lotes, recebe **um protocolo**, então **consulta por protocolo** o Web Service `ConsultarLoteEventos`; o **XML de retorno do processamento** contém `retornoEventos/evento/retornoEvento` e, quando cabível, uma ou várias tags `tot` cujo atributo `tipo` identifica o totalizador devolvido. O eSocial **não faz push espontâneo** para a prefeitura. Portanto, o comando no CeleriFlow deve **simular a consulta e o recebimento**, não um webhook inventado.

| Evento do CeleriFlow enviado (simulado) | Totalizadores devolvidos pela consulta (simulados) | Observação para Aurora das Veredas |
|---|---|---|
| S-1200 de servidor RGPS (Carlos, Bruno) | S-5001 (contribuições por trabalhador) e S-5003 (FGTS por trabalhador) | Dois totalizadores distintos **por evento/servidor**, com números de origem ligados ao recibo do S-1200 |
| S-1210 de cada beneficiário (Carlos, Bruno) | S-5002 (IRRF por beneficiário) | Deve existir mesmo quando o valor demonstrativo do IRRF for 0,00; não inventar retenção |
| S-1299 mensal de 10/2026 | S-5011 (contribuições consolidadas), S-5012 (IRRF consolidado), S-5013 (FGTS consolidado) | São três objetos de retorno **do fechamento**, não três lotes enviados |
| S-1202 da servidora RPPS Ana | Normalmente apenas retorno de processamento/recibo; S-5001 somente se presente a condição `infoPisPasep` | **Nunca forçar S-5003** só porque foi enviada a remuneração RPPS |
| Evento rejeitado 401 | Nenhum totalizador e **nenhum recibo de aceite** | Deve exibir ocorrência e opção de correção |
| S-1298 / novo S-1299 | Retificações/reprocessamento conforme origem e competência | Reabrir antes de reprocessar folha já fechada e manter versões/histórico |

**Fontes e seções:** [Manual do Desenvolvedor v1.16 (08/2026), 7.6.10 e 7.6.11](https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/996775-manualorientacaodesenvolvedoresocialv1-16.pdf), [documentação oficial / XSD S-1.3](https://www.gov.br/esocial/pt-br/documentacao-tecnica/). Os arquivos do kit são didáticos, em namespace privado e **não validam** com o XSD real.

### 8-A.2. Botões e experiência da POC

Dentro de **RH e Folha > eSocial > Retornos do eSocial**, mostrar um seletor `Competência: 10/2026`, um seletor de lote e três ações:

1. **`Simular recebimento do eSocial` (principal):** comando de execução completa. Se já existirem lotes de remuneração, pagamentos e fechamento marcados como `SENT/RECEIVED`, faz as consultas locais do cenário `NORMAL` e persiste seus resultados, inclusive a etapa intermediária `101`. Se o ambiente de demonstração estiver vazio, **prepara somente o cenário de POC**, cria os envios DEMO coerentes e seus protocolos, executa as etapas e recebe os seis tipos de totalizadores. Exibir progresso e uma linha do tempo persistida. No primeiro uso deve funcionar sem que o avaliador precise fazer pré-cadastros manuais.
2. **`Consultar retorno (próxima etapa)` (modo guiado):** a primeira consulta ao protocolo retorna `101 / aguardando`, sem recibo e sem S-5xxx; a consulta posterior retorna `201 / processado` e insere recibos e os S-5xxx elegíveis. Demonstrar que `201` da **recepção** do lote e `201` do **processamento** são mensagens distintas.
3. **`Reiniciar cenário DEMO`:** apenas administrador, reset lógico/idempotente dos estados de demonstração com auditoria preservada; não mexer nos dados reais de folha nem em registros oficiais.

O botão **NÃO** pode adicionar os seis totalizadores em todo clique, nem gerar um S-5011 antes do S-1299, nem mostrar uma resposta de retorno se nenhum lote/protocolo existir. Para execução direta, criar internamente os lotes demonstrativos como etapa explicitamente mostrada na linha do tempo. Se houver lote rejeitado impeditivo, o fechamento não deve prosseguir antes da correção (no cenário principal, use apenas os lotes válidos e guarde o erro num lote alternativo).

Mostrar, ao receber: toast `Resposta do eSocial recebida (simulação)`, com etiqueta constante `DEMO — SEM COMUNICAÇÃO COM O GOVERNO`. Na tabela:

`Data/hora | Competência | Lote/protocolo | Evento de origem | Totalizador recebido | Servidor/regime | Status | Valor | Recibo de origem | Ações`

- Ações: **Visualizar XML de retorno**, **Baixar XML**, **Detalhar cálculos**, **Abrir folha**, **Abrir evento de envio**, **Histórico de consultas**, **Conciliar valores**.
- Separar aba **Eventos enviados** de aba **Retornos recebidos**; S-5xxx nunca deve aparecer na fila `A enviar`, nem ter botão `Transmitir`.
- Cards de demonstração: `Recebidos por consulta`, `Individualizados`, `Consolidados`, `Com divergência`, `Aguardando processamento`.
- Manter layout do CeleriFlow: 20 linhas por página, sem rolagem horizontal e filtros de competência, tipo S-5xxx, servidor e situação; texto extenso em modal, com CPF mascarado.

### 8-A.3. O que acontece no backend ao receber o comando

```ts
// Contrato sugerido — adaptar ao router, ORM e serviços já existentes.
type DemoReturnCommand = {
  competencia: '2026-10' | string;
  action: 'SIMULAR_RECEBIMENTO_COMPLETO' | 'CONSULTAR_RETORNO_PASSO_A_PASSO';
  scenario?: 'NORMAL' | 'ERRO_RUBRICA' | 'ADVERTENCIA' | 'DUPLICIDADE' | '13_SALARIO';
  batchId?: string;                 // requerido para consulta unitária, opcional no ciclo completo
  idempotencyKey: string;           // client nonce, único por intenção de comando
};

// NÃO aceitar tenantId arbitrário do body: o servidor resolve pelo usuário logado.
// Middleware: RBAC ESOCIAL_SEND/ESOCIAL_ADMIN, modo DEMO, auditoria, trava por tenant+competência.
// POST /api/rh/esocial/demo/simular-recebimento
// 1. Reusar tenant existente (inclusive possível alias histórico) e verificar competencia.
// 2. Reusar eventos da folha do Aurora das Veredas; aplicar seed faltante somente no modo DEMO.
// 3. Selecionar lotes válidos, em ordem: S-1200/S-1202 -> S-1210 -> S-1299.
// 4. Preparar XML de envio e registrar recepção do lote: protocolo DEMO-PROT (sem nrRecibo).
// 5. Consultar demo: primeira resposta cdResposta 101; registrar snapshot na timeline.
// 6. Consultar demo: segunda resposta 201; parsear retornoEventos/evento/retornoEvento e cada tot.
// 7. Persistir atomicamente: consulta, recibos dos eventos aceitos, S-5xxx recebidos, XML privado,
//    vínculo ao evento originário, competência, código status, valores, checksum e auditoria.
// 8. Abrir visão 'Retornos recebidos' com eventos destacados e conciliação atualizada.
// 9. Retornar IDs dos resultados; frontend só renderiza o que backend persistiu.
// 10. Retry ou clique repetido: retornar mesmo snapshot (sem duplicar recibos ou totalizadores).
```

**Estrutura mínima da persistência adicional** (acrescentar à seção 8, aproveitando tabelas existentes):

- `esocial_return_consultation`: `{id, tenantId, batchId, protocol, queryIndex, requestedAt, responseAt, statusCode, source='SIMULATED', rawXmlKey, userId, idempotencyKey}`. Toda consulta, inclusive `101`, deve gerar um registro.
- `esocial_inbound_totalizer`: `{id, tenantId, originEventId, originReceipt, originAttemptId, totalizerType, competencia, matricula?, regime?, payloadJson, originalXmlKey, importHash, receivedAt, consultationId, source='SIMULATED', revision}`.
- `esocial_reconciliation`: par `{origemFolha, retorno}` por código/competência/base (não fazer confronto de métricas incompatíveis); preservar diferenças, estado e usuário.
- Índices únicos: `tenant + originEventId + originReceipt + totalizerType + revision` e `tenant + batchId + queryIndex + idempotencyKey` com *upsert* seguro; armazenar a mesma resposta sem multiplicar linhas em consultas repetidas.
- Ao reprocessar após retificação, criar **nova revisão** ligada ao evento retificado, nunca substituir silenciosamente o XML e os números da revisão anterior.
- Permissão de leitura de retorno restrita ao tenant e a perfis RH/eSocial; exportações e blobs precisam de URL privada assinada de curta duração.

**Contrato de transporte:** `DemoEsocialTransport.consultBatch(protocol)` lê o estado persistido do simulador e devolve respostas como as do kit; `OfficialEsocialTransport` permanece desabilitado e será implementado com os schemas vigentes, certificados autorizados e testes em Produção Restrita. Não inserir chamadas reais a `gov.br` no botão DEMO. O *frontend* nunca fabrica um retorno localmente. O *backend* monta e entrega a resposta e a UI lê os registros persistidos.

### 8-A.4. Cenário principal — Aurora das Veredas, outubro de 2026

Usar **exatamente os mesmos servidores, matrículas e eventos de origem da fixture anterior**; evitar criar um segundo município. Nome exibido: `Aurora das Veredas` (pode haver referência histórica interna `vereda-das-auroras` no projeto; resolver por alias, sem duplicar `tenant`). Não renomear IDs/CPF/matrículas reais de maneira destrutiva. Os códigos `VA-000x` já existentes na seed DEMO podem continuar representando suas matrículas históricas.

| Lote DEMO de origem | Evento enviado | Totalizador recebido | Beneficiário / matrícula | Valor ilustrativo |
|---|---|---|---|---:|
| `DEMO-LOTE-202610-0001` | S-1200 | S-5001 | Carlos Lima, VA-0002 | Contribuição R$ 815,00 |
| `DEMO-LOTE-202610-0001` | S-1200 | S-5001 | Bruno Souza, VA-0003 | Contribuição R$ 260,00 |
| `DEMO-LOTE-202610-0001` | S-1200 | S-5003 | Carlos Lima, VA-0002 | FGTS R$ 576,00 |
| `DEMO-LOTE-202610-0001` | S-1200 | S-5003 | Bruno Souza, VA-0003 | FGTS R$ 256,00 |
| `DEMO-LOTE-PAGAMENTOS-0001` | S-1210 | S-5002 | Carlos Lima, VA-0002 | IRRF R$ 470,00 |
| `DEMO-LOTE-PAGAMENTOS-0001` | S-1210 | S-5002 | Bruno Souza, VA-0003 | IRRF R$ 0,00 |
| `DEMO-LOTE-202610-FECHO` | S-1299 | S-5011 | Prefeitura — competência 10/2026 | CP do segurado RGPS ilustrativa R$ 1.075,00 |
| `DEMO-LOTE-202610-FECHO` | S-1299 | S-5012 | Prefeitura — competência 10/2026 | IRRF R$ 470,00 |
| `DEMO-LOTE-202610-FECHO` | S-1299 | S-5013 | Prefeitura — competência 10/2026 | FGTS R$ 832,00 |

São **9 registros de totalizadores recebidos** pertencentes a **6 tipos**, distribuídos nos lotes corretos. Os números são exclusivamente didáticos e não representam cálculo tributário oficial, multa, guia ou recolhimento efetivo.

**Conciliação intencional:** folhas RGPS registram CP esperada R$ 1.080,00; retornos demonstrativos S-5001 somam R$ 815,00 + R$ 260,00 = **R$ 1.075,00**, com diferença de **−R$ 5,00**. O cartão ficará em `DIVERGENTE` e abrirá a explicação. IRRF = R$ 470,00 e FGTS = R$ 832,00 ficam `CONCILIADOS`. O valor S-5011 usado para **esta comparação específica** é apenas sua parcela de CP segurado RGPS: ele pode possuir outros valores no leiaute completo; jamais comparar o total completo do S-5011 com um subtotal do RH sem normalizar componentes.

### 8-A.5. Arquivos de exemplo que o Codex DEVE carregar

O ZIP atualizado traz `fixtures/retornos-por-comando/`:

| Arquivo | Momento que aparece na tela | Ação verificada |
|---|---|---|
| `00-configuracao-comando.json` | Configuração do simulador | Comandos, ordem dos lotes, perfis, IDs de origem, cenários |
| `01-recepcao.xml` | Ao enviar lote simulado | Protocolo, sem recibos de eventos |
| `02-consulta-pendente.xml` | Primeira consulta do lote | `101`, sem evento aceito/totalizador |
| `03-retorno-remuneracoes.xml` | Segunda consulta dos eventos S-1200 e S-1202 | S-5001/S-5003 de Carlos e Bruno; Ana RPPS com recibo, sem totalizador não aplicável |
| `04-retorno-pagamentos.xml` | Consulta do lote S-1210 | S-5002 por beneficiário (inclusive zero) |
| `05-retorno-fechamento.xml` | Consulta após S-1299 aceito | Três tags `tot`: S-5011, S-5012, S-5013 |
| `06-retorno-rejeicao.xml` | Cenário alternativo, S-1200 inválido | Código de erro, sem recibo e sem totalizador |
| `07-payloads-normalizados.json` | Base de dados e testes da UI | Todos os retornos normalizados e valores por origem |

Esses XMLs têm hierarquia **inspirada** no Web Service oficial e representam uma **resposta mockada local, não o conteúdo XSD verdadeiro**; a produção exigirá o XSD e a assinatura pertinentes. O `tot tipo="S-5xxx"` deve conter XML do totalizador **como item de resposta da consulta**, não aparecer como evento de envio nem possuir um recibo independente inventado.

### 8-A.6. Comportamento em erro, duplicidade, encerramento e 13º

1. **Erro de rubrica:** selecionar `ERRO_RUBRICA`; retorno 401 em `DEMO-EVT-1200-ERR-003` e ocorrência `DEMO-RUB-001`, com `nrRecibo=null`, `totalizers=[]`, link para cadastro de rubrica. Corrigir e executar nova tentativa; só após aceite gerar S-5001/S-5003 dessa nova tentativa.
2. **Advertência:** evento com retorno 202 e recibo, mostrar texto no detalhe; não rotular S-5001/S-5003 do evento como erro se não houver rejeição.
3. **Duplicidade:** repetir mesmo protocolo/mesma tentativa não cria novo registro. `evtDupl` deve ser exposto quando o cenário justificar, com vínculo ao recibo original, sem criar novo trabalhador.
4. **Fechamento:** `S-5011/5012/5013` são retornos após S-1299 (ou S-1295 se aplicável), não somente após pressionar `Consolidar`; se houver erro bloqueante no lote periódico principal, tratar antes do fechamento.
5. **Retificação de folha fechada:** simular S-1298 (reabertura), retificar S-1200/S-1210 e enviar novo S-1299; criar revisão dos retornos e um comparativo antes/depois. Não apagar o retorno anterior.
6. **13º salário:** permitir alterar competência para `Anual 2026`; eventos anuais de remuneração/fechamento seguem as regras do seu regime; S-1210 de pagamento vai na competência **mensal em que ocorreu** (por exemplo 2026-12), não `perApur=2026` no S-1210. **Não copiar cegamente os valores mensais de outubro para 13º.** Apresentar o comportamento com dados fictícios próprios após o ciclo mensal funcionar.
7. **Segurança e ambiente:** usuário só leitura pode ver XML e não acionar recebimento; em qualquer simulação `source=SIMULATED` e proibição técnica de requisições externas. Usar `tpAmb=2` somente quando o XML ilustrar o ambiente restrito, mantendo `mode=DEMO` como dimensão interna **distinta** de `tpAmb`.

### 8-A.7. API, testes automatizados e critério de conclusão

Adicionar (ou adaptar às rotas equivalentes existentes):

```text
POST /api/rh/esocial/demo/simular-recebimento    # DEMO + ESOCIAL_SEND; executa todos os lotes aptos
POST /api/rh/esocial/demo/consultar-retorno       # DEMO + ESOCIAL_SEND; próxima fase do lote
GET  /api/rh/esocial/retornos?competencia=2026-10&tipo=S-5001
GET  /api/rh/esocial/retornos/:id                # totalizador estruturado + origem
GET  /api/rh/esocial/retornos/:id/xml            # XML de RETORNO, nunca XML do envio
GET  /api/rh/esocial/retornos/:id/historico      # tentativas, consultas e revisões
GET  /api/rh/esocial/conciliacao?competencia=2026-10
POST /api/rh/esocial/demo/reset-cenario          # somente ESOCIAL_ADMIN
```

**Exigir ao Codex testes de aceitação executados**, no mínimo:

- `SIMULAR_RECEBIMENTO_COMPLETO` em ambiente DEMO limpo gera os protocolos, registra estado `101`, depois `201` e resulta nos **9 registros** (2×S-5001, 2×S-5002, 2×S-5003, 1×S-5011, 1×S-5012 e 1×S-5013).
- Clique duplicado ou refresh **não** duplica registros; `reset`/nova execução reinicia de modo determinístico e auditável.
- Cada S-5001/S-5003 aponta ao evento S-1200 correto e seu recibo; cada S-5002 ao S-1210; S-5011/12/13 ao S-1299, sem confundir recibo de totalizador com recibo de envio.
- S-1202 da Ana RPPS gera recibo, sem S-5001 se não há `infoPisPasep`, nem S-5003 indevido.
- Erro alternativo 401 não gera recibo/totalizador e tem link para corrigir, revalidar e reenviar nova tentativa.
- Soma individual contribuições = R$ 1.075,00; FGTS = R$ 832,00; IRRF = R$ 470,00; conciliação CP difere R$ -5,00 dos R$ 1.080,00 esperados pela folha.
- `GET /retornos?tipo=S-5001` retorna **dois** registros; `tipo=S-5011` retorna **um**, após fechamento.
- Se consultar antes de processar, nenhuma linha de S-5xxx fica disponível; se tentar fechar com pendência real impeditiva, sistema impede ou solicita correção.
- Usuário `ESOCIAL_VIEW` não executa os comandos (403 servidor); outro tenant não consegue visualizar nem baixar XML alheio.
- Mock demonstrativo: **zero conexões** com os hosts oficiais; valores demonstrativos são de demonstração, nunca de guia recolhida.
- Os arquivos gerados são parseáveis XML; o Codex deve informar expressamente que **não** passaram pelo XSD oficial.

**A implementação só está concluída quando o fluxo inteiro funciona com clique real no CeleriFlow**, persistência e exportação, e a equipe consegue demonstrar os seis tipos de retorno sendo recebidos através da consulta. Exibir uma tabela pré-preenchida a partir do JSON, sem motor de estados, **não satisfaz esta especificação**.

## 9. Matriz de cobertura — 26 requisitos do item 6 do edital

| Nº | Requisito resumido | Implementação / teste verificável |
|---:|---|---|
| 1 | Ver diárias encaminháveis | Tela Diárias > classificação, rubrica, vínculo e prévia do evento elegível |
| 2 | Resumo enviados/a enviar | Dashboard de quantidades; clicar abre lista filtrada |
| 3 | Ver fornecedores/prestadores | Aba Prestadores com classificação eSocial / EFD-Reinf / fora do escopo |
| 4 | Automatizar envio por período | Agenda com competência, pré-validação, fila e registro de execução DEMO |
| 5 | Usuários notificados por erro/sucesso/exclusão | Assinaturas de notificações, log e 3 transições demonstráveis |
| 6 | Totalizadores mensal/anual/13º | S-5001/5002/5003/5011/5012/5013 com conciliação e R$ -5,00 simulado |
| 7 | Ver informações de fornecedores | Mesma aba com consulta detalhada, registro de origem e filtros |
| 8 | Automação de eventos | Processar fila de tabelas, vínculos e periódicos respeitando precedência |
| 9 | Notificação por e-mail | Outbox DEMO e envio real apenas se SMTP configurado, sem vazar PII |
| 10 | Matrículas de software concorrente / prevenir duplicidade | Importador e regra `CPF + matrícula + vínculo + ID`/conflitos |
| 11 | Envio conforme leiaute e órgãos públicos | XML demonstrativo, validação estrutural local, arquitetura para XSD oficial |
| 12 | Relatório de inconsistências | Auditoria pré-envio: quantidade, gravidade, origem, exportação |
| 13 | Quantidade de registros elegíveis | Grade por evento: elegíveis, inválidos, já enviados e selecionados |
| 14 | Acesso aos dados de origem | Ação `Abrir no cadastro`/rubrica/folha/diária/prestador |
| 15 | Filtrar situação dos arquivos | Aceitos, erro, processamento, advertência, excluídos |
| 16 | Acesso ao leiaute oficial | Ajuda contextual por S-xxxx e link a documentação gov.br |
| 17 | Limpar histórico de erros após resolução | Arquivar erro resolvido sem apagar auditoria/retornos |
| 18 | Ver resultado, protocolo e recibo | Detalhe de lote e evento, protocolo de envio, recibo só se aceito |
| 19 | Filtro rápido por tipo de evento/fase | Filtros S-1000, S-2200, S-1200, S-1210, S-1299, etc. |
| 20 | Importar eventos baixados de outro sistema | Upload ZIP/XML, import preview, anti-duplicidade e histórico |
| 21 | Exportar HTML e CSV por evento | Exportações com cabeçalho DEMO, campos estruturados e dados mascarados |
| 22 | Importar certificado digital | Formulário A1 seguro; modo DEMO com configuração sintética |
| 23 | Configurar usuários com permissão de envio | RBAC, habilitar/revogar e testes 403 na API |
| 24 | Baixar XML enviado | Download do snapshot de XML da tentativa, sem substituir por XML de retorno |
| 25 | Baixar XML de retorno | Download separado de recepção, processamento e retorno do evento/totalizador |
| 26 | Visualizar erros para corrigir | Ocorrência, código, caminho, descrição, link origem e retry após correção |

## 10. Roteiro de POC (juiz testando ao vivo)

**Preparação:** usar `Carregar demonstração Aurora das Veredas` uma única vez; 3 perfis predefinidos: administrador, operador autorizado a enviar e auditor somente leitura. Seed idempotente.

1. Abrir RH > eSocial e demonstrar painel da competência 10/2026 com contagens coerentes.
2. Trocar filtro para `S-1200`; abrir dados do servidor Carlos e mostrar origem na folha.
3. Abrir Diárias, selecionar beneficiário e ver classificação e rubrica; filtrar outro caso não elegível.
4. Abrir Prestadores e demonstrar PF com relação de trabalho vs PJ direcionada a EFD-Reinf.
5. Executar `Validar pré-envio`; demonstrar rubrica ausente e relatório com link para correção.
6. Preparar lote de eventos já válidos e abrir XML enviado; mostrar prévia de elegíveis.
7. Clicar `Simular envio`: retorno de **recepção 201** com protocolo DEMO; demonstrar que **ainda não há recibo**.
8. Clicar `Consultar processamento` imediatamente: **101**, pendente.
9. Avançar consulta: **201/202** processamento e abrir evento aceito **201 com recibo**.
10. Abrir S-1200 Carlos e ver S-5001/S-5003; abrir S-1210 e ver S-5002.
11. Abrir caso com advertência: **202 com recibo** e descrição da advertência.
12. Abrir caso rejeitado: **401 sem recibo**, código/localização e link para correção.
13. Corrigir a rubrica na tela de origem, revalidar, criar nova tentativa e mostrar aceitação posterior. Histórico anterior continua.
14. Reenviar mesmo `eventId` já aceito, mostrar duplicidade controlada e recibo original.
15. Enviar S-1299 de 10/2026 após eventos periódicos; abrir S-5011, S-5012, S-5013.
16. Abrir conciliação: CP prevista R$ 1.080,00 × retorno R$ 1.075,00; diferença R$ -5,00. FGTS e IRRF conciliados.
17. Filtrar por status: aceitos, erros, advertências, em processamento e excluídos.
18. Exportar CSV/HTML de um evento e baixar XML de envio e XML de retorno (são arquivos distintos).
19. Importar XML do sistema concorrente pelo kit; demonstrar registro novo, duplicado e divergente.
20. Abrir e-mails/outbox e perfis; auditor não consegue transmitir; operador autorizado consegue.
21. Demonstrar agendamento por competência e resultado no histórico.
22. Demonstrar exclusão de um evento elegível por S-3000 (sem apagar tentativas).
23. Trocar filtro para anual 2026: apresentar 13º com S-1200/S-1299 anual e pagamento S-1210 mensal.
24. Abrir documentos oficiais pela ajuda e voltar ao CeleriFlow.
25. Atualizar o navegador: lote, retornos, recibos DEMO, notificações e trilha permanecem.
26. Mostrar a tela de migração para real como **configuração ainda não ativada**, com checklist de certificado/CNPJ/ambiente/credenciais/XSD/validação, sem mudar o modo DEMO.

## 11. Testes automatizados/aceite (não concluir antes)

```gherkin
Cenário: lote recebido mas ainda sem recibo
  Dado evento validado e modo DEMO
  Quando envio o lote
  Então obtenho protocolo de recepção com código 201
  E todos os recibos de evento permanecem nulos até processamento
  Quando consulto a primeira vez
  Então retorno código 101 e status PROCESSING

Cenário: aceitação com totalizadores
  Dado S-1200 RGPS válido no lote
  Quando o processamento simulado é concluído
  Então há resposta 201 e recibo DEMO
  E há totalizadores S-5001 e S-5003 vinculados ao evento

Cenário: retorno de S-1210
  Dado S-1210 válido com pagamento em competência mensal
  Quando o processamento é concluído
  Então há S-5002 e recibo do S-1210

Cenário: rubrica ausente
  Dado S-1200 com RUB-999 ausente de S-1010
  Quando forçado o cenário de rejeição
  Então resposta 401, ocorrência DEMO-RUB-001 e recibo nulo
  Quando a rubrica é corrigida e uma nova tentativa é processada
  Então nova tentativa aceita e a rejeição antiga permanece auditável

Cenário: fechamento
  Dado os eventos periódicos elegíveis aceitos
  Quando S-1299 é aceito
  Então S-5011, S-5012 e S-5013 aparecem como retornos
  E há conciliação com diferença proposital de R$ -5,00 em CP

Cenário: permissão
  Dado usuário somente leitura
  Quando acessa POST /batches/:id/send
  Então a API retorna 403 e nenhum lote muda de estado

Cenário: isolamento
  Dado outro tenant
  Quando tenta consultar protocolo de Aurora das Veredas
  Então não acessa XML, recibos, eventos ou notificações daquele tenant

Cenário: modo DEMO
  Quando qualquer ação de envio é executada
  Então nenhuma chamada HTTP é feita para domínio esocial.gov.br
  E os XMLs e recibos têm marcação de simulação
```

Além desses cenários, criar testes para: idempotência do *seed*; exclusão/auditoria; importação de sistema concorrente; duas matrículas para um CPF; exibição de 20 registros por página; data/filtros; exportações válidas; segurança do certificado; falha de rede; rejeição estrutural; retorno 202 com recibo; 13º mensal/anual; persistência após refresh.

## 12. Entregáveis solicitados ao Codex

1. Código implementado **no CeleriFlow existente**, não projeto separado.
2. Migração SQL e modelos/tabelas idempotentes sem afetar outros tenants.
3. Seed de Aurora das Veredas, eventos e retornos importados das `fixtures/`, com o comando de recebimento descrito na seção 8-A.
4. Menu, telas e permissões funcionais; múltiplos status com filtros e modais.
5. Simulador de Web Services eSocial com respostas persistentes, **não capturas estáticas**.
6. Downloads XML (envio/retorno), CSV e HTML; histórico de versões e recibos DEMO.
7. Relatório de aderência **item a item (1 a 26)** com teste executado, URL/rota/tela e evidência, marcando o que for parcial ou não implementado.
8. `README` de execução de POC (seed, usuários demo, roteiro, reset), testes de unidade e integração; registrar quais formatos são apenas exemplos e quais passaram por validação XSD.
9. **Não alegar integração real ativa:** deixar `OfficialEsocialTransport` protegido e implementar posteriormente após contratação/implantação, CNPJ e certificado reais, checagem dos leiautes e testes em Produção Restrita.

## 13. Fontes de referência para implementação real

- Portal eSocial: https://www.gov.br/esocial/pt-br/documentacao-tecnica/
- Manual do Desenvolvedor v1.16: https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/996775-manualorientacaodesenvolvedoresocialv1-16.pdf
- Serviços de consulta/download e suas restrições: capítulos 7.6 a 7.8 do manual v1.16.
- Regras para 13º: https://www.gov.br/esocial/pt-br/empresas/perguntas-frequentes/perguntas-frequentes-producao-empresas-e-ambiente-de-testes/
- Distinção eSocial / EFD-Reinf em pagamentos PF/PJ: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/1-geral/1-17-as-informacoes-sobre

> **Nota de conformidade:** a POC pode demonstrar funcionalidade e procedimentos realistas, mas não comprova homologação oficial, validação integral contra XSD ou recebimento pelo Governo. A aprovação do edital deve ser julgada pelo atendimento efetivo a cada exigência, inclusive quando houver necessidade futura de integração oficial.
