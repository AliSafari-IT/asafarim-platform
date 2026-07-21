import { blankTemplate } from "./blank";
import { bookingTemplate } from "./booking";
import { crmTemplate } from "./crm";
import { inventoryTemplate } from "./inventory";
import { taskManagementTemplate } from "./taskManagement";
import type { AppTemplate } from "./types";

/** Every template id here matches `apps/appbuilder`'s `StarterFamily` enum values one-to-one. */
const TEMPLATE_REGISTRY: AppTemplate[] = [
  blankTemplate,
  taskManagementTemplate,
  crmTemplate,
  inventoryTemplate,
  bookingTemplate,
];

export function listTemplates(): AppTemplate[] {
  return [...TEMPLATE_REGISTRY];
}

export function getTemplate(id: string): AppTemplate | undefined {
  return TEMPLATE_REGISTRY.find((template) => template.id === id);
}
