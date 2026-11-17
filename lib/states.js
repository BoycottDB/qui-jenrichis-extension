function getDomain(hostname) {
  return hostname.replace(/^www\./, '')
}

/* ############################################
   #                                          #
   #        CODE POUR VERIF ECOMMERCE         #
   #                                          #
   ############################################ */

// Une page marchande montre des prix ou se déclare elle-même comme produit.
// Ce filtre est volontairement large : il évite seulement de travailler sur
// les pages sans rapport avec un achat. Ce sont les moteurs qui sont stricts
// (une carte produit exige un lien et un prix, une fiche produit ses propres
// signaux). Il ne repose sur aucun nom de classe : beaucoup de sites les
// rendent illisibles (Zalando).
const ODM_MIN_PRICES = 3;

function isECommerceSite() {
  return hasDeclaredProduct() || hasMultiplePrices();
}

// La page se déclare elle-même comme produit (données structurées ou Open Graph)
function hasDeclaredProduct() {
  return odmReadPageProduct().hasProduct || isProductDetailPageByMeta();
}

function hasMultiplePrices() {
  const pricePattern = /[€$£¥]\s*\d|\d\s*[€$£¥]|\d\s*(?:EUR|USD|GBP)\b/g;
  const bodyText = document.body ? document.body.textContent : '';

  let count = 0;
  while (count < ODM_MIN_PRICES && pricePattern.exec(bodyText)) {
    count++;
  }
  return count >= ODM_MIN_PRICES;
}

// Fonction pour vérifier si le site est désactivé par l'utilisateur
function isSiteDisabled(disabledSites) {
  const currentDomain = getDomain(window.location.hostname)
  return disabledSites.includes(currentDomain)
}

// Fonction pour détecter si c'est une PDP basée sur l'URL
function isProductDetailPageByURL() {
  const urlPath = window.location.pathname.toLowerCase()
  const pdpPatterns = [
    '/product/',
    '/products/',
    '/produit/',
    '/p/',
    '/dp/',
    '/item/',
    '/detail/',
  ]

  return pdpPatterns.some((pattern) => urlPath.includes(pattern))
}

