// Arithmos — mini-graphiques d'évolution (sparklines) en SVG inline, sans librairie externe.
// Une série par graphique (l'évolution d'un seul KPI dans le temps) : pas de légende nécessaire,
// trait fin, extrémités arrondies, points cliquables avec info-bulle native (<title>).

const LINE_COLOR = '#316A6C';   // sarcelle de marque Arithmos
const LINE_COLOR_NEG = '#C0392B'; // rouge discret, utilisé seulement si toutes les valeurs sont négatives
const GRID_COLOR = '#E4E1D9';
const TEXT_COLOR = '#6B7280';

export function renderSparkline(points, opts = {}) {
  // points: [{ label: '2024', value: 12345 }, ...] triés du plus ancien au plus récent
  const width = opts.width || 280;
  const height = opts.height || 72;
  const padX = 10, padY = 14;

  const valid = points.filter(p => typeof p.value === 'number');
  if (valid.length === 0) {
    return `<div class="spark-empty">Pas assez de données</div>`;
  }
  if (valid.length === 1) {
    return `<div class="spark-empty">Un seul exercice importé — l'évolution apparaîtra dès le suivant</div>`;
  }

  const values = valid.map(p => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = (max - min) || 1;

  const stepX = (width - padX * 2) / (valid.length - 1);
  const coords = valid.map((p, i) => {
    const x = padX + i * stepX;
    const y = height - padY - ((p.value - min) / range) * (height - padY * 2);
    return { x, y, label: p.label, value: p.value };
  });

  const allNegative = values.every(v => v <= 0);
  const stroke = allNegative ? LINE_COLOR_NEG : LINE_COLOR;

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  // Ligne de zéro, affichée seulement si elle tombe dans la plage visible (utile pour les KPI qui peuvent être négatifs).
  let zeroLine = '';
  if (min < 0 && max > 0) {
    const zeroY = height - padY - ((0 - min) / range) * (height - padY * 2);
    zeroLine = `<line x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1" stroke-dasharray="2,3"/>`;
  }

  const dots = coords.map(c => `
    <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${stroke}" stroke="#fff" stroke-width="1.5">
      <title>${escapeXml(c.label)} : ${escapeXml(formatShort(c.value, opts.format))}</title>
    </circle>`).join('');

  const firstLabel = coords[0].label;
  const lastLabel = coords[coords.length - 1].label;

  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img"
         aria-label="Évolution de ${firstLabel} à ${lastLabel}">
      ${zeroLine}
      <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div class="spark-axis"><span>${escapeXml(firstLabel)}</span><span>${escapeXml(lastLabel)}</span></div>`;
}

function formatShort(n, format) {
  if (format === 'pct') return (n * 100).toLocaleString('fr-BE', { maximumFractionDigits: 1 }) + ' %';
  if (format === 'ratio') return n.toLocaleString('fr-BE', { maximumFractionDigits: 2 });
  if (format === 'jours') return Math.round(n).toLocaleString('fr-BE') + ' j';
  return Math.round(n).toLocaleString('fr-BE') + ' €';
}

function escapeXml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Graphiques "riches" (V13-001) — via Chart.js (chargé en <script> global, voir admin.html /
// resultats.html, même méthode que XLSX.js/jsPDF pour les exports). Chaque fonction htmlXxx()
// renvoie un <canvas> à insérer dans le HTML ; montrerXxx() instancie/rafraîchit le graphique une
// fois ce <canvas> réellement présent dans le DOM (après affectation de innerHTML).

const instances = new Map(); // id de canvas -> instance Chart.js active, pour pouvoir la détruire

function montage(id, config) {
  const ancien = instances.get(id);
  if (ancien) { ancien.destroy(); instances.delete(id); }
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return null;
  const chart = new window.Chart(canvas, config);
  instances.set(id, chart);
  return chart;
}

// Même format que partout ailleurs dans Arithmos (kpi.js eur(), admin.js formatEUR...) :
// séparateur de milliers = espace (ex. -1 516 695 €), jamais d'abréviation "k €".
function formatAxe(n, format) {
  if (format === 'pct') return (n * 100).toLocaleString('fr-BE', { maximumFractionDigits: 1 }) + ' %';
  if (format === 'ratio') return n.toLocaleString('fr-BE', { maximumFractionDigits: 2 });
  if (format === 'jours') return Math.round(n).toLocaleString('fr-BE', { maximumFractionDigits: 0 }) + ' j';
  return Math.round(n).toLocaleString('fr-BE', { maximumFractionDigits: 0 }) + ' €';
}

// Courbe d'évolution agrandie d'un seul KPI (remplace la sparkline pour les KPI ayant au moins
// 2 points). Renvoie false si pas assez de données — l'appelant affiche alors un message à la place.
export function htmlCourbeKpi(id) {
  return `<canvas id="${id}" height="110"></canvas>`;
}
export function montrerCourbeKpi(id, points, opts = {}) {
  const valides = (points || []).filter(p => typeof p.value === 'number');
  if (valides.length < 2) return false;
  const couleur = valides.every(p => p.value <= 0) ? LINE_COLOR_NEG : LINE_COLOR;
  montage(id, {
    type: 'line',
    data: {
      labels: valides.map(p => p.label),
      datasets: [{
        data: valides.map(p => p.value),
        borderColor: couleur, backgroundColor: couleur + '26', fill: true, tension: 0.3,
        pointBackgroundColor: couleur, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => formatAxe(ctx.parsed.y, opts.format) } },
      },
      scales: {
        y: { ticks: { callback: (v) => formatAxe(v, opts.format) }, grid: { color: GRID_COLOR } },
        x: { grid: { display: false } },
      },
    },
  });
  return true;
}

// Jauge (demi-anneau) du score de santé global /100, avec la note (A-D/E) au centre.
const COULEURS_NOTE = { A: '#1e7d43', B: '#c9a227', C: '#e07b1a', D: '#c0392b', E: '#9ca3af' };
export function htmlJaugeScore(id) {
  return `
    <div class="jauge-wrap">
      <canvas id="${id}" height="130"></canvas>
      <div class="jauge-centre" id="${id}-centre"></div>
    </div>`;
}
export function montrerJaugeScore(id, scoreGlobal) {
  const couleur = COULEURS_NOTE[scoreGlobal.note] || COULEURS_NOTE.E;
  const valeur = typeof scoreGlobal.score === 'number' ? scoreGlobal.score : 0;
  montage(id, {
    type: 'doughnut',
    data: { datasets: [{ data: [valeur, 100 - valeur], backgroundColor: [couleur, '#EEF1F8'], borderWidth: 0 }] },
    options: {
      maintainAspectRatio: false,
      circumference: 180, rotation: 270, cutout: '74%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { animateRotate: true },
    },
  });
  const centre = document.getElementById(`${id}-centre`);
  if (centre) {
    centre.innerHTML = (typeof scoreGlobal.score === 'number')
      ? `<span class="jauge-note" style="color:${couleur};">${escapeXml(scoreGlobal.note)}</span><span class="jauge-valeur">${scoreGlobal.score}/100</span>`
      : `<span class="jauge-note" style="color:${couleur};">—</span>`;
  }
}

// Radar (profil) des groupes de KPI (Liquidité, Solvabilité, Rentabilité, Trésorerie, Délais de
// paiement, Stocks), chacun ramené à un score /100 — même échelle que le score global.
// groupesAnterieurs (facultatif) affiche l'exercice précédent en superposition, pour visualiser
// l'évolution du profil d'un coup d'œil.
// N'affiche une branche que pour les groupes réellement calculables sur l'exercice analysé
// (groupes = scoresParGroupe(kpis), qui exclut déjà les groupes sans aucun KPI calculable) : un
// groupe absent (ex. "Délais de paiement" si aucun des 3 KPI n'a pu être calculé) ne doit PAS
// apparaître comme une branche à 0 — ce serait lu comme "mauvais score" alors que c'est juste
// "pas de donnée", ce qui fausse la lecture visuelle du profil.
const TOUS_GROUPES_RADAR = ['Liquidité', 'Solvabilité', 'Rentabilité', 'Trésorerie', 'Délais de paiement', 'Stocks'];
export function htmlRadarGroupes(id) {
  return `<canvas id="${id}" height="260"></canvas>`;
}
export function montrerRadarGroupes(id, groupes, groupesAnterieurs, labelAnterieur) {
  const labels = TOUS_GROUPES_RADAR.filter(g => groupes && groupes[g] !== undefined);
  if (labels.length === 0) return; // aucun groupe calculable : pas de radar à dessiner
  const datasets = [{
    label: 'Exercice analysé',
    data: labels.map(g => groupes[g]),
    borderColor: '#316A6C', backgroundColor: 'rgba(49,106,108,0.25)',
    pointBackgroundColor: '#316A6C', borderWidth: 2,
  }];
  if (groupesAnterieurs) {
    datasets.push({
      label: labelAnterieur || 'Exercice précédent',
      data: labels.map(g => groupesAnterieurs[g] ?? 0),
      borderColor: '#9CA3AF', backgroundColor: 'rgba(156,163,175,0.12)',
      pointBackgroundColor: '#9CA3AF', borderWidth: 2, borderDash: [4, 3],
    });
  }
  montage(id, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, backdropColor: 'transparent' }, grid: { color: GRID_COLOR } } },
      plugins: { legend: { display: datasets.length > 1, position: 'bottom' } },
    },
  });
}

// Barres groupées comparant plusieurs exercices sur quelques montants clés (CA, résultat, total actif).
// series: [{ label, data: number[], color }], une entrée par métrique affichée.
export function htmlBarresExercices(id) {
  return `<canvas id="${id}" height="170"></canvas>`;
}
export function montrerBarresExercices(id, labelsExercices, series) {
  montage(id, {
    type: 'bar',
    data: {
      labels: labelsExercices,
      datasets: series.map(s => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 4 })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { ticks: { callback: (v) => formatAxe(v) }, grid: { color: GRID_COLOR } },
        x: { grid: { display: false } },
      },
    },
  });
}
