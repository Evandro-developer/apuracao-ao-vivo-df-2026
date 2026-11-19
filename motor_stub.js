/*
 * motor_stub.js — STUB do motor, só para desenvolver a página.
 * NÃO é o motor oficial (motor.js). A página carrega ./motor.js; se ele faltar, carrega este stub.
 *
 * Cumpre a mesma interface do motor:
 *   SWMMotor.le(json) -> lido
 *   SWMMotor.cadeiras(lido, regra) -> { qe, vagas, agremiacoes, eleitos, passos, aguardando }
 *   SWMMotor.majoritario(lido) -> [ { n, urna, sigla, votos, pct } ]
 *
 * Campos do TSE lidos (conferidos no arquivo final de 2024, ele2024/619 sp71072 c0013):
 *   s.ts / s.st / s.pst  = seções totais / totalizadas / % totalizadas
 *   v.vv / v.vnom / v.vl / v.vb / v.tvn = válidos / nominais / legenda / brancos / nulos
 *   agr[].par[].tvtn + tvtl = votos válidos da agremiação (a soma bate com v.vv em 2024)
 *   carg[0].nv = vagas
 * A regra (stub): QE = válidos ÷ vagas (fração > 0,5 arredonda para cima);
 *   QP = votos ÷ QE (inteiro), candidato com ≥ 10% do QE;
 *   sobras pela maior média votos ÷ (cadeiras + 1), entre agremiações com ≥ 80% do QE
 *   e candidato com ≥ 20% do QE; esgotadas, todas as agremiações disputam.
 * O motor oficial decide a regra; este stub é só um molde plausível.
 */
