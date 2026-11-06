import { createHmac, createHash } from "crypto";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromName?: string;
  fromEmail?: string; // Always @celeriflow.com.br
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
  const kDate = hmac(`AWS4${key}`, dateStamp);
  const kRegion = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  return hmac(kService, "aws4_request");
}

export function formatNotificationHtml(contentHtml: string, title?: string): string {
  const siteUrl = process.env.CELERIFLOW_PUBLIC_BASE_URL || "https://guarama.celeriflow.com.br";
  const cleanSiteUrl = siteUrl.replace(/\/$/, "");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "Notificação — CeleriFlow"}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Cabeçalho -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; text-align: left; border-bottom: 3px solid #10b981;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">CeleriFlow</span>
                    <span style="font-size: 13px; color: #94a3b8; margin-left: 8px;">| Gestão Pública Municipal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Conteúdo Principal -->
          <tr>
            <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Rodapé com links importantes -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 12px 0; font-weight: 600; color: #475569;">Links Importantes do Portal Oficial:</p>
              <p style="margin: 0 0 16px 0;">
                <a href="${cleanSiteUrl}/portal" style="color: #0e4c7e; text-decoration: none; margin: 0 8px; font-weight: 500;">Início</a> •
                <a href="${cleanSiteUrl}/portal/portaldatransparencia" style="color: #0e4c7e; text-decoration: none; margin: 0 8px; font-weight: 500;">Transparência</a> •
                <a href="${cleanSiteUrl}/portal/ouvidoria" style="color: #0e4c7e; text-decoration: none; margin: 0 8px; font-weight: 500;">Ouvidoria</a> •
                <a href="${cleanSiteUrl}/portal-servidor" style="color: #0e4c7e; text-decoration: none; margin: 0 8px; font-weight: 500;">Portal do Servidor</a> •
                <a href="${cleanSiteUrl}/validar-recibo" style="color: #0e4c7e; text-decoration: none; margin: 0 8px; font-weight: 500;">Autenticação</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Esta é uma mensagem automática enviada pelo sistema CeleriFlow. Por favor, não responda diretamente a este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildEmailSource(fromName?: string, fromEmail?: string): string {
  let user = "notificacoes";
  if (fromEmail) {
    const clean = fromEmail.trim().toLowerCase();
    if (clean.includes("@")) {
      const parts = clean.split("@");
      user = parts[0] || "notificacoes";
    } else {
      user = clean;
    }
  }

  // Always enforce @celeriflow.com.br domain
  const finalEmail = `${user}@celeriflow.com.br`;
  const name = (fromName || "CeleriFlow Notificações").replace(/[<>"]/g, "");
  return `"${name}" <${finalEmail}>`;
}

export async function sendEmailNotification(options: SendEmailOptions): Promise<SendEmailResult> {
  const accessKeyId = process.env.SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;
  const region = process.env.SES_REGION || "us-east-1";

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const validRecipients = recipients
    .map(r => r?.trim())
    .filter((r): r is string => Boolean(r && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)));

  if (validRecipients.length === 0) {
    return { success: false, error: "Nenhum endereço de destinatário válido informado." };
  }

  const source = buildEmailSource(options.fromName, options.fromEmail);
  const htmlBody = formatNotificationHtml(options.htmlContent, options.subject);
  const plainText = options.textContent || options.htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // If AWS SES credentials are not present, log warning and gracefully return without breaking the app flow
  if (!accessKeyId || !secretAccessKey) {
    console.warn(`[SES Notification] SES_ACCESS_KEY_ID ou SES_SECRET_ACCESS_KEY não configurados. Envio simulado para ${validRecipients.join(", ")}: "${options.subject}"`);
    return {
      success: true,
      messageId: `simulated-${Date.now()}`
    };
  }

  try {
    const host = `email.${region}.amazonaws.com`;
    const endpoint = `https://${host}/`;

    const params = new URLSearchParams({
      Action: "SendEmail",
      Version: "2010-12-01",
      Source: source,
      "Message.Subject.Data": options.subject,
      "Message.Subject.Charset": "UTF-8",
      "Message.Body.Html.Data": htmlBody,
      "Message.Body.Html.Charset": "UTF-8",
      "Message.Body.Text.Data": plainText,
      "Message.Body.Text.Charset": "UTF-8",
    });

    validRecipients.forEach((email, idx) => {
      params.append(`Destination.ToAddresses.member.${idx + 1}`, email);
    });

    const bodyString = params.toString();

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);

    const canonicalUri = "/";
    const canonicalQuerystring = "";
    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-date";
    const payloadHash = sha256(bodyString);

    const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const algorithm = "AWS4-HMAC-SHA256";
    const service = "ses";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256(canonicalRequest)}`;

    const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Host: host,
        "X-Amz-Date": amzDate,
        Authorization: authorizationHeader,
      },
      body: bodyString,
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("[SES Notification Error]", response.status, responseText);
      return { success: false, error: `Erro SES (${response.status}): ${responseText}` };
    }

    const messageIdMatch = responseText.match(/<MessageId>(.*?)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : undefined;

    return { success: true, messageId };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[SES Notification Exception]", errorMsg);
    return { success: false, error: errorMsg };
  }
}
