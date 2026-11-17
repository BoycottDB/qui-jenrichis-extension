/* ############################################
   #                                          #
   #   POINT D'ENTRÉE : ORCHESTRATION PAGE    #
   #                                          #
   ############################################ */

(async function initODMDetection() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.runtime) {
    return;
  }

  const MAX_SITE_CHECKS = 5;
  const SITE_CHECK_DELAY_MS = 1000;
  const PAGE_CHECK_PERIOD_MS = 1000;
  const MAX_PAGE_CHECKS = 5;
  const SEND_DELAY_MS = 500;

  // Domaine de la page et marques repérées (liste de produits et fiche
  // produit réunies), transmis au background pour la popup avec un léger
  // délai pour grouper les envois
  const domain = getDomain(window.location.hostname);
  const detections = new Map(); // id de marque -> détection
  let sendTimer = null;

  function sendToBackground() {
    chrome.runtime.sendMessage(
      { action: 'updateTabState', domain, detections: Array.from(detections.values()) },
      () => void chrome.runtime.lastError
    );
  }

  function reportDetection(detection) {
    if (detections.has(detection.brand.id)) {
      return;
    }
    detections.set(detection.brand.id, detection);
    clearTimeout(sendTimer);
    sendTimer = setTimeout(sendToBackground, SEND_DELAY_MS);
  }

  // Signaler l'état initial : une liste vide efface les détections de la page
  // précédente pour cet onglet
  sendToBackground();

  const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
  if (isSiteDisabled(disabledSites)) {
    odmLog('Extension désactivée sur ce site');
    return;
  }

  async function startDetection() {
    const brands = await loadBrands();
    if (brands.length === 0) {
      odmLog('Aucune donnée de marques disponible');
      return;
    }

    const matcher = createBrandMatcher(brands);

    // Les listes de produits sont surveillées sur toutes les pages (une fiche
    // produit a aussi ses « produits similaires »)
    detectProductCards(matcher, reportDetection);

    // La fiche produit est cherchée à chaque changement d'adresse (les sites à
    // navigation sans rechargement ne relancent pas ce script), en quelques
    // essais : son contenu peut être rendu après coup
    let checkedUrl = null;
    let remainingChecks = 0;

    function checkPage() {
      if (checkedUrl !== window.location.href) {
        checkedUrl = window.location.href;
        remainingChecks = MAX_PAGE_CHECKS;
        stopProductPageDetection();
      }
      if (remainingChecks === 0) {
        return;
      }

      remainingChecks--;
      if (isProductDetailPage()) {
        odmLog('Fiche produit détectée');
        remainingChecks = 0;
        detectProductPage(matcher, reportDetection);
      }
    }

    checkPage();
    const pageTimer = setInterval(checkPage, PAGE_CHECK_PERIOD_MS);
    window.addEventListener('pagehide', () => clearInterval(pageTimer), { once: true });
  }

  // Un site marchand ne se reconnaît pas toujours au chargement (contenu rendu
  // après coup) : la vérification est retentée quand la page change, quelques fois
  let siteChecks = 0;
  let siteCheckTimer = null;
  let siteObserver = null;

  function checkSite() {
    siteChecks++;
    const isECommerce = isECommerceSite();

    if (isECommerce || siteChecks >= MAX_SITE_CHECKS) {
      siteObserver.disconnect();
      clearTimeout(siteCheckTimer);
    }
    if (isECommerce) {
      startDetection();
    } else {
      odmLog('Site non e-commerce, détection ignorée');
    }
  }

  siteObserver = new MutationObserver(() => {
    clearTimeout(siteCheckTimer);
    siteCheckTimer = setTimeout(checkSite, SITE_CHECK_DELAY_MS);
  });
  siteObserver.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    siteObserver.disconnect();
    clearTimeout(siteCheckTimer);
  }, { once: true });

  checkSite();
})();
