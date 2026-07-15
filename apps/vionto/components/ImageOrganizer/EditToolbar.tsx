"use client";

import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Sun,
  Contrast,
  Palette,
  Undo2,
  Redo2,
  RotateCcw as ResetIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ImageEditState, EditAction } from "./types";

type EditToolbarProps = {
  editState: ImageEditState;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (action: EditAction | { type: "UNDO" } | { type: "REDO" }) => void;
  onReset: () => void;
};

export function EditToolbar({ editState, canUndo, canRedo, dispatch, onReset }: EditToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel-strong)] p-3 backdrop-blur-md">
      {/* Transform Buttons */}
      <div className="flex items-center gap-1">
        <ToolButton icon={<RotateCcw size={16} />} label="Rotate Left" onClick={() => dispatch({ type: "ROTATE_CCW" })} />
        <ToolButton icon={<RotateCw size={16} />} label="Rotate Right" onClick={() => dispatch({ type: "ROTATE_CW" })} />
        <Divider />
        <ToolButton icon={<FlipHorizontal size={16} />} label="Flip H" onClick={() => dispatch({ type: "FLIP_H" })} active={editState.flipH} />
        <ToolButton icon={<FlipVertical size={16} />} label="Flip V" onClick={() => dispatch({ type: "FLIP_V" })} active={editState.flipV} />
        <Divider />
        <ToolButton icon={<ZoomOut size={16} />} label="Zoom Out" onClick={() => dispatch({ type: "SET_ZOOM", value: Math.max(0.5, editState.zoom - 0.25) })} />
        <span className="min-w-[3rem] text-center text-xs font-medium text-[var(--color-text-muted)]">
          {Math.round(editState.zoom * 100)}%
        </span>
        <ToolButton icon={<ZoomIn size={16} />} label="Zoom In" onClick={() => dispatch({ type: "SET_ZOOM", value: Math.min(3, editState.zoom + 0.25) })} />
      </div>

      {/* Adjustment Sliders */}
      <div className="space-y-2">
        <SliderRow
          icon={<Sun size={14} />}
          label="Brightness"
          value={editState.brightness}
          onChange={(v) => dispatch({ type: "SET_BRIGHTNESS", value: v })}
        />
        <SliderRow
          icon={<Contrast size={14} />}
          label="Contrast"
          value={editState.contrast}
          onChange={(v) => dispatch({ type: "SET_CONTRAST", value: v })}
        />
        <SliderRow
          icon={<Palette size={14} />}
          label="Saturation"
          value={editState.saturation}
          onChange={(v) => dispatch({ type: "SET_SATURATION", value: v })}
        />
      </div>

      {/* Undo / Redo / Reset */}
      <div className="flex items-center gap-1 border-t border-[var(--color-border)] pt-2">
        <ToolButton icon={<Undo2 size={16} />} label="Undo" onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo} />
        <ToolButton icon={<Redo2 size={16} />} label="Redo" onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo} />
        <div className="flex-1" />
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-soft)] hover:text-[var(--coral)]"
        >
          <ResetIcon size={12} />
          Reset
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`rounded-lg p-2 transition ${
        disabled
          ? "cursor-not-allowed opacity-30"
          : active
            ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-soft)] hover:text-[var(--color-text)]"
      }`}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />;
}

function SliderRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--color-text-subtle)]">{icon}</span>
      <span className="w-16 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      <input
        type="range"
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-border)] accent-[var(--color-primary)] [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--color-primary)]"
      />
      <span className="w-8 text-right text-[10px] tabular-nums text-[var(--color-text-muted)]">{value}%</span>
    </div>
  );
}
