/* ############################################
   #                                          #
   #     COUCHE DE BADGES (HORS DOM SITE)     #
   #                                          #
   ############################################ */

// Les badges vivent dans un hôte unique ajouté à la page avec un Shadow DOM
// (styles isolés du site). Chaque badge est le logo du site posé comme un
// autocollant sur l'image d'un produit, avec un liseré autour de l'image, en
// position fixed, recalés au scroll/resize. Au survol ou au clic, le badge
// ouvre la carte de la marque (lib/brandCard.js). Rien n'est inséré dans les
// cartes produit du site ni modifié sur ses images : pas de wrapper, pas de
// classe, pas d'override position/overflow.

const odmBadgeLayer = (() => {
  const MIN_ANCHOR_RENDERED_SIZE = 90; // px : ancre rendue plus petite → badge masqué
  const COMPACT_ANCHOR_WIDTH = 200; // px : ancre étroite → badge réduit
  const ANCHOR_MARGIN = 8; // px : retrait par rapport au coin de l'image
  const CARD_GAP = 6; // px : écart entre le badge et sa carte
  const CARD_HIDE_DELAY_MS = 250; // le temps de passer du badge à sa carte
  const VIEWPORT_MARGIN = 8; // px : la carte ne colle pas au bord de la fenêtre
  // Un élément du site qui couvre l'essentiel de l'image (lien étiré sur toute
  // la carte) n'occupe pas un coin ; un bouton ou une étiquette, si
  const LARGE_COVER_RATIO = 0.8;
  const PROBE_INSET = 2; // px : les points sondés restent à l'intérieur du badge
  // Coins essayés dans l'ordre : le premier que le site n'occupe pas
  const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

  const LAYER_STYLES = `
    :host { all: initial; }
    .odm-badge {
      position: fixed;
      display: block;
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
      line-height: 0;
      filter: drop-shadow(0 2px 4px rgba(20, 9, 15, 0.35));
      transition: transform 0.15s ease;
    }
    .odm-badge:hover,
    .odm-badge:focus-visible {
      transform: scale(1.12) rotate(-3deg);
      outline: none;
    }
    .odm-badge img {
      display: block;
      height: 26px;
      width: auto;
    }
    .odm-badge--compact img {
      height: 18px;
    }
    .odm-frame {
      position: fixed;
      box-sizing: border-box;
      border: 2px solid rgba(152, 16, 91, 0.55);
      pointer-events: none;
    }
    .odm-popover {
      position: fixed;
    }
    ${ODM_BRAND_CARD_STYLES}
    /* En dernier : l'emporte sur les display ci-dessus */
    .odm-badge--hidden,
    .odm-frame--hidden,
    .odm-popover--hidden {
      display: none;
    }
  `;

  let host = null;
  let shadowRoot = null;
  let popover = null;
  let popoverBadge = null;
  let popoverHideTimer = null;
  let listenersInstalled = false;
  let updateScheduled = false;
  const badges = new Map(); // img ancre -> { element, frame, clippers, detection, corner (définitif), shownCorner }

  function ensureHost() {
    if (!host) {
      host = document.createElement('div');
      host.id = 'odm-badge-host';
      // Hôte sans emprise : aucune boîte, aucun impact sur le layout du site.
      // Shadow root "open" pour rester inspectable (environnement de test).
      host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
      shadowRoot = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = LAYER_STYLES;
      shadowRoot.appendChild(style);

      popover = document.createElement('div');
      popover.className = 'odm-popover odm-popover--hidden';
      popover.addEventListener('mouseenter', cancelPopoverHide);
      popover.addEventListener('mouseleave', schedulePopoverHide);
      shadowRoot.appendChild(popover);
    }

    if (!host.isConnected) {
      (document.body || document.documentElement).appendChild(host);
    }

    if (!listenersInstalled) {
      listenersInstalled = true;
      // capture: true attrape aussi le scroll des conteneurs internes
      window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
      window.addEventListener('resize', onViewportChange, { passive: true });
      // Suivre les cartes animées au survol (transform/transition)
      document.addEventListener('transitionend', requestUpdate, { capture: true, passive: true });
      document.addEventListener('animationend', requestUpdate, { capture: true, passive: true });
      // Un clic ailleurs dans la page referme la carte ouverte
      document.addEventListener('click', onDocumentClick, { capture: true, passive: true });
      // Reset demandé par l'environnement de test
      document.addEventListener('odm:clear-badges', clearAll);
      window.addEventListener('pagehide', clearAll, { once: true });
    }
  }

  /* ============================================
     CARTE DE LA MARQUE, AU SURVOL D'UN BADGE
     ============================================ */

  function showPopover(badge) {
    cancelPopoverHide();
    if (popoverBadge === badge) {
      return;
    }
    popoverBadge = badge;
    popover.replaceChildren(odmBuildBrandCard(badge.detection));
    popover.classList.remove('odm-popover--hidden');
    positionPopover();
    // Le liseré du produit s'efface sous sa carte (updateAll) : leurs deux
    // bords se croiseraient
    requestUpdate();
  }

  // Sous le badge si la place suffit, sinon au-dessus ; du même côté de
  // l'image que lui, pour recouvrir son propre produit plutôt que le voisin ;
  // jamais hors de la fenêtre
  function positionPopover() {
    const badgeRect = popoverBadge.element.getBoundingClientRect();
    const cardRect = popover.getBoundingClientRect();

    const fitsBelow = badgeRect.bottom + CARD_GAP + cardRect.height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow
      ? badgeRect.bottom + CARD_GAP
      : Math.max(VIEWPORT_MARGIN, badgeRect.top - CARD_GAP - cardRect.height);
    const alignedLeft = popoverBadge.shownCorner.endsWith('right')
      ? badgeRect.right - cardRect.width
      : badgeRect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, alignedLeft),
      window.innerWidth - cardRect.width - VIEWPORT_MARGIN
    );

    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
  }

  function hidePopover() {
    cancelPopoverHide();
    if (popover) {
      popover.classList.add('odm-popover--hidden');
    }
    if (popoverBadge) {
      popoverBadge = null;
      // Le liseré du produit revient
      requestUpdate();
    }
  }

  function schedulePopoverHide() {
    cancelPopoverHide();
    popoverHideTimer = setTimeout(hidePopover, CARD_HIDE_DELAY_MS);
  }

  function cancelPopoverHide() {
    clearTimeout(popoverHideTimer);
    popoverHideTimer = null;
  }

  // Les clics dans la couche (badge, carte) arrivent avec l'hôte pour cible
  function onDocumentClick(event) {
    if (event.target !== host) {
      hidePopover();
    }
  }

  /* ============================================
     BADGES
     ============================================ */

  function createBadgeElement(badge) {
    const brandName = getBrandName(badge.detection.brand);

    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'odm-badge odm-badge--hidden';
    element.dataset.brandName = brandName;
    element.setAttribute('aria-label', `Qui j'enrichis en consommant ${brandName} ?`);

    const logo = document.createElement('img');
    logo.src = getLogoUrl();
    logo.alt = '';
    // Le badge n'a sa taille qu'une fois le logo chargé
    logo.addEventListener('load', requestUpdate, { once: true });
    element.appendChild(logo);

    element.addEventListener('mouseenter', () => showPopover(badge));
    element.addEventListener('mouseleave', schedulePopoverHide);
    element.addEventListener('focus', () => showPopover(badge));
    element.addEventListener('blur', schedulePopoverHide);
    element.addEventListener('click', (event) => {
      // Le clic ne doit pas ouvrir le produit du site sous le badge
      event.preventDefault();
      event.stopPropagation();
      showPopover(badge);
    });

    return element;
  }

  // Liseré autour de l'image : dessiné dans la couche et non sur l'image, il
  // reste visible quand le site masque l'image (photo de survol superposée) ou
  // réécrit ses classes
  function createFrameElement(anchorImg) {
    const frame = document.createElement('div');
    frame.className = 'odm-frame odm-frame--hidden';
    frame.style.borderRadius = window.getComputedStyle(anchorImg).borderRadius;
    return frame;
  }

  function addBadge(anchorImg, detection) {
    if (badges.has(anchorImg)) {
      return;
    }

    ensureHost();

    const badge = {
      detection,
      corner: null,
      shownCorner: CORNERS[0],
      element: null,
      frame: createFrameElement(anchorImg),
      clippers: findClippingAncestors(anchorImg)
    };
    badge.element = createBadgeElement(badge);
    shadowRoot.append(badge.frame, badge.element);
    badges.set(anchorImg, badge);
    // Marqueur inspectable depuis la page (debug + environnement de test)
    anchorImg.dataset.odmBadgeBrand = getBrandName(detection.brand);

    requestUpdate();
  }

  function removeBadgeFor(anchorImg) {
    const badge = badges.get(anchorImg);
    if (!badge) {
      return;
    }
    if (popoverBadge === badge) {
      hidePopover();
    }
    badge.element.remove();
    badge.frame.remove();
    badges.delete(anchorImg);
    delete anchorImg.dataset.odmBadgeBrand;
  }

  function hasBadgeFor(anchorImg) {
    return badges.has(anchorImg);
  }

  /* ============================================
     POSITIONNEMENT
     ============================================ */

  // Ancêtres qui rognent leur contenu (carrousel, carte à coins arrondis…)
  function findClippingAncestors(anchorImg) {
    const clippers = [];
    for (let element = anchorImg.parentElement; element && element !== document.documentElement; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
        clippers.push(element);
      }
    }
    return clippers;
  }

  // Partie de l'image réellement visible dans la page : sa boîte, rognée par
  // les ancêtres qui masquent ce qui dépasse
  function visibleRect(anchorImg, clippers) {
    const rect = anchorImg.getBoundingClientRect();
    let { left, top, right, bottom } = rect;
    clippers.forEach((clipper) => {
      const clip = clipper.getBoundingClientRect();
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    });
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  // Position du badge (son coin haut gauche) pour un coin donné de l'image
  function cornerPosition(corner, anchorRect, badgeRect) {
    const onRight = corner.endsWith('right');
    const onBottom = corner.startsWith('bottom');
    return {
      left: onRight ? anchorRect.right - ANCHOR_MARGIN - badgeRect.width : anchorRect.left + ANCHOR_MARGIN,
      top: onBottom ? anchorRect.bottom - ANCHOR_MARGIN - badgeRect.height : anchorRect.top + ANCHOR_MARGIN
    };
  }

  function isInViewport(x, y) {
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
  }

  // Le site a-t-il déjà posé quelque chose à cet endroit de l'image (cœur
  // des favoris, étiquette de promotion, note…) ?
  function isOccupiedBySite(x, y, anchorImg, anchorRect) {
    const element = document.elementFromPoint(x, y);
    if (!element || element === anchorImg || element.contains(anchorImg)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const coversAnchor =
      rect.width * rect.height >= anchorRect.width * anchorRect.height * LARGE_COVER_RATIO;
    return !coversAnchor;
  }

  // Points sondés sous l'emplacement d'un badge : son centre et ses quatre coins
  function probePoints(position, badgeRect) {
    const left = position.left + PROBE_INSET;
    const right = position.left + badgeRect.width - PROBE_INSET;
    const top = position.top + PROBE_INSET;
    const bottom = position.top + badgeRect.height - PROBE_INSET;
    return [
      [position.left + badgeRect.width / 2, position.top + badgeRect.height / 2],
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom]
    ];
  }

  // Premier coin de l'image que le site n'occupe pas. `settled` : tous les
  // coins étaient à l'écran, le choix est définitif.
  function chooseCorner(anchorImg, anchorRect, badgeRect) {
    let firstFree = null;
    let settled = true;

    // Nos propres badges ne doivent pas compter comme un élément du site
    host.style.pointerEvents = 'none';
    for (const corner of CORNERS) {
      const points = probePoints(cornerPosition(corner, anchorRect, badgeRect), badgeRect);
      if (!points.every(([x, y]) => isInViewport(x, y))) {
        settled = false;
      } else if (!firstFree && !points.some(([x, y]) => isOccupiedBySite(x, y, anchorImg, anchorRect))) {
        firstFree = corner;
      }
    }
    host.style.pointerEvents = '';

    return { corner: firstFree || CORNERS[0], settled };
  }

  function onViewportChange() {
    // La carte ouverte ne suit pas son badge : elle se referme
    hidePopover();
    requestUpdate();
  }

  function requestUpdate() {
    if (updateScheduled) {
      return;
    }
    updateScheduled = true;
    requestAnimationFrame(() => {
      updateScheduled = false;
      updateAll();
    });
  }

  function updateAll() {
    badges.forEach((badge, anchorImg) => {
      // L'ancre a quitté le DOM (scroll virtuel, re-render) : le badge meurt avec elle
      if (!anchorImg.isConnected) {
        removeBadgeFor(anchorImg);
        return;
      }

      const anchorRect = visibleRect(anchorImg, badge.clippers);
      const bigEnough =
        anchorRect.width >= MIN_ANCHOR_RENDERED_SIZE && anchorRect.height >= MIN_ANCHOR_RENDERED_SIZE;
      const inViewport =
        anchorRect.bottom > 0 &&
        anchorRect.right > 0 &&
        anchorRect.top < window.innerHeight &&
        anchorRect.left < window.innerWidth;

      badge.element.classList.toggle('odm-badge--hidden', !bigEnough || !inViewport);
      badge.frame.classList.toggle('odm-frame--hidden', !bigEnough || !inViewport || popoverBadge === badge);
      if (!bigEnough || !inViewport) {
        return;
      }

      badge.frame.style.top = `${Math.round(anchorRect.top)}px`;
      badge.frame.style.left = `${Math.round(anchorRect.left)}px`;
      badge.frame.style.width = `${Math.round(anchorRect.width)}px`;
      badge.frame.style.height = `${Math.round(anchorRect.height)}px`;

      badge.element.classList.toggle('odm-badge--compact', anchorRect.width < COMPACT_ANCHOR_WIDTH);
      const badgeRect = badge.element.getBoundingClientRect();
      // Logo pas encore chargé : le badge n'a pas de taille, donc pas de place à choisir
      if (badgeRect.width === 0) {
        return;
      }

      let corner = badge.corner;
      if (!corner) {
        const choice = chooseCorner(anchorImg, anchorRect, badgeRect);
        corner = choice.corner;
        if (choice.settled) {
          badge.corner = corner;
        }
      }

      badge.shownCorner = corner;
      const position = cornerPosition(corner, anchorRect, badgeRect);
      badge.element.style.top = `${Math.round(position.top)}px`;
      badge.element.style.left = `${Math.round(position.left)}px`;
    });
  }

  function clearAll() {
    hidePopover();
    badges.forEach((badge, anchorImg) => {
      badge.element.remove();
      badge.frame.remove();
      delete anchorImg.dataset.odmBadgeBrand;
    });
    badges.clear();
  }

  function getBadgeCount() {
    return badges.size;
  }

  return {
    addBadge,
    removeBadgeFor,
    hasBadgeFor,
    requestUpdate,
    clearAll,
    getBadgeCount,
    MIN_ANCHOR_RENDERED_SIZE
  };
})();
