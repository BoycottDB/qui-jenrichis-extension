# ODM Extension - Environnement de Test PLP

## Vue d'Ensemble

L'environnement de test PLP permet de tester l'algorithme de détection d'overlays de l'extension ODM sur des DOM authentiques de sites e-commerce. Il reproduit fidèlement les conditions réelles qui causent des bugs de doublons d'overlays.

## Architecture de Test

### Structure des Fichiers

```
odm-extension/
└── dev/                          # Dossier de développement (exclu du packaging)
    ├── test-environment.html     # Interface principale de test
    ├── TEST-ENVIRONMENT.md       # Cette documentation
    ├── README.md                 # Instructions de packaging
    └── test-data/                # Données de test modulaires
        ├── footlocker-dom.html   # DOM authentique Footlocker
        ├── footlocker-styles.css # Styles CSS Footlocker
        └── [site]-dom.html      # Futurs exemples d'autres sites
```

### Serveur Local Requis

L'environnement nécessite un serveur HTTP local pour éviter les erreurs CORS :

```bash
cd odm-extension
python3 -m http.server 8000
# Ouvrir: http://localhost:8000/dev/test-environment.html
```

## Fonctionnalités de Test

### Interface Principale

- **📊 Statistiques en Temps Réel** : Marques détectées, overlays ajoutés, temps de traitement
- **📝 Logs Intégrés** : Affichage des événements avec timestamps et émojis
- **🔧 Contrôles de Test** : Boutons pour interagir avec l'environnement

### Contrôles Disponibles

| Bouton | Action | Utilité |
|--------|--------|---------|
| 🧹 Effacer Overlays | Supprime tous les overlays visuels + reset stats | Reset complet entre les tests |
| 📝 Effacer Logs | Vide la zone de logs | Nettoyer l'affichage |
| ⚡ Simuler DOM Dynamique | **Reproduit les bugs de doublons** (auto-détecte le site) | Test principal |
| 🔍 Détecter Doublons | Analyse et met en évidence les doublons (multi-sites) | Diagnostic |

### Simulation Multi-Sites Intelligente

Le bouton "⚡ Simuler DOM Dynamique" s'adapte automatiquement au site ouvert et reproduit fidèlement son comportement :

#### **Auto-détection du Site**
```javascript
const SITE_CONFIGS = {
    footlocker: {
        selectors: { mainImages: '.ProductCard-image--primary', ... },
        urlParams: { main: (size) => `?wid=${size}&hei=${size}&t=${timestamp}` },
        sizes: ['250', '300']
    },
    zalando: {
        selectors: { mainImages: '.voFjEy._3ObVF2...', ... },
        urlParams: { main: (size) => `?imwidth=${size}&t=${timestamp}` },
        sizes: ['300', '400']
    }
};
```

#### **1. Requêtes Images Dynamiques** (par site)
```javascript
// Footlocker
const newSrc = `${baseUrl}?wid=${randomSize}&hei=${randomSize}&t=${timestamp}`;

// Zalando  
const newSrc = `${baseUrl}?imwidth=${randomSize}&t=${timestamp}`;
```

#### **2. Rechargement de Variants** (si supportés)
```javascript
// Footlocker: vignettes couleurs
const newSrc = `${baseUrl}?wid=35&hei=35&variant=${Date.now()}`;

// Zalando: variants (si présents)
const newSrc = `${baseUrl}?imwidth=50&variant=${Date.now()}`;
```

#### **3. Infinite Scroll AJAX** (générique)
```javascript
// Détection automatique des conteneurs par site
const container = document.querySelector(config.selectors.container);
const clonedCard = randomCard.cloneNode(true);
img.classList.remove('bx-processed'); // Force retraitement extension
```

### Détection de Doublons Multi-Sites

L'algorithme de détection s'adapte à tous les sites :
- **Overlays par produit** : `.bx-warning-tint` et `.bx-external-badge`
- **Sélecteurs multi-sites** : `.ProductCard` (Footlocker), `.z5x6ht` (Zalando), génériques
- **Groupement par parent** : Auto-détection des conteneurs produits
- **Mise en évidence visuelle** : Bordure rouge sur les doublons détectés
- **Logs contextuels** : Affiche le nom du site détecté

## Ajouter de Nouveaux Sites E-commerce

### 1. Préparer le DOM Authentique

Copier le HTML d'un site e-commerce réel :
```html
<!-- Exemple: zalando-dom.html -->
<div class="z-card">
    <img src="..." alt="Nike..." class="product-image">
    <div class="product-info">
        <h3>Nike Air Max</h3>
        <div class="price">€99,99</div>
    </div>
</div>
```

### 2. Extraire les Styles CSS

