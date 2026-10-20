/* FÚTBOL MANAGER 
   Elegir club · plantilla · jugar jornadas · tabla · fichajes · temporadas */

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[R(0, a.length - 1)];
const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const crest = n => `<span class="cr" style="background:hsl(${hue(n)},50%,40%)">${n[0]}</span>`;
const save = () => { try { localStorage.setItem('fm-lite', JSON.stringify(S)); } catch (e) {} };
const load = () => { try { return JSON.parse(localStorage.getItem('fm-lite')); } catch (e) { return null; } };
function toast(m) {
  const t = $('#toast');
  t.textContent = m; t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 1800);
}

/* ---------- Datos ---------- */
const LIGAS = [
  ['Primera Ibérica', 80, ['Alcázar', 'Marisma', 'Ribera', 'Costa Dorada', 'Sierra Norte', 'Vega', 'Puerto Nuevo', 'Altamar']],
  ['Liga del Norte', 70, ['Bahía', 'Cumbres', 'Roble', 'Faro', 'Ciudadela', 'Piedra Alta', 'Nogal', 'Valle Verde']],
];
const NOM = ['Marc', 'Iván', 'Hugo', 'Leo', 'Dani', 'Pablo', 'Raúl', 'Sergio', 'Álex', 'Nico', 'Jorge', 'Biel'];
const APE = ['Soler', 'Vidal', 'Ortega', 'Mora', 'Ruiz', 'Gil', 'Pons', 'Cano', 'Navarro', 'Ibáñez', 'Roca', 'Prieto'];
const POS = ['POR', 'DEF', 'MED', 'DEL'];
const XI = { POR: 1, DEF: 4, MED: 4, DEL: 2 };          // 4-4-2
const IC = {
  partido: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4h-4.4l-1.3-4z"/>',
  plantilla: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5a3 3 0 010 6M18 14c2 .6 3 2.6 3 6"/>',
  tabla: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  mercado: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
};
const NAV = [['partido', 'Partido'], ['plantilla', 'Plantilla'], ['tabla', 'Tabla'], ['mercado', 'Fichajes']];

/* ---------- Jugadores y equipos ---------- */
const player = (pos, base) => ({ pos, n: pick(NOM) + ' ' + pick(APE), o: Math.max(40, Math.min(95, base + R(-8, 8))) });
const squad = base => [['POR', 2], ['DEF', 6], ['MED', 6], ['DEL', 4]].flatMap(([p, n]) => Array.from({ length: n }, () => player(p, base)));
const xi = sq => POS.flatMap(p => sq.filter(x => x.pos == p).sort((a, b) => b.o - a.o).slice(0, XI[p]));
const strength = sq => { const x = xi(sq); return x.reduce((a, p) => a + p.o, 0) / x.length; };
const value = p => +Math.max(0.2, (p.o - 50) ** 2 / 60).toFixed(1);
const market = () => Array.from({ length: 8 }, () => player(pick(POS), R(58, 84)));
const blank = () => ({ pj: 0, gf: 0, gc: 0, pts: 0 });

/* ---------- Calendario (todos contra todos, 7 jornadas) ---------- */
function fixtures(n) {
  const a = [...Array(n).keys()], rounds = [];
  for (let j = 0; j < n - 1; j++) {
    rounds.push(Array.from({ length: n / 2 }, (_, i) => (j % 2 ? [a[n - 1 - i], a[i]] : [a[i], a[n - 1 - i]])));
    a.splice(1, 0, a.pop());
  }
  return rounds;
}

/* ---------- Simulación ---------- */
const scorer = t => pick(xi(t.sq).filter(p => p.pos != 'POR').flatMap(p => Array(p.pos == 'DEL' ? 4 : p.pos == 'MED' ? 2 : 1).fill(p))).n;
function sim(h, a) {                                   // devuelve los goles ordenados por minuto
  const ev = [], sh = strength(h.sq) + 3, sa = strength(a.sq);
  for (let m = 3; m <= 90; m += 3)
    [[0, sh, sa, h], [1, sa, sh, a]].forEach(([t, x, y, eq]) => {
      if (Math.random() < Math.max(0.01, 0.05 + (x - y) / 300)) ev.push({ m: m - R(0, 2), t, who: scorer(eq) });
    });
  return ev.sort((p, q) => p.m - q.m);
}
const goals = ev => [ev.filter(e => !e.t).length, ev.filter(e => e.t).length];
function rec(h, a, gh, ga) {
  [[h, gh, ga], [a, ga, gh]].forEach(([t, f, c]) => { t.pj++; t.gf += f; t.gc += c; t.pts += f > c ? 3 : f == c ? 1 : 0; });
}
const rank = () => S.teams.map((t, i) => ({ ...t, i })).sort((a, b) => b.pts - a.pts || b.gf - b.gc - (a.gf - a.gc) || b.gf - a.gf);

