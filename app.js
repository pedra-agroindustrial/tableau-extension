/* Atualiza fontes do dashboard ativo. Não executa refresh de extrações. */
(() => {
  'use strict';
  let interval = 30000;
  let saving = false;
  const validSeconds = n => Number.isInteger(n) && n >= 1 && n <= 86400;
  const el = id => document.getElementById(id);
  let dashboard, busy = false, paused = false, ready = false;
  let next = 0, started = 0, failures = 0;
  const describe = err => String(err && err.message || err);
  function controls() {
    el('refresh').disabled = !ready || busy;
    el('pause').disabled = !ready;
    el('apply').disabled = !ready || saving;
    el('seconds').disabled = !ready || saving;
    el('pause').textContent = paused ? 'Retomar' : 'Pausar';
  }
  async function refresh() {
    if (!ready || busy) return;
    busy = true;
    started = Date.now();
    controls();
    el('message').textContent = 'Atualizando fontes…';
    el('details').textContent = '';
    const errors = [];
    const sources = new Map();
    try {
      for (const worksheet of dashboard.worksheets) {
        try {
          for (const source of await worksheet.getDataSourcesAsync()) sources.set(source.id, source);
        } catch (err) { errors.push(`${worksheet.name}: ${describe(err)}`); }
      }
      for (const source of sources.values()) {
        try { await source.refreshAsync(); }
        catch (err) { errors.push(`${source.name}: ${describe(err)}`); }
      }
      if (!sources.size) errors.push('Nenhuma fonte acessível neste painel.');
      if (errors.length) throw new Error(errors.join('\n'));
      failures = 0;
      el('message').textContent = 'Atualização concluída';
      el('last').textContent = 'Última atualização completa: ' + new Date().toLocaleString('pt-BR');
      if ([...sources.values()].some(s => s.isExtract)) {
        el('details').textContent = 'Há fontes de extração: a carga do .hyper continua dependendo da atualização no Tableau.';
      }
    } catch (err) {
      failures += 1;
      el('message').textContent = 'Atualização incompleta';
      el('details').textContent = describe(err) + '\nNova tentativa automática com intervalo ampliado.';
    } finally {
      // Não acumula ciclos perdidos nem dispara chamadas simultâneas.
      const delay = failures ? Math.min(Math.max(300000, interval), interval * 2 ** Math.min(failures, 4)) : interval;
      next = failures ? Date.now() + delay : Math.max(started + interval, Date.now() + 1000);
      busy = false;
      controls();
    }
  }
  async function applyInterval(event) {
    event.preventDefault();
    if (!ready || saving) return;
    const seconds = Number(el('seconds').value);
    if (!validSeconds(seconds)) {
      el('configStatus').textContent = 'Informe um número inteiro de 1 a 86400 segundos.';
      return;
    }
    interval = seconds * 1000;
    next = Date.now() + interval;
    el('activeInterval').textContent = seconds + 's';
    const settings = tableau.extensions.settings;
    if (tableau.extensions.environment.mode !== 'authoring') {
      el('configStatus').textContent = `Intervalo de ${seconds}s aplicado nesta sessão. Para salvar no painel, aplique no modo de edição e salve/publice a pasta de trabalho.`;
      return;
    }
    saving = true;
    controls();
    el('configStatus').textContent = 'Salvando intervalo…';
    try {
      settings.set('intervalSeconds', String(seconds));
      await settings.saveAsync();
      el('configStatus').textContent = `Intervalo de ${seconds}s salvo na extensão. Salve/publice a pasta de trabalho para manter a configuração.`;
    } catch (err) {
      el('configStatus').textContent = `Intervalo aplicado nesta sessão, mas não foi salvo: ${describe(err)}`;
    } finally {
      saving = false;
      controls();
    }
  }
  el('intervalForm').addEventListener('submit', applyInterval);
  el('refresh').addEventListener('click', refresh);
  el('pause').addEventListener('click', () => {
    paused = !paused;
    if (!paused) next = Date.now() + interval;
    controls();
  });
  setInterval(() => {
    if (!ready) return;
    if (busy) {
      el('countdown').textContent = 'Em andamento';
      if (Date.now() - started > 120000) {
        el('message').textContent = 'Atualização demorada — aguardando Tableau';
        el('details').textContent = 'Mais de 2 minutos sem conclusão. Verifique conexão e sessão. Nenhuma chamada adicional será iniciada enquanto esta estiver pendente.';
      }
      return;
    }
    if (paused) { el('countdown').textContent = 'Pausado'; return; }
    el('countdown').textContent = `Próxima: ${Math.max(0, Math.ceil((next - Date.now()) / 1000))}s`;
    if (Date.now() >= next) void refresh();
  }, 500);
  async function init() {
    try {
      if (!window.tableau || !tableau.extensions) throw new Error('Biblioteca Tableau indisponível. Confira a pasta vendor.');
      if (window.self === window.top) throw new Error('Abra esta extensão dentro de um dashboard Tableau usando o arquivo .trex.');
      await tableau.extensions.initializeAsync();
      dashboard = tableau.extensions.dashboardContent.dashboard;
      const saved = Number(tableau.extensions.settings.get('intervalSeconds'));
      if (validSeconds(saved)) interval = saved * 1000;
      el('seconds').value = String(interval / 1000);
      el('activeInterval').textContent = interval / 1000 + 's';
      ready = true;
      controls();
      await refresh();
    } catch (err) {
      el('message').textContent = 'Não foi possível iniciar';
      el('details').textContent = describe(err);
    }
  }
  void init();
})();
