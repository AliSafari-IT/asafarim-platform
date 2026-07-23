import { SPEC_SCHEMA_VERSION, type AppMetadataType, type ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { AppTemplate } from "./types";

/**
 * A generic task/project-management starter — the same shape family as the
 * M04 `constructionTaskManagementFixture` (project/task/team-member
 * entities, roles, a dashboard, and a full page/navigation set), but
 * industry-neutral wording so it fits any internal business app rather than
 * only construction. Exercises most of the M06 registry in one
 * specification: data table, form, record detail, Kanban board, calendar
 * view, dashboard metric cards, an accessible chart, and a settings panel.
 */
export const taskManagementTemplate: AppTemplate = {
  id: "task_management",
  displayName: "Task / project management",
  description: "Projects, tasks, and a team roster with a dashboard, board, and schedule view.",
  build(app: AppMetadataType): ApplicationSpecificationType {
    return {
      schemaVersion: SPEC_SCHEMA_VERSION,
      app,
      branding: { theme: "system" },
      entities: [
        {
          id: "project",
          machineName: "project",
          name: "Project",
          description: "A body of work with a deadline.",
          archived: false,
          fields: [
            { id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false },
            {
              id: "description",
              machineName: "description",
              name: "Description",
              type: "longText",
              required: false,
              unique: false,
              archived: false,
            },
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
                { value: "planning", label: "Planning" },
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
              ],
            },
            { id: "deadline", machineName: "deadline", name: "Deadline", type: "date", required: false, unique: false, archived: false },
          ],
          indexes: [{ id: "idx_project_status", name: "By status", fieldIds: ["status"], unique: false }],
        },
        {
          id: "task",
          machineName: "task",
          name: "Task",
          description: "A unit of work on a project.",
          archived: false,
          fields: [
            { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false },
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
                { value: "todo", label: "To do" },
                { value: "in_progress", label: "In progress" },
                { value: "done", label: "Done" },
              ],
            },
            {
              id: "priority",
              machineName: "priority",
              name: "Priority",
              type: "select",
              required: true,
              unique: false,
              archived: false,
              multiple: false,
              options: [
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ],
            },
            { id: "due_date", machineName: "due_date", name: "Due date", type: "date", required: false, unique: false, archived: false },
            {
              id: "project_ref",
              machineName: "project_ref",
              name: "Project",
              type: "relation",
              required: true,
              unique: false,
              archived: false,
              relationId: "task_project",
            },
            {
              id: "assignee_ref",
              machineName: "assignee_ref",
              name: "Assignee",
              type: "relation",
              required: false,
              unique: false,
              archived: false,
              relationId: "task_assignee",
            },
          ],
          indexes: [{ id: "idx_task_status", name: "By status", fieldIds: ["status"], unique: false }],
        },
        {
          id: "team_member",
          machineName: "team_member",
          name: "Team member",
          description: "A person on the team.",
          archived: false,
          fields: [
            { id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false },
            { id: "email", machineName: "email", name: "Email", type: "email", required: true, unique: true, archived: false },
            {
              id: "job_role",
              machineName: "job_role",
              name: "Role",
              type: "select",
              required: true,
              unique: false,
              archived: false,
              multiple: false,
              options: [
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Manager" },
                { value: "employee", label: "Employee" },
              ],
            },
          ],
          indexes: [],
        },
      ],
      relations: [
        {
          id: "task_project",
          name: "Task belongs to Project",
          fromEntityId: "task",
          toEntityId: "project",
          cardinality: "oneToMany",
          onDelete: "cascade",
          archived: false,
        },
        {
          id: "task_assignee",
          name: "Task assigned to Team member",
          fromEntityId: "task",
          toEntityId: "team_member",
          cardinality: "oneToMany",
          onDelete: "setNull",
          archived: false,
        },
      ],
      roles: [
        { id: "admin", name: "Admin", description: "Full access to every project, task, and team setting.", archived: false },
        { id: "manager", name: "Manager", description: "Creates and manages projects and tasks; cannot change team roles.", archived: false },
        { id: "employee_role", name: "Employee", description: "Views assigned projects and updates their own tasks.", archived: false },
      ],
      permissions: [
        { id: "perm_admin_project_create", roleId: "admin", entityId: "project", verb: "create", effect: "allow" },
        { id: "perm_admin_project_read", roleId: "admin", entityId: "project", verb: "read", effect: "allow" },
        { id: "perm_admin_project_update", roleId: "admin", entityId: "project", verb: "update", effect: "allow" },
        { id: "perm_admin_project_delete", roleId: "admin", entityId: "project", verb: "delete", effect: "allow" },
        { id: "perm_admin_task_create", roleId: "admin", entityId: "task", verb: "create", effect: "allow" },
        { id: "perm_admin_task_read", roleId: "admin", entityId: "task", verb: "read", effect: "allow" },
        { id: "perm_admin_task_update", roleId: "admin", entityId: "task", verb: "update", effect: "allow" },
        { id: "perm_admin_task_delete", roleId: "admin", entityId: "task", verb: "delete", effect: "allow" },
        { id: "perm_manager_project_create", roleId: "manager", entityId: "project", verb: "create", effect: "allow" },
        { id: "perm_manager_project_read", roleId: "manager", entityId: "project", verb: "read", effect: "allow" },
        { id: "perm_manager_project_update", roleId: "manager", entityId: "project", verb: "update", effect: "allow" },
        { id: "perm_manager_task_create", roleId: "manager", entityId: "task", verb: "create", effect: "allow" },
        { id: "perm_manager_task_read", roleId: "manager", entityId: "task", verb: "read", effect: "allow" },
        { id: "perm_manager_task_update", roleId: "manager", entityId: "task", verb: "update", effect: "allow" },
        { id: "perm_employee_task_read", roleId: "employee_role", entityId: "task", verb: "read", effect: "allow" },
        { id: "perm_employee_task_update", roleId: "employee_role", entityId: "task", verb: "update", effect: "allow" },
        { id: "perm_employee_project_read", roleId: "employee_role", entityId: "project", verb: "read", effect: "allow" },
        // team_member: admin manages the roster; manager/employee need at
        // least read to resolve a task's assignee (see the `assignee_ref`
        // relation field below) and to view the Team page — but per the
        // "manager" role's own description ("cannot change team roles"),
        // only admin may create/update/delete team members.
        { id: "perm_admin_team_member_create", roleId: "admin", entityId: "team_member", verb: "create", effect: "allow" },
        { id: "perm_admin_team_member_read", roleId: "admin", entityId: "team_member", verb: "read", effect: "allow" },
        { id: "perm_admin_team_member_update", roleId: "admin", entityId: "team_member", verb: "update", effect: "allow" },
        { id: "perm_admin_team_member_delete", roleId: "admin", entityId: "team_member", verb: "delete", effect: "allow" },
        { id: "perm_manager_team_member_read", roleId: "manager", entityId: "team_member", verb: "read", effect: "allow" },
        { id: "perm_employee_team_member_read", roleId: "employee_role", entityId: "team_member", verb: "read", effect: "allow" },
      ],
      navigation: [
        { id: "nav_dashboard", label: "Dashboard", targetPageId: "dashboard", order: 0 },
        { id: "nav_projects", label: "Projects", targetPageId: "projects", order: 1 },
        { id: "nav_tasks", label: "Tasks", targetPageId: "tasks", order: 2 },
        { id: "nav_board", label: "Board", targetPageId: "board", order: 3 },
        { id: "nav_schedule", label: "Schedule", targetPageId: "schedule", order: 4 },
        { id: "nav_team", label: "Team", targetPageId: "team", order: 5, requiredRoleIds: ["admin", "manager"] },
        { id: "nav_settings", label: "Settings", targetPageId: "settings", order: 6, requiredRoleIds: ["admin"] },
      ],
      pages: [
        { id: "dashboard", name: "Dashboard", path: "dashboard", archived: false, components: [] },
        {
          id: "projects",
          name: "Projects",
          path: "projects",
          archived: false,
          components: [
            { id: "projects_table", kind: "dataTable", entityId: "project", config: { variant: "table" }, order: 0 },
            { id: "project_form", kind: "form", entityId: "project", config: { variant: "form" }, order: 1 },
          ],
        },
        {
          id: "tasks",
          name: "Tasks",
          path: "tasks",
          archived: false,
          components: [
            { id: "tasks_table", kind: "dataTable", entityId: "task", config: { variant: "table" }, order: 0 },
            { id: "task_detail", kind: "detailView", entityId: "task", config: { variant: "detail" }, order: 1 },
            { id: "task_form", kind: "form", entityId: "task", config: { variant: "form", submitLabel: "Create task" }, order: 2 },
          ],
        },
        {
          id: "board",
          name: "Board",
          path: "board",
          archived: false,
          components: [
            {
              id: "tasks_board",
              kind: "dataTable",
              entityId: "task",
              config: { variant: "kanban", groupByFieldId: "status", cardTitleFieldId: "title" },
              order: 0,
            },
          ],
        },
        {
          id: "schedule",
          name: "Schedule",
          path: "schedule",
          archived: false,
          components: [
            {
              id: "tasks_schedule",
              kind: "dataTable",
              entityId: "task",
              config: { variant: "calendar", dateFieldId: "due_date", titleFieldId: "title" },
              order: 0,
            },
          ],
        },
        {
          id: "team",
          name: "Team",
          path: "team",
          archived: false,
          requiredRoleIds: ["admin", "manager"],
          components: [{ id: "team_table", kind: "dataTable", entityId: "team_member", config: { variant: "table" }, order: 0 }],
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
                sections: [
                  {
                    title: "General",
                    fields: [
                      { label: "App name", value: app.name },
                      { label: "Description", value: app.description ?? "—" },
                    ],
                  },
                  {
                    title: "Roles",
                    fields: [
                      { label: "Admin", value: "Full access to every project, task, and team setting." },
                      { label: "Manager", value: "Creates and manages projects and tasks." },
                      { label: "Employee", value: "Views assigned projects and updates their own tasks." },
                    ],
                  },
                ],
              },
              order: 0,
            },
          ],
        },
      ],
      dashboard: {
        widgets: [
          { id: "widget_total_projects", kind: "statWidget", entityId: "project", config: { metric: "count" }, order: 0 },
          { id: "widget_open_tasks", kind: "statWidget", entityId: "task", config: { metric: "count", filter: "open" }, order: 1 },
          { id: "widget_tasks_by_status", kind: "chartWidget", entityId: "task", config: { groupBy: "status" }, order: 2 },
        ],
      },
      actions: [
        { id: "action_create_task", name: "Create Task", kind: "createRecord", entityId: "task", config: {}, archived: false },
        {
          id: "action_mark_complete",
          name: "Mark Complete",
          kind: "updateRecord",
          entityId: "task",
          config: { set: { status: "done" } },
          archived: false,
        },
      ],
      workflows: [],
    };
  },
};
