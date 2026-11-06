# Motor de Notificações por E-mail (Amazon SES) — CeleriFlow

Este documento descreve a especificação e o padrão de uso do **Motor de Notificações por E-mail** do sistema CeleriFlow.

---

## 1. Visão Geral e Provedor

O envio de notificações transacionais e comunicados aos cidadãos, fornecedores e servidores utiliza o serviço **Amazon Simple Email Service (SES)** via chamadas HTTP nativas com autenticação **AWS Signature Version 4 (SigV4)**, eliminando dependências pesadas de bibliotecas externas e mantendo compatibilidade total com o runtime da aplicação.

### Variáveis de Ambiente Envolvidas
Configuradas no ambiente da aplicação:
- `SES_ACCESS_KEY_ID`: ID da chave de acesso IAM na AWS.
- `SES_SECRET_ACCESS_KEY`: Chave secreta de acesso IAM na AWS.
- `SES_REGION`: Região da AWS configurada no SES (padrão: `us-east-1` ou conforme configurado).
- `CELERIFLOW_PUBLIC_BASE_URL`: URL base pública do portal (ex: `https://guarama.celeriflow.com.br`).

> [!NOTE]
> Se as credenciais `SES_ACCESS_KEY_ID` ou `SES_SECRET_ACCESS_KEY` não estiverem presentes no ambiente local/teste, o motor opera em **modo de simulação graciosa**: loga um aviso no console e simula o envio com ID gerado, sem interromper ou gerar erros nas transações de negócio da aplicação.

---

## 2. Regra de Remetente (Identidade do Domínio)

O domínio `celeriflow.com.br` já possui identidade validada e configurada no Amazon SES.
- **Domínio Obrigatório:** O remetente SEMPRE utiliza o domínio `@celeriflow.com.br`.
- **Nome de Usuário Dinâmico:** O usuário do e-mail pode ser customizado para cada módulo/departamento responsável (ex: `rh@celeriflow.com.br`, `ouvidoria@celeriflow.com.br`, `tributario@celeriflow.com.br`, `compras@celeriflow.com.br`, `seguranca@celeriflow.com.br`).
- A função auxiliar `buildEmailSource(fromName, fromEmail)` garante automaticamente que qualquer endereço fornecido tenha o sufixo `@celeriflow.com.br`.

---

## 3. Padrão Visual HTML

Todos os e-mails enviados pelo motor são envolvidos por um template HTML responsivo, limpo e com identidade institucional:
1. **Cabeçalho:** Banner superior escuro com o nome do sistema (`CeleriFlow | Gestão Pública Municipal`) e filete verde esmeralda institucional.
2. **Corpo Principal:** Conteúdo HTML com tipografia legível, botões de ação estilizados e links diretos para o portal.
3. **Rodapé Oficial:** Contém links diretos do município:
   - Início (`/portal`)
   - Portal da Transparência (`/portal/portaldatransparencia`)
   - Ouvidoria Pública (`/portal/ouvidoria`)
   - Portal do Servidor (`/portal-servidor`)
   - Validador de Recibos/Autenticação (`/validar-recibo`)
   - Nota legal informando que a mensagem é automática.

---

## 4. Como Utilizar o Motor em Novo Código

### Arquivo Central:
`src/lib/notifications/ses-email-engine.ts`

```typescript
import { sendEmailNotification } from "@/lib/notifications/ses-email-engine";

await sendEmailNotification({
  to: "cidadao@exemplo.com.br",
  subject: "Assunto do E-mail",
  htmlContent: `
    <h2>Título da Notificação</h2>
    <p>Olá, Fulano. Sua solicitação foi atendida com sucesso.</p>
    <a href="https://guarama.celeriflow.com.br/portal">Acessar Portal</a>
  `,
  fromName: "Ouvidoria Municipal",
  fromEmail: "ouvidoria@celeriflow.com.br", // Será sempre @celeriflow.com.br
});
```

### Dispatcher Padronizado:
`src/lib/notifications/notification-dispatcher.ts`

Para manter a consistência dos textos, assuntos e parâmetros exigidos pelos requisitos funcionais do sistema, utilize preferencialmente o `NotificationDispatcher`:

```typescript
import { NotificationDispatcher } from "@/lib/notifications/notification-dispatcher";

// Exemplo: Notificar cidadão de manifestação registrada
await NotificationDispatcher.sendOuvidoriaManifestacaoRegistrada({
  to: "cidadao@email.com",
  nome: "João da Silva",
  protocolo: "2026-ABC123XYZ",
  link: "https://guarama.celeriflow.com.br/portal/ouvidoria?protocolo=2026-ABC123XYZ",
});
```

---

## 5. Mapeamento dos 22 Pontos de Notificação Implementados

