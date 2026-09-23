/**
 * Central, human-readable list of every whitelisted API surface a script can
 * call — the actual whitelist lives in scriptApi.ts/permissions.ts, this is
 * its documentation (spec §26 "documentation de l'API"), shown by the "?"
 * button in the script editor.
 */
export type ApiGroup = "events" | "player" | "object" | "builtins";

export interface ApiEntry {
  group: ApiGroup;
  signature: string;
  description: string;
  example?: string;
  kind?: "local" | "sensitive";
}

export const API_GROUP_LABEL: Record<ApiGroup, string> = {
  events: "Évènements",
  player: "player.*",
  object: "object.*",
  builtins: "Fonctions intégrées",
};

export const API_REFERENCE: ApiEntry[] = [
  // --- Events (spec §10) ---
  {
    group: "events",
    signature: "def on_create():",
    description: "Appelé une fois, quand une instance de l'objet est créée (publication, don, object.spawn).",
  },
  {
    group: "events",
    signature: "def on_interact(player):",
    description: "Appelé quand un joueur clique sur l'objet.",
    example: 'def on_interact(player):\n    player.say("Bonjour !")',
  },
  {
    group: "events",
    signature: "def on_tick():",
    description: "Appelé périodiquement (toutes les ~3 secondes) tant que l'objet est placé dans un lieu.",
  },
  {
    group: "events",
    signature: "def on_destroy():",
    description: "Appelé juste avant que l'instance ne soit définitivement supprimée.",
  },
  {
    group: "events",
    signature: "def on_player_enter(player):",
    description: "Appelé pour chaque objet placé quand un joueur entre dans le lieu.",
  },

  // --- player.* ---
  {
    group: "player",
    signature: "player.say(texte)",
    description: "Affiche une bulle de dialogue au-dessus de l'objet et l'ajoute à la console de debug.",
    kind: "local",
    example: 'player.say("Merci !")',
  },
  {
    group: "player",
    signature: "player.get_money()",
    description: "Retourne le solde actuel du joueur (lecture seule).",
    kind: "local",
  },
  {
    group: "player",
    signature: "player.get_name()",
    description: "Retourne le nom du joueur.",
    kind: "local",
  },
  {
    group: "player",
    signature: "player.get_id()",
    description: "Retourne l'identifiant unique du joueur — utile pour object.send_money(id, montant).",
    kind: "local",
  },
  {
    group: "player",
    signature: "player.request_money(montant)",
    description:
      "Ouvre une demande de paiement que le joueur doit accepter ou refuser. Retourne un objet avec .accepted (booléen) et .reason. Si accepté, le montant est débité du joueur et crédité sur le solde de l'objet (object.get_balance()).",
    kind: "sensitive",
    example: 'transaction = player.request_money(100)\nif transaction.accepted:\n    player.say("Merci !")',
  },
  {
    group: "player",
    signature: "player.request_object(nom_objet)",
    description:
      "Symétrique de request_money, mais pour un objet : demande au joueur de céder un exemplaire de \"nom_objet\" depuis son inventaire. Si accepté, l'exemplaire est retiré du joueur et stocké dans l'inventaire de cette machine (récupérable ensuite avec object.give_item()). Échoue si le joueur ne possède pas cet objet.",
    kind: "sensitive",
    example: 'demande = player.request_object("Ticket")\nif demande.accepted:\n    player.say("Merci pour le ticket !")',
  },
  {
    group: "player",
    signature: "player.ask_text(question)",
    description:
      "Ouvre une boîte de dialogue avec un champ de texte libre. Retourne un objet avec .accepted (booléen, False si le joueur annule) et .value (le texte saisi).",
    kind: "local",
    example: 'reponse = player.ask_text("Quel est votre nom ?")\nif reponse.accepted:\n    player.say("Bonjour " + reponse.value)',
  },
  {
    group: "player",
    signature: "player.ask_choice(question, [options])",
    description: "Ouvre une boîte de dialogue avec un sélecteur (menu déroulant) parmi une liste d'options. Retourne .accepted et .value (l'option choisie).",
    kind: "local",
    example: 'reponse = player.ask_choice("Quelle couleur ?", ["Rouge", "Vert", "Bleu"])\nif reponse.accepted:\n    object.set_texture(reponse.value)',
  },
  {
    group: "player",
    signature: "player.ask_yes_no(question)",
    description: "Ouvre une boîte de dialogue Oui/Non et retourne directement un booléen (pas d'objet .accepted à déballer).",
    kind: "local",
    example: 'if player.ask_yes_no("Voulez-vous continuer ?"):\n    player.say("Suite !")',
  },
  {
    group: "player",
    signature: "player.ask_number(question, min, max)",
    description:
      "Ouvre une boîte de dialogue avec un champ numérique borné entre min et max (la valeur retournée est toujours ramenée dans cet intervalle). Retourne .accepted et .value.",
    kind: "local",
    example: 'reponse = player.ask_number("Combien de tickets ?", 1, 10)\nif reponse.accepted:\n    n = reponse.value',
  },
  {
    group: "player",
    signature: "player.ask_number(question, min, max, True)",
    description: "Même chose, mais affichée comme un curseur (slider) au lieu d'un champ numérique — passez True en 4e argument.",
    kind: "local",
    example: 'reponse = player.ask_number("Volume", 0, 100, True)',
  },

  // --- object.* ---
  {
    group: "object",
    signature: 'object.set_texture(nom)',
    description:
      'Change l\'apparence pour la texture "nom" de la bibliothèque de cet objet (haut + avant, les côtés copiant l\'avant). "bottom" n\'a jamais de texture.',
    kind: "local",
    example: 'object.set_texture("actif")',
  },
  {
    group: "object",
    signature: 'object.set_texture(face, nom)',
    description:
      'Change uniquement "top" ou "front" — un objet ne se peint que sur ces deux faces : "bottom" n\'a jamais de texture, et "back"/"left"/"right" copient toujours "front" automatiquement.',
    kind: "local",
    example: 'object.set_texture("front", "ouvert")',
  },
  {
    group: "object",
    signature: "object.get_texture()",
    description: 'Retourne le nom de la texture actuellement forcée sur toutes les faces (ou None si aucune).',
    kind: "local",
  },
  {
    group: "object",
    signature: "object.get_texture(face)",
    description:
      'Retourne le nom de la texture actuellement affichée sur cette face ("top"/"bottom"/"front"/"back"/"left"/"right" — "bottom" retourne toujours None, et "back"/"left"/"right" retournent la texture de "front").',
    kind: "local",
    example: 'if object.get_texture() == "actif":\n    object.set_texture("défaut")',
  },
  {
    group: "object",
    signature: "object.play_animation(nom)",
    description: "Déclenche une animation nommée sur l'objet (hook disponible pour vos propres effets visuels).",
    kind: "local",
  },
  {
    group: "object",
    signature: "object.get_state(clé)",
    description: "Lit une valeur stockée sur cette instance précise (mémoire propre à cet exemplaire).",
    kind: "local",
  },
  {
    group: "object",
    signature: "object.set_state(clé, valeur)",
    description: "Écrit une valeur (texte, nombre ou booléen) sur cette instance.",
    kind: "local",
    example: 'object.set_state("compteur", 1)',
  },
  {
    group: "object",
    signature: "object.get_property(clé)",
    description: "Lit une propriété personnalisée définie dans l'onglet Info de l'objet (partagée par toutes les instances).",
    kind: "local",
  },
  {
    group: "object",
    signature: "object.give_item(player, nom_objet)",
    description:
      "Donne \"nom_objet\" au joueur. Priorité à un exemplaire déjà en stock dans l'inventaire de cette machine (déposé via player.request_object()) ; s'il n'y en a pas, un nouvel exemplaire n'est fabriqué que si le créateur de cette machine est aussi le créateur de \"nom_objet\" — on ne peut pas distribuer à l'infini la création de quelqu'un d'autre sans l'avoir réellement en stock.",
    kind: "sensitive",
    example: 'object.give_item(player, "Ticket")',
  },
  {
    group: "object",
    signature: "object.get_id()",
    description: "Retourne l'identifiant unique de cette instance précise (utile pour la reconnaître, la journaliser, ou la cibler).",
    kind: "local",
  },
  {
    group: "object",
    signature: "object.spawn(nom_objet)",
    description: "Fait apparaître une nouvelle instance de \"nom_objet\" à côté de cet objet, dans le même lieu.",
    kind: "sensitive",
  },
  {
    group: "object",
    signature: "object.get_balance()",
    description: "Retourne le solde en coins que cet objet a collecté (via des player.request_money() acceptés).",
    kind: "local",
  },
  {
    group: "object",
    signature: "object.send_money(id_joueur, montant)",
    description:
      "Envoie des coins depuis le solde de l'objet vers n'importe quel joueur (par son identifiant). Échoue si l'objet n'a pas assez de solde ou si le joueur est introuvable.",
    kind: "sensitive",
    example: 'object.send_money(player.get_id(), object.get_balance())',
  },

  // --- builtins ---
  { group: "builtins", signature: "range(n) / range(a, b) / range(a, b, pas)", description: "Génère une liste de nombres, comme en Python." },
  { group: "builtins", signature: "len(texte_ou_liste)", description: "Longueur d'une chaîne ou d'une liste." },
  { group: "builtins", signature: "str(valeur)", description: "Convertit en texte." },
  { group: "builtins", signature: "int(valeur)", description: "Convertit en nombre entier." },
  { group: "builtins", signature: "abs(n) / min(...) / max(...) / round(n) / floor(n) / ceil(n)", description: "Fonctions numériques usuelles." },
  {
    group: "builtins",
    signature: "time()",
    description: "Secondes écoulées depuis 1970 (comme time.time() en Python). Pratique pour des minuteries/cooldowns : stockez time() dans l'état de l'objet, puis comparez plus tard dans on_tick.",
    example: 'if object.get_state("pret_a") == None or time() >= object.get_state("pret_a"):\n    object.set_state("pret_a", time() + 5)',
  },
  { group: "builtins", signature: "randint(a, b)", description: "Entier aléatoire entre a et b inclus (comme random.randint en Python)." },
  { group: "builtins", signature: "random()", description: "Nombre décimal aléatoire entre 0 (inclus) et 1 (exclu)." },
  { group: "builtins", signature: "choice(liste)", description: "Choisit un élément au hasard dans une liste non vide.", example: 'gain = choice(["rien", "10 coins", "un ticket"])' },
  { group: "builtins", signature: "log(...)", description: "Écrit un message dans la console de debug (utile pour déboguer un script)." },
];
