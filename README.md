# Budget

Appli de suivi de budget personnel : reste à vivre en temps réel, simulateur d'achat, dépenses fixes lissées.
Aucune dépendance, aucun build, aucun serveur : les données restent dans le navigateur.

## Lancer en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Mettre en ligne gratuitement (GitHub Pages)

1. Crée un dépôt GitHub et pousse le contenu de ce dossier à la racine.
2. Dans le dépôt : Settings > Pages > Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'appli est disponible sur `https://<ton-pseudo>.github.io/<nom-du-depot>/`.
4. Sur le téléphone, ouvre l'URL puis « Ajouter à l'écran d'accueil ».

Le dépôt peut être privé uniquement avec un compte GitHub payant pour Pages ; en public, le code est visible
mais pas tes données (elles ne quittent jamais ton téléphone).

## Fichiers

- `index.html` : structure et styles
- `app.js` : calculs et affichage
- `store.js` : stockage (le seul fichier à remplacer pour passer à Supabase)
- `sw.js`, `manifest.webmanifest`, icônes : installation et fonctionnement hors ligne

## Sauvegardes

Réglages > Télécharger une sauvegarde produit un fichier JSON, restaurable depuis le même écran.
Effacer les données du site dans le navigateur supprime tout : garde une sauvegarde récente.
# budget
