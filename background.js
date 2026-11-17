/* ############################################
   #                                          #
   #   SERVICE WORKER : SYNC DONNÉES + CACHE  #
   #                                          #
   ############################################ */

const API_BASE_URL = 'https://odm-api.netlify.app/.netlify/functions';
const REFRESH_ALARM = 'odm-refresh-brands';
const REFRESH_PERIOD_MINUTES = 6 * 60;

const STORAGE_KEYS = {
  brands: 'odm_marques',
  lastUpdate: 'odm_marques_last_update'
};

// Clés des anciens formats de données, nettoyées à la mise à jour
const LEGACY_STORAGE_KEYS = [
  'rmb_last_update',
  'rmb_data_version',
  'rmb_dynamic_brands',
  'rmb_merged_data',
  'rmb_static_version',
  'rmb_dynamic_version',
  'odm_brands',
  'odm_brands_etag',
  'odm_brands_last_update'
];

// Sites non marchands où la détection n'a pas de sens
const DEFAULT_DISABLED_SITES = ['x.com', 'youtube.com'];

/* ============================================
   MISE À JOUR DES DONNÉES MARQUES
   ============================================ */

async function fetchList(endpoint) {
  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`API ${endpoint} : HTTP ${response.status}`);
  }

  const list = await response.json();
  if (!Array.isArray(list)) {
    throw new Error(`API ${endpoint} : format de réponse inattendu`);
  }
  return list;
}

// Une marque telle que l'extension la stocke : ce que montre sa carte sur la
// page /marques du site (marques-stats) et les noms qui la désignent (marques-noms)
function toStoredBrand(stats, noms) {
  const beneficiaires = stats.beneficiairesControverses || [];
  return {
    id: stats.id,
    nom: stats.nom,
    autres_noms: (noms && noms.autres_noms) || [],
    variantes: (noms && noms.variantes) || [],
    noms_ambigus: (noms && noms.noms_ambigus) || [],
    etiquettes: stats.etiquettes || [],
    origineEtiquettes: stats.origineEtiquettes || null,
    beneficiaires,
    nbBeneficiaires: stats.nbBeneficiairesControverses ?? beneficiaires.length
  };
}

async function refreshBrands() {
  try {
    const [marquesStats, marquesNoms] = await Promise.all([
      fetchList('marques-stats'),
      fetchList('marques-noms')
    ]);

    const nomsParId = new Map(marquesNoms.map((marque) => [marque.id, marque]));
    const brands = marquesStats.map((stats) => toStoredBrand(stats, nomsParId.get(stats.id)));

    await chrome.storage.local.set({
      [STORAGE_KEYS.brands]: brands,
      [STORAGE_KEYS.lastUpdate]: Date.now()
    });
  } catch (error) {
    // Les content scripts continuent avec les données déjà stockées
    console.error('ODM : échec de la mise à jour des marques', error);
  }
}

async function refreshBrandsIfStale() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.brands, STORAGE_KEYS.lastUpdate]);
  const hasBrands = Array.isArray(stored[STORAGE_KEYS.brands]) && stored[STORAGE_KEYS.brands].length > 0;
  const age = Date.now() - (stored[STORAGE_KEYS.lastUpdate] || 0);

  if (!hasBrands || age >= REFRESH_PERIOD_MINUTES * 60 * 1000) {
    await refreshBrands();
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const { disabledSites } = await chrome.storage.sync.get('disabledSites');
  if (!disabledSites) {
    await chrome.storage.sync.set({ disabledSites: DEFAULT_DISABLED_SITES });
  }

  await chrome.storage.local.remove(LEGACY_STORAGE_KEYS);

  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES });
  await refreshBrands();
});

chrome.runtime.onStartup.addListener(() => {
  refreshBrandsIfStale();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    refreshBrands();
  }
});

/* ============================================
   ÉTAT DE CHAQUE ONGLET
   (storage.session : survit à la mise en
   sommeil du service worker, pas au redémarrage)
   ============================================ */

// Domaine de la page et marques repérées, lus directement par la popup
// (même clé dans popup.js)
function tabStateKey(tabId) {
  return `odm_tab_${tabId}`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateTabState') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      chrome.storage.session.set({
        [tabStateKey(tabId)]: { domain: request.domain || '', detections: request.detections || [] }
      });
    }
    // Profiter du réveil du service worker pour rafraîchir si besoin
    refreshBrandsIfStale();
    sendResponse({ success: true });
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabStateKey(tabId));
});
