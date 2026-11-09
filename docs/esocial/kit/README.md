# Kit CeleriFlow eSocial — Aurora das Veredas / MG — POC

Use **`CeleriFlow_eSocial_POC_Codex.md`** como especificação principal para o Codex. As ações do comando de recebimento simulado estão detalhadas na seção **8-A**.

**Município de demonstração**: Aurora das Veredas/MG. Caso exista um tenant DEMO antigo da mesma base com nome `vereda-das-auroras`, reutilize com alias; não crie segundo município, nem altere cadastro real.

**Conteúdo:** XML e JSON sintéticos de lotes, eventos de envio, retornos, seis modelos individuais de totalizadores, cenários alternativos, dados do município, 13º e importação de concorrente. A pasta `fixtures/retornos-por-comando` acrescenta os retornos agrupados exatamente como devem ser recebidos após o comando na UI.

**Segurança:** ZERO conexões governamentais; `source=SIMULATED`, `mode=DEMO`; protocolos/recibos com `DEMO-`. O valor `tpAmb=2` nos exemplos indica apenas a aparência da Produção Restrita em dados fictícios, não uma consulta de verdade. XMLs são **exemplos didáticos em namespaces privados**, não conformes aos XSD oficiais e não assinados pelo governo. Certificados/CPF/CNPJ são fictícios.

**Como demonstrar:** abrir RH/Folha > eSocial > Retornos, competência 10/2026, clicar em `Simular recebimento do eSocial`, observar 101 pendente, 201 processado, retornar os 9 registros de totalizadores em 6 tipos, conferir recibos de origem e conciliação. Usar `Consultar retorno (próxima etapa)` para detalhar as transições. O backend persiste cada etapa; não é tela estática.