Créer le fichier CSS correspondant :
```css
/* zalando-styles.css */
.z-card {
    width: 280px;
    height: 400px;
    border: 1px solid #eee;
}

.product-image {
    width: 100%;
    height: 280px;
    object-fit: cover;
}
```

### 3. Ajouter le Scénario de Test

Modifier `test-environment.html` :
```html
<!-- Nouveau scénario -->
<div class="test-scenario">
    <div class="scenario-header" onclick="toggleScenario('zalando')">
        <span>🛍️ Zalando - DOM Réel</span>
        <span id="zalando-toggle">▼</span>
    </div>
    <div class="scenario-content" id="zalando-content">
        <!-- Le contenu sera chargé depuis test-data/zalando-dom.html -->
    </div>
</div>
```

### 4. Configuration Intelligente

#### Ajouter la Configuration du Site
```javascript
// Dans SITE_CONFIGS de test-environment.html
amazon: {
    name: 'Amazon',
    selectors: {
        mainImages: '[data-component-type="s-product-image"] img',
        variantImages: '.a-button-thumbnail img',
        productCards: '[data-component-type="s-search-result"]',
        container: '#amazon-content'
    },
    urlParams: {
        main: (size) => `?size=${size}&quality=85&t=${Date.now()}`,
        variant: () => `?size=40&t=${Date.now()}`,
        ajax: () => `&ajax=${Date.now()}`
    },
    sizes: ['200', '300']
}
```

#### Structure DOM Critique
- **Conteneurs produits** : Auto-détectés via la configuration
- **Images principales** : Sélecteurs exacts dans `SITE_CONFIGS`
- **URLs dynamiques** : Paramètres authentiques du vrai site
- **Hierarchy** : Position relative automatiquement gérée

#### Avantages de la Configuration
- ✅ **Auto-détection** : Le site actif est détecté automatiquement
- ✅ **Simulation authentique** : Paramètres URL exacts du vrai site
- ✅ **Détection doublons** : Sélecteurs génériques + spécifiques
- ✅ **Maintenance facile** : Un seul endroit à modifier

## Bonnes Pratiques

### 1. **Authenticité avant Tout**
- Copier le DOM exact depuis les DevTools
- Conserver les classes CSS originales
- Respecter la hiérarchie HTML authentique

### 2. **Tests Complémentaires**
- Tester sur différentes tailles d'écran
- Vérifier avec différents nombres de produits
- Valider le comportement en scroll

### 3. **Documentation des Bugs**
- Noter les conditions exactes de reproduction
- Capturer les screenshots avant/après
- Documenter les sélecteurs CSS problématiques

## Dépannage

### Overlays Non Visibles
1. Vérifier que l'extension est activée
2. Contrôler la présence de marques Nike dans l'API ODM
3. Valider les sélecteurs CSS du site

### Doublons Non Reproduits
1. Analyser les requêtes réseau du vrai site (DevTools)
2. Adapter les timings de simulation
3. Vérifier les mutations DOM spécifiques au site

### Erreurs CORS
1. S'assurer que le serveur local est démarré
2. Utiliser `http://localhost:8000` (pas `file://`)
3. Vérifier les chemins relatifs des fichiers

## Évolution & Architecture

### Version 2.0 - Multi-Sites Intelligente

L'environnement a été complètement repensé pour supporter tous les sites e-commerce :

#### **Fonctionnalités Avancées**
- 🧠 **Auto-détection** : Reconnaissance automatique du site actif
- ⚙️ **Configuration centralisée** : `SITE_CONFIGS` pour tous les sites
- 🔄 **Simulation authentique** : Paramètres URL exacts par site
- 🔍 **Détection universelle** : Doublons détectés sur tous les sites
- 📊 **Reset intelligent** : Stats + overlays + classes `.bx-processed`

#### **Sites Supportés**
| Site | Status | Sélecteurs | URL Pattern |
|------|---------|------------|-------------|
| **Footlocker** | ✅ Fonctionnel | `.ProductCard-image--primary` | `?wid={size}&hei={size}` |
| **Zalando** | ✅ Intégré | `.voFjEy._3ObVF2...` | `?imwidth={size}` |
| **Amazon** | 📋 Exemple config | `[data-component-type]` | `?size={size}&quality=85` |

#### **Extensibilité**
- ➕ **Nouveaux sites** : Ajouter config dans `SITE_CONFIGS`
- 🎯 **Tests spécifiques** : Simulation adaptée par site
- 🔧 **Maintenance** : Code centralisé et modulaire

### Support Technique

Pour toute question :
- **Architecture générale** : `DOCUMENTATION.md`
- **Code PLP/Overlay** : `lib/plp.js` et `lib/overlay.js`  
- **Configuration sites** : `SITE_CONFIGS` dans `test-environment.html`
- **Ajout site** : Suivre la section "Ajouter de Nouveaux Sites E-commerce"