/* ---------- Estado y partida ---------- */
let S = { tab: 'home' }, L = null, timer = null, pend = null;   // L = partido en juego

function start(li, me) {
  const [, base, names] = LIGAS[li];
  S = { tab: 'partido', li, me, J: 0, season: 1, budget: 15, last: '', champs: [],
        teams: names.map((n, i) => ({ n, sq: squad(base - i * 2.5), ...blank() })), fx: fixtures(names.length), market: market() };
  save(); render();
}
function jugar() {
  const rd = S.fx[S.J], mi = rd.find(p => p.includes(S.me)), [h, a] = mi.map(i => S.teams[i]);
  L = { h, a, home: mi[0] == S.me, ev: sim(h, a), min: 0, rest: rd.filter(p => p !== mi) };
  timer = setInterval(tick, 110); render();
}
function tick() {
  L.min = Math.min(90, L.min + 3);
  if (L.min < 90) return render();
  clearInterval(timer);
  const [gh, ga] = goals(L.ev);
  rec(L.h, L.a, gh, ga);
  L.rest.forEach(([x, y]) => { const [p, q] = goals(sim(S.teams[x], S.teams[y])); rec(S.teams[x], S.teams[y], p, q); });
  const d = L.home ? gh - ga : ga - gh;
  S.budget = +(S.budget + (d > 0 ? 1.2 : d == 0 ? 0.7 : 0.4)).toFixed(1);
  S.last = `${L.h.n} ${gh} - ${ga} ${L.a.n}`;
  S.J++; S.market = market(); L = null; save(); render();
}
function nuevaTemp() {
  const r = rank(), pos = r.findIndex(t => t.i == S.me) + 1;
  S.budget = +(S.budget + (S.teams.length - pos) * 0.8).toFixed(1);
  S.champs.push(r[0].n);
  S.teams.forEach(t => { Object.assign(t, blank()); t.sq.forEach(p => (p.o = Math.max(40, Math.min(95, p.o + R(-2, 3))))); });
  S.J = 0; S.season++; S.last = ''; S.market = market(); save(); render();
}
function toHome() { clearInterval(timer); L = null; S.tab = 'home'; render(); }
const go = t => { S.tab = t; render(); };
const cont = () => { if (!S.teams) S = load(); S.tab = 'partido'; render(); };
const pickLi = i => { pend = i; render(); };

/* ---------- Acciones del jugador ---------- */
const mine = () => S.teams[S.me].sq;
function comprar(i) {
  const p = S.market[i], v = value(p);
  if (S.budget < v) return toast('No tienes presupuesto.');
  if (mine().length >= 22) return toast('Plantilla llena (máx. 22).');
  S.budget = +(S.budget - v).toFixed(1); mine().push(p); S.market.splice(i, 1); save(); render();
}
function vender(i) {
  const p = mine()[i];
  if (mine().filter(x => x.pos == p.pos).length <= XI[p.pos]) return toast('Necesitas jugadores de reserva en esa posición.');
  S.budget = +(S.budget + value(p)).toFixed(1); mine().splice(i, 1); save(); render();
}
function entrenar(i) {
  const p = mine()[i];
  if (p.o >= 95) return toast('Ya está al máximo.');
  if (S.budget < 1) return toast('Entrenar cuesta 1M.');
  S.budget = +(S.budget - 1).toFixed(1); p.o++; save(); render();
}

/* ---------- Vistas ---------- */
function vHome() {
  return `<div class="hero"><div class="lg">Fútbol<br>Manager</div></div>` +
    (S.teams || load() ? `<button class="btn w" onclick="cont()">Continuar</button><br><br>` : '') +
    `<button class="btn ${S.teams || load() ? 'alt' : ''} w" onclick="S.tab='new';render()">Nueva partida</button>`;
}
function vNew() {
  if (pend == null)
    return `<h2>Elige liga</h2><div class="grid">${LIGAS.map((l, i) => `<button class="tile" onclick="pickLi(${i})">${l[0]}<small>${l[2].length} equipos</small></button>`).join('')}</div>` +
      `<br><button class="btn alt w" onclick="S.tab='home';render()">← Volver</button>`;
  const [, base, names] = LIGAS[pend];
  return `<h2>Elige club</h2>` + names.map((n, i) =>
    `<div class="row">${crest(n)}<span class="grow"> ${n}<br><small>Nivel ${Math.round(base - i * 2.5)}</small></span><button class="btn sm" onclick="start(${pend},${i});pend=null">Elegir</button></div>`).join('') +
    `<br><button class="btn alt w" onclick="pend=null;render()">← Ligas</button>`;
}

