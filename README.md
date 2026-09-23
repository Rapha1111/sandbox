# Sandbox sociale programmable — Prototype (v0.2, début du multijoueur)

Prototype jouable d'une sandbox où **les joueurs créent eux-mêmes les
objets et systèmes du monde** : formes, textures pixel art, scripts,
économie. Implémente les objectifs P0–P4 du document de spécifications
(`specifications_jeu_sandbox.md`), plus un tout premier niveau de
multijoueur (voir « Multijoueur » ci-dessous).

## Lancer le projet

```bash
npm install
npm run dev       # client (Vite), http://localhost:5173
npm run server    # serveur de relais multijoueur, ws://localhost:8787
npm run build     # build de production (tsc -b && vite build)
```

Le client fonctionne très bien **sans** `npm run server` : tout continue de
tourner dans le navigateur, l'état est sauvegardé dans `localStorage`
(débounce 300ms après chaque changement), exactement comme le prototype
solo d'origine — le serveur n'est nécessaire que pour voir d'autres
joueurs réels. Lancez les deux commandes dans deux terminaux séparés pour
tester en multijoueur ; ouvrez ensuite `http://localhost:5173` dans deux
navigateurs (ou deux fenêtres de navigation privée — l'identité de chacun
vit dans `localStorage`, donc deux onglets du même navigateur non-privé
partageraient la même identité), puis donnez le code affiché par le
bouton **🔑** d'une des deux sessions à l'autre via son champ « Rejoindre »
(voir « Multijoueur » ci-dessous — sans ça, les deux restent chacune dans
leur propre salon et ne se voient pas).

Pour un déploiement (ex. le client sur Vercel), pointez le client vers un
serveur de relais accessible publiquement avec la variable d'env Vite
`VITE_WS_URL` (ex. `VITE_WS_URL=wss://mon-serveur.example.com npm run
build`) — voir « Multijoueur » pour les limites de ce relais.

## Ce qui est implémenté

- **Monde & maison (P0)** — scène 3D (Three.js / react-three-fiber) vue du
  dessus avec caméra orthographique qui suit le joueur, déplacement au
  clavier (WASD/flèches), collisions avec les objets marqués `collidable`,
  sauvegarde/chargement automatique.
- **Objets (P1)** — `Object Creator` (bouton « ✨ Créer un objet ») : nom,
  dimensions (largeur/hauteur/profondeur — largeur et profondeur plafonnées
  à 10, la hauteur non), propriétés personnalisées, placement depuis
  l'inventaire par clic au sol. Un objet est soit un **bloc normal**
  (bloque le passage, peut stocker de l'argent/des objets), soit un
  **objet simple** — case « Objet simple » cochée dans l'onglet Info :
  transperçable comme un ticket, et `player.request_money()`/
  `player.request_object()` (ou un dépôt manuel via le panneau Inventaire)
  y échouent immédiatement puisqu'il ne peut rien stocker. Clic droit sur
  n'importe quel objet placé (le vôtre, ou celui d'un autre membre de
  votre salon multijoueur — voir « Multijoueur ») → menu contextuel
  **⚙️ Paramètres (fire `on_settings`) / [Inventaire — uniquement pour un
  bloc] / Déplacer / Récupérer** (voir plus bas).
