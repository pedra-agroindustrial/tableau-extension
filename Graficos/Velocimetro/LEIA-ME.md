# Motor Grade — v1.1.0

Uma única Viz Extension com **um velocímetro por motor** (1 planilha, 1 consulta). Velocidade em **%**.

## Entradas (cartão Marcas)
| Entrada | Campo |
|---|---|
| **Título** | Dimensão do motor (ex.: MT-50101) — 1 cartão por valor (obrigatório) |
| **Valor** | Velocidade em % (0–100). O máximo da escala é configurável |
| **Informação** | Opcional: corrente. Numérico → `193,4 A` |
| **Status** | Opcional: texto do selo. Sem campo, o selo é calculado (velocidade > limite = EM OPERAÇÃO) |

## Novidades da 1.1.0
- **Tamanho da fonte do valor** (10–40, padrão 17) e **tamanho da unidade** (% do valor, padrão 65%).
- **Tamanho da fonte da informação** (8–30, padrão 13) e opção de **negrito**.
- O valor e a informação se reposicionam sozinhos conforme o tamanho, sem sobrepor; o desenho cresce para baixo se precisar.
- Os tamanhos são relativos ao velocímetro: escalam junto quando o cartão aumenta ou diminui.
- Configurações salvas na 1.0 continuam valendo (os campos novos entram com o padrão).

## Teste local
1. Dois cliques em `INICIAR-TESTE.bat` (porta **8770**).
2. Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > `MotorGrade-LOCAL.trex`.

## Produção
Hospede `index.html`, `app.js`, `style.css` e `vendor/` em HTTPS e ajuste a URL em `MotorGrade-PRODUCAO.trex`.
