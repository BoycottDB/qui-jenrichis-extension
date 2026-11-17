/* ############################################
   #                                          #
   #        COUCHE D'ACCÈS AUX MARQUES        #
   #                                          #
   ############################################ */

// Les données sont synchronisées par le service worker (background.js) dans
// chrome.storage.local. Les content scripts et la popup ne font que les lire.

const ODM_SITE_URL = 'https://quijenrichis.fr';
const ODM_BRANDS_STORAGE_KEY = 'odm_marques';
const ODM_BRANDS_LAST_UPDATE_KEY = 'odm_marques_last_update';
// Au-delà, les données ne sont plus utilisées : une controverse corrigée ou
// masquée sur le site ne doit pas rester affichée indéfiniment quand la
// synchronisation échoue. L'extension se tait jusqu'à la prochaine réussite.
// 3 jours : le plus court des délais que le site doit tenir (droit de réponse).
const ODM_BRANDS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

async function loadBrands() {
  try {
    const stored = await chrome.storage.local.get([ODM_BRANDS_STORAGE_KEY, ODM_BRANDS_LAST_UPDATE_KEY]);
    const brands = stored[ODM_BRANDS_STORAGE_KEY];
    const age = Date.now() - (stored[ODM_BRANDS_LAST_UPDATE_KEY] || 0);

    if (age > ODM_BRANDS_MAX_AGE_MS) {
      odmLog('Données de marques trop anciennes, ignorées');
      return [];
    }
    if (Array.isArray(brands)) {
      return brands;
    }
  } catch (error) {
    odmLog('Lecture du storage impossible', error);
  }

  return [];
}

// Logo du site, seule ressource déclarée dans web_accessible_resources :
// il s'affiche dans les pages (badges, panneau, titre des fiches produit)
function getLogoUrl() {
  return chrome.runtime.getURL('images/logo.png');
}

function getBrandName(brand) {
  return (brand && brand.nom) || '';
}

// Même slug que le site (odm-web, src/lib/slug.ts)
function odmSlugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Page de la marque sur le site. Un produit (ex. « Knacki ») a sa propre
// adresse, qui montre la page de sa marque vue depuis ce produit.
function getDetectionPageUrl(detection) {
  const nom = detection.type === 'produit' ? detection.nomDetecte : getBrandName(detection.brand);
  return `${ODM_SITE_URL}/marques/${odmSlugify(nom)}`;
}

// Libellé qui précède les étiquettes, repris de la carte d'une marque sur le
// site : il dit d'où elles viennent, pour ne pas attribuer à la marque les
// controverses de ses bénéficiaires
const ODM_LIBELLES_ETIQUETTES = {
  marque: 'Controverses de la marque :',
  beneficiaires: 'Controverses de ses bénéficiaires :',
  marque_ou_beneficiaires: 'Controverses de la marque ou de ses bénéficiaires :'
};

function getLibelleEtiquettes(brand) {
  return ODM_LIBELLES_ETIQUETTES[brand.origineEtiquettes] || '';
}

// Texte d'une étiquette : emoji, nom et nombre à partir de deux controverses
function formatEtiquette(etiquette) {
  const emoji = etiquette.emoji ? `${etiquette.emoji} ` : '';
  const nombre = etiquette.nombre > 1 ? ` ${etiquette.nombre}` : '';
  return `${emoji}${etiquette.nom}${nombre}`;
}

// Bénéficiaires controversés servis par l'API (5 au plus) et nombre des autres
function getBeneficiaires(brand) {
  const noms = (brand.beneficiaires || []).map((beneficiaire) => beneficiaire.nom);
  const total = brand.nbBeneficiaires ?? noms.length;
  return { noms, autres: Math.max(0, total - noms.length) };
}
