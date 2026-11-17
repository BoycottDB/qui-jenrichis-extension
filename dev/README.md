# ODM Extension - Environnement de Test (Development Only)

## ⚠️ Important

Ce dossier `dev/` contient l'environnement de test de l'extension ODM et **ne doit PAS être inclus** lors du packaging pour les stores (Chrome Web Store, Firefox Add-ons).

## Contenu

- `test-environment.html` - Interface principale de test
- `TEST-ENVIRONMENT.md` - Documentation complète
- `test-data/` - DOM et CSS authentiques des sites e-commerce

## Usage

```bash
# Démarrer depuis la racine de l'extension
cd odm-extension
python3 -m http.server 8000

# Ouvrir l'environnement de test
open http://localhost:8000/dev/test-environment.html
```

## Packaging

Lors de la création du package d'extension pour production, exclure ce dossier :

### Scripts de Build

```json
{
  "scripts": {
    "build": "rsync -av --exclude='dev/' . dist/",
    "package": "web-ext build --ignore-files='dev/**/*'"
  }
}
```

### Manifest V3 - web_accessible_resources

Le dossier `dev/` n'est pas référencé dans `manifest.json` et ne sera pas accessible depuis l'extension packagée.

## Documentation

Voir `TEST-ENVIRONMENT.md` pour la documentation complète de l'environnement de test.