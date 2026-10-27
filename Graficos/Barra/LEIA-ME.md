# Barras por Hora — v1.0.0

Gráfico de barras por hora (ex.: produção de cana), com horários futuros hachurados e "--".

## Montagem (cartão Marcas)
| Entrada | Campos |
|---|---|
| **Categoria** | ORDEM_LINHA + HORA (o numérico é a ordem; os dois "06" ficam separados) |
| **Valor** | CANA |

Filtre a planilha na linha de total das usinas (NOME_USINA = TOTAL).
As categorias "Ant" e "Total" são ignoradas por padrão (Configurar > Ignorar categorias).

## Horários futuros
Padrão: valores nulos ou zero **depois da última hora com produção** aparecem hachurados com "--".
Também dá para usar "somente nulos" ou não destacar.

## Configurar
Título, subtítulo, legenda, título do eixo Y, decimais, valores sobre as barras, grade, cores, largura das barras e fonte.

## Teste local
1. Copie a pasta `vendor` de outra extensão para `BarrasHora/vendor/`.
2. Dois cliques em `INICIAR-TESTE.bat` (porta **8773**).
3. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `BarrasHora-LOCAL.trex`.
