import { operationalModules as registry } from "./cadastros-administracao";
import { operationalModules as planning } from "./compartilhados";
import { operationalModules as procurement } from "./compras";
import { operationalModules as documents } from "./documentos-configuracoes";
import { operationalModules as specialized } from "./especializados";
import { operationalModules as finance } from "./financeiro-controle";
import { operationalModules as assets } from "./patrimonio-obras";
import { operationalModules as personnel } from "./rh-sst";
import { operationalModules as environment } from "./saneamento-ambiente";
import { operationalModules as health } from "./saude-servidor";
import { operationalModules as social } from "./social-educacao-publico";
import { operationalModules as taxes } from "./tributacao";

export const operationalModules = [
  ...registry, ...planning, ...procurement, ...documents, ...specialized,
  ...finance, ...assets, ...personnel, ...environment, ...health, ...social, ...taxes,
];