- **Déplacement & placement** — cliquer sur un objet (le vôtre ou celui
  d'un autre joueur) fait marcher votre personnage jusque devant lui à
  vitesse normale avant de déclencher `on_interact` — jamais de
  téléportation instantanée. En mode placement/déplacement, l'objet
  s'affiche en transparence sous la souris et suit le curseur ; s'il
  chevaucherait un mur ou un autre bloc à cet endroit, il se teinte
  légèrement en rouge et le clic ne le pose pas.
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
  `int`/`abs`/`min`/`max`/`round`/`log`. Évènements disponibles :
  `on_create`, `on_interact(player)`, `on_tick()`, `on_destroy()`,
  `on_player_enter(player)`, `on_settings(player)` (déclenché par le
  bouton **⚙️ Paramètres** du menu contextuel — l'endroit pour une
  configuration propre à un exemplaire) et `on_walk_on(player)`
  (déclenché quand un joueur marche sur un objet simple — un bloc normal
  bloquant le passage, il ne peut jamais recevoir cet évènement). Le
  bouton **?** listant toutes les commandes vit désormais uniquement dans
  l'onglet Script (plus dans la barre du haut).
- **`object.teleport_to(player)`** — déplace le joueur (à vitesse normale,
  en marchant, jamais instantanément) jusqu'à l'emplacement de cet objet ;
  n'aboutit que si l'objet appelant est un objet simple (sans collision) —
  on ne peut pas téléporter quelqu'un sur un bloc qui bloquerait aussitôt
  son passage.
- **Boîtes de dialogue** — un script peut demander une saisie au joueur :
  `player.ask_text(question)` (champ de texte), `player.ask_choice(question,
  [options])` (sélecteur), `player.ask_yes_no(question)` (Oui/Non, retourne
  directement un booléen) et `player.ask_number(question, min, max)` (champ
  numérique borné — passez `True` en 4ᵉ argument pour l'afficher comme un
  curseur/slider à la place). Toutes (sauf `ask_yes_no`) retournent un objet
  `.accepted`/`.value`, `.accepted` étant `False` si le joueur annule.
- **Économie & transactions (P4)** — monnaie (`Coin`, 5000 au départ),
  inventaire par empilement d'instances, `player.request_money(montant)`
  ouvre une modale de confirmation ; la transaction (vérification du
  solde + débit) est atomique côté moteur — jamais de
  duplication/disparition d'argent.
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
- **Gestion d'un objet placé** — clic droit sur n'importe quel bloc placé
  (chez vous ou chez un autre membre de votre salon) ouvre un menu à
  trois entrées : **📦 Inventaire** (voir ci-dessous), **✋ Déplacer** (le
  reprendre puis cliquer un nouvel emplacement — son solde et son contenu
  suivent, rien n'est perdu) et **↩️ Récupérer**. Aucune des deux n'est
  destructrice : « Récupérer » rend le bloc lui-même à *votre* inventaire
  (à celui de qui le récupère — même si ce n'est pas son créateur
  d'origine), après y avoir d'abord reversé tout l'argent qu'il avait
  collecté (`object.get_balance()`) et tous les objets qui étaient
  stockés dedans — rien n'est jamais perdu, ni l'argent, ni les objets,
  ni le bloc.
- **📦 Inventaire d'un objet placé** — panneau dédié pour gérer
  directement le contenu de n'importe quelle machine placée, sans passer
  par un script : déposer/retirer des coins (comme pour
  `player.request_money`/`object.send_money`, mais en action directe,
  sans confirmation puisqu'un membre du salon gère un bien du salon), et
  déposer/retirer des objets un peu comme
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

## Multijoueur (début — voir spec §35 « hors périmètre solo »)

Chaque navigateur obtient une identité stable (générée une fois, stockée
dans `localStorage` séparément de la sauvegarde de monde — voir
`src/net/identity.ts`) et sa **propre maison**. Toutes les maisons d'un
même **salon** sont alignées côte à côte dans une rue ; on en sort par le
côté ouvert (sud, sans mur) pour aller chez les autres.

- **Le code de salon, tout le modèle de confiance** (`src/net/room.ts`)
  — à la première visite, chaque navigateur génère et garde son propre
  code (6 caractères, bouton **🔑** du HUD). Le donner à quelqu'un
  (bouton **Rejoindre**, ou l'entrer directement) fait rejoindre son
  salon : c'est la façon dont le serveur sait que « ces deux joueurs se
  connaissent ». Le serveur ne mélange jamais les données de deux salons
  différents — sans le code de quelqu'un, vous ne voyez ni n'affectez
  rien chez lui.
- **Visiter ET modifier** — une fois dans le même salon, il n'y a plus
  de distinction chez-soi/chez-l'autre : marcher, interagir (`on_interact`),
  mais aussi **placer, déplacer, récupérer n'importe quel bloc, et gérer
  son inventaire (dépôt/retrait d'argent ou d'objets)** fonctionnent
  aussi bien dans sa propre maison que dans celle d'un autre membre du
  salon. C'est un choix délibéré de simplicité (spec : « il est possible
  pour n'importe quel joueur de modifier la maison de quelqu'un
  d'autre ») — le code de salon est la seule barrière de confiance,
  aucune vérification de propriété par bloc une fois dedans.
- **Changer de salon** — rejoindre un autre code oublie d'abord tout ce
  que vous saviez des membres du salon précédent (`GameEngine.pruneToLocalOnly`)
  avant de se reconnecter, pour ne jamais laisser une maison périmée
  traîner à l'écran.
- **Agrandir sa maison** — bouton **🏡 Agrandir** dans le HUD : contre un
  nombre de pièces croissant (100, 160, 220…), la maison grandit de 2×2.
  Les maisons voisines (dans l'ordre d'arrivée) se décalent en
  conséquence pour ne jamais se chevaucher.
- **Ce qui se synchronise** — argent, inventaire, objets créés/publiés et
  disposition des objets dans sa maison (ou celle d'un autre membre du
  salon, désormais). Toute action qui modifie quelque chose est envoyée
  au serveur de relais, qui la retransmet au reste du salon ; à la
  connexion, votre navigateur envoie d'abord un instantané complet de ce
  qu'il sait de vous-même. Les bulles de dialogue (`player.say`) sont
  aussi relayées en direct, sans être sauvegardées.

**Comment c'est fait (`server/index.ts`, `src/net/`)** — le serveur est
volontairement « bête » : il ne fait tourner aucune logique de jeu
(aucun script, aucune règle d'économie), juste, **par salon** : (1)
attribuer une place stable dans la rue la première fois qu'il y voit un
joueur, et (2) stocker la dernière version connue de chaque entité
(joueur/maison/objet/texture/instance) et la retransmettre au reste du
salon — dernier arrivé, dernier servi, par entité, en mémoire seulement
(un redémarrage du serveur oublie tout, sans gravité puisque chaque
client renvoie sa propre part au reconnect). `GameEngine` reste la même
classe framework-agnostique : chaque navigateur fait tourner sa **propre
copie complète** du moteur (tous les joueurs, toutes les maisons de son
salon) et applique lui-même les scripts qu'il déclenche ; rien ne
s'exécute côté serveur. C'est un raccourci délibéré de prototype —
comme le rappelle la demande d'origine, une vraie architecture réseau
demandera un serveur qui simule réellement le monde et fait autorité sur
les scripts (surtout les actions sensibles comme `object.give_item`/
`spawn`), avec une vraie base de données à la place des `Map` en mémoire
du relais actuel. Pour l'instant, un client mal intentionné pourrait en
théorie envoyer un instantané mensonger, ou rejoindre le salon de
n'importe qui en devinant/volant son code — il n'y a pas encore de
validation autoritaire côté serveur, et plus aucune vérification de
propriété par bloc côté moteur non plus (voir ci-dessus).

## Architecture

```
server/          relais multijoueur (Node + ws) — voir "Multijoueur"
src/
  net/           protocole réseau (protocol.ts), identité locale
                 persistante (identity.ts), client WebSocket
                 (multiplayer.ts) — partagé par le client et server/
  script-lang/   lexer, parser, interpreter — langage indépendant du jeu
  engine/        GameEngine (Object/Inventory/Economy/Transaction/
                 Permission managers), houseLayout.ts (calcul pur des
                 positions des maisons, partagé moteur/rendu), types du
                 modèle de données, API de script, persistance
                 (SaveManager)
  data/store.ts  pont zustand : re-render React quand GameEngine.notify(),
                 démarre la connexion multijoueur
  world/         rendu 3D (react-three-fiber) : caméra, maisons (plusieurs,
                 côte à côte), joueur local + joueurs distants, instances
                 d'objets, textures
  ui/            Object Creator, éditeur pixel art, inventaire, HUD,
                 modale de transaction, console de debug
```

`GameEngine` ne dépend d'aucune API DOM/React : c'est une classe
framework-agnostique qui expose `subscribe()` pour toute notification de
changement, et suit désormais aussi (`markDirty`/`consumeDirty`) quelles
entités ont changé localement pour la synchronisation réseau — sans rien
savoir du transport (WebSocket, etc.), le même découplage que
`LocalStorageSaveManager` pour la sauvegarde. C'est ce découplage qui
permettra, pour une vraie version multijoueur, de faire tourner cette
même classe côté serveur (autoritaire cette fois) sans réécrire la
logique de jeu, les managers ou le langage de script.
`ObjectDefinition` (le modèle publié par un créateur) et `ObjectInstance`
(un exemplaire possédé/placé) sont déjà distincts (spec §16), ce qui est
la base nécessaire à l'échange/vente/don d'objets plus tard.

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
10. Multijoueur (deux contextes de navigateur, deux identités, serveur de
    relais lancé, chacune dans son propre salon par défaut) : avant de
    partager leur code, les deux sessions affichent bien 0 joueur en
    ligne malgré le serveur actif (salons différents = isolation totale).
    Après que la seconde rejoint le code de la première (bouton 🔑 →
    Rejoindre), le second joueur apparaît dans sa propre maison, séparée
    de celle du premier par la rue ; le premier peut marcher jusque chez
    le second (visible en direct, avatar + nom) ; placer un objet
    directement dans la maison de l'autre depuis son propre inventaire
    réussit (plus de restriction chez-soi/chez-l'autre), et faire un
    clic droit dessus depuis l'écran de l'autre joueur ouvre le menu
    complet (Paramètres/Inventaire/Déplacer/Récupérer) — « Récupérer »
    transfère bien l'objet dans l'inventaire de celui qui l'a récupéré,
    pas de son créateur d'origine ; l'indicateur de présence du HUD
    affiche le bon nombre de joueurs en ligne des deux côtés.
11. Agrandissement : cliquer **🏡 Agrandir** débite le coût affiché
    (croissant à chaque fois : 100, 160, 220…), la maison grandit
    visiblement de 2×2, et le bouton se désactive dès que le solde du
    joueur devient insuffisant pour le prochain palier (jamais de solde
    négatif).
12. Marcher avant d'interagir : objet placé loin du joueur avec
    `on_interact` qui dit "Salut !" → clic dessus → le personnage marche
    (capture d'écran à mi-chemin) puis la bulle n'apparaît qu'environ
    700ms plus tard, jamais instantanément.
13. `object.teleport_to()` : sur un bloc normal (collision cochée), un
    script l'appelant échoue immédiatement avec « ne fonctionne que sur un
    objet simple » (visible dans la console de debug via **Tester**) ; sur
    un objet simple placé, aucune erreur.
14. `on_settings`/`on_walk_on` : clic droit sur un objet simple placé →
    **⚙️ Paramètres** → la bulle "Config !" de son `on_settings` apparaît ;
    marcher dessus au clavier (sans jamais cliquer) déclenche également sa
    bulle "Marche !" via `on_walk_on`.
15. Plafond de dimensions : entrer 15 dans le champ largeur de l'Object
    Creator → ramené à 10 automatiquement.
16. Aperçu de placement : en mode placement, l'objet suit la souris en
    transparence ; le faire chevaucher un bloc déjà posé le teinte
    visiblement en rouge et le clic à cet endroit ne pose rien (le mode
    placement reste actif) ; un peu plus loin, où il ne chevauche plus
    rien, le clic pose bien l'objet.

## Volontairement non traité dans ce prototype (voir spec §35)

Ce qui reste hors périmètre même avec ce premier niveau de multijoueur :
un vrai serveur qui simule le monde et fait autorité sur les scripts (le
relais actuel ne fait que stocker/retransmettre ce que chaque client lui
envoie — voir « Multijoueur »), la persistance du monde partagé au-delà
de la durée de vie du process serveur, toute résolution de conflit plus
fine que « dernier arrivé, dernier servi » par entité, un chat entre
joueurs, marketplace, échange/vente entre joueurs, modération,
copier/coller et sélection dans l'éditeur de texture, animations
avancées (`object.play_animation` est fonctionnel comme *hook* mais ne
joue pas encore d'animation visuelle), persistance des brouillons
d'objets non publiés en cas de rechargement pendant l'édition, migration
automatique d'anciennes sauvegardes `localStorage` d'avant l'introduction
de la bibliothèque de textures nommées (une sauvegarde très ancienne peut
afficher des objets sans texture — dans ce cas, republier l'objet ou
vider `localStorage`).
