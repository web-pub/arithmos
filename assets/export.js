// Arithmos — Export des KPI en PDF / Excel (V10-001)
// Utilise les librairies globales chargées en <script> classique :
//   - window.XLSX   (SheetJS, déjà utilisé pour l'import des comptes annuels)
//   - window.jspdf.jsPDF (jsPDF, chargée uniquement pour cet export)
// Pas de dépendance ES module supplémentaire : ces deux fonctions prennent
// directement le tableau de KPI renvoyé par calculerKPI() + le nom de la
// société et le libellé de la période affichée (ex. "2024 (12 mois)").

function slug(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function nomFichier(nomSociete, periodeLabel, extension) {
  return `arithmos-kpi-${slug(nomSociete) || 'societe'}-${slug(periodeLabel) || 'periode'}.${extension}`;
}

function labelStatutExport(statut) {
  return { bon: 'Bon', correct: 'Correct', fragile: 'À surveiller', neutre: '—' }[statut] || '—';
}

export function exportKpiExcel(nomSociete, periodeLabel, kpis, sante) {
  if (!window.XLSX) {
    alert("La librairie d'export Excel n'a pas pu être chargée. Vérifie la connexion internet et réessaie.");
    return;
  }
  const rows = [];
  if (sante && sante.scoreGlobal) {
    rows.push({ 'Groupe': 'Synthèse', 'Indicateur': 'Score de santé financière', 'Valeur': sante.scoreGlobal.affichage, 'Statut': sante.scoreGlobal.label || '', 'Analyse': sante.scoreGlobal.detail });
    (sante.alertes || []).forEach(a => rows.push({ 'Groupe': 'Signaux d\'alerte', 'Indicateur': a.severite === 'critique' ? 'Critique' : 'À surveiller', 'Valeur': '', 'Statut': '', 'Analyse': a.texte }));
    if (!(sante.alertes || []).length) rows.push({ 'Groupe': 'Signaux d\'alerte', 'Indicateur': '—', 'Valeur': '', 'Statut': '', 'Analyse': 'Aucun signal de vigilance détecté sur cette période.' });
  }
  kpis.forEach(k => rows.push({
    'Groupe': k.groupe,
    'Indicateur': k.label,
    'Valeur': k.affichage + (k.parMois ? ` (${k.parMois}/mois)` : ''),
    'Statut': labelStatutExport(k.statut),
    'Analyse': k.analyse,
  }));
  const ws = window.XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 16 }, { wch: 12 }, { wch: 80 }];
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'KPI'.concat(' ', periodeLabel || '').slice(0, 31));
  window.XLSX.writeFile(wb, nomFichier(nomSociete, periodeLabel, 'xlsx'));
}

export function exportKpiPdf(nomSociete, periodeLabel, kpis, sante) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie d'export PDF n'a pas pu être chargée. Vérifie la connexion internet et réessaie.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 16;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(11, 27, 50); // navy-950
  doc.text('Arithmos — Rapport KPI', marginX, y);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(40, 76, 120); // navy-700
  doc.text(`${nomSociete || 'Société'} — ${periodeLabel || 'Période'}`, marginX, y);
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-BE')}`, marginX, y);
  y += 9;

  const groupes = ['Liquidité', 'Solvabilité', 'Rentabilité', 'Trésorerie'];
  const couleurStatut = {
    bon: [30, 125, 67], correct: [184, 134, 11], fragile: [192, 57, 43], neutre: [120, 120, 120],
  };
  const couleurSeverite = { critique: [180, 35, 24], attention: [154, 103, 0] };

  if (sante && sante.scoreGlobal) {
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(49, 106, 108);
    doc.text('Score de santé financière', marginX, y);
    doc.setFontSize(11);
    doc.text(sante.scoreGlobal.affichage, pageWidth - marginX, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(49, 106, 108);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    const lignesScore = doc.splitTextToSize(sante.scoreGlobal.detail, pageWidth - marginX * 2);
    doc.text(lignesScore, marginX, y);
    y += lignesScore.length * 4.3 + 7;

    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(49, 106, 108);
    doc.text("Signaux d'alerte", marginX, y);
    y += 2;
    doc.setDrawColor(49, 106, 108);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    const alertes = sante.alertes || [];
    if (alertes.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(60, 60, 60);
      doc.text('Aucun signal de vigilance détecté sur cette période.', marginX, y);
      y += 8;
    } else {
      alertes.forEach(a => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...(couleurSeverite[a.severite] || [60, 60, 60]));
        const lignes = doc.splitTextToSize('• ' + a.texte, pageWidth - marginX * 2);
        doc.text(lignes, marginX, y);
        y += lignes.length * 4.3 + 2;
      });
      y += 4;
    }
  }

  groupes.forEach(groupe => {
    const kpisDuGroupe = kpis.filter(k => k.groupe === groupe);
    if (kpisDuGroupe.length === 0) return;

    if (y > 265) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(49, 106, 108); // teal (orange-500 var, now teal)
    doc.text(groupe, marginX, y);
    y += 2;
    doc.setDrawColor(49, 106, 108);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;

    kpisDuGroupe.forEach(k => {
      if (y > 260) { doc.addPage(); y = 20; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);
      doc.text(k.label, marginX, y);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);
      const valeurTexte = String(k.affichage) + (k.parMois ? ` (${k.parMois}/mois)` : '');
      doc.text(valeurTexte, pageWidth - marginX, y, { align: 'right' });
      y += 5;

      const coul = couleurStatut[k.statut] || couleurStatut.neutre;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...coul);
      doc.text(labelStatutExport(k.statut), marginX, y);
      y += 4.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(60, 60, 60);
      const lignes = doc.splitTextToSize(k.analyse, pageWidth - marginX * 2);
      doc.text(lignes, marginX, y);
      y += lignes.length * 4.3 + 5;
    });
    y += 2;
  });

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.text(`Arithmos — ${p}/${pageCount}`, pageWidth - marginX, 290, { align: 'right' });
  }

  doc.save(nomFichier(nomSociete, periodeLabel, 'pdf'));
}
