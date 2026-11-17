/* ############################################
   #                                          #
   #   CARTE D'UNE MARQUE (DANS LES PAGES)    #
   #                                          #
   ############################################ */

// Carte affichée dans les pages marchandes, au survol d'un badge (listes de
// produits) et dans le panneau des fiches produit. Elle reprend le contenu et
// l'allure de la carte d'une marque sur la page /marques du site : qui est
// derrière la marque, les étiquettes de controverses et le lien vers sa page.
// Elle vit toujours dans un Shadow DOM, qui reçoit ODM_BRAND_CARD_STYLES.

const ODM_BRAND_CARD_STYLES = `
  .odm-card {
    box-sizing: border-box;
    width: 320px;
    max-width: calc(100vw - 32px);
    padding: 14px 16px 16px;
    background: #ffffff;
    border: 2px solid #e8a3b7;
    border-radius: 16px;
    box-shadow: 0 12px 32px rgba(20, 9, 15, 0.2);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #14090f;
    text-align: left;
  }
  .odm-card-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.3;
    color: #98105b;
  }
  .odm-card-text {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: #3d2a30;
  }
  .odm-card-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin-top: 10px;
  }
  .odm-card-label,
  .odm-card-more {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    color: #3d2a30;
  }
  /* Style tampon du site : catégories en bleu, bénéficiaires en contour bordeaux */
  .odm-card-chip {
    padding: 1px 8px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
    color: #344b6d;
    background: #f6f9fc;
    border: 1px solid #dae9f6;
    border-radius: 2px;
  }
  .odm-card-chip--beneficiaire {
    color: #6f0c43;
    background: none;
    border-color: #e8a3b7;
  }
  .odm-card-link {
    display: block;
    margin-top: 14px;
    padding: 8px 12px;
    border-radius: 8px;
    background: #98105b;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }
  .odm-card-link:hover {
    background: #6f0c43;
  }
`;

function odmCreateCardElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// Une ligne « libellé : étiquette étiquette… »
function odmBuildCardLine(libelle, chips, chipClassName, autres) {
  const line = odmCreateCardElement('div', 'odm-card-line');
  line.appendChild(odmCreateCardElement('span', 'odm-card-label', libelle));
  chips.forEach((text) => line.appendChild(odmCreateCardElement('span', chipClassName, text)));
  if (autres > 0) {
    line.appendChild(odmCreateCardElement('span', 'odm-card-more', `+${autres}`));
  }
  return line;
}

function odmBuildBrandCard(detection) {
  const { brand } = detection;
  const brandName = getBrandName(brand);
  const isProduct = detection.type === 'produit';

  const card = odmCreateCardElement('div', 'odm-card');

  card.appendChild(odmCreateCardElement(
    'p',
    'odm-card-title',
    `Qui j'enrichis en consommant ${isProduct ? detection.nomDetecte : brandName} ?`
  ));

  if (isProduct) {
    card.appendChild(odmCreateCardElement(
      'p',
      'odm-card-text',
      `${detection.nomDetecte} est vendu sous la marque ${brandName}.`
    ));
  }

  const beneficiaires = getBeneficiaires(brand);
  if (beneficiaires.noms.length > 0) {
    card.appendChild(odmBuildCardLine(
      'Derrière cette marque :',
      beneficiaires.noms,
      'odm-card-chip odm-card-chip--beneficiaire',
      beneficiaires.autres
    ));
  }

  const etiquettes = brand.etiquettes || [];
  const libelleEtiquettes = getLibelleEtiquettes(brand);
  if (etiquettes.length > 0 && libelleEtiquettes) {
    card.appendChild(odmBuildCardLine(libelleEtiquettes, etiquettes.map(formatEtiquette), 'odm-card-chip', 0));
  }

  const link = odmCreateCardElement('a', 'odm-card-link', 'Voir le détail et les sources ↗');
  link.href = getDetectionPageUrl(detection);
  link.target = '_blank';
  link.rel = 'noopener';
  card.appendChild(link);

  return card;
}
