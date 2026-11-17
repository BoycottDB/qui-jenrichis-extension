# Extension Qui j'enrichis ? - Documentation technique

## Vue d'ensemble

Extension navigateur de **Qui j'enrichis ?** (`odm-extension`). Pendant les achats en ligne, elle repère les produits des marques de la base et montre ce que le site affiche sur la carte de la marque : qui est derrière elle, les étiquettes de controverses et le lien vers sa page.

Elle n'envoie aucune donnée de navigation : la base est téléchargée, la reconnaissance se fait dans le navigateur.

## Architecture technique

### Structure de l'extension

```
odm-extension/
├── manifest.json              # Configuration Manifest V3
├── background.js              # Service worker : sync API + cache des détections
├── content.js                 # Point d'entrée : orchestration de la détection
├── popup.html/popup.js        # Interface utilisateur
├── css/
│   ├── popup.css             # Styles de la popup
│   └── content.css           # Styles injectés dans les pages
├── fonts/                     # Geist et Rubik du site (sous-ensemble latin, licence OFL)
├── images/                    # Logo et icônes du site (copiés de odm-web/public)
├── dev/                       # Environnement de test (exclu du packaging)
└── lib/
    ├── debug.js              # Logs de dev (flag ODM_DEBUG)
    ├── brandData.js          # Lecture des données + helpers d'affichage d'une marque
    ├── brandMatcher.js       # Reconnaissance des noms de marque dans un texte
    ├── productPage.js        # Produit déclaré par la page (JSON-LD, microdonnées, meta)
    ├── states.js             # Site marchand ? fiche produit ?
    ├── productCard.js        # Carte produit d'une image et textes où chercher la marque
    ├── brandCard.js          # Carte d'une marque affichée dans les pages
    ├── plp.js                # Moteur des listes de produits
    ├── badgeLayer.js         # Couche de badges (Shadow DOM, hors DOM du site)
    ├── pdp.js                # Moteur des fiches produit
    ├── pdpPanel.js           # Panneau des fiches produit (Shadow DOM, hors DOM du site)
    └── animations.js         # Animations (scan, progression, radar)
```

### Technologies

- **Manifest V3**, compatible Chrome et Firefox
- **JavaScript sans dépendance** ni étape de build
- **Storage** : `local` (données marques), `sync` (préférences), `session` (détections par onglet)
- **Alarms** : planification des mises à jour de données
- **API** : `odm-api` (Netlify Functions)

## Flux de données

```
odm-api : marques-stats + marques-noms (cache CDN)
        │  fetch périodique (chrome.alarms, toutes les 6 h)
        ▼
background.js (service worker)
        │  chrome.storage.local (odm_marques)
        ▼
content scripts (lecture seule via loadBrands())
        ▼
détection → background.js → chrome.storage.session (état de l'onglet) → popup
```