// Fonction pour détecter si c'est une PDP basée sur le DOM
function isProductDetailPageByDOM() {
  const addToCartButtonTexts = [
    'Ajouter au panier',
    'Acheter maintenant',
    'Add to Cart',
    'Buy Now',
    'Acheter',
    'Ajouter',
    'Add to Basket',
    'Ajouter au sac',
    'Ajouter au chariot',
    'Commander',
    'Purchase',
    'In den Warenkorb', // Allemand
    'Jetzt kaufen',
    'Agregar al carrito', // Espagnol
    'Comprar ahora',
    'Aggiungi al carrello', // Italien
    'Acquista ora',
    'Adicionar ao carrinho', // Portugais
    'Compre agora',
  ]

  // Rechercher les boutons sur la page
  const buttons = Array.from(
    document.querySelectorAll(
      'button, input[type="button"], input[type="submit"], a'
    )
  )
  const hasAddToCartButton = buttons.some((button) => {
    const buttonText = button.innerText || button.value || ''
    return addToCartButtonTexts.some((text) =>
      buttonText.trim().toLowerCase().includes(text.toLowerCase())
    )
  })

  // Détection basée sur la présence d'un prix
  const priceRegex =
    /(\d{1,3}(?:[\s.,]\d{3})*|\d+)([\s.,]\d{2})?\s?(€|EUR|£|GBP|\$|USD|¥|JPY|CHF|CAD|AUD)/i
  function hasPriceInText() {
    const elements = Array.from(document.querySelectorAll('span, p, li'))

    return elements.some((element) => {
      const textContent = element.textContent.trim()
      const normalizedText = textContent.replace(/\s+/g, ' ')
      return priceRegex.test(normalizedText)
    })
  }
  const hasPrice = hasPriceInText()

  // Liste des phrases à détecter
  const phrases = [
    'Détails du produit', // Français
    'Description du produit',
    'Informations sur le produit',
    'Caractéristiques',
    'Product Details', // Anglais
    'Product Description',
    'Product Information',
    'Features',
    'Detalles del producto', // Espagnol
    'Descripción del producto',
    'Información del producto',
    'Características',
    'Dettagli del prodotto', // Italien
    'Descrizione del prodotto',
    'Informazioni sul prodotto',
    'Caratteristiche',
    'Produktdetails', // Allemand
    'Produktbeschreibung',
    'Produktinformationen',
    'Merkmale',
    'Detalhes do produto', // Portugais
    'Descrição do produto',
    'Informações do produto',
    'Características',
  ]

  const regexPatterns = phrases.map(
    (phrase) => new RegExp(escapeRegExp(phrase), 'i')
  )

  // Vérifier la présence des descriptions produit dans les sections
  function hasProductDescriptionText() {
    const headingSelectors = 'h1, h2, h3, h4, h5, h6, article, span'
    const elements = Array.from(document.querySelectorAll(headingSelectors))

    return elements.some((element) => {
      const textContent = (element.textContent || '').trim()
      return regexPatterns.some((pattern) => pattern.test(textContent))
    })
  }

  const hasDescriptionText = hasProductDescriptionText()

  // Vérifier les avis clients
  const reviewSelectors = [
    '.product-reviews',
    '#reviews',
    '.reviews',
    '.customer-reviews',
    '[itemprop="review"]',
  ]
  const hasReviews = reviewSelectors.some(
    (selector) => document.querySelector(selector) !== null
  )

  const conditions = [
    { name: 'hasAddToCartButton', value: hasAddToCartButton },
    { name: 'hasPrice', value: hasPrice },
    { name: 'hasDescriptionText', value: hasDescriptionText },
    { name: 'hasReviews', value: hasReviews },
  ]

  const conditionsMet = conditions.filter((condition) => condition.value).length
  odmLog('isProductDetailPageByDOM :', conditions, `${conditionsMet} conditions remplies`)

  return conditionsMet >= 3
}

// Fonction pour vérifier la présence de métadonnées spécifiques
function isProductDetailPageByMeta() {
  const metaOgType = document.querySelector(
    'meta[property="og:type"][content="product"]'
  )
  const metaTwitterLabel = document.querySelector(
    'meta[name="twitter:label1"][content="Price"]'
  )
  return metaOgType !== null || metaTwitterLabel !== null
}

// Le titre de la page et un prix dans le même petit bloc : la page présente
// un seul produit, même si elle ne le déclare pas et n'a pas de bouton d'achat
// (page d'un bon plan sur Dealabs). Sur une liste de produits, le premier prix
// est dans la grille, loin du titre.
const ODM_TITLE_BLOCK_MAX_LEVELS = 3;
const ODM_TITLE_BLOCK_MAX_LENGTH = 600;

function isProductDetailPageByTitlePrice() {
  const titles = document.querySelectorAll('h1');
  if (titles.length !== 1) {
    return false;
  }

  let block = titles[0].parentElement;
  for (let level = 0; level < ODM_TITLE_BLOCK_MAX_LEVELS && block && block !== document.body; level++) {
    const text = block.textContent.replace(/\s+/g, ' ');
    if (text.length > ODM_TITLE_BLOCK_MAX_LENGTH) {
      return false;
    }
    if (ODM_PRICE_PATTERN.test(text)) {
      return true;
    }
    block = block.parentElement;
  }
  return false;
}

// Fonction principale pour déterminer si c'est une PDP
function isProductDetailPage() {
  return (
    odmReadPageProduct().hasProduct ||
    isProductDetailPageByMeta() ||
    isProductDetailPageByURL() ||
    isProductDetailPageByTitlePrice() ||
    isProductDetailPageByDOM()
  )
}
