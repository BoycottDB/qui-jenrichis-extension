/* ############################################
   #                                          #
   #   DONNÉES STRUCTURÉES D'UNE FICHE PRODUIT #
   #                                          #
   ############################################ */

// Lit ce que la page déclare elle-même sur son produit (JSON-LD, microdonnées,
// balises meta) : c'est le signal le plus fiable d'une fiche produit et de sa
// marque.

const ODM_PRODUCT_TYPES = ['Product', 'ProductGroup'];

function odmIsProductNode(node) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((type) => ODM_PRODUCT_TYPES.includes(type));
}

// brand : texte, objet { name } ou liste de l'un ou de l'autre
function odmBrandNames(brand) {
  if (!brand) {
    return [];
  }
  if (Array.isArray(brand)) {
    return brand.flatMap(odmBrandNames);
  }
  const name = typeof brand === 'string' ? brand : brand.name;
  return typeof name === 'string' && name.trim() ? [name.trim()] : [];
}

// Produits déclarés en JSON-LD, hors listes de produits (ItemList) : une liste
// décrit une page de résultats, pas une fiche produit
function odmCollectJsonLdProducts(node, products) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => odmCollectJsonLdProducts(item, products));
    return;
  }
  if (node.itemListElement) {
    return;
  }
  if (odmIsProductNode(node)) {
    products.push({
      name: typeof node.name === 'string' ? node.name.trim() : '',
      brands: [...odmBrandNames(node.brand), ...odmBrandNames(node.manufacturer)]
    });
    return;
  }
  odmCollectJsonLdProducts(node['@graph'], products);
  odmCollectJsonLdProducts(node.mainEntity, products);
}

function odmReadJsonLdProducts() {
  const products = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      odmCollectJsonLdProducts(JSON.parse(script.textContent), products);
    } catch (_) {
      // JSON-LD invalide : ignoré
    }
  });
  return products;
}

function odmMicrodataValue(element) {
  return (element.getAttribute('content') || element.textContent || '').trim();
}

// Produit de la page en microdonnées (schema.org/Product) et balises meta.
// Plusieurs produits en microdonnées décrivent une liste : ils sont ignorés.
function odmReadMarkupProduct() {
  const brands = [];
  const names = [];

  const scopes = document.querySelectorAll('[itemtype*="schema.org/Product" i]');
  const scope = scopes.length === 1 ? scopes[0] : null;
  if (scope) {
    scope.querySelectorAll('[itemprop="brand"]').forEach((element) => {
      brands.push(odmMicrodataValue(element.querySelector('[itemprop="name"]') || element));
    });
    const name = Array.from(scope.querySelectorAll('[itemprop="name"]'))
      .find((element) => !element.closest('[itemprop="brand"]'));
    if (name) {
      names.push(odmMicrodataValue(name));
    }
  }

  document.querySelectorAll('meta[property="product:brand"], meta[property="og:brand"]').forEach((meta) => {
    brands.push((meta.getAttribute('content') || '').trim());
  });

  return { hasProduct: scope !== null, brands: brands.filter(Boolean), names: names.filter(Boolean) };
}

// Le produit que la page déclare. Plusieurs produits JSON-LD de marques
// différentes décrivent une liste : la page n'est alors pas tenue pour une
// fiche produit.
function odmReadPageProduct() {
  const jsonLdProducts = odmReadJsonLdProducts();
  const jsonLdBrands = new Set(jsonLdProducts.flatMap((product) => product.brands));
  const isSingleJsonLdProduct =
    jsonLdProducts.length === 1 || (jsonLdProducts.length > 1 && jsonLdBrands.size === 1);

  const markup = odmReadMarkupProduct();

  const brands = [...markup.brands];
  const names = [...markup.names];
  if (isSingleJsonLdProduct) {
    brands.push(...jsonLdBrands);
    names.push(...jsonLdProducts.map((product) => product.name).filter(Boolean));
  }

  return {
    hasProduct: isSingleJsonLdProduct || markup.hasProduct,
    brands: Array.from(new Set(brands)),
    names: Array.from(new Set(names))
  };
}
