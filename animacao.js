/*
 * animacao.js — "Como o voto vira cadeira".
 * Lê SWMMotor.cadeiras(...) (qe, vagas, agremiacoes, eleitos, passos) e o lido (votos, candidatos).
 * Antes da apuração (aguardando), roda um EXEMPLO DIDÁTICO rotulado, passado pelo próprio motor.
 * Expõe window.SWMUtil (formatação, contagem, FLIP) e window.SWMAnim { atualiza, rever }.
 */
(function () {
  'use strict';

  /* ================= utilidades compartilhadas ================= */
  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function f0(v) { return (v === null || v === undefined || !isFinite(v)) ? '—' : nf0.format(Math.round(v)); }
  function f2(v) { return (v === null || v === undefined || !isFinite(v)) ? '—' : nf2.format(v); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* conta o número de onde está até o alvo (nada parado, mas leve: um rAF por elemento) */
  function conta(el, alvo, fmt, dur) {
    if (!el) return;
    fmt = fmt || f0;
    if (alvo === null || alvo === undefined || !isFinite(alvo)) { el._v = null; el.textContent = '—'; return; }
    var de = (typeof el._v === 'number') ? el._v : 0;
    el._v = alvo;
    if (reduz || de === alvo) { el.textContent = fmt(alvo); return; }
    dur = dur || 900;
    var t0 = performance.now(), id = (el._raf = (el._raf || 0) + 1);
    (function passo(t) {
      if (el._raf !== id) return;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(de + (alvo - de) * e);
      if (k < 1) requestAnimationFrame(passo);
    })(t0);
  }
  /* FLIP: anima a troca de ordem das linhas de uma lista */
  function flip(container, muda) {
    var antes = new Map();
    Array.prototype.forEach.call(container.children, function (k) { antes.set(k, k.getBoundingClientRect().top); });
    muda();
    if (reduz) return;
    Array.prototype.forEach.call(container.children, function (k) {
      var a = antes.get(k); if (a === undefined) return;
      var d = a - k.getBoundingClientRect().top;
      if (!d) return;
      k.style.transition = 'none'; k.style.transform = 'translateY(' + d + 'px)';
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        k.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; k.style.transform = '';
      }); });
    });
  }
  /* paleta neutra para agremiações (nenhuma cor "de partido" fixa) */
  /* as mais distintas primeiro; atribuída pela ordem de votos (as primeiras quase não trocam de lugar) */
  var PALETA = ['#4d8ef7', '#34d399', '#f59e0b', '#c084fc', '#f472b6', '#a3e635', '#22d3ee', '#fb923c',
    '#94a3b8', '#facc15', '#818cf8', '#2dd4bf', '#e879f9', '#fdba74', '#60a5fa', '#4ade80',
    '#fda4af', '#d9f99d', '#a5b4fc', '#67e8f9', '#f0abfc', '#38bdf8'];
  function corDe(lista) {
    var ids = lista.slice().sort(function (a, b) { return ((b.votos || 0) - (a.votos || 0)) || (String(a.id) < String(b.id) ? -1 : 1); })
      .map(function (a) { return String(a.id); });
    var mapa = {};
    ids.forEach(function (id, i) { mapa[id] = PALETA[i % PALETA.length]; });
    return function (id) { return mapa[String(id)] || '#64748b'; };
  }
  window.SWMUtil = { f0: f0, f2: f2, esc: esc, conta: conta, flip: flip, corDe: corDe, reduz: reduz };

  /* ================= o exemplo didático (números fictícios, rotulados) ================= */
  function exemploLido() {
    var defs = [
      ['A', 4500, [['A1', 12000], ['A2', 7000], ['A3', 5500], ['A4', 3600], ['A5', 1900]]],
      ['B', 2000, [['B1', 19000], ['B2', 2500], ['B3', 2100], ['B4', 400]]],
      ['C', 1800, [['C1', 6000], ['C2', 4500], ['C3', 3000], ['C4', 2500]]],
      ['D', 500, [['D1', 3100], ['D2', 2900], ['D3', 2500]]],
      ['E', 200, [['E1', 6200], ['E2', 800], ['E3', 500]]],
      ['F', 200, [['F1', 2000], ['F2', 1800], ['F3', 1000]]]
    ];
    var ags = [], cands = [], nom = 0, leg = 0;
    defs.forEach(function (d, i) {
      var nominais = d[2].reduce(function (s, c) { return s + c[1]; }, 0);
      nom += nominais; leg += d[1];
      var sigla = 'Partido ' + d[0];
      ags.push({ id: 'EX' + d[0], nome: sigla, sigla: sigla, tipo: 'i', partidos: [{ n: String(i + 1), sigla: sigla, nome: sigla, nominais: nominais, legenda: d[1] }], votos: nominais + d[1] });
      d[2].forEach(function (c, j) {
        cands.push({ n: String(i + 1) + String(j + 1), nome: 'Candidatura ' + c[0], urna: 'Candidatura ' + c[0], sigla: sigla, agremiacaoId: 'EX' + d[0], votos: c[1], pct: null, situacaoTSE: null, elegivel: true });
      });
    });
    return {
      cargo: { cd: 'exemplo', nome: 'Exemplo', vagas: 10 },
      apuracao: { pct: 100, secoesTotais: null, secoesApuradas: null, dataHora: null, totalizada: false },
      votos: { validos: nom + leg, nominais: nom, legenda: leg, brancos: 4000, nulos: 6000, comparecimento: null, abstencao: null, eleitorado: null },
      agremiacoes: ags, candidatos: cands
    };
  }

  /* ================= preparação dos números da animação ================= */
  function prepara(d) {
    var lido = d.lido, cad = d.cad, M = window.SWMMotor;
    var cor = d.cor || corDe(lido.agremiacoes);
    var qe = cad.qe, vagas = cad.vagas || (lido.cargo && lido.cargo.vagas);
    var porId = {};
    lido.agremiacoes.forEach(function (a) { porId[String(a.id)] = a; });
    var ags = (cad.agremiacoes || []).map(function (a) {
      var base = porId[String(a.id)] || {};
      return {
        id: String(a.id), sigla: a.sigla || base.sigla || '?', votos: a.votos !== undefined && a.votos !== null ? a.votos : base.votos,
        cadeirasQP: a.cadeirasQP || 0, cadeirasMedia: a.cadeirasMedia || 0, cadeiras: a.cadeiras || 0,
        eleitos: (a.eleitos || []).map(String), cor: cor(a.id)
      };
    }).filter(function (a) { return a.votos > 0; })
      .sort(function (x, y) { return y.votos - x.votos; });
    var agPorId = {}; ags.forEach(function (a) { agPorId[a.id] = a; });
    var somaQP = ags.reduce(function (s, a) { return s + a.cadeirasQP; }, 0);

    /* as rodadas das sobras: do passo 'media' do motor (numeros.medias / vencedor); se o motor não der, reconstruídas e conferidas */
    var rodadas = [];
    (cad.passos || []).forEach(function (p) {
      if (p.tipo !== 'media' || !p.numeros) return;
      var n = p.numeros, med = n.medias || n.agremiacoes || null;
      var vid = n.vencedor ? String(n.vencedor.id !== undefined ? n.vencedor.id : n.vencedor) : (n.id !== undefined ? String(n.id) : null);
      if (!med || !vid) return;
      rodadas.push({
        vencedor: vid,
        medias: med.map(function (m) { return { id: String(m.id), votos: m.votos, cadeiras: m.cadeiras, media: m.media !== undefined ? m.media : m.votos / (m.cadeiras + 1) }; })
      });
    });
    var restam = vagas - somaQP;
    var somaMedia = ags.reduce(function (s, a) { return s + a.cadeirasMedia; }, 0);
    if (rodadas.length !== somaMedia) rodadas = reconstroi(ags, qe, somaMedia);

    /* candidatos: quem entra, quem fica fora */
    var eleitosN = {};
    (cad.eleitos || []).forEach(function (e) { eleitosN[String(e.n)] = e; });
    var candPorAg = {};
    lido.candidatos.forEach(function (c) {
      var k = String(c.agremiacaoId);
      (candPorAg[k] = candPorAg[k] || []).push(c);
    });
    Object.keys(candPorAg).forEach(function (k) { candPorAg[k].sort(function (x, y) { return y.votos - x.votos; }); });
    var dentro = lido.candidatos.filter(function (c) { return eleitosN[String(c.n)]; });
    var fora = lido.candidatos.filter(function (c) { return !eleitosN[String(c.n)] && c._valido !== false; });
    var menorDentro = dentro.slice().sort(function (x, y) { return x.votos - y.votos; })[0] || null;
    var maiorFora = fora.slice().sort(function (x, y) { return y.votos - x.votos; })[0] || null;
    var puxador = dentro.slice().sort(function (x, y) { return y.votos - x.votos; })[0] || null;
    if (puxador && !(qe && puxador.votos >= qe)) puxador = null;

    return {
      exemplo: !!d.exemplo, final: !!(lido.apuracao && lido.apuracao.totalizada === true), /* site5: o arquivo totalizado */ cargo: d.cargo || (lido.cargo && lido.cargo.nome) || '', qe: qe, vagas: vagas,
      validos: lido.votos.validos, nominais: lido.votos.nominais, legenda: lido.votos.legenda,
      brancos: lido.votos.brancos, nulos: lido.votos.nulos,
      ags: ags, agPorId: agPorId, somaQP: somaQP, restam: restam, rodadas: rodadas,
      eleitosN: eleitosN, candPorAg: candPorAg,
      porque: (maiorFora && menorDentro && maiorFora.votos > menorDentro.votos) ? { fora: maiorFora, dentro: menorDentro } : null,
      puxador: puxador
    };
  }
  /* reconstrução das rodadas (só se o motor não as entregar): maior média entre as agremiações
     com cadeira por média ou com ≥ 80% do QE; vale só se reproduzir as cadeiras por média do motor */
  function reconstroi(ags, qe, somaMedia) {
    if (!somaMedia || !qe) return [];
    var cad = {}, alvo = {};
    ags.forEach(function (a) { cad[a.id] = a.cadeirasQP; alvo[a.id] = a.cadeirasMedia; });
    var disputa = ags.filter(function (a) { return a.cadeirasMedia > 0 || a.votos >= 0.8 * qe; });
    var rod = [], ganhou = {};
    for (var r = 0; r < somaMedia; r++) {
      var medias = disputa.map(function (a) { return { id: a.id, votos: a.votos, cadeiras: cad[a.id], media: a.votos / (cad[a.id] + 1) }; })
        .sort(function (x, y) { return (y.media - x.media) || (y.votos - x.votos); });
      var v = medias[0]; if (!v) return [];
      rod.push({ vencedor: v.id, medias: medias });
      cad[v.id]++; ganhou[v.id] = (ganhou[v.id] || 0) + 1;
    }
    var bate = ags.every(function (a) { return (ganhou[a.id] || 0) === alvo[a.id]; });
    return bate ? rod : [];
  }

  /* ================= o palco ================= */
  var el = {}, P = null, atual = null, pendente = null, tocando = false, visivel = false, sujo = true, assinatura = '';
  var timers = [], cenaAtual = -1;
  function $(id) { return document.getElementById(id); }
  function depois(ms, fn) { timers.push(setTimeout(fn, reduz ? Math.min(ms, 400) : ms)); }
  function para() { timers.forEach(clearTimeout); timers = []; }
  function legenda(html) { el.legenda.innerHTML = html; el.legenda.classList.remove('fade'); void el.legenda.offsetWidth; el.legenda.classList.add('fade'); }
  function tempo(ms) {
    var b = el.tempo; b.style.transition = 'none'; b.style.width = '0';
    void b.offsetWidth; b.style.transition = 'width ' + (reduz ? 400 : ms) + 'ms linear'; b.style.width = '100%';
  }
  function marcaPasso(i) {
    Array.prototype.forEach.call(el.nav.querySelectorAll('button'), function (b) {
      var k = +b.dataset.cena;
      b.classList.toggle('ativo', k === i); b.classList.toggle('feito', k < i);
    });
  }
  function palco(html) { el.cena.innerHTML = '<div class="fade">' + html + '</div>'; }

  function cabecalho(p) {
    el.selo.hidden = !p.exemplo;
    el.sub.textContent = p.exemplo
      ? 'Exemplo com números fictícios. Com a apuração, a animação usa os números reais da parcial.'
      : p.final ? p.cargo + ' · com os números finais do TSE' : p.cargo + ' · com os números da parcial, se a apuração terminasse agora';
  }
  /* fora da tela: mostra o resultado parado; a animação começa quando o leitor chega */
  function quadroParado() {
    if (!atual || tocando) return;
    P = prepara(atual); cabecalho(P);
    final(P, function () {}); para(); el.tempo.style.transition = 'none'; el.tempo.style.width = '0';
    marcaPasso(-1);
  }
  var CENAS = [cenaValidos, cenaQE, cenaQP, cenaSobras, cenaSenta];
  function toca(desde) {
    para();
    if (!atual) return;
    if (pendente) { atual = pendente; pendente = null; }
    P = prepara(atual);
    sujo = false; tocando = true;
    el.rever.classList.remove('chama');
    cabecalho(P);
    roda(desde || 0);
  }
  function roda(i) {
    if (i >= CENAS.length) { fim(); return; }
    cenaAtual = i; marcaPasso(i);
    CENAS[i](P, function () { roda(i + 1); });
  }
  function fim() {
    tocando = false; marcaPasso(CENAS.length);
    el.rever.classList.add('chama');
    if (pendente) {
      depois(7000, function () { if (visivel) toca(0); else sujo = true; });
    }
  }

  /* --- cena 1: votos válidos --- */
  function cenaValidos(p, prox) {
    var temLeg = p.legenda !== null && p.legenda !== undefined;
    palco(
      '<div class="cena-titulo">1 · O que entra na conta</div><div class="soma">' +
      '<div class="soma__item"><span>Votos em candidatos</span><b data-c="nom">0</b></div>' +
      (temLeg ? '<div class="soma__item"><span>+ votos só no número do partido (legenda)</span><b data-c="leg">0</b></div>' : '') +
      '<div class="soma__item total"><span>= votos válidos</span><b data-c="val">0</b></div>' +
      '<div class="soma__item fora"><span>brancos e nulos: não contam</span><b data-c="bn">0</b></div></div>'
    );
    var q = function (k) { return el.cena.querySelector('[data-c="' + k + '"]'); };
    conta(q('nom'), p.nominais, f0, 1200);
    if (temLeg) depois(500, function () { conta(q('leg'), p.legenda, f0, 1000); });
    depois(1200, function () { conta(q('val'), p.validos, f0, 1200); });
    var bn = (p.brancos === null || p.nulos === null) ? null : p.brancos + p.nulos;
    depois(1800, function () { conta(q('bn'), bn, f0, 800); });
    legenda('Na eleição para deputado contam os <b>votos válidos</b>: os dados a candidatos e os dados só ao número do partido (a <b>legenda</b>). Brancos e nulos ficam de fora.');
    var ms = 6000; tempo(ms); depois(ms, prox);
  }

  /* --- cena 2: quociente eleitoral --- */
  function cenaQE(p, prox) {
    var n = p.vagas, fat = '';
    for (var i = 0; i < n; i++) fat += '<div class="fatia" style="animation-delay:' + (300 + i * Math.min(90, 1800 / n)) + 'ms"></div>';
    palco(
      '<div class="cena-titulo">2 · Quanto custa uma cadeira</div>' +
      '<div class="conta"><div><span class="n">' + f0(p.validos) + '</span><span class="rot">votos válidos</span></div>' +
      '<span class="op">÷</span><div><span class="n">' + n + '</span><span class="rot">cadeiras</span></div>' +
      '<span class="op">=</span><div><span class="n res" data-c="qe">0</span><span class="rot">quociente eleitoral</span></div></div>' +
      '<div class="fatias">' + fat + '</div><div class="fatia-rot"><span>0</span><span>' + f0(p.validos) + ' votos válidos</span></div>' +
      '<div class="cadeira-custa" style="opacity:0;transition:opacity .6s" data-c="custa"><span class="ic"></span><div>1 cadeira = <b>' + f0(p.qe) + '</b> votos</div></div>'
    );
    depois(900, function () { conta(el.cena.querySelector('[data-c="qe"]'), p.qe, f0, 1400); });
    depois(2600, function () { var c = el.cena.querySelector('[data-c="custa"]'); if (c) c.style.opacity = 1; });
    legenda('<b>' + f0(p.validos) + '</b> votos válidos ÷ <b>' + n + '</b> cadeiras = <b>' + f0(p.qe) + '</b>. É o <b>quociente eleitoral</b>: quantos votos “custa” uma cadeira.');
    var ms = 7000; tempo(ms); depois(ms, prox);
  }

  /* --- cena 3: quociente partidário --- */
  function cenaQP(p, prox) {
    var LIM = 10;
    var mostra = p.ags.filter(function (a, i) { return i < LIM || a.cadeiras > 0; });
    var resto = p.ags.filter(function (a) { return mostra.indexOf(a) < 0; });
    var max = mostra.length ? mostra[0].votos : 1;
    var linhas = mostra.map(function (a, i) {
      var marcas = '';
      for (var k = 1; k * p.qe < a.votos && k < 60; k++) marcas += '<i class="qp-marca" style="left:' + (k * p.qe / max * 100) + '%"></i>';
      return '<div class="qp-linha" style="--c:' + a.cor + '"><span class="sig" title="' + esc(a.sigla) + '">' + esc(a.sigla) + '</span>' +
        '<div class="qp-trilho"><div class="qp-barra" data-w="' + (a.votos / max * 100) + '" style="transition-delay:' + (i * 120) + 'ms"></div>' + marcas + '</div>' +
        '<span class="qp-res"><span data-r="' + i + '">' + f2(a.votos / p.qe) + '</span> <span class="bolas" data-b="' + i + '"></span></span></div>';
    }).join('');
    var outros = resto.length ? '<div class="qp-linha"><span class="sig" style="color:var(--txt3)">+' + resto.length + ' outras</span><span style="color:var(--txt3)">' +
      f0(resto.reduce(function (s, a) { return s + a.votos; }, 0)) + ' votos, menos de um quociente cada</span><span></span></div>' : '';
    palco('<div class="cena-titulo">3 · Cada agremiação ÷ ' + f0(p.qe) + '</div><div class="qp-lista">' + linhas + outros + '</div>' +
      '<div class="qp-rodape"><span>Pelo quociente: <b data-c="sqp">0</b> cadeiras</span><span>Sobram: <b data-c="rest">—</b></span></div>');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      Array.prototype.forEach.call(el.cena.querySelectorAll('.qp-barra'), function (b) { b.style.width = b.dataset.w + '%'; });
    }); });
    mostra.forEach(function (a, i) {
      depois(1400 + i * 120, function () {
        var bb = el.cena.querySelector('[data-b="' + i + '"]'); if (!bb) return;
        var h = ''; for (var k = 0; k < a.cadeirasQP; k++) h += '<i class="bola" style="animation-delay:' + (k * 120) + 'ms"></i>';
        bb.innerHTML = h || '<span style="color:var(--txt3)">0</span>';
      });
    });
    var tFim = 1600 + mostra.length * 120;
    depois(tFim, function () {
      conta(el.cena.querySelector('[data-c="sqp"]'), p.somaQP, f0, 700);
      conta(el.cena.querySelector('[data-c="rest"]'), p.restam, f0, 700);
    });
    legenda('Cada agremiação (partido ou federação) divide os seus votos por <b>' + f0(p.qe) + '</b>. Cada quociente inteiro vale uma cadeira: é o <b>quociente partidário</b>. Saem <b>' + p.somaQP + '</b> cadeiras; sobram <b>' + p.restam + '</b>.');
    var ms = Math.max(7500, tFim + 3500); tempo(ms); depois(ms, prox);
  }

  /* --- cena 4: sobras pela maior média --- */
  function cenaSobras(p, prox) {
    if (!p.restam) {
      palco('<div class="cena-titulo">4 · As sobras</div><p>Não sobrou cadeira: o quociente partidário preencheu todas.</p>');
      legenda('Desta vez o quociente partidário preencheu as <b>' + p.vagas + '</b> cadeiras. Não houve sobra.');
      tempo(4000); depois(4000, prox); return;
    }
    if (!p.rodadas.length) {
      var lst = p.ags.filter(function (a) { return a.cadeirasMedia > 0; }).map(function (a) {
        return '<div class="med-linha" style="--c:' + a.cor + '"><span class="sig">' + esc(a.sigla) + '</span><span class="calc">pela média</span><span class="med">+' + a.cadeirasMedia + '</span></div>';
      }).join('');
      palco('<div class="cena-titulo">4 · As sobras pela maior média</div><div class="med-lista">' + lst + '</div>');
      legenda('As <b>' + p.restam + '</b> cadeiras que sobram vão, uma a uma, para a maior <b>média</b>: votos ÷ (cadeiras que já tem + 1).');
      tempo(6000); depois(6000, prox); return;
    }
    var ids = []; p.rodadas.forEach(function (r) { r.medias.forEach(function (m) { if (ids.indexOf(m.id) < 0) ids.push(m.id); }); });
    var semDisputa = p.ags.filter(function (a) { return ids.indexOf(a.id) < 0; }).length;
    var cad = {}; p.ags.forEach(function (a) { cad[a.id] = a.cadeirasQP; });
    var linhas = ids.map(function (id, i) {
      var a = p.agPorId[id] || { sigla: id, cor: '#64748b', votos: 0 };
      return '<div class="med-linha' + (i >= 8 ? ' oculta' : '') + '" data-id="' + esc(id) + '" style="--c:' + a.cor + '"><span class="sig"><i class="bola" style="--c:' + a.cor + ';margin-right:5px"></i>' + esc(a.sigla) + '</span>' +
        '<span class="calc" data-calc></span><span class="med" data-med>—</span></div>';
    }).join('');
    palco('<div class="cena-titulo">4 · As sobras pela maior média</div>' +
      '<div class="med-cab"><span>Sobra <b data-c="rod">1</b> de ' + p.rodadas.length + '</span><span>média = votos ÷ (cadeiras + 1)</span></div>' +
      '<div class="med-lista" data-lista>' + linhas + '</div>' +
      (semDisputa ? '<p class="med-fora">' + semDisputa + ' agremiaç' + (semDisputa > 1 ? 'ões' : 'ão') + ' com voto não ' + (semDisputa > 1 ? 'entram' : 'entra') + ' nesta disputa: a lei exige um mínimo de votos (80% do quociente eleitoral) e candidato com votação mínima.</p>' : ''));
    var lista = el.cena.querySelector('[data-lista]'), VISIVEIS = 8;
    lista.insertAdjacentHTML('afterend', '<div class="med-mais"></div>');
    var passo = p.rodadas.length > 8 ? 1300 : 2000;
    function mostra(r) {
      var rod = p.rodadas[r];
      el.cena.querySelector('[data-c="rod"]').textContent = r + 1;
      var ordem = rod.medias.slice().sort(function (x, y) { return y.media - x.media; }).map(function (m) { return m.id; });
      ids.forEach(function (id) { if (ordem.indexOf(id) < 0) ordem.push(id); });
      flip(lista, function () {
        ordem.forEach(function (id) {
          var ln = lista.querySelector('[data-id="' + CSS.escape(id) + '"]'); if (!ln) return;
          var m = rod.medias.filter(function (x) { return x.id === id; })[0];
          ln.classList.remove('vence');
          if (m) {
            ln.querySelector('[data-calc]').textContent = f0(m.votos) + ' ÷ (' + m.cadeiras + ' + 1)';
            ln.querySelector('[data-med]').textContent = f0(m.media);
            ln.style.opacity = 1;
          } else { ln.style.opacity = .35; ln.querySelector('[data-calc]').textContent = 'sem candidato apto'; ln.querySelector('[data-med]').textContent = '—'; }
          lista.appendChild(ln);
        });
        var vis = 0;
        Array.prototype.forEach.call(lista.querySelectorAll('.med-linha'), function (ln) { ln.classList.toggle('oculta', vis++ >= VISIVEIS); });
        var mais = lista.parentNode.querySelector('.med-mais');
        if (mais) mais.textContent = ordem.length > VISIVEIS ? '+ ' + (ordem.length - VISIVEIS) + ' com média menor' : '';
      });
      depois(passo * 0.45, function () {
        var ln = lista.querySelector('[data-id="' + CSS.escape(rod.vencedor) + '"]');
        if (ln) { ln.classList.add('vence'); ln.querySelector('[data-calc]').insertAdjacentHTML('beforeend', ' <i class="bola"></i>'); }
      });
    }
    p.rodadas.forEach(function (r, i) { depois(600 + i * passo, function () { mostra(i); }); });
    legenda('Sobraram <b>' + p.restam + '</b> cadeiras. Elas vão uma por vez para a maior <b>média</b>: votos ÷ (cadeiras que já tem + 1). Quem ganha uma cadeira vê a média cair, e a disputa recomeça.');
    var ms = 600 + p.rodadas.length * passo + 2200; tempo(ms); depois(ms, prox);
  }

  /* --- cena 5: quem senta, por que, e o resultado --- */
  function cenaSenta(p, prox) {
    var comCad = p.ags.filter(function (a) { return a.cadeiras > 0; });
    var blocos = comCad.map(function (a, i) {
      var nomes = (p.candPorAg[a.id] || []).filter(function (c) { return p.eleitosN[String(c.n)]; })
        .map(function (c, j) { return '<span class="chip dentro" style="--c:' + a.cor + ';animation-delay:' + (i * 150 + j * 60) + 'ms">' + esc(c.urna || c.nome) + '</span>'; }).join('');
      return '<div class="senta-ag" style="--c:' + a.cor + '"><div class="cab"><span>' + esc(a.sigla) + '</span><span>' + a.cadeiras + '</span></div><div class="nomes">' + nomes + '</div></div>';
    }).join('');
    palco('<div class="cena-titulo">5 · Quem senta na cadeira</div><div class="senta-grade">' + blocos + '</div>');
    var t = 'Dentro de cada agremiação, as cadeiras vão para os mais votados da lista. <b>A cadeira é da agremiação, não do candidato.</b>';
    if (p.puxador) t += ' Os <b>' + f0(p.puxador.votos) + '</b> votos de <b>' + esc(p.puxador.urna || p.puxador.nome) + '</b> passam de um quociente: o que excede ajuda a eleger colegas da mesma lista.';
    legenda(t);
    var ms1 = 7500 + comCad.length * 150; tempo(ms1);
    depois(ms1, function () { porque(p, prox); });
  }
  function porque(p, prox) {
    if (!p.porque) { final(p, prox); return; }
    var f = p.porque.fora, d = p.porque.dentro, max = Math.max(f.votos, d.votos) || 1;
    var agF = p.agPorId[String(f.agremiacaoId)] || {}, agD = p.agPorId[String(d.agremiacaoId)] || {};
    function card(c, ag, cls, rot) {
      return '<div class="porque__c ' + cls + '"><div class="rot">' + rot + '</div><div class="nome">' + esc(c.urna || c.nome) + '</div>' +
        '<div class="sig">' + esc(c.sigla) + '</div><div class="v" data-v="' + cls + '">0</div>' +
        '<div class="porque__barra"><div data-w="' + (c.votos / max * 100) + '"></div></div>' +
        '<div class="ag">a agremiação (' + esc(ag.sigla || '—') + ') fez ' + f0(ag.votos) + ' votos e ' + (ag.cadeiras || 0) + ' cadeira' + ((ag.cadeiras || 0) === 1 ? '' : 's') + '</div></div>';
    }
    palco('<div class="cena-titulo">Por que muito voto pode ficar fora</div><div class="porque">' +
      card(f, agF, 'fora', 'fica fora') + card(d, agD, 'dentro', 'entra') + '</div>');
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      Array.prototype.forEach.call(el.cena.querySelectorAll('.porque__barra div'), function (b) { b.style.width = b.dataset.w + '%'; });
    }); });
    conta(el.cena.querySelector('[data-v="fora"]'), f.votos, f0, 1200);
    conta(el.cena.querySelector('[data-v="dentro"]'), d.votos, f0, 1200);
    legenda('<b>' + esc(f.urna || f.nome) + '</b> teve ' + f0(f.votos) + ' votos e ficaria fora; <b>' + esc(d.urna || d.nome) + '</b>, com ' + f0(d.votos) +
      ', entraria. O que elege é a soma da lista e da legenda: a agremiação de ' + esc(d.urna || d.nome) + ' juntou votos para mais uma cadeira; a de ' + esc(f.urna || f.nome) + ((agF.cadeiras || 0) === 0 ? ' não fez nenhuma.' : ' não juntou para mais uma.'));
    var ms = 9000; tempo(ms); depois(ms, function () { final(p, prox); });
  }
  function final(p, prox) {
    var comCad = p.ags.filter(function (a) { return a.cadeiras > 0; });
    var chips = comCad.map(function (a, i) {
      return '<span class="final-ag fade" style="--c:' + a.cor + ';animation-delay:' + (i * 90) + 'ms"><i></i>' + esc(a.sigla) + ' <b>' + a.cadeiras + '</b></span>';
    }).join('');
    palco('<div class="cena-titulo">' + (p.exemplo ? 'No exemplo' : p.final ? 'O resultado final' : 'Se a apuração terminasse agora') + '</div>' +
      '<div class="conta"><div><span class="n res">' + p.vagas + '</span><span class="rot">cadeiras</span></div></div><div class="final-linha">' + chips + '</div>');
    legenda(p.exemplo
      ? 'No exemplo: quociente eleitoral de <b>' + f0(p.qe) + '</b> votos; <b>' + p.somaQP + '</b> cadeiras pelo quociente e <b>' + p.restam + '</b> pelas sobras. Com a apuração, esta conta é refeita com os números reais a cada atualização.'
      : p.final ? 'O resultado final: quociente eleitoral de <b>' + f0(p.qe) + '</b> votos, <b>' + p.somaQP + '</b> cadeiras pelo quociente e <b>' + p.restam + '</b> pelas sobras.'
      : 'Se a apuração terminasse agora: quociente eleitoral de <b>' + f0(p.qe) + '</b> votos, <b>' + p.somaQP + '</b> cadeiras pelo quociente e <b>' + p.restam + '</b> pelas sobras. A conta é refeita a cada atualização do TSE.');
    tempo(5000); depois(5000, prox);
  }

  /* ================= API ================= */
  function assina(d) {
    if (!d) return '';
    if (d.exemplo) return 'exemplo';
    var c = d.cad || {};
    return [d.cargo, c.qe, (c.eleitos || []).map(function (e) { return e.n; }).join(','), d.lido && d.lido.votos && d.lido.votos.validos].join('|');
  }
  function atualiza(d, forca) {
    if (!d) {
      var M = window.SWMMotor, lido = exemploLido();
      d = { exemplo: true, lido: lido, cad: M.cadeiras(lido, M.REGRA_2026), cargo: 'Exemplo' };
    }
    var a = assina(d);
    if (!forca && a === assinatura) return;
    assinatura = a;
    if (tocando && !forca) { pendente = d; return; }
    atual = d; pendente = null;
    if (visivel || forca) toca(0); else { sujo = true; quadroParado(); }
  }
  function inicia() {
    el = {
      cena: $('cena'), legenda: $('legendaCena'), tempo: $('tempoCena'), nav: $('passosNav'),
      rever: $('btnRever'), selo: $('seloExemplo'), sub: $('explicaSub'), box: $('explica')
    };
    el.rever.addEventListener('click', function () { if (pendente) { atual = pendente; pendente = null; } toca(0); });
    el.nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !atual) return;
      para(); if (!P) P = prepara(atual); tocando = true; roda(+b.dataset.cena);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (x) { visivel = x.isIntersecting; if (visivel && sujo && atual && !tocando) toca(0); });
      }, { threshold: 0.25 }).observe(el.box);
    } else visivel = true;
  }
  window.SWMAnim = { inicia: inicia, atualiza: atualiza, rever: function () { toca(0); }, _prepara: prepara, _exemplo: exemploLido };
})();
