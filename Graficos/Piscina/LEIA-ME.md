# Piscina Grade — v4.1.0

Uma única Viz Extension com **um cartão por reservatório** (1 planilha, 1 consulta).

## Novidades da 4.1.0
- **Cabeçalho padronizado** com a Vazão Grade e a Motor Grade: ícone de represa, título
  "NÍVEL DE REPRESA" e subtítulo "Percentual do nível atual em relação à capacidade útil" (editáveis; cabeçalho pode ser ocultado).
- Opção **"Percentual na cor da faixa 1"** (padrão ligado): na faixa BAIXO o percentual fica vermelho, nas demais azul — como no mockup.
- Selo de status mais compacto e título reduzindo até 9 px, para os nomes caberem.
- Fundo padrão branco (igual às outras extensões); configurável.
- Onda pausa com a aba oculta ou com Configurar aberto.
- Configurações salvas na v4.0 continuam valendo.

## Entradas (cartão Marcas)
| Entrada | Campo |
|---|---|
| **Título** | Dimensão do reservatório (1 cartão por valor) — obrigatório |
| **Valor** | Percentual (0–100) |
| **Nome** | Opcional: volume em m³ → `Volume atual: 30.123 m³` |
| **Limite faixa 1** | Opcional: limite da 1ª faixa por reservatório |

## Pasta vendor
Este pacote **não** traz `vendor/tableau.extensions.js`. Copie a pasta `vendor` da versão anterior para dentro de `PiscinaGrade`.

## Teste local
1. Dois cliques em `INICIAR-TESTE.bat` (porta **8768**).
2. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `PiscinaGrade-LOCAL.trex`.
