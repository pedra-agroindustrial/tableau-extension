let atualizando = false;

async function atualizarDados() {
    if (atualizando) return;

    atualizando = true;

    try {
        const worksheets =
            tableau.extensions.dashboardContent.dashboard.worksheets;

        for (const worksheet of worksheets) {
            const fontes = await worksheet.getDataSourcesAsync();

            for (const fonte of fontes) {
                if (fonte.refreshAsync) {
                    await fonte.refreshAsync();
                }
            }
        }

        console.log("Atualização solicitada com sucesso.");
    } catch (erro) {
        console.error("Erro ao atualizar dados:", erro);
    } finally {
        atualizando = false;
    }
}

tableau.extensions.initializeAsync().then(() => {
    atualizarDados();
    setInterval(atualizarDados, 60000);
});
