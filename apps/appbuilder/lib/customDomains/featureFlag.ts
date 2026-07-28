/**
 * M12 custom-domain readiness feature flag. Unset (or any value other than
 * the literal string "true") means custom domains are NOT enabled — the
 * data model and readiness flow exist (see lib/customDomains/requests.ts
 * and the `custom_domain_requests` table), but nothing provisions DNS,
 * issues a TLS certificate, or routes traffic. See
 * docs/appbuilder-m12-custom-domain-readiness.md.
 *
 * This flag is process-wide (env-only), never a database row or per-app
 * setting — flipping it on is an explicit, deliberate deploy-time decision,
 * not something any app owner or API call can toggle.
 */
export function isCustomDomainsEnabled(): boolean {
  return process.env.APPBUILDER_CUSTOM_DOMAINS_ENABLED === "true";
}
