/* ############################################
   #                                          #
   #   RECONNAISSANCE DES NOMS DE MARQUE      #
   #                                          #
   ############################################ */

// Retrouve dans les textes d'un produit un nom de la base : le nom d'une
// marque, une variante de ce nom (« McDo ») ou un produit vendu sous la marque
// (« Knacki » pour Herta).
//
// Un texte à examiner est une « unité » { text, kind } :
// - slot  : le site donne ce texte comme marque du produit (donnée structurée,
//           attribut ou élément « brand ») ;
// - name  : nom du produit (titre, lien, texte alternatif de l'image) ;
// - label : court texte isolé de la carte produit.
//
// Règles, pensées pour ne jamais rattacher un produit à une marque par erreur :
// - un nom n'est reconnu qu'en mot entier, pas dans un mot composé
//   (« Evian » n'est pas reconnu dans « Evian-les-Bains ») ;
// - dans un nom de produit, il doit porter sa majuscule (« Daim », pas « daim »),
//   sauf en tout début de texte (« adidas Stan Smith ») ;
// - dans un texte isolé, il doit être au début (« Nike Sportswear ») ;
// - un nom ambigu (mot, prénom ou lieu courant, déclaré dans la base :
//   noms_ambigus de sa marque) ou précisé par une parenthèse dans la base
//   (« Persil (lessive) ») n'est reconnu que s'il est, à lui seul, la marque
//   donnée par le site ; la précision (« lessive ») doit en plus figurer dans
//   les textes du produit ;
// - quand le site donne une marque qui n'est pas dans la base, le produit
//   n'est rattaché à aucune marque (« Coque pour iPhone » d'un autre fabricant).

