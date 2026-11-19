/*!
 * mod_partidos/partidos.js — "A batalha das cadeiras é interna" (04/10/2026)
 * Escuta 'swm:dados' (k = 'dist' | 'fed') e 'swm:busca'; desenha em #mod-partidos (cria no fim do <main> se não existir).
 * Sem dependência além do window.SWMMotor (para a conta dos "faltam N votos"). Só usa variáveis de cor da página.
 *
 * A regra do "definido" (a mesma do LEIA-ME e do popup do selo):
 *   TETO = votos que ainda podem entrar = eleitores aptos das seções não totalizadas.
 *     No arquivo do TSE é o e.esnt; o evento só traz o lido, e no lido ele é eleitorado − comparecimento − abstenção
 *     (e.te − e.c − e.a, porque e.te = e.est + e.esnt e e.est = e.c + e.a). Se o detail trouxer o json cru, as duas contas
 *     têm de bater. Se não baterem, ou se o teto contrariar as seções (faltam seções e o teto é 0; ou nenhuma falta e o
 *     teto não é 0), o teto é desconhecido e NADA é marcado como definido.
 *   POSIÇÃO de um candidato na lista da agremiação: definida se a distância para o de cima E para o de baixo for maior
 *     que o teto (ninguém de baixo alcança; ele não alcança o de cima). Teto 0 = tudo definido.
 *   CADEIRAS da agremiação: sem prova exata com voto por entrar (os votos novos mexem no QE, nos cortes de 80% e 20% e
 *     em todas as médias ao mesmo tempo) -> "em aberto" até o teto ser 0.
 *   MAJORITÁRIO (só a função SWMPartidos.provaOrdem; este módulo não desenha o majoritário): a posição está definida
 *     quando a diferença para o vizinho é maior que o teto.
 */
