/* ############################################
   #                                          #
   #        SYSTÈME D'ANIMATIONS ODM          #
   #                                          #
   ############################################ */

// État global des animations
const ODMAnimations = {
  isScanning: false,
  scanningOverlay: null,
  progressIndicator: null,
  highlightedElements: new Set(),
  discoveryEffects: new Map()
};

/* ============================================
   ANIMATION DE SCANNING INITIAL
   ============================================ */

function showScanningAnimation() {
  // Ne plus afficher l'overlay plein écran, juste déclencher l'indicateur de progression
  if (ODMAnimations.isScanning) return;
  
  ODMAnimations.isScanning = true;
  
  // Vérifier si on est sur une PDP (pas de système de comptage d'images)
  if (typeof isProductDetailPage !== 'undefined' && isProductDetailPage()) {
    // Pour les PDP, afficher brièvement l'indicateur puis le masquer
    showProgressIndicator();
    updateProgressIndicator(1, 1);
    
    setTimeout(() => {
      hideProgressIndicator();
      ODMAnimations.isScanning = false;
    }, 2000);
  } else {
    // Pour les PLP, déclencher l'indicateur normal (géré par plp.js)
    showProgressIndicator();
    
    setTimeout(() => {
      ODMAnimations.isScanning = false;
    }, 1000);
  }
}

function hideScanningAnimation() {
  if (ODMAnimations.scanningOverlay) {
    ODMAnimations.scanningOverlay.remove();
    ODMAnimations.scanningOverlay = null;
  }
  ODMAnimations.isScanning = false;
}

/* ============================================
   INDICATEUR DE PROGRESSION PLP
   ============================================ */

function showProgressIndicator() {
  // Éviter les doublons
  if (ODMAnimations.progressIndicator) return;
  
  const indicator = document.createElement('div');
  indicator.className = 'odm-progress-indicator';
  
  const logoUrl = getLogoUrl();
  
  indicator.innerHTML = `
    <div class="odm-progress-content">
      <div class="odm-progress-logo">
        <img src="${logoUrl}" alt="">
      </div>
      <div class="odm-progress-spinner"></div>
      <div class="odm-progress-text">Analyse : 0 produits</div>
    </div>
  `;
  
  document.body.appendChild(indicator);
  ODMAnimations.progressIndicator = indicator;
}

function updateProgressIndicator(current, total) {
  if (!ODMAnimations.progressIndicator) return;
  
  const textElement = ODMAnimations.progressIndicator.querySelector('.odm-progress-text');
  if (textElement) {
    if (total) {
      textElement.textContent = `Analyse : ${current}/${total} produits`;
    } else {
      textElement.textContent = `Analyse : ${current} produits`;
    }
  }
}

function hideProgressIndicator() {
  if (ODMAnimations.progressIndicator) {
    setTimeout(() => {
      if (ODMAnimations.progressIndicator) {
        ODMAnimations.progressIndicator.remove();
        ODMAnimations.progressIndicator = null;
      }
    }, 2000); // Laisser visible 2s après la fin
  }
}

/* ============================================
   HIGHLIGHTS DYNAMIQUES PDP
   ============================================ */

function highlightElement(element, type = 'scanning') {
  if (ODMAnimations.highlightedElements.has(element)) return;
  
  // Créer l'overlay de highlight
  const highlight = document.createElement('div');
  highlight.className = `odm-highlight odm-highlight-${type}`;
  
  // Positionner l'overlay
  const rect = element.getBoundingClientRect();
  highlight.style.cssText = `
    position: fixed;
    top: ${rect.top - 2}px;
    left: ${rect.left - 2}px;
    width: ${rect.width + 4}px;
    height: ${rect.height + 4}px;
    pointer-events: none;
    z-index: 9998;
  `;
  
  document.body.appendChild(highlight);
  ODMAnimations.highlightedElements.add(element);
  
  // Associer l'highlight à l'élément pour pouvoir le supprimer
  element._odmHighlight = highlight;
  
  // Supprimer automatiquement après 3 secondes pour le scanning
  if (type === 'scanning') {
    setTimeout(() => {
      removeHighlight(element);
    }, 3000);
  }
}

function removeHighlight(element) {
  if (element._odmHighlight) {
    element._odmHighlight.remove();
    delete element._odmHighlight;
  }
  ODMAnimations.highlightedElements.delete(element);
}

function showSuccessHighlight(element) {
  // Supprimer l'ancien highlight
  removeHighlight(element);
  
  // Ajouter le highlight de succès
  highlightElement(element, 'success');
  
  // Ajouter une checkmark
  const checkmark = document.createElement('div');
  checkmark.className = 'odm-checkmark';
  checkmark.innerHTML = '✅';
  
  const rect = element.getBoundingClientRect();
  checkmark.style.cssText = `
    position: fixed;
    top: ${rect.top - 30}px;
    right: ${window.innerWidth - rect.right}px;
    z-index: 9999;
    pointer-events: none;
  `;
  
  document.body.appendChild(checkmark);
  
  // Supprimer la checkmark après animation
  setTimeout(() => {
    checkmark.remove();
    removeHighlight(element);
  }, 2000);
}

