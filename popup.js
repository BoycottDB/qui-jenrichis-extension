// popup.js
// Les helpers de marque (nom, adresse de la page, étiquettes, bénéficiaires)
// viennent de lib/brandData.js, chargé avant ce script.

function getDomain(hostname) {
  return hostname.replace(/^www\./, '');
}

// Variables globales
let currentDomain = '';
let currentSiteDisabled = false;
let watchedStateKey = null;

// État d'un onglet dans chrome.storage.session (même clé dans background.js)
function tabStateKey(tabId) {
  return `odm_tab_${tabId}`;
}

// États possibles de la popup
const PopupStates = {
  LOADING: 'loading',
  DEFAULT: 'default',
  DETECTION: 'detection'
};

const EXTERNAL_LINK_ICON_PATH = 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14';

document.addEventListener('DOMContentLoaded', function () {
  // Éléments DOM des états
  const loadingState = document.getElementById('loading-state');
  const defaultState = document.getElementById('default-state');
  const detectionState = document.getElementById('detection-state');

  // Éléments DOM des actions
  const discoverWebsiteBtn = document.getElementById('discover-website');
  const viewAllBrandsBtn = document.getElementById('view-all-brands');
  const brandsListContainer = document.getElementById('brands-list');
  const detectionCountEl = document.getElementById('detection-count');

  // Éléments du modal paramètres
  const settingsButton = document.getElementById('settingsButton');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsButton = document.getElementById('closeSettingsButton');
  const currentSiteStatus = document.getElementById('currentSiteStatus');
  const toggleCurrentSite = document.getElementById('toggleCurrentSite');
  const currentSiteCard = document.querySelector('.current-site-card');
  const disabledSitesList = document.getElementById('disabledSitesList');

  // Fonction pour changer d'état
  function switchToState(state) {
    loadingState.style.display = state === PopupStates.LOADING ? 'block' : 'none';
    defaultState.style.display = state === PopupStates.DEFAULT ? 'block' : 'none';
    detectionState.style.display = state === PopupStates.DETECTION ? 'block' : 'none';
  }

  // Ouvre une page du site dans un nouvel onglet
  function openWebsite(url) {
    chrome.tabs.create({ url });
    window.close();
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  // Une ligne « libellé : étiquette étiquette… », comme sur la carte d'une marque du site
  function createLine(libelle, badges, badgeClassName, autres) {
    const line = createElement('div', 'brand-line');
    line.appendChild(createElement('span', 'brand-line-label', libelle));
    badges.forEach((text) => line.appendChild(createElement('span', badgeClassName, text)));
    if (autres > 0) {
      line.appendChild(createElement('span', 'brand-line-more', `+${autres}`));
    }
    return line;
  }

  function createExternalLinkIcon() {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('stroke', 'currentColor');
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', EXTERNAL_LINK_ICON_PATH);
    svg.appendChild(path);
    return svg;
  }

  // Carte d'une marque repérée : même contenu que sa carte sur la page
  // /marques du site, et un clic mène à sa page
  function createBrandItem(detection) {
    const { brand } = detection;
    const brandName = getBrandName(brand);

    const item = createElement('div', 'brand-item');

    const header = createElement('div', 'brand-header');
    header.appendChild(createElement('h3', 'brand-name', brandName));
    item.appendChild(header);

    if (detection.type === 'produit') {
      item.appendChild(
        createElement('p', 'brand-product', `${detection.nomDetecte} est vendu sous la marque ${brandName}.`)
      );
    }

    const beneficiaires = getBeneficiaires(brand);
    if (beneficiaires.noms.length > 0) {
      item.appendChild(createLine(
        'Derrière cette marque :',
        beneficiaires.noms,
        'brand-badge brand-badge--beneficiaire',
        beneficiaires.autres
      ));
    }

    const etiquettes = brand.etiquettes || [];
    const libelleEtiquettes = getLibelleEtiquettes(brand);
    if (etiquettes.length > 0 && libelleEtiquettes) {
      item.appendChild(createLine(libelleEtiquettes, etiquettes.map(formatEtiquette), 'brand-badge', 0));
    }

    const actions = createElement('div', 'brand-actions');
    const cta = createElement('button', 'brand-cta');
    cta.type = 'button';
    cta.append(createExternalLinkIcon(), 'Voir le détail et les sources');
    actions.appendChild(cta);
    item.appendChild(actions);

    item.addEventListener('click', () => openWebsite(getDetectionPageUrl(detection)));

    return item;
  }

  // Fonction pour afficher les marques repérées
  function displayDetections(detections) {
    if (detections.length === 0) {
      switchToState(PopupStates.DEFAULT);
      return;
    }

    brandsListContainer.replaceChildren(...detections.map(createBrandItem));

    const count = detections.length;
    detectionCountEl.textContent = count > 1
      ? `${count} marques de notre base sur cette page`
      : '1 marque de notre base sur cette page';

    switchToState(PopupStates.DETECTION);
  }

  // Gestionnaires d'événements pour les boutons CTA
  discoverWebsiteBtn.addEventListener('click', () => openWebsite(ODM_SITE_URL));
  viewAllBrandsBtn.addEventListener('click', () => openWebsite(`${ODM_SITE_URL}/marques`));

  // Domaine de l'onglet. Son adresse n'est lisible que si la popup a été
  // ouverte par un clic sur l'icône de l'extension ; à défaut, on prend le
  // domaine transmis par la page.
  function getTabDomain(tab, tabState) {
    try {
      return getDomain(new URL(tab.url).hostname);
    } catch (_) {
      return (tabState && tabState.domain) || '';
    }
  }

  // La page continue d'être analysée pendant que la popup est ouverte
  chrome.storage.session.onChanged.addListener((changes) => {
    const change = watchedStateKey && changes[watchedStateKey];
    if (change && change.newValue && !currentSiteDisabled) {
      displayDetections(change.newValue.detections || []);
    }
  });

  // Initialisation de la popup : l'état de l'onglet est lu directement dans
  // le storage, sans attendre le réveil du service worker
  async function initializePopup() {
    switchToState(PopupStates.LOADING);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        switchToState(PopupStates.DEFAULT);
        return;
      }

      watchedStateKey = tabStateKey(tab.id);
      const [stored, { disabledSites = [] }] = await Promise.all([
        chrome.storage.session.get(watchedStateKey),
        chrome.storage.sync.get('disabledSites')
      ]);
      const tabState = stored[watchedStateKey];

      currentDomain = getTabDomain(tab, tabState);
      currentSiteDisabled = disabledSites.includes(currentDomain);
      updateSettingsUI(currentSiteDisabled);

      displayDetections(currentSiteDisabled ? [] : (tabState && tabState.detections) || []);
    } catch (error) {
      console.error('ODM : état de l\'onglet illisible', error);
      switchToState(PopupStates.DEFAULT);
    }
  }

  // Fonction pour mettre à jour l'interface des paramètres
  function updateSettingsUI(isDisabled) {
    const status = isDisabled ? 'désactivée' : 'activée';
    const buttonText = isDisabled ? 'Activer l\'extension sur ce site' : 'Désactiver l\'extension sur ce site';
    
    if (currentSiteStatus) {
      currentSiteStatus.textContent = `Extension ${status} sur ${currentDomain}`;
    }
    if (toggleCurrentSite) {
      toggleCurrentSite.innerHTML = `<span class="button-text">${buttonText}</span>`;
      // Sans domaine connu (page interne du navigateur), rien à activer
      toggleCurrentSite.disabled = !currentDomain;
    }
    if (currentSiteCard) {
      currentSiteCard.classList.toggle('disabled', isDisabled);
      currentSiteCard.classList.toggle('enabled', !isDisabled);
    }
  }

  // Gestionnaires pour le modal paramètres
  if (settingsButton && settingsModal) {
    settingsButton.addEventListener('click', function () {
      settingsModal.style.display = 'flex';
    });
  }

  if (closeSettingsButton) {
    closeSettingsButton.addEventListener('click', function () {
      settingsModal.style.display = 'none';
    });
  }

  // Fermer le modal en cliquant à l'extérieur
  if (settingsModal) {
    settingsModal.addEventListener('click', function (e) {
      if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
      }
    });
  }

  // Gestionnaire pour le bouton toggle dans le modal paramètres
  if (toggleCurrentSite) {
    toggleCurrentSite.addEventListener('click', function () {
      chrome.storage.sync.get(['disabledSites'], function (result) {
        let disabledSites = result.disabledSites || [];
        let isDisabled = disabledSites.includes(currentDomain);

        // Basculer l'état
        if (isDisabled) {
          disabledSites = disabledSites.filter(site => site !== currentDomain);
        } else {
          disabledSites.push(currentDomain);
        }

        // Sauvegarder et mettre à jour l'UI
        chrome.storage.sync.set({ disabledSites: disabledSites }, function () {
          updateSettingsUI(!isDisabled);
          displayDisabledSites(disabledSites);

          // Recharger l'onglet actif pour appliquer les changements
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
              chrome.tabs.reload(tabs[0].id);
            }
          });

          // Réinitialiser la popup si nécessaire
          setTimeout(initializePopup, 100);
        });
      });
    });
  }

  // Fonction pour afficher la liste des sites désactivés
  function displayDisabledSites(disabledSites) {
    if (!disabledSitesList) return;

    // Vider la liste actuelle
    disabledSitesList.innerHTML = '';

    if (disabledSites.length === 0) {
      return;
    }

    disabledSites.forEach(site => {
      const siteItem = document.createElement('div');
      siteItem.classList.add('site-item');

      const siteName = document.createElement('span');
      siteName.classList.add('site-name');
      siteName.textContent = site;

      const enableButton = document.createElement('button');
      enableButton.textContent = 'Activer';
      enableButton.classList.add('enable-button');

      enableButton.addEventListener('click', function () {
        const confirmReactivation = confirm(`Voulez-vous réactiver l'extension sur ${site} ?`);
        if (confirmReactivation) {
          const updatedDisabledSites = disabledSites.filter(s => s !== site);

          chrome.storage.sync.set({ disabledSites: updatedDisabledSites }, function () {
            displayDisabledSites(updatedDisabledSites);

            if (site === currentDomain) {
              updateSettingsUI(false);
              chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                  chrome.tabs.reload(tabs[0].id);
                }
              });
            }
          });
        }
      });

      siteItem.appendChild(siteName);
      siteItem.appendChild(enableButton);
      disabledSitesList.appendChild(siteItem);
    });
  }

  // Charger et afficher la liste des sites désactivés au démarrage
  chrome.storage.sync.get(['disabledSites'], function (result) {
    const disabledSites = result.disabledSites || [];
    displayDisabledSites(disabledSites);
  });

  // Initialiser la popup
  initializePopup();

});