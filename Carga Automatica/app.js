const INTERVALO = 30000; // tempo de espera APÓS o fim de cada carga

async function obterFontesUnicas() {
    const fontes = new Map();
    const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;

    for (const ws of worksheets) {
        const lista = await ws.getDataSourcesAsync();
        for (const fonte of lista) {
            if (!fontes.has(fonte.id)) fontes.set(fonte.id, fonte);
        }
    }
    return [...fontes.values()];
}

async function atualizarDados(fontes) {
    const inicio = Date.now();
    try {
        // Atualiza as fontes únicas em paralelo, uma única vez cada
        const resultados = await Promise.allSettled(
            fontes.map(f => f.refreshAsync())
        );

        resultados.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`Falha na fonte ${fontes[i].name}:`, r.reason);
            }
        });

        exibirUltimaAtualizacao(new Date());
        console.log(`Carga concluída em ${((Date.now() - inicio) / 1000).toFixed(1)}s`,
                    `(${fontes.length} fonte(s))`);
    } catch (erro) {
        console.error("Erro ao atualizar dados:", erro);
    } finally {
        setTimeout(() => atualizarDados(fontes), INTERVALO);
    }
}

function exibirUltimaAtualizacao(data) {
    document.getElementById("ultimaAtualizacao").textContent =
        data.toLocaleString("pt-BR");
}

tableau.extensions.initializeAsync().then(async () => {
    const fontes = await obterFontesUnicas();
    console.log("Fontes encontradas:", fontes.map(f => f.name));
    atualizarDados(fontes);
});
