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
  return Math.round(n).toLocaleString('fr-BE') + ' €';
}

function escapeXml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
