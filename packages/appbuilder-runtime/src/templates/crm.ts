import { SPEC_SCHEMA_VERSION, type AppMetadataType, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "./types";

/** A small, constrained CRM starter — contacts and a deal pipeline board. */
export const crmTemplate: AppTemplate = {
  id: "crm",
  displayName: "CRM",
  description: "Contacts and a deal pipeline board.",
  build(app: AppMetadataType): ApplicationSpecificationType {
    return {
      schemaVersion: SPEC_SCHEMA_VERSION,
      app,
      branding: { theme: "system" },
      entities: [
        {
          id: "contact",
          machineName: "contact",
          name: "Contact",
          description: "A person or organization.",
          archived: false,
          fields: [
            { id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false },
            { id: "email", machineName: "email", name: "Email", type: "email", required: false, unique: false, archived: false },
          ],
          indexes: [],
        },
        {
          id: "deal",
          machineName: "deal",
          name: "Deal",
          description: "An opportunity moving through the pipeline.",
          archived: false,
          fields: [
            { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false },
            {
              id: "stage",
              machineName: "stage",
              name: "Stage",
              type: "select",
              required: true,
              unique: false,
              archived: false,
              multiple: false,
              options: [
                { value: "lead", label: "Lead" },
                { value: "qualified", label: "Qualified" },
                { value: "won", label: "Won" },
                { value: "lost", label: "Lost" },
              ],
            },
            { id: "value", machineName: "value", name: "Value", type: "decimal", required: false, unique: false, archived: false, decimalPlaces: 2 },
            {
              id: "contact_ref",
              machineName: "contact_ref",
              name: "Contact",
              type: "relation",
              required: false,
              unique: false,
              archived: false,
              relationId: "deal_contact",
            },
          ],
          indexes: [{ id: "idx_deal_stage", name: "By stage", fieldIds: ["stage"], unique: false }],
        },
      ],
      relations: [
        {
          id: "deal_contact",
          name: "Deal linked to Contact",
          fromEntityId: "deal",
          toEntityId: "contact",
          cardinality: "oneToMany",
          onDelete: "setNull",
          archived: false,
        },
      ],
      roles: [
        { id: "admin", name: "Admin", description: "Full access to contacts and deals.", archived: false },
        { id: "sales_rep", name: "Sales rep", description: "Manages their own contacts and deals.", archived: false },
      ],
      permissions: [
        { id: "perm_admin_contact_read", roleId: "admin", entityId: "contact", verb: "read", effect: "allow" },
        { id: "perm_admin_deal_read", roleId: "admin", entityId: "deal", verb: "read", effect: "allow" },
        { id: "perm_rep_contact_read", roleId: "sales_rep", entityId: "contact", verb: "read", effect: "allow" },
        { id: "perm_rep_deal_read", roleId: "sales_rep", entityId: "deal", verb: "read", effect: "allow" },
      ],
      navigation: [
        { id: "nav_dashboard", label: "Dashboard", targetPageId: "dashboard", order: 0 },
        { id: "nav_contacts", label: "Contacts", targetPageId: "contacts", order: 1 },
        { id: "nav_deals", label: "Deals", targetPageId: "deals", order: 2 },
        { id: "nav_settings", label: "Settings", targetPageId: "settings", order: 3, requiredRoleIds: ["admin"] },
      ],
      pages: [
        { id: "dashboard", name: "Dashboard", path: "dashboard", archived: false, components: [] },
        {
          id: "contacts",
          name: "Contacts",
          path: "contacts",
          archived: false,
          components: [
            { id: "contacts_table", kind: "dataTable", entityId: "contact", config: { variant: "table" }, order: 0 },
            { id: "contact_form", kind: "form", entityId: "contact", config: { variant: "form" }, order: 1 },
          ],
        },
        {
          id: "deals",
          name: "Deals",
          path: "deals",
          archived: false,
          components: [
            {
              id: "deals_board",
              kind: "dataTable",
              entityId: "deal",
              config: { variant: "kanban", groupByFieldId: "stage", cardTitleFieldId: "title" },
              order: 0,
            },
          ],
        },
        {
          id: "settings",
          name: "Settings",
          path: "settings",
          archived: false,
          requiredRoleIds: ["admin"],
          components: [
            {
              id: "app_settings",
              kind: "form",
              config: {
                variant: "settingsPanel",
                sections: [{ title: "General", fields: [{ label: "App name", value: app.name }] }],
              },
              order: 0,
            },
          ],
        },
      ],
      dashboard: {
        widgets: [
          { id: "widget_total_contacts", kind: "statWidget", entityId: "contact", config: { metric: "count" }, order: 0 },
          { id: "widget_open_deals", kind: "statWidget", entityId: "deal", config: { metric: "count", filter: "open" }, order: 1 },
          { id: "widget_deals_by_stage", kind: "chartWidget", entityId: "deal", config: { groupBy: "stage" }, order: 2 },
        ],
      },
      actions: [],
      workflows: [],
    };
  },
};