const ODM_DIACRITIQUES = /[̀-ͯ]/g;
const ODM_APOSTROPHES = '’‘ʼ';
const ODM_TIRETS = '‐‑–';
const ODM_LONGUEUR_MIN_NOM = 2;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Même normalisation que la recherche du site (sans accents, apostrophes
// droites), faite caractère par caractère pour garder la longueur du texte :
// une position trouvée dans le texte normalisé vaut pour le texte d'origine.
// La casse est gardée, elle sert de critère.
function odmNormaliserTexte(texte) {
  let resultat = '';
  for (const caractere of texte) {
    if (caractere < '\u0080') {
      resultat += caractere === '\n' || caractere === '\t' || caractere === '\r' ? ' ' : caractere;
    } else if (ODM_APOSTROPHES.includes(caractere)) {
      resultat += "'";
    } else if (ODM_TIRETS.includes(caractere)) {
      resultat += '-';
    } else if (/\s/.test(caractere)) {
      resultat += ' ';
    } else {
      const base = caractere.normalize('NFD').replace(ODM_DIACRITIQUES, '');
      resultat += base.length === caractere.length ? base : caractere;
    }
  }
  return resultat;
}

// Clé de comparaison de deux noms : casse, accents, espaces et traits d'union ignorés
function odmCleDeNom(texte) {
  return odmNormaliserTexte(texte).toLowerCase().replace(/[ -]+/g, ' ').trim();
}

// « Ajax (ménage) » → nom « Ajax », précision « ménage »
function odmSeparerPrecision(nomComplet) {
  const parties = nomComplet.match(/^([^(]+)\((.+)\)\s*$/);
  return parties
    ? { nom: parties[1].trim(), precision: parties[2].trim() }
    : { nom: nomComplet.trim(), precision: null };
}

// Nom tel qu'on le cherche dans un texte : sans sa ponctuation finale
// (« Tiffany & Co. », « Oh My Cream ! »), rarement reprise par les sites
function odmNomCherche(nom) {
  return nom.replace(/[ .!?]+$/, '');
}

function odmEstMajuscule(caractere) {
  return caractere !== caractere.toLowerCase();
}

// Un nom de la base qui commence par une majuscule doit la porter dans le
// texte ; un sigle court (« LU », « TF1 ») doit être écrit à l'identique
function odmCasseAcceptee(nom, trouve, enDebutDeTexte) {
  if (!odmEstMajuscule(nom[0])) {
    return true;
  }

  const lettres = nom.replace(/[^\p{L}]/gu, '');
  const estSigleCourt = lettres.length <= 4 && lettres === lettres.toUpperCase();
  if (estSigleCourt) {
    return odmNormaliserTexte(trouve) === odmNormaliserTexte(nom);
  }

  return odmEstMajuscule(trouve[0]) || enDebutDeTexte;
}

function createBrandMatcher(brands) {
  const marques = brands || [];
  // « Bottines en Daim », « Total : 25 € », « Poupée Ariel » : dans un titre,
  // rien ne dit qu'il s'agit de la marque
  const nomsAmbigus = new Set(marques.flatMap((brand) => brand.noms_ambigus || []).map(odmCleDeNom));
  const entreesParCle = new Map();

  function ajouterNom(brand, nom, type, precision) {
    const nomCherche = odmNomCherche(nom);
    const cle = odmCleDeNom(nomCherche);
    // Le premier nom enregistré l'emporte : les noms de marque passent avant
    // les variantes et les produits des autres marques
    if (cle.length < ODM_LONGUEUR_MIN_NOM || entreesParCle.has(cle)) {
      return;
    }
    entreesParCle.set(cle, {
      brand,
      nom: nomCherche,
      type,
      precision: precision ? odmCleDeNom(precision) : null,
      strict: Boolean(precision) || nomsAmbigus.has(cle)
    });
  }

  marques.forEach((brand) => {
    const { nom, precision } = odmSeparerPrecision(getBrandName(brand));
    ajouterNom(brand, nom, 'marque', precision);
  });
  marques.forEach((brand) => {
    (brand.variantes || []).forEach((nom) => ajouterNom(brand, nom, 'variante', null));
  });
  marques.forEach((brand) => {
    (brand.autres_noms || []).forEach((nom) => ajouterNom(brand, nom, 'produit', null));
  });

  // Une seule expression pour tous les noms, du plus long au plus court :
  // « Kinder Bueno » est reconnu avant « Kinder ». Espaces et traits d'union
  // sont interchangeables (« Coca Cola » pour « Coca-Cola »).
  const motifs = Array.from(entreesParCle.values())
    .map((entree) => odmNormaliserTexte(entree.nom))
    .sort((a, b) => b.length - a.length)
    .map((nom) => nom.split(/[ -]+/).map(escapeRegExp).join('[ -]+'));

  const expression = motifs.length > 0
    ? new RegExp(
        '(?<![\\p{L}\\p{N}])(?<![\\p{L}\\p{N}]-)' +
        `(?:${motifs.join('|')})` +
        '(?![\\p{L}\\p{N}])(?!-[\\p{L}\\p{N}])',
        'giu'
      )
    : null;

  // Tous les noms de la base présents dans un texte, dans l'ordre du texte
  function chercherNoms(texte) {
    if (!expression || !texte) {
      return [];
    }

    const trouves = [];
    const texteNormalise = odmNormaliserTexte(texte);
    expression.lastIndex = 0;

    let resultat;
    while ((resultat = expression.exec(texteNormalise))) {
      const entree = entreesParCle.get(odmCleDeNom(resultat[0]));
      if (entree) {
        trouves.push({
          entree,
          index: resultat.index,
          length: resultat[0].length,
          trouve: texte.slice(resultat.index, resultat.index + resultat[0].length)
        });
      }
    }
    return trouves;
  }

  function estAccepte(nomTrouve, unite, texte, contexteNormalise) {
    const { entree, index, length, trouve } = nomTrouve;

    if (entree.strict) {
      const estLaMarqueDonnee = unite.kind === 'slot' && index === 0 && length === texte.length;
      if (!estLaMarqueDonnee) {
        return false;
      }
      return !entree.precision || contexteNormalise().includes(entree.precision);
    }

    if (unite.kind === 'slot') {
      return true;
    }
    if (unite.kind === 'label' && index !== 0) {
      return false;
    }
    return odmCasseAcceptee(entree.nom, trouve, index === 0);
  }

  function detectInUnits(unites, contexteNormalise) {
    for (const unite of unites) {
      const texte = unite.text;
      for (const nomTrouve of chercherNoms(texte)) {
        if (estAccepte(nomTrouve, unite, texte, contexteNormalise)) {
          const { entree } = nomTrouve;
          return { brand: entree.brand, nomDetecte: entree.nom, type: entree.type };
        }
      }
    }
    return null;
  }

  // Marque d'un produit, cherchée dans ses unités : d'abord la marque donnée
  // par le site, qui fait foi ; à défaut le nom du produit, puis les textes isolés.
  // `contexte` : tous les textes du produit, où chercher la précision d'un nom
  function detect(unites, contexte) {
    let contexteCalcule = null;
    const contexteNormalise = () => {
      if (contexteCalcule === null) {
        contexteCalcule = odmCleDeNom(contexte || '');
      }
      return contexteCalcule;
    };

    const unitesUtiles = unites
      .map((unite) => ({ kind: unite.kind, text: (unite.text || '').trim() }))
      .filter((unite) => unite.text.length >= ODM_LONGUEUR_MIN_NOM);
    const deType = (kind) => unitesUtiles.filter((unite) => unite.kind === kind);

    const marquesDonnees = deType('slot');
    if (marquesDonnees.length > 0) {
      return detectInUnits(marquesDonnees, contexteNormalise);
    }
    return detectInUnits(deType('name'), contexteNormalise) || detectInUnits(deType('label'), contexteNormalise);
  }

  // Position d'un nom d'une marque déjà reconnue dans un texte (pour le
  // mettre en avant dans le titre d'une fiche produit)
  function locateBrandName(texte, brand) {
    const nomTrouve = chercherNoms(texte).find(({ entree }) => entree.brand === brand);
    return nomTrouve ? { index: nomTrouve.index, length: nomTrouve.length } : null;
  }

  return { detect, locateBrandName, size: entreesParCle.size };
}
