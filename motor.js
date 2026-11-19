/*!
 * motor.js — SWMMotor: le o -u.json do TSE (resultados.tse.jus.br) e calcula as cadeiras do sistema proporcional
 * ("se terminasse agora"). Sem dependencias. Navegador: <script src="motor.js"> -> window.SWMMotor. Node: require('./motor.js').
 *
 * REGRA_2022 = QE, QP (candidato com >= 10% do QE) e sobras pela maior media entre agremiacoes com >= 80% do QE.
 * REGRA_2026 = a regra que reproduz os eleitos marcados pelo TSE nos arquivos finais de vereador 2024 (80/20 + 3a fase).
 *
 * Significado dos campos do -u.json (conferido nas identidades contabeis de 300 municipios de 2024):
 *   v.vv = validos = v.vnom (nominais) + v.vl (legenda); v.tv = vv + van (anulados) + vansj (anulados sub judice) + vb (brancos) + tvn (nulos)
 *   v.tvn = vn + vnt; e.c (comparecimento) = v.tv; e.te (eleitorado) = e.c + e.a (abstencao)
 *   s.ts (secoes totais) = s.st (totalizadas) + s.snt (nao totalizadas); s.pstn = % totalizadas
 *   carg[0].qe = arredonda(vv / nv), fracao > 0,5 sobe; par.tvtn = soma do vap dos candidatos dvt 'Válido'; par.tvtl = legenda valida
 *   cand.e = 's' eleito; cand.st = 'Eleito por QP' | 'Eleito por média' | 'Suplente' | 'Não eleito' | '' ; cand.dvt = 'Válido' |
 *   'Válido (legenda)' (voto vai para a legenda, candidato nao pode ser eleito) | 'Anulado' | 'Anulado sub judice'
 *   cand.pvapn = 100 * vap / v.vvc, com v.vvc = vv + van + vansj (NAO e % dos validos; o motor da pctValidos a parte no majoritario)
 *   no majoritario, cand.e = 's' tambem marca quem vai ao 2o turno (st = '2º turno'): leia situacaoTSE, nao so eleitoTSE
 *   json.tf = 's' totalizado; json.and = 'n' (zerado 2026) | 'p' (retotalizacao pendente em 2024) | 'f' (final) — so os 3 valores vistos
 */
