# Status de Atualização — v2.0.0

Indicador "● ATUALIZADO 32 s" que compara a data/hora dos dados com a hora atual **no fuso da unidade**.

## Entradas (cartão Marcas)
| Entrada | Campo |
|---|---|
| **Data** | Data/hora da última carga (com várias linhas, usa a mais recente) |
| **Unidade** | Opcional: define o fuso (ex.: unidade do Mato Grosso → America/Cuiaba) |

## Correções da 2.0.0
- Ocupa exatamente o objeto do dashboard: sem barra de rolagem, sem texto cortado (fonte se ajusta ao espaço).
- Fundo configurável: caixa clara, transparente (texto escuro), transparente sobre o verde (texto branco) ou cor sólida.
- Ícone de configurar dentro da caixa, só no modo de edição e ao passar o mouse.
- Atualiza o contador a cada segundo sem consultar o Tableau de novo (só redesenha o texto).

## Estados (Configurar)
ATUALIZADO até 5 min · ATENÇÃO até 15 min · ATRASADO acima disso (limites e textos editáveis).

## No Tableau
Objeto da extensão: título oculto, preenchimento 0, fundo "Nenhum" (para o modo transparente).

## Teste local
1. Copie `vendor/` de outra extensão.  2. `INICIAR-TESTE.bat` (porta 8775).  3. Adicione `StatusAtualizacao-LOCAL.trex`.
