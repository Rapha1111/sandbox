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
    description: "Donne une nouvelle instance de l'objet publié \"nom_objet\" au joueur, validé par le moteur.",
    kind: "sensitive",
    example: 'object.give_item(player, "Ticket")',
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
  { group: "builtins", signature: "abs(n) / min(...) / max(...) / round(n)", description: "Fonctions numériques usuelles." },
  { group: "builtins", signature: "log(...)", description: "Écrit un message dans la console de debug (utile pour déboguer un script)." },
];