(function (raiz) {
  'use strict';

  function num(x) {
    if (x === undefined || x === null || x === '') return null;
    var s = String(x).replace(/\./g, '').replace(',', '.');
    var v = Number(s);
    return isFinite(v) ? v : null;
  }
  function int(x) { var v = num(x); return v === null ? null : Math.round(v); }

  var REGRA_2026 = {
    nome: 'stub — regra 2026 (Lei 14.211/2021, sobras 80/20)',
    minPartidoSobras: 0.8,
    minCandidatoQP: 0.1,
    minCandidatoSobras: 0.2
  };

  function le(json) {
    var carg = (json && json.carg && json.carg[0]) || {};
    var s = json.s || {}, v = json.v || {}, e = json.e || {};
    var vagas = int(carg.nv) || 0;
    var proporcional = carg.qe !== undefined; // os majoritários não têm qe
    var agremiacoes = [], candidatos = [];
    (carg.agr || []).forEach(function (a) {
      var votosAgr = 0, partidos = [];
      (a.par || []).forEach(function (p) {
        var nom = int(p.tvtn) || 0, leg = int(p.tvtl) || 0;
        votosAgr += nom + leg;
        partidos.push({ n: p.n, sigla: p.sg, nome: p.nm, nominais: int(p.tvtn), legenda: int(p.tvtl) });
        (p.cand || []).forEach(function (c) {
          var valido = !c.dvt || /^V/i.test(c.dvt);
          candidatos.push({
            n: c.n, nome: c.nm, urna: c.nmu, sigla: p.sg, agremiacaoId: a.n,
            votos: int(c.vap) || 0, pct: num(c.pvapn !== undefined ? c.pvapn : c.pvap),
            situacaoTSE: c.st || null, _valido: valido
          });
        });
      });
      agremiacoes.push({ id: a.n, nome: a.nm, sigla: a.com || (partidos[0] && partidos[0].sigla), tipo: a.tp, partidos: partidos, votos: votosAgr });
    });
    var dataHora = (json.dt && json.ht) ? (json.dt + ' ' + json.ht) : null;
    return {
      cargo: { cd: carg.cd, nome: carg.nmn, vagas: proporcional ? vagas : 0 },
      apuracao: {
        pct: num(s.pstn !== undefined ? s.pstn : s.pst),
        secoesTotais: int(s.ts), secoesApuradas: int(s.st),
        dataHora: dataHora, totalizada: json.tf === 's'
      },
      votos: {
        validos: int(v.vv), nominais: int(v.vnom), legenda: v.vl !== undefined ? int(v.vl) : null,
        brancos: int(v.vb), nulos: int(v.tvn), comparecimento: int(e.c), abstencao: int(e.a), eleitorado: int(e.te)
      },
      agremiacoes: agremiacoes,
      candidatos: candidatos
    };
  }

  function cadeiras(lido, regra) {
    regra = regra || REGRA_2026;
    var vagas = (lido.cargo && lido.cargo.vagas) || 0;
    var validos = (lido.votos && lido.votos.validos) || 0;
    var vazio = { qe: null, vagas: vagas, agremiacoes: [], eleitos: [], passos: [], aguardando: true };
    if (!validos || !vagas) {
      vazio.agremiacoes = lido.agremiacoes.map(function (a) {
        return { id: a.id, sigla: a.sigla, votos: a.votos, qp: 0, cadeirasQP: 0, cadeirasMedia: 0, cadeiras: 0, eleitos: [] };
      });
      return vazio;
    }
    var bruto = validos / vagas, qe = Math.floor(bruto) + ((bruto - Math.floor(bruto)) > 0.5 ? 1 : 0);
    var passos = [{
      tipo: 'qe',
      texto: 'Votos válidos ' + validos + ' ÷ ' + vagas + ' vagas = quociente eleitoral ' + qe,
      numeros: { validos: validos, vagas: vagas, qe: qe }
    }];
    var ags = lido.agremiacoes.map(function (a) {
      var cands = lido.candidatos.filter(function (c) { return c.agremiacaoId === a.id && c._valido !== false; })
        .sort(function (x, y) { return y.votos - x.votos; });
      return { id: a.id, sigla: a.sigla, votos: a.votos, qp: Math.floor(a.votos / qe), cadeirasQP: 0, cadeirasMedia: 0, cadeiras: 0, eleitos: [], _cands: cands, _usados: 0 };
    });
    var eleitos = [];
    function elege(ag, como, minimo) {
      for (var i = ag._usados; i < ag._cands.length; i++) {
        var c = ag._cands[i];
        if (c.votos >= minimo) {
          ag._cands.splice(i, 1); ag._cands.splice(ag._usados, 0, c); ag._usados++;
          ag.eleitos.push(c.n);
          eleitos.push({ n: c.n, urna: c.urna, sigla: c.sigla, votos: c.votos, como: como });
          return true;
        }
      }
      return false;
    }
    ags.forEach(function (ag) {
      for (var k = 0; k < ag.qp; k++) {
        if (!elege(ag, 'QP', regra.minCandidatoQP * qe)) break;
        ag.cadeirasQP++; ag.cadeiras++;
      }
    });
    passos.push({
      tipo: 'qp',
      texto: 'Cada agremiação ÷ ' + qe + ' = cadeiras pelo quociente partidário',
      numeros: { qe: qe, agremiacoes: ags.map(function (a) { return { id: a.id, sigla: a.sigla, votos: a.votos, qp: a.qp, cadeirasQP: a.cadeirasQP }; }) }
    });
    var restam = vagas - ags.reduce(function (s, a) { return s + a.cadeiras; }, 0);
    var rodada = 0, fase = 2;
    while (restam > 0 && rodada < 200) {
      var cand = ags.filter(function (a) {
        if (a.votos <= 0) return false;
        if (fase === 2) {
          if (a.votos < regra.minPartidoSobras * qe) return false;
          return a._cands.slice(a._usados).some(function (c) { return c.votos >= regra.minCandidatoSobras * qe; });
        }
        return a._cands.length > a._usados;
      });
      if (!cand.length) { if (fase === 2) { fase = 3; continue; } break; }
      var medias = cand.map(function (a) { return { id: a.id, sigla: a.sigla, votos: a.votos, cadeiras: a.cadeiras, media: a.votos / (a.cadeiras + 1) }; })
        .sort(function (x, y) { return (y.media - x.media) || (y.votos - x.votos); });
      var venc = ags.filter(function (a) { return a.id === medias[0].id; })[0];
      rodada++;
      elege(venc, 'media', fase === 2 ? regra.minCandidatoSobras * qe : 0);
      venc.cadeirasMedia++; venc.cadeiras++; restam--;
      passos.push({
        tipo: 'media',
        texto: 'Rodada ' + rodada + ': maior média ' + venc.sigla + ' (' + Math.round(medias[0].media) + ')',
        numeros: { rodada: rodada, fase: fase, vencedor: { id: venc.id, sigla: venc.sigla }, medias: medias }
      });
    }
    ags.forEach(function (a) { delete a._cands; delete a._usados; });
    return { qe: qe, vagas: vagas, agremiacoes: ags, eleitos: eleitos, passos: passos, aguardando: false };
  }

  function majoritario(lido) {
    var validos = (lido.votos && lido.votos.validos) || 0;
    return lido.candidatos.map(function (c) {
      return { n: c.n, urna: c.urna, sigla: c.sigla, votos: c.votos, pct: validos ? (c.votos / validos * 100) : (c.pct || 0) };
    }).sort(function (a, b) { return b.votos - a.votos; });
  }

  var api = { le: le, cadeiras: cadeiras, majoritario: majoritario, REGRA_2026: REGRA_2026, _stub: true };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.SWMMotor = api;
})(typeof window !== 'undefined' ? window : this);
