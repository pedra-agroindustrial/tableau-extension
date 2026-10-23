// ===================== CONFIGURAÇÃO =====================
const INTERVALO = 30000;       // intervalo normal: 30 s
const INTERVALO_ERRO = 120000; // após falha: 2 min

const COR_CARREGANDO = "#F2B705";
const COR_OK = "#269653";
const COR_ERRO = "#D92D20";

// ===================== ESTADO =====================
let fonte = null;
let falhas = 0;
let atualizando = false;
let timer = null;

// ===================== INTERFACE =====================
function exibirTexto(texto) {
    document.getElementById("last").textContent = texto;
}

function exibirUltimaAtualizacao(data) {
    exibirTexto(data.toLocaleString("pt-BR"));
}

function definirIndicador(cor) {
    document.querySelector(".indicator").style.background = cor;
}

// ===================== FONTE DE DADOS =====================
async function obterFonte() {
    const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;
    for (const ws of worksheets) {
        const fontes = await ws.getDataSourcesAsync();
        if (fontes.length > 0) return fontes[0]; // fonte única do painel
    }
    return null;
}

// ===================== AGENDAMENTO =====================
function agendar(ms) {
    clearTimeout(timer); // garante um único ciclo ativo
    timer = setTimeout(atualizarDados, ms);
}

// ===================== ATUALIZAÇÃO =====================
async function atualizarDados() {
    if (atualizando) return; // evita cargas sobrepostas

    // Não consulta se a aba/painel não estiver visível
    if (document.visibilityState !== "visible") {
        agendar(INTERVALO);
        return;
    }

    atualizando = true;
    const inicio = Date.now();
    definirIndicador(COR_CARREGANDO);

    try {
        await fonte.refreshAsync();
        falhas = 0;
        exibirUltimaAtualizacao(new Date());
        definirIndicador(COR_OK);
        console.log(`Carga concluída em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
    } catch (erro) {
        falhas++;
        definirIndicador(COR_ERRO);
        exibirTexto("Falha na conexão – tentando novamente");
        console.error(`Erro ao atualizar dados (falha ${falhas}):`, erro);
    } finally {
        atualizando = false;
        agendar(falhas > 0 ? INTERVALO_ERRO : INTERVALO);
    }
}

// Ao voltar para a aba, atualiza na hora
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && fonte && !atualizando) {
        atualizarDados();
    }
});

// ===================== INICIALIZAÇÃO =====================
tableau.extensions.initializeAsync()
    .then(async () => {
        fonte = await obterFonte();
        if (!fonte) {
            definirIndicador(COR_ERRO);
            exibirTexto("Fonte não encontrada");
            return;
        }
        console.log("Fonte:", fonte.name);
        atualizarDados();
    })
    .catch((erro) => {
        definirIndicador(COR_ERRO);
        exibirTexto("Erro ao iniciar extensão");
        console.error("Erro na inicialização:", erro);
    });
