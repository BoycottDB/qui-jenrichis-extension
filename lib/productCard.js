/* ############################################
   #                                          #
   #   CARTE PRODUIT D'UNE LISTE DE PRODUITS  #
   #                                          #
   ############################################ */

// Retrouve la carte produit qui contient une image et en extrait les textes
// où chercher la marque (unités de lib/brandMatcher.js).

// Une carte peut imbriquer un carrousel d'images : sur Zalando, elle est
// 12 niveaux au-dessus de son image
const ODM_CARD_MAX_LEVELS = 15;
const ODM_PRICE_PATTERN = /\d[\d\s.,]*(?:€|EUR|\$|£|CHF)|(?:€|\$|£)\s*\d/i;
const ODM_NAME_MAX_LENGTH = 300;
const ODM_LABEL_MAX_LENGTH = 60;

const ODM_BRAND_ATTRIBUTES = [
  'data-brand',
  'data-product-brand',
  'data-brand-name',
  'data-marque',
  'data-manufacturer'
];
const ODM_BRAND_ATTRIBUTES_SELECTOR = ODM_BRAND_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(', ');
const ODM_BRAND_CLASS_WORDS = ['brand', 'brandname', 'marque', 'manufacturer'];
// Mots qui peuvent accompagner « brand » dans la classe d'un élément qui porte
// la marque d'un produit (« product-brand », « ProductCard__brandName »).
// Avec d'autres mots, « brand » désigne en général la couleur du site
// (« color--text-AccentBrand », « button--mode-brand » sur Dealabs).
const ODM_PRODUCT_CLASS_WORDS = [
  'product', 'produit', 'item', 'card', 'tile', 'name', 'nom', 'title', 'label',
  'info', 'infos', 'details', 'plp', 'pdp', 'list', 'listing', 'grid', 'cell', 'article'
];
const ODM_NAME_CLASS_WORDS = ['name', 'title', 'titre', 'nom', 'libelle', 'designation', 'productname', 'producttitle'];

// Une liste de produits répète le même bloc : la carte a au moins un voisin
// de même balise qui contient lui aussi une image
function odmHasSimilarSibling(element) {
  const parent = element.parentElement;
  if (!parent) {
    return false;
  }
  for (const sibling of parent.children) {
    if (sibling !== element && sibling.tagName === element.tagName && sibling.querySelector('img')) {
      return true;
    }
  }
  return false;
}

// Un bloc plus haut que deux écrans regroupe plusieurs produits
function odmIsCardSized(element) {
  return element.getBoundingClientRect().height <= window.innerHeight * 2;
}

// Carte produit d'une image : le plus petit bloc répété qui la contient avec
// un lien et un prix. Les vignettes de variantes (boutons sans lien ni prix)
// remontent ainsi jusqu'à la carte de leur produit ; une image hors de toute
// carte (bannière, galerie d'une fiche produit) n'en a pas.
function odmFindProductCard(img) {
  let element = img.parentElement;

  for (let level = 0; level < ODM_CARD_MAX_LEVELS && element && element !== document.body; level++) {
    const isCard =
      odmHasSimilarSibling(element) &&
      (element.matches('a') || element.querySelector('a') !== null) &&
      ODM_PRICE_PATTERN.test(element.textContent);

    if (isCard) {
      return odmIsCardSized(element) ? element : null;
    }
    element = element.parentElement;
  }

  return null;
}

