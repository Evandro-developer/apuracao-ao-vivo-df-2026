/* mod_graficos — popups explicativos + gráficos da noite (apuração DF 2026, Scale Web Media)
 * Sem biblioteca: SVG à mão. Escuta o evento 'swm:dados'. Usa só variáveis de cor (graficos.css).
 * Expõe window.SWMGraficos = { textos, anexa(el, chave), varre(), redesenha() }.
 */
(function () {
  'use strict';
  if (window.SWMGraficos) return;

  /* ============================== 1. OS TEXTOS ============================== */
  /* Regra: só o que a fonte sustenta. A 3ª fase e o 80/20 seguem a REGRA_2026 do motor.js. */
  var T = {
    secoes: ['Seções apuradas', 'Seção é cada urna eletrônica, numa sala de um local de votação. O número diz quantas o TSE já somou do total. É a parte das urnas, não dos votos: as seções têm tamanhos diferentes.'],
    hora: ['Hora do TSE', 'Data e hora da última totalização gravada pelo TSE no arquivo que esta página leu. Mostra quão fresco está o número; a página consulta o TSE a cada 30 segundos.'],
    validos: ['Votos válidos', 'Os votos que contam para alguém: os dados a um candidato (nominais) e, para deputado, os dados só ao partido (de legenda). Brancos, nulos e anulados ficam fora. O 50% do governador e o quociente eleitoral usam os válidos.'],
    nominais: ['Votos nominais', 'Voto no número de um candidato. Conta para ele e, para deputado, também para a agremiação dele.'],
    legenda: ['Votos de legenda', 'Voto só no número do partido, sem escolher candidato. Existe só para deputado. Conta para a agremiação na divisão das cadeiras, mas não ajuda nenhum candidato a subir na lista.'],
    brancos: ['Votos brancos', 'Quem apertou BRANCO. Não vai para nenhum candidato e não entra nos votos válidos.'],
    nulos: ['Votos nulos', 'Voto num número que não é de candidato nem de partido (o TSE soma aqui também os nulos técnicos). Não entra nos válidos. Voto nulo não anula a eleição.'],
    anulados: ['Votos anulados', 'Votos dados a candidato com o registro negado ou cassado pela Justiça Eleitoral. Não contam como válidos. “Sub judice”: o caso ainda está em julgamento.'],
    abstencao: ['Abstenção', 'Eleitores que não foram votar. Na parcial, comparecimento + abstenção ainda não chega ao eleitorado inteiro (as seções que faltam não entraram); por isso o percentual aqui é sobre essa soma.'],
    comparecimento: ['Comparecimento', 'Eleitores que foram votar, qualquer que tenha sido o voto: válido, branco, nulo ou anulado. Ao fim da apuração, comparecimento + abstenção = eleitorado.'],
    qe: ['Quociente eleitoral (QE)', 'Votos válidos ÷ número de vagas (24 no distrital, 8 no federal), arredondado: fração acima de meio sobe. É o “preço” de uma cadeira. Muda durante a apuração, porque os válidos crescem.'],
    qp: ['Quociente partidário (QP)', 'Votos da agremiação ÷ QE, sem a parte decimal: 3,7 vira 3. É quantas cadeiras ela leva direto, na 1ª fase.'],
    qp10: ['10% do QE', 'Para ocupar uma cadeira do quociente partidário, o candidato precisa ter, sozinho, pelo menos 10% do QE em votos. Se a agremiação ganhou a cadeira mas ninguém dela chega a isso, a vaga vai para as sobras.'],
    sobras: ['Sobras e maior média', 'As cadeiras que o QP não preencheu são distribuídas uma a uma. Em cada rodada, a média de cada agremiação é votos ÷ (cadeiras que já tem + 1); a maior média leva a cadeira e a conta recomeça.'],
    regra8020: ['A regra 80% e 20%', 'Nas sobras só disputam as agremiações com pelo menos 80% do QE em votos, e só pode ocupar a cadeira o candidato com pelo menos 20% do QE em votos próprios.'],
    fase3: ['A 3ª fase das sobras', 'Se ainda sobrar cadeira e ninguém mais passar nos cortes de 80% e 20%, as vagas restantes vão às maiores médias entre todas as agremiações, sem corte. A página usa essa regra porque ela reproduziu a totalização do TSE de 2024 (vereadores: 5.546 de 5.547 municípios conferidos). Que o TSE a aplique igual em 2026 ainda não dá para conferir.'],
    federacao: ['Federação', 'Partidos que se unem por pelo menos 4 anos e disputam como se fossem um só: os votos somam, as cadeiras são da federação e quem senta são os mais votados da lista conjunta.'],
    agremiacao: ['Agremiações e cadeiras', 'Cada cor é uma agremiação: um partido sozinho ou uma federação de partidos. Para deputado não existe mais coligação. O número é de cadeiras se a apuração terminasse agora; ao lado, os votos e o % dos válidos.'],
    seagora: ['Se terminasse agora', 'O que aconteceria se a contagem parasse neste instante, só com os votos já apurados. Não é previsão: as seções que faltam podem mudar tudo.'],
    eleitos: ['Os eleitos', 'Durante a apuração: quem ocuparia as cadeiras se a contagem parasse ali. Com o arquivo totalizado pelo TSE: o resultado final. QP: entrou pelo quociente partidário. Média: entrou pelas sobras.'],
    turno2: ['Governador e o 2º turno', 'Vence no 1º turno quem tiver mais de 50% dos votos válidos (brancos e nulos não contam). Se ninguém passar disso, os dois mais votados disputam o 2º turno, em 25 de outubro.'],
    senado: ['Senado: 2 vagas', 'Em 2026 o DF elege dois senadores, e cada eleitor vota em dois candidatos diferentes. Os dois mais votados ficam com as vagas. Não há 2º turno para o Senado.'],
    presdf: ['Presidente no DF', 'Só os votos dados no Distrito Federal. Quem decide é o país inteiro: vence no 1º turno quem tiver mais de 50% dos válidos do Brasil; senão, os dois primeiros vão ao 2º turno.'],
    passos: ['Como o voto vira cadeira', 'Os passos da conta da lei: somar os válidos, achar o QE, dar a cada agremiação o seu QP e distribuir as sobras pela maior média. Toque num passo para vê-lo.'],
    vagas: ['Cadeiras em disputa', '24 deputados distritais na Câmara Legislativa do DF e 8 deputados federais pelo DF na Câmara dos Deputados.'],
    corrida: ['A corrida', 'Como o percentual dos quatro primeiros mudou ao longo da apuração, um ponto por arquivo novo do TSE. Eixo horizontal: a hora do TSE. Percentual sobre os votos válidos. A linha guarda só o que este aparelho viu, desde a primeira vez que abriu a página.'],
    barrasqe: ['Votos e o quociente', 'Cada barra é a votação de uma agremiação (nominais + legenda). A linha cheia é o QE: quem passa dela leva ao menos uma cadeira pelo QP, se tiver candidato com 10% do QE. A tracejada é 80% do QE: abaixo dela, a agremiação não disputa as sobras, só a 3ª fase.'],
    participacao: ['Quem votou e como', 'A primeira barra divide comparecimento + abstenção entre quem foi votar e quem faltou. A segunda divide quem foi votar entre válidos, brancos, nulos e anulados, no cargo escolhido.']
  };

  /* os ids da página atual e onde o "?" entra sem ser apagado pelo app.js */
  var IDS = [
    { id: 'pctSecoes', k: 'secoes', onde: function (el) {
      var r = document.getElementById('pctRotulo');           /* ao lado de "das seções apuradas": não empurra o número grande */
      if (r) return [envolve(r, 'gx-linha'), 'beforeend'];
      var s = el.parentNode && el.parentNode.querySelector('.pct-sinal'); return [s || el, 'afterend'];
    } },
    { id: 'horaTSE', k: 'hora', onde: function (el) { return [el, 'afterend']; } },
    { id: 'hemiQE', k: 'qe', onde: function (el) { return [envolve(el), 'beforeend']; } },
    { id: 'hemiVagas', k: 'vagas', onde: function (el) { var s = el.parentNode && el.parentNode.querySelector('small'); return [s || el, 'afterend']; } },
    { id: 'legenda', k: 'agremiacao', onde: function (el) { var h = document.getElementById('hemiTitulo'); return h ? [envolve(h, 'gx-linha'), 'beforeend'] : [el, 'beforebegin']; } },
    { id: 'eleitos', k: 'eleitos', onde: function (el) { var h = document.getElementById('eleitosTitulo'); return h ? [envolve(h, 'gx-linha'), 'beforeend'] : [el, 'beforebegin']; } },
    { id: 'maj-gov', k: 'turno2', onde: cabMaj },
    { id: 'maj-sen', k: 'senado', onde: cabMaj },
    { id: 'maj-pres', k: 'presdf', onde: cabMaj },
    { id: 'passosNav', k: 'passos', onde: function (el) { var h = document.getElementById('tExplica'); return h ? [h, 'beforeend'] : [el, 'beforebegin']; } }
  ];
  function cabMaj(el) { var h = el.querySelector('h3'); return h ? [h, 'beforeend'] : [el, 'afterbegin']; }
  function envolve(el, classe) {
    classe = classe || 'gx-envolve';
    var p = el.parentNode;
    if (p && p.classList && p.classList.contains(classe)) return p;
    var w = document.createElement('div');
    w.className = classe;
    p.insertBefore(w, el); w.appendChild(el);
    return w;
  }

  /* ============================== 2. O POPUP ============================== */
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pop, popT, popX, atual = null, fixo = false, timerEsconde = 0, ultimoPonteiro = 0, pulsados = {}, nId = 0;

  function criaPop() {
    if (pop) return;
    pop = document.createElement('div');
    pop.id = 'gx-pop'; pop.className = 'gx-pop'; pop.setAttribute('role', 'tooltip'); pop.hidden = true;
    pop.innerHTML = '<b class="gx-pop__t"></b><p class="gx-pop__x"></p>';
    popT = pop.firstChild; popX = pop.lastChild;
    document.body.appendChild(pop);
    pop.addEventListener('pointerenter', function () { clearTimeout(timerEsconde); });
    pop.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !fixo) agendaEsconde(); });
    document.addEventListener('pointerdown', function (e) {
      ultimoPonteiro = Date.now();
      if (!atual) return;
      if (pop.contains(e.target) || (e.target.closest && e.target.closest('[data-gx-gatilho]'))) return;
      esconde();
    }, true);
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && atual) { var b = atual; esconde(); try { b.focus(); } catch (x) {} }
    });
    window.addEventListener('resize', function () { if (atual) posiciona(atual); });
  }

  function mostra(btn, fixar) {
    var t = T[btn.getAttribute('data-gx-gatilho')];
    if (!t) return;
    clearTimeout(timerEsconde);
    if (atual && atual !== btn) atual.setAttribute('aria-expanded', 'false');
    atual = btn; fixo = !!fixar;
    popT.textContent = t[0]; popX.textContent = t[1];
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'gx-pop');
    posiciona(btn);
    pop.classList.remove('gx-pop--entra'); void pop.offsetWidth; pop.classList.add('gx-pop--entra');
  }
  function esconde() {
    clearTimeout(timerEsconde);
    if (atual) { atual.setAttribute('aria-expanded', 'false'); atual.removeAttribute('aria-describedby'); }
    atual = null; fixo = false;
    if (pop) pop.hidden = true;
  }
  function agendaEsconde() { clearTimeout(timerEsconde); timerEsconde = setTimeout(esconde, 180); }
  function posiciona(btn) {
    var r = btn.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var w = Math.min(300, vw - 32);
    pop.style.width = w + 'px';
    var ph = pop.offsetHeight, sx = window.pageXOffset, sy = window.pageYOffset;
    var x = r.left + r.width / 2 - w / 2;
    x = Math.max(16, Math.min(x, vw - 16 - w));
    var abaixo = r.bottom + 8 + ph <= vh || r.top - 8 - ph < 0;
    var y = abaixo ? r.bottom + 8 : r.top - 8 - ph;
    pop.style.left = (x + sx) + 'px'; pop.style.top = (y + sy) + 'px';
    pop.style.setProperty('--gx-seta', Math.max(12, Math.min(w - 12, r.left + r.width / 2 - x)) + 'px');
    pop.classList.toggle('gx-pop--acima', !abaixo);
  }

  /* liga o comportamento num gatilho (o "?" ou um termo que já é botão) */
  function ligaGatilho(btn, chave) {
    if (btn.__gx) return;
    btn.__gx = true;
    btn.setAttribute('data-gx-gatilho', chave);
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'gx-pop');
    if (btn.tagName !== 'BUTTON') { btn.setAttribute('role', 'button'); btn.tabIndex = 0; }
    btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !fixo) mostra(btn, false); });
    btn.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !fixo) agendaEsconde(); });
    btn.addEventListener('focus', function () { if (Date.now() - ultimoPonteiro > 400) mostra(btn, false); });
    btn.addEventListener('blur', function (e) { if (atual === btn && !(e.relatedTarget && pop.contains(e.relatedTarget)) && Date.now() - ultimoPonteiro > 400) esconde(); });
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (atual === btn && fixo) esconde(); else mostra(btn, true);
    });
    if (btn.tagName !== 'BUTTON') btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (atual === btn && fixo) esconde(); else mostra(btn, true); }
    });
  }

  function criaQ(chave, pulsoChave) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'gx-q'; b.textContent = '?';
    b.setAttribute('aria-label', 'O que é: ' + T[chave][0]);
    ligaGatilho(b, chave);
    if (!pulsados[pulsoChave] && !reduz) {
      pulsados[pulsoChave] = true;
      b.style.animationDelay = (400 + (nId++ % 12) * 120) + 'ms';
      b.classList.add('gx-q--pulsa');
      b.addEventListener('animationend', function () { b.classList.remove('gx-q--pulsa'); });
    }
    return b;
  }

  /* anexa a um elemento qualquer: botão/termo vira gatilho; o resto ganha um "?" no fim */
  function anexa(el, chave) {
    if (!el || !T[chave]) return null;
    if (el.matches('button, a, .gx-termo')) { ligaGatilho(el, chave); return el; }
    var q = el._gxQ;
    if (q && el.contains(q)) return q;
    q = criaQ(chave, 'de:' + chave + ':' + (el.id || ''));
    el.appendChild(q); el._gxQ = q;
    return q;
  }

  function varre() {
    criaPop();
    IDS.forEach(function (d) {
      var el = document.getElementById(d.id);
      if (!el) return;
      if (el._gxQ && document.documentElement.contains(el._gxQ)) return;
      var o = d.onde(el), q = criaQ(d.k, 'id:' + d.id);
      o[0].insertAdjacentElement(o[1], q);
      el._gxQ = q;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.selo-parcial'), function (el) {
      if (!el._gxQ || !el.contains(el._gxQ)) { var q = criaQ('seagora', 'selo'); q.classList.add('gx-q--selo'); el.appendChild(q); el._gxQ = q; }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-explica]'), function (el) { anexa(el, el.getAttribute('data-explica')); });
  }
  var varreAgendado = false;
  function agendaVarre() {
    if (varreAgendado) return;
    varreAgendado = true;
    (window.requestAnimationFrame || setTimeout)(function () { varreAgendado = false; varre(); });
  }

  /* ============================== 3. UTILITÁRIOS ============================== */
  var nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function f0(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : nf0.format(n); }
  function f1(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : nf1.format(n); }
  function f2(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : nf2.format(n); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function horaMs(dh) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dh || '');
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime();
  }
  function hhmm(ms, seg) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + (seg ? ':' + ('0' + d.getSeconds()).slice(-2) : ''); }
  function diaDe(dh) { var m = /^(\d{2}\/\d{2}\/\d{4})/.exec(dh || ''); return m ? m[1] : ''; }
  var tokens = {};
  function tween(nome, dur, passo) {
    var tk = tokens[nome] = (tokens[nome] || 0) + 1;
    if (reduz || dur <= 0) { passo(1); return; }
    var t0 = 0;
    function f(agora) {
      if (tokens[nome] !== tk) return;
      if (!t0) t0 = agora;
      var p = Math.min(1, (agora - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      passo(e);
      if (p < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }
  function lerp(a, b, e) { return a + (b - a) * e; }
  function ls(acao, chave, valor) {
    try {
      if (acao === 'le') return JSON.parse(window.localStorage.getItem(chave) || 'null');
      window.localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) { return null; }
    return null;
  }

  /* ============================== 4. O ESTADO ============================== */
  var CHAVE_LS = 'swm-mod-graficos-corrida-v1';
  var ultimo = {};                    /* o último detail de cada k */
  var serie = ls('le', CHAVE_LS) || {};
  var CORES = ['var(--azul)', 'var(--ambar)', 'var(--verde)', 'var(--txt2)'];
  var TRACO = ['', '6 3', '2 3', '9 3 2 3'];
  var NOME = { gov: 'Governador', sen: 'Senado', pres: 'Presidente no DF', dist: 'Distrital', fed: 'Federal' };
  var ui = { prop: 'dist', part: 'dist', todas: false };

  function guardaPonto(k, d) {
    var l = d.lido; if (!l || !l.apuracao || !l.votos) return false;
    var s0 = serie[k], u0 = s0 && s0.pts[s0.pts.length - 1];
    if (u0 && (num(l.apuracao.pct) || 0) < u0.p - 1e-9) { serie[k] = null; ls('grava', CHAVE_LS, serie); }  /* o arquivo voltou: recomeça */
    if (!num(l.votos.validos)) return false;           /* sem voto apurado, sem ponto */
    var t = horaMs(l.apuracao.dataHora); if (t === null) return false;
    var p = num(l.apuracao.pct) || 0, dia = diaDe(l.apuracao.dataHora);
    var s = serie[k];
    if (!s || s.dia !== dia) s = serie[k] = { dia: dia, nomes: {}, pts: [] };
    var ult = s.pts[s.pts.length - 1];
    if (ult && (t < ult.t || p < ult.p - 1e-9)) { s.nomes = {}; s.pts = []; ult = null; }  /* o arquivo voltou (simulador em laço, retotalização): recomeça */
    if (ult && ult.t === t && ult.p === p) return false;
    var maj = d.maj || [], v = {};
    maj.forEach(function (c) {
      /* site6: o % na conta do TSE (pct), o mesmo do selo e da tabela; sem ele, o dos válidos */
      var pc = num(c.pct) !== null ? num(c.pct) : num(c.pctValidos);
      if (pc === null) return;
      v[c.n] = Math.round(pc * 100) / 100;
      s.nomes[c.n] = { u: c.urna, s: c.sigla };
    });
    s.pts.push({ t: t, p: Math.round(p * 100) / 100, v: v });
    if (s.pts.length > 400) s.pts.splice(1, 1);         /* teto: tira o 2º ponto, guarda o começo */
    ls('grava', CHAVE_LS, serie);
    return true;
  }

  /* ============================== 5. O CONTÊINER ============================== */
  var box, prontos = false;
  function monta() {
    box = document.getElementById('mod-graficos');
    if (!box) {
      box = document.createElement('section');
      box.id = 'mod-graficos';
      (document.querySelector('main') || document.body).appendChild(box);
    }
    box.classList.add('gx');
    if (!box.getAttribute('aria-labelledby')) box.setAttribute('aria-labelledby', 'gxTitulo');
    box.innerHTML =
      '<h2 class="sec-titulo" id="gxTitulo">A noite em gráficos</h2>' +
      '<div class="gx-grade">' +
        '<article class="card gx-card gx-card--corrida" id="gxCorrida">' +
          '<header class="gx-cab"><h3>A corrida <span data-explica="corrida"></span></h3><span class="gx-sub">% dos votos válidos, pela hora do TSE</span></header>' +
          '<div class="gx-corridas">' +
            '<figure class="gx-fig" data-k="gov"><figcaption>Governador <span data-explica="turno2"></span></figcaption><div class="gx-svgbox"></div><ul class="gx-leg"></ul></figure>' +
            '<figure class="gx-fig" data-k="sen"><figcaption>Senado <small>2 vagas</small> <span data-explica="senado"></span></figcaption><div class="gx-svgbox"></div><ul class="gx-leg"></ul></figure>' +
          '</div>' +
        '</article>' +
        '<article class="card gx-card" id="gxQE">' +
          '<header class="gx-cab"><h3>Votos por agremiação e o quociente <span data-explica="barrasqe"></span></h3>' +
            '<span class="gx-sub"><span class="gx-selo">se terminasse agora <span data-explica="seagora"></span></span></span></header>' +
          '<div class="abas gx-abas" role="tablist" data-grupo="prop">' +
            '<button role="tab" aria-selected="true" data-v="dist">Distrital <small>24</small></button>' +
            '<button role="tab" aria-selected="false" data-v="fed">Federal <small>8</small></button>' +
          '</div>' +
          '<p class="gx-resumo" data-resumo></p>' +
          '<div class="gx-svgbox" data-barras></div>' +
          '<button type="button" class="gx-mais" data-mais hidden></button>' +
          '<p class="gx-termos">Entenda: ' +
            '<button type="button" class="gx-termo" data-explica="qe">QE</button>' +
            '<button type="button" class="gx-termo" data-explica="qp">QP</button>' +
            '<button type="button" class="gx-termo" data-explica="qp10">10% do QE</button>' +
            '<button type="button" class="gx-termo" data-explica="sobras">sobras</button>' +
            '<button type="button" class="gx-termo" data-explica="regra8020">80% e 20%</button>' +
            '<button type="button" class="gx-termo" data-explica="fase3">3ª fase</button>' +
            '<button type="button" class="gx-termo" data-explica="federacao">federação</button>' +
          '</p>' +
        '</article>' +
        '<article class="card gx-card" id="gxPart">' +
          '<header class="gx-cab"><h3>Quem votou e como <span data-explica="participacao"></span></h3><span class="gx-sub" data-hora-part></span></header>' +
          '<div class="abas gx-abas" role="tablist" data-grupo="part">' +
            '<button role="tab" aria-selected="false" data-v="gov">Gov.</button>' +
            '<button role="tab" aria-selected="false" data-v="sen">Senado</button>' +
            '<button role="tab" aria-selected="false" data-v="pres">Pres.</button>' +
            '<button role="tab" aria-selected="true" data-v="dist">Distrital</button>' +
            '<button role="tab" aria-selected="false" data-v="fed">Federal</button>' +
          '</div>' +
          '<div class="gx-part" data-part></div>' +
        '</article>' +
      '</div>';

    Array.prototype.forEach.call(box.querySelectorAll('.gx-abas'), function (ab) {
      ab.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-v]'); if (!b) return;
        Array.prototype.forEach.call(ab.querySelectorAll('button[data-v]'), function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
        ui[ab.getAttribute('data-grupo')] = b.getAttribute('data-v');
        if (ab.getAttribute('data-grupo') === 'prop') { ui.todas = false; desenhaBarras(true); } else desenhaPart(true);
      });
    });
    box.querySelector('[data-mais]').addEventListener('click', function () { ui.todas = !ui.todas; desenhaBarras(false); });
    prontos = true;
    varre();
    if (window.ResizeObserver) {
      var larg = 0, tm = 0;
      new ResizeObserver(function (en) {
        var w = Math.round(en[0].contentRect.width);
        if (w === larg) return; larg = w;
        clearTimeout(tm); tm = setTimeout(function () { redesenha(true); }, 120);
      }).observe(box);
    } else window.addEventListener('resize', function () { redesenha(true); });
  }

  /* ============================== 6. A CORRIDA ============================== */
  var corridaAnt = {};   /* k -> { n pontos, x final } para animar o traço novo */
  function desenhaCorrida(k, semAnima) {
    var fig = box.querySelector('.gx-fig[data-k="' + k + '"]'); if (!fig) return;
    var alvo = fig.querySelector('.gx-svgbox'), leg = fig.querySelector('.gx-leg');
    var s = serie[k], pts = (s && s.pts) || [];
    if (!pts.length) {
      var d = ultimo[k];
      alvo.innerHTML = '<p class="gx-vazio">' + (d ? 'A corrida começa com os primeiros votos apurados do ' + (k === 'gov' ? 'governador' : 'Senado') + '.' : 'Aguardando os dados do TSE…') + '</p>';
      leg.innerHTML = '';
      corridaAnt[k] = null;
      return;
    }
    var ultP = pts[pts.length - 1];
    var top = Object.keys(ultP.v).sort(function (a, b) { return (ultP.v[b] - ultP.v[a]) || String(a).localeCompare(String(b)); }).slice(0, 4);
    var W = Math.max(240, alvo.clientWidth || 300), H = W < 420 ? 190 : 210;
    var m = { e: 34, d: 12, t: 12, b: 24 }, pw = W - m.e - m.d, ph = H - m.t - m.b;
    var maxV = 0;
    pts.forEach(function (p) { top.forEach(function (n) { if (p.v[n] > maxV) maxV = p.v[n]; }); });
    var ymax = Math.min(100, Math.max(k === 'gov' ? 60 : 20, Math.ceil((maxV + 4) / 10) * 10));
    var passoY = ymax > 60 ? 20 : 10;
    var t0 = pts[0].t, t1 = ultP.t, umPonto = t1 === t0;
    function X(t) { return m.e + (umPonto ? pw : (t - t0) / (t1 - t0) * pw); }
    function Y(v) { return m.t + ph - v / ymax * ph; }
    var o = [];
    o.push('<svg class="gx-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc((k === 'gov' ? 'Governador' : 'Senado') + ': percentual dos quatro primeiros ao longo da apuração. ' + top.map(function (n) { return (s.nomes[n] ? s.nomes[n].u : n) + ' ' + f2(ultP.v[n]) + '%'; }).join('; ')) + '">');
    for (var y = 0; y <= ymax; y += passoY) {
      o.push('<line class="gx-grade-l" x1="' + m.e + '" x2="' + (W - m.d) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '"/>');
      o.push('<text class="gx-eixo" x="' + (m.e - 6) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end">' + y + '%</text>');
    }
    if (k === 'gov') {
      o.push('<line class="gx-ref" x1="' + m.e + '" x2="' + (W - m.d) + '" y1="' + Y(50).toFixed(1) + '" y2="' + Y(50).toFixed(1) + '"/>');
      o.push('<text class="gx-ref-t" x="' + (m.e + 4) + '" y="' + (Y(50) - 5).toFixed(1) + '">50% dos válidos</text>');
    }
    var curto = (t1 - t0) < 300000;
    var ticks = umPonto ? [t1] : [t0, t1];
    if (!umPonto && pw > 260 && (t1 - t0) >= 120000) ticks.splice(1, 0, t0 + (t1 - t0) / 2);
    ticks.forEach(function (t, i) {
      var anc = umPonto ? 'end' : (i === 0 ? 'start' : (i === ticks.length - 1 ? 'end' : 'middle'));
      o.push('<text class="gx-eixo" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + anc + '">' + hhmm(t, curto) + '</text>');
    });
    var clipId = 'gxClip-' + k;
    o.push('<defs><clipPath id="' + clipId + '"><rect x="0" y="0" width="' + W + '" height="' + H + '"></rect></clipPath></defs>');
    o.push('<g clip-path="url(#' + clipId + ')">');
    top.forEach(function (n, i) {
      var dd = '', ini = true;
      pts.forEach(function (p) {
        if (p.v[n] === undefined) { ini = true; return; }
        dd += (ini ? 'M' : 'L') + X(p.t).toFixed(1) + ',' + Y(p.v[n]).toFixed(1); ini = false;
      });
      o.push('<path class="gx-linha" d="' + dd + '" style="stroke:' + CORES[i] + '"' + (TRACO[i] ? ' stroke-dasharray="' + TRACO[i] + '"' : '') + '/>');
    });
    o.push('</g>');
    top.forEach(function (n, i) {
      if (ultP.v[n] === undefined) return;
      o.push('<circle class="gx-ponto" cx="' + X(t1).toFixed(1) + '" cy="' + Y(ultP.v[n]).toFixed(1) + '" r="3.5" style="fill:' + CORES[i] + '"/>');
    });
    o.push('</svg>');
    alvo.innerHTML = o.join('');
    leg.innerHTML = top.map(function (n, i) {
      var nm = s.nomes[n] || { u: n, s: '' };
      return '<li><svg class="gx-amostra" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" style="stroke:' + CORES[i] + '"' + (TRACO[i] ? ' stroke-dasharray="' + TRACO[i] + '"' : '') + '/></svg>' +
        '<span class="gx-leg__n">' + esc(nm.u) + (nm.s ? ' <small>' + esc(nm.s) + '</small>' : '') + '</span><b class="num">' + f2(ultP.v[n]) + '%</b></li>';
    }).join('') + '<li class="gx-leg__nota">' + pts.length + (pts.length === 1 ? ' arquivo do TSE até agora; a linha cresce a cada atualização' : ' arquivos do TSE desde ' + hhmm(t0)) + ' · ' + f2(ultP.p) + '% das seções</li>';
    /* anima: o traço novo se desenha da posição anterior até a nova */
    var ant = corridaAnt[k];
    corridaAnt[k] = { n: pts.length };
    var rect = alvo.querySelector('#' + clipId + ' rect');
    if (!semAnima && ant && ant.n < pts.length && pts.length > 1) {
      var xi = X(pts[ant.n - 1].t), xf = W;
      rect.setAttribute('width', xi);
      tween('corrida-' + k, 900, function (e) { rect.setAttribute('width', lerp(xi, xf, e).toFixed(1)); });
      Array.prototype.forEach.call(alvo.querySelectorAll('.gx-ponto'), function (c) { c.classList.add('gx-ponto--novo'); });
    } else if (!semAnima && !ant) {
      rect.setAttribute('width', m.e);
      tween('corrida-' + k, 1100, function (e) { rect.setAttribute('width', lerp(m.e, W, e).toFixed(1)); });
    }
  }

  /* ============================== 7. AS BARRAS COM O QE ============================== */
  var barrasAnt = {};  /* id -> votos, e 'qe' */
  function desenhaBarras(trocouAba) {
    var card = box.querySelector('#gxQE'), alvo = card.querySelector('[data-barras]'), res = card.querySelector('[data-resumo]'), mais = card.querySelector('[data-mais]');
    var k = ui.prop, d = ultimo[k], cad = d && d.cad, l = d && d.lido;
    if (!cad || cad.aguardando || !num(cad.qe) || !cad.qe) {
      res.textContent = '';
      alvo.innerHTML = '<p class="gx-vazio">' + (d ? 'Aguardando votos apurados do ' + (k === 'dist' ? 'distrital' : 'federal') + '. O quociente aparece com os primeiros números.' : 'Aguardando os dados do TSE…') + '</p>';
      mais.hidden = true; barrasAnt[k] = null;
      return;
    }
    var ags = (cad.agremiacoes || []).filter(function (a) { return num(a.votos) !== null; }).slice()
      .sort(function (a, b) { return (b.votos - a.votos) || String(a.sigla).localeCompare(String(b.sigla), 'pt-BR'); });
    var nTotal = ags.length, LIM = 10;
    var vis = ui.todas ? ags : ags.slice(0, LIM);
    mais.hidden = nTotal <= LIM;
    mais.textContent = ui.todas ? 'Ver só as ' + LIM + ' mais votadas' : 'Ver as ' + nTotal + ' agremiações';
    var qe = cad.qe, q80 = 0.8 * qe;
    var acima = ags.filter(function (a) { return a.votos >= qe; }).length, nas80 = ags.filter(function (a) { return a.votos >= q80; }).length;
    res.innerHTML = 'QE agora: <b class="num">' + f0(qe) + '</b> votos por cadeira · ' + acima + ' de ' + nTotal + ' agremiações passam do QE; ' + nas80 + ' chegam a 80% · ' + f2(l.apuracao.pct) + '% das seções';
    var W = Math.max(260, alvo.clientWidth || 320), estreito = W < 420;
    var rotW = estreito ? 100 : 130, valW = estreito ? 96 : 120, linhaH = 24, topo = 18;
    var H = topo + vis.length * linhaH + 4, bx = rotW, bw = W - rotW - valW;
    var vmax = Math.max(qe * 1.08, ags.length ? ags[0].votos : 0);
    function X(v) { return bx + v / vmax * bw; }
    var ant = barrasAnt[k] || {};
    var o = ['<svg class="gx-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc('Votos por agremiação, ' + NOME[k] + ', com o quociente eleitoral de ' + f0(qe) + ' votos. ' + vis.map(function (a) { return a.sigla + ' ' + f0(a.votos) + ' votos, ' + a.cadeiras + ' cadeiras'; }).join('; ')) + '">'];
    vis.forEach(function (a, i) {
      var y = topo + i * linhaH;
      var sig = String(a.sigla || '');
      o.push('<text class="gx-rot" x="' + (rotW - 6) + '" y="' + (y + 15) + '" text-anchor="end"><title>' + esc(a.sigla) + '</title>' + esc(sig) + '</text>');
      o.push('<rect class="gx-barra' + (a.votos >= qe ? ' gx-barra--qe' : (a.votos >= q80 ? ' gx-barra--80' : '')) + '" data-i="' + esc(a.id) + '" x="' + bx + '" y="' + (y + 4) + '" height="' + (linhaH - 8) + '" rx="3" width="0"/>');
      o.push('<text class="gx-val" data-v="' + esc(a.id) + '" x="' + bx + '" y="' + (y + 15) + '">' + f0(a.votos) + (a.cadeiras ? ' · <tspan class="gx-cad">' + a.cadeiras + ' cad.</tspan>' : '') + '</text>');
    });
    var y1 = topo - 2, y2 = H - 2;
    o.push('<line class="gx-linha-80" data-l="80" x1="0" x2="0" y1="' + y1 + '" y2="' + y2 + '"/>');
    o.push('<line class="gx-linha-qe" data-l="qe" x1="0" x2="0" y1="' + y1 + '" y2="' + y2 + '"/>');
    o.push('<text class="gx-qe-t" data-t="qe" x="0" y="11">QE ' + f0(qe) + '</text>');
    o.push('<text class="gx-80-t" data-t="80" x="0" y="11" text-anchor="end">80%</text>');
    o.push('</svg>');
    alvo.innerHTML = o.join('');
    Array.prototype.forEach.call(alvo.querySelectorAll('.gx-rot'), function (t) {
      var no = t.lastChild, txt = no && no.nodeValue, lim = rotW - 10, guarda = 0;
      try { while (txt && t.getComputedTextLength() > lim && txt.length > 3 && guarda++ < 30) { txt = txt.slice(0, -2) + '…'; no.nodeValue = txt; } } catch (e) {}
    });
    var bars = alvo.querySelectorAll('.gx-barra'), vals = alvo.querySelectorAll('.gx-val');
    var lq = alvo.querySelector('[data-l="qe"]'), l8 = alvo.querySelector('[data-l="80"]'), tq = alvo.querySelector('[data-t="qe"]'), t8 = alvo.querySelector('[data-t="80"]');
    var qeAnt = (ant.qe && !trocouAba) ? ant.qe : 0;
    var vmaxAnt = (ant.vmax && !trocouAba) ? ant.vmax : vmax;
    tween('barras', 800, function (e) {
      var vm = lerp(vmaxAnt, vmax, e);
      function Xa(v) { return bx + v / vm * bw; }
      vis.forEach(function (a, i) {
        var v0 = (ant[a.id] !== undefined && !trocouAba) ? ant[a.id] : 0;
        var v = lerp(v0, a.votos, e), w = Math.max(1, Xa(v) - bx);
        bars[i].setAttribute('width', w.toFixed(1));
        vals[i].setAttribute('x', (bx + w + 5).toFixed(1));
      });
      var q = lerp(qeAnt || qe, qe, e), xq = Xa(q), x8 = Xa(0.8 * q);
      lq.setAttribute('x1', xq.toFixed(1)); lq.setAttribute('x2', xq.toFixed(1));
      l8.setAttribute('x1', x8.toFixed(1)); l8.setAttribute('x2', x8.toFixed(1));
      tq.setAttribute('x', (xq + 3).toFixed(1)); t8.setAttribute('x', (x8 - 3).toFixed(1));
    });
    var novo = { qe: qe, vmax: vmax };
    ags.forEach(function (a) { novo[a.id] = a.votos; });
    barrasAnt[k] = novo;
  }

  /* ============================== 8. COMPARECIMENTO, ABSTENÇÃO, BRANCOS, NULOS ============================== */
  var partAnt = {};
  function desenhaPart(trocouAba) {
    var card = box.querySelector('#gxPart'), alvo = card.querySelector('[data-part]'), hora = card.querySelector('[data-hora-part]');
    var k = ui.part, d = ultimo[k], v = d && d.lido && d.lido.votos;
    var c = v && num(v.comparecimento), a = v && num(v.abstencao);
    if (!v || !c) {
      hora.textContent = '';
      alvo.innerHTML = '<p class="gx-vazio">' + (d ? 'Aguardando votos apurados (' + NOME[k] + ').' : 'Aguardando os dados do TSE…') + '</p>';
      partAnt[k] = null;
      return;
    }
    var base1 = c + (a || 0);
    var anul = (num(v.anulados) || 0) + (num(v.anuladosSubJudice) || 0);
    var seg1 = [
      { k: 'comparecimento', r: 'Comparecimento', v: c, cor: 'var(--verde)', b: base1 },
      { k: 'abstencao', r: 'Abstenção', v: a, cor: 'var(--txt3)', b: base1 }
    ];
    var seg2 = [
      { k: 'validos', r: 'Válidos', v: num(v.validos), cor: 'var(--azul)', b: c },
      { k: 'brancos', r: 'Brancos', v: num(v.brancos), cor: 'var(--barra2)', b: c },
      { k: 'nulos', r: 'Nulos', v: num(v.nulos), cor: 'var(--ambar)', b: c },
      { k: 'anulados', r: 'Anulados', v: anul, cor: 'var(--txt3)', b: c }
    ];
    hora.textContent = NOME[k] + ' · ' + f2(d.lido.apuracao.pct) + '% das seções';
    function barra(id, segs, titulo) {
      return '<div class="gx-pbar"><div class="gx-pbar__t">' + titulo + '</div>' +
        '<svg class="gx-pbar__svg" viewBox="0 0 1000 18" preserveAspectRatio="none" role="img" aria-label="' + esc(titulo + ': ' + segs.map(function (s) { return s.r + ' ' + f0(s.v) + ' (' + f1(s.v === null ? null : 100 * s.v / s.b) + '%)'; }).join('; ')) + '">' +
        segs.map(function (s, i) { return '<rect data-s="' + id + i + '" x="0" y="0" height="18" width="0" style="fill:' + s.cor + '"/>'; }).join('') + '</svg>' +
        '<ul class="gx-pleg">' + segs.map(function (s, i) {
          return '<li><span class="gx-pleg__l"><i style="background:' + s.cor + '"></i><span class="gx-pleg__r" data-explica="' + s.k + '">' + s.r + '</span></span>' +
            '<span class="gx-pleg__v"><b class="num" data-n="' + id + i + '">' + f0(s.v) + '</b> <small>' + f1(s.v === null ? null : 100 * s.v / s.b) + '%</small></span></li>';
        }).join('') + '</ul></div>';
    }
    var notas = [];
    if (num(v.eleitorado) && base1 < v.eleitorado) notas.push('Comparecimento + abstenção (' + f0(base1) + ') ainda não chega ao eleitorado (' + f0(v.eleitorado) + '): as seções que faltam não entraram. Comparecimento e abstenção sobre essa soma; o resto sobre o comparecimento.');
    else notas.push('Comparecimento e abstenção sobre o eleitorado; válidos, brancos, nulos e anulados sobre o comparecimento.');
    if (num(v.validos) && (num(v.nominais) !== null || num(v.legenda) !== null) && (k === 'dist' || k === 'fed'))
      notas.push('Válidos = <span data-explica="nominais">nominais</span> ' + f0(v.nominais) + ' + <span data-explica="legenda">de legenda</span> ' + f0(v.legenda) + '.');
    alvo.innerHTML = barra('a', seg1, 'Foi votar?') + barra('b', seg2, 'Como votou (' + NOME[k] + ')') + '<p class="gx-nota">' + notas.join(' ') + '</p>';
    varre();
    var ant = (!trocouAba && partAnt[k]) || null;
    var todos = seg1.map(function (s, i) { return { s: s, id: 'a' + i }; }).concat(seg2.map(function (s, i) { return { s: s, id: 'b' + i }; }));
    var rects = {}, nums = {};
    todos.forEach(function (x) { rects[x.id] = alvo.querySelector('[data-s="' + x.id + '"]'); nums[x.id] = alvo.querySelector('[data-n="' + x.id + '"]'); });
    tween('part', 800, function (e) {
      var acc = { a: 0, b: 0 };
      todos.forEach(function (x) {
        var g = x.id.charAt(0), fr = x.s.v ? x.s.v / x.s.b : 0;
        var fr0 = ant ? ant[x.id].fr : 0, w = lerp(fr0, fr, e) * 1000;
        var r = rects[x.id];
        r.setAttribute('x', acc[g].toFixed(1)); r.setAttribute('width', Math.max(0, w).toFixed(1));
        acc[g] += w;
        if (x.s.v !== null) nums[x.id].textContent = f0(Math.round(lerp(ant ? ant[x.id].v : 0, x.s.v, e)));
      });
    });
    var novo = {};
    todos.forEach(function (x) { novo[x.id] = { fr: x.s.v ? x.s.v / x.s.b : 0, v: x.s.v || 0 }; });
    partAnt[k] = novo;
  }

  /* ============================== 9. LIGAÇÃO ============================== */
  function redesenha(semAnima) {
    if (!prontos) return;
    desenhaCorrida('gov', semAnima); desenhaCorrida('sen', semAnima);
    desenhaBarras(!!semAnima); desenhaPart(!!semAnima);
    varre();
  }
  var pend = {}, agendado = false;
  function agenda(k) {
    pend[k] = true;
    if (agendado) return;
    agendado = true;
    setTimeout(function () {
      agendado = false;
      var p = pend; pend = {};
      if (p.gov) desenhaCorrida('gov');
      if (p.sen) desenhaCorrida('sen');
      if (p[ui.prop]) desenhaBarras(false);
      if (p[ui.part]) desenhaPart(false);
      varre();
    }, 60);
  }
  window.addEventListener('swm:dados', function (ev) {
    var d = ev && ev.detail; if (!d || !d.k) return;
    ultimo[d.k] = d;
    if (d.k === 'gov' || d.k === 'sen') guardaPonto(d.k, d);
    if (prontos) agenda(d.k);
  });

  function inicia() {
    criaPop();
    monta();
    redesenha(false);
    if (window.MutationObserver) new MutationObserver(function (lista) {
      for (var i = 0; i < lista.length; i++) {
        var t = lista[i].target;
        if (pop && (t === pop || pop.contains(t))) continue;
        agendaVarre(); return;
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();

  window.SWMGraficos = { textos: T, anexa: anexa, varre: varre, redesenha: function () { redesenha(true); } };
})();
