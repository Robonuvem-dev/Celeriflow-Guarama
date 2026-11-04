import { NextResponse } from "next/server";
import {
  DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC,
  getDecredOverviewState,
  receiveCardDeclarationViaWebService,
  type AuthorizedOperationDetail,
  type CardDeclarationType,
  type CardOperationNature,
} from "@/lib/tributacao/card-administrators-decred-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    requirement: "29.7 — Módulo de Recepção das Declarações da Administradora de Cartões via Web Service",
    standardLayoutSpec: DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      competencia?: string;
      tipoDeclaracao?: CardDeclarationType;
      administradoraNome?: string;
      administradoraCnpj?: string;
      responsavel?: {
        nome: string;
        cpf: string;
        cargo?: string;
        email: string;
      };
      naturezaOperacao?: CardOperationNature;
      descricaoServicos?: string;
      operacoesAutorizadas?: AuthorizedOperationDetail[];
    };

    const result = receiveCardDeclarationViaWebService({
      competencia: body.competencia || "10/2026",
      tipoDeclaracao: body.tipoDeclaracao || "NORMAL_ORIGINAL",
      administradoraNome: body.administradoraNome || "Stone Instituição de Pagamento S.A.",
      administradoraCnpj: body.administradoraCnpj || "16.501.555/0001-57",
      responsavel: body.responsavel ?? {
        nome: "Mariana Ferreira",
        cpf: "412.889.301-44",
        cargo: "Especialista de Integração Fiscal WebService",
        email: "webservice.fiscal@stone.com.br",
      },
      naturezaOperacao: body.naturezaOperacao || "CREDITO_A_VISTA",
      descricaoServicos:
        body.descricaoServicos ||
        "Recepção automatizada via Web Service Layout Padrão DECRED (Requisito 29.7) — Operações autorizadas pela administradora",
      operacoesAutorizadas:
        body.operacoesAutorizadas && body.operacoesAutorizadas.length > 0
          ? body.operacoesAutorizadas
          : [
              {
                authorizationCode: `AUTH-WS-${Date.now().toString().slice(-5)}`,
                nsuHost: `NSU-WS-${Date.now().toString().slice(-5)}`,
                transactionDateTime: new Date().toISOString(),
                terminalNumber: "POS-98442",
                estabelecimentoCpfCnpj: "14.582.900/0001-42",
                estabelecimentoInscricaoMunicipal: "IM-44510",
                naturezaOperacao: body.naturezaOperacao || "CREDITO_A_VISTA",
                installments: 1,
                grossTransactionAmount: 64000.0,
                serviceFeeAmount: 1600.0,
              },
            ],
    });

    return NextResponse.json({
      ok: true,
      ...result,
      state: getDecredOverviewState(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha na recepção via Web Service DECRED." },
      { status: 400 },
    );
  }
}

