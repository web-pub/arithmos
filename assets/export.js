// Arithmos — Export des KPI en PDF / Excel (V13-006)
// Utilise les librairies globales chargées en <script> classique :
//   - window.XLSX   (SheetJS, déjà utilisé pour l'import des comptes annuels)
//   - window.jspdf.jsPDF (jsPDF, chargée uniquement pour cet export)
// Pas de dépendance ES module supplémentaire : ces deux fonctions prennent
// directement le tableau de KPI renvoyé par calculerKPI() + le nom de la
// société et le libellé de la période affichée (ex. "2024 (12 mois)").
//
// "graphiques" (PDF uniquement, V13-006) : images des graphiques Chart.js déjà affichés à
// l'écran, capturées côté admin.js/resultats.js au moment du clic sur "Export PDF"
// (canvas.toDataURL), sous la forme { jauge, radar, barres, courbes: { code: {dataUrl,w,h} } }.
// Chaque entrée est soit null (graphique non disponible), soit { dataUrl, w, h } où w/h sont les
// dimensions réelles du canvas (pixels), utilisées pour garder le bon ratio dans le PDF.

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

// jsPDF (polices standard "helvetica") ne sait afficher que les caractères latin-1 (WinAnsi).
// Nos montants sont formatés en fr-BE avec un espace INSÉCABLE FIN (U+202F) comme séparateur de
// milliers (ex. "396 255 €") : ce caractère n'existe pas dans cette police, ce qui corrompait tout
// le rendu du bloc de texte concerné (mots éclatés lettre par lettre). On le remplace ici par un
// espace normal, imperceptible visuellement, avant tout passage à jsPDF.
const REGEX_ESPACES_SPECIAUX = new RegExp(
  '[\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]', 'g'
);
function nettoyerTexte(str) {
  return String(str ?? '').replace(REGEX_ESPACES_SPECIAUX, ' ');
}

// Dimensionne une image (dataURL + dimensions réelles en pixels) pour qu'elle tienne dans un
// rectangle maxLargeur×maxHauteur (mm) en conservant son ratio, et l'ajoute au PDF à (x, y).
// Renvoie la hauteur réellement utilisée (0 si pas d'image). x reçoit le centrage horizontal
// optionnel quand centrerDans (largeur en mm) est fourni.
function ajouterImageAjustee(doc, img, x, y, maxLargeur, maxHauteur, centrerDans) {
  if (!img || !img.dataUrl || !img.w || !img.h) return 0;
  let largeur = maxLargeur;
  let hauteur = (img.h / img.w) * largeur;
  if (hauteur > maxHauteur) {
    hauteur = maxHauteur;
    largeur = (img.w / img.h) * hauteur;
  }
  const posX = centrerDans ? x + (centrerDans - largeur) / 2 : x;
  try {
    doc.addImage(img.dataUrl, 'PNG', posX, y, largeur, hauteur, undefined, 'FAST');
  } catch (e) {
    return 0; // image corrompue/illisible : on continue sans bloquer tout l'export
  }
  return hauteur;
}

const COULEUR_STATUT = {
  bon: [30, 125, 67], correct: [184, 134, 11], fragile: [192, 57, 43], neutre: [120, 120, 120],
};
const COULEUR_FOND_STATUT = {
  bon: [228, 243, 232], correct: [255, 243, 220], fragile: [251, 228, 225], neutre: [238, 241, 248],
};
const COULEUR_SEVERITE = { critique: [180, 35, 24], attention: [154, 103, 0] };
const TEAL = [49, 106, 108];
const NAVY = [11, 27, 50];
const NAVY_700 = [40, 76, 120];
const GRIS = [110, 110, 110];