Principes :
- **Le service worker est le seul à appeler l'API.** Il fusionne deux points d'accès que le site utilise déjà : `marques-stats` (ce que montre la carte d'une marque sur `/marques`) et `marques-noms` (les noms qui la désignent). L'extension affiche donc la même chose que le site, sans rien recalculer.
- **Aucune donnée embarquée** : avant la première synchronisation, l'extension ne signale rien. Une controverse corrigée ou masquée sur le site disparaît de l'extension à la synchronisation suivante.
- **Données de plus de 3 jours ignorées** (`ODM_BRANDS_MAX_AGE_MS`, le plus court des délais que le site doit tenir) : si la synchronisation échoue durablement, l'extension se tait plutôt que d'afficher des informations qui ont pu être corrigées entre-temps. Chaque page visitée relance une tentative de synchronisation.
- **Les content scripts ne lisent les données que sur un site marchand**, une fois celui-ci reconnu.
- **L'état de chaque onglet** (domaine de la page et marques repérées, clé `odm_tab_<id>`) vit dans `chrome.storage.session` : il survit à la mise en sommeil du service worker mais pas au redémarrage du navigateur. La page l'envoie au service worker, qui l'écrit ; la popup le lit directement, sans attendre le réveil du service worker.

## Modèle de données

Une marque telle que `background.js` la stocke (`toStoredBrand`) :

```typescript
interface MarqueStockee {
    id: number;
    nom: string;                 // « Herta », « Persil (lessive) »
    autres_noms: string[];       // produits vendus sous la marque : « Knacki »
    variantes: string[];         // autres façons d'écrire la marque : « McDo »
    noms_ambigus: string[];      // ceux de ces noms qui sont aussi un mot courant : « Mac »
    etiquettes: Array<{ nom: string; emoji?: string; nombre: number }>;
    origineEtiquettes: 'marque' | 'beneficiaires' | 'marque_ou_beneficiaires' | null;
    beneficiaires: Array<{ id: number; nom: string }>;  // bénéficiaires controversés, 5 au plus
    nbBeneficiaires: number;     // leur nombre total
}
```

Une détection, transmise à la popup et au panneau :

```typescript
interface Detection {
    brand: MarqueStockee;
    nomDetecte: string;                        // nom de la base reconnu sur la page
    type: 'marque' | 'variante' | 'produit';
}
```

## Ce que l'extension affiche

Dans les pages comme dans la popup, elle montre la même carte de marque (`lib/brandCard.js` pour les pages). Elle reprend les formulations du site et ne qualifie jamais une marque elle-même :
- **« Derrière cette marque : »** suivi des bénéficiaires controversés ;
- **les étiquettes**, précédées du libellé qui dit d'où elles viennent (`ODM_LIBELLES_ETIQUETTES` dans `brandData.js`) : « Controverses de la marque : », « Controverses de ses bénéficiaires : » ou « Controverses de la marque ou de ses bénéficiaires : ». Les controverses des bénéficiaires ne sont ainsi jamais attribuées à la marque ;
- **le lien vers la page de la marque** sur le site (`getDetectionPageUrl`). Un produit a sa propre adresse (`/marques/knacki`), qui montre la page de sa marque vue depuis ce produit.

## Reconnaissance des noms (`lib/brandMatcher.js`)

`createBrandMatcher(brands)` prépare une seule expression pour tous les noms de la base (noms de marque, variantes, produits), du plus long au plus court. Accents, apostrophes typographiques, espaces et traits d'union sont ignorés, comme dans la recherche du site.

Les textes d'un produit lui sont donnés en « unités » `{ text, kind }` :

| `kind` | Texte | Règle |
|---|---|---|
| `slot` | Marque que le site donne lui-même au produit (donnée structurée, attribut ou élément « brand ») | Fait foi. Si elle n'est pas dans la base, le produit n'est rattaché à aucune marque (« Coque pour iPhone » d'un autre fabricant) |
| `name` | Nom du produit (titre, lien, texte alternatif de l'image) | Le nom doit porter sa majuscule (« Daim », pas « daim »), sauf en tout début de texte (« adidas Stan Smith ») |
| `label` | Court texte isolé d'une carte | Le nom doit être au début (« Nike Sportswear ») |

Règles communes, pensées pour ne jamais rattacher un produit à une marque par erreur :
- un nom n'est reconnu qu'en **mot entier**, pas dans un mot composé (« Evian » dans « Evian-les-Bains ») ;
- un **sigle court** (« LU », « TF1 ») doit être écrit à l'identique ;
- un **nom ambigu** n'est reconnu que s'il est, à lui seul, la marque donnée par le site (`slot`). Sont ambigus les noms déclarés comme tels dans la base (`noms_ambigus` de la marque : mots, prénoms ou lieux courants comme « Daim », « Total », « Ariel », « Stock ») et ceux que la base précise par une parenthèse (« Persil (lessive) ») ; pour ces derniers, la précision (« lessive ») doit en plus figurer dans les textes du produit.

Les noms ambigus se saisissent dans l'admin du site, sur la fiche de la marque (zone « Noms ambigus »), et arrivent par `marques-noms`.

## Détection sur une page (`content.js`)

1. **Site désactivé** par l'utilisateur : rien ne tourne.
2. **Site marchand ?** `isECommerceSite()` : la page montre au moins 3 prix ou se déclare elle-même comme produit. Ce filtre est volontairement large, il évite seulement de travailler sur les pages sans rapport avec un achat : ce sont les moteurs qui sont stricts. Il ne repose sur aucun nom de classe, que beaucoup de sites rendent illisibles (Zalando). La vérification est retentée quelques fois quand la page change : un contenu rendu après coup ne se reconnaît pas au chargement.
3. **Listes de produits** : toujours surveillées (une fiche produit a aussi ses « produits similaires »).
4. **Fiche produit** : cherchée à chaque changement d'adresse, y compris sur les sites à navigation sans rechargement.

### Listes de produits (`lib/plp.js` + `lib/productCard.js`)

Pour chaque image d'au moins 100×100 px :
1. **Sa carte produit** (`odmFindProductCard`) : le plus petit bloc répété qui la contient avec un lien et un prix, cherché jusqu'à 15 niveaux au-dessus d'elle (une carte Zalando imbrique un carrousel : elle est 12 niveaux plus haut). « Répété » : un voisin de même balise contient lui aussi une image. Les vignettes de variantes remontent ainsi jusqu'à la carte de leur produit ; une image hors de toute carte (bannière, galerie) est ignorée.
2. **Les textes de la carte** (`odmCollectCardUnits`) : marque donnée par le site (`data-brand`, `itemprop="brand"`, classe de marque de produit comme `product-brand`), nom du produit (texte alternatif, liens, titres, classes « name » ou « title »), courts textes isolés. Les morceaux de texte sont séparés par une espace : `textContent` collerait la marque au nom du produit (« VansKNU SKOOL »).
3. **La marque** : `matcher.detect()`.

Une classe ne vaut « marque donnée par le site » que si ses autres mots parlent d'un produit (`odmHasBrandClass`). Seul, « brand » désigne souvent la couleur du site : sur Dealabs, `color--text-AccentBrand` habille le nom du marchand et `button--mode-brand` le bouton « Voir le deal ».

**Images à chargement différé** : les sites affichent d'abord un substitut de 1 px, remplacé par la photo au défilement (Courir). Chaque image est donc réexaminée quand sa source change, grâce à l'événement `load` écouté en phase de capture sur le document. Une image de survol du même produit ne refait rien.

Le marquage ne touche ni au DOM des cartes ni à la photo : le **badge** et son **liseré** sont dessinés par `badgeLayer.js`, **un seul par couple (carte, marque)**, sur la plus grande image de la carte.

Le contenu ajouté dynamiquement (scroll infini, filtres) est couvert par un `MutationObserver`.

**Indicateur « Analyse : N produits »** (en haut à droite) : il n'apparaît qu'au premier produit d'une marque de la base reconnu, puis compte les cartes produit analysées (pas les images). Une page qui passe le filtre « site marchand » sans produit de la base (un forum où l'on parle de prix, un menu de compte qui ressemble à une carte) ne l'affiche donc pas. Il se retire 2 s après la dernière carte de la première vague ; le scroll infini ne le fait pas revenir.

### Fiches produit (`lib/pdp.js` + `lib/productPage.js` + `lib/pdpPanel.js`)

`isProductDetailPage()` tient une page pour une fiche produit dès qu'un de ces signaux est présent :
- la page se déclare comme produit (`odmReadPageProduct` : un produit JSON-LD hors `ItemList`, microdonnées `schema.org/Product`) ou par `og:type` ;
- son adresse contient un segment de fiche (`/p/`, `/product/`, `/produit/`, `/dp/`…) ;
- son titre `h1` et un prix tiennent dans le même petit bloc (page d'un bon plan Dealabs, qui ne se déclare pas et n'a pas de bouton d'achat) ;
- son DOM réunit au moins 3 indices parmi bouton d'achat, prix, description et avis.

Le panneau n'apparaît que si, en plus, une marque de la base est reconnue.

La marque est cherchée dans la marque déclarée par la page (`slot`), puis dans le nom du produit et les titres `h1` (`name`). Une fois reconnue :

1. **Dans le titre** : le nom est souligné (`.bx-title-with-brand`) et suivi du logo du site ; le titre reste lisible tel que le site l'a écrit. Un clic sur le logo rouvre le panneau.
   - Insertion sûre : découpage des nœuds de texte (`splitText`), aucun `innerHTML` sur du contenu de page.
   - Idempotence : un titre qui porte déjà `.bx-brand-logo-mini` est ignoré ; si le site re-rend son titre, il est retraité (`MutationObserver` avec debounce de 300 ms).
2. **Panneau** : la carte de la marque, coiffée du logo, fixe en bas à droite dans son propre hôte Shadow DOM (`#odm-pdp-host`).
   - Repliée en pastille après 8 s (le survol annule le repli) ou par le bouton « – », ré-expansible au clic.
   - La fermeture (✕) est mémorisée par marque pour la session (`sessionStorage`) ; le logo du titre la lève.

### Couche de badges (`lib/badgeLayer.js`)

**Rien n'est inséré dans l'arbre DOM du site** (pas de wrapper, pas d'override `position`/`overflow`).

- **Hôte unique** : `#odm-badge-host` (0×0, `z-index` max) avec un Shadow DOM `open`, inspectable par l'environnement de test.
- **Badge** : le logo du site posé comme un autocollant, sans texte (réduit quand l'image fait moins de 200 px de large).
- **Liseré** : un cadre posé sur l'image, dans la couche et non sur l'image elle-même. Il reste visible quand le site masque l'image (photo de survol superposée) ou réécrit ses classes.
- **Partie visible** : badge et liseré suivent la partie de l'image réellement visible, rognée par les ancêtres qui masquent ce qui dépasse (carrousel).
- **Coin libre** : le badge prend le premier coin de l'image que le site n'occupe pas déjà (cœur des favoris, étiquette de promotion, note…), dans l'ordre haut droit, haut gauche, bas droit, bas gauche. L'occupation est sondée par `elementFromPoint` au centre et aux quatre coins de l'emplacement ; un élément du site qui couvre presque toute l'image (lien étiré) ne compte pas. Le choix est définitif une fois les quatre coins visibles à l'écran.
- **Carte au survol** : au survol, au focus ou au clic, le badge ouvre la carte de la marque, du même côté de l'image que lui. Le liseré du produit s'efface tant que sa carte est ouverte : leurs deux bords se croiseraient. Elle se referme en quittant le badge et la carte, au défilement ou au clic ailleurs.
- **Positionnement** : chaque badge est en `position: fixed`, calé sur le `getBoundingClientRect()` de son image ancre ; recalage en `requestAnimationFrame` sur `scroll` (capture), `resize`, `transitionend`/`animationend` et à chaque mutation vue par le moteur des listes.
- **Cycle de vie** : si l'ancre quitte le DOM, son badge est détruit au recalage suivant. Une ancre rendue trop petite (< 90 px) masque son badge.
- **Debug/test** : l'ancre porte `data-odm-badge-brand`, le badge `data-brand-name` ; l'événement DOM `odm:clear-badges` vide la couche.

## Popup (`popup.js`)

- **Marques repérées** dans l'onglet : même contenu que la carte de la marque sur le site ; un clic ouvre sa page. La liste se met à jour pendant que la page continue d'être analysée.
- **Domaine de l'onglet** : l'adresse d'un onglet n'est lisible (`activeTab`) que si la popup a été ouverte par un clic sur l'icône de l'extension ; à défaut, la popup prend le domaine transmis par la page.
- **Paramètres** : activation par site, liste des sites désactivés.
- Tout contenu dynamique est construit par `createElement` et `textContent`.

Sites désactivés par défaut (`background.js`) : `x.com`, `youtube.com`.

## Configuration

```json
{
    "permissions": ["activeTab", "storage", "alarms"],
    "host_permissions": ["https://odm-api.netlify.app/*"],
    "web_accessible_resources": ["images/logo.png"]
}
```

Le logo est la seule ressource lisible par les pages : il est affiché dans les badges, le panneau et le titre des fiches produit.

Les icônes et le logo sont des copies de `odm-web/public` (`icon-16`, `icon-32`, `icon-48`, `icon-128`, `logo.png`) : les recopier quand le logo du site change.

### Installation
1. **Mode développeur** : charger l'extension non empaquetée.
2. **Firefox** : `browser_specific_settings.gecko`, clé `background.scripts` en plus de `service_worker`. Chrome signale cette clé par un avertissement (« 'background.scripts' requires manifest version of 2 or lower ») sur `chrome://extensions` : il est sans effet et la clé reste, Firefox en a besoin.

## Tests et debugging

### Logs de développement

Passer `ODM_DEBUG` à `true` dans `lib/debug.js` pour activer les traces `odmLog()`.

### Environnement de test

Des DOM authentiques de sites marchands (Footlocker, Zalando, Sarenza, Leclerc) sont rejoués dans `dev/test-environment.html` :

```bash
python3 -m http.server 8000
open http://localhost:8000/dev/test-environment.html
```

Documentation : `dev/TEST-ENVIRONMENT.md`.

### Points de contrôle
1. **Données disponibles** : `chrome.storage.local` (`odm_marques`)
2. **Classification** : logs de `isECommerceSite()` et de la fiche produit
3. **Détection** : carte trouvée, unités collectées, marque reconnue
4. **Affichage** : position et contenu des badges, panneau, popup

## Points d'attention

- **Faux positifs** : rattacher un produit à une marque par erreur est le défaut le plus grave. Dans le doute, la détection s'abstient.
- **Homonymes** : deux marques de même nom (« Harrys » le pain de mie et « Harry's » les rasoirs) ne se distinguent que par une parenthèse dans la base.
- **Compatibilité** : les sites marchands changent leur DOM ; la détection ne repose sur aucun sélecteur propre à un site.
- **Sécurité** : aucun `innerHTML` sur du contenu de page ou de l'API.
