# Tabela Consolidada — v1.1.0

Tabela cruzada **Linhas × Colunas × várias Medidas**. Totais vêm da base e só são destacados em verde.

## Montagem (cartão Marcas)
| Entrada | Campos |
|---|---|
| **Linha** | ORDEM_LINHA + HORA (qualquer ordem: o campo numérico é a ordem, o texto é o rótulo) |
| **Coluna** | ORDEM_COLUNA + NOME_USINA |
| **Medidas** | CANA, FIBRA, ATR (a ordem das pílulas = ordem das colunas) |

ORDEM_LINHA precisa estar na entrada Linha: é ela que mantém os dois "06" separados
(no Tableau, sem ela as duas horas "06" são somadas antes de chegar à extensão).

## Totais (padrão: da base, sem cálculo)
- **Coluna de total:** a última coluna dos dados (ex.: TOTAL em NOME_USINA, com a maior ORDEM_COLUNA) vira o grupo de total, com as 3 colunas em verde.
- **Linha de total:** a linha da base com HORA = "Total" vai para o fim e fica em verde.
- No Configurar dá para trocar para "Coluna com o rótulo", "Calcular pela extensão" ou "Sem total".

## Pasta vendor
Copie `vendor/tableau.extensions.js` de outra extensão para `TabelaGrade/vendor/`.

## Teste local
1. Dois cliques em `INICIAR-TESTE.bat` (porta **8771**).
2. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `TabelaGrade-LOCAL.trex`.