export function exportKpiPdf(nomSociete, periodeLabel, kpis, sante, graphiques) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie d'export PDF n'a pas pu être chargée. Vérifie la connexion internet et réessaie.");
    return;
  }
  const g = graphiques || {};
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const basMarge = 14; // réservé pour le pied de page
  let y = 20;

  function sautDePageSiNecessaire(hauteurBloc) {
    if (y + hauteurBloc > pageHeight - basMarge) {
      doc.addPage();
      y = 20;
    }
  }

  // ---------- En-tête ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...NAVY);
  doc.text('Arithmos — Rapport KPI', marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12.5);
  doc.setTextColor(...NAVY_700);
  doc.text(nettoyerTexte(`${nomSociete || 'Société'} — ${periodeLabel || 'Période'}`), marginX, y);
  y += 5.5;
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-BE')}`, marginX, y);
  y += 5;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.2);
  y += 9;

  // ---------- Score de santé (carte avec jauge) ----------
  if (sante && sante.scoreGlobal) {
    const imgJauge = g.jauge;
    const colImageLargeur = imgJauge ? 36 : 0;
    const colTexteX = marginX + 8 + colImageLargeur + (imgJauge ? 6 : 0);
    const colTexteLargeur = contentWidth - 16 - colImageLargeur - (imgJauge ? 6 : 0);
    const detailTexte = nettoyerTexte(sante.scoreGlobal.detail);
    doc.setFontSize(9.5);
    const lignesDetail = doc.splitTextToSize(detailTexte, colTexteLargeur);
    const hauteurTexte = 7 + lignesDetail.length * 4.3;
    const hauteurCarte = Math.max(colImageLargeur + 8, hauteurTexte + 8);

    sautDePageSiNecessaire(hauteurCarte + 8);
    doc.setFillColor(248, 249, 251);
    doc.setDrawColor(228, 225, 217);
    doc.roundedRect(marginX, y, contentWidth, hauteurCarte, 2.5, 2.5, 'FD');

    if (imgJauge) {
      ajouterImageAjustee(doc, imgJauge, marginX + 8, y + 4, colImageLargeur, hauteurCarte - 8);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...TEAL);
    doc.text('Score de santé financière', colTexteX, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(nettoyerTexte(sante.scoreGlobal.affichage), marginX + contentWidth - 8, y + 7, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(70, 70, 70);
    doc.text(lignesDetail, colTexteX, y + 13.5);
    y += hauteurCarte + 8;

    // ---------- Signaux d'alerte ----------
    sautDePageSiNecessaire(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEAL);
    doc.text("Signaux d'alerte", marginX, y);
    y += 2;
    doc.setDrawColor(...TEAL);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6.5;

    const alertes = sante.alertes || [];
    if (alertes.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(70, 70, 70);
      doc.text('Aucun signal de vigilance détecté sur cette période.', marginX, y);
      y += 9;
    } else {
      alertes.forEach(a => {
        const texte = nettoyerTexte(a.texte);
        doc.setFontSize(9.5);
        const lignes = doc.splitTextToSize(texte, contentWidth - 7);
        const hauteurLigne = lignes.length * 4.3 + 3;
        sautDePageSiNecessaire(hauteurLigne);
        const coul = COULEUR_SEVERITE[a.severite] || [90, 90, 90];
        doc.setFillColor(...coul);
        doc.rect(marginX, y - 3.1, 1.6, lignes.length * 4.3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...coul);
        doc.text(lignes, marginX + 5, y);
        y += hauteurLigne;
      });
      y += 3;
    }
  }

  // ---------- Graphiques globaux (profil + comparaison) ----------
  if (g.radar) {
    sautDePageSiNecessaire(90);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEAL);
    doc.text('Profil global (4 groupes de KPI)', marginX, y);
    y += 2;
    doc.setDrawColor(...TEAL);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    const h = ajouterImageAjustee(doc, g.radar, marginX, y, 110, 85, contentWidth);
    y += h + 9;
  }

  if (g.barres) {
    sautDePageSiNecessaire(75);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEAL);
    doc.text('Comparaison par exercice', marginX, y);
    y += 2;
    doc.setDrawColor(...TEAL);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6;
    const h = ajouterImageAjustee(doc, g.barres, marginX, y, contentWidth, 65);
    y += h + 9;
  }

  // ---------- Détail des KPI, par groupe, en cartes (texte + courbe) ----------
  const groupes = ['Liquidité', 'Solvabilité', 'Rentabilité', 'Trésorerie', 'Délais de paiement'];
  groupes.forEach(groupe => {
    const kpisDuGroupe = kpis.filter(k => k.groupe === groupe);
    if (kpisDuGroupe.length === 0) return;

    sautDePageSiNecessaire(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TEAL);
    doc.text(groupe, marginX, y);
    y += 2;
    doc.setDrawColor(...TEAL);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 6.5;

    kpisDuGroupe.forEach(k => {
      const imgCourbe = (g.courbes || {})[k.code] || null;
      const colImageLargeur = imgCourbe ? 48 : 0;
      const colTexteLargeur = contentWidth - 16 - colImageLargeur - (imgCourbe ? 6 : 0);
      const analyseTexte = nettoyerTexte(k.analyse);
      doc.setFontSize(9.3);
      const lignesAnalyse = doc.splitTextToSize(analyseTexte, colTexteLargeur);
      const hauteurTexteBloc = 15 + lignesAnalyse.length * 4.1;
      const hauteurImageBloc = imgCourbe ? Math.min(24, (imgCourbe.h / imgCourbe.w) * colImageLargeur) + 15 : 0;
      const hauteurCarte = Math.max(hauteurTexteBloc, hauteurImageBloc) + 7;

      sautDePageSiNecessaire(hauteurCarte + 5);
      const coulFond = COULEUR_FOND_STATUT[k.statut] || COULEUR_FOND_STATUT.neutre;
      doc.setFillColor(...coulFond);
      doc.setDrawColor(225, 222, 214);
      doc.roundedRect(marginX, y, contentWidth, hauteurCarte, 2, 2, 'FD');

      const padX = marginX + 7;
      let ligneY = y + 7.5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(25, 25, 25);
      doc.text(nettoyerTexte(k.label), padX, ligneY);

      const valeurTexte = nettoyerTexte(String(k.affichage) + (k.parMois ? ` (${k.parMois}/mois)` : ''));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(valeurTexte, marginX + contentWidth - 7, ligneY, { align: 'right' });
      ligneY += 5.5;

      const coulStatut = COULEUR_STATUT[k.statut] || COULEUR_STATUT.neutre;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...coulStatut);
      doc.text(labelStatutExport(k.statut), padX, ligneY);
      ligneY += 5.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.3);
      doc.setTextColor(60, 60, 60);
      doc.text(lignesAnalyse, padX, ligneY);

      if (imgCourbe) {
        ajouterImageAjustee(doc, imgCourbe, marginX + contentWidth - 7 - colImageLargeur, y + 6, colImageLargeur, hauteurCarte - 10);
      }

      y += hauteurCarte + 5;
    });
    y += 2;
  });

  // ---------- Pied de page ----------
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.text(`Arithmos — ${p}/${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
  }

  doc.save(nomFichier(nomSociete, periodeLabel, 'pdf'));
}
