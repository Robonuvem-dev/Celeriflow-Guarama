import Link from "next/link";
import { db } from "@/db/client";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";

export async function CitizenServiceInformation() {
  const { citizenService: service } = await getTransparencySettings(db);
  const infoRows = [
    ["Unidade responsável", service.unit],
    ["Endereço", service.address],
    ["Telefone institucional", service.phone],
    ["E-mail institucional", service.email],
    ["Horário", service.openingHours],
    [
      "Responsável pelo e-SIC",
      service.responsibleName
        ? `${service.responsibleName}${service.responsibleRole ? ` (${service.responsibleRole})` : ""}`
        : service.responsibleAuthority,
    ],
    [
      "Contato direto e-SIC",
      service.responsibleEmail || service.responsiblePhone
        ? `${service.responsibleEmail}${service.responsiblePhone ? ` · ${service.responsiblePhone}` : ""}`
        : null,
    ],
    ["Autoridade recursal", service.appealAuthority],
  ].filter(([, val]) => val !== null && val !== undefined);

  return (
    <section className="space-y-2 rounded border bg-white p-4 text-sm">
      <h2 className="font-bold">Serviço de Informação ao Cidadão e Ouvidoria</h2>
      <dl>
        {infoRows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-semibold">{label}:</dt>
            <dd>{value || "Não informado na configuração do serviço"}</dd>
          </div>
        ))}
      </dl>
      <p>
        e-SIC: resposta em até 20 dias, prorrogável uma vez por 10 dias com justificativa.
        Recurso em até 10 dias da resposta, com decisão em 5 dias por instância.
        Manifestações: resposta em até 30 dias, prorrogável uma vez por 30 dias, conforme Lei 13.460/2017.
      </p>
      {service.localLaiNormUrl && (
        <a className="underline" href={service.localLaiNormUrl}>
          Norma local de regulamentação da LAI ↗
        </a>
      )}
      <nav className="flex flex-wrap gap-4">
        <Link className="underline" href="/portal/portaldatransparencia/estatisticas">
          Relatório anual e satisfação
        </Link>
        <Link className="underline" href="/portal/portaldatransparencia?view=publicacoes&source=DOCUMENTOS&search=sigilo">
          Informações classificadas/desclassificadas
        </Link>
      </nav>
    </section>
  );
}
