# Rosca de Participação — v1.0.0

Rosca com a participação de cada categoria (ex.: usina) no total, total no centro e legenda com valor e %.

## Montagem (cartão Marcas)
| Entrada | Campos |
|---|---|
| **Categoria** | NOME_USINA (opcional: ORDEM_COLUNA junto) |
| **Valor** | CANA |

Filtre a planilha na linha acumulada do dia (HORA = Total).
"TOTAL" e "ANT" são ignorados por padrão; o total do centro é a soma das usinas exibidas.

## Configurar
Título, subtítulo, nomes em "Título" (USINA DA PEDRA → Usina da Pedra), ordenação (maior primeiro), unidade,
decimais, texto do centro, espessura, % ao lado das fatias, legenda, paleta de cores e cor das categorias com valor 0.

## Teste local
1. Copie a pasta `vendor` de outra extensão para `RoscaParticipacao/vendor/`.
2. Dois cliques em `INICIAR-TESTE.bat` (porta **8774**).
3. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `RoscaParticipacao-LOCAL.trex`.
