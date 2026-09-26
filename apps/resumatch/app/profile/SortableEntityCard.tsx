"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useTranslation } from "@asafarim/shared-i18n";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, ChevronUpIcon, GripIcon, TrashIcon } from "./icons";

export interface SortableEntityCardProps {
  /** Stable client-side id — see ProfileWorkbench's `*Ids` state; never the
   *  array index, which changes on every reorder and would confuse dnd-kit
   *  about which card is which mid-drag. */
  id: string;
  index: number;
  count: number;
  icon: ReactNode;
  title: string;
  variantClassName: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}

/**
 * One reorderable entity card (a role, a degree, a certification): drag by
 * the grip handle (mouse/touch, via dnd-kit), or the equivalent Up/Down
 * buttons — both are first-class, not one as a fallback for the other, so
 * reordering works the same on a trackpad, a touchscreen, or a keyboard.
 * Mirrors apps/timelineai's EventCard.tsx, the only other drag-reorderable
 * list in this monorepo.
 */
export function SortableEntityCard({
  id,
  index,
  count,
  icon,
  title,
  variantClassName,
  onMoveUp,
  onMoveDown,
  onRemove,
  removeLabel,
  children,
}: SortableEntityCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 1 : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className={`jm-entity-card ${variantClassName} jm-entity-card--stacked`}>
      <div className="jm-entity-card__head">
        <button
          type="button"
          className="jm-icon-button jm-icon-button--neutral jm-drag-handle"
          aria-label={t("resumatch.card.dragAria", { title })}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <span className="jm-entity-card__icon">{icon}</span>
        <strong style={{ flex: 1 }}>{title}</strong>
        <span className="jm-entity-card__reorder">
          <button
            type="button"
            className="jm-icon-button jm-icon-button--neutral"
            aria-label={t("resumatch.card.moveUpAria", { title })}
            onClick={onMoveUp}
            disabled={index === 0}
          >
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className="jm-icon-button jm-icon-button--neutral"
            aria-label={t("resumatch.card.moveDownAria", { title })}
            onClick={onMoveDown}
            disabled={index === count - 1}
          >
            <ChevronDownIcon />
          </button>
        </span>
        <button type="button" aria-label={removeLabel} className="jm-icon-button" onClick={onRemove}>
          <TrashIcon />
        </button>
      </div>
      {children}
    </li>
  );
}
