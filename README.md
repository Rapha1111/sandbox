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
- **Textures pixel art (P2)** — éditeur par face (haut/bas/avant/arrière/
  gauche/droite), tailles 8/16/32/64, crayon, gomme, remplissage (flood
  fill), pipette, palette + couleur personnalisée, miroir, rotation 90°,
  annuler/rétablir, aperçu en direct, rendu en jeu via `CanvasTexture`
  (filtrage "nearest" pour un rendu net).
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
- **Sécurité** — les scripts ne reçoivent **jamais** d'accès direct à
  l'état du jeu : seuls les objets hôtes `player` / `object` (liste
  blanche de méthodes, voir `src/engine/scriptApi.ts` et
  `src/engine/permissions.ts`) sont exposés. Toute action économique
  passe par le moteur (`GameEngine`), jamais par une affectation directe.

Le monde démarre avec 4 objets déjà publiés (Cube Bonjour, Machine à
soda, Distributeur de tickets, Ticket) pour illustrer immédiatement le
flux complet décrit aux §29–31 de la spec, tout en laissant le joueur
créer les siens.

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

## Volontairement non traité dans ce prototype (voir spec §35)

Hors périmètre "sandbox solo" : multijoueur/réseau, marketplace,
échange/vente entre joueurs, modération, copier/coller et sélection dans
l'éditeur de texture, animations avancées (`object.play_animation` est
fonctionnel comme *hook* mais ne joue pas encore d'animation visuelle),
persistance des brouillons d'objets non publiés en cas de rechargement
pendant l'édition.
