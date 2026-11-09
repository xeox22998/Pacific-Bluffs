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

  MENU_CATEGORIES: ['Plats', 'Softs', 'Cocktails', 'Desserts', 'Menus'],
  MENU_ICONS: { 'Plats': '🍔', 'Softs': '🥤', 'Cocktails': '🍹', 'Desserts': '🍰', 'Menus': '🥂' },

  MENU: [
    { id: 'p_sunset_bretzel',  categorie: 'Plats',     nom: 'Sunset Bretzel',      prix: 65, emoji: '🥨', hue: 28,  desc: 'Bretzel chaud, sauce cheddar fondu, fleur de sel' },
    { id: 'p_coco_rings',      categorie: 'Plats',     nom: 'Coco Rings',          prix: 60, emoji: '🧅', hue: 40,  desc: 'Oignons rings croustillants, sauce smoky maison' },
    { id: 'p_guaca_beach',     categorie: 'Plats',     nom: 'Guaca Beach',         prix: 65, emoji: '🥑', hue: 95,  desc: 'Chips artisanales assaisonnées, dip guacamole frais' },
    { id: 'p_bluffs_burger',   categorie: 'Plats',     nom: 'Bluffs Burger',       prix: 70, emoji: '🍔', hue: 18,  desc: 'Pain burger, steak grillé, cheddar, salade, tomates, sauce maison' },
    { id: 's_lagoon_fresh',    categorie: 'Softs',     nom: 'Lagoon Fresh',        prix: 50, emoji: '🧊', hue: 180, desc: 'Eau pétillante, sirop de concombre, citron vert, menthe' },
    { id: 's_limonade_maison', categorie: 'Softs',     nom: 'Limonade Maison',     prix: 45, emoji: '🍋', hue: 52,  desc: "Citrons frais pressés, sucre de canne, zeste d'orange" },
    { id: 's_cola_glace',      categorie: 'Softs',     nom: 'Cola Glacé',          prix: 40, emoji: '🥤', hue: 350, desc: 'Cola, glaçons, rondelle de citron vert' },
    { id: 's_sunset_fizz',     categorie: 'Softs',     nom: 'Sunset Fizz',         prix: 50, emoji: '🧃', hue: 330, desc: 'Eau pétillante, sirop de litchi, fruit de la passion, hibiscus, glaçons' },
    { id: 'c_pacific_sour',    categorie: 'Cocktails', nom: 'Pacific Sour',        prix: 45, emoji: '🍸', hue: 190, desc: "Whisky, citron frais, sirop de sucre, blanc d'œuf" },
    { id: 'c_spritz_sunset',   categorie: 'Cocktails', nom: 'Spritz Sunset',       prix: 40, emoji: '🍹', hue: 22,  desc: "Aperol, Prosecco, eau gazeuse, tranche d'orange" },
    { id: 'c_coco_night',      categorie: 'Cocktails', nom: 'Coco Night',          prix: 50, emoji: '🥥', hue: 275, desc: 'Rhum ambré, liqueur de café, crème de cacao, glaçons' },
    { id: 'c_peche_paradise',  categorie: 'Cocktails', nom: 'Pêche Paradise',      prix: 50, emoji: '🍑', hue: 15,  desc: 'Gin, liqueur de pêche, citron, miel, eau pétillante, glaçons' },
    { id: 'd_churros_plage',   categorie: 'Desserts',  nom: 'Churros de la Plage', prix: 60, emoji: '🍫', hue: 25,  desc: 'Churros dorés, sucre cannelle, sauce chocolat noir' },
    { id: 'd_gaufre_tropicale', categorie: 'Desserts', nom: 'Gaufre Tropicale',    prix: 60, emoji: '🧇', hue: 340, desc: 'Gaufre croustillante, chantilly maison, coulis fruits rouges' },
    { id: 'v_decouverte',      categorie: 'Menus',     nom: 'Menu découverte',     prix: 100, emoji: '🥂', hue: 25, desc: 'Un moyen idéal pour découvrir les saveurs signatures du Pacific Bluffs.',
      compo: [{ label: 'Soft', value: 'Sunset Fizz' }, { label: 'Plat principal', value: 'Bluffs Burger' }] },
    { id: 'v_gourmet',         categorie: 'Menus',     nom: 'Menu gourmet',        prix: 200, emoji: '🍾', hue: 330, desc: 'Une expérience complète composée selon vos envies.',
      compo: [{ label: 'Softs', value: '3 au choix' }, { label: 'Plat principal', value: '1 au choix' }, { label: 'Desserts', value: '1 au choix' }] },
    { id: 'v_prestige',        categorie: 'Menus',     nom: 'Menu prestige',       prix: 350, emoji: '🌴', hue: 280, desc: "L'expérience gastronomique ultime du Pacific Bluffs.",
      compo: [{ label: 'Softs', value: '5 au choix' }, { label: 'Plats principaux', value: '2 au choix' }, { label: 'Desserts', value: '1 au choix' }] },
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
};
