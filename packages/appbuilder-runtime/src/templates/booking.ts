import { SPEC_SCHEMA_VERSION, type AppMetadataType, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "./types";

/** A small, constrained bookings/operations starter — a resource schedule. */
export const bookingTemplate: AppTemplate = {
  id: "booking",
  displayName: "Booking / operations",
  description: "Bookings against a set of bookable resources, with a schedule view.",
  build(app: AppMetadataType): ApplicationSpecificationType {
    return {
      schemaVersion: SPEC_SCHEMA_VERSION,
      app,
      branding: { theme: "system" },
      entities: [
        {
          id: "resource",
          machineName: "resource",
          name: "Resource",
          description: "A bookable room, seat, or piece of equipment.",
          archived: false,
          fields: [{ id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false }],
          indexes: [],
        },
        {
          id: "booking",
          machineName: "booking",
          name: "Booking",
          description: "A reservation of a resource.",
          archived: false,
          fields: [
            { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false },
            { id: "starts_on", machineName: "starts_on", name: "Starts on", type: "date", required: true, unique: false, archived: false },
            {
              id: "status",
              machineName: "status",
              name: "Status",
              type: "select",
              required: true,
              unique: false,
              archived: false,
              multiple: false,
              options: [
                { value: "requested", label: "Requested" },
                { value: "confirmed", label: "Confirmed" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
            {
              id: "resource_ref",
              machineName: "resource_ref",
              name: "Resource",
              type: "relation",
              required: true,
              unique: false,
              archived: false,
              relationId: "booking_resource",
            },
          ],
          indexes: [{ id: "idx_booking_status", name: "By status", fieldIds: ["status"], unique: false }],
        },
      ],
      relations: [
        {
          id: "booking_resource",
          name: "Booking reserves Resource",
          fromEntityId: "booking",
          toEntityId: "resource",
          cardinality: "oneToMany",
          onDelete: "cascade",
          archived: false,
        },
      ],
      roles: [
        { id: "admin", name: "Admin", description: "Full access to resources and bookings.", archived: false },
        { id: "front_desk", name: "Front desk", description: "Creates and manages bookings.", archived: false },
      ],
      permissions: [
        { id: "perm_admin_resource_read", roleId: "admin", entityId: "resource", verb: "read", effect: "allow" },
        { id: "perm_admin_booking_read", roleId: "admin", entityId: "booking", verb: "read", effect: "allow" },
        { id: "perm_desk_booking_read", roleId: "front_desk", entityId: "booking", verb: "read", effect: "allow" },
        { id: "perm_desk_booking_create", roleId: "front_desk", entityId: "booking", verb: "create", effect: "allow" },
      ],
      navigation: [
        { id: "nav_dashboard", label: "Dashboard", targetPageId: "dashboard", order: 0 },
        { id: "nav_schedule", label: "Schedule", targetPageId: "schedule", order: 1 },
        { id: "nav_resources", label: "Resources", targetPageId: "resources", order: 2 },
        { id: "nav_settings", label: "Settings", targetPageId: "settings", order: 3, requiredRoleIds: ["admin"] },
      ],
      pages: [
        { id: "dashboard", name: "Dashboard", path: "dashboard", archived: false, components: [] },
        {
          id: "schedule",
          name: "Schedule",
          path: "schedule",
          archived: false,
          components: [
            {
              id: "bookings_schedule",
              kind: "dataTable",
              entityId: "booking",
              config: { variant: "calendar", dateFieldId: "starts_on", titleFieldId: "title" },
              order: 0,
            },
            { id: "bookings_table", kind: "dataTable", entityId: "booking", config: { variant: "table" }, order: 1 },
          ],
        },
        {
          id: "resources",
          name: "Resources",
          path: "resources",
          archived: false,
          components: [{ id: "resources_table", kind: "dataTable", entityId: "resource", config: { variant: "table" }, order: 0 }],
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
          { id: "widget_total_bookings", kind: "statWidget", entityId: "booking", config: { metric: "count" }, order: 0 },
          { id: "widget_bookings_by_status", kind: "chartWidget", entityId: "booking", config: { groupBy: "status" }, order: 1 },
        ],
      },
      actions: [],
      workflows: [],
    };
  },
};
