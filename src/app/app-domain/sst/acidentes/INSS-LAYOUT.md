# Proveniência da impressão CAT

O endpoint `/sst/acidentes/[id]/imprimir/inss` preenche o **PDF original** disponibilizado pelo INSS, sem reconstruir aproximadamente a grade.

- Índice oficial: https://www.gov.br/inss/pt-br/centrais-de-conteudo/formularios/formularios
- Arquivo encontrado no índice: https://www.gov.br/inss/pt-br/centrais-de-conteudo/formularios/copy_of_CAT.pdf
- Conferência: 11/10/2026, HTTP 200, 1 página A4, 64 campos AcroForm.
- SHA-256: `461c38c63fcb2286e9f092468b2a914417ae62aed47cfe71b5f6899a0367dd43`.
- Versão da implementação: `INSS-copy_of_CAT-461c38c6-v1`.
- `accident-layout-policy.ts` contém o inventário exato de nomes de campos, grupos, tipos e validações; o teste compara esse inventário ao PDF baixado da fonte oficial.

Cada revisão de `SstCatLayoutVersion` preserva fonte/hash, dados administrativos, identidade canônica, autor e hash da solicitação. `SstCatLayoutMedical` mantém os dados médicos separados, vinculados a atendimento da mesma CAT, com autorização ocupacional de Medicina. As duas tabelas são imutáveis.

Minutas podem conter campos não apurados em branco. O modo completo exige preenchimento dos campos obrigatórios e atendimento médico. Ambos preservam os campos de assinatura em branco: não há assinatura criada pelo software. Textos que excedem os campos estreitos do original recebem marcador `(*)` e complemento com o conteúdo integral.

O PDF é marcado **MINUTA FORMATADA INSS — NÃO REGISTRADA / NÃO TRANSMITIDA** enquanto não existir evidência eSocial `ACCEPTED` em `PRODUCTION`, na mesma UG/CAT e com `sourceSnapshot.catLayout.layout.requestHash` igual ao da revisão impressa. Só essa evidência pode preencher número/recibo e data de cadastro. `originalReceipt` é apenas referência declarada de uma CAT anterior e nunca é usado como número de registro da CAT atual.

Integração da frente eSocial: incluir o retorno de `readCatLayoutForEsocial(context, catId)` em `sourceSnapshot.catLayout`. Gerar/preencher PDF não é transmitir o evento. A fonte oficial é baixada com timeout e hash fixado; indisponibilidade ou mudança de bytes bloqueia a emissão para revisão da fonte. Nenhum documento de outra origem é apresentado como formulário oficial.
