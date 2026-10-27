# Card Grade — v1.0.0

Grade de cards de indicadores (1 planilha, 1 consulta): ícone, título, valor, variação e detalhe.

## Montagem (cartão Marcas) — 4 entradas
| Entrada | Campo | Obs. |
|---|---|---|
| **Título** | ORDEM + INDICADOR | 1 card por indicador; o campo numérico define a ordem (opcional) |
| **Valor** | VALOR | Numérico (formatado pela extensão) ou texto (ex.: "2 de 4", exibido como veio) |
| **Variação** | VARIACAO | Opcional, numérico. Seta verde para cima / vermelha para baixo |
| **Detalhe** | DETALHE | Opcional, texto da última linha. Vazio = detalhe padrão do Configurar |

A base deve ter **1 linha por indicador** (formato "longo": INDICADOR | VALOR | VARIACAO | DETALHE).

## Por card (Configurar)
Ícone (Cana, Folha, Frasco, Fábrica, Gota, Energia, Caminhão, Gráfico), sufixo (t, %, ...), decimais,
tipo de variação (% / p.p. / absoluta / sem) e decimais da variação.
Sugestões automáticas pelo nome: CANA → t e %, FIBRA → % e p.p., ATR → absoluta, USINA → sem variação.

## Pasta vendor
Copie `vendor/tableau.extensions.js` de outra extensão para `CardGrade/vendor/`.

## Teste local
1. Dois cliques em `INICIAR-TESTE.bat` (porta **8772**).
2. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `CardGrade-LOCAL.trex`.