(function (raiz, fabrica) {
  var M = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = M;
  if (typeof window !== 'undefined') window.SWMMotor = M;
  else if (raiz) raiz.SWMMotor = M;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- regras ----------
  // min_qp: votacao nominal minima do candidato (fracao do QE) para ocupar vaga do QP (art. 108 CE)
  // sobras_80: na 2a fase so disputam agremiacoes com >= 80% do QE (art. 109, I)
  // min_media: votacao minima do candidato (fracao do QE) para ocupar vaga das medias (art. 109, I; a lei diz 0,20)
  // fase3: o que fazer quando ninguem mais atende os requisitos da 2a fase:
  //        null      = parar (o script da casa: `if best is None: break`)
  //        'todos'   = todas as agremiacoes disputam pelas maiores medias, sem corte de partido nem de candidato
  //        'so80'    = so as agremiacoes com >= 80% do QE, sem corte de candidato (leitura do TSE em 2022, Res. 23.677)
  // art111: se nenhuma agremiacao atingir o QE, elegem-se os mais votados (art. 111 CE)
  var REGRA_2022 = Object.freeze({ nome: 'REGRA_2022 (QP 10% + sobras 80%)', min_qp: 0.10, sobras_80: true, min_media: 0.0, fase3: null, art111: false });
  // REGRA_2026: a variante que reproduz os eleitos do TSE em 2024 (5.547 municipios totalizados):
  // 2a fase com 80% (partido) e 20% (candidato); 3a fase com TODAS as agremiacoes pelas maiores medias, sem corte (STF, 2024).
  // art111 fica desligado: 0 casos em 5.569 municipios, sem teste (lacuna registrada).
  var REGRA_2026 = Object.freeze({ nome: 'REGRA_2026 (TSE 2024: 80/20 + 3a fase com todas)', min_qp: 0.10, sobras_80: true, min_media: 0.20, fase3: 'todos', art111: false });

  var MAJORITARIOS = { 1: 1, 3: 1, 5: 1, 11: 1 }; // presidente, governador, senador, prefeito

  // ---------- utilitarios ----------
  function num(x) { // "1.234" nunca vem; o TSE usa inteiro sem separador e decimal com virgula ("0,675628098")
    if (x === undefined || x === null || x === '') return null;
    var n = Number(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function int(x) { var n = num(x); return n === null ? null : Math.round(n); }
  function qeRound(x) { var i = Math.floor(x), f = x - i; return i + (f > 0.5 ? 1 : 0); } // qe_round (l.34)
  function fmt(n, casas) { // pt-BR sem depender de Intl
    if (n === null || n === undefined || !isFinite(n)) return '—';
    casas = casas || 0;
    var neg = n < 0; n = Math.abs(n);
    var s = n.toFixed(casas), p = s.split('.'), i = p[0], out = '';
    while (i.length > 3) { out = '.' + i.slice(-3) + out; i = i.slice(0, -3); }
    out = i + out;
    return (neg ? '-' : '') + out + (p[1] ? ',' + p[1] : '');
  }
  function nascNum(dt) { // "09/04/1979" -> 19790409 (para desempate pelo mais idoso, art. 110 CE)
    if (!dt || typeof dt !== 'string') return null;
    var m = dt.split('/'); if (m.length !== 3) return null;
    return Number(m[2] + m[1] + m[0]);
  }
  function porVotos(a, b) { // maior votacao primeiro; empate: mais idoso; depois numero (estavel)
    if (b.votos !== a.votos) return b.votos - a.votos;
    var na = a.nascimento, nb = b.nascimento;
    if (na !== null && nb !== null && na !== nb) return na - nb;
    return String(a.n).localeCompare(String(b.n));
  }
  var TIPO = { f: 'federacao', i: 'isolado', c: 'coligacao' };

  // ---------- le ----------
  function le(json) {
    if (typeof json === 'string') json = JSON.parse(json);
    var c = (json && json.carg && json.carg[0]) || {};
    var cd = int(c.cd);
    var maj = !!MAJORITARIOS[cd];
    var s = json.s || {}, v = json.v || {}, e = json.e || {};
    var dataHora = (json.dt ? json.dt + (json.ht ? ' ' + json.ht : '') : null);
    var lido = {
      cargo: { cd: cd, nome: c.nmn || null, vagas: maj ? 0 : int(c.nv), majoritario: maj, vagasTSE: int(c.nv), qeTSE: int(c.qe) },
      apuracao: {
        pct: num(s.pstn), secoesTotais: int(s.ts), secoesApuradas: int(s.st), dataHora: dataHora,
        totalizada: json.tf === undefined ? null : json.tf === 's',
        geradoEm: json.dg ? json.dg + (json.hg ? ' ' + json.hg : '') : null, eleicao: json.ele || null, abrangencia: json.cdabr || null
      },
      votos: {
        validos: int(v.vv), nominais: int(v.vnom), legenda: int(v.vl), brancos: int(v.vb), nulos: int(v.tvn),
        comparecimento: int(e.c), abstencao: int(e.a), eleitorado: int(e.te),
        anulados: int(v.van), anuladosSubJudice: int(v.vansj)
      },
      agremiacoes: [],
      candidatos: []
    };
    (c.agr || []).forEach(function (a) {
      var ag = { id: String(a.n), nome: a.nm || null, sigla: a.com ? String(a.com).replace(/\s*\/\s*/g, '/') : null, tipo: TIPO[a.tp] || a.tp || null, partidos: [], votos: 0, vagasTSE: int(a.vag) };
      (a.par || []).forEach(function (p) {
        var nom = int(p.tvtn), leg = int(p.tvtl);
        ag.partidos.push({ n: p.n, sigla: p.sg || null, nome: p.nm || null, nominais: nom, legenda: leg, situacao: p.dvt || null });
        ag.votos += (nom || 0) + (leg || 0); // tvtn e tvtl ja sao os validos (o partido anulado vem com 0 nos dois)
        (p.cand || []).forEach(function (x) {
          var dvt = x.dvt === undefined ? null : x.dvt;
          lido.candidatos.push({
            n: x.n, nome: x.nm || null, urna: x.nmu || null, sigla: p.sg || null, agremiacaoId: ag.id,
            votos: int(x.vap) || 0, pct: num(x.pvapn), situacaoTSE: x.st ? x.st : null,
            eleitoTSE: x.e === undefined ? null : x.e === 's', destinacao: dvt,
            // pode ser eleito? 'Válido' sim; sem dvt (arquivo zerado de 2026) conta como valido; 'Válido (legenda)'/'Anulado*' nao
            elegivel: dvt === null || dvt === 'Válido',
            nascimento: nascNum(x.dt),
            vices: (x.vs || []).map(function (s) { return { tipo: s.tp || null, urna: s.nmu || null, sigla: s.sgp || null }; }) // vice/suplentes (majoritario)
          });
        });
      });
      lido.agremiacoes.push(ag);
    });
    return lido;
  }

  // ---------- cadeiras (porte de simula, l.81-103) ----------
  function cadeiras(lido, regra) {
    regra = regra || REGRA_2026;
    var vagas = lido.cargo.vagas || 0;
    var validos = 0;
    lido.agremiacoes.forEach(function (a) { validos += a.votos; });
    var passos = [];
    var saida = { qe: null, vagas: vagas, validos: validos, regra: regra.nome || null, agremiacoes: [], eleitos: [], passos: passos, aguardando: false, vagasNaoPreenchidas: 0 };
    if (!vagas) { saida.passos.push({ tipo: 'qe', texto: 'Cargo majoritário: não há quociente eleitoral; vence quem tem mais votos.', numeros: {} }); return saida; }
    if (!validos) {
      saida.aguardando = true;
      saida.agremiacoes = lido.agremiacoes.map(function (a) { return { id: a.id, sigla: a.sigla, votos: 0, qp: 0, cadeirasQP: 0, cadeirasMedia: 0, cadeiras: 0, eleitos: [] }; });
      passos.push({ tipo: 'qe', texto: 'Aguardando os primeiros votos apurados. Com ' + vagas + ' vagas, o quociente eleitoral será os votos válidos ÷ ' + vagas + '.', numeros: { validos: 0, vagas: vagas, qe: null } });
      return saida;
    }
    var QE = qeRound(validos / vagas);
    saida.qe = QE;
    passos.push({
      tipo: 'qe',
      texto: 'Quociente eleitoral (QE): ' + fmt(validos) + ' votos válidos ÷ ' + vagas + ' vagas = ' + fmt(validos / vagas, 2) + ' → QE = ' + fmt(QE) + ' votos (fração acima de meio arredonda para cima). Cada ' + fmt(QE) + ' votos de uma agremiação valem uma cadeira.',
      numeros: { validos: validos, vagas: vagas, divisao: validos / vagas, qe: QE }
    });

    // candidatos por agremiacao, ordenados
    var porAg = {};
    lido.agremiacoes.forEach(function (a) { porAg[a.id] = []; });
    lido.candidatos.forEach(function (c) { if (c.elegivel && porAg[c.agremiacaoId]) porAg[c.agremiacaoId].push(c); });
    Object.keys(porAg).forEach(function (k) { porAg[k].sort(porVotos); });

    var est = lido.agremiacoes.map(function (a) {
      return { a: a, qp: Math.floor(a.votos / QE), res: [], como: {}, cadeirasQP: 0, cadeirasMedia: 0 };
    });
    var corteQP = regra.min_qp ? regra.min_qp * QE : 0;
    var somaQP = 0;
    est.forEach(function (g) { somaQP += g.qp; });

    var porVotosAg = est.slice().sort(function (x, y) { return y.a.votos - x.a.votos; });

    // art. 111: ninguem atingiu o QE -> os mais votados
    if (regra.art111 && somaQP === 0) {
      var todos = lido.candidatos.filter(function (c) { return c.elegivel; }).sort(porVotos).slice(0, vagas);
      var mapa = {}; est.forEach(function (g) { mapa[g.a.id] = g; });
      todos.forEach(function (c) { var g = mapa[c.agremiacaoId]; g.res.push(c); g.como[c.n] = 'mais votado'; g.cadeirasMedia++; });
      passos.push({ tipo: 'qp', texto: 'Nenhuma agremiação atingiu o QE de ' + fmt(QE) + ' votos. Pela regra do art. 111 do Código Eleitoral, as ' + vagas + ' vagas vão para os ' + vagas + ' candidatos mais votados.', numeros: { qe: QE, art111: true } });
      return fecha(saida, est, lido, QE);
    }

    // 1a fase: quociente partidario
    // Trava de parcial minuscula: com QE arredondado para baixo e poucos votos (ex.: 57 validos, QE 2), a soma dos QP pode passar
    // das vagas. Com votacao real isso nao acontece; aqui o motor para de distribuir ao chegar nas vagas (maiores votacoes primeiro).
    var ocupadas = 0;
    porVotosAg.forEach(function (g) {
      if (!g.a.votos) return;
      var aptos = porAg[g.a.id].filter(function (c) { return c.votos >= corteQP; });
      var leva = aptos.slice(0, Math.min(g.qp, vagas - ocupadas));
      ocupadas += leva.length;
      leva.forEach(function (c) { g.res.push(c); g.como[c.n] = 'QP'; });
      g.cadeirasQP = leva.length;
      var t = g.a.sigla + ': ' + fmt(g.a.votos) + ' votos ÷ ' + fmt(QE) + ' = ' + fmt(g.a.votos / QE, 2) + ' → quociente partidário (QP) = ' + g.qp + (g.qp === 1 ? ' cadeira' : ' cadeiras') + '.';
      if (g.qp > 0) {
        t += ' Entram: ' + leva.map(function (c) { return c.urna + ' (' + fmt(c.votos) + ')'; }).join(', ') + '.';
        if (leva.length < g.qp && aptos.length > leva.length) t += ' As vagas acabaram antes: com tão poucos votos apurados, a soma dos quocientes passa do total de vagas.';
        else if (leva.length < g.qp) t += ' Só ' + leva.length + ' candidato(s) com ao menos ' + fmt(regra.min_qp * 100) + '% do QE (' + fmt(Math.ceil(corteQP)) + ' votos); ' + (g.qp - leva.length) + ' cadeira(s) vão para as sobras.';
      }
      passos.push({ tipo: 'qp', texto: t, numeros: { id: g.a.id, sigla: g.a.sigla, votos: g.a.votos, qe: QE, divisao: g.a.votos / QE, qp: g.qp, eleitos: leva.map(function (c) { return c.n; }), corteCandidato: corteQP } });
    });

    var total = 0; est.forEach(function (g) { total += g.res.length; });
    var sobram = vagas - total;
    var corte80 = regra.sobras_80 ? 0.8 * QE : 0;
    var corteMedia = regra.min_media ? regra.min_media * QE : 0;
    if (sobram > 0) {
      var aptas80 = porVotosAg.filter(function (g) { return g.a.votos >= corte80; }).map(function (g) { return g.a.sigla; });
      passos.push({
        tipo: 'media', texto: 'Sobram ' + sobram + (sobram === 1 ? ' cadeira' : ' cadeiras') + ' para as médias. ' +
          (regra.sobras_80 ? 'Disputam as agremiações com ao menos 80% do QE (' + fmt(Math.ceil(corte80)) + ' votos): ' + (aptas80.join(', ') || 'nenhuma') + '. ' : '') +
          (corteMedia ? 'O candidato precisa de ao menos ' + fmt(regra.min_media * 100) + '% do QE (' + fmt(Math.ceil(corteMedia)) + ' votos). ' : '') +
          'Média = votos da agremiação ÷ (cadeiras que já tem + 1); a maior média leva a cadeira.',
        numeros: { rodada: 0, sobram: sobram, corte80: corte80, corteCandidato: corteMedia, aptas: aptas80 }
      });
    }
    var rodada = 0, fase = 2;
    while (total < vagas) {
      var best = null, quadro = [];
      for (var i = 0; i < porVotosAg.length; i++) {
        var g = porVotosAg[i];
        if (!g.a.votos) continue;
        if (fase === 2 && regra.sobras_80 && g.a.votos < corte80) continue;
        if (fase === 3 && regra.fase3 === 'so80' && g.a.votos < corte80) continue;
        var resto = porAg[g.a.id].filter(function (c) { return g.res.indexOf(c) < 0; });
        if (fase === 2 && corteMedia) resto = resto.filter(function (c) { return c.votos >= corteMedia; });
        if (!resto.length) continue;
        var m = g.a.votos / (g.res.length + 1);
        quadro.push({ id: g.a.id, sigla: g.a.sigla, media: m, cadeiras: g.res.length });
        // desempate de media igual: 1) agremiacao com mais votos; 2) o candidato da vez com mais votos; 3) o mais idoso (porVotos).
        // Os 3 empates de 2024 (Jaguare-ES, Lagoa Santa-GO, Paraguacu-MG: votos da agremiacao iguais) o TSE decidiu pelo candidato
        // com mais votos, que nos 3 tambem era o mais idoso — a ordem entre 2) e 3) nao foi testada.
        if (best === null || m > best.m || (m === best.m && (g.a.votos > best.g.a.votos || (g.a.votos === best.g.a.votos && porVotos(resto[0], best.c) < 0)))) best = { m: m, g: g, c: resto[0] };
      }
      if (best === null) {
        if (fase === 2 && regra.fase3) {
          fase = 3;
          passos.push({ tipo: 'media', texto: 'Nenhuma agremiação com ' + (regra.sobras_80 ? '80% do QE ' : '') + 'tem mais candidato apto. ' +
            (regra.fase3 === 'todos' ? 'As ' + (vagas - total) + ' cadeira(s) restantes vão para as maiores médias entre todas as agremiações, sem corte de partido nem de candidato (como o TSE totalizou 2024).' : 'As cadeiras restantes vão para as maiores médias entre as agremiações com 80% do QE, sem corte de candidato.'),
            numeros: { rodada: 0, fase: 3, sobram: vagas - total } });
          continue;
        }
        saida.vagasNaoPreenchidas = vagas - total;
        passos.push({ tipo: 'media', texto: 'Nenhuma agremiação tem mais candidato apto: ' + (vagas - total) + ' cadeira(s) ficam sem dono por esta regra.', numeros: { naoPreenchidas: vagas - total } });
        break;
      }
      rodada++;
      best.g.res.push(best.c); best.g.como[best.c.n] = 'media'; best.g.cadeirasMedia++; total++;
      quadro.sort(function (x, y) { return y.media - x.media; });
      passos.push({
        tipo: 'media',
        texto: 'Rodada ' + rodada + ': maior média é ' + best.g.a.sigla + ', ' + fmt(best.g.a.votos) + ' ÷ (' + (best.g.res.length - 1) + ' + 1) = ' + fmt(best.m, 2) + '. Cadeira para ' + best.c.urna + ' (' + fmt(best.c.votos) + ' votos).' +
          (quadro.length > 1 ? ' Segunda maior: ' + quadro[1].sigla + ', ' + fmt(quadro[1].media, 2) + '.' : ''),
        numeros: { rodada: rodada, fase: fase, id: best.g.a.id, sigla: best.g.a.sigla, votos: best.g.a.votos, cadeirasAntes: best.g.res.length - 1, media: best.m, eleito: best.c.n, medias: quadro }
      });
    }
    return fecha(saida, est, lido, QE);
  }

  function fecha(saida, est, lido, QE) {
    est.sort(function (x, y) { return (y.res.length - x.res.length) || (y.a.votos - x.a.votos); });
    est.forEach(function (g) {
      saida.agremiacoes.push({
        id: g.a.id, sigla: g.a.sigla, nome: g.a.nome, votos: g.a.votos, qp: g.qp, divisao: QE ? g.a.votos / QE : null,
        cadeirasQP: g.cadeirasQP, cadeirasMedia: g.cadeirasMedia, cadeiras: g.res.length,
        eleitos: g.res.map(function (c) { return c.n; })
      });
      g.res.forEach(function (c) { saida.eleitos.push({ n: c.n, urna: c.urna, sigla: c.sigla, agremiacaoId: g.a.id, votos: c.votos, como: g.como[c.n] }); });
    });
    saida.eleitos.sort(function (a, b) { return b.votos - a.votos; });
    return saida;
  }

  // ---------- majoritario ----------
  function majoritario(lido) {
    var val = lido.votos && lido.votos.validos;
    return lido.candidatos.slice().sort(porVotos).map(function (c) {
      return { n: c.n, urna: c.urna, sigla: c.sigla, votos: c.votos, pct: c.pct, pctValidos: val ? 100 * c.votos / val : null, situacaoTSE: c.situacaoTSE, eleitoTSE: c.eleitoTSE, elegivel: c.elegivel, vices: c.vices };
    });
  }

  return { le: le, cadeiras: cadeiras, majoritario: majoritario, REGRA_2022: REGRA_2022, REGRA_2026: REGRA_2026, qeRound: qeRound, fmt: fmt, versao: '2026-10-04' };
});
