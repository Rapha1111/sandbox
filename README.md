# Sandbox sociale programmable — Prototype solo (v0.1)

Prototype jouable en solo d'une sandbox où **les joueurs créent eux-mêmes
les objets et systèmes du monde** : formes, textures pixel art, scripts,
économie. Implémente les objectifs P0–P4 du document de spécifications
(`specifications_jeu_sandbox.md`).

## Lancer le projet

```bash
npm install
npm run dev       # serveur de dev, http://localhost:5173
npm run build     # build de production (tsc -b && vite build)
```

Aucun serveur/backend n'est requis : tout tourne dans le navigateur, l'état
est sauvegardé dans `localStorage` (débounce 300ms après chaque changement).

## Ce qui est implémenté

- **Monde & maison (P0)** — scène 3D (Three.js / react-three-fiber) vue du
  dessus avec caméra orthographique qui suit le joueur, déplacement au
  clavier (WASD/flèches), collisions avec les objets marqués `collidable`,
  sauvegarde/chargement automatique.
- **Objets (P1)** — `Object Creator` (bouton « ✨ Créer un objet ») : nom,
  dimensions (largeur/hauteur/profondeur), collision, propriétés
  personnalisées, placement depuis l'inventaire par clic au sol, ramassage
  par clic droit sur un objet placé.
- **Textures pixel art (P2)** — chaque objet a sa propre **bibliothèque de
  textures nommées** (onglet Textures : grille de faces + section
  "Bibliothèque" pour créer/renommer/supprimer des textures additionnelles,
  ex. "ouvert"/"fermé"). Pour limiter le travail de dessin, **seules "haut"
  et "avant" se peignent** — "bas" n'a jamais de texture (jamais visible) et
  "arrière"/"gauche"/"droite" copient automatiquement "avant". Éditeur par
  texture : tailles 8/16/32/64, crayon, gomme, remplissage (flood fill),
  pipette, palette + couleur personnalisée, miroir, rotation 90°,
  annuler/rétablir, aperçu en direct, rendu en jeu via `CanvasTexture`
  (filtrage "nearest" pour un rendu net). Un script peut changer l'apparence
  de son objet à l'exécution avec `object.set_texture("nom")` (ou
  `object.set_texture("top"|"front", "nom")` pour une seule des deux faces
  peignables) et lire l'état actuel avec `object.get_texture()`.
- **Langage de script (P3)** — sous-ensemble de Python maison
  (`src/script-lang`) : `def`, `if/elif/else`, `for`/`while`/`range`,
  `and/or/not`, opérateurs de comparaison/arithmétique, appels de
  fonctions/méthodes. Interpréteur *tree-walking* asynchrone avec budget
  de pas d'exécution (garde-fou anti-boucle infinie) et éditeur CodeMirror
  avec coloration syntaxique + bouton **Tester** qui exécute l'évènement
  choisi sur un objet éphémère et affiche le résultat dans la console de
  debug, sans jamais faire planter le jeu (erreurs capturées).
- **Économie & transactions (P4)** — monnaie (`Coin`), inventaire par
  empilement d'instances, `player.request_money(montant)` ouvre une modale
  de confirmation ; la transaction (vérification du solde + débit) est
  atomique côté moteur — jamais de duplication/disparition d'argent.
  `object.give_item(player, "Nom")` crée une nouvelle instance validée par
  le moteur, jamais directement par le script.
- **Solde des objets (extension du prototype)** — un objet **conserve
  l'argent qu'il a collecté** : quand une `player.request_money()` est
  acceptée, le montant est crédité sur le solde propre de l'objet
  (`object.get_balance()`), pas seulement débité du joueur. Un script peut
  ensuite reverser tout ou partie de ce solde à **n'importe quel joueur**
  via son identifiant avec `object.send_money(id_joueur, montant)`
  (`player.get_id()` donne l'identifiant du joueur courant). Le transfert
  est atomique et ne peut jamais dépasser ce que l'objet a réellement
  collecté. Démonstration dans le monde de départ : l'objet "Cagnotte"
  encaisse 20 coins par interaction et reverse automatiquement tout son
  solde dès qu'il atteint 100.
- **Référence des commandes** — bouton **?** (HUD et onglet Script) ouvrant
  la liste complète de l'API disponible pour les scripts (évènements,
  `player.*`, `object.*`, fonctions intégrées), avec description et exemple
  pour chacune, et un badge local/sensible reprenant la distinction du
  §11 de la spec (`src/engine/apiReference.ts`).
