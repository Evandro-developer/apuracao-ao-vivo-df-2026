/*
 * app.js — Apuração ao vivo do DF, 04/10/2026.
 * JEITO A: lê direto do TSE a cada 30 s (cache-busting por janela de 15 s, para o CDN servir a todos igual).
 * JEITO B: se um arquivo falhar 3 vezes seguidas no TSE, lê ./dados/<mesmo nome> (um espelho dos
 *          arquivos do TSE servido pelo próprio site) e mostra "fonte: espelho SWM"; de 4 em 4 ciclos sonda o TSE e volta se ele responder.
 * Um arquivo que falha nunca derruba a página: fica o último dado bom.
 * Parâmetros na URL: ?base=URL (troca a base do TSE), ?espelho=URL (troca ./dados/), ?intervalo=s, ?motor=stub.
 */
(function () {
  'use strict';

  /* ================= CONFIG — o dono preenche aqui =================
     Campo vazio = a peça some (ícone, vídeo, contador). Nada aparece sem o dono preencher.
     whatsapp: só dígitos, com 55 e DDD (ex.: '5561999999999').            [PENDENTE-DONO]
     instagram, x: o endereço completo do perfil (https://...).             [PENDENTE-DONO]
     site: o endereço do site da SWM (o botão vai para cá sem WhatsApp).    [PENDENTE-DONO]
     videos: [{titulo, youtube}] — youtube = o link do vídeo; vazio = não aparece. [PENDENTE-DONO]
     goatcounter: o endereço de contagem (ex.: 'https://swm.goatcounter.com/count'); vazio = desligado. [PENDENTE-DONO] */
  var CONFIG = {
    whatsapp: '5561996810806',
    email: 'contato@scalewebmedia.com',
    instagram: '',
    x: '',
    site: 'https://scalewebmedia.com',
    videos: [
      { titulo: 'SWM Eleitoral', youtube: '' },
      { titulo: 'SWM Empresarial', youtube: '' }
    ],
    goatcounter: ''
  };
  var TEXTO_WHATS = 'Vi a apuração ao vivo Eleições 2026 DF da SWM e quero conversar';
  var TEXTO_COMP = 'Apuração ao vivo das Eleições 2026 no DF, pela Scale Web Media';

  var M = window.SWMMotor, U = window.SWMUtil, A = window.SWMAnim;
  var q = new URLSearchParams(location.search);
  function barra(u) { return /\/$/.test(u) ? u : u + '/'; }
  var BASE_PADRAO = 'https://resultados.tse.jus.br/oficial/ele2026/';
  var BASE = barra(q.get('base') || BASE_PADRAO);
  var ESPELHO = barra(q.get('espelho') || './dados/');
  var INTERVALO = Math.max(5, +q.get('intervalo') || 30) * 1000;
  var LIMITE_FALHAS = 3, SONDA_A_CADA = 4, TEMPO_MAX = 12000;

  var ARQ = {
    gov: '6259/dados/df/df-c0003-e006259-u.json',
    sen: '6259/dados/df/df-c0005-e006259-u.json',
    pres: '6257/dados/df/df-c0001-e006257-u.json',
    dist: '6259/dados/df/df-c0008-e006259-u.json',
    fed: '6259/dados/df/df-c0006-e006259-u.json'
  };
  var NOMES_PROP = {
    dist: { titulo: 'Câmara Legislativa do DF', eleitos: 'Deputados distritais eleitos se a apuração terminasse agora', eleitosFinal: 'Deputados distritais eleitos · resultado final do TSE', cargo: 'Deputado distrital' },
    fed: { titulo: 'Câmara dos Deputados · bancada do DF', eleitos: 'Deputados federais eleitos se a apuração terminasse agora', eleitosFinal: 'Deputados federais eleitos · resultado final do TSE', cargo: 'Deputado federal' }
  };
  var est = {};
  Object.keys(ARQ).forEach(function (k) { est[k] = { falhas: 0, espelho: false, ciclos: 0, json: null, lido: null, assin: null, fonte: null }; });
  var ultimoOk = 0, proximaEm = 0, propAtual = 'dist', cad = {};

  function $(id) { return document.getElementById(id); }
  function balde() { return Math.floor(Date.now() / 15000); }

  /* ---------------- leitura ---------------- */
  function busca(url) {
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, TEMPO_MAX);
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(t); if (!j || !j.carg || !j.carg[0]) throw new Error('arquivo sem cargo'); return j; },
        function (e) { clearTimeout(t); throw e; });
  }
  function carrega(k) {
    var s = est[k], nome = ARQ[k].split('/').pop();
    var urlTSE = BASE + ARQ[k] + '?t=' + balde();
    var urlEsp = ESPELHO + nome + '?t=' + balde();
    var tentaTSE = !s.espelho || (s.ciclos++ % SONDA_A_CADA === 0);
    var doEspelho = function () { return busca(urlEsp).then(function (j) { return aplica(k, j, 'espelho'); }); };
    if (!tentaTSE) return doEspelho();
    return busca(urlTSE).then(function (j) {
      s.falhas = 0; s.espelho = false; s.ciclos = 0;
      return aplica(k, j, 'tse');
    }, function () {
      s.falhas++;
      if (s.falhas >= LIMITE_FALHAS) { if (!s.espelho) s.ciclos = 1; s.espelho = true; return doEspelho(); }
      return false;
    });
  }
  function aplica(k, json, fonte) {
    var s = est[k];
    var lido;
    try { lido = M.le(json); } catch (e) { return false; }
    /* o espelho não pode fazer a página andar para trás */
    if (fonte === 'espelho' && s.lido && s.fonte === 'tse' &&
        (lido.apuracao.secoesApuradas || 0) < (s.lido.apuracao.secoesApuradas || 0)) return false;
    s.fonte = fonte; ultimoOk = Date.now();
    var assin = [json.dt, json.ht, json.s && json.s.st, json.v && json.v.vv].join('|');
    if (assin === s.assin && s.lido) return false;
    s.json = json; s.lido = lido; s.assin = assin;
    return true;
  }
  var timer = null, rodando = false;
  function ciclo() {
    if (rodando) return;
    rodando = true; clearTimeout(timer);
    var ks = Object.keys(ARQ);
    Promise.all(ks.map(function (k) { return carrega(k).catch(function () { return false; }); }))
      .then(function (mud) {
        var mudou = {}; ks.forEach(function (k, i) { mudou[k] = mud[i]; });
        try { desenha(mudou); } catch (e) { if (window.console) console.error(e); }
      })
      .then(function () { rodando = false; proximaEm = Date.now() + INTERVALO; clearTimeout(timer); timer = setTimeout(ciclo, INTERVALO); });
  }

  /* ---------------- estado geral ---------------- */
  function temVoto(l) { return !!(l && l.votos && l.votos.validos > 0); }
  /* site5 (05/10/2026): o arquivo do TSE com tf = 's' (totalizado) troca o condicional pelo resultado; nomes e números do arquivo */
  function fim(k) { return !!(est[k] && est[k].lido && est[k].lido.apuracao && est[k].lido.apuracao.totalizada === true); }
  function textoNo(el, t) { if (!el) return; var n = el.firstChild; if (n && n.nodeType === 3) n.nodeValue = t; else el.insertBefore(document.createTextNode(t), el.firstChild); }
  function horaBrasilia() {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var h = +p.filter(function (x) { return x.type === 'hour'; })[0].value, m = +p.filter(function (x) { return x.type === 'minute'; })[0].value;
      return h * 60 + m;
    } catch (e) { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }
  function horaDe(dh) {
    if (!dh) return '—';
    var m = String(dh).match(/(\d{1,2}:\d{2}(:\d{2})?)/);
    return m ? m[1] : String(dh);
  }

  /* ---------------- desenho ---------------- */
  function desenha(mudou) {
    desenhaStatus();
    try { desenhaVotos(); } catch (e) { if (window.console) console.error(e); }
    ['gov', 'sen', 'pres'].forEach(function (k) { if (mudou[k] || !est[k]._desenhado) desenhaMaj(k); });
    /* as duas casas: calcula sempre que o arquivo muda (para o aviso de entrou/saiu valer nas duas abas) */
    var mudancas = [];
    ['dist', 'fed'].forEach(function (k) {
      if ((mudou[k] || !cad[k]) && est[k].lido) {
        try { cad[k] = M.cadeiras(est[k].lido, M.REGRA_2026); } catch (e) { if (window.console) console.error(e); return; }
        fronteiraCache[k] = null;
        var m = comparaEleitos(k);
        if (m) mudancas.push(m);
      }
    });
    if (mudou[propAtual] || !est[propAtual]._desenhado) desenhaProp(propAtual, false);
    mudancas.forEach(function (m) { anunciaMudanca(m); });
    setTimeout(function () { try { desenhaFronteira(propAtual); } catch (e) { if (window.console) console.error(e); } }, 60);
    try { atualizaCartao(); } catch (e) { if (window.console) console.error(e); }
    if (!jaAbriuC) { jaAbriuC = true; try { abreDoLink(); } catch (e) { if (window.console) console.error(e); } }
    var algumEsp = Object.keys(est).some(function (k) { return est[k].fonte === 'espelho'; });
    $('fonteEspelho').hidden = !algumEsp;
    publica(mudou);
  }

  /* ---------- v3: o evento dos módulos ---------- */
  var CD_CARGO = { gov: 3, sen: 5, pres: 1, dist: 8, fed: 6 };
  function publica(mudou) {
    Object.keys(ARQ).forEach(function (k) {
      var s = est[k];
      if (!s.lido || !(mudou[k] || !s._publicado)) return;
      s._publicado = true;
      var maj = null;
      if (!cad[k]) { try { maj = M.majoritario(s.lido); } catch (e) { maj = null; } }
      try {
        window.dispatchEvent(new CustomEvent('swm:dados', { detail: {
          k: k, lido: s.lido, cad: cad[k] || null, maj: maj, json: s.json,
          horaTSE: horaDe(s.lido.apuracao && s.lido.apuracao.dataHora), recebidoEm: Date.now()
        } }));
      } catch (e) { if (window.console) console.error(e); }
    });
  }

  function desenhaStatus() {
    var l = (est.dist.lido && est.dist.lido) || est.gov.lido || est.pres.lido;
    var ag = $('aguardando');
    if (!l) {
      ag.hidden = false;
      ag.innerHTML = 'Conectando ao TSE…<small>Se demorar, a página tenta de novo sozinha a cada 30 segundos.</small>';
      return;
    }
    var a = l.apuracao;
    U.conta($('pctSecoes'), a.pct, U.f2, 1200);
    $('barraApur').style.width = Math.max(0, Math.min(100, a.pct || 0)) + '%';
    $('secoes').textContent = (a.secoesApuradas !== null && a.secoesTotais !== null)
      ? U.f0(a.secoesApuradas) + ' de ' + U.f0(a.secoesTotais) + ' seções' : '';
    $('horaTSE').textContent = horaDe(a.dataHora);
    $('horaTSE').title = a.dataHora || '';
    if (a.totalizada) $('pctRotulo').textContent = 'das seções apuradas · totalização concluída';
    var rp = document.querySelector('.rodape p b');
    if (rp && fim('gov') && fim('dist') && fim('fed')) rp.textContent = 'Fonte: TSE (resultados.tse.jus.br). Resultado final totalizado pelo TSE em ' + (a.dataHora || '—') + '.';
    var aguardando = !temVoto(est.dist.lido) && !temVoto(est.gov.lido) && !temVoto(est.pres.lido);
    document.body.classList.toggle('modo-aguardando', aguardando);
    if (aguardando) {
      var agora = horaBrasilia(), falta = 17 * 60 - agora;
      ag.hidden = false;
      if (falta > 0) {
        var h = Math.floor(falta / 60), m = falta % 60;
        ag.innerHTML = 'Aguardando o início da apuração às 17h' +
          '<small>Faltam ' + (h ? h + ' h ' : '') + m + ' min (horário de Brasília). Os números aparecem aqui assim que o TSE publicar.</small>';
      } else {
        ag.innerHTML = 'Apuração começando: aguardando as primeiras seções do TSE' +
          '<small>A página consulta o TSE a cada 30 segundos e se atualiza sozinha.</small>';
      }
    } else ag.hidden = true;
  }

  /* majoritários: barras que crescem, todos com o mesmo peso visual */
  function desenhaMaj(k) {
    var s = est[k]; if (!s.lido) return;
    s._desenhado = true;
    var card = $('maj-' + k), ol = card.querySelector('[data-lista]'), l = s.lido;
    var lista;
    try { lista = M.majoritario(l).slice(); } catch (e) { return; }
    var comVoto = temVoto(l);
    lista.sort(function (a, b) { return (b.votos - a.votos) || String(a.urna).localeCompare(String(b.urna), 'pt-BR'); });
    var nv = +(s.json && s.json.carg && s.json.carg[0] && s.json.carg[0].nv) || 1;
    card.querySelector('[data-info]').textContent = comVoto
      ? U.f2(l.apuracao.pct) + '% apurado · ' + U.f0(l.votos.validos) + ' válidos'
      : 'aguardando votos';
    if (k === 'sen') {
      var n = card.querySelector('[data-nota-sen]');
      if (n) n.textContent = (nv === 2 ? 'Duas vagas' : nv + ' vaga' + (nv > 1 ? 's' : '')) + ': ' + (nv === 2 ? 'as duas mais votadas se elegem.' : 'os mais votados se elegem.');
    }
    U.flip(ol, function () {
      var vistos = {};
      lista.forEach(function (c) {
        var id = 'c' + c.n, li = ol.querySelector('[data-n="' + id + '"]');
        if (!li) {
          li = document.createElement('li'); li.className = 'cand'; li.dataset.n = id;
          li.innerHTML = '<div class="cand__linha"><span class="cand__nome"></span><span class="cand__votos"></span><span class="cand__pct num">0,00%</span></div>' +
            '<div class="cand__trilho"><div class="cand__barra"></div>' + (k === 'sen' ? '' : '<i class="cand__meio" title="50% (conta do TSE)"></i>') + '</div>';
        }
        li.querySelector('.cand__nome').innerHTML = U.esc(c.urna) + ' <small>' + U.esc(c.sigla || '') + '</small>';
        vistos[id] = true;
        ol.appendChild(li);
      });
      Array.prototype.forEach.call(ol.querySelectorAll('.corte-vagas'), function (x) { x.remove(); });
      Array.prototype.forEach.call(ol.querySelectorAll('.cand'), function (li) { if (!vistos[li.dataset.n]) li.remove(); });
      if (k === 'sen' && comVoto && lista.length > nv) {
        var corte = document.createElement('li'); corte.className = 'corte-vagas';
        corte.textContent = fim('sen') ? 'acima: as ' + nv + ' eleitas, resultado final' : 'acima: as ' + nv + ' vagas, se terminasse agora';
        ol.insertBefore(corte, ol.children[nv]);
      }
    });
    if (k === 'gov') seloTurno(lista, comVoto);
    lista.forEach(function (c) {
      var li = ol.querySelector('[data-n="c' + c.n + '"]'); if (!li) return;
      /* site2: no governador, o % sobre os válidos (o mesmo do selo e da marca de 50%); nos outros, o % do TSE */
      var pct = comVoto ? ((k === 'gov') ? pctGov(c) : (c.pct || 0)) : 0;
      U.conta(li.querySelector('.cand__pct'), pct, function (v) { return U.f2(v) + '%'; }, 1000);
      li.querySelector('.cand__votos').textContent = comVoto ? U.f0(c.votos) + ' votos' : '';
      requestAnimationFrame(function () { li.querySelector('.cand__barra').style.width = Math.max(0, Math.min(100, pct)) + '%'; });
    });
  }

  /* hemiciclo: posições das cadeiras em fileiras semicirculares */
  var geoCache = {};
  function geometria(n) {
    if (geoCache[n]) return geoCache[n];
    /* site2: arco contínuo — menos fileiras, mais juntas, cadeiras quase encostadas (o espaço entre elas ~ o diâmetro) */
    var filas = n <= 10 ? 1 : n <= 30 ? 2 : 4;
    var r0 = filas === 2 ? 80 : 56, r1 = filas === 1 ? 92 : 104, raios = [];
    for (var i = 0; i < filas; i++) raios.push(r0 + (r1 - r0) * (filas === 1 ? 1 : i / (filas - 1)));
    var soma = raios.reduce(function (s, r) { return s + r; }, 0);
    var por = raios.map(function (r) { return Math.max(1, Math.round(n * r / soma)); });
    var dif = n - por.reduce(function (s, x) { return s + x; }, 0);
    por[por.length - 1] += dif;
    var pts = [];
    raios.forEach(function (r, i) {
      var m = por[i];
      for (var j = 0; j < m; j++) {
        var folga = filas === 1 ? 0.07 * Math.PI : 0; /* fileira única: as pontas sobem, para não cortar a cadeira */
        var ang = Math.PI - folga - (m === 1 ? Math.PI / 2 - folga : (j / (m - 1)) * (Math.PI - 2 * folga));
        pts.push({ x: 115 + r * Math.cos(ang), y: 116 - r * Math.sin(ang), ang: ang });
      }
    });
    pts.sort(function (a, b) { return (b.ang - a.ang) || (a.y - b.y); });
    var raio = n <= 10 ? 15 : n <= 30 ? 11 : 6;
    return (geoCache[n] = { pts: pts, raio: raio });
  }

  function desenhaProp(k, trocou) {
    var s = est[k], nomes = NOMES_PROP[k];
    $('hemiTitulo').textContent = nomes.titulo;
    $('eleitosTitulo').textContent = fim(k) ? nomes.eleitosFinal : nomes.eleitos;
    var fk = fim(k), sp = document.querySelector('.selo-parcial');
    if (sp) { textoNo(sp, fk ? 'resultado final' : 'se terminasse agora'); sp.classList.toggle('selo-parcial--final', fk); }
    if ($('tProp')) $('tProp').textContent = fk ? 'As cadeiras: o resultado final' : 'As cadeiras, se a apuração terminasse agora';
    if ($('hemiSvg')) $('hemiSvg').setAttribute('aria-label', fk ? 'Cadeiras por agremiação: o resultado final do TSE' : 'Cadeiras por agremiação se a apuração terminasse agora');
    var ft = document.querySelector('#fronteiraCard h3'); if (ft) ft.textContent = fk ? 'A fronteira: o último eleito e o primeiro de fora' : 'A fronteira, se terminasse agora';
    var mn = document.querySelector('#mudancasCard .eleitos__nota');
    if (mn) mn.textContent = fk ? 'Quem entrou e quem saiu da lista dos eleitos durante a apuração, com a hora do TSE.' : 'Quem entrou e quem saiu da lista dos eleitos se terminasse agora, com a hora do TSE.';
    var gs = document.querySelector('.gx-selo'); /* o selo do gráfico de barras do mod_graficos */
    if (gs) { textoNo(gs, fk ? 'resultado final ' : 'se terminasse agora '); gs.classList.toggle('selo-parcial--final', fk); }
    if (!s.lido) return;
    s._desenhado = true;
    var l = s.lido, c;
    c = cad[k];
    if (!c) { try { c = M.cadeiras(l, M.REGRA_2026); } catch (e) { if (window.console) console.error(e); return; } cad[k] = c; }
    var vagas = c.vagas || (l.cargo && l.cargo.vagas) || 0;
    var aguardando = !!c.aguardando || !temVoto(l);
    var cor = U.corDe(l.agremiacoes);
    U.conta($('hemiVagas'), vagas, U.f0, 600);

    /* ordem das agremiações: mais cadeiras, depois mais votos */
    var ags = (c.agremiacoes || []).slice().sort(function (a, b) { return (b.cadeiras - a.cadeiras) || (b.votos - a.votos); });
    var cores = [];
    assentoDe = {};
    if (!aguardando) ags.forEach(function (a) { assentoDe[String(a.id)] = { ini: cores.length, n: a.cadeiras }; for (var i = 0; i < a.cadeiras; i++) cores.push(cor(a.id)); });

    var g = geometria(vagas), svg = $('hemiSvg');
    if (svg.childNodes.length !== g.pts.length) {
      svg.innerHTML = g.pts.map(function (p) {
        return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + g.raio.toFixed(1) + '" fill="#1d2840" stroke="#33415f" stroke-width="1"></circle>';
      }).join('');
    }
    Array.prototype.forEach.call(svg.childNodes, function (ci, i) {
      ci.style.transitionDelay = (i * 35) + 'ms';
      ci.setAttribute('fill', cores[i] || '#1d2840');
      ci.setAttribute('stroke', cores[i] ? 'rgba(11,15,25,.6)' : '#33415f');
    });

    $('hemiQE').innerHTML = aguardando
      ? 'Aguardando votos. As cadeiras se colorem com a apuração.'
      : 'Quociente eleitoral' + (fim(k) ? '' : ' agora') + ': <b>' + U.f0(c.qe) + '</b> votos por cadeira · ' + U.f2(l.apuracao.pct) + '% das seções';

    var leg = $('legenda');
    var comCad = ags.filter(function (a) { return a.cadeiras > 0; });
    if (aguardando || !comCad.length) {
      leg.innerHTML = '<li class="so"><span class="vazio">' + U.f0(l.agremiacoes.length) + ' agremiações na disputa. As cadeiras aparecem com os primeiros votos apurados.</span></li>';
    } else {
      var semCad = ags.length - comCad.length;
      leg.innerHTML = comCad.map(function (a) {
        var pv = l.votos.validos ? a.votos / l.votos.validos * 100 : null;
        return '<li><span class="cor" style="background:' + cor(a.id) + '"></span><span class="sig" title="' + U.esc(a.sigla) + '">' + U.esc(a.sigla) + '</span>' +
          '<span class="vts">' + U.f0(a.votos) + ' · ' + U.f2(pv) + '%</span><span class="cad">' + a.cadeiras + '</span></li>';
      }).join('') + (semCad ? '<li class="so"><span class="vazio">+ ' + semCad + ' agremiaç' + (semCad > 1 ? 'ões' : 'ão') + ' sem cadeira' + (fim(k) ? '' : ' se terminasse agora') + '</span></li>' : '');
    }

    /* eleitos se terminasse agora: mesmo peso para todos */
    var ol = $('eleitos');
    if (aguardando || !(c.eleitos && c.eleitos.length)) {
      ol.innerHTML = '<li class="vazio">A lista aparece com os primeiros votos apurados.</li>';
    } else {
      var candN = {}; l.candidatos.forEach(function (x) { candN[String(x.n)] = x; });
      var ordemAg = {}; ags.forEach(function (a, i) { ordemAg[String(a.id)] = i; });
      var el = c.eleitos.map(function (e) { var x = candN[String(e.n)] || {}; return { e: e, ag: String(x.agremiacaoId) }; })
        .sort(function (a, b) { return ((ordemAg[a.ag] || 0) - (ordemAg[b.ag] || 0)) || (b.e.votos - a.e.votos); });
      ol.innerHTML = el.map(function (x, i) {
        var e = x.e;
        return '<li class="eleito' + (novosDestaque[k + '-' + e.n] ? ' eleito--novo' : '') + '" data-n="' + U.esc(String(e.n)) + '" style="--c:' + cor(x.ag) + ';animation-delay:' + Math.min(i * 25, 600) + 'ms">' +
          '<div class="eleito__nome">' + U.esc(e.urna) + '</div>' +
          '<div class="eleito__info"><span>' + U.esc(e.sigla || '') + ' · ' + U.f0(e.votos) + '</span><span class="eleito__como">' + (e.como === 'QP' ? 'QP' : 'média') + '</span></div></li>';
      }).join('');
    }

    /* a animação: números reais se houver voto; senão, o exemplo didático */
    if (A) {
      if (aguardando) A.atualiza(null, trocou);
      else A.atualiza({ exemplo: false, lido: l, cad: c, cargo: nomes.cargo, cor: cor }, trocou);
    }
  }

  /* ---------------- relógio: "atualizado há X s" ---------------- */
  function relogio() {
    var t = $('atualizadoHa'), p = document.querySelector('.atualizado .pulso');
    if (!ultimoOk) { t.textContent = 'consultando o TSE…'; }
    else {
      var s = Math.round((Date.now() - ultimoOk) / 1000), prox = Math.max(0, Math.round((proximaEm - Date.now()) / 1000));
      var ha = s < 60 ? s + ' s' : Math.floor(s / 60) + ' min';
      t.textContent = 'consultado há ' + ha + (proximaEm ? ' · próxima em ' + prox + ' s' : '');
      p.classList.toggle('parado', s > INTERVALO / 1000 * 3);
    }
  }

  /* ---------------- abas e contato ---------------- */
  function abas(id, attr, aoTrocar) {
    var box = $(id);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      aoTrocar(b.dataset[attr]);
    });
  }
  /* ================= site2: as peças novas (04/10/2026) ================= */
  var fronteiraCache = {}, jaAbriuC = false, assentoDe = {}, novosDestaque = {}, prevEleitos = {}, registro = [];
  var NOME_CARGO = { gov: 'Governador', sen: 'Senador', pres: 'Presidente (votos no DF)', dist: 'Deputado distrital', fed: 'Deputado federal' };
  var CURTO_CARGO = { gov: 'Governador', sen: 'Senado', pres: 'Presidente no DF', dist: 'Distrital', fed: 'Federal' };
  var SLUG = { gov: 'governador', sen: 'senador', pres: 'presidente', dist: 'distrital', fed: 'federal' };
  var DE_SLUG = {}; Object.keys(SLUG).forEach(function (k) { DE_SLUG[SLUG[k]] = k; DE_SLUG[k] = k; });
  var cartaoAberto = null;

  function semAcento(t) { return String(t === null || t === undefined ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function porV(a, b) { return ((b.votos || 0) - (a.votos || 0)) || String(a.urna || '').localeCompare(String(b.urna || ''), 'pt-BR'); }
  function plural(n, um, varios) { return n === 1 ? um : varios; }
  function ordinal(n) { return n + 'ª'; }

  /* ---------- 3. comparecimento, abstenção, brancos e nulos ---------- */
  function desenhaVotos() {
    var l = est.dist.lido || est.gov.lido || est.pres.lido, box = $('statusVotos');
    if (!l || !l.votos) { box.innerHTML = ''; return; }
    var v = l.votos;
    function pc(a, b) { return (a === null || a === undefined || !b) ? '' : '<small>' + U.f2(100 * a / b) + '%</small>'; }
    var aptosApur = (v.comparecimento != null && v.abstencao != null) ? v.comparecimento + v.abstencao : null; /* parcial: a base é o eleitorado das seções apuradas, não o total (04/10, achado do módulo de gráficos) */
    var itens = [
      ['Comparecimento', v.comparecimento, pc(v.comparecimento, aptosApur)],
      ['Abstenção', v.abstencao, pc(v.abstencao, aptosApur)],
      ['Brancos', v.brancos, pc(v.brancos, v.comparecimento)],
      ['Nulos', v.nulos, pc(v.nulos, v.comparecimento)]
    ];
    box.innerHTML = itens.map(function (it) {
      return '<div class="sv"><span class="sv__rot">' + it[0] + '</span><span class="sv__num num">' + U.f0(it[1]) + '</span>' + it[2] + '</div>';
    }).join('') + '<p class="sv__nota">Brancos e nulos: votos para ' + U.esc(semCargoVazio(l)) + '. Comparecimento e abstenção sobre o eleitorado das seções já apuradas' +
      (aptosApur ? ' (' + U.f0(aptosApur) + ')' : '') + '; brancos e nulos sobre o comparecimento.</p>';
  }
  function semCargoVazio(l) { return (l.cargo && l.cargo.nome) ? String(l.cargo.nome).toLowerCase() : 'este cargo'; }

  /* ---------- 2. governador: 1º ou 2º turno, se terminasse agora ---------- */
  /* governador: o % que o próprio TSE publica (pvapn = votos ÷ (válidos + anulados + anulados sub judice)), para o site
     bater com a tela oficial e não anunciar 1º turno antes dela */
  function pctGov(c) { return (c && c.pct !== null && c.pct !== undefined) ? c.pct : (c && c.pctValidos !== undefined ? c.pctValidos : null); }
  var chaveSelo = '';
  /* o 2º turno (25/10/2026): lido de dados/segundo_turno.json, gerado por dia5/final_2turno/gera_2turno.py do arquivo oficial do TSE */
  var segTurno = null, ultSelo = null;
  try {
    fetch('dados/segundo_turno.json?v=20261119s6', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.totalizado && d.candidatos && d.candidatos.length >= 2) { segTurno = d; chaveSelo = ''; if (ultSelo) seloTurno(ultSelo[0], ultSelo[1]); } })
      .catch(function () { /* sem o arquivo: o selo fica só com o 1º turno */ });
  } catch (e) { /* navegador antigo */ }
  function linhaSegTurno() {
    if (!segTurno) return '';
    var a = segTurno.candidatos[0], b = segTurno.candidatos[1];
    return '<small class="selo-turno__2t">2º turno, ' + U.esc(segTurno.data) + ': <b>' + U.esc(a.urna) + '</b> ' + (/^Eleit/.test(a.situacao) ? 'eleita' : U.esc(a.situacao.toLowerCase())) +
      ' com ' + U.f2(a.pct) + '% dos válidos (' + U.f0(a.votos) + ' votos) · ' + U.esc(b.urna) + ' ' + U.f2(b.pct) + '% (' + U.f0(b.votos) + '). Fonte: TSE.</small>';
  }
  function seloTurno(lista, comVoto) {
    ultSelo = [lista, comVoto];
    var el = $('seloTurno');
    var a = lista[0], b = lista[1];
    if (!comVoto || !a || pctGov(a) === null) { el.hidden = true; chaveSelo = ''; return; }
    var html, chave;
    if (fim('gov')) {
      var seg = lista.filter(function (x) { return /2º turno/.test(x.situacaoTSE || ''); });
      var ele = lista.filter(function (x) { return /^Eleit/.test(x.situacaoTSE || ''); });
      if (seg.length >= 2) {
        chave = 'F2|' + seg[0].n + '|' + seg[1].n + (segTurno ? '|2t' : '');
        html = '<span class="selo-turno__rot">Resultado final: 2º turno entre</span><b>' + U.esc(seg[0].urna) + ' e ' + U.esc(seg[1].urna) + '</b> <small>na conta do TSE: ' +
          U.esc(seg[0].urna) + ' ' + U.f2(pctGov(seg[0])) + '% · ' + U.esc(seg[1].urna) + ' ' + U.f2(pctGov(seg[1])) + '%</small>' + linhaSegTurno();
      } else if (ele.length) {
        chave = 'F1|' + ele[0].n;
        html = '<span class="selo-turno__rot">Resultado final: eleito no 1º turno</span><b>' + U.esc(ele[0].urna) + '</b> <small>' + U.f2(pctGov(ele[0])) + '% na conta do TSE</small>';
      } else { el.hidden = true; return; }
    } else if (pctGov(a) > 50) {
      chave = '1|' + a.n;
      html = '<span class="selo-turno__rot">Venceria no 1º turno, se terminasse agora</span><b>' + U.esc(a.urna) + '</b> <small>' + U.f2(pctGov(a)) + '% na conta do TSE</small>';
    } else if (b) {
      chave = '2|' + a.n + '|' + b.n;
      html = '<span class="selo-turno__rot">Iria ao 2º turno, se terminasse agora</span><b>' + U.esc(a.urna) + ' × ' + U.esc(b.urna) + '</b> <small>ninguém passa de 50% na conta do TSE (' + U.esc(a.urna) + ': ' + U.f2(pctGov(a)) + '%)</small>';
    } else { el.hidden = true; return; }
    el.innerHTML = html; el.hidden = false;
    if (chave !== chaveSelo) { el.classList.remove('selo-turno--anima'); void el.offsetWidth; el.classList.add('selo-turno--anima'); chaveSelo = chave; }
  }

  /* ---------- 4. quem entrou / quem saiu ---------- */
  function comparaEleitos(k) {
    var c = cad[k], l = est[k].lido;
    if (!c || c.aguardando || !temVoto(l)) return null;
    var atual = {}; (c.eleitos || []).forEach(function (e) { atual[String(e.n)] = e; });
    var prev = prevEleitos[k]; prevEleitos[k] = atual;
    if (!prev) return null;
    var entrou = [], saiu = [];
    Object.keys(atual).forEach(function (n) { if (!prev[n]) entrou.push(atual[n]); });
    Object.keys(prev).forEach(function (n) { if (!atual[n]) saiu.push(prev[n]); });
    Object.keys(novosDestaque).forEach(function (x) { if (x.indexOf(k + '-') === 0) delete novosDestaque[x]; });
    if (!entrou.length && !saiu.length) return null;
    entrou.forEach(function (e) { novosDestaque[k + '-' + e.n] = true; });
    return { k: k, entrou: entrou, saiu: saiu, hora: horaDe(l.apuracao.dataHora), pct: l.apuracao.pct };
  }
  var filaAviso = [], avisoAtivo = false;
  function anunciaMudanca(m) {
    registro.unshift(m); registro = registro.slice(0, 15);
    var ol = $('mudancas');
    ol.innerHTML = registro.map(function (r, i) {
      var t = r.entrou.map(function (e) { return '<span class="mud__entra">entra <b>' + U.esc(e.urna) + '</b> <small>' + U.esc(e.sigla || '') + '</small></span>'; })
        .concat(r.saiu.map(function (e) { return '<span class="mud__sai">sai <s>' + U.esc(e.urna) + '</s> <small>' + U.esc(e.sigla || '') + '</small></span>'; })).join(' ');
      return '<li class="mud' + (i === 0 ? ' mud--nova' : '') + '"><span class="mud__hora num">' + U.esc(r.hora) + '</span><span class="mud__cargo">' + CURTO_CARGO[r.k] + '</span><span class="mud__txt">' + t +
        ' <small class="mud__pct">· ' + U.f2(r.pct) + '% das seções</small></span></li>';
    }).join('');
    if (m.k === propAtual) efeitoHemiciclo(m);
    filaAviso.push(m); if (!avisoAtivo) proximoAviso();
  }
  function efeitoHemiciclo(m) {
    var svg = $('hemiSvg');
    m.entrou.forEach(function (e) {
      var s = assentoDe[String(e.agremiacaoId)]; if (!s || !s.n) return;
      var ci = svg.childNodes[s.ini + s.n - 1]; if (!ci) return;
      ci.classList.remove('pisca'); void ci.getBoundingClientRect(); ci.classList.add('pisca');
      setTimeout(function () { ci.classList.remove('pisca'); }, 4200);
    });
    var ol = $('eleitos');
    m.saiu.forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'eleito eleito--saindo';
      li.innerHTML = '<div class="eleito__nome"><s>' + U.esc(e.urna) + '</s></div><div class="eleito__info"><span>' + U.esc(e.sigla || '') + ' · sai</span></div>';
      ol.appendChild(li);
      setTimeout(function () { if (li.parentNode) li.parentNode.removeChild(li); }, 3200);
    });
  }
  function proximoAviso() {
    var m = filaAviso.shift(), el = $('aviso');
    if (!m) { avisoAtivo = false; return; }
    avisoAtivo = true;
    var linhas = m.entrou.map(function (e) { return '<div class="aviso__entra"><span class="aviso__tag">Entra</span><b>' + U.esc(e.urna) + '</b><small>' + U.esc(e.sigla || '') + ' · ' + U.f0(e.votos) + ' votos</small></div>'; })
      .concat(m.saiu.map(function (e) { return '<div class="aviso__sai"><span class="aviso__tag">Sai</span><s>' + U.esc(e.urna) + '</s><small>' + U.esc(e.sigla || '') + '</small></div>'; }));
    el.innerHTML = '<div class="aviso__cab">' + NOME_CARGO[m.k] + ' · se terminasse agora · hora do TSE ' + U.esc(m.hora) + '</div>' + linhas.join('') +
      '<button type="button" class="aviso__x" aria-label="Fechar">×</button>';
    el.hidden = false; el.classList.remove('aviso--sai'); void el.offsetWidth; el.classList.add('aviso--entra');
    var fecha = function () {
      if (el._t) clearTimeout(el._t); el._t = null;
      el.classList.remove('aviso--entra'); el.classList.add('aviso--sai');
      setTimeout(function () { el.hidden = true; el.classList.remove('aviso--sai'); proximoAviso(); }, 450);
    };
    el.querySelector('.aviso__x').onclick = fecha;
    el._t = setTimeout(fecha, 7000);
  }

  /* ---------- 5. a fronteira ---------- */
  /* Votos que faltam para a próxima cadeira: o motor recalcula as cadeiras com +x votos para o 1º de fora da agremiação
     (os outros votos parados; o QE muda junto, porque os válidos sobem). Busca: dobra e depois bissecção. */
  function comMais(l, agId, cn, x) {
    var ags = l.agremiacoes.map(function (a) { return String(a.id) === String(agId) ? Object.assign({}, a, { votos: a.votos + x }) : a; });
    var cands = l.candidatos.map(function (c) { return (String(c.n) === String(cn) && String(c.agremiacaoId) === String(agId)) ? Object.assign({}, c, { votos: c.votos + x }) : c; });
    return Object.assign({}, l, { agremiacoes: ags, candidatos: cands, votos: Object.assign({}, l.votos, { validos: (l.votos.validos || 0) + x }) });
  }
  function cadeirasCom(l, agId, cn, x) {
    var c = M.cadeiras(comMais(l, agId, cn, x), M.REGRA_2026), r = 0;
    c.agremiacoes.forEach(function (a) { if (String(a.id) === String(agId)) r = a.cadeiras; });
    return r;
  }
  function faltamParaProxima(l, a, cand, qe) {
    if (!cand) return null;
    var alvo = a.cadeiras + 1, teto = Math.max(1000, (l.votos.validos || 0) * 2), hi = Math.max(1, Math.round((qe || 1000) / 20)), lo = 0;
    while (cadeirasCom(l, a.id, cand.n, hi) < alvo) { lo = hi; hi *= 2; if (hi > teto) return null; }
    while (hi - lo > 1) { var mid = Math.floor((lo + hi) / 2); if (cadeirasCom(l, a.id, cand.n, mid) >= alvo) hi = mid; else lo = mid; }
    return hi;
  }
  function fronteiraDe(k) {
    if (fronteiraCache[k]) return fronteiraCache[k];
    var c = cad[k], l = est[k].lido;
    if (!c || !l || c.aguardando || !temVoto(l) || !c.eleitos || !c.eleitos.length) return null;
    var dentroSet = {}; c.eleitos.forEach(function (e) { dentroSet[String(e.n)] = true; });
    var aptos = l.candidatos.filter(function (x) { return x.elegivel; });
    var dentro = aptos.filter(function (x) { return dentroSet[String(x.n)]; }).sort(porV);
    var fora = aptos.filter(function (x) { return !dentroSet[String(x.n)]; }).sort(porV);
    var porAg = {}; aptos.forEach(function (x) { (porAg[x.agremiacaoId] = porAg[x.agremiacaoId] || []).push(x); });
    var medias = []; (c.passos || []).forEach(function (p) { if (p.tipo === 'media' && p.numeros && p.numeros.rodada > 0 && isFinite(p.numeros.media)) medias.push(p.numeros.media); });
    var menorMedia = medias.length ? Math.min.apply(null, medias) : null;
    var ags = c.agremiacoes.filter(function (a) { return a.votos > 0; }).sort(function (a, b) { return b.votos - a.votos; }).map(function (a) {
      var lista = (porAg[a.id] || []).slice().sort(porV);
      var dA = lista.filter(function (x) { return dentroSet[String(x.n)]; }), fA = lista.filter(function (x) { return !dentroSet[String(x.n)]; });
      var falta = null;
      try { falta = faltamParaProxima(l, a, fA[0], c.qe); } catch (e) { falta = null; }
      return { id: a.id, sigla: a.sigla, votos: a.votos, cadeiras: a.cadeiras, ultimo: dA[dA.length - 1] || null, primeiro: fA[0] || null,
        mediaProx: a.votos / (a.cadeiras + 1), faltam: falta };
    });
    /* a fronteira da casa: o último a entrar = quem levou a última cadeira das médias (a menor média vencedora);
       o primeiro de fora = o 1º de fora da agremiação que precisa de menos votos para a próxima cadeira (conta do motor) */
    var ultN = null; (c.passos || []).forEach(function (p) { if (p.tipo === 'media' && p.numeros && p.numeros.eleito !== undefined && p.numeros.eleito !== null) ultN = String(p.numeros.eleito); });
    var ultimo = null; if (ultN) dentro.forEach(function (x) { if (String(x.n) === ultN) ultimo = x; });
    var prox = null; ags.forEach(function (a) { if (a.faltam !== null && a.primeiro && (!prox || a.faltam < prox.faltam)) prox = a; });
    return (fronteiraCache[k] = { ultimo: ultimo || dentro[dentro.length - 1] || null, ultimoMedia: !!ultimo, primeiro: prox ? prox.primeiro : (fora[0] || null), faltam: prox ? prox.faltam : null, ags: ags, menorMedia: menorMedia, qe: c.qe });
  }
  function desenhaFronteira(k) {
    var box = $('fronteira'), boxAg = $('fronteiraAgs');
    var f = fronteiraDe(k);
    if (!f || !f.ultimo || !f.primeiro) {
      box.innerHTML = '<p class="vazio">A fronteira aparece com os primeiros votos apurados.</p>'; boxAg.innerHTML = ''; return;
    }
    var u = f.ultimo, p = f.primeiro, d = u.votos - p.votos, temF = f.faltam !== null;
    var aperto = temF ? Math.max(4, Math.min(100, 100 * (1 - f.faltam / (f.qe || 1)))) : (u.votos ? Math.max(4, Math.min(100, 100 * p.votos / u.votos)) : 0);
    var meio = temF
      ? '<span class="fr__dist num">' + U.f0(f.faltam) + ' ' + plural(f.faltam, 'voto', 'votos') + '</span><small>a mais para ' + U.esc(p.sigla || '') + ' fazer mais uma cadeira e ' + U.esc(p.urna) + ' entrar (os outros votos parados)</small>'
      : '<span class="fr__dist num">' + (d >= 0 ? U.f0(d) + ' ' + plural(d, 'voto', 'votos') : U.f0(-d) + ' votos a mais') + '</span><small>' + (d >= 0 ? 'separam os dois' : 'para o primeiro de fora, que fica fora pela conta da agremiação') + '</small>';
    box.innerHTML = '<div class="fr">' +
      '<div class="fr__lado fr__dentro"><span class="fr__rot">' + (fim(k) ? 'Último eleito' : 'Último a entrar') + '</span><b>' + U.esc(u.urna) + '</b><small>' + U.esc(u.sigla || '') + ' · ' + U.f0(u.votos) + ' votos' + (f.ultimoMedia && f.menorMedia !== null ? ' · a última cadeira, pela média de ' + U.f0(f.menorMedia) : '') + '</small></div>' +
      '<div class="fr__meio"><div class="fr__barra' + (aperto > 90 ? ' fr__barra--tensa' : '') + '"><i style="width:0%"></i></div>' + meio + '</div>' +
      '<div class="fr__lado fr__fora"><span class="fr__rot">Primeiro de fora</span><b>' + U.esc(p.urna) + '</b><small>' + U.esc(p.sigla || '') + ' · ' + U.f0(p.votos) + ' votos</small></div>' +
      '</div>';
    var bar = box.querySelector('.fr__barra i');
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = aperto.toFixed(1) + '%'; }); });
    boxAg.innerHTML = (f.menorMedia !== null ? '<p class="fra__nota">Menor média que levou cadeira' + (fim(k) ? '' : ' agora') + ': <b>' + U.f2(f.menorMedia) + '</b>. “Faltam” = votos a mais para o 1º de fora da lista, com os outros votos parados, até a agremiação ganhar a próxima cadeira (o motor refaz a conta inteira; o quociente sobe junto).</p>' : '') +
      '<ul class="fra">' + f.ags.map(function (a) {
        var t = '<li class="fra__li"><div class="fra__cab"><b>' + U.esc(a.sigla) + '</b><span class="num">' + U.f0(a.votos) + ' votos · ' + a.cadeiras + ' ' + plural(a.cadeiras, 'cadeira', 'cadeiras') + '</span></div><div class="fra__corpo">';
        if (a.ultimo) t += '<span>Último dentro: <b>' + U.esc(a.ultimo.urna) + '</b> ' + U.f0(a.ultimo.votos) + '</span>';
        if (a.primeiro) t += '<span>1º de fora: <b>' + U.esc(a.primeiro.urna) + '</b> ' + U.f0(a.primeiro.votos) + (a.ultimo ? ' · a ' + U.f0(a.ultimo.votos - a.primeiro.votos) + ' do último dentro' : '') + '</span>';
        t += '<span>Média para a ' + ordinal(a.cadeiras + 1) + ' cadeira: ' + U.f2(a.mediaProx) + '</span>';
        t += '<span class="fra__falta">' + (a.faltam !== null ? 'Faltam <b>' + U.f0(a.faltam) + '</b> votos para a ' + ordinal(a.cadeiras + 1) + ' cadeira' : 'Próxima cadeira: — (sem conta exata)') + '</span>';
        return t + '</div></li>';
      }).join('') + '</ul>';
  }

  /* ---------- 6. pesquise seu candidato ---------- */
  function indice() {
    var r = [];
    Object.keys(ARQ).forEach(function (k) {
      var l = est[k].lido; if (!l || !l.candidatos) return;
      l.candidatos.forEach(function (c) { r.push({ k: k, n: c.n, urna: c.urna, sigla: c.sigla, alvo: semAcento((c.urna || '') + ' ' + (c.nome || '')) }); });
    });
    return r;
  }
  function busca2(txt) {
    var t = semAcento(txt); if (!t) return [];
    var dig = /^\d+$/.test(t), palavras = t.split(/\s+/);
    return indice().filter(function (x) {
      if (dig) return String(x.n).indexOf(t) === 0;
      return palavras.every(function (p) { return x.alvo.indexOf(p) >= 0; });
    }).sort(function (a, b) { if (dig) { var ea = String(a.n) === t ? 0 : 1, eb = String(b.n) === t ? 0 : 1; if (ea !== eb) return ea - eb; } var ia = semAcento(a.urna).indexOf(t) === 0 ? 0 : 1, ib = semAcento(b.urna).indexOf(t) === 0 ? 0 : 1; return (ia - ib) || String(a.urna).localeCompare(String(b.urna), 'pt-BR'); }).slice(0, 15);
  }
  function mostraResultados() {
    var ul = $('buscaRes'), v = $('buscaInput').value, r = busca2(v);
    if (!semAcento(v)) { ul.hidden = true; ul.innerHTML = ''; return; }
    ul.hidden = false;
    ul.innerHTML = r.length ? r.map(function (x) {
      return '<li><button type="button" data-cand="' + x.k + '|' + U.esc(String(x.n)) + '"><b>' + U.esc(x.urna) + '</b><small>' + CURTO_CARGO[x.k] + ' · ' + U.esc(x.sigla || '') + ' · nº ' + U.esc(String(x.n)) + '</small></button></li>';
    }).join('') : '<li class="vazio">' + (indice().length ? 'Nenhum candidato com esse nome ou número.' : 'Carregando os candidatos do TSE…') + '</li>';
  }
  function infoCandidato(k, n) {
    var l = est[k].lido; if (!l) return null;
    var c = null; l.candidatos.forEach(function (x) { if (String(x.n) === String(n)) c = x; });
    if (!c) return null;
    var comVoto = temVoto(l), validos = l.votos.validos || 0;
    var todos = l.candidatos.slice().sort(porV), pos = todos.indexOf(c) + 1;
    var r = { k: k, c: c, comVoto: comVoto, pos: pos, total: todos.length, pct: validos ? 100 * c.votos / validos : null, linhas: [], status: '', fora: false };
    if (k === 'dist' || k === 'fed') {
      var ca = cad[k], ag = null, nomeAg = c.sigla;
      (l.agremiacoes || []).forEach(function (a) { if (String(a.id) === String(c.agremiacaoId)) ag = a; });
      if (ag) nomeAg = ag.sigla || ag.nome || c.sigla;
      var daAg = l.candidatos.filter(function (x) { return String(x.agremiacaoId) === String(c.agremiacaoId); }).sort(porV);
      r.posAg = daAg.indexOf(c) + 1; r.totalAg = daAg.length; r.nomeAg = nomeAg;
      if (!c.elegivel) r.linhas.push('O voto deste candidato vai para a legenda: ele não pode ser eleito.');
      if (comVoto && ca && !ca.aguardando) {
        var dentro = {}; ca.eleitos.forEach(function (e) { dentro[String(e.n)] = e; });
        if (fim(k)) {
          r.status = c.eleitoTSE ? 'Eleito · resultado final' : ((c.situacaoTSE || 'Não eleito') + ' · resultado final');
          r.fora = !c.eleitoTSE;
          if (c.eleitoTSE && c.situacaoTSE) r.linhas.push(U.esc(c.situacaoTSE) + ' (situação no arquivo do TSE).');
          var dF = daAg.filter(function (x) { return x.eleitoTSE; }), uF = dF[dF.length - 1];
          if (!c.eleitoTSE && uF) r.linhas.push('Ficou a <b>' + U.f0(uF.votos - c.votos) + '</b> votos de ' + U.esc(uF.urna) + ', o último eleito por ' + U.esc(nomeAg) + ' (' + U.f0(uF.votos) + ').');
          else if (!c.eleitoTSE) r.linhas.push(U.esc(nomeAg) + ' não fez cadeira.');
        } else if (dentro[String(c.n)]) { r.status = 'Entraria, se terminasse agora'; r.linhas.push(dentro[String(c.n)].como === 'QP' ? 'Pelo quociente partidário (QP).' : 'Pelas sobras (média).'); }
        else {
          r.status = 'Não entraria, se terminasse agora'; r.fora = true;
          var dA = daAg.filter(function (x) { return dentro[String(x.n)]; }), ult = dA[dA.length - 1];
          if (ult) r.linhas.push('Está a <b>' + U.f0(ult.votos - c.votos) + '</b> votos de ' + U.esc(ult.urna) + ', o último a entrar por ' + U.esc(nomeAg) + ' (' + U.f0(ult.votos) + ').');
          else r.linhas.push(U.esc(nomeAg) + ' não faz cadeira se terminasse agora.');
          if (k === propAtual || fronteiraCache[k]) {
            var f = fronteiraDe(k);
            if (f) f.ags.forEach(function (a) { if (String(a.id) === String(c.agremiacaoId) && a.faltam !== null && a.primeiro && String(a.primeiro.n) === String(c.n)) r.linhas.push('Com mais <b>' + U.f0(a.faltam) + '</b> votos (os outros parados), ' + U.esc(nomeAg) + ' faria a ' + ordinal(a.cadeiras + 1) + ' cadeira e ele entraria.'); });
          }
        }
      }
    } else if (k === 'gov' || k === 'sen' || k === 'pres') {
      var lista = M.majoritario(l), m = null; lista.forEach(function (x) { if (String(x.n) === String(c.n)) m = x; });
      r.pct = m ? pctGov(m) : r.pct;
      if (comVoto) {
        if (k === 'gov' && fim('gov')) {
          r.status = /2º turno/.test(c.situacaoTSE || '') ? 'Vai ao 2º turno · resultado final' : /^Eleit/.test(c.situacaoTSE || '') ? 'Eleito no 1º turno · resultado final' : 'Não vai ao 2º turno · resultado final';
        } else if (k === 'sen' && fim('sen')) {
          r.status = c.eleitoTSE ? 'Eleito · resultado final' : 'Não eleito · resultado final';
        } else if (k === 'gov') {
          var top = lista[0];
          if (top && pctGov(top) > 50) r.status = (String(top.n) === String(c.n)) ? 'Venceria no 1º turno, se terminasse agora' : 'Não iria ao 2º turno, se terminasse agora';
          else r.status = (pos <= 2) ? 'Iria ao 2º turno, se terminasse agora' : 'Não iria ao 2º turno, se terminasse agora';
          if (pos > 2 && lista[1]) r.linhas.push('Está a <b>' + U.f0(lista[1].votos - c.votos) + '</b> votos do 2º colocado, ' + U.esc(lista[1].urna) + '.');
        } else if (k === 'sen') {
          var nv = +(est.sen.json && est.sen.json.carg && est.sen.json.carg[0] && est.sen.json.carg[0].nv) || 1;
          r.status = pos <= nv ? 'Entraria, se terminasse agora' : 'Não entraria, se terminasse agora';
          if (pos > nv && lista[nv - 1]) r.linhas.push('Está a <b>' + U.f0(lista[nv - 1].votos - c.votos) + '</b> votos de ' + U.esc(lista[nv - 1].urna) + ', o último a entrar.');
        } else r.linhas.push('Só os votos do Distrito Federal; o resultado da eleição presidencial é nacional.');
      }
    }
    if (!comVoto) r.linhas.push('Aguardando os votos apurados do TSE.');
    return r;
  }
  function desenhaCartao() {
    var box = $('cartao');
    if (!cartaoAberto) { box.hidden = true; box.innerHTML = ''; return; }
    var r = infoCandidato(cartaoAberto.k, cartaoAberto.n);
    if (!r) { box.hidden = false; box.innerHTML = '<p class="vazio">Candidato não encontrado nos arquivos do TSE carregados.</p>'; return; }
    var c = r.c, id = SLUG[r.k] + '-' + c.n;
    var link = linkPublico(id);
    box.hidden = false;
    box.innerHTML = '<div class="cartao__cab"><div><span class="cartao__cargo">' + NOME_CARGO[r.k] + ' · nº ' + U.esc(String(c.n)) + '</span><h3>' + U.esc(c.urna) + '</h3>' +
      '<span class="cartao__partido">' + U.esc(c.sigla || '') + (r.nomeAg && r.nomeAg !== c.sigla ? ' · ' + U.esc(r.nomeAg) : '') + '</span></div>' +
      '<button type="button" class="cartao__x" data-fecha-cartao aria-label="Fechar">×</button></div>' +
      (r.status ? '<div class="cartao__status' + (r.fora ? ' cartao__status--fora' : '') + '">' + r.status + '</div>' : '') +
      '<dl class="cartao__nums">' +
      '<div><dt>Votos</dt><dd class="num">' + (r.comVoto ? U.f0(c.votos) : '—') + '</dd></div>' +
      '<div><dt>% (conta do TSE)</dt><dd class="num">' + (r.comVoto ? U.f2(r.pct) + '%' : '—') + '</dd></div>' +
      '<div><dt>Posição geral</dt><dd class="num">' + (r.comVoto ? r.pos + 'º <small>de ' + r.total + '</small>' : '—') + '</dd></div>' +
      (r.posAg ? '<div><dt>Na agremiação</dt><dd class="num">' + (r.comVoto ? r.posAg + 'º <small>de ' + r.totalAg + '</small>' : '—') + '</dd></div>' : '') +
      '</dl>' + (r.linhas.length ? '<p class="cartao__linhas">' + r.linhas.join(' ') + '</p>' : '') +
      '<div class="cartao__comp"><span>Compartilhar este cartão</span>' + botoesComp(link) + '</div>';
  }
  function atualizaCartao() { if (cartaoAberto) desenhaCartao(); if (!$('buscaRes').hidden) mostraResultados(); }
  function abreCartao(k, n, rola) {
    cartaoAberto = { k: k, n: String(n) };
    if ((k === 'dist' || k === 'fed') && k !== propAtual) { /* calcula a fronteira da outra casa só se pedir */ }
    desenhaCartao();
    try {
      var q2 = new URLSearchParams(location.search); q2.set('c', SLUG[k] + '-' + n);
      history.replaceState(null, '', location.pathname + '?' + q2.toString());
    } catch (e) { /* nada */ }
    conta('pesquisou-candidato-' + SLUG[k] + '-' + n, 'pesquisou candidato ' + SLUG[k] + '-' + n);
    try { window.dispatchEvent(new CustomEvent('swm:busca', { detail: { chave: CD_CARGO[k] + '-' + n } })); } catch (e) { /* nada */ }
    if (rola) { var b = $('busca'); if (b && b.scrollIntoView) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  function abreDoLink() {
    var v = q.get('c'); if (!v) return;
    var m = String(v).toLowerCase().match(/^([a-z0-9]+)-(\d+)$/); if (!m) return;
    /* aceita também o código do cargo do TSE (?c=8-40222), além do nome (?c=distrital-40222) — 04/10 */
    var POR_CD = { '3': 'gov', '5': 'sen', '1': 'pres', '8': 'dist', '6': 'fed' };
    var k = DE_SLUG[m[1]] || POR_CD[m[1]]; if (!k) return;
    if (k === 'dist' || k === 'fed') fronteiraDe(k);
    abreCartao(k, m[2], true);
  }

  /* ---------- 7. compartilhar ---------- */
  function linkPublico(id) { return location.origin + location.pathname + (id ? '?c=' + encodeURIComponent(id) : ''); }
  var IC = {
    whats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
    insta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM21.9 8c-.1-1.6-.4-3-1.6-4.2S17.6 2.2 16 2.1C14.4 2 9.6 2 8 2.1 6.4 2.2 5 2.5 3.8 3.7S2.2 6.4 2.1 8C2 9.6 2 14.4 2.1 16c.1 1.6.4 3 1.6 4.2s2.6 1.5 4.3 1.6c1.6.1 6.4.1 8 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.6.1-6.4.1-8zm-2 9.6a3.3 3.3 0 0 1-1.9 1.9c-1.3.5-4.4.4-5.9.4s-4.6.1-5.9-.4a3.3 3.3 0 0 1-1.9-1.9C3.9 16.3 4 13.2 4 12s-.1-4.4.4-5.6A3.3 3.3 0 0 1 6.3 4.5C7.6 4 10.6 4.1 12 4.1s4.6-.1 5.9.4a3.3 3.3 0 0 1 1.9 1.9c.5 1.3.4 4.4.4 5.6s.1 4.3-.4 5.6z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM8.5 19.5a4.5 4.5 0 0 1-3.2-7.7l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a2.5 2.5 0 0 0 3.5 3.5l2.1-2.1a1 1 0 1 1 1.4 1.4l-2.1 2.1a4.5 4.5 0 0 1-3.1 1.4zm8.1-5.2a1 1 0 0 1-.7-1.7l2.1-2.1a2.5 2.5 0 0 0-3.5-3.5l-2.1 2.1a1 1 0 0 1-1.4-1.4l2.1-2.1a4.5 4.5 0 0 1 6.4 6.4l-2.1 2.1a1 1 0 0 1-.8.2z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/></svg>'
  };
  function botoesComp(link) {
    var txt = TEXTO_COMP;
    return '<div class="botoes-comp">' +
      '<a class="bc bc--whats" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(txt + ' ' + link) + '">' + IC.whats + '<span>WhatsApp</span></a>' +
      '<a class="bc bc--x" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + encodeURIComponent(txt) + '&url=' + encodeURIComponent(link) + '">' + IC.x + '<span>X</span></a>' +
      '<button type="button" class="bc" data-copia="' + U.esc(link) + '">' + IC.link + '<span>Copiar link</span></button>' +
      (navigator.share ? '<button type="button" class="bc" data-partilha="' + U.esc(link) + '">' + IC.share + '<span>Compartilhar</span></button>' : '') +
      '</div>';
  }
  function copia(t, btn) {
    var ok = function () { var s = btn.querySelector('span'); var o = s.textContent; s.textContent = 'Link copiado'; btn.classList.add('bc--ok'); setTimeout(function () { s.textContent = o; btn.classList.remove('bc--ok'); }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, function () { velho(); });
    else velho();
    function velho() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* nada */ } ta.remove(); }
  }

  /* ---------- 8. siga a SWM ---------- */
  function sociais() {
    var zap = String(CONFIG.whatsapp || '').replace(/\D/g, ''), it = [];
    if (CONFIG.instagram) it.push('<a class="soc" href="' + U.esc(CONFIG.instagram) + '" target="_blank" rel="noopener" aria-label="Instagram da SWM">' + IC.insta + '</a>');
    if (CONFIG.x) it.push('<a class="soc" href="' + U.esc(CONFIG.x) + '" target="_blank" rel="noopener" aria-label="X da SWM">' + IC.x + '</a>');
    if (zap) it.push('<a class="soc" href="https://wa.me/' + zap + '?text=' + encodeURIComponent(TEXTO_WHATS) + '" target="_blank" rel="noopener" aria-label="WhatsApp da SWM">' + IC.whats + '</a>');
    if (CONFIG.email) it.push('<a class="soc soc--email" href="mailto:' + U.esc(CONFIG.email) + '?subject=' + encodeURIComponent('Apuração ao vivo DF 2026 — SWM') + '&body=' + encodeURIComponent(TEXTO_WHATS) + '" aria-label="E-mail da SWM: ' + U.esc(CONFIG.email) + '" title="' + U.esc(CONFIG.email) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5.3-8-5.3zM5.2 7 12 11.5 18.8 7H5.2z"/></svg></a>');
    var h = it.join('');
    $('sociaisTopo').innerHTML = h; $('sociaisTopo').hidden = !h;
    $('sociaisRodape').innerHTML = h ? '<span>Siga a SWM</span>' + h : ''; $('sociaisRodape').hidden = !h;
  }

  /* ---------- 9. conheça a SWM ---------- */
  function idYoutube(u) {
    var m = String(u || '').match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }
  function conheca() {
    var vs = (CONFIG.videos || []).map(function (v) { return { titulo: v.titulo, id: idYoutube(v.youtube) }; }).filter(function (v) { return v.id; });
    if (!vs.length) { $('conheca').hidden = true; return; }
    $('conhecaVideos').innerHTML = vs.map(function (v) {
      return '<figure class="video"><div class="video__caixa"><iframe src="https://www.youtube-nocookie.com/embed/' + v.id + '" title="' + U.esc(v.titulo || 'Vídeo da SWM') + '" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div><figcaption>' + U.esc(v.titulo || '') + '</figcaption></figure>';
    }).join('');
    $('conheca').hidden = false;
  }

  /* ---------- 11. contador anônimo (GoatCounter; sem cookie, sem dado pessoal) ---------- */
  function contador() {
    if (!CONFIG.goatcounter) return;
    var s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js'; s.setAttribute('data-goatcounter', CONFIG.goatcounter);
    document.body.appendChild(s);
  }
  function conta(path, titulo) {
    if (!CONFIG.goatcounter) return;
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path, title: titulo, event: true }); } catch (e) { /* nada */ }
  }

  function iniciaExtras() {
    sociais(); conheca(); contador();
    $('compPagina').outerHTML = botoesComp(linkPublico(''));
    var inp = $('buscaInput'), tm = null;
    inp.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(mostraResultados, 120); });
    $('buscaRes').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cand]'); if (!b) return;
      var p = b.getAttribute('data-cand').split('|');
      $('buscaRes').hidden = true;
      if (p[0] === 'dist' || p[0] === 'fed') fronteiraDe(p[0]);
      abreCartao(p[0], p[1], false);
    });
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-copia]'); if (c) { copia(c.getAttribute('data-copia'), c); return; }
      var s = e.target.closest('[data-partilha]');
      if (s && navigator.share) { navigator.share({ title: 'Apuração ao vivo · DF 2026', text: TEXTO_COMP, url: s.getAttribute('data-partilha') }).catch(function () { }); return; }
      if (e.target.closest('[data-fecha-cartao]')) {
        cartaoAberto = null; desenhaCartao();
        try { var q2 = new URLSearchParams(location.search); q2.delete('c'); var qs = q2.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '')); } catch (er) { /* nada */ }
      }
    });
  }

  function inicia() {
    var zap = String(CONFIG.whatsapp || '').replace(/\D/g, '');
    if (zap) {
      $('cta').href = 'https://wa.me/' + zap + '?text=' + encodeURIComponent(TEXTO_WHATS);
      $('cta').target = '_blank';
    } else $('cta').href = CONFIG.site || '/';
    try { iniciaExtras(); } catch (e) { if (window.console) console.error(e); }
    abas('abasMaj', 'alvo', function (k) {
      Array.prototype.forEach.call(document.querySelectorAll('.maj'), function (m) { m.classList.toggle('ativo', m.dataset.cargo === k); });
    });
    abas('abasProp', 'prop', function (k) { propAtual = k; desenhaProp(k, true); try { desenhaFronteira(k); } catch (e) { if (window.console) console.error(e); } });
    var tec = [];
    if (M && M._stub) tec.push('motor: STUB de desenvolvimento (trocar pelo motor.js oficial)');
    if (BASE !== BASE_PADRAO) tec.push('base: ' + BASE);
    if (ESPELHO !== './dados/') tec.push('espelho: ' + ESPELHO);
    $('rodapeTec').textContent = tec.join(' · ');
    if (A) A.inicia();
    var faixa = document.querySelector('.marca');
    var mede = function () { document.documentElement.style.setProperty('--marca-h', faixa.offsetHeight + 'px'); };
    mede(); window.addEventListener('resize', mede);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(mede);
    setInterval(relogio, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && ultimoOk && Date.now() - ultimoOk > INTERVALO * 2) ciclo();
    });
    ciclo();
  }
  if (!M) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:80px 16px">Falha ao carregar o motor.</p>'); return; }
  inicia();
})();
