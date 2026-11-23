# Monitor de Horário — v1.0.3

Viz Extension (padrão Motor Grade) que mostra **um alerta** com a diferença, **em segundos**, entre a
data/hora da última carga e o horário atual. Detalhes no **tooltip**.

## Regra de horário (nivelamento)
- A carga grava **sempre no horário de São Paulo**.
- O fuso da unidade (ex.: MT = America/Cuiaba, 1h a menos) é **nivelado com SP** antes de comparar.
- Ex.: carga 10:16:19 (SP), agora 09:17:26 em MT = 10:17:26 em SP → **1 min 07 s**.

## Entradas (cartão Marcas)

| Entrada | Campo |
|---|---|
| **Data** | Dimensão de data/hora (obrigatório). Use **Data e hora exata**. A extensão usa a maior data |
| **Unidade** | Opcional. Sem campo, a unidade é lida do **filtro** de unidade da planilha |

## Status (limites configuráveis, em minutos)

| Cor | Status | Padrão |
|---|---|---|
| 🟢 | ATUALIZADO | ≤ 5 min |
| 🟡 | ATENÇÃO | ≤ 15 min |
| 🟠 | ATRASADO | ≤ 30 min |
| 🔴 | CRÍTICO | > 30 min |
| 🟣 | À FRENTE | data no futuro além de 5 min |
| ⚪ | SEM DADOS | nenhuma data válida |

Tooltip: unidade, fuso da unidade, último dado (SP), agora (SP), agora na unidade, diferença e limites.

## Novidades da 1.0.3
- Botão ⓘ (canto superior direito) liga/desliga o tooltip. Também em Configurar.
- Versão exibida no rodapé do tooltip e no título da configuração.
- URL do .trex com ?v=1.0.3 para forçar o Tableau a recarregar.

## Novidades da 1.0.2
- Diferença exibida em segundos (`45 s`, `1 min 07 s`, `1h 05min 12s`).
- Carga fixa em SP; o fuso da unidade é nivelado com SP (não soma mais 1h).
- Recálculo padrão a cada 5 s (configurável de 1 a 600 s).

## Teste local
- Dois cliques em INICIAR-TESTE.bat (porta **8771**).
- Navegador: http://localhost:8771/index.html?demo=1 (demonstração).
- Tableau Desktop: Marcas > Viz Extensions > Acessar extensões locais > MonitorHorario-LOCAL.trex.

## Produção
Hospede index.html, app.js, style.css e vendor/ em HTTPS e ajuste a URL em MonitorHorario-PRODUCAO.trex.
