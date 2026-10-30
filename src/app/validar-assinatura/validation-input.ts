// URLs são apenas texto de entrada: nunca há navegação ou fetch para a URL informada.
export function validationCode(input: string): string {
  const value = input.trim();
  if (!value) return "";
  let code = value;
  if (/^https?:\/\//i.test(value) || value.startsWith("/")) {
    const url = new URL(value, "https://validation.invalid");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Informe um código ou uma URL de validação HTTP(S).");
    const query = url.searchParams.get("code");
    const match = url.pathname.match(/^\/validar-assinatura\/([^/]+)\/?$/);
    if (!query && !match) throw new Error("A URL deve conter /validar-assinatura/código ou o parâmetro code.");
    code = query ?? decodeURIComponent(match![1]);
  }
  // Não fixa formato CFS: o backend é a autoridade do código.
  if (!code || code.length > 256 || /[\s\u0000-\u001f\u007f/\\<>:?#]/.test(code)) throw new Error("Código de validação inválido. Confira o comprovante.");
  return code;
}
