import type { Dict } from "@asafarim/shared-i18n";

/**
 * TasksAI UI strings, externalized (docs: M11). English is the source of
 * truth; nl and fr are the launch locales. The `i18n.test.ts` suite fails
 * if a key exists in `en` but is missing from `nl` or `fr`, so a new string
 * cannot ship untranslated.
 *
 * de and lb fall back to en via the platform's mergeDictionaries.
 */
export const en = {
  "nav.inbox": "Inbox",
  "nav.myWork": "My Work",
  "nav.focus": "Focus",
  "nav.projects": "Projects",
  "nav.copilot": "Copilot",
  "nav.analytics": "Analytics",
  "workspace.create": "Create workspace",
  "task.add": "Add a task and press Enter",
  "task.complete": "Complete {title}",
  "task.markComplete": "Mark complete",
  "task.delete": "Delete",
  "view.list": "List",
  "view.board": "Board",
  "view.calendar": "Calendar",
  "view.timeline": "Timeline",
  "copilot.generate": "Generate proposal",
  "copilot.applyN": "Apply {n}",
  "copilot.reject": "Reject",
  "state.loading": "Loading…",
  "state.offline": "You are offline. Changes are queued and will sync when you reconnect.",
  "state.syncing": "Syncing {n} change(s)…",
  "state.synced": "All changes saved",
  "state.conflict": "Reloaded — this changed elsewhere",
  "a11y.skipToContent": "Skip to main content",
} as const satisfies Dict;

export const nl: Dict = {
  "nav.inbox": "Postvak",
  "nav.myWork": "Mijn werk",
  "nav.focus": "Focus",
  "nav.projects": "Projecten",
  "nav.copilot": "Copilot",
  "nav.analytics": "Analyse",
  "workspace.create": "Werkruimte aanmaken",
  "task.add": "Voeg een taak toe en druk op Enter",
  "task.complete": "{title} voltooien",
  "task.markComplete": "Markeer als voltooid",
  "task.delete": "Verwijderen",
  "view.list": "Lijst",
  "view.board": "Bord",
  "view.calendar": "Kalender",
  "view.timeline": "Tijdlijn",
  "copilot.generate": "Voorstel genereren",
  "copilot.applyN": "{n} toepassen",
  "copilot.reject": "Afwijzen",
  "state.loading": "Laden…",
  "state.offline": "Je bent offline. Wijzigingen worden in de wachtrij gezet en gesynchroniseerd zodra je weer verbinding hebt.",
  "state.syncing": "{n} wijziging(en) synchroniseren…",
  "state.synced": "Alle wijzigingen opgeslagen",
  "state.conflict": "Opnieuw geladen — dit is elders gewijzigd",
  "a11y.skipToContent": "Ga naar hoofdinhoud",
};

export const fr: Dict = {
  "nav.inbox": "Boîte de réception",
  "nav.myWork": "Mon travail",
  "nav.focus": "Priorités",
  "nav.projects": "Projets",
  "nav.copilot": "Copilote",
  "nav.analytics": "Analyses",
  "workspace.create": "Créer un espace de travail",
  "task.add": "Ajoutez une tâche et appuyez sur Entrée",
  "task.complete": "Terminer {title}",
  "task.markComplete": "Marquer comme terminé",
  "task.delete": "Supprimer",
  "view.list": "Liste",
  "view.board": "Tableau",
  "view.calendar": "Calendrier",
  "view.timeline": "Chronologie",
  "copilot.generate": "Générer une proposition",
  "copilot.applyN": "Appliquer {n}",
  "copilot.reject": "Rejeter",
  "state.loading": "Chargement…",
  "state.offline": "Vous êtes hors ligne. Les modifications sont mises en file d'attente et seront synchronisées à la reconnexion.",
  "state.syncing": "Synchronisation de {n} modification(s)…",
  "state.synced": "Toutes les modifications sont enregistrées",
  "state.conflict": "Rechargé — modifié ailleurs",
  "a11y.skipToContent": "Aller au contenu principal",
};

export const appDictionaries = { en, nl, fr } as const;
export type MessageKey = keyof typeof en;