- **Sécurité** — les scripts ne reçoivent **jamais** d'accès direct à
  l'état du jeu : seuls les objets hôtes `player` / `object` (liste
  blanche de méthodes, voir `src/engine/scriptApi.ts` et
  `src/engine/permissions.ts`) sont exposés. Toute action économique
  passe par le moteur (`GameEngine`), jamais par une affectation directe.
  `object.send_money()` ne peut mouvementer que le solde déjà collecté par
  l'objet — il ne peut ni créer d'argent ni débiter un joueur.

Le monde démarre avec 5 objets déjà publiés (Cube Bonjour, Machine à soda,
Distributeur de tickets, Ticket, Cagnotte) pour illustrer immédiatement le
flux complet décrit aux §29–31 de la spec ainsi que les textures multiples
et le solde des objets, tout en laissant le joueur créer les siens.

## Architecture

```
src/
  script-lang/   lexer, parser, interpreter — langage indépendant du jeu
  engine/        GameEngine (Object/Inventory/Economy/Transaction/
                 Permission managers), types du modèle de données, API
                 de script, persistance (SaveManager)
  data/store.ts  pont zustand : re-render React quand GameEngine.notify()
  world/         rendu 3D (react-three-fiber) : caméra, maison, joueur,
                 instances d'objets, textures
  ui/            Object Creator, éditeur pixel art, inventaire, HUD,
                 modale de transaction, console de debug
```

`GameEngine` ne dépend d'aucune API DOM/React : c'est une classe
framework-agnostique qui expose `subscribe()` pour toute notification de
changement. C'est ce découplage qui permettra, pour la version
multijoueur, de faire tourner cette même classe côté serveur (autoritaire)
et de remplacer uniquement `LocalStorageSaveManager` par un client réseau
parlant au serveur — sans réécrire la logique de jeu, les managers ou le
langage de script. `ObjectDefinition` (le modèle publié par un créateur)
et `ObjectInstance` (un exemplaire possédé/placé) sont déjà distincts
(spec §16), ce qui est la base nécessaire à l'échange/vente/don d'objets
plus tard.

## Testé manuellement (Playwright, voir aussi §29–31 de la spec)

1. Créer un objet → dessiner une texture pixel art → écrire
   `def on_interact(player): player.say("Hello !")` → **Tester** → le
   message apparaît dans la console de debug → **Publier** → l'objet
   apparaît dans l'inventaire → **Placer** → clic sur l'objet en jeu → il
   répond bien "Hello !".
2. Objet payant (Machine à soda) : clic → modale "100 coins" → Accepter →
   solde débité de 100 (atomique) ; Refuser → solde inchangé.
3. Objet donnant un objet (Distributeur de tickets) : paiement de 50 coins
   accepté → un "Ticket" est ajouté à l'inventaire.
4. Sauvegarde : rechargement de la page → solde, inventaire et objets
   placés inchangés (localStorage).
5. Textures multiples : dans l'onglet Textures, créer une texture
   additionnelle "ouvert", puis dans le script
   `object.set_texture("ouvert")` suivi de `player.say(str(object.get_texture()))`
   → **Tester** → la console de debug confirme `"ouvert"` et l'aperçu du
   cube change bien de couleur.
6. Solde d'objet : interagir 5 fois avec la "Cagnotte" (20 coins à chaque
   fois, accepter) → le solde du joueur descend de 20 à chaque tour puis
   remonte d'un coup au 5ᵉ (100 coins reversés automatiquement par
   `object.send_money`) → validé de bout en bout (500→480→460→440→420→500).

## Volontairement non traité dans ce prototype (voir spec §35)

Hors périmètre "sandbox solo" : multijoueur/réseau, marketplace,
échange/vente entre joueurs, modération, copier/coller et sélection dans
l'éditeur de texture, animations avancées (`object.play_animation` est
fonctionnel comme *hook* mais ne joue pas encore d'animation visuelle),
persistance des brouillons d'objets non publiés en cas de rechargement
pendant l'édition, migration automatique d'anciennes sauvegardes
`localStorage` d'avant l'introduction de la bibliothèque de textures
nommées (une sauvegarde très ancienne peut afficher des objets sans
texture — dans ce cas, republier l'objet ou vider `localStorage`).
