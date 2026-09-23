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
  dimensions (largeur/hauteur/profondeur), propriétés personnalisées,
  placement depuis l'inventaire par clic au sol. Un objet est soit un
  **bloc normal** (bloque le passage, peut stocker de l'argent/des objets),
  soit un **objet simple** — case « Objet simple » cochée dans l'onglet
  Info : transperçable comme un ticket, et `player.request_money()`/
  `player.request_object()` (ou un dépôt manuel via le panneau Inventaire)
  y échouent immédiatement puisqu'il ne peut rien stocker. Clic droit sur
  un objet placé que vous possédez → menu contextuel **[Inventaire —
  uniquement pour un bloc] / Déplacer / Récupérer** (voir plus bas).
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
  debug, sans jamais faire planter le jeu (erreurs capturées). Fonctions
  utilitaires intégrées : `time()`, `randint(a, b)`, `random()`,
  `choice(liste)`, `floor(n)`, `ceil(n)`, en plus de `range`/`len`/`str`/
  `int`/`abs`/`min`/`max`/`round`/`log`.
- **Boîtes de dialogue** — un script peut demander une saisie au joueur :
  `player.ask_text(question)` (champ de texte), `player.ask_choice(question,
  [options])` (sélecteur), `player.ask_yes_no(question)` (Oui/Non, retourne
  directement un booléen) et `player.ask_number(question, min, max)` (champ
  numérique borné — passez `True` en 4ᵉ argument pour l'afficher comme un
  curseur/slider à la place). Toutes (sauf `ask_yes_no`) retournent un objet
  `.accepted`/`.value`, `.accepted` étant `False` si le joueur annule.
- **Économie & transactions (P4)** — monnaie (`Coin`), inventaire par
  empilement d'instances, `player.request_money(montant)` ouvre une modale
  de confirmation ; la transaction (vérification du solde + débit) est
  atomique côté moteur — jamais de duplication/disparition d'argent.
- **Objets stockés dans les machines** — symétrique à `request_money`,
  `player.request_object(nom_objet)` demande au joueur de céder un
  exemplaire depuis son inventaire ; s'il accepte, l'exemplaire est retiré
  de son inventaire et stocké dans **l'inventaire propre de l'objet
  (la machine)** qui l'a demandé. `object.give_item(player, nom_objet)` a
  été retravaillé en conséquence : il donne en priorité un exemplaire déjà
  en stock dans la machine ; s'il n'y en a pas, il n'en fabrique un nouveau
  que si le créateur de la machine est aussi le créateur de l'objet donné
  — impossible donc de faire distribuer à l'infini par une machine la
  création de quelqu'un d'autre sans qu'elle l'ait réellement en stock.
- **Gestion d'un objet placé** — clic droit sur un bloc que vous possédez
  ouvre un menu à trois entrées : **📦 Inventaire** (voir ci-dessous),
  **✋ Déplacer** (le reprendre puis cliquer un nouvel emplacement — son
  solde et son contenu suivent, rien n'est perdu) et **↩️ Récupérer**.
  Aucune des deux n'est destructrice : « Récupérer » rend le bloc
  lui-même à votre inventaire (comme un ramassage), après y avoir d'abord
  reversé tout l'argent qu'il avait collecté (`object.get_balance()`) et
  tous les objets qui étaient stockés dedans — rien n'est jamais perdu,
  ni l'argent, ni les objets, ni le bloc.
- **📦 Inventaire d'un objet placé** — panneau dédié pour gérer directement
  le contenu d'une machine que vous possédez, sans passer par un script :
  déposer/retirer des coins (comme pour `player.request_money`/
  `object.send_money`, mais en action directe, sans confirmation puisque
  c'est votre propre bien), et déposer/retirer des objets un peu comme
  `player.request_object`/`object.give_item`, mais initié par vous plutôt
  que par le script de la machine.
- **Identifiant unique** — chaque définition publiée (`def.id`) a un
  identifiant unique et stable, visible dans l'onglet Info de l'Object
  Creator. Un objet placé peut lire le sien (celui de son *exemplaire*,
  pas de sa définition) depuis son propre script avec `object.get_id()` —
  les simples exemplaires empilés dans un inventaire (interchangeables,
  affichés en « ×N ») n'exposent pas d'identifiant individuel dans
  l'interface.
- **Se donner un objet** — en bas de l'inventaire, un créateur retrouve un
  sélecteur listant tout ce qu'il a lui-même publié, un compteur de
  quantité et un bouton « Se le donner » pour ajouter directement des
  exemplaires à son propre inventaire (utile pour tester, ou pour stocker
  une machine avant de la placer).
- **Solde des objets (extension du prototype)** — un objet **conserve
  l'argent qu'il a collecté** : quand une `player.request_money()` est
  acceptée, le montant est crédité sur le solde propre de l'objet
  (`object.get_balance()`), pas seulement débité du joueur. Un script peut
  ensuite reverser tout ou partie de ce solde à **n'importe quel joueur**
  via son identifiant avec `object.send_money(id_joueur, montant)`
  (`player.get_id()` donne l'identifiant du joueur courant). Le transfert
  est atomique et ne peut jamais dépasser ce que l'objet a réellement
  collecté.
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

Le monde démarre **vide** (juste le joueur et sa maison) : c'est au joueur
de créer ses propres objets via l'Object Creator dès la première session.

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

Le monde de départ étant désormais vide, ces scénarios créent leurs propres
objets de test plutôt que de s'appuyer sur des objets pré-publiés.

1. Créer un objet → dessiner une texture pixel art → écrire
   `def on_interact(player): player.say("Hello !")` → **Tester** → le
   message apparaît dans la console de debug → **Publier** → l'objet
   apparaît dans l'inventaire → **Placer** → clic sur l'objet en jeu → il
   répond bien "Hello !".
2. Objet payant : `player.request_money(100)` → clic → modale "100 coins"
   → Accepter → solde débité de 100 (atomique) ; Refuser → solde inchangé.
3. Objet donnant un objet en stock vs. minté : un script qui dépose un
   objet via `player.request_object()` puis le redemande avec
   `object.give_item()` dans la même interaction confirme, dans la console
   de debug, le chemin "Objet reçu (en stock)" — pas "nouvel exemplaire".
4. Sauvegarde : rechargement de la page → solde, inventaire et objets
   placés inchangés (localStorage).
5. Textures multiples : dans l'onglet Textures, créer une texture
   additionnelle "ouvert", puis dans le script
   `object.set_texture("ouvert")` suivi de `player.say(str(object.get_texture()))`
   → **Tester** → la console de debug confirme `"ouvert"` et l'aperçu du
   cube change bien de couleur.
6. Solde d'objet : un script qui encaisse 20 coins par interaction et se
   reverse tout son solde via `object.send_money()` dès qu'il atteint 100
   → cycle complet validé de bout en bout (500→480→460→440→420→500).
7. Boîtes de dialogue : boîte Oui/Non, puis champ numérique (1 à 10) → un
   nombre aléatoire (`randint`) est tiré et comparé → message de
   victoire/défaite, puis un cooldown de 5s (`time()`) empêche de rejouer
   immédiatement sur une instance déjà placée (pas seulement en mode
   Test, qui repart d'un état vierge à chaque clic).
8. Gestion d'un objet placé : clic droit sur un bloc possédé → menu à 3
   boutons. **Inventaire** → dépôt de 50 coins et d'un objet depuis
   l'inventaire du joueur vers la machine, puis retrait partiel des coins
   — soldes des deux côtés cohérents à chaque étape. **Déplacer** → le
   bloc repasse en mode placement et peut être redéposé ailleurs sans
   perdre son contenu. **Récupérer** avec du solde et un objet encore
   stockés dedans → le solde, l'objet stocké *et le bloc lui-même*
   atterrissent tous les trois dans l'inventaire du joueur (le bloc n'est
   jamais détruit, juste repris).
9. Plus de badge d'identifiant par exemplaire dans l'inventaire (vérifié
   par absence de la classe `inventory__id` dans le DOM) ; l'identifiant
   de définition reste visible dans l'Object Creator.

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
