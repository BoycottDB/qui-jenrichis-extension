/* ############################################
   #                                          #
   #  CODE POUR LES LISTES DE PRODUITS        #
   #                                          #
   ############################################ */

// Repère les produits des marques de la base dans les listes de produits
// (pages de résultats, rayons, « produits similaires » d'une fiche produit).
// Chaque image de produit est rattachée à sa carte (lib/productCard.js) et la
// marque est cherchée dans les textes de cette carte (lib/brandMatcher.js).
// La plus grande image de la carte reçoit le badge et son liseré, dessinés
// hors du DOM du site (lib/badgeLayer.js) : la photo n'est pas modifiée.

const odmPlpState = {
  mutationObserver: null,
  hideIndicatorTimer: null
};

function detectProductCards(matcher, onDetect) {
  const MIN_IMAGE_SIZE = 100; // px : en dessous, icônes, pictos et images pas encore chargées

  // Une image est réexaminée quand sa source change : les sites affichent
  // d'abord un substitut de 1 px, remplacé par la photo au défilement
  const examinedSources = new WeakMap(); // img -> source examinée
  const imageBrands = new WeakMap(); // img -> marque reconnue
  // Une carte produit peut contenir plusieurs images de la même marque
  // (visuel principal + variantes couleur) : un seul badge par (carte, marque)
  const cardAnchors = new WeakMap(); // carte -> Map(id de marque -> img qui porte le badge)
  const INDICATOR_HIDE_DELAY_MS = 2000;

  // Indicateur « Analyse : N produits » : il n'apparaît qu'au premier produit
  // d'une marque de la base reconnu (une page de forum avec des prix, ou un
  // menu de compte qui ressemble à une carte, n'en a aucun) et compte les
  // cartes produit analysées, pas les images. Il se retire peu après la
  // dernière carte de la première vague ; le scroll infini ne le fait pas revenir.
  const countedCards = new WeakSet();
  let cardCount = 0;
  let indicatorState = 'waiting'; // waiting → shown → done

  function refreshIndicator() {
    updateProgressIndicator(cardCount);
    clearTimeout(odmPlpState.hideIndicatorTimer);
    odmPlpState.hideIndicatorTimer = setTimeout(() => {
      indicatorState = 'done';
      hideProgressIndicator();
    }, INDICATOR_HIDE_DELAY_MS);
  }

  function countCard(card) {
    if (countedCards.has(card)) {
      return;
    }
    countedCards.add(card);
    cardCount++;
    if (indicatorState === 'shown') {
      refreshIndicator();
    }
  }

  function showIndicatorOnFirstDetection() {
    if (indicatorState !== 'waiting') {
      return;
    }
    indicatorState = 'shown';
    showProgressIndicator();
    refreshIndicator();
  }

  function renderedArea(img) {
    const rect = img.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function unmarkImage(img) {
    odmBadgeLayer.removeBadgeFor(img);
  }

  function markImage(img, detection) {
    odmBadgeLayer.addBadge(img, detection);
    if (typeof showDiscoveryAnimation === 'function') {
      showDiscoveryAnimation(img);
    }
  }

  // Marque la carte une seule fois par marque, sur sa plus grande image
  function markCard(img, card, detection) {
    // Pas de badge sur une vignette (variantes couleur) : le visuel principal
    // de la carte le porte
    const rect = img.getBoundingClientRect();
    const min = odmBadgeLayer.MIN_ANCHOR_RENDERED_SIZE;
    const isRenderedTiny = rect.width > 0 && rect.height > 0 && (rect.width < min || rect.height < min);
    if (isRenderedTiny) {
      return;
    }

    let anchors = cardAnchors.get(card);
    if (!anchors) {
      anchors = new Map();
      cardAnchors.set(card, anchors);
    }

    const brandId = detection.brand.id;
    const currentAnchor = anchors.get(brandId);
    const hasLiveAnchor =
      currentAnchor && currentAnchor.isConnected && odmBadgeLayer.hasBadgeFor(currentAnchor);

    if (hasLiveAnchor) {
      if (currentAnchor === img || renderedArea(img) <= renderedArea(currentAnchor)) {
        return;
      }
      unmarkImage(currentAnchor);
    }

    anchors.set(brandId, img);
    markImage(img, detection);
  }

  function detectImageBrand(img) {
    if (img.naturalWidth < MIN_IMAGE_SIZE || img.naturalHeight < MIN_IMAGE_SIZE) {
      return null;
    }
    const card = odmFindProductCard(img);
    if (!card) {
      return null;
    }
    countCard(card);
    const { units, context } = odmCollectCardUnits(card, img);
    const detection = matcher.detect(units, context);
    return detection ? { card, detection } : null;
  }

  function processImage(img) {
    // Pas encore chargée : son événement load la ramènera ici
    if (!img.complete || img.naturalWidth === 0) {
      return;
    }

    const source = img.currentSrc || img.src;
    if (examinedSources.get(img) === source) {
      return;
    }
    examinedSources.set(img, source);

    const found = detectImageBrand(img);
    const brand = found ? found.detection.brand : null;
    const previousBrand = imageBrands.get(img) || null;

    // Même marque qu'avant (image de survol du même produit) : rien à refaire
    if (brand === previousBrand) {
      return;
    }
    if (previousBrand) {
      imageBrands.delete(img);
      unmarkImage(img);
    }
    if (found) {
      imageBrands.set(img, brand);
      showIndicatorOnFirstDetection();
      onDetect(found.detection);
      markCard(img, found.card, found.detection);
    }
  }

  document.querySelectorAll('img').forEach(processImage);

  // Images chargées après coup ou dont la source change. L'événement load ne
  // remonte pas : il est écouté en phase de capture.
  function onImageLoad(event) {
    if (event.target instanceof HTMLImageElement) {
      processImage(event.target);
    }
  }
  document.addEventListener('load', onImageLoad, true);

  // Produits ajoutés dynamiquement (scroll infini, filtres…)
  odmPlpState.mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return;
        }
        if (node.tagName === 'IMG') {
          processImage(node);
          return;
        }
        node.querySelectorAll('img').forEach(processImage);
      });
    });
    // Recaler les badges : des ancres ont pu bouger ou quitter le DOM
    odmBadgeLayer.requestUpdate();
  });
  odmPlpState.mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener('pagehide', () => {
    document.removeEventListener('load', onImageLoad, true);
    if (odmPlpState.mutationObserver) {
      odmPlpState.mutationObserver.disconnect();
      odmPlpState.mutationObserver = null;
    }
    clearTimeout(odmPlpState.hideIndicatorTimer);
  }, { once: true });
}