const board = (h, a, gh, ga, min) =>
  `<div class="board"><div class="teams"><span>${crest(h.n)} ${h.n}</span><span>${a.n} ${crest(a.n)}</span></div>` +
  `<div class="score">${gh} - ${ga}</div><div class="prog"><i style="width:${min / 0.9}%"></i></div>${min ? `<small>${min}'</small>` : ''}</div>`;

function vPartido() {
  if (L) {                                              // partido en juego
    const ev = L.ev.filter(e => e.m <= L.min), [gh, ga] = goals(ev);
    return board(L.h, L.a, gh, ga, L.min) +
      `<div class="log">${ev.map(e => `<div><span class="min">${e.m}'</span>⚽ ${e.who} <small>(${(e.t ? L.a : L.h).n})</small></div>`).join('')}</div>`;
  }
  if (S.J >= S.fx.length) {                             // fin de temporada
    const r = rank(), pos = r.findIndex(t => t.i == S.me) + 1;
    return `<h2>Fin de temporada ${S.season}</h2><div class="in">Campeón: <b>${r[0].n}</b><br>Tu posición: <b>${pos}º</b> · premio ${((S.teams.length - pos) * 0.8).toFixed(1)}M</div>` +
      `<button class="btn w" onclick="nuevaTemp()">Empezar temporada ${S.season + 1}</button>`;
  }
  const [h, a] = S.fx[S.J].find(p => p.includes(S.me)).map(i => S.teams[i]);
  return `<h2>Jornada ${S.J + 1}</h2>` + board(h, a, 0, 0, 0) +
    (S.last ? `<div class="in">Último resultado: <b>${S.last}</b></div>` : '') +
    `<div class="ctl"><button class="btn" onclick="jugar()">Jugar jornada</button></div>`;
}

function vPlantilla() {
  const sq = mine(), top = new Set(xi(sq));
  return `<h2>Plantilla</h2><div class="sub">Fuerza del once: <b>${strength(sq).toFixed(1)}</b> · ${sq.length} jugadores</div>` +
    POS.map(pos => `<h3>${pos}</h3>` + sq.map((p, i) => [p, i]).filter(([p]) => p.pos == pos).sort((a, b) => b[0].o - a[0].o).map(([p, i]) =>
      `<div class="row"><span class="ovr">${p.o}</span><span class="grow">${p.n}${top.has(p) ? ' <span class="tag g">XI</span>' : ''}</span>` +
      `<button class="btn alt sm" onclick="entrenar(${i})">+1 · 1M</button><button class="btn red sm" onclick="vender(${i})">${value(p)}M</button></div>`).join('')).join('');
}

function vTabla() {
  const n = S.teams.length;
  return `<h2>Clasificación</h2><table class="tb"><tr><th></th><th>Equipo</th><th>PJ</th><th>DG</th><th>Pts</th></tr>` +
    rank().map((t, k) => `<tr class="${t.i == S.me ? 'me' : ''} ${k < 2 ? 'up' : k >= n - 2 ? 'dn' : ''}"><td>${k + 1}</td><td>${crest(t.n)} ${t.n}</td><td>${t.pj}</td><td>${t.gf - t.gc}</td><td><b>${t.pts}</b></td></tr>`).join('') +
    `</table>` + (S.champs.length ? `<h3>Campeones</h3><div class="sub">${S.champs.map((c, i) => `T${i + 1}: ${c}`).join(' · ')}</div>` : '');
}

function vMercado() {
  return `<h2>Fichajes</h2><div class="sub">Presupuesto: <b>${S.budget}M</b> · se renueva cada jornada</div>` +
    S.market.map((p, i) => `<div class="row"><span class="pos">${p.pos}</span><span class="ovr">${p.o}</span><span class="grow">${p.n}</span><button class="btn sm" onclick="comprar(${i})">${value(p)}M</button></div>`).join('');
}

/* ---------- Render ---------- */
const V = { partido: vPartido, plantilla: vPlantilla, tabla: vTabla, mercado: vMercado };
function render() {
  const home = S.tab == 'home' || S.tab == 'new';
  document.body.classList.toggle('home', home);
  if (home) { $('#v').innerHTML = S.tab == 'new' ? vNew() : vHome(); $('#nav').innerHTML = ''; return; }
  $('#nav').innerHTML = NAV.map(([k, n]) => `<button class="${S.tab == k ? 'on' : ''}" onclick="go('${k}')"><svg viewBox="0 0 24 24">${IC[k]}</svg>${n}</button>`).join('');
  const me = S.teams[S.me];
  $('#coins').textContent = S.budget + 'M';
  $('#club').textContent = me.n;
  $('#hc').innerHTML = crest(me.n);
  $('#liga').textContent = `${LIGAS[S.li][0]} · Jornada ${Math.min(S.J + 1, S.fx.length)}/${S.fx.length} · T${S.season}`;
  $('#v').innerHTML = `<div class="card">${V[S.tab]()}</div>`;
}
render();