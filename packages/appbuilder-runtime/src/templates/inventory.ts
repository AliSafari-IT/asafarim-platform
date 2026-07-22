import { SPEC_SCHEMA_VERSION, type AppMetadataType, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "./types";

/** A small, constrained inventory starter — stock items and a stock-level dashboard. */
export const inventoryTemplate: AppTemplate = {
  id: "inventory",
  displayName: "Inventory",
  description: "Stock items with quantity and a low-stock dashboard.",
  build(app: AppMetadataType): ApplicationSpecificationType {
    return {
      schemaVersion: SPEC_SCHEMA_VERSION,
      app,
      branding: { theme: "system" },
      entities: [
        {
          id: "item",
          machineName: "item",
          name: "Item",
          description: "A stock keeping unit.",
          archived: false,
          fields: [
            { id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false },
            { id: "sku", machineName: "sku", name: "SKU", type: "text", required: true, unique: true, archived: false },
            { id: "quantity", machineName: "quantity", name: "Quantity", type: "integer", required: true, unique: false, archived: false, min: 0 },
            {
              id: "category",
              machineName: "category",
              name: "Category",
              type: "select",
              required: true,
              unique: false,
              archived: false,
              multiple: false,
              options: [
                { value: "raw_material", label: "Raw material" },
                { value: "finished_good", label: "Finished good" },
                { value: "packaging", label: "Packaging" },
              ],
            },
          ],
          indexes: [{ id: "idx_item_category", name: "By category", fieldIds: ["category"], unique: false }],
        },
      ],
      relations: [],
      roles: [
        { id: "admin", name: "Admin", description: "Full access to inventory.", archived: false },
        { id: "warehouse_staff", name: "Warehouse staff", description: "Views and adjusts stock levels.", archived: false },
      ],
      permissions: [
        { id: "perm_admin_item_read", roleId: "admin", entityId: "item", verb: "read", effect: "allow" },
        { id: "perm_staff_item_read", roleId: "warehouse_staff", entityId: "item", verb: "read", effect: "allow" },
        { id: "perm_staff_item_update", roleId: "warehouse_staff", entityId: "item", verb: "update", effect: "allow" },
      ],
      navigation: [
        { id: "nav_dashboard", label: "Dashboard", targetPageId: "dashboard", order: 0 },
        { id: "nav_items", label: "Items", targetPageId: "items", order: 1 },
        { id: "nav_settings", label: "Settings", targetPageId: "settings", order: 2, requiredRoleIds: ["admin"] },
      ],
      pages: [
        { id: "dashboard", name: "Dashboard", path: "dashboard", archived: false, components: [] },
        {
          id: "items",
          name: "Items",
          path: "items",
          archived: false,
          components: [
            { id: "items_table", kind: "dataTable", entityId: "item", config: { variant: "table" }, order: 0 },
            { id: "item_form", kind: "form", entityId: "item", config: { variant: "form" }, order: 1 },
            { id: "item_detail", kind: "detailView", entityId: "item", config: { variant: "detail" }, order: 2 },
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
          { id: "widget_total_items", kind: "statWidget", entityId: "item", config: { metric: "count" }, order: 0 },
          { id: "widget_items_by_category", kind: "chartWidget", entityId: "item", config: { groupBy: "category" }, order: 1 },
        ],
      },
      actions: [],
      workflows: [],
    };
  },
};
