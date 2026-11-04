# Base atuarial interna de RH — modelo colunar

Modalidade: **RH → Relatórios → Base atuarial colunar**, código estável **125**.

A referência é uma data civil. A emissão lê a revisão contratual e a fotografia cadastral observada até essa data. Competências anteriores à abertura do histórico pessoal podem não ter fotografia disponível; o arquivo informa essa ausência. As bases contributivas provêm do último demonstrativo mensal oficial fechado até a referência. A competência e o identificador dessa fonte acompanham a linha.

## Tipos de registro

- `SERVIDOR`: uma linha por vínculo selecionado. Contém identificação funcional, enquadramento, remuneração/benefício e dados contributivos.
- `DEPENDENTE`: uma linha por relação de dependência do vínculo, a partir da mesma fotografia pessoal. Os campos monetários ficam vazios. As chaves do titular e do contrato permitem relacioná-la à linha principal.
- `TOTAL_CATEGORIA_SISTEMA`: total por categoria, sistema previdenciário e competência contributiva. Informa vínculos, titulares distintos, relações de dependência e lacunas de cobertura. Não é uma pessoa nem um vínculo adicional.

Uma pessoa pode ter vários vínculos. A contagem de pessoas usa `Servidor ID` distinto; a contagem de vínculos usa `Contrato ID` distinto. Dependentes podem aparecer associados a mais de um vínculo do mesmo titular; a contagem de pessoas dependentes deve usar `Pessoa dependente ID` distinto, sem somar novamente os valores do titular.

## Dicionário

| Coluna | Conteúdo / fonte |
| --- | --- |
| Tipo de registro | `SERVIDOR`, `DEPENDENTE` ou `TOTAL_CATEGORIA_SISTEMA`. |
| Referência | Data-base civil da extração. |
| Servidor ID | Identidade funcional canônica do titular. |
| Contrato ID | Chave do vínculo. |
| Matrícula | Matrícula da revisão contratual na referência. |
| Categoria | Enquadramento temporal cadastrado; na ausência, vínculo ativo. |
| Nome, CPF, nascimento, sexo e estado civil | Fotografia da pessoa central do titular/dependente; ausência não é preenchida com dado atual presumido. |
| Admissão | Admissão preservada na revisão contratual. |
| Regime | Regime de emprego do vínculo na referência. |
| Sistema previdenciário | Sistema associado ao regime de emprego. |
| Cargo ID | Cargo da revisão contratual na referência. |
| Lotação ID | Lotação da revisão contratual na referência. |
| Salário / benefício BRL | Salário contratual ou valor do enquadramento de beneficiário vigente. |
| Competência contributiva | Competência do demonstrativo-fonte. |
| Base contributiva BRL | Base pessoal após opção individual, quando preservada; senão, base RGPS/RPPS do esquema do demonstrativo-fonte. Vazio quando indisponível. |
| Contribuição pessoal BRL | Soma dos itens previdenciários pessoais do demonstrativo-fonte. |
| Contribuição patronal previdenciária BRL | Previdência patronal e contribuição atuarial discriminadas no demonstrativo. Na fonte anterior à discriminação, subtrai FGTS/PIS/PASEP identificados do total patronal. |
| Dependente ID | Chave da relação de dependência. |
| Pessoa dependente ID | Chave da pessoa central dependente. |
| Parentesco | Parentesco da relação fotografada. |
| Observação cadastral | Data da fotografia pessoal utilizada ou informação de ausência. |
| Demonstrativo-fonte | Identificador do demonstrativo mensal ou informação de ausência. |
| Ingresso contributivo / serviço público / carreira | Datas documentadas no registro temporal `DADOS_ATUARIAIS`; ausência fica vazia e não é substituída pela admissão municipal. |
| Invalidez reconhecida | Declaração comprovada do titular ou dependente; ausência não equivale a `NAO`. Não contém diagnóstico, CID ou prontuário. |
| Início / espécie do benefício | Concessão documentada na informação complementar do vínculo. |
| Pessoa instituidora ID / ato de concessão | Identidade central do instituidor, quando aplicável, e referência do ato. |
| Elegível à pensão / fim da elegibilidade | Condição documentada no registro `DEPENDENTE_ATUARIAL` do dependente do titular. |
| Comprovação / fundamento | Documento e fundamento do registro complementar, ou indicação expressa de ausência. |
| Registro complementar ID | Identificador do registro temporal que forneceu os campos complementares. |

## Formatos e conciliação

PDF, XLSX, CSV e TXT usam a mesma consulta integral e os mesmos critérios da prévia. O TXT interno é UTF-8, delimitado por ponto e vírgula e com escape de aspas, conforme o renderizador compartilhado de relatórios.

Para recalcular os totais financeiros, considerar apenas `SERVIDOR` e separar competências contributivas diferentes; não somar de novo as linhas totalizadoras emitidas. Campos de total têm interpretação de soma dos valores disponíveis, acompanhada da quantidade de vínculos sem fotografia/fonte. A ausência de base, fotografia ou demonstrativo é uma pendência de cobertura, não evidência de valor zero. A base interna não substitui os adaptadores dos prestadores atuariais: estes dependem dos respectivos campos, versões e manuais da etapa 5.

Implementação de origem: `src/lib/rh/actuarial-report.ts`. Documentação de código; validação funcional e reconciliação ainda seguem a sequência acordada para o final das quatro etapas.
