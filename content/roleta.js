"use strict";

/*
 * Roda no MUNDO DA PRÓPRIA PÁGINA (manifest: "world": "MAIN") para acelerar
 * SOMENTE a animação da roleta. O resultado (sucesso/fracasso) vem do servidor
 * do jogo — aqui só o relógio da animação anda mais rápido. A chance não muda.
 *
 * A velocidade é lida de `document.documentElement.dataset.riftRoleta`, que o
 * painel (content/panel.js, mundo isolado) define. Sem o painel dizendo nada,
 * fica em 1 (normal).
 *
 * Só acelera quando há uma roleta/modal na tela — assim não altera o ritmo do
 * jogo durante a navegação normal.
 */
(() => {
  if (window.__riftRoletaInstalada) return;
  window.__riftRoletaInstalada = true;

  const agoraReal = performance.now.bind(performance);
  const quadroReal = window.requestAnimationFrame.bind(window);
  const esperaReal = window.setTimeout.bind(window);

  let fatorAtual = 1;
  let fatorVisto = 0;
  let baseReal = agoraReal();
  let baseFalsa = baseReal;

  function fator() {
    const real = agoraReal();
    if (real - fatorVisto < 50) return fatorAtual;
    fatorVisto = real;
    const pedido = parseFloat(document.documentElement?.dataset?.riftRoleta || "1");
    const ativo = pedido > 1 && document.querySelector(".roulette, .modal-back");
    return ativo ? pedido : 1;
  }

  // Relógio contínuo: ao mudar a velocidade, recomeça a contar do ponto atual.
  function relogio(real) {
    const f = fator();
    if (f !== fatorAtual) {
      baseFalsa += (real - baseReal) * fatorAtual;
      baseReal = real;
      fatorAtual = f;
    }
    return baseFalsa + (real - baseReal) * fatorAtual;
  }

  performance.now = () => relogio(agoraReal());
  window.requestAnimationFrame = (cb) => quadroReal((real) => cb(relogio(real)));
  window.setTimeout = (fn, ms, ...args) => {
    const f = fator();
    const espera = f > 1 && ms > 0 && ms < 10000 ? ms / f : ms;
    return esperaReal(fn, espera, ...args);
  };
})();
