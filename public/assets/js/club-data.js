/* =====================================================================
   PACIFIC BLUFFS — Données partagées (vitrine + espace staff)
   Carte par défaut : utilisée tant que la direction n'a pas modifié la
   carte depuis l'espace staff (onglet « La carte »).
   Les identifiants des articles restent stables : la comptabilité s'en
   sert pour le détail des ventes du bar.
   ===================================================================== */
window.CLUB = {
  NOM: 'Pacific Bluffs',
  OUVERTURE: '23:00',

  MENU_CATEGORIES: ['Plats', 'Desserts', 'Cocktails', 'Mocktails', 'Vins & Champagne', 'Menus'],
  MENU_ICONS: { 'Plats': '🍽️', 'Desserts': '🍰', 'Cocktails': '🍸', 'Mocktails': '🍹', 'Vins & Champagne': '🍷', 'Menus': '🥂' },

  /* Carte du 09/11/2026 : nom + drapeau (affiché à côté du nom), sans description.
     Prix provisoires, à ajuster par la direction dans l'onglet « La carte ». */
  MENU: [
    { id: 'p_curry_indes',       categorie: 'Plats',     nom: 'Curry végétarien des Indes', drapeau: '🇮🇳', prix: 65, emoji: '🍛', hue: 38,  desc: '' },
    { id: 'p_pasta_casa',        categorie: 'Plats',     nom: 'Pasta della Casa',           drapeau: '🇮🇹', prix: 65, emoji: '🍝', hue: 8,   desc: '' },
    { id: 'p_porc_imperial',     categorie: 'Plats',     nom: 'Porc impérial aigre-doux',   drapeau: '🇨🇳', prix: 65, emoji: '🥡', hue: 355, desc: '' },
    { id: 'p_ceviche_peru',      categorie: 'Plats',     nom: 'Ceviche del Perú',           drapeau: '🇵🇪', prix: 65, emoji: '🐟', hue: 185, desc: '' },
    { id: 'd_boston_cream_pie',  categorie: 'Desserts',  nom: 'Boston Cream Pie',           drapeau: '🇺🇸', prix: 60, emoji: '🥧', hue: 30,  desc: '' },
    { id: 'd_risalamande',       categorie: 'Desserts',  nom: 'Risalamande',                drapeau: '🇩🇰', prix: 60, emoji: '🍚', hue: 350, desc: '' },
    { id: 'd_creme_brulee',      categorie: 'Desserts',  nom: 'Crème brûlée',               drapeau: '🇫🇷', prix: 60, emoji: '🍮', hue: 42,  desc: '' },
    { id: 'd_tiramisu',          categorie: 'Desserts',  nom: 'Tiramisu',                   drapeau: '🇮🇹', prix: 60, emoji: '🍰', hue: 22,  desc: '' },
    { id: 'c_havana_tropical',   categorie: 'Cocktails', nom: 'Havana Tropical',            drapeau: '🇨🇺', prix: 50, emoji: '🍹', hue: 95,  desc: '' },
    { id: 'c_highland_apple',    categorie: 'Cocktails', nom: 'Highland Apple',             drapeau: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', prix: 50, emoji: '🥃', hue: 75,  desc: '' },
    { id: 'c_mexican_sunrise',   categorie: 'Cocktails', nom: 'Mexican Sunrise',            drapeau: '🇲🇽', prix: 50, emoji: '🌅', hue: 16,  desc: '' },
    { id: 'c_tokyo_garden',      categorie: 'Cocktails', nom: 'Tokyo Garden',               drapeau: '🇯🇵', prix: 50, emoji: '🍸', hue: 150, desc: '' },
    { id: 'k_rio_tropical',      categorie: 'Mocktails', nom: 'Rio Tropical',               drapeau: '🇧🇷', prix: 45, emoji: '🍍', hue: 48,  desc: '' },
    { id: 'k_bangkok_dream',     categorie: 'Mocktails', nom: 'Bangkok Dream',              drapeau: '🇹🇭', prix: 45, emoji: '🌺', hue: 320, desc: '' },
    { id: 'k_jonas_pink_delight', categorie: 'Mocktails', nom: 'Jonas Pink Delight',        drapeau: '❤️🌹', prix: 45, emoji: '🍓', hue: 345, desc: '' },
    { id: 'k_emy_blue_dream',    categorie: 'Mocktails', nom: 'Emy Blue Dream',             drapeau: '💙🦋', prix: 45, emoji: '🦋', hue: 205, desc: '' },
    { id: 'a_vin_rouge',         categorie: 'Vins & Champagne', nom: 'Vin rouge',           drapeau: '', prix: 60, emoji: '🍷', hue: 345, desc: '' },
    { id: 'a_vin_blanc',         categorie: 'Vins & Champagne', nom: 'Vin blanc',           drapeau: '', prix: 60, emoji: '🥂', hue: 50,  desc: '' },
    { id: 'a_champagne',         categorie: 'Vins & Champagne', nom: 'Champagne',           drapeau: '🇫🇷', prix: 120, emoji: '🍾', hue: 44, desc: '' },
    { id: 'm_decouverte',        categorie: 'Menus',     nom: 'Menu découverte',            prix: 100, emoji: '🥂', hue: 25,  desc: 'Un moyen idéal pour découvrir les saveurs signatures du Pacific Bluffs.',
      compo: [{ label: 'Mocktail', value: '1 au choix' }, { label: 'Plat principal', value: '1 au choix' }] },
    { id: 'm_gourmet',           categorie: 'Menus',     nom: 'Menu gourmet',               prix: 200, emoji: '🍾', hue: 330, desc: 'Une expérience complète composée selon vos envies.',
      compo: [{ label: 'Mocktails', value: '3 au choix' }, { label: 'Plat principal', value: '1 au choix' }, { label: 'Dessert', value: '1 au choix' }] },
    { id: 'm_prestige',          categorie: 'Menus',     nom: 'Menu prestige',              prix: 350, emoji: '🌴', hue: 280, desc: "L'expérience gastronomique ultime du Pacific Bluffs.",
      compo: [{ label: 'Mocktails', value: '5 au choix' }, { label: 'Plats principaux', value: '2 au choix' }, { label: 'Dessert', value: '1 au choix' }] },
  ],

  /* Part de l'employé sur chacune de ses ventes (onglet Ventes) : c'est son salaire de la semaine */
  COMMISSION_VENTES: 0.25,
  /* Suggestions de la fiche hospitalité (le prix se tape à chaque vente) */
  HOSPITALITE: {
    'Entrée': ['Entrée soirée', 'Entrée soirée à thème', 'Entrée grand événement', 'Entrée groupe'],
    'Hébergement': ['Nuit — chambre', 'Nuit — suite vue mer', 'Nuit — bungalow sur la plage', 'Week-end au resort'],
  },

  /* Tarifs hebdomadaires des cartes membres (comptabilité) — les mêmes sont repris côté serveur (api.mjs, CARD_PRICES) */
  MEMBERSHIP_PRICES: { Green: 1000, Gold: 2000, Platinum: 4000 },

  /* Avantages des cartes membres */
  MEMBERSHIP: [
    { key: 'Green', cls: 'green', prix: 1000, acces: 'Accès espace public', perks: [
      'Entrée gratuite soirées standard',
      "File prioritaire à l'entrée",
      'Réduction 25 % soirées à thème',
      'Réduction 10 % sur la carte bar',
      'Invitations événements membres',
    ] },
    { key: 'Gold', cls: 'gold', prix: 2000, acces: 'Accès espace VIP inclus', perks: [
      'Tous les avantages Green inclus',
      'Entrée gratuite toutes soirées',
      'Accès VIP garanti sans réservation',
      'Réduction 20 % service bouteille',
      'Réduction 25 % carte bar',
      'Invitations soirées fermées',
      'Contact direct avec la direction',
    ] },
    { key: 'Platinum', cls: 'plat', prix: 4000, acces: 'Accès VIP+ et casino — validation requise', perks: [
      'Tous les avantages Gold inclus',
      'Accès VIP+ permanent',
      'Accès casino privé inclus',
      'Service bouteille offert 1×/semaine',
      'Hostess personnelle dédiée',
      'Invitations beach parties prioritaires',
      'Ligne directe avec le patron',
      'Service limousine à domicile avec champagne',
    ] },
  ],

  /* Direction affichée sur l'accueil — À REMPLACER par les vrais noms (nom, rôle, initiales) */
  DIRECTION: [
    { nom: 'Nom du patron', role: 'Patron', initiales: 'PB', hue: 22 },
    { nom: 'Nom du co-patron', role: 'Co-patron', initiales: 'PB', hue: 320 },
  ],

  /* Types d'événements proposés dans la demande de privatisation */
  PRIVATISATION_TYPES: ['Anniversaire', "Soirée d'entreprise", 'Contrat professionnel', 'Soirée privée', 'Autre'],

  /* Articles de l'ancienne carte par défaut (avant le 09/11/2026) */
  ANCIENS_ARTICLES: ['p_sunset_bretzel', 'p_coco_rings', 'p_guaca_beach', 'p_bluffs_burger', 's_lagoon_fresh', 's_limonade_maison', 's_cola_glace',
    's_sunset_fizz', 'c_pacific_sour', 'c_spritz_sunset', 'c_coco_night', 'c_peche_paradise', 'd_churros_plage', 'd_gaufre_tropicale',
    'v_decouverte', 'v_gourmet', 'v_prestige'],
};
/* Site déjà en ligne : la carte enregistrée contient encore l'ancienne carte par défaut.
   On retire ses articles et on ajoute ceux de la nouvelle ; les articles ajoutés par la direction restent.
   Renvoie la même liste si elle est déjà à jour. */
CLUB.upgradeMenu = function (menu) {
  if (!Array.isArray(menu) || !menu.some((m) => m && CLUB.ANCIENS_ARTICLES.includes(m.id))) return menu;
  const kept = menu.filter((m) => m && !CLUB.ANCIENS_ARTICLES.includes(m.id));
  const ids = new Set(kept.map((m) => m.id));
  return kept.concat(CLUB.MENU.filter((m) => !ids.has(m.id)).map((m) => JSON.parse(JSON.stringify(m))));
};