function odmCollapseSpaces(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// Texte d'un élément, ses morceaux séparés par une espace : textContent colle
// la marque au nom du produit quand le site les met dans deux balises
// voisines (« VansKNU SKOOL »)
function odmTextOf(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts = [];
  let textNode;
  while ((textNode = walker.nextNode())) {
    parts.push(textNode.textContent);
  }
  return parts.join(' ');
}

// Mots d'une classe : « product__brand-name » et « productBrandName »
// donnent tous deux product, brand, name
function odmWordsOfClass(className) {
  return className
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function odmClassNames(element) {
  return (element.getAttribute('class') || '').split(/\s+/).filter(Boolean);
}

function odmHasClassWord(element, words) {
  return odmClassNames(element).some((className) =>
    odmWordsOfClass(className).some((word) => words.includes(word))
  );
}

// L'élément porte-t-il une classe qui désigne la marque d'un produit ?
function odmHasBrandClass(element) {
  return odmClassNames(element).some((className) => {
    const words = odmWordsOfClass(className);
    return (
      words.some((word) => ODM_BRAND_CLASS_WORDS.includes(word)) &&
      words.every((word) =>
        ODM_BRAND_CLASS_WORDS.includes(word) || ODM_PRODUCT_CLASS_WORDS.includes(word) || word.length <= 2
      )
    );
  });
}

function odmClassSelector(words) {
  return words.map((word) => `[class*="${word}" i]`).join(', ');
}

// Textes d'une carte produit où chercher la marque, et l'ensemble de ses
// textes (contexte où chercher la précision d'un nom ambigu)
function odmCollectCardUnits(card, img) {
  const units = [];
  const seen = new Set();

  function addUnit(text, kind, maxLength) {
    const value = odmCollapseSpaces(text);
    const key = `${kind}:${value}`;
    if (value.length < 2 || value.length > maxLength || seen.has(key)) {
      return;
    }
    seen.add(key);
    units.push({ text: value, kind });
  }

  // 1. La marque donnée par le site
  [card, ...card.querySelectorAll(ODM_BRAND_ATTRIBUTES_SELECTOR)].forEach((element) => {
    ODM_BRAND_ATTRIBUTES.forEach((attribute) => {
      addUnit(element.getAttribute(attribute), 'slot', ODM_LABEL_MAX_LENGTH);
    });
  });
  card.querySelectorAll('[itemprop="brand"]').forEach((element) => {
    addUnit(element.getAttribute('content') || odmTextOf(element), 'slot', ODM_LABEL_MAX_LENGTH);
  });
  card.querySelectorAll(odmClassSelector(ODM_BRAND_CLASS_WORDS)).forEach((element) => {
    if (odmHasBrandClass(element)) {
      addUnit(odmTextOf(element), 'slot', ODM_LABEL_MAX_LENGTH);
    }
  });

  // 2. Le nom du produit : image, liens, titres, éléments « name »
  addUnit(img.getAttribute('alt'), 'name', ODM_NAME_MAX_LENGTH);
  addUnit(img.getAttribute('title'), 'name', ODM_NAME_MAX_LENGTH);

  const links = card.matches('a') ? [card] : Array.from(card.querySelectorAll('a'));
  links.forEach((link) => {
    addUnit(link.getAttribute('aria-label'), 'name', ODM_NAME_MAX_LENGTH);
    addUnit(link.getAttribute('title'), 'name', ODM_NAME_MAX_LENGTH);
    addUnit(odmTextOf(link), 'name', ODM_NAME_MAX_LENGTH);
  });
  card.querySelectorAll('h1, h2, h3, h4, h5, h6, [itemprop="name"]').forEach((element) => {
    addUnit(element.getAttribute('content') || odmTextOf(element), 'name', ODM_NAME_MAX_LENGTH);
  });
  card.querySelectorAll(odmClassSelector(ODM_NAME_CLASS_WORDS)).forEach((element) => {
    if (odmHasClassWord(element, ODM_NAME_CLASS_WORDS)) {
      addUnit(odmTextOf(element), 'name', ODM_NAME_MAX_LENGTH);
    }
  });

  // 3. Les courts textes isolés (souvent la marque seule, sur sa propre ligne)
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    const parentTag = textNode.parentElement ? textNode.parentElement.tagName : '';
    if (parentTag !== 'SCRIPT' && parentTag !== 'STYLE' && parentTag !== 'NOSCRIPT') {
      addUnit(textNode.textContent, 'label', ODM_LABEL_MAX_LENGTH);
    }
  }

  return { units, context: odmTextOf(card) };
}
