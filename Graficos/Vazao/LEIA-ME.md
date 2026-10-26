# Vazão Grade — v2.1.0

Uma única Viz Extension com **um cartão de tubo animado por ponto de medição** (1 planilha, 1 consulta).

## Entradas (cartão Marcas)
| Entrada | Campo |
|---|---|
| **Título** | Dimensão do ponto de medição (1 cartão por valor) — obrigatório |
| **Valor** | Vazão (exibida como está, unidade padrão m³/h) |
| **Referência** | Opcional: vazão de 100% do ponto; sem ela, usa a referência padrão |
| **Nome** | Opcional: linha auxiliar abaixo do valor |

## Novidades da 2.1.0
- Ícone do cabeçalho trocado pelo medidor de vazão (manômetro sobre tubo). Cor do contorno configurável.
- Bolhas com o efeito da v1.4: acompanham as setas e 3 grupos oscilam na vertical, desencontrados.
  A amplitude e o ritmo crescem com a vazão; a partir de 50% da referência aparecem bolhas extras.
- Correção: **"Animar o fluxo"** desmarcado agora para setas e bolhas (antes a regra de pausa perdia
  para a regra de execução no CSS). O mesmo vale para a pausa com Configurar aberto e aba oculta.

## Teste local
1. Dois cliques em `INICIAR-TESTE.bat` (porta **8769**).
2. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `VazaoGrade-LOCAL.trex`.

## Produção
Hospede `index.html`, `app.js`, `style.css` e `vendor/` em HTTPS e ajuste a URL em `VazaoGrade-PRODUCAO.trex`.
