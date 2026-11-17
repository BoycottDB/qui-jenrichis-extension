/* ############################################
   #                                          #
   #  CODE POUR LES FICHES PRODUIT            #
   #                                          #
   ############################################ */

// Sur une fiche produit, cherche la marque du produit : d'abord celle que la
// page déclare (lib/productPage.js), sinon dans le nom du produit et le titre
// de la page. La marque reconnue est signalée par le panneau
// (lib/pdpPanel.js) et soulignée dans le titre.

const odmPdpState = {
  matcher: null,
  onDetect: null,
  observer: null,
  debounceTimer: null
};

// Logo du site inséré après le nom de la marque dans le titre : un clic
// rouvre le panneau
function createTitleLogo(brand) {
  const logo = document.createElement('img');
  logo.className = 'bx-brand-logo-mini';
  logo.src = getLogoUrl();
  logo.alt = '';
  logo.title = `Qui j'enrichis en consommant ${getBrandName(brand)} ?`;

  logo.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    odmPdpPanel.reopen();
  });

  return logo;
}

// Souligne la première occurrence d'un nom de la marque et la fait suivre du
// logo, en découpant le nœud de texte (aucun innerHTML sur du contenu de page)
function highlightBrandInTitle(title, brand) {
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);

  let textNode;
  while ((textNode = walker.nextNode())) {
    const position = odmPdpState.matcher.locateBrandName(textNode.textContent, brand);
    if (!position) {
      continue;
    }

    const brandNode = textNode.splitText(position.index);
    brandNode.splitText(position.length);

    const wrapper = document.createElement('span');
    wrapper.className = 'bx-title-with-brand';
    brandNode.parentNode.insertBefore(wrapper, brandNode);
    wrapper.appendChild(brandNode);
    wrapper.after(createTitleLogo(brand));
    return;
  }
}

function highlightBrandInTitles(brand) {
  document.querySelectorAll('h1').forEach((title) => {
    // Le test de présence du logo rend le traitement idempotent : si le site
    // re-rend son titre, le logo disparaît et l'élément redevient éligible
    if (title.textContent && !title.querySelector('.bx-brand-logo-mini')) {
      highlightBrandInTitle(title, brand);
    }
  });
}

function detectPageBrand() {
  const product = odmReadPageProduct();
  const titles = Array.from(document.querySelectorAll('h1'))
    .map((title) => odmCollapseSpaces(odmTextOf(title)))
    .filter(Boolean);

  const units = [
    ...product.brands.map((text) => ({ text, kind: 'slot' })),
    ...product.names.map((text) => ({ text, kind: 'name' })),
    ...titles.map((text) => ({ text, kind: 'name' }))
  ];
  const context = [...product.names, ...titles, document.title].join(' ');

  return odmPdpState.matcher.detect(units, context);
}

function analyseProductPage() {
  const detection = detectPageBrand();
  if (!detection) {
    odmPdpPanel.hide();
    return;
  }

  odmPdpPanel.show(detection);
  odmPdpState.onDetect(detection);
  highlightBrandInTitles(detection.brand);
}

function stopProductPageDetection() {
  if (odmPdpState.observer) {
    odmPdpState.observer.disconnect();
    odmPdpState.observer = null;
  }
  clearTimeout(odmPdpState.debounceTimer);
  odmPdpPanel.hide();
}

function detectProductPage(matcher, onDetect) {
  stopProductPageDetection();
  odmPdpState.matcher = matcher;
  odmPdpState.onDetect = onDetect;

  analyseProductPage();

  // Ré-analyser (avec debounce) quand le site re-rend son contenu
  odmPdpState.observer = new MutationObserver(() => {
    clearTimeout(odmPdpState.debounceTimer);
    odmPdpState.debounceTimer = setTimeout(analyseProductPage, 300);
  });
  odmPdpState.observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

window.addEventListener('pagehide', stopProductPageDetection);
