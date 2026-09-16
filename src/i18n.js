/**
 * PureTidings Desktop - Internationalization (i18n) Module
 * Supports: English (en), German (de), Spanish (es), French (fr)
 */
(function () {
    const translations = {
        en: {
            // Sidebar navigation
            nav_all: "All Posts",
            nav_unread: "Unread Posts",
            nav_favorites: "Favorites",
            nav_keywords: "Keyword Matches",
            nav_summary: "Summary Cart",
            btn_quick_add_feed: "➕ Add / Subscribe Feed",
            btn_quick_summarize: "🤖 AI Summarize URL",
            search_placeholder: "Search... (+ AND, , OR, - NOT)",
            search_title: "Example: Apple +Macbook -iPhone",
            tooltip_quick_add_feed: "Subscribe to any website or feed",
            tooltip_quick_summarize: "Summarize any web page or video with AI",
            tooltip_settings: "Settings",
            tooltip_refresh: "Refresh Feeds (F5)",
            tooltip_refresh_feed: "Refresh this feed",
            tooltip_refresh_folder: "Refresh all feeds in this folder",
            tooltip_theme: "Toggle Light/Dark Theme",
            tooltip_theme_light: "Switch to Light Mode",
            tooltip_theme_dark: "Switch to Dark Mode",
            sidebar_close: "Close Menu",
            tooltip_start_date: "Start Date",
            tooltip_start_time: "Start Time",
            tooltip_end_date: "End Date",
            tooltip_end_time: "End Time",
            tooltip_export_format: "Export Format",
            tooltip_paste_url: "Paste URL from clipboard",
            tooltip_paste_name: "Paste name from clipboard",
            tooltip_paste_keyword: "Paste keyword from clipboard",
            tooltip_paste_key: "Paste API Key from clipboard",
            tooltip_paste_path: "Paste directory path from clipboard",
            tooltip_browse_directory: "Browse and select directory",
            tooltip_open_directory: "Open directory in File Explorer",
            tooltip_create_backup_now: "Create both OPML and JSON backups immediately",
            tooltip_test_unread_reminder: "Trigger an immediate unread reminder notification",
            tooltip_resize_handle: "Drag to resize width and height",
            tooltip_scroll_to_top: "Scroll to top",
            tooltip_open_browser: "Open original article in browser",
            tooltip_add_favorites: "Add to favorites",
            tooltip_remove_favorites: "Remove from favorites",
            tooltip_add_summary: "Add to summary cart",
            tooltip_remove_summary: "Remove from summary cart",

            // Mobile app bar
            mobile_title: "PureTidings",
            mobile_menu: "Menu",

            // Main view header
            page_title_all: "All Posts",
            page_title_unread: "Unread Posts",
            page_title_favorites: "Favorites",
            page_title_keywords: "Keyword Matches",
            page_title_summary: "Summary Cart",
            date_filter_all: "All Dates",
            date_filter_today: "Today",
            date_filter_yesterday: "Yesterday",
            date_filter_last_7_days: "Last 7 Days",
            date_filter_custom: "Custom Range",
            btn_copy: "Copy",
            btn_save: "Save",
            btn_clear_list: "Clear List",
            btn_ai_report: "AI Report",
            btn_full_view: "Full Report View",
            filter_search_placeholder: "Filter posts...",

            // Quick Add Feed Modal
            modal_add_feed_title: "➕ Add / Subscribe Feed",
            modal_add_feed_desc: "Enter any website URL (e.g. techcrunch.com), YouTube channel, or RSS feed link. PureTidings will automatically discover the feed and subscribe.",
            input_feed_url_placeholder: "https://example.com or RSS URL",
            input_feed_name_placeholder: "Feed Name (optional - auto-detected if empty)",
            folder_root_option: "Root (No Folder)",
            btn_subscribe: "Subscribe",
            btn_paste: "📋 Paste",
            subscribing_status: "Discovering feed and subscribing...",
            subscribed_status: "Subscribed to \"{name}\"!",
            feed_already_exists_confirm: "This feed URL is already subscribed as \"{name}\". Do you really want to add it a second time?",
            feed_subscription_cancelled: "Subscription cancelled.",
            alert_feed_name_and_url_required: "Please provide both feed name and URL.",

            // Quick AI Summarize Modal
            modal_ai_summarize_title: "🤖 AI Summarize Page or Video",
            modal_ai_summarize_desc: "Paste any article link or YouTube video URL. PureTidings will extract the full content or transcript and generate an instant AI summary.",
            input_ai_url_placeholder: "https://... (article or YouTube video)",
            btn_generate_ai_summary: "Generate AI Summary",

            // Settings Modal Header & Tabs
            settings_title: "⚙️ Settings & Configuration",
            settings_tab_feeds: "Feeds & Folders",
            settings_tab_automation: "Automation & Schedule",
            settings_tab_email: "📬 Email Accounts",
            settings_tab_ai: "AI Features",
            settings_tab_rules: "Rules & Filters",
            settings_tab_backup: "Backup & OPML",
            settings_language_label: "🌐 Language / Sprache:",
            btn_save_settings: "Save Settings",

            // Settings: Feeds & Folders Tab
            settings_manage_feeds_title: "Manage Feeds",
            settings_add_feed_heading: "Add New Feed",
            settings_feed_name_placeholder: "Feed Name (e.g. Ars Technica)",
            settings_feed_url_placeholder: "Feed URL (RSS / Atom / YouTube channel)",
            settings_btn_add_feed: "Add Feed",
            settings_add_folder_heading: "Add New Folder",
            settings_folder_name_placeholder: "Folder Name (e.g. News)",
            settings_btn_add_folder: "Add Folder",
            settings_configured_heading: "Configured Feeds & Folders",

            // Settings: Automation Tab
            settings_automation_title: "⏱️ Fetch Automation & Background Schedule",
            settings_fetch_schedule_title: "Automatic Fetch Schedule (Active Hours)",
            settings_fetch_interval_label: "Background Fetch Interval:",
            settings_randomize_label: "🎲 Randomize fetch timing (±20% jitter)",
            settings_notifications_title: "🔔 Desktop Notification Settings",
            settings_notify_articles_label: "Show desktop toast notification when new articles arrive",
            settings_notify_unread_label: "Send periodic summary reminder for unread articles",
            settings_unread_interval_label: "Unread Reminder Interval:",
            btn_test_notification: "🔔 Send Test Notification",
            btn_test_unread_reminder: "🔔 Test Unread Reminder",

            // Settings: Email Accounts (IMAP) Tab
            settings_email_title: "📬 Email Inboxes & Newsletters (IMAP)",
            settings_email_desc: "Connect any email account directly via native IMAP to receive newsletters and incoming emails seamlessly alongside your RSS feeds.",
            email_form_add_heading: "➕ Add Email Account",
            email_form_edit_heading: "✏️ Edit Email Account",
            email_provider_preset: "Quick Provider Preset:",
            email_preset_custom: "Custom IMAP Server",
            email_account_name: "Account Name (Label):",
            email_account_name_placeholder: "e.g. My Newsletters or Work Gmail",
            email_server: "IMAP Server:",
            email_port: "Port (SSL/TLS):",
            email_username: "Email Address / Username:",
            email_password: "Password / App Password:",
            email_folder: "IMAP Folder:",
            email_btn_load_folders: "📂 Test & Load Folders",
            email_fetch_limit: "Max Emails to Fetch:",
            email_btn_save_account: "Save Account",
            email_btn_update_account: "Update Account",
            email_app_pw_notice_title: "Notice for Gmail, Outlook & iCloud:",
            email_app_pw_notice_desc: "Major email providers require an App Password (Anwendungspasswort) when 2-Factor-Authentication is active. Generate one in your Google/Microsoft account settings under Security -> 2-Step Verification -> App Passwords.",
            email_configured_heading: "Configured Email Inboxes",
            email_no_accounts_configured: "No email accounts configured yet.",
            email_btn_check_now: "Check Now 🔄",
            email_btn_edit: "Edit",
            email_btn_delete: "Delete",
            email_testing_connection: "Testing connection to server...",
            email_test_success: "✓ Connected successfully! Found {count} folder(s).",
            email_test_failed: "✗ Connection failed: {error}",
            email_delete_confirm: "Are you sure you want to remove the email account \"{name}\"?",
            email_account_saved: "✓ Account \"{name}\" saved!",
            btn_cancel: "Cancel",

            // Settings: AI Tab
            settings_ai_title: "🤖 Google Gemini AI Summaries (BYOK)",
            settings_ai_key_label: "Google Gemini API Key:",
            settings_ai_key_placeholder: "Enter your Google Gemini API Key",
            settings_ai_prompt_label: "Article Summary Custom Prompt:",
            settings_ai_yt_prompt_label: "YouTube Video Custom Prompt:",

            // Settings: Rules Tab
            settings_rules_title: "🔍 Smart Keyword Automation & Rules",
            settings_rule_keyword_placeholder: "Keywords (e.g. Apple +Macbook -iPhone)",
            settings_rule_action_label: "Action:",
            settings_rule_action_fav: "Mark as Favorite (Star)",
            settings_rule_action_unread: "Keep Unread & Highlight",
            settings_rule_action_read: "Mark as Read",
            settings_rule_action_hide: "Hide from feed",
            btn_add_rule: "Add Rule",

            // Settings: Backup & OPML Tab
            settings_backup_title: "💾 Local-First Backups & OPML 2.0 Portability",
            settings_auto_backup_title: "⏰ Automated Scheduled Daily Backups",
            settings_auto_backup_label: "Enable automated daily backups directly to disk",
            settings_auto_backup_time_label: "Scheduled Backup Time:",
            settings_backup_folder_label: "Destination Backup Directory:",
            btn_browse_folder: "📂 Browse...",
            btn_open_folder: "📁 Open",
            btn_create_backup_now: "⚡ Create Backup Now",
            btn_export_opml: "📤 Export OPML",
            btn_import_opml: "📥 Import OPML...",
            btn_backup_json: "💾 Backup All Data (JSON)",
            btn_restore_json: "🔄 Restore Backup...",

            // Reader Mode
            reader_copy: "Copy",
            reader_save: "Save",
            feedback_copied: "Copied! ✓",
            feedback_saved: "Saved! ✓",
            reader_ai_summary: "🤖 AI Summary",
            reader_ai_video_summary: "🎥 AI Video Summary",
            reader_close: "Close",
            reader_original_article: "Original Article",

            // Post actions
            post_action_read_mode: "Read Mode",
            post_action_mark_read: "Mark as read",
            post_action_mark_unread: "Mark as unread",
            post_action_favorite: "Favorite",
            post_action_summary_cart: "Summary Cart",

            // Miscellaneous & Toasts
            toast_saved: "Settings Saved",
            toast_backup_created: "Backup created successfully",
            toast_feed_updated: "Feed Updated",
            toast_feed_refresh_failed: "Feed Refresh Failed",
            no_articles_found: "No articles found.",
            loading_posts: "Loading posts..."
        },

        de: {
            // Sidebar navigation
            nav_all: "Alle Artikel",
            nav_unread: "Ungelesene Artikel",
            nav_favorites: "Favoriten",
            nav_keywords: "Schlagwort-Treffer",
            nav_summary: "Zusammenfassungs-Korb",
            btn_quick_add_feed: "➕ Feed abonnieren / hinzufügen",
            btn_quick_summarize: "🤖 KI-Zusammenfassung (URL)",
            search_placeholder: "Suchen... (+ UND, , ODER, - NICHT)",
            search_title: "Beispiel: Apple +Macbook -iPhone",
            tooltip_quick_add_feed: "Beliebige Website oder Feed abonnieren",
            tooltip_quick_summarize: "Beliebige Webseite oder Video mit KI zusammenfassen",
            tooltip_settings: "Einstellungen",
            tooltip_refresh: "Feeds aktualisieren (F5)",
            tooltip_refresh_feed: "Diesen Feed aktualisieren",
            tooltip_refresh_folder: "Alle Feeds in diesem Ordner aktualisieren",
            tooltip_theme: "Hell/Dunkel umschalten",
            tooltip_theme_light: "Zu hellem Modus wechseln",
            tooltip_theme_dark: "Zu dunklem Modus wechseln",
            sidebar_close: "Menü schließen",
            tooltip_start_date: "Startdatum",
            tooltip_start_time: "Startzeit",
            tooltip_end_date: "Enddatum",
            tooltip_end_time: "Endzeit",
            tooltip_export_format: "Export-Format",
            tooltip_paste_url: "URL aus der Zwischenablage einfügen",
            tooltip_paste_name: "Name aus der Zwischenablage einfügen",
            tooltip_paste_keyword: "Schlagwort aus der Zwischenablage einfügen",
            tooltip_paste_key: "API-Schlüssel aus der Zwischenablage einfügen",
            tooltip_paste_path: "Ordnerpfad aus der Zwischenablage einfügen",
            tooltip_browse_directory: "Ordner auswählen und durchsuchen",
            tooltip_open_directory: "Ordner im Dateimanager öffnen",
            tooltip_create_backup_now: "Sofort sowohl OPML- als auch JSON-Backups erstellen",
            tooltip_test_unread_reminder: "Sofortige Erinnerung an ungelesene Artikel auslösen",
            tooltip_resize_handle: "Ziehen, um Breite und Höhe anzupassen",
            tooltip_scroll_to_top: "Nach oben scrollen",
            tooltip_open_browser: "Originalartikel im Browser öffnen",
            tooltip_add_favorites: "Zu Favoriten hinzufügen",
            tooltip_remove_favorites: "Aus Favoriten entfernen",
            tooltip_add_summary: "Zum Zusammenfassungs-Korb hinzufügen",
            tooltip_remove_summary: "Aus Zusammenfassungs-Korb entfernen",

            // Mobile app bar
            mobile_title: "PureTidings",
            mobile_menu: "Menü",

            // Main view header
            page_title_all: "Alle Artikel",
            page_title_unread: "Ungelesene Artikel",
            page_title_favorites: "Favoriten",
            page_title_keywords: "Schlagwort-Treffer",
            page_title_summary: "Zusammenfassungs-Korb",
            date_filter_all: "Alle Daten",
            date_filter_today: "Heute",
            date_filter_yesterday: "Gestern",
            date_filter_last_7_days: "Letzte 7 Tage",
            date_filter_custom: "Benutzerdefiniert",
            btn_copy: "Kopieren",
            btn_save: "Speichern",
            btn_clear_list: "Liste leeren",
            btn_ai_report: "KI-Bericht",
            btn_full_view: "Vollansicht",
            filter_search_placeholder: "Artikel filtern...",

            // Quick Add Feed Modal
            modal_add_feed_title: "➕ Feed abonnieren / hinzufügen",
            modal_add_feed_desc: "Gib eine Website-URL (z. B. heise.de), einen YouTube-Kanal oder einen RSS-Link ein. PureTidings erkennt den Feed automatisch und abonniert ihn.",
            input_feed_url_placeholder: "https://beispiel.de oder RSS-URL",
            input_feed_name_placeholder: "Feed-Name (optional - wird sonst automatisch erkannt)",
            folder_root_option: "Hauptverzeichnis (Kein Ordner)",
            btn_subscribe: "Abonnieren",
            btn_paste: "📋 Einfügen",
            subscribing_status: "Feed wird gesucht und abonniert...",
            subscribed_status: "\"{name}\" erfolgreich abonniert!",
            feed_already_exists_confirm: "Diese Feed-URL ist bereits als \"{name}\" vorhanden. Möchtest du diesen Feed wirklich ein 2. Mal anlegen?",
            feed_subscription_cancelled: "Abonnement abgebrochen.",
            alert_feed_name_and_url_required: "Bitte sowohl Feed-Namen als auch URL angeben.",

            // Quick AI Summarize Modal
            modal_ai_summarize_title: "🤖 KI-Zusammenfassung (Seite oder Video)",
            modal_ai_summarize_desc: "Füge einen Artikellink oder eine YouTube-Video-URL ein. PureTidings extrahiert den Inhalt oder das Transkript und erstellt eine sofortige Zusammenfassung.",
            input_ai_url_placeholder: "https://... (Artikel oder YouTube-Video)",
            btn_generate_ai_summary: "KI-Zusammenfassung erstellen",

            // Settings Modal Header & Tabs
            settings_title: "⚙️ Einstellungen & Konfiguration",
            settings_tab_feeds: "Feeds & Ordner",
            settings_tab_automation: "Automatisierung & Zeitplan",
            settings_tab_email: "📬 E-Mail-Konten",
            settings_tab_ai: "KI-Funktionen",
            settings_tab_rules: "Regeln & Filter",
            settings_tab_backup: "Backup & OPML",
            settings_language_label: "🌐 Sprache / Language:",
            btn_save_settings: "Einstellungen speichern",

            // Settings: Feeds & Folders Tab
            settings_manage_feeds_title: "Feeds verwalten",
            settings_add_feed_heading: "Neuen Feed hinzufügen",
            settings_feed_name_placeholder: "Feed-Name (z. B. Heise Online)",
            settings_feed_url_placeholder: "Feed-URL (RSS / Atom / YouTube-Kanal)",
            settings_btn_add_feed: "Feed hinzufügen",
            settings_add_folder_heading: "Neuen Ordner erstellen",
            settings_folder_name_placeholder: "Ordnername (z. B. Nachrichten)",
            settings_btn_add_folder: "Ordner hinzufügen",
            settings_configured_heading: "Eingerichtete Feeds & Ordner",

            // Settings: Automation Tab
            settings_automation_title: "⏱️ Feed-Abruf & Hintergrund-Zeitplan",
            settings_fetch_schedule_title: "Automatischer Zeitplan (Aktive Stunden)",
            settings_fetch_interval_label: "Hintergrund-Abrufintervall:",
            settings_randomize_label: "🎲 Zufällige Zeitabweichung (±20% Jitter)",
            settings_notifications_title: "🔔 Desktop-Benachrichtigungseinstellungen",
            settings_notify_articles_label: "Desktop-Benachrichtigung bei neuen Artikeln anzeigen",
            settings_notify_unread_label: "Regelmäßige Erinnerung an ungelesene Artikel senden",
            settings_unread_interval_label: "Erinnerungsintervall für ungelesene Artikel:",
            btn_test_notification: "🔔 Test-Benachrichtigung senden",
            btn_test_unread_reminder: "🔔 Ungelesene-Erinnerung testen",

            // Settings: Email Accounts (IMAP) Tab
            settings_email_title: "📬 E-Mail-Postfächer & Newsletter (IMAP)",
            settings_email_desc: "Verbinden Sie beliebige E-Mail-Konten direkt über natives IMAP, um Newsletter und eingehende E-Mails nahtlos neben Ihren RSS-Feeds zu lesen.",
            email_form_add_heading: "➕ E-Mail-Konto hinzufügen",
            email_form_edit_heading: "✏️ E-Mail-Konto bearbeiten",
            email_provider_preset: "Schnell-Voreinstellung:",
            email_preset_custom: "Benutzerdefinierter IMAP-Server",
            email_account_name: "Kontoname (Bezeichnung):",
            email_account_name_placeholder: "z. B. Meine Newsletter oder Arbeits-Gmail",
            email_server: "IMAP-Server:",
            email_port: "Port (SSL/TLS):",
            email_username: "E-Mail-Adresse / Benutzername:",
            email_password: "Passwort / App-Passwort:",
            email_folder: "IMAP-Ordner:",
            email_btn_load_folders: "📂 Testen & Ordner laden",
            email_fetch_limit: "Max. abzurufende E-Mails:",
            email_btn_save_account: "Konto speichern",
            email_btn_update_account: "Konto aktualisieren",
            email_app_pw_notice_title: "Hinweis für Gmail, Outlook & iCloud:",
            email_app_pw_notice_desc: "Große Anbieter erfordern bei aktivierter 2-Faktor-Authentifizierung ein App-Passwort (Anwendungspasswort). Erstellen Sie dieses in Ihren Google-/Microsoft-Kontoeinstellungen unter Sicherheit -> 2-Stufen-Verifizierung -> App-Passwörter.",
            email_configured_heading: "Konfigurierte E-Mail-Postfächer",
            email_no_accounts_configured: "Noch keine E-Mail-Konten konfiguriert.",
            email_btn_check_now: "Jetzt prüfen 🔄",
            email_btn_edit: "Bearbeiten",
            email_btn_delete: "Löschen",
            email_testing_connection: "Verbindung zum Server wird getestet...",
            email_test_success: "✓ Erfolgreich verbunden! {count} Ordner gefunden.",
            email_test_failed: "✗ Verbindung fehlgeschlagen: {error}",
            email_delete_confirm: "Möchten Sie das E-Mail-Konto \"{name}\" wirklich entfernen?",
            email_account_saved: "✓ Konto \"{name}\" gespeichert!",
            btn_cancel: "Abbrechen",

            // Settings: AI Tab
            settings_ai_title: "🤖 Google Gemini KI-Zusammenfassungen (BYOK)",
            settings_ai_key_label: "Google Gemini API-Schlüssel:",
            settings_ai_key_placeholder: "Deinen Google Gemini API-Schlüssel eingeben",
            settings_ai_prompt_label: "Eigener Prompt für Artikel-Zusammenfassungen:",
            settings_ai_yt_prompt_label: "Eigener Prompt für YouTube-Videos:",

            // Settings: Rules Tab
            settings_rules_title: "🔍 Intelligente Schlagwort-Regeln & Automatisierung",
            settings_rule_keyword_placeholder: "Schlagwörter (z. B. Apple +Macbook -iPhone)",
            settings_rule_action_label: "Aktion:",
            settings_rule_action_fav: "Als Favorit markieren (Stern)",
            settings_rule_action_unread: "Ungelesen lassen & hervorheben",
            settings_rule_action_read: "Als gelesen markieren",
            settings_rule_action_hide: "Im Feed ausblenden",
            btn_add_rule: "Regel hinzufügen",

            // Settings: Backup & OPML Tab
            settings_backup_title: "💾 Lokale Backups & OPML 2.0 Portabilität",
            settings_auto_backup_title: "⏰ Automatische tägliche Datensicherungen",
            settings_auto_backup_label: "Automatische tägliche Sicherung direkt auf die Festplatte aktivieren",
            settings_auto_backup_time_label: "Geplante Backup-Uhrzeit:",
            settings_backup_folder_label: "Zielordner für Backups:",
            btn_browse_folder: "📂 Durchsuchen...",
            btn_open_folder: "📁 Öffnen",
            btn_create_backup_now: "⚡ Jetzt Backup erstellen",
            btn_export_opml: "📤 OPML exportieren",
            btn_import_opml: "📥 OPML importieren...",
            btn_backup_json: "💾 Alle Daten sichern (JSON)",
            btn_restore_json: "🔄 Backup wiederherstellen...",

            // Reader Mode
            reader_copy: "Kopieren",
            reader_save: "Speichern",
            feedback_copied: "Kopiert! ✓",
            feedback_saved: "Gespeichert! ✓",
            reader_ai_summary: "🤖 KI-Zusammenfassung",
            reader_ai_video_summary: "🎥 KI-Videozusammenfassung",
            reader_close: "Schließen",
            reader_original_article: "Originalartikel",

            // Post actions
            post_action_read_mode: "Lesemodus",
            post_action_mark_read: "Als gelesen markieren",
            post_action_mark_unread: "Als ungelesen markieren",
            post_action_favorite: "Favorit",
            post_action_summary_cart: "Zusammenfassungs-Korb",

            // Miscellaneous & Toasts
            toast_saved: "Einstellungen gespeichert",
            toast_backup_created: "Backup erfolgreich erstellt",
            toast_feed_updated: "Feed aktualisiert",
            toast_feed_refresh_failed: "Feed-Aktualisierung fehlgeschlagen",
            no_articles_found: "Keine Artikel gefunden.",
            loading_posts: "Artikel werden geladen..."
        },

        es: {
            // Sidebar navigation
            nav_all: "Todos los artículos",
            nav_unread: "No leídos",
            nav_favorites: "Favoritos",
            nav_keywords: "Palabras clave",
            nav_summary: "Cesta de resumen",
            btn_quick_add_feed: "➕ Añadir / Suscribir feed",
            btn_quick_summarize: "🤖 Resumir URL con IA",
            search_placeholder: "Buscar... (+ Y, , O, - NO)",
            search_title: "Ejemplo: Apple +Macbook -iPhone",
            tooltip_quick_add_feed: "Suscribirse a cualquier sitio web o feed",
            tooltip_quick_summarize: "Resumir cualquier página web o vídeo con IA",
            tooltip_settings: "Configuración",
            tooltip_refresh: "Actualizar feeds (F5)",
            tooltip_refresh_feed: "Actualizar este feed",
            tooltip_refresh_folder: "Actualizar todos los feeds de esta carpeta",
            tooltip_theme: "Cambiar tema claro/oscuro",
            tooltip_theme_light: "Cambiar a modo claro",
            tooltip_theme_dark: "Cambiar a modo oscuro",
            sidebar_close: "Cerrar menú",
            tooltip_start_date: "Fecha de inicio",
            tooltip_start_time: "Hora de inicio",
            tooltip_end_date: "Fecha de finalización",
            tooltip_end_time: "Hora de finalización",
            tooltip_export_format: "Formato de exportación",
            tooltip_paste_url: "Pegar URL desde el portapapeles",
            tooltip_paste_name: "Pegar nombre desde el portapapeles",
            tooltip_paste_keyword: "Pegar palabra clave desde el portapapeles",
            tooltip_paste_key: "Pegar clave de API desde el portapapeles",
            tooltip_paste_path: "Pegar ruta de carpeta desde el portapapeles",
            tooltip_browse_directory: "Examinar y seleccionar directorio",
            tooltip_open_directory: "Abrir directorio en el explorador de archivos",
            tooltip_create_backup_now: "Crear copias de seguridad OPML y JSON de inmediato",
            tooltip_test_unread_reminder: "Activar notificación inmediata de artículos no leídos",
            tooltip_resize_handle: "Arrastrar para cambiar ancho y alto",
            tooltip_scroll_to_top: "Desplazar hacia arriba",
            tooltip_open_browser: "Abrir artículo original en el navegador",
            tooltip_add_favorites: "Añadir a favoritos",
            tooltip_remove_favorites: "Eliminar de favoritos",
            tooltip_add_summary: "Añadir a la cesta de resumen",
            tooltip_remove_summary: "Eliminar de la cesta de resumen",

            // Mobile app bar
            mobile_title: "PureTidings",
            mobile_menu: "Menú",

            // Main view header
            page_title_all: "Todos los artículos",
            page_title_unread: "Artículos no leídos",
            page_title_favorites: "Favoritos",
            page_title_keywords: "Coincidencias de palabras clave",
            page_title_summary: "Cesta de resumen",
            date_filter_all: "Todas las fechas",
            date_filter_today: "Hoy",
            date_filter_yesterday: "Ayer",
            date_filter_last_7_days: "Últimos 7 días",
            date_filter_custom: "Personalizado",
            btn_copy: "Copiar",
            btn_save: "Guardar",
            btn_clear_list: "Vaciar lista",
            btn_ai_report: "Informe de IA",
            btn_full_view: "Vista completa",
            filter_search_placeholder: "Filtrar artículos...",

            // Quick Add Feed Modal
            modal_add_feed_title: "➕ Añadir / Suscribir feed",
            modal_add_feed_desc: "Introduce una URL web (ej. techcrunch.com), canal de YouTube o enlace RSS. PureTidings lo descubrirá y suscribirá automáticamente.",
            input_feed_url_placeholder: "https://ejemplo.com o URL RSS",
            input_feed_name_placeholder: "Nombre del feed (opcional - detectado automáticamente)",
            folder_root_option: "Raíz (Sin carpeta)",
            btn_subscribe: "Suscribirse",
            btn_paste: "📋 Pegar",
            subscribing_status: "Descubriendo feed y suscribiendo...",
            subscribed_status: "¡Suscrito a \"{name}\" con éxito!",
            feed_already_exists_confirm: "Esta URL de feed ya está suscrita como \"{name}\". ¿Realmente desea agregarla por segunda vez?",
            feed_subscription_cancelled: "Suscripción cancelada.",
            alert_feed_name_and_url_required: "Por favor, proporcione tanto el nombre como la URL del feed.",

            // Quick AI Summarize Modal
            modal_ai_summarize_title: "🤖 Resumen con IA de página o vídeo",
            modal_ai_summarize_desc: "Pega cualquier enlace de artículo o vídeo de YouTube. PureTidings extraerá el contenido o la transcripción y creará un resumen con IA al instante.",
            input_ai_url_placeholder: "https://... (artículo o vídeo de YouTube)",
            btn_generate_ai_summary: "Generar resumen con IA",

            // Settings Modal Header & Tabs
            settings_title: "⚙️ Ajustes y Configuración",
            settings_tab_feeds: "Feeds y Carpetas",
            settings_tab_automation: "Automatización y Horario",
            settings_tab_email: "📬 Cuentas de Correo",
            settings_tab_ai: "Funciones de IA",
            settings_tab_rules: "Reglas y Filtros",
            settings_tab_backup: "Copia de seguridad y OPML",
            settings_language_label: "🌐 Idioma / Language:",
            btn_save_settings: "Guardar configuración",

            // Settings: Feeds & Folders Tab
            settings_manage_feeds_title: "Administrar feeds",
            settings_add_feed_heading: "Añadir nuevo feed",
            settings_feed_name_placeholder: "Nombre del feed (ej. Ars Technica)",
            settings_feed_url_placeholder: "URL del feed (RSS / Atom / Canal de YouTube)",
            settings_btn_add_feed: "Añadir feed",
            settings_add_folder_heading: "Añadir nueva carpeta",
            settings_folder_name_placeholder: "Nombre de la carpeta (ej. Noticias)",
            settings_btn_add_folder: "Añadir carpeta",
            settings_configured_heading: "Feeds y carpetas configurados",

            // Settings: Automation Tab
            settings_automation_title: "⏱️ Automatización de obtención y horario",
            settings_fetch_schedule_title: "Horario de obtención automática (Horas activas)",
            settings_fetch_interval_label: "Intervalo de actualización en segundo plano:",
            settings_randomize_label: "🎲 Variación aleatoria de tiempo (±20% Jitter)",
            settings_notifications_title: "🔔 Configuración de notificaciones de escritorio",
            settings_notify_articles_label: "Mostrar notificación de escritorio cuando lleguen nuevos artículos",
            settings_notify_unread_label: "Enviar recordatorio periódico de artículos no leídos",
            settings_unread_interval_label: "Intervalo del recordatorio de no leídos:",
            btn_test_notification: "🔔 Enviar notificación de prueba",
            btn_test_unread_reminder: "🔔 Probar recordatorio de no leídos",

            // Settings: Email Accounts (IMAP) Tab
            settings_email_title: "📬 Bandejas de Correo y Boletines (IMAP)",
            settings_email_desc: "Conecte cualquier cuenta de correo mediante IMAP nativo para recibir boletines y correos electrónicos junto a sus fuentes RSS.",
            email_form_add_heading: "➕ Añadir Cuenta de Correo",
            email_form_edit_heading: "✏️ Editar Cuenta de Correo",
            email_provider_preset: "Preajuste del Proveedor:",
            email_preset_custom: "Servidor IMAP personalizado",
            email_account_name: "Nombre de la Cuenta:",
            email_account_name_placeholder: "ej. Mis Boletines o Gmail Laboral",
            email_server: "Servidor IMAP:",
            email_port: "Puerto (SSL/TLS):",
            email_username: "Correo / Usuario:",
            email_password: "Contraseña / Contraseña de Aplicación:",
            email_folder: "Carpeta IMAP:",
            email_btn_load_folders: "📂 Probar y Cargar Carpetas",
            email_fetch_limit: "Máx. Correos a Descargar:",
            email_btn_save_account: "Guardar Cuenta",
            email_btn_update_account: "Actualizar Cuenta",
            email_app_pw_notice_title: "Aviso para Gmail, Outlook e iCloud:",
            email_app_pw_notice_desc: "Los principales proveedores requieren una contraseña de aplicación con autenticación en 2 pasos activa. Genérela en la seguridad de su cuenta.",
            email_configured_heading: "Cuentas de Correo Configuradas",
            email_no_accounts_configured: "No hay cuentas de correo configuradas aún.",
            email_btn_check_now: "Comprobar Ahora 🔄",
            email_btn_edit: "Editar",
            email_btn_delete: "Eliminar",
            email_testing_connection: "Probando conexión con el servidor...",
            email_test_success: "✓ ¡Conexión exitosa! Se encontraron {count} carpetas.",
            email_test_failed: "✗ Error de conexión: {error}",
            email_delete_confirm: "¿Está seguro de que desea eliminar la cuenta \"{name}\"?",
            email_account_saved: "✓ ¡Cuenta \"{name}\" guardada!",
            btn_cancel: "Cancelar",

            // Settings: AI Tab
            settings_ai_title: "🤖 Resúmenes con Google Gemini IA (BYOK)",
            settings_ai_key_label: "Clave de API de Google Gemini:",
            settings_ai_key_placeholder: "Introduce tu clave de API de Google Gemini",
            settings_ai_prompt_label: "Prompt personalizado para resúmenes de artículos:",
            settings_ai_yt_prompt_label: "Prompt personalizado para vídeos de YouTube:",

            // Settings: Rules Tab
            settings_rules_title: "🔍 Reglas inteligentes y automatización de palabras clave",
            settings_rule_keyword_placeholder: "Palabras clave (ej. Apple +Macbook -iPhone)",
            settings_rule_action_label: "Acción:",
            settings_rule_action_fav: "Marcar como favorito (Estrella)",
            settings_rule_action_unread: "Mantener no leído y destacar",
            settings_rule_action_read: "Marcar como leído",
            settings_rule_action_hide: "Ocultar del feed",
            btn_add_rule: "Añadir regla",

            // Settings: Backup & OPML Tab
            settings_backup_title: "💾 Copias de seguridad locales y portabilidad OPML 2.0",
            settings_auto_backup_title: "⏰ Copias de seguridad diarias automáticas",
            settings_auto_backup_label: "Activar copia de seguridad diaria directamente en el disco",
            settings_auto_backup_time_label: "Hora programada de la copia de seguridad:",
            settings_backup_folder_label: "Directorio de destino de la copia:",
            btn_browse_folder: "📂 Explorar...",
            btn_open_folder: "📁 Abrir",
            btn_create_backup_now: "⚡ Crear copia ahora",
            btn_export_opml: "📤 Exportar OPML",
            btn_import_opml: "📥 Importar OPML...",
            btn_backup_json: "💾 Guardar todos los datos (JSON)",
            btn_restore_json: "🔄 Restaurar copia...",

            // Reader Mode
            reader_copy: "Copiar",
            reader_save: "Guardar",
            feedback_copied: "¡Copiado! ✓",
            feedback_saved: "¡Guardado! ✓",
            reader_ai_summary: "🤖 Resumen con IA",
            reader_ai_video_summary: "🎥 Resumen de vídeo con IA",
            reader_close: "Cerrar",
            reader_original_article: "Artículo original",

            // Post actions
            post_action_read_mode: "Modo lectura",
            post_action_mark_read: "Marcar como leído",
            post_action_mark_unread: "Marcar como no leído",
            post_action_favorite: "Favorito",
            post_action_summary_cart: "Cesta de resumen",

            // Miscellaneous & Toasts
            toast_saved: "Configuración guardada",
            toast_backup_created: "Copia de seguridad creada con éxito",
            toast_feed_updated: "Feed actualizado",
            toast_feed_refresh_failed: "Error al actualizar el feed",
            no_articles_found: "No se encontraron artículos.",
            loading_posts: "Cargando artículos..."
        },

        fr: {
            // Sidebar navigation
            nav_all: "Tous les articles",
            nav_unread: "Non lus",
            nav_favorites: "Favoris",
            nav_keywords: "Mots-clés",
            nav_summary: "Panier de résumé",
            btn_quick_add_feed: "➕ Ajouter / S'abonner au flux",
            btn_quick_summarize: "🤖 Résumer l'URL avec l'IA",
            search_placeholder: "Rechercher... (+ ET, , OU, - PAS)",
            search_title: "Exemple : Apple +Macbook -iPhone",
            tooltip_quick_add_feed: "S'abonner à n'importe quel site web ou flux",
            tooltip_quick_summarize: "Résumer n'importe quelle page web ou vidéo avec l'IA",
            tooltip_settings: "Paramètres",
            tooltip_refresh: "Actualiser les flux (F5)",
            tooltip_refresh_feed: "Actualiser ce flux",
            tooltip_refresh_folder: "Actualiser tous les flux de ce dossier",
            tooltip_theme: "Basculer thème clair/sombre",
            tooltip_theme_light: "Passer en mode clair",
            tooltip_theme_dark: "Passer en mode sombre",
            sidebar_close: "Fermer le menu",
            tooltip_start_date: "Date de début",
            tooltip_start_time: "Heure de début",
            tooltip_end_date: "Date de fin",
            tooltip_end_time: "Heure de fin",
            tooltip_export_format: "Format d'exportation",
            tooltip_paste_url: "Coller l'URL depuis le presse-papiers",
            tooltip_paste_name: "Coller le nom depuis le presse-papiers",
            tooltip_paste_keyword: "Coller le mot-clé depuis le presse-papiers",
            tooltip_paste_key: "Coller la clé API depuis le presse-papiers",
            tooltip_paste_path: "Coller le chemin du dossier depuis le presse-papiers",
            tooltip_browse_directory: "Parcourir et sélectionner un dossier",
            tooltip_open_directory: "Ouvrir le dossier dans l'explorateur de fichiers",
            tooltip_create_backup_now: "Créer immédiatement les sauvegardes OPML et JSON",
            tooltip_test_unread_reminder: "Déclencher une notification immédiate de rappel des non-lus",
            tooltip_resize_handle: "Glisser pour redimensionner la largeur et la hauteur",
            tooltip_scroll_to_top: "Haut de page",
            tooltip_open_browser: "Ouvrir l'article d'origine dans le navigateur",
            tooltip_add_favorites: "Ajouter aux favoris",
            tooltip_remove_favorites: "Supprimer des favoris",
            tooltip_add_summary: "Ajouter au panier de résumé",
            tooltip_remove_summary: "Retirer du panier de résumé",

            // Mobile app bar
            mobile_title: "PureTidings",
            mobile_menu: "Menu",

            // Main view header
            page_title_all: "Tous les articles",
            page_title_unread: "Articles non lus",
            page_title_favorites: "Favoris",
            page_title_keywords: "Mots-clés correspondants",
            page_title_summary: "Panier de résumé",
            date_filter_all: "Toutes les dates",
            date_filter_today: "Aujourd'hui",
            date_filter_yesterday: "Hier",
            date_filter_last_7_days: "7 derniers jours",
            date_filter_custom: "Personnalisé",
            btn_copy: "Copier",
            btn_save: "Enregistrer",
            btn_clear_list: "Vider la liste",
            btn_ai_report: "Rapport d'IA",
            btn_full_view: "Vue rapport complet",
            filter_search_placeholder: "Filtrer les articles...",

            // Quick Add Feed Modal
            modal_add_feed_title: "➕ Ajouter / S'abonner au flux",
            modal_add_feed_desc: "Entrez l'URL d'un site (ex. lemonde.fr), d'une chaîne YouTube ou d'un flux RSS. PureTidings découvrira et ajoutera le flux automatiquement.",
            input_feed_url_placeholder: "https://exemple.fr ou URL RSS",
            input_feed_name_placeholder: "Nom du flux (facultatif - détecté automatiquement)",
            folder_root_option: "Racine (Aucun dossier)",
            btn_subscribe: "S'abonner",
            btn_paste: "📋 Coller",
            subscribing_status: "Découverte du flux et abonnement...",
            subscribed_status: "Abonné à \"{name}\" avec succès !",
            feed_already_exists_confirm: "Cette URL de flux est déjà abonnée sous le nom \"{name}\". Voulez-vous vraiment l'ajouter une deuxième fois ?",
            feed_subscription_cancelled: "Abonnement annulé.",
            alert_feed_name_and_url_required: "Veuillez fournir le nom et l'URL du flux.",

            // Quick AI Summarize Modal
            modal_ai_summarize_title: "🤖 Résumé IA d'une page ou d'une vidéo",
            modal_ai_summarize_desc: "Collez un lien d'article ou une URL de vidéo YouTube. PureTidings extraira le contenu ou la transcription et produira un résumé instantané.",
            input_ai_url_placeholder: "https://... (article ou vidéo YouTube)",
            btn_generate_ai_summary: "Générer le résumé IA",

            // Settings Modal Header & Tabs
            settings_title: "⚙️ Paramètres et Configuration",
            settings_tab_feeds: "Flux et Dossiers",
            settings_tab_automation: "Automatisation et Planification",
            settings_tab_email: "📬 Comptes E-mail",
            settings_tab_ai: "Fonctions IA",
            settings_tab_rules: "Règles et Filtres",
            settings_tab_backup: "Sauvegarde et OPML",
            settings_language_label: "🌐 Langue / Language :",
            btn_save_settings: "Enregistrer les paramètres",

            // Settings: Feeds & Folders Tab
            settings_manage_feeds_title: "Gérer les flux",
            settings_add_feed_heading: "Ajouter un nouveau flux",
            settings_feed_name_placeholder: "Nom du flux (ex. Le Monde)",
            settings_feed_url_placeholder: "URL du flux (RSS / Atom / Chaîne YouTube)",
            settings_btn_add_feed: "Ajouter le flux",
            settings_add_folder_heading: "Ajouter un nouveau dossier",
            settings_folder_name_placeholder: "Nom du dossier (ex. Actualités)",
            settings_btn_add_folder: "Ajouter le dossier",
            settings_configured_heading: "Flux et dossiers configurés",

            // Settings: Automation Tab
            settings_automation_title: "⏱️ Automatisation de récupération et planification",
            settings_fetch_schedule_title: "Planification automatique (Heures actives)",
            settings_fetch_interval_label: "Intervalle de récupération en arrière-plan :",
            settings_randomize_label: "🎲 Variation aléatoire du délai (±20% Jitter)",
            settings_notifications_title: "🔔 Paramètres des notifications de bureau",
            settings_notify_articles_label: "Afficher une notification de bureau lors de nouveaux articles",
            settings_notify_unread_label: "Envoyer un rappel périodique pour les articles non lus",
            settings_unread_interval_label: "Intervalle de rappel des non-lus :",
            btn_test_notification: "🔔 Envoyer une notification de test",
            btn_test_unread_reminder: "🔔 Tester le rappel des non-lus",

            // Settings: Email Accounts (IMAP) Tab
            settings_email_title: "📬 Boîtes de Réception & Newsletters (IMAP)",
            settings_email_desc: "Connectez n'importe quel compte e-mail via IMAP natif pour recevoir vos newsletters et e-mails directement aux côtés de vos flux RSS.",
            email_form_add_heading: "➕ Ajouter un Compte E-mail",
            email_form_edit_heading: "✏️ Modifier le Compte E-mail",
            email_provider_preset: "Fournisseur Prédéfini :",
            email_preset_custom: "Serveur IMAP personnalisé",
            email_account_name: "Nom du Compte :",
            email_account_name_placeholder: "ex. Mes Newsletters ou Gmail Travail",
            email_server: "Serveur IMAP :",
            email_port: "Port (SSL/TLS) :",
            email_username: "Adresse E-mail / Nom d'utilisateur :",
            email_password: "Mot de passe / Mot de passe d'application :",
            email_folder: "Dossier IMAP :",
            email_btn_load_folders: "📂 Tester et Charger les Dossiers",
            email_fetch_limit: "Nombre max. d'e-mails :",
            email_btn_save_account: "Enregistrer le Compte",
            email_btn_update_account: "Mettre à jour le Compte",
            email_app_pw_notice_title: "Remarque pour Gmail, Outlook et iCloud :",
            email_app_pw_notice_desc: "Les principaux fournisseurs requièrent un mot de passe d'application avec l'authentification à deux facteurs. Générez-en un dans les paramètres de sécurité de votre compte.",
            email_configured_heading: "Comptes E-mail Configurés",
            email_no_accounts_configured: "Aucun compte e-mail configuré pour le moment.",
            email_btn_check_now: "Vérifier Maintenant 🔄",
            email_btn_edit: "Modifier",
            email_btn_delete: "Supprimer",
            email_testing_connection: "Test de la connexion au serveur...",
            email_test_success: "✓ Connexion réussie ! {count} dossier(s) trouvé(s).",
            email_test_failed: "✗ Échec de la connexion : {error}",
            email_delete_confirm: "Êtes-vous sûr de vouloir supprimer le compte \"{name}\" ?",
            email_account_saved: "✓ Compte \"{name}\" enregistré !",
            btn_cancel: "Annuler",

            // Settings: AI Tab
            settings_ai_title: "🤖 Résumés IA avec Google Gemini (BYOK)",
            settings_ai_key_label: "Clé API Google Gemini :",
            settings_ai_key_placeholder: "Entrez votre clé API Google Gemini",
            settings_ai_prompt_label: "Prompt personnalisé pour les résumés d'articles :",
            settings_ai_yt_prompt_label: "Prompt personnalisé pour les vidéos YouTube :",

            // Settings: Rules Tab
            settings_rules_title: "🔍 Règles et automatisation intelligente de mots-clés",
            settings_rule_keyword_placeholder: "Mots-clés (ex. Apple +Macbook -iPhone)",
            settings_rule_action_label: "Action :",
            settings_rule_action_fav: "Marquer comme favori (Étoile)",
            settings_rule_action_unread: "Garder non lu et surligner",
            settings_rule_action_read: "Marquer comme lu",
            settings_rule_action_hide: "Masquer du flux",
            btn_add_rule: "Ajouter la règle",

            // Settings: Backup & OPML Tab
            settings_backup_title: "💾 Sauvegardes locales et portabilité OPML 2.0",
            settings_auto_backup_title: "⏰ Sauvegardes quotidiennes automatiques",
            settings_auto_backup_label: "Activer la sauvegarde quotidienne automatique sur le disque",
            settings_auto_backup_time_label: "Heure de sauvegarde programmée :",
            settings_backup_folder_label: "Dossier de destination des sauvegardes :",
            btn_browse_folder: "📂 Parcourir...",
            btn_open_folder: "📁 Ouvrir",
            btn_create_backup_now: "⚡ Créer une sauvegarde maintenant",
            btn_export_opml: "📤 Exporter OPML",
            btn_import_opml: "📥 Importer OPML...",
            btn_backup_json: "💾 Sauvegarder toutes les données (JSON)",
            btn_restore_json: "🔄 Restaurer la sauvegarde...",

            // Reader Mode
            reader_copy: "Copier",
            reader_save: "Enregistrer",
            feedback_copied: "Copié ! ✓",
            feedback_saved: "Enregistré ! ✓",
            reader_ai_summary: "🤖 Résumé IA",
            reader_ai_video_summary: "🎥 Résumé vidéo IA",
            reader_close: "Fermer",
            reader_original_article: "Article d'origine",

            // Post actions
            post_action_read_mode: "Mode lecture",
            post_action_mark_read: "Marquer comme lu",
            post_action_mark_unread: "Marquer comme non lu",
            post_action_favorite: "Favori",
            post_action_summary_cart: "Panier de résumé",

            // Miscellaneous & Toasts
            toast_saved: "Paramètres enregistrés",
            toast_backup_created: "Sauvegarde créée avec succès",
            toast_feed_updated: "Flux mis à jour",
            toast_feed_refresh_failed: "Échec de mise à jour du flux",
            no_articles_found: "Aucun article trouvé.",
            loading_posts: "Chargement des articles..."
        }
    };

    let currentLang = 'en';

    function detectDefaultLanguage() {
        const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (navLang.startsWith('de')) return 'de';
        if (navLang.startsWith('es')) return 'es';
        if (navLang.startsWith('fr')) return 'fr';
        return 'en';
    }

    function t(key, params = {}) {
        const langData = translations[currentLang] || translations['en'];
        let text = langData[key] || translations['en'][key] || key;
        if (params && typeof params === 'object') {
            for (const [k, v] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
            }
        }
        return text;
    }

    function applyTranslations(root = document) {
        if (!root) return;

        // 1. Text content
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = t(key);
            }
        });

        // 2. HTML content
        root.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (key) {
                el.innerHTML = t(key);
            }
        });

        // 3. Placeholders
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) {
                el.placeholder = t(key);
            }
        });

        // 4. Titles / Tooltips
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) {
                el.title = t(key);
            }
        });

        // 5. Select dropdowns with data-i18n-options
        root.querySelectorAll('option[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                el.textContent = t(key);
            }
        });

        // Sync HTML lang attribute
        document.documentElement.lang = currentLang;

        // Keep select dropdown in sync if present
        const langSelect = document.getElementById('settings-language-select');
        if (langSelect && langSelect.value !== currentLang) {
            langSelect.value = currentLang;
        }
    }

    async function setLanguage(lang, shouldSave = true) {
        if (!translations[lang]) {
            lang = 'en';
        }
        currentLang = lang;

        if (shouldSave && window.chrome && chrome.storage && chrome.storage.sync) {
            try {
                await chrome.storage.sync.set({ appLanguage: lang });
            } catch (err) {
                console.warn('[i18n] Could not persist language setting:', err);
            }
        }

        applyTranslations();

        window.dispatchEvent(new CustomEvent('i18n:languageChanged', {
            detail: { language: currentLang }
        }));
    }

    async function init() {
        let savedLang = null;
        if (window.chrome && chrome.storage && chrome.storage.sync) {
            try {
                const data = await chrome.storage.sync.get('appLanguage');
                savedLang = data.appLanguage;
            } catch (e) {
                console.warn('[i18n] Could not read appLanguage from sync:', e);
            }
        }

        if (!savedLang || !translations[savedLang]) {
            savedLang = detectDefaultLanguage();
        }

        await setLanguage(savedLang, false);
    }

    window.i18n = {
        translations,
        get currentLanguage() { return currentLang; },
        t,
        setLanguage,
        applyTranslations,
        init
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }
})();