(function () {
  'use strict';

  var CASAS = {
    dist: { nome: 'Distrital', vagas: 24, cd: '8', casa: 'Câmara Legislativa do DF' },
    fed: { nome: 'Federal', vagas: 8, cd: '6', casa: 'deputados federais pelo DF' }
  };
  var CD_K = { '8': 'dist', '6': 'fed' };
  var SUPL_INI = 5; // suplentes mostrados de saída; "ver mais" abre de 5 em 5

  var ultimo = {};            // k -> último detail
  var faltamCache = {};       // k -> { chave, porAg: { id: {n, cand} | null } }
  var snapPos = {};           // 'k|agId' -> { n: índice } (para "sobe/desce")
  var snapCad = {};           // 'k|agId' -> cadeiras (para pulsar a mudança)
  var marcas = {};            // 'k|n' -> { tipo: 'sobe'|'desce'|'entrou'|'saiu', d: lugares, ate: ms }
  // site5 (05/10/2026): com o arquivo totalizado (tf = 's'), "se terminasse agora" vira "no resultado final"
  function sta() { var d = ultimo[st.casa], a = d && d.lido && d.lido.apuracao; return (a && a.totalizada === true) ? 'no resultado final' : 'se terminasse agora'; }
  var st = { casa: 'dist', ag: { dist: null, fed: null }, destaque: null, supl: {}, aberto: true };
  var raiz = null, pop = null;
  var calma = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- utilitários ----------
  function fmt(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var neg = n < 0, s = String(Math.round(Math.abs(n))), o = '';
    while (s.length > 3) { o = '.' + s.slice(-3) + o; s = s.slice(0, -3); }
    return (neg ? '−' : '') + s + o;
  }
  function esc(t) { return String(t === null || t === undefined ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function semAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function plural(n, um, varios) { return n === 1 ? um : varios; }
  function porVotos(a, b) { // o mesmo critério do motor: mais votos; empate: mais idoso; depois número
    if (b.votos !== a.votos) return b.votos - a.votos;
    var na = a.nascimento, nb = b.nascimento;
    if (na !== null && na !== undefined && nb !== null && nb !== undefined && na !== nb) return na - nb;
    return String(a.n).localeCompare(String(b.n));
  }
  function int(x) { if (x === undefined || x === null || x === '') return null; var n = Number(String(x).replace(',', '.')); return isFinite(n) ? Math.round(n) : null; }

  // ---------- o teto ----------
  function teto(detail) {
    var r = { valor: null, secoesFaltam: null, secoesTotais: null, fonte: null, motivo: null };
    var l = detail && detail.lido;
    if (!l || !l.apuracao || !l.votos) { r.motivo = 'sem arquivo lido'; return r; }
    var a = l.apuracao, v = l.votos;
    if (a.secoesTotais === null || a.secoesApuradas === null || a.secoesTotais === undefined || a.secoesApuradas === undefined) { r.motivo = 'o arquivo não traz o número de seções'; return r; }
    r.secoesTotais = a.secoesTotais;
    r.secoesFaltam = a.secoesTotais - a.secoesApuradas;
    var porLido = (v.eleitorado !== null && v.comparecimento !== null && v.abstencao !== null &&
      v.eleitorado !== undefined && v.comparecimento !== undefined && v.abstencao !== undefined) ? v.eleitorado - v.comparecimento - v.abstencao : null;
    var porCru = null, e = detail.json && detail.json.e;
    if (e) {
      var te = int(e.te), est = int(e.est), esnt = int(e.esnt);
      if (te !== null && est !== null && esnt !== null) {
        if (te !== est + esnt) { r.motivo = 'no arquivo, eleitorado (' + fmt(te) + ') ≠ seções apuradas (' + fmt(est) + ') + não apuradas (' + fmt(esnt) + ')'; return r; }
        porCru = esnt;
      }
    }
    if (porCru !== null && porLido !== null && porCru !== porLido) {
      r.motivo = 'as duas contas do teto não batem: eleitores das seções não apuradas ' + fmt(porCru) + ' × eleitorado − comparecimento − abstenção ' + fmt(porLido);
      return r;
    }
    var t = porCru !== null ? porCru : porLido;
    if (t === null) { r.motivo = 'o arquivo não traz eleitorado, comparecimento e abstenção'; return r; }
    if (t < 0) { r.motivo = 'a conta do teto deu negativa (' + fmt(t) + ')'; return r; }
    if (r.secoesFaltam < 0) { r.motivo = 'mais seções apuradas que o total'; return r; }
    if (r.secoesFaltam === 0 && t !== 0) { r.motivo = 'todas as seções apuradas, mas a conta ainda dá ' + fmt(t) + ' eleitores por entrar'; return r; }
    if (r.secoesFaltam > 0 && t === 0) { r.motivo = 'faltam ' + fmt(r.secoesFaltam) + ' seções, mas a conta do teto deu 0'; return r; }
    r.valor = t;
    r.fonte = porCru !== null ? 'e.esnt (conferido com eleitorado − comparecimento − abstenção)' : 'eleitorado − comparecimento − abstenção';
    return r;
  }

  // posição k de uma lista ordenada (maior primeiro): definida se as duas distâncias forem > teto
  function provaOrdem(votos, tetoValor) {
    return votos.map(function (v, i) {
      var cima = i > 0 ? votos[i - 1] - v : null, baixo = i < votos.length - 1 ? v - votos[i + 1] : null, def;
      if (tetoValor === null || tetoValor === undefined) def = false;
      else if (tetoValor === 0) def = true;
      else def = (cima === null || cima > tetoValor) && (baixo === null || baixo > tetoValor);
      return { definida: def, difCima: cima, difBaixo: baixo };
    });
  }

  // ---------- o modelo de uma casa ----------
  function modelo(k) {
    var d = ultimo[k];
    if (!d || !d.lido) return null;
    var l = d.lido, c = d.cad, T = teto(d);
    var temVoto = !!(c && !c.aguardando && l.votos && l.votos.validos > 0);
    var eleitos = {}; ((c && c.eleitos) || []).forEach(function (e) { eleitos[String(e.n)] = e; });
    var porAg = {}, fora = {};
    l.candidatos.forEach(function (x) {
      var id = String(x.agremiacaoId);
      if (!x.elegivel) { fora[id] = (fora[id] || 0) + 1; return; }
      (porAg[id] = porAg[id] || []).push(x);
    });
    var cadAg = {}; ((c && c.agremiacoes) || []).forEach(function (a) { cadAg[String(a.id)] = a; });
    var ags = l.agremiacoes.map(function (a) {
      var id = String(a.id), ca = cadAg[id] || { cadeiras: 0, cadeirasQP: 0, cadeirasMedia: 0, qp: 0 };
      var lista = (porAg[id] || []).slice().sort(porVotos);
      var prova = provaOrdem(lista.map(function (x) { return x.votos; }), temVoto ? T.valor : null);
      var linhas = lista.map(function (x, i) {
        var e = eleitos[String(x.n)];
        return { x: x, i: i, dentro: !!e, como: e ? e.como : null, difCima: prova[i].difCima, difBaixo: prova[i].difBaixo, definida: prova[i].definida };
      });
      var nDentro = 0; linhas.forEach(function (r) { if (r.dentro) nDentro++; });
      return {
        id: id, sigla: a.sigla || a.nome || id, nome: a.nome, tipo: a.tipo, partidos: a.partidos || [], votos: a.votos || 0,
        cadeiras: ca.cadeiras || 0, cadeirasQP: ca.cadeirasQP || 0, cadeirasMedia: ca.cadeirasMedia || 0,
        linhas: linhas, nDentro: nDentro, foraDaLista: fora[id] || 0,
        cadDefinidas: temVoto && T.valor === 0
      };
    });
    ags.sort(function (a, b) { return (b.cadeiras - a.cadeiras) || (b.votos - a.votos) || String(a.sigla).localeCompare(String(b.sigla), 'pt-BR'); });
    return { k: k, d: d, l: l, c: c, T: T, temVoto: temVoto, ags: ags, qe: c ? c.qe : null };
  }

  // ---------- "faltam N votos" (conta do motor, conferida em N e N−1) ----------
  function comMais(l, agId, cn, x) {
    var ags = l.agremiacoes.map(function (a) { return String(a.id) === agId ? Object.assign({}, a, { votos: a.votos + x }) : a; });
    var cands = l.candidatos.map(function (c) { return (String(c.n) === String(cn) && String(c.agremiacaoId) === agId) ? Object.assign({}, c, { votos: c.votos + x }) : c; });
    return Object.assign({}, l, { agremiacoes: ags, candidatos: cands, votos: Object.assign({}, l.votos, { validos: (l.votos.validos || 0) + x }) });
  }
  function cadeirasCom(M, l, agId, cn, x) {
    var c = M.cadeiras(comMais(l, agId, cn, x), M.REGRA_2026), r = 0;
    c.agremiacoes.forEach(function (a) { if (String(a.id) === agId) r = a.cadeiras; });
    return r;
  }
  function faltamPara(M, l, ag, cand, qe) {
    if (!cand) return null;
    var alvo = ag.cadeiras + 1, limite = Math.max(1000, (l.votos.validos || 0) * 2), hi = Math.max(1, Math.round((qe || 1000) / 20)), lo = 0;
    while (cadeirasCom(M, l, ag.id, cand.n, hi) < alvo) { lo = hi; hi *= 2; if (hi > limite) return null; }
    while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (cadeirasCom(M, l, ag.id, cand.n, mid) >= alvo) hi = mid; else lo = mid; }
    // conferência explícita: com N dá, com N−1 não dá
    if (cadeirasCom(M, l, ag.id, cand.n, hi) < alvo) return null;
    if (cadeirasCom(M, l, ag.id, cand.n, hi - 1) >= alvo) return null;
    return hi;
  }
  function calculaFaltam(k, m) {
    var M = window.SWMMotor;
    var chave = m.d.recebidoEm + '|' + m.d.horaTSE;
    if (faltamCache[k] && faltamCache[k].chave === chave) return false;
    var porAg = {};
    if (M && M.cadeiras && m.temVoto) {
      m.ags.forEach(function (ag) {
        if (!ag.votos) { porAg[ag.id] = null; return; }
        var prim = null; ag.linhas.some(function (r) { if (!r.dentro) { prim = r.x; return true; } return false; });
        var n = null;
        try { n = faltamPara(M, m.l, ag, prim, m.qe); } catch (e) { n = null; }
        porAg[ag.id] = n === null ? null : { n: n, cand: prim };
      });
    }
    faltamCache[k] = { chave: chave, porAg: porAg };
    return true;
  }

  // ---------- desenho ----------
  function conteiner() {
    var el = document.getElementById('mod-partidos');
    if (!el) {
      el = document.createElement('section');
      el.id = 'mod-partidos';
      var main = document.querySelector('main') || document.body;
      main.appendChild(el);
    }
    return el;
  }
  function esqueleto() {
    raiz = conteiner();
    raiz.classList.add('mp');
    raiz.setAttribute('aria-labelledby', 'mpTitulo');
    raiz.innerHTML =
      '<header class="mp__cab">' +
        '<div><h2 class="mp__titulo" id="mpTitulo">A batalha das cadeiras é interna</h2>' +
        '<p class="mp__sub" id="mpSub">Cada agremiação preenche as cadeiras que conquista com a própria lista, do mais votado para baixo. Se a apuração terminasse agora:</p></div>' +
        '<div class="mp__abas" role="tablist" aria-label="Casa">' +
          '<button role="tab" data-casa="dist" aria-selected="true">Distrital <small>24</small></button>' +
          '<button role="tab" data-casa="fed" aria-selected="false">Federal <small>8</small></button>' +
        '</div>' +
      '</header>' +
      '<div class="mp__teto" id="mpTeto" aria-live="polite"></div>' +
      '<div class="mp__busca">' +
        '<label class="mp__rot" for="mpBusca">Ver meu candidato</label>' +
        '<input type="search" id="mpBusca" placeholder="Nome de urna ou número" autocomplete="off">' +
        '<ul class="mp__res" id="mpRes" hidden></ul>' +
      '</div>' +
      '<div class="mp__corpo">' +
        '<div class="mp__col-lista">' +
          '<h3 class="mp__h3">A disputa entre agremiações</h3>' +
          '<p class="mp__nota">As cadeiras de cada agremiação e os votos que faltam para a próxima, pela conta do motor. Toque numa agremiação para ver a lista dela.</p>' +
          '<ol class="mp__ags" id="mpAgs"></ol>' +
        '</div>' +
        '<div class="mp__col-painel" id="mpColPainel"></div>' +
      '</div>' +
      '<p class="mp__rodape" id="mpRodape">Se terminasse agora: a parcial não é resultado. Fonte: TSE; a conta das cadeiras é a do motor (regra de 2024). O resultado oficial é o do TSE.</p>';
    pop = document.createElement('div');
    pop.className = 'mp-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false');
    pop.innerHTML = '<div class="mp-pop__caixa"><button class="mp-pop__x" type="button" aria-label="Fechar">×</button><div class="mp-pop__txt"></div></div>';
    document.body.appendChild(pop);
    pop.addEventListener('click', function (ev) { if (ev.target === pop || ev.target.classList.contains('mp-pop__x')) fechaPop(); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fechaPop(); });

    raiz.querySelector('.mp__abas').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-casa]'); if (!b) return;
      trocaCasa(b.getAttribute('data-casa'));
    });
    raiz.addEventListener('click', function (ev) {
      var s = ev.target.closest('[data-pop]');
      if (s) { ev.preventDefault(); abrePop(s.getAttribute('data-pop'), s.getAttribute('data-arg')); return; }
      var ag = ev.target.closest('[data-ag]');
      if (ag) { var id = ag.getAttribute('data-ag'); st.ag[st.casa] = (st.ag[st.casa] === id && !largo()) ? '__fechado' : id; desenha(); return; }
      var mais = ev.target.closest('[data-mais]');
      if (mais) { var ch = st.casa + '|' + mais.getAttribute('data-mais'); st.supl[ch] = (st.supl[ch] || SUPL_INI) + 5; desenha(); }
    });
    var inp = raiz.querySelector('#mpBusca'), tm = null;
    inp.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(mostraBusca, 120); });
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { var f = raiz.querySelector('#mpRes li[data-chave]'); if (f) escolhe(f.getAttribute('data-chave'), true); } });
    raiz.querySelector('#mpRes').addEventListener('click', function (ev) { var li = ev.target.closest('li[data-chave]'); if (li) escolhe(li.getAttribute('data-chave'), true); });
    var mq = window.matchMedia ? window.matchMedia('(min-width: 960px)') : null;
    if (mq) { var f = function () { desenha(); }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }
  }
  function largo() { return !!(window.matchMedia && window.matchMedia('(min-width: 960px)').matches); }

  function trocaCasa(k) {
    if (!CASAS[k]) return;
    st.casa = k;
    Array.prototype.forEach.call(raiz.querySelectorAll('.mp__abas button'), function (b) { b.setAttribute('aria-selected', b.getAttribute('data-casa') === k ? 'true' : 'false'); });
    desenha();
  }

  function seloTeto(m) {
    var T = m.T, box = raiz.querySelector('#mpTeto');
    var h;
    if (!m.temVoto) {
      h = '<span class="mp__teto-ic" aria-hidden="true">⏳</span><span>Aguardando os primeiros votos apurados de ' + esc(CASAS[m.k].nome.toLowerCase()) + '. ' +
        (T.valor !== null ? 'Até ' + fmt(T.valor) + ' eleitores aptos podem votar.' : '') + '</span>';
    } else if (T.valor === null) {
      h = '<span class="mp__teto-ic" aria-hidden="true">?</span><span><b>Teto desconhecido</b> (' + esc(T.motivo) + '). Sem teto, nada aparece como definido.</span>' +
        '<button class="mp-selo mp-selo--aberto" data-pop="teto" type="button">por quê?</button>';
    } else if (T.valor === 0) {
      h = '<span class="mp__teto-ic mp__teto-ic--ok" aria-hidden="true">✓</span><span><b>Todas as seções apuradas:</b> nenhum voto por entrar. Pela conta, tudo abaixo está definido. O resultado oficial é o do TSE.</span>' +
        '<button class="mp-selo mp-selo--def" data-pop="teto" type="button">a regra</button>';
    } else {
      h = '<span class="mp__teto-ic" aria-hidden="true">↧</span><span>Ainda podem entrar até <b class="num" data-conta="teto">' + fmt(T.valor) + '</b> votos: os eleitores aptos das <b class="num">' + fmt(T.secoesFaltam) + '</b> ' + plural(T.secoesFaltam, 'seção não apurada', 'seções não apuradas') + '. Só está “definido” o que esse teto não muda.</span>' +
        '<button class="mp-selo mp-selo--aberto" data-pop="teto" type="button">a regra</button>';
    }
    box.innerHTML = h;
  }

  function pips(n, total) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<i class="mp-pip"></i>';
    return '<span class="mp-pips" aria-hidden="true">' + s + '</span>';
  }

  function linhaAg(m, ag, sel, F) {
    var f = F ? F[ag.id] : undefined, key = m.k + '|' + ag.id;
    var mudou = snapCad[key] !== undefined && snapCad[key] !== ag.cadeiras ? (ag.cadeiras > snapCad[key] ? ' mp-ag--ganhou' : ' mp-ag--perdeu') : '';
    var falta;
    if (!m.temVoto) falta = '<span class="mp-ag__falta">—</span>';
    else if (m.T.valor === 0) falta = '<span class="mp-ag__falta">apuração encerrada</span>';
    else if (f === undefined) falta = '<span class="mp-ag__falta mp-ag__falta--calc">calculando…</span>';
    else if (f === null) falta = '<span class="mp-ag__falta">próxima cadeira: —</span>';
    else falta = '<span class="mp-ag__falta">faltam <b class="num">' + fmt(f.n) + '</b> para a ' + (ag.cadeiras + 1) + 'ª <button class="mp-i" type="button" data-pop="falta" data-arg="' + esc(ag.id) + '" aria-label="Como a conta é feita">i</button></span>';
    return '<li class="mp-ag' + (sel ? ' mp-ag--sel' : '') + mudou + '" data-key="ag-' + esc(key) + '">' +
      '<button class="mp-ag__bt" type="button" data-ag="' + esc(ag.id) + '" aria-expanded="' + (sel ? 'true' : 'false') + '">' +
        '<span class="mp-ag__cad num">' + ag.cadeiras + '</span>' +
        '<span class="mp-ag__nome"><b>' + esc(ag.sigla) + '</b>' + (ag.nome && ag.nome !== ag.sigla && ag.tipo === 'federacao' ? '<small>' + esc(ag.nome) + '</small>' : '') + pips(ag.cadeiras) + '</span>' +
        '<span class="mp-ag__votos"><b class="num">' + fmt(ag.votos) + '</b><small>votos</small></span>' +
        '<span class="mp-ag__seta" aria-hidden="true">›</span>' +
      '</button>' + falta +
    '</li>';
  }

  function linhaCand(m, ag, r, rotulo) {
    var x = r.x, key = m.k + '|' + x.n, mk = marcas[key], agora = Date.now();
    var cls = 'mp-c' + (r.dentro ? ' mp-c--dentro' : ' mp-c--fora');
    if (st.destaque && st.destaque === m.k + '|' + x.n) cls += ' mp-c--meu';
    var marca = '';
    if (mk && mk.ate > agora) {
      cls += ' mp-c--' + mk.tipo;
      marca = mk.tipo === 'sobe' ? '<span class="mp-c__mv mp-c__mv--sobe">▲' + mk.d + '</span>' :
        mk.tipo === 'desce' ? '<span class="mp-c__mv mp-c__mv--desce">▼' + mk.d + '</span>' :
        mk.tipo === 'entrou' ? '<span class="mp-c__mv mp-c__mv--sobe">entrou</span>' : '<span class="mp-c__mv mp-c__mv--desce">saiu</span>';
    }
    var como = r.dentro ? (r.como === 'QP' ? 'QP' : (r.como === 'media' ? 'média' : esc(r.como || ''))) : '';
    var dist = '';
    if (m.temVoto && r.difCima !== null) dist = '<small class="mp-c__dif">' + fmt(r.difCima) + ' atrás de ' + esc(ag.linhas[r.i - 1].x.urna) + '</small>';
    else if (m.temVoto && r.i === 0) dist = '<small class="mp-c__dif">o mais votado da lista</small>';
    var selo = '';
    if (m.temVoto) selo = r.definida
      ? '<button class="mp-selo mp-selo--def" type="button" data-pop="pos" data-arg="' + esc(ag.id + '|' + x.n) + '">posição definida</button>'
      : '<button class="mp-selo mp-selo--aberto" type="button" data-pop="pos" data-arg="' + esc(ag.id + '|' + x.n) + '">em aberto</button>';
    return '<li class="' + cls + '" data-key="c-' + esc(key) + '" id="mp-c-' + esc(m.k + '-' + x.n) + '">' +
      '<span class="mp-c__pos num">' + (r.i + 1) + 'º</span>' +
      '<span class="mp-c__nome"><b>' + esc(x.urna || x.nome) + '</b>' + marca +
        '<small>' + esc(x.n) + ' · ' + esc(x.sigla || '') + (como ? ' · ' + como : '') + (rotulo ? ' · <em>' + rotulo + '</em>' : '') + '</small></span>' +
      '<span class="mp-c__votos"><b class="num" data-v="' + x.votos + '">' + fmt(x.votos) + '</b>' + dist + selo + '</span>' +
    '</li>';
  }

  function painel(m, ag) {
    var F = faltamCache[m.k] && faltamCache[m.k].porAg, f = F ? F[ag.id] : undefined;
    var dentro = ag.linhas.filter(function (r) { return r.dentro; });
    var fora = ag.linhas.filter(function (r) { return !r.dentro; });
    var ch = m.k + '|' + ag.id, nSup = st.supl[ch] || SUPL_INI;
    // se o destaque for um suplente mais abaixo, abre até ele
    if (st.destaque) fora.forEach(function (r, i) { if (st.destaque === m.k + '|' + r.x.n && i >= nSup) nSup = st.supl[ch] = i + 1; });
    var sup = fora.slice(0, nSup);
    var h = '<div class="mp-p" data-key="p-' + esc(ch) + '">';
    h += '<header class="mp-p__cab"><div><h4>' + esc(ag.sigla) + '</h4>' +
      '<small>' + (ag.tipo === 'federacao' ? 'Federação' + (ag.nome ? ' · ' + esc(ag.nome) : '') : (ag.tipo === 'isolado' ? 'Partido isolado' : esc(ag.tipo || ''))) +
      ' · ' + fmt(ag.votos) + ' votos</small></div>' +
      '<div class="mp-p__cad"><span class="num">' + ag.cadeiras + '</span><small>' + plural(ag.cadeiras, 'cadeira', 'cadeiras') + (ag.cadeiras ? ' (' + ag.cadeirasQP + ' QP, ' + ag.cadeirasMedia + ' média)' : '') + '</small>' +
      (m.temVoto ? (ag.cadDefinidas ? '<button class="mp-selo mp-selo--def" type="button" data-pop="cad" data-arg="' + esc(ag.id) + '">definidas</button>'
        : '<button class="mp-selo mp-selo--aberto" type="button" data-pop="cad" data-arg="' + esc(ag.id) + '">em aberto</button>') : '') +
      '</div></header>';
    if (!m.temVoto) {
      h += '<p class="mp-p__vazio">Aguardando os primeiros votos apurados. A lista aparece com a contagem.</p></div>';
      return h;
    }
    h += '<ol class="mp-lista">';
    if (!dentro.length) h += '<li class="mp-vazio">Nenhuma cadeira ' + sta() + '.</li>';
    dentro.forEach(function (r, i) { h += linhaCand(m, ag, r, i === dentro.length - 1 ? 'último a entrar' : ''); });
    // a linha de corte
    var ult = dentro[dentro.length - 1], prim = fora[0];
    h += '<li class="mp-corte" aria-label="A linha de corte"><span>a linha de corte</span>' +
      (ult && prim ? '<b class="num">' + fmt(ult.x.votos - prim.x.votos) + '</b> ' + plural(ult.x.votos - prim.x.votos, 'voto', 'votos') + ' entre ' + esc(ult.x.urna) + ' e ' + esc(prim.x.urna) : '') + '</li>';
    if (!fora.length) h += '<li class="mp-vazio">Não há mais candidatos na lista.</li>';
    sup.forEach(function (r, i) { h += linhaCand(m, ag, r, i === 0 ? '1º suplente' : (i + 1) + 'º suplente'); });
    h += '</ol>';
    if (fora.length > sup.length) h += '<button class="mp-mais" type="button" data-mais="' + esc(ag.id) + '">ver mais suplentes (' + (fora.length - sup.length) + ')</button>';
    if (f && m.T.valor !== 0) h += '<p class="mp-p__falta">Com mais <b class="num">' + fmt(f.n) + '</b> votos para ' + esc(f.cand.urna) + ' (os outros parados), ' + esc(ag.sigla) + ' faria a ' + (ag.cadeiras + 1) + 'ª cadeira e ' + esc(f.cand.urna) + ' entraria. <button class="mp-i" type="button" data-pop="falta" data-arg="' + esc(ag.id) + '" aria-label="Como a conta é feita">i</button></p>';
    if (ag.foraDaLista) h += '<p class="mp-p__nota">' + ag.foraDaLista + ' ' + plural(ag.foraDaLista, 'candidato com voto que não elege (anulado ou só para a legenda) fica', 'candidatos com voto que não elege (anulado ou só para a legenda) ficam') + ' fora da lista.</p>';
    h += '</div>';
    return h;
  }

  // FLIP: guarda as posições antes de redesenhar e anima a diferença depois
  function posicoes() {
    var p = {};
    if (!raiz) return p;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-key]'), function (el) { p[el.getAttribute('data-key')] = el.getBoundingClientRect().top; });
    return p;
  }
  function flip(antes, votosAntes) {
    if (calma) return;
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-key]'), function (el) {
      var k = el.getAttribute('data-key');
      if (antes[k] === undefined) return;
      var dy = antes[k] - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1 || Math.abs(dy) > 1600) return;
      el.style.transform = 'translateY(' + dy + 'px)'; el.style.transition = 'none';
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; }); });
    });
    // números que contam
    Array.prototype.forEach.call(raiz.querySelectorAll('b[data-v]'), function (el) {
      var li = el.closest('[data-key]'), k = li && li.getAttribute('data-key'), de = votosAntes[k], para = Number(el.getAttribute('data-v'));
      if (de === undefined || de === para) return;
      var t0 = null;
      function passo(t) { if (!t0) t0 = t; var p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(de + (para - de) * e); if (p < 1) requestAnimationFrame(passo); }
      requestAnimationFrame(passo);
    });
  }
  function votosNaTela() {
    var v = {};
    if (!raiz) return v;
    Array.prototype.forEach.call(raiz.querySelectorAll('b[data-v]'), function (el) { var li = el.closest('[data-key]'); if (li) v[li.getAttribute('data-key')] = Number(el.getAttribute('data-v')); });
    return v;
  }

  // compara as listas com a atualização anterior: quem sobe, quem desce, quem cruza a linha
  function marcaMudancas(m) {
    var agora = Date.now();
    m.ags.forEach(function (ag) {
      var key = m.k + '|' + ag.id, ant = snapPos[key], novo = {};
      ag.linhas.forEach(function (r) { novo[String(r.x.n)] = { i: r.i, dentro: r.dentro }; });
      if (ant && m.temVoto) {
        ag.linhas.forEach(function (r) {
          var a = ant[String(r.x.n)]; if (!a) return;
          var mk = m.k + '|' + r.x.n;
          if (a.dentro !== r.dentro) marcas[mk] = { tipo: r.dentro ? 'entrou' : 'saiu', d: 0, ate: agora + 9000 };
          else if (a.i > r.i) marcas[mk] = { tipo: 'sobe', d: a.i - r.i, ate: agora + 6000 };
          else if (a.i < r.i) marcas[mk] = { tipo: 'desce', d: r.i - a.i, ate: agora + 6000 };
        });
      }
      snapPos[key] = novo;
    });
  }

  var agendado = null;
  function desenha() {
    var fimMp = sta() === 'no resultado final', es = document.getElementById('mpSub'), er = document.getElementById('mpRodape');
    if (es) es.textContent = 'Cada agremiação preenche as cadeiras que conquista com a própria lista, do mais votado para baixo. ' + (fimMp ? 'No resultado final:' : 'Se a apuração terminasse agora:');
    if (er) er.textContent = fimMp ? 'Resultado final: arquivo totalizado pelo TSE. A conta das cadeiras é a do motor (regra de 2024), igual aos eleitos do TSE. O resultado oficial é o do TSE.'
                                   : 'Se terminasse agora: a parcial não é resultado. Fonte: TSE; a conta das cadeiras é a do motor (regra de 2024). O resultado oficial é o do TSE.';
    if (!raiz) esqueleto();
    var k = st.casa, m = modelo(k);
    var lista = raiz.querySelector('#mpAgs'), col = raiz.querySelector('#mpColPainel');
    if (!m) {
      raiz.querySelector('#mpTeto').innerHTML = '<span>Esperando o arquivo do TSE de ' + esc(CASAS[k].nome.toLowerCase()) + '…</span>';
      lista.innerHTML = ''; col.innerHTML = '';
      return;
    }
    var antes = posicoes(), vAntes = votosNaTela();
    seloTeto(m);
    if (!st.ag[k] || (st.ag[k] !== '__fechado' && !m.ags.some(function (a) { return a.id === st.ag[k]; }))) st.ag[k] = m.ags.length ? m.ags[0].id : null;
    var sel = st.ag[k], F = faltamCache[k] && faltamCache[k].chave === (m.d.recebidoEm + '|' + m.d.horaTSE) ? faltamCache[k].porAg : null;
    var visiveis = m.ags.filter(function (a) { return a.votos > 0 || a.id === sel || !m.temVoto; });
    var h = '';
    visiveis.forEach(function (ag) { h += linhaAg(m, ag, ag.id === sel, F); });
    var semVoto = m.ags.length - visiveis.length;
    lista.innerHTML = h + (semVoto ? '<li class="mp-vazio">' + semVoto + ' ' + plural(semVoto, 'agremiação ainda sem voto', 'agremiações ainda sem voto') + '.</li>' : '');
    var agSel = null; m.ags.forEach(function (a) { if (a.id === sel) agSel = a; });
    var ph = agSel ? painel(m, agSel) : '';
    if (largo()) { col.innerHTML = ph || '<p class="mp-p__vazio">Escolha uma agremiação.</p>'; }
    else {
      col.innerHTML = '';
      if (agSel) {
        var li = lista.querySelector('.mp-ag--sel');
        if (li) { var div = document.createElement('div'); div.className = 'mp-ag__painel'; div.innerHTML = ph; li.appendChild(div); }
      }
    }
    m.ags.forEach(function (ag) { snapCad[m.k + '|' + ag.id] = ag.cadeiras; });
    flip(antes, vAntes);
    // a conta dos "faltam" fica para depois do desenho (é pesada)
    if (m.temVoto && m.T.valor !== 0 && (!F)) {
      clearTimeout(agendado);
      agendado = setTimeout(function () { try { if (calculaFaltam(k, m)) desenha(); } catch (e) { if (window.console) console.error(e); } }, 80);
    }
  }

  // ---------- popups ----------
  var REGRA = '<p><b>A regra do “definido”.</b> O teto é o número máximo de votos que ainda podem entrar: os eleitores aptos das seções que o TSE ainda não totalizou (no arquivo, eleitorado − comparecimento − abstenção das seções já apuradas). Ninguém vota duas vezes; então nenhum candidato ganha mais que o teto daqui para a frente.</p>' +
    '<p><b>Posição na lista:</b> definida quando a distância para o de cima e para o de baixo é maior que o teto. Assim ninguém de baixo o alcança e ele não alcança quem está acima.</p>' +
    '<p><b>Cadeiras da agremiação:</b> ficam em aberto enquanto houver voto por entrar. Os votos novos mudam o quociente eleitoral, os cortes de 80% e 20% e as médias de todas as agremiações ao mesmo tempo, e não há prova exata simples para isso. Com o teto em zero, tudo fica definido.</p>' +
    '<p><b>Majoritário:</b> definido quando a diferença é maior que o teto.</p>' +
    '<p class="mp-pop__peq">Vale para a contagem. Uma decisão da Justiça Eleitoral que anule votos ou mude a situação de um candidato reabre tudo. O resultado oficial é o do TSE.</p>';
  function abrePop(tipo, arg) {
    var m = modelo(st.casa); if (!m) return;
    var T = m.T, h = '';
    var tetoTxt = T.valor === null ? 'desconhecido (' + esc(T.motivo || '') + ')' : fmt(T.valor) + ' ' + plural(T.valor, 'voto', 'votos');
    if (tipo === 'teto') {
      h = '<h4>O teto de votos por entrar</h4><p>Agora: <b>' + tetoTxt + '</b>' + (T.secoesFaltam !== null ? ', com ' + fmt(T.secoesFaltam) + ' de ' + fmt(T.secoesTotais) + ' seções por apurar' : '') + '.' + (T.fonte ? ' Conta: ' + esc(T.fonte) + '.' : '') + '</p>' + REGRA;
    } else if (tipo === 'pos') {
      var p = String(arg).split('|'), ag = null, r = null;
      m.ags.forEach(function (a) { if (a.id === p[0]) ag = a; });
      if (ag) ag.linhas.forEach(function (x) { if (String(x.x.n) === p[1]) r = x; });
      if (!r) return;
      var nome = esc(r.x.urna), cima = r.i > 0 ? ag.linhas[r.i - 1].x : null, baixo = r.i < ag.linhas.length - 1 ? ag.linhas[r.i + 1].x : null;
      h = '<h4>' + nome + ': ' + (r.i + 1) + 'º na lista de ' + esc(ag.sigla) + '</h4>';
      h += '<p>Teto de votos por entrar: <b>' + tetoTxt + '</b>.</p><ul>';
      h += cima ? '<li>Para ' + esc(cima.urna) + ', acima: <b>' + fmt(r.difCima) + '</b> votos ' + (T.valor === null ? '' : (r.difCima > T.valor || T.valor === 0 ? '(maior que o teto: não alcança)' : '(não passa do teto: pode alcançar)')) + '</li>' : '<li>Ninguém acima: é o mais votado da lista.</li>';
      h += baixo ? '<li>Para ' + esc(baixo.urna) + ', abaixo: <b>' + fmt(r.difBaixo) + '</b> votos ' + (T.valor === null ? '' : (r.difBaixo > T.valor || T.valor === 0 ? '(maior que o teto: não é alcançado)' : '(não passa do teto: pode ser alcançado)')) + '</li>' : '<li>Ninguém abaixo na lista.</li>';
      h += '</ul><p><b>' + (r.definida ? 'Posição definida.' : 'Posição em aberto.') + '</b> ' + (r.dentro ? 'Hoje ele está dentro, mas a cadeira depende de quantas a agremiação faz, e isso ' + (ag.cadDefinidas ? 'já está definido.' : 'ainda está em aberto.') : 'Hoje ele está fora.') + '</p>' + REGRA;
    } else if (tipo === 'cad') {
      var a2 = null; m.ags.forEach(function (a) { if (a.id === arg) a2 = a; });
      if (!a2) return;
      h = '<h4>' + esc(a2.sigla) + ': ' + a2.cadeiras + ' ' + plural(a2.cadeiras, 'cadeira', 'cadeiras') + ' ' + sta() + '</h4><p><b>' + (a2.cadDefinidas ? 'Definidas: não há mais voto por entrar.' : 'Em aberto: ainda podem entrar ' + tetoTxt + '.') + '</b></p>' + REGRA;
    } else if (tipo === 'falta') {
      var F = faltamCache[m.k] && faltamCache[m.k].porAg, f = F && F[arg], a3 = null; m.ags.forEach(function (a) { if (a.id === arg) a3 = a; });
      if (!f || !a3) return;
      h = '<h4>' + esc(a3.sigla) + ': faltam ' + fmt(f.n) + ' votos para a ' + (a3.cadeiras + 1) + 'ª cadeira</h4>' +
        '<p>Conta do motor, não estimativa: o motor recalcula as 24/8 cadeiras com ' + fmt(f.n) + ' votos a mais para ' + esc(f.cand.urna) + ' (1º suplente da lista) e a agremiação faz a ' + (a3.cadeiras + 1) + 'ª cadeira; com ' + fmt(f.n - 1) + ' votos a mais, não faz. As duas contas são conferidas a cada atualização.</p>' +
        '<p>Hipótese da conta: os votos dos outros ficam parados (o quociente eleitoral sobe junto, porque os válidos sobem). Não é o que vai acontecer; é a distância de hoje.</p>' +
        '<p class="mp-pop__peq">Quando a busca não acha um número exato (com o dobro dos votos válidos não chega à cadeira), a página mostra “—”.</p>';
    }
    pop.querySelector('.mp-pop__txt').innerHTML = h;
    pop.hidden = false;
    var x = pop.querySelector('.mp-pop__x'); if (x && x.focus) x.focus();
  }
  function fechaPop() { if (pop) pop.hidden = true; }

  // ---------- ver meu candidato ----------
  function todos() {
    var r = [];
    ['dist', 'fed'].forEach(function (k) {
      var d = ultimo[k]; if (!d || !d.lido) return;
      d.lido.candidatos.forEach(function (c) { r.push({ k: k, c: c }); });
    });
    return r;
  }
  function mostraBusca() {
    var inp = raiz.querySelector('#mpBusca'), ul = raiz.querySelector('#mpRes'), q = semAcento(inp.value);
    if (q.length < 2 && !/^\d+$/.test(q)) { ul.hidden = true; ul.innerHTML = ''; return; }
    var achou = todos().filter(function (o) {
      return String(o.c.n) === q || semAcento(o.c.urna).indexOf(q) >= 0 || semAcento(o.c.nome).indexOf(q) >= 0 || (/^\d+$/.test(q) && String(o.c.n).indexOf(q) === 0);
    });
    achou.sort(function (a, b) { return ((String(b.c.n) === q) - (String(a.c.n) === q)) || (b.c.votos - a.c.votos); });
    achou = achou.slice(0, 8);
    ul.innerHTML = achou.length ? achou.map(function (o) {
      return '<li data-chave="' + esc(o.k + '|' + o.c.n) + '" tabindex="0"><b>' + esc(o.c.urna || o.c.nome) + '</b> <small>' + esc(o.c.n) + ' · ' + esc(o.c.sigla || '') + ' · ' + CASAS[o.k].nome + '</small></li>';
    }).join('') : '<li class="mp-vazio">Nenhum candidato a distrital ou federal com esse nome ou número.</li>';
    ul.hidden = false;
  }
  function escolhe(chave, rolar) {
    var p = String(chave).split('|'), k = p[0], n = p[1], d = ultimo[k];
    if (!d || !d.lido) return false;
    var c = null; d.lido.candidatos.forEach(function (x) { if (String(x.n) === n) c = x; });
    if (!c) return false;
    st.destaque = k + '|' + n;
    st.ag[k] = String(c.agremiacaoId);
    var ul = raiz.querySelector('#mpRes'); ul.hidden = true;
    raiz.querySelector('#mpBusca').value = c.urna || c.nome || n;
    trocaCasa(k);
    var el = document.getElementById('mp-c-' + k + '-' + n);
    if (el && rolar && el.scrollIntoView) el.scrollIntoView({ behavior: calma ? 'auto' : 'smooth', block: 'center' });
    if (!el && !c.elegivel) {
      var lista = raiz.querySelector('.mp-lista');
      if (lista) lista.insertAdjacentHTML('beforebegin', '<p class="mp-p__nota mp-p__nota--meu">' + esc(c.urna) + ' tem voto que não elege (' + esc(c.destinacao || 'situação do TSE') + '): fica fora da lista.</p>');
    }
    return true;
  }

  // ---------- os eventos ----------
  window.addEventListener('swm:dados', function (ev) {
    var d = ev && ev.detail; if (!d || !CASAS[d.k]) return;
    ultimo[d.k] = d;
    var m = modelo(d.k);
    if (m) marcaMudancas(m);
    if (d.k === st.casa) desenha(); // a casa aberta não muda sozinha (o distrital é a de saída)
  });
  window.addEventListener('swm:busca', function (ev) {
    var ch = ev && ev.detail && ev.detail.chave; if (!ch) return;
    var p = String(ch).split('-'), k = CD_K[String(Number(p[0]))];
    if (!k) return;
    if (!raiz) esqueleto();
    escolhe(k + '|' + p.slice(1).join('-'), false);
  });

  function inicia() { if (!raiz) { esqueleto(); desenha(); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();

  window.SWMPartidos = { teto: teto, provaOrdem: provaOrdem, modelo: modelo, faltam: function (k) { return faltamCache[k] || null; }, versao: '2026-10-04' };
})();