/* ============================================
   ANIMATION DE DÉCOUVERTE (RADAR)
   ============================================ */

function showDiscoveryAnimation(element) {
  const discoveryId = `discovery-${Date.now()}`;
  
  // Créer l'effet radar
  const radar = document.createElement('div');
  radar.className = 'odm-discovery-radar';
  radar.id = discoveryId;
  
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  radar.style.cssText = `
    position: fixed;
    top: ${centerY}px;
    left: ${centerX}px;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 9997;
  `;
  
  // Ajouter les cercles d'onde
  for (let i = 0; i < 3; i++) {
    const circle = document.createElement('div');
    circle.className = 'odm-radar-circle';
    circle.style.animationDelay = `${i * 0.5}s`;
    radar.appendChild(circle);
  }
  
  document.body.appendChild(radar);
  ODMAnimations.discoveryEffects.set(element, radar);
  
  // Supprimer après l'animation
  setTimeout(() => {
    radar.remove();
    ODMAnimations.discoveryEffects.delete(element);
  }, 3000);
}

/* ============================================
   FONCTIONS UTILITAIRES
   ============================================ */

function cleanupAnimations() {
  // Nettoyer tous les éléments d'animation
  hideScanningAnimation();
  hideProgressIndicator();
  
  // Supprimer tous les highlights
  ODMAnimations.highlightedElements.forEach(element => {
    removeHighlight(element);
  });
  
  // Supprimer tous les effets de découverte
  ODMAnimations.discoveryEffects.forEach(radar => {
    radar.remove();
  });
  ODMAnimations.discoveryEffects.clear();
}

function injectAnimationStyles() {
  // Éviter les doublons de style
  if (document.getElementById('odm-animation-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'odm-animation-styles';
  styles.textContent = `
    /* ============================================
       SCANNING OVERLAY
       ============================================ */
    .odm-scanning-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(152, 16, 91, 0.1);
      z-index: 9999;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .odm-scanning-content {
      background: rgba(255, 255, 255, 0.95);
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      text-align: center;
      border: 2px solid #98105b;
    }
    
    .odm-scanning-wave {
      width: 60px;
      height: 60px;
      margin: 0 auto 15px;
      border: 3px solid #98105b;
      border-top: 3px solid transparent;
      border-radius: 50%;
      animation: odm-scan-spin 1s linear infinite;
    }
    
    .odm-scanning-text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: #98105b;
    }
    
    @keyframes odm-scan-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* ============================================
       PROGRESS INDICATOR
       ============================================ */
    .odm-progress-indicator {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.95);
      padding: 12px 16px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 9998;
      pointer-events: none;
      border: 1px solid #98105b;
      backdrop-filter: blur(10px);
    }
    
    .odm-progress-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .odm-progress-logo {
      height: 22px;
      flex-shrink: 0;
      animation: odm-logo-pulse 2s ease-in-out infinite;
    }
    
    .odm-progress-logo img {
      display: block;
      height: 100%;
      width: auto;
    }
    
    .odm-progress-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e8e2e4;
      border-top: 2px solid #98105b;
      border-radius: 50%;
      animation: odm-progress-spin 1s linear infinite;
    }
    
    .odm-progress-text {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      color: #3d2a30;
    }
    
    @keyframes odm-progress-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    @keyframes odm-logo-pulse {
      0%, 100% { opacity: 0.8; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.05); }
    }
    
    /* ============================================
       HIGHLIGHTS
       ============================================ */
    .odm-highlight {
      border-radius: 6px;
      animation: odm-highlight-pulse 2s ease-in-out infinite;
    }
    
    .odm-highlight-scanning {
      border: 2px solid #729dd0;
      background: rgba(114, 157, 208, 0.1);
    }
    
    .odm-highlight-success {
      border: 2px solid #10b981;
      background: rgba(16, 185, 129, 0.1);
    }
    
    @keyframes odm-highlight-pulse {
      0%, 100% { opacity: 0.7; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.02); }
    }
    
    .odm-checkmark {
      font-size: 24px;
      animation: odm-checkmark-bounce 0.5s ease-out;
    }
    
    @keyframes odm-checkmark-bounce {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.2); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    
    /* ============================================
       DISCOVERY RADAR
       ============================================ */
    .odm-discovery-radar {
      width: 0;
      height: 0;
    }
    
    .odm-radar-circle {
      position: absolute;
      border: 2px solid #dc2626;
      border-radius: 50%;
      animation: odm-radar-expand 2s ease-out infinite;
    }
    
    @keyframes odm-radar-expand {
      0% {
        width: 20px;
        height: 20px;
        margin: -10px;
        opacity: 1;
      }
      100% {
        width: 200px;
        height: 200px;
        margin: -100px;
        opacity: 0;
      }
    }
  `;
  
  document.head.appendChild(styles);
}

// Injecter les styles au chargement
injectAnimationStyles();

// Nettoyer les animations au déchargement de la page
window.addEventListener('beforeunload', cleanupAnimations);