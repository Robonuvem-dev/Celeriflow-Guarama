# Modelos demonstrativos de Assistência Social — Ibema

Pesquisa realizada em 10/10/2026 para criar modelos locais demonstráveis enquanto os formulários municipais definitivos não são disponibilizados.

## Referências públicas consultadas

1. **Campina da Lagoa/PR — Formulário de encaminhamento CRAS**: identificação da pessoa, nascimento/RG/endereço, destino, objetivo, dificuldade identificada, observação e profissional responsável.
   - https://www.campinadalagoa.pr.gov.br/documentos/arquivos/FICHA%20ENCAMINHAMENTO%20CRAS.pdf
2. **Joinville/SC — anexos de requerimento de auxílio natalidade**: identificação do beneficiário/requerente, recém-nascido, observações, parecer, composição familiar, renda/habitação e assinaturas. Os anexos também contêm autorização bancária e termo de responsabilidade.
   - https://wwwold.joinville.sc.gov.br/public/portaladm/pdf/jornal/a14a373d1fc952c06d3eeeb2e9a022c8.pdf
3. **MDS — Manual de instruções do Prontuário SUAS, edição 2014**: identificação, ingresso, composição familiar, habitação, educação, trabalho/renda, saúde, benefícios, convivência, ofertas, violação de direitos, medidas socioeducativas, acolhimento, planejamento/evolução e encaminhamentos.
   - https://aplicacoes.mds.gov.br/sagi/dicivip_datain/ckfinder/userfiles/files/Manual_Prontuario_SUAS_VERSAO_PRELIMINAR.pdf

As fontes foram abertas e seu conteúdo extraído para conferir os campos. O manual é uma referência histórica de estrutura, não certificação de vigência de leiautes eletrônicos.

## Modelos locais POC-1.0 disponíveis

Em `/social/modelos` é possível preencher, visualizar e imprimir/salvar em PDF:

- Requerimento de benefício eventual.
- Parecer técnico de benefício eventual.
- Comprovante de entrega de benefício.
- Encaminhamento socioassistencial.
- Contrarreferência socioassistencial.
- Plano de Acompanhamento Familiar (PAF).
- Plano Individual de Atendimento (PIA).
- Comprovante de agendamento.
- Comprovante de inscrição em demanda reprimida.

O cabeçalho usa a instituição configurada no sistema. Os modelos foram adaptados à estrutura do checklist de Ibema; não reproduzem regras de pontuação, UPM, valores, legislação, assinaturas ou contatos de outras prefeituras. Contrarreferência, PIA, entrega, agendamento e fila são adaptações de estrutura, não transcrições de formulários daqueles municípios.

## Limites e substituição futura

- Os impressos trazem o identificador `POC-1.0` e a indicação de modelo demonstrativo sujeito à validação municipal.
- O preenchimento é temporário no navegador, sem gravar dados ou alterar operações. Aprovação, entrega e atendimento reais deverão produzir documentos a partir dos registros transacionais correspondentes.
- Ao receber modelo municipal definitivo, atualizar o catálogo `src/lib/social/document-templates.ts`, registrar nova versão e preservar a identificação das versões usadas por documentos persistidos no futuro.
- Exemplos de formulários impressos não definem leiautes oficiais de importação CadÚnico/BPC nem exportação RMA. Essas integrações permanecem pendentes de documento técnico e validação com a origem/destino.
