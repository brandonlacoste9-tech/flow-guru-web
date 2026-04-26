export type Language = 'en' | 'fr';

export const translations = {
  en: {
    // Header & General
    nav_dashboard: "Dashboard",
    nav_calendar: "Calendar",
    nav_lists: "Lists",
    nav_settings: "Settings",
    nav_sign_out: "Sign out",
    nav_sign_in: "Sign in",
    
    // Assistant
    assistant_greeting: "How can I help you today?",
    assistant_name: "FLO GURU",
    assistant_status_listening: "Listening...",
    assistant_status_speaking: "Speaking...",
    assistant_status_thinking: "Thinking...",
    
    // Dashboard Cards
    card_weather_title: "Weather",
    card_weather_detect: "Detect Location",
    card_weather_sync: "Tap to sync local weather",
    card_weather_forecast: "Tap for forecast",
    card_calendar_title: "Schedule",
    card_calendar_today: "Today",
    card_calendar_clear: "Schedule is clear.",
    card_calendar_no_events: "No events today",
    card_calendar_open_google: "Open Google",
    card_calendar_open: "Open",
    card_news_title: "Briefing",
    card_news_desc: "Latest news brief",
    card_news_tap: "Tap to read",
    card_lists_title: "My Lists",
    card_lists_empty: "No active lists",
    card_radio_title: "Music",

    // Settings
    settings_title: "AI Settings",
    settings_desc: "Train and personalise your assistant",
    settings_tab_profile: "Profile",
    settings_tab_memory: "Memory",
    settings_tab_persona: "Persona",
    settings_tab_instructions: "Instructions",
    settings_tab_integrations: "Integrations",
    settings_tab_referral: "Referral",
    settings_profile_title: "Personal Profile",
    settings_profile_desc: "Tell your assistant about yourself so it can give better, more personalised responses.",
    settings_profile_wakeup: "Wake-up Time",
    settings_profile_routine: "Daily Routine",
    settings_profile_routine_placeholder: "e.g. I wake up at 6am, work out, then start work at 9am...",
    settings_profile_prefs: "Preferences & Interests",
    settings_profile_prefs_placeholder: "e.g. I love hip-hop, tech, fitness. I prefer concise answers...",
    settings_profile_alarm: "Alarm Sound",
    settings_profile_test_sound: "Test Sound",
    settings_profile_alarm_days: "Alarm Days",
    settings_profile_save: "Save Profile",
    settings_profile_saving: "Saving...",
    settings_profile_language: "Interface Language",
    
    // Suggestions
    suggest_calendar: "What's on my calendar today?",
    suggest_weather: "What's the weather?",
    suggest_briefing: "Give me a news briefing",
    
    // Auth & Onboarding
    auth_title: "Welcome Back",
    auth_sign_in: "Sign In",
    auth_sign_up: "Sign Up",
    
    // Music Player
    music_playing: "Live",
    music_radio_desc: "free internet radio",
  },
  fr: {
    // Header & General
    nav_dashboard: "Tableau de bord",
    nav_calendar: "Calendrier",
    nav_lists: "Listes",
    nav_settings: "Paramètres",
    nav_sign_out: "Déconnexion",
    nav_sign_in: "Connexion",
    
    // Assistant
    assistant_greeting: "Comment puis-je vous aider aujourd'hui ?",
    assistant_name: "FLO GURU",
    assistant_status_listening: "J'écoute...",
    assistant_status_speaking: "Je parle...",
    assistant_status_thinking: "Je réfléchis...",
    
    // Dashboard Cards
    card_weather_title: "Météo",
    card_weather_detect: "Détecter la position",
    card_weather_sync: "Appuyez pour synchroniser la météo locale",
    card_weather_forecast: "Appuyez pour les prévisions",
    card_calendar_title: "Emploi du temps",
    card_calendar_today: "Aujourd'hui",
    card_calendar_clear: "L'emploi du temps est libre.",
    card_calendar_no_events: "Aucun événement aujourd'hui",
    card_calendar_open_google: "Ouvrir Google",
    card_calendar_open: "Ouvrir",
    card_news_title: "Briefing",
    card_news_desc: "Dernier briefing d'actualités",
    card_news_tap: "Appuyez pour lire",
    card_lists_title: "Mes Listes",
    card_lists_empty: "Aucune liste active",
    card_radio_title: "Musique",

    // Settings
    settings_title: "Paramètres IA",
    settings_desc: "Entraînez et personnalisez votre assistant",
    settings_tab_profile: "Profil",
    settings_tab_memory: "Mémoire",
    settings_tab_persona: "Persona",
    settings_tab_instructions: "Instructions",
    settings_tab_integrations: "Intégrations",
    settings_tab_referral: "Parrainage",
    settings_profile_title: "Profil Personnel",
    settings_profile_desc: "Parlez de vous à votre assistant pour qu'il puisse donner des réponses plus personnalisées.",
    settings_profile_wakeup: "Heure de réveil",
    settings_profile_routine: "Routine Quotidienne",
    settings_profile_routine_placeholder: "ex: Je me réveille à 6h, je fais du sport, puis je commence le travail à 9h...",
    settings_profile_prefs: "Préférences & Intérêts",
    settings_profile_prefs_placeholder: "ex: J'aime le hip-hop, la tech, le fitness. Je préfère les réponses concises...",
    settings_profile_alarm: "Son de l'alarme",
    settings_profile_test_sound: "Tester le son",
    settings_profile_alarm_days: "Jours de l'alarme",
    settings_profile_save: "Enregistrer le profil",
    settings_profile_saving: "Enregistrement...",
    settings_profile_language: "Langue de l'interface",
    
    // Suggestions
    suggest_calendar: "Quoi de neuf sur mon calendrier aujourd'hui ?",
    suggest_weather: "Quelle est la météo ?",
    suggest_briefing: "Donne-moi un briefing d'actualités",
    
    // Auth & Onboarding
    auth_title: "Bon retour",
    auth_sign_in: "Se connecter",
    auth_sign_up: "S'inscrire",
    
    // Music Player
    music_playing: "En direct",
    music_radio_desc: "radio internet gratuite",
  }
};

export type TranslationKeys = keyof typeof translations.en;
