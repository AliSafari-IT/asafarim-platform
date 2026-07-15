import type { Dict } from "../types";

/** Base English dictionary — fallback for every other locale. */
const en: Dict = {
  // Common actions
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.signIn": "Sign in",
  "common.signOut": "Sign out",
  "common.signUp": "Sign up",
  "common.loading": "Loading…",
  "common.search": "Search",
  "common.close": "Close",
  "common.language": "Language",
  "common.country": "Country",

  // Portal nav / marketing
  "portal.nav.capabilities": "Capabilities",
  "portal.nav.work": "Work",
  "portal.nav.process": "Process",
  "portal.nav.stack": "Stack",
  "portal.nav.contact": "Contact",
  "portal.nav.admin": "Admin",
  "portal.hero.eyebrow": "Product engineering partner",
  "portal.hero.cta": "Start a project",

  // Content Generator
  "cg.nav.generator": "Generator",
  "cg.nav.library": "Library",
  "cg.nav.templates": "Templates",
  "cg.nav.history": "History",
  "cg.nav.settings": "Settings",
  "cg.header.aiEngine": "AI Engine",
  "cg.generate.button": "Generate",
  "cg.generate.hint": "Describe what you want to create",
};

export default en;
