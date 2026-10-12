// Arithmos — contenu éditable des pages publiques (V06-001)
// Un seul document Firestore (contenu/site) porte tous les textes modifiables depuis
// l'Admin. Chaque page publique charge ce document et remplace, par data-content-key,
// le texte déjà présent dans le HTML (qui sert de valeur par défaut tant que rien n'a
// été édité, et de contenu visible si Firestore est inaccessible).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export async function applyContenuPublic() {
  try {
    const app = initializeApp(firebaseConfig, "contenu-public");
    const db = getFirestore(app);
    const snap = await getDoc(doc(db, 'contenu', 'site'));
    if (!snap.exists()) return;
    const data = snap.data();

    document.querySelectorAll('[data-content-key]').forEach(el => {
      const key = el.getAttribute('data-content-key');
      const valeur = data[key];
      if (typeof valeur === 'string' && valeur.trim() !== '') {
        el.textContent = valeur;
      }
    });
  } catch (err) {
    // Pas bloquant : la page garde son texte par défaut si Firestore est injoignable.
    console.warn('Contenu personnalisé non chargé :', err.message);
  }
}
