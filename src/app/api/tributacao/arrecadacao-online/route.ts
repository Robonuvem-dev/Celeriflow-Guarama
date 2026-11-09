import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/platform/api-access";
import { loadFebrabanStateFromDb } from "@/lib/platform/tributacao-infra-persistence";
import {
  cancelamentoOp,
  confirmacaoOp,
  consultarDebitoDividaAtivaOp,
  consultarDebitoIPTUOp,
  consultarDebitoISSOp,
  consultarDebitoParcelamentoOp,
  getFebrabanArrecadacaoState,
  getFebrabanWsdlDescriptor,
  type FebrabanOperationName,
} from "@/lib/tributacao/febraban-arrecadacao-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("wsdl") || searchParams.get("format") === "wsdl") {
    return new NextResponse(getFebrabanWsdlDescriptor(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const denied = await authorizeApiRequest(request, { moduleCode: "TRIBUTACAO", tokenEnv: "FEBRABAN_WS_TOKEN" });
  if (denied) return denied;
  const state = await loadFebrabanStateFromDb();
  return NextResponse.json({
    ok: true,
    module: "CF26 — Arrecadação Online Service (Padrão FEBRABAN)",
    ...state,
  });
}

export async function POST(request: Request) {
  const denied = await authorizeApiRequest(request, { moduleCode: "TRIBUTACAO", mutate: true, tokenEnv: "FEBRABAN_WS_TOKEN" });
  if (denied) return denied;
  await loadFebrabanStateFromDb();
  try {
    const contentType = request.headers.get("content-type") || "";

    // Suporte tanto a chamadas SOAP XML quanto JSON REST (26.1 a 26.7)
    if (contentType.includes("xml")) {
      const xml = await request.text();
      if (xml.includes("consultarDebitoIPTUOp")) {
        const result = consultarDebitoIPTUOp({});
        return new NextResponse(result.soapEnvelopeResponse, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
      if (xml.includes("consultarDebitoISSOp")) {
        const result = consultarDebitoISSOp({});
        return new NextResponse(result.soapEnvelopeResponse, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
      if (xml.includes("consultarDebitoDividaAtivaOp")) {
        const result = consultarDebitoDividaAtivaOp({});
        return new NextResponse(result.soapEnvelopeResponse, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
      if (xml.includes("consultarDebitoParcelamentoOp")) {
        const result = consultarDebitoParcelamentoOp({});
        return new NextResponse(result.soapEnvelopeResponse, {
          status: 200,
          headers: { "Content-Type": "text/xml; charset=utf-8" },
        });
      }
    }

    const body = (await request.json().catch(() => ({}))) as {
      operation?: FebrabanOperationName;
      inscricaoImobiliaria?: string;
      inscricaoMunicipal?: string;
      cpfCnpj?: string;
      exercicio?: number;
      competencia?: string;
      numeroCda?: string;
      numeroAcordoParcelamento?: string;
      nossoNumeroGuia?: string;
      codigoBarras44?: string;
      valorPago?: number;
      codigoBanco?: string;
      nsuTransacaoBancaria?: string;
      codigoAutenticacaoFebraban?: string;
      motivoCancelamento?: string;
    };

    switch (body.operation) {
      case "consultarDebitoIPTUOp":
        return NextResponse.json({
          ok: true,
          ...consultarDebitoIPTUOp(body),
          state: getFebrabanArrecadacaoState(),
        });
      case "consultarDebitoISSOp":
        return NextResponse.json({
          ok: true,
          ...consultarDebitoISSOp(body),
          state: getFebrabanArrecadacaoState(),
        });
      case "consultarDebitoDividaAtivaOp":
        return NextResponse.json({
          ok: true,
          ...consultarDebitoDividaAtivaOp(body),
          state: getFebrabanArrecadacaoState(),
        });
      case "consultarDebitoParcelamentoOp":
        return NextResponse.json({
          ok: true,
          ...consultarDebitoParcelamentoOp(body),
          state: getFebrabanArrecadacaoState(),
        });
      case "confirmacaoOp":
        if (!body.nossoNumeroGuia) {
          return NextResponse.json({ error: "Informe nossoNumeroGuia para confirmacaoOp." }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          ...confirmacaoOp({
            nossoNumeroGuia: body.nossoNumeroGuia,
            codigoBarras44: body.codigoBarras44,
            valorPago: body.valorPago,
            codigoBanco: body.codigoBanco,
            nsuTransacaoBancaria: body.nsuTransacaoBancaria,
          }),
          state: getFebrabanArrecadacaoState(),
        });
      case "cancelamentoOp":
        if (!body.nossoNumeroGuia) {
          return NextResponse.json({ error: "Informe nossoNumeroGuia para cancelamentoOp." }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          ...cancelamentoOp({
            nossoNumeroGuia: body.nossoNumeroGuia,
            codigoAutenticacaoFebraban: body.codigoAutenticacaoFebraban,
            nsuTransacaoBancaria: body.nsuTransacaoBancaria,
            motivoCancelamento: body.motivoCancelamento,
            codigoBanco: body.codigoBanco,
          }),
          state: getFebrabanArrecadacaoState(),
        });
      default:
        return NextResponse.json(
          { error: `Operação FEBRABAN '${String(body.operation)}' não reconhecida.` },
          { status: 400 },
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha na operação FEBRABAN." },
      { status: 400 },
    );
  }
}

