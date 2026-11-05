import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/platform/api-access";
import {
  acceptCredenciadoResponsibilityTerm,
  generateCardAdministratorDam,
  getDecredOverviewState,
  submitCardAdministratorDeclaration,
  upsertCardEquipment,
  type CardDeclarationType,
  type CardEquipmentRecord,
  type CardOperationNature,
} from "@/lib/tributacao/card-administrators-decred-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await authorizeApiRequest(request, { moduleCode: "TRIBUTACAO" });
  if (denied) return denied;
  return NextResponse.json({
    ok: true,
    module: "CF29 — Declaração das Informações das Administradoras de Cartões (DECRED)",
    ...getDecredOverviewState(),
  });
}

export async function POST(request: Request) {
  const denied = await authorizeApiRequest(request, { moduleCode: "TRIBUTACAO", mutate: true });
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "UPSERT_EQUIPMENT" | "ACCEPT_TERM" | "SUBMIT_DECLARATION" | "GENERATE_DAM";
      // Equipment fields (29.1)
      id?: string;
      terminalNumber?: string;
      serialNumber?: string;
      equipmentModel?: CardEquipmentRecord["equipmentModel"];
      ownershipType?: CardEquipmentRecord["ownershipType"];
      inscricaoMunicipal?: string;
      contribuinteCpfCnpj?: string;
      contribuinteNome?: string;
      administradoraNome?: string;
      administradoraCnpj?: string;
      status?: CardEquipmentRecord["status"];
      // Term fields (29.3)
      credenciadoLogin?: string;
      credenciadoNome?: string;
      credenciadoCpfCnpj?: string;
      accepted?: boolean;
      // Declaration fields (29.4)
      competencia?: string;
      tipoDeclaracao?: CardDeclarationType;
      responsavelNome?: string;
      responsavelCpf?: string;
      responsavelCargo?: string;
      responsavelEmail?: string;
      naturezaOperacao?: CardOperationNature;
      descricaoServicos?: string;
      valorTotalOperacoes?: number;
      valorPrestacaoServico?: number;
      // DAM fields (29.5)
      declarationId?: string;
    };

    switch (body.action) {
      case "ACCEPT_TERM": {
        const term = acceptCredenciadoResponsibilityTerm({
          credenciadoLogin: body.credenciadoLogin || "credenciado@operadora.com.br",
          credenciadoNome: body.credenciadoNome || "Responsável Credenciado",
          credenciadoCpfCnpj: body.credenciadoCpfCnpj || "01.027.058/0001-91",
          inscricaoMunicipal: body.inscricaoMunicipal || "IM-44510",
          accepted: Boolean(body.accepted),
        });
        return NextResponse.json({ ok: true, term, state: getDecredOverviewState() });
      }
      case "UPSERT_EQUIPMENT": {
        const equipment = upsertCardEquipment({
          id: body.id,
          terminalNumber: body.terminalNumber || "",
          serialNumber: body.serialNumber || "",
          equipmentModel: body.equipmentModel,
          ownershipType: body.ownershipType,
          inscricaoMunicipal: body.inscricaoMunicipal || "",
          contribuinteCpfCnpj: body.contribuinteCpfCnpj || "",
          contribuinteNome: body.contribuinteNome || "",
          administradoraNome: body.administradoraNome || "Cielo S.A.",
          administradoraCnpj: body.administradoraCnpj || "01.027.058/0001-91",
          status: body.status,
          requireAcceptedTerm: true,
        });
        return NextResponse.json({ ok: true, equipment, state: getDecredOverviewState() });
      }
      case "SUBMIT_DECLARATION": {
        const declaration = submitCardAdministratorDeclaration({
          competencia: body.competencia || "10/2026",
          tipoDeclaracao: body.tipoDeclaracao || "NORMAL_ORIGINAL",
          responsavelNome: body.responsavelNome || "Roberto Almeida",
          responsavelCpf: body.responsavelCpf || "284.910.448-12",
          responsavelCargo: body.responsavelCargo || "Gerente Fiscal",
          responsavelEmail: body.responsavelEmail || "fiscal@operadora.com.br",
          administradoraNome: body.administradoraNome || "Cielo S.A.",
          administradoraCnpj: body.administradoraCnpj || "01.027.058/0001-91",
          naturezaOperacao: body.naturezaOperacao || "CREDITO_A_VISTA",
          descricaoServicos:
            body.descricaoServicos ||
            "Administração e processamento de operações de cartões (Subitem 15.01 LC 116/2003)",
          terminalNumber: body.terminalNumber || "POS-98442",
          valorTotalOperacoes: Number(body.valorTotalOperacoes || 0),
          valorPrestacaoServico: Number(body.valorPrestacaoServico || 0),
        });
        return NextResponse.json({ ok: true, declaration, state: getDecredOverviewState() });
      }
      case "GENERATE_DAM": {
        if (!body.declarationId) {
          return NextResponse.json({ error: "Informe declarationId para gerar o DAM (29.5)." }, { status: 400 });
        }
        const dam = generateCardAdministratorDam(body.declarationId);
        return NextResponse.json({ ok: true, dam, state: getDecredOverviewState() });
      }
      default:
        return NextResponse.json({ error: "Ação DECRED não reconhecida." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar operação DECRED." },
      { status: 400 },
    );
  }
}

