/* ############################################
   #                                          #
   #    PANNEAU FICHE PRODUIT (HORS DOM SITE) #
   #                                          #
   ############################################ */

// Sur la fiche produit d'une marque de la base, affiche en bas à droite la
// carte de la marque (lib/brandCard.js), coiffée du logo du site.
// Même principe que badgeLayer : hôte dédié + Shadow DOM, aucune insertion
// dans l'arbre du site. Le panneau se replie en pastille après quelques
// secondes ; la fermeture est mémorisée par marque pour la session.

const odmPdpPanel = (() => {
  const AUTO_COLLAPSE_DELAY_MS = 8000;
  const DISMISS_KEY_PREFIX = 'odm-pdp-dismissed-';

  const PANEL_STYLES = `
    :host { all: initial; }
    .odm-panel,
    .odm-pill {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
    }
    .odm-panel-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    }
    .odm-panel-logo {
      display: block;
      height: 24px;
      width: auto;
      margin-right: auto;
    }
    .odm-panel-button {
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: #f6f3f4;
      color: #503b40;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
    }
    .odm-panel-button:hover {
      background: #fae8ed;
      color: #98105b;
    }
    .odm-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px 6px 8px;
      background: #ffffff;
      border: 2px solid #e8a3b7;
      border-radius: 999px;
      box-shadow: 0 8px 24px rgba(20, 9, 15, 0.2);
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #98105b;
      white-space: nowrap;
      cursor: pointer;
    }
    .odm-pill:hover {
      border-color: #98105b;
    }
    .odm-pill img {
      display: block;
      height: 20px;
      width: auto;
    }
    ${ODM_BRAND_CARD_STYLES}
    /* En dernier : l'emporte sur le display de la pastille */
    .odm-panel--hidden,
    .odm-pill--hidden {
      display: none;
    }
  `;

  let host = null;
  let shadowRoot = null;
  let panel = null;
  let pill = null;
  let current = null; // détection de la page, affichée ou fermée par l'utilisateur
  let collapseTimer = null;

  function dismissKey(brand) {
    return `${DISMISS_KEY_PREFIX}${brand.id}`;
  }

  function isDismissedForSession(brand) {
    try {
      return window.sessionStorage.getItem(dismissKey(brand)) === '1';
    } catch (_) {
      return false;
    }
  }

  function setDismissedForSession(brand, dismissed) {
    try {
      if (dismissed) {
        window.sessionStorage.setItem(dismissKey(brand), '1');
      } else {
        window.sessionStorage.removeItem(dismissKey(brand));
      }
    } catch (_) {
      // sessionStorage indisponible (iframe sandboxée…) : fermeture non mémorisée
    }
  }

  function ensureHost() {
    if (!host) {
      host = document.createElement('div');
      host.id = 'odm-pdp-host';
      host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
      shadowRoot = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = PANEL_STYLES;
      shadowRoot.appendChild(style);
    }
    if (!host.isConnected) {
      (document.body || document.documentElement).appendChild(host);
    }
  }

  function createLogo(className) {
    const logo = document.createElement('img');
    logo.className = className;
    logo.src = getLogoUrl();
    logo.alt = "Qui j'enrichis ?";
    return logo;
  }

  function createBarButton(text, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'odm-panel-button';
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }

  function buildPanel(detection) {
    const bar = document.createElement('div');
    bar.className = 'odm-panel-bar';
    bar.append(
      createLogo('odm-panel-logo'),
      createBarButton('–', 'Réduire', collapse),
      createBarButton('✕', 'Fermer pour cette session', dismiss)
    );

    const card = odmBuildBrandCard(detection);
    card.prepend(bar);

    panel = document.createElement('div');
    panel.className = 'odm-panel';
    panel.setAttribute('role', 'status');
    panel.appendChild(card);

    // Survol = lecture en cours : ne pas replier sous la souris
    panel.addEventListener('mouseenter', cancelAutoCollapse);

    return panel;
  }

  function buildPill(brand) {
    pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'odm-pill odm-pill--hidden';
    pill.title = `Qui j'enrichis en consommant ${getBrandName(brand)} ?`;

    const label = document.createElement('span');
    label.textContent = `${getBrandName(brand)} ▸`;

    pill.append(createLogo(''), label);
    pill.addEventListener('click', expand);
    return pill;
  }

  function render() {
    ensureHost();
    shadowRoot.appendChild(buildPanel(current));
    shadowRoot.appendChild(buildPill(current.brand));
    collapseTimer = setTimeout(collapse, AUTO_COLLAPSE_DELAY_MS);
  }

  function removeElements() {
    cancelAutoCollapse();
    if (panel) panel.remove();
    if (pill) pill.remove();
    panel = null;
    pill = null;
  }

  function collapse() {
    cancelAutoCollapse();
    if (panel) panel.classList.add('odm-panel--hidden');
    if (pill) pill.classList.remove('odm-pill--hidden');
  }

  function expand() {
    cancelAutoCollapse();
    if (pill) pill.classList.add('odm-pill--hidden');
    if (panel) panel.classList.remove('odm-panel--hidden');
  }

  function cancelAutoCollapse() {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  function dismiss() {
    setDismissedForSession(current.brand, true);
    removeElements();
  }

  // La page n'a plus de marque à signaler
  function hide() {
    removeElements();
    current = null;
  }

  // Affiche le panneau de la marque reconnue ; remplace celui d'une autre
  // marque (navigation sans rechargement d'une fiche produit à une autre)
  function show(detection) {
    if (current && current.brand === detection.brand) {
      return;
    }

    hide();
    current = detection;
    if (!isDismissedForSession(detection.brand)) {
      render();
    }
  }

  // Rouvre le panneau à la demande (clic sur le logo du titre), même fermé
  // pour la session
  function reopen() {
    if (!current) {
      return;
    }
    setDismissedForSession(current.brand, false);
    if (!panel) {
      render();
    }
    expand();
  }

  window.addEventListener('pagehide', hide);

  return { show, hide, reopen };
})();
