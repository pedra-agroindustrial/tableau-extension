/* Atualiza as fontes de dados do dashboard ativo.
   Não executa refresh de extrações no servidor. */
(() => {
  'use strict';

  const el = id => document.getElementById(id);

  let dashboard = null;
  let ready = false;
  let busy = false;

  const describe = err =>
    String(err && err.message || err);

  function setStatus(message) {
    el('message').textContent = message;
  }

  function setBusy(value) {
    busy = value;
    el('refresh').disabled = !ready || busy;
  }

  async function refresh() {
    if (!ready || busy) return;

    setBusy(true);
    setStatus('Atualizando fontes…');
    el('details').textContent = '';

    const errors = [];
    const sources = new Map();

    try {
      for (const worksheet of dashboard.worksheets) {
        try {
          const dataSources =
            await worksheet.getDataSourcesAsync();

          for (const source of dataSources) {
            sources.set(source.id, source);
          }
        } catch (err) {
          errors.push(
            `${worksheet.name}: ${describe(err)}`
          );
        }
      }

      for (const source of sources.values()) {
        try {
          await source.refreshAsync();
        } catch (err) {
          errors.push(
            `${source.name}: ${describe(err)}`
          );
        }
      }

      if (sources.size === 0) {
        errors.push(
          'Nenhuma fonte de dados acessível neste painel.'
        );
      }

      if (errors.length) {
        throw new Error(errors.join('\n'));
      }

      setStatus('Atualização concluída');

      el('last').textContent =
        'Última atualização: ' +
        new Date().toLocaleString('pt-BR');

      if ([...sources.values()].some(source => source.isExtract)) {
        el('details').textContent =
          'Este painel contém fontes de extração. ' +
          'A atualização do arquivo Hyper depende do Tableau.';
      }
    } catch (err) {
      setStatus('Atualização incompleta');
      el('details').textContent = describe(err);
    } finally {
      setBusy(false);
    }
  }

  async function init() {
    try {
      if (
        !window.tableau ||
        !window.tableau.extensions
      ) {
        throw new Error(
          'Biblioteca Tableau indisponível. ' +
          'Confira vendor/tableau.extensions.js.'
        );
      }

      if (window.self === window.top) {
        throw new Error(
          'Abra esta extensão dentro de um dashboard Tableau.'
        );
      }

      setStatus('Conectando ao Tableau…');

      await tableau.extensions.initializeAsync();

      dashboard =
        tableau.extensions.dashboardContent.dashboard;

      ready = true;
      setBusy(false);

      await refresh();
    } catch (err) {
      ready = false;
      setBusy(false);
      setStatus('Não foi possível iniciar');
      el('details').textContent = describe(err);
    }
  }

  el('refresh').addEventListener('click', refresh);

  void init();
})();