| Módulo | Requisito | Classificação | Origem / Momento do Envio | Assunto | Método do Dispatcher |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CF07 — Portal do Servidor** | **7.1** | Envio explícito | Imediatamente após a solicitação de troca de senha e validação dos dados funcionais. | Redefinição de senha — Portal do Servidor | `sendPortalServidorPasswordReset` |
| **CF07 — Portal do Servidor** | **7.9** | Envio explícito | Após a solicitação de cadastro de login e validação dos dados e documentos (link válido por 24h). | Criação de acesso — Portal do Servidor | `sendPortalServidorAccountCreated` |
| **CF28 — Declaração Bancária** | **28.39** | Envio explícito | Após o cadastro de novo usuário do órgão municipal na gestão de usuários. | Seu acesso ao sistema foi criado | `sendBancosUserCreated` |
| **CF28 — Declaração Bancária** | **28.41** | Envio explícito | Após a criação do novo usuário com dados e vínculo funcional. | Dados de acesso ao sistema | `sendBancosUserCreated` |
| **CF28 — Declaração Bancária** | **28.78** | Envio explícito | Imediatamente após a solicitação de recuperação de senha da conta do órgão/banco. | Recuperação de senha | `sendBancosPasswordReset` |
| **CF04 — Ouvidoria Pública** | **4.9** | Envio sugerido | Após o cidadão registrar manifestação identificada no portal da ouvidoria. | Manifestação recebida — Protocolo {protocolo} | `sendOuvidoriaManifestacaoRegistrada` |
| **CF04 — Ouvidoria Pública** | **4.11** | Envio sugerido | Após a tramitação da manifestação para outro operador ou setor responsável. | Atualização da manifestação {protocolo} | `sendOuvidoriaManifestacaoEncaminhada` |
| **CF04 — Ouvidoria Pública** | **4.18** | Envio sugerido | Quando a manifestação assumir nova situação disponível ao cidadão (inclusive encerramento/cancelamento). | Atualização do protocolo {protocolo} | `sendOuvidoriaSituacaoAlterada` |
| **CF04 — Ouvidoria Pública** | **4.19** | Envio sugerido | Após a criação do cadastro do cidadão via internet com e-mail confirmado. | Cadastro realizado com sucesso | `sendOuvidoriaCadastroRealizado` |
| **CF07 — Portal do Servidor** | **7.2** | Envio sugerido | Após o bloqueio de 15 minutos decorrente de 5 tentativas consecutivas de login incorreto. | Alerta de segurança — Acesso bloqueado | `sendPortalServidorAccountLocked` |
| **CF11 — Licitação** | **11.28** | Envio sugerido | Quando o primeiro colocado desistir de item em processo ou na convocação do segundo colocado. | Convocação — Processo {processo} | `sendLicitacaoConvocacaoSegundoColocado` |
| **CF11 — Licitação** | **11.111** | Envio sugerido | Quando o primeiro colocado deixar de atender aos itens e houver convocação de fornecedor. | Convocação de fornecedor — Processo {processo} | `sendLicitacaoConvocacaoFornecedor` |
| **CF11 — Licitação** | **11.182** | Envio sugerido | Quando o usuário selecionar os fornecedores destinatários e acionar o envio do mapa de cotação. | Solicitação de cotação — Processo {processo} | `sendLicitacaoMapaCotacao` |
| **CF11 — Licitação** | **11.183** | Envio sugerido | Após a emissão e disparo de carta-convite para fornecedores selecionados no procedimento. | Convite para participação — Processo {processo} | `sendLicitacaoCartaConvite` |
| **CF13 — Patrimônio Público** | **13.36** | Envio sugerido | Quando o bem atingir a antecedência configurada para alerta de garantia próxima do vencimento. | Alerta de vencimento de garantia — Bem {patrimonio} | `sendPatrimonioGarantiaVencimento` |
| **CF27 — Gestão Simples Nac.** | **27.62** | Envio sugerido | Após o registro de notificação tributária no Domicílio Tributário Eletrônico (DTE). | Nova notificação tributária disponível | `sendSimplesNotificacaoTributaria` |
| **CF27 — Gestão Simples Nac.** | **27.63** | Envio sugerido | Após a disponibilização de novo aviso no Domicílio Tributário Eletrônico (DTE). | Novo aviso tributário | `sendSimplesAvisoTributario` |
| **CF27 — Gestão Simples Nac.** | **27.74** | DTE-SN complementar | Aviso de cobrança após a preparação de débitos para comunicação pelo DTE-SN. | Aviso de cobrança disponível | `sendSimplesAvisoCobranca` |
| **CF27 — Gestão Simples Nac.** | **27.86** | DTE-SN complementar | Comunicação de prazo de entrega de declaração (DEFIS ou DASNSIMEI) pelo DTE-SN. | Prazo para entrega de declaração | `sendSimplesPrazoEntregaDeclaracao` |
| **CF27 — Gestão Simples Nac.** | **27.90** | DTE-SN complementar | Notificação prévia de divergência, alíquotas ou autorregularização de informações fiscais. | Notificação prévia — Regularização tributária | `sendSimplesNotificacaoPrevia` |
| **CF27 — Gestão Simples Nac.** | **27.100** | DTE-SN complementar | Comunicação de decisão em processo administrativo fiscal pelo DTE-SN. | Decisão em processo administrativo | `sendSimplesDecisaoProcesso` |
| **CF27 — Gestão Simples Nac.** | **27.149** | DTE-SN complementar | Notificação ou intimação fiscal preparada para comunicação no DTE-SN. | Comunicação fiscal disponível | `sendSimplesComunicacaoFiscal` |
