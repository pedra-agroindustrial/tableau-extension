(() => {
  'use strict';

  const last = document.getElementById('last');

  let timer = null;

  function verificarAtualizacao() {
    // Horário da verificação no navegador.
    // Não representa necessariamente a última carga dos dados.
    const agora = new Date();

    last.textContent = agora.toLocaleString('pt-BR');
  }

  async function init() {
    try {
      if (!window.tableau?.extensions) {
        throw new Error('Biblioteca Tableau indisponível.');
      }

      if (window.self === window.top) {
        throw new Error(
          'Abra esta extensão dentro de um dashboard Tableau.'
        );
      }

      await tableau.extensions.initializeAsync();

      verificarAtualizacao();

      timer = window.setInterval(
        verificarAtualizacao,
        3000
      );

    } catch (err) {
      last.textContent = 'Não foi possível conectar ao Tableau.';
      console.error(err);
    }
  }

  window.addEventListener('pagehide', () => {
    if (timer !== null) {
      clearInterval(timer);
    }
  });

  void init();
})();