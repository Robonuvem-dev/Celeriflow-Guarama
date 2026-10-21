# Fontes dos catálogos de Frota

`ctb-mbft.json` é gerado por `npm run frotas:ctb:fetch` a partir dos sete arquivos do MBFT publicados pelo Contran/Senatran e das alterações conferidas em `ctb-alteracoes-conferidas.json`. A edição de 13/10/2026 contém 416 enquadramentos, incluindo históricos. Cada ficha mantém arquivo, URL e hash de origem. Não contém infrações fictícias.

`fipe-carros.json` é gerado por `npm run frotas:fipe:fetch`. Ele consulta a lista de marcas e o catálogo de cada marca na fonte FIPE configurada, gerando uma versão integral de modelos de carros. O arquivo registra a competência, hashes e URL de cada resposta para importação administrativa versionada no módulo de Frotas.

Os cadastros e movimentos gerados por `seed:frotas:poc` são fictícios plausíveis, identificados nas observações como base de demonstração. Não constituem patrimônio, contratos, multas ou atos legais reais.
