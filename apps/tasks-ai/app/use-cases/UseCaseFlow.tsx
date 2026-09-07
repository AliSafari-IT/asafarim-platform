"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { NodeKind, UseCase } from "./flows";
import { useToneColors } from "./useToneColors";

type StepData = { label: string; detail?: string; kind: NodeKind };
type StepNodeType = Node<StepData, "step">;

function StepNode({ data }: NodeProps<StepNodeType>) {
  return (
    <div className="ta-fnode" data-kind={data.kind}>
      <Handle type="target" position={Position.Left} id="tl" />
      <Handle type="target" position={Position.Top} id="tt" />
      <span className="ta-fnode__label">{data.label}</span>
      {data.detail ? <span className="ta-fnode__detail">{data.detail}</span> : null}
      <Handle type="source" position={Position.Right} id="sr" />
      <Handle type="source" position={Position.Bottom} id="sb" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

/**
 * Renders one use-case graph.
 *
 * Zoom is available three ways so small labels are never a dead end:
 * the built-in Controls (+ / - / fit), ctrl-scroll or pinch, and an
 * "Enlarge" mode that takes the diagram full-viewport. Plain scrolling
 * still scrolls the page.
 */
export function UseCaseFlow({ useCase }: { useCase: UseCase }) {
  const [expanded, setExpanded] = useState(false);
  const tone = useToneColors();

  // Escape closes the enlarged view; lock page scroll while it is open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const { nodes, edges } = useMemo(() => {
    const nodes: StepNodeType[] = useCase.nodes.map((n) => ({
      id: n.id,
      type: "step" as const,
      position: { x: n.x, y: n.y },
      data: { label: n.label, detail: n.detail, kind: n.kind },
      draggable: false,
      connectable: false,
    }));

    const edges: Edge[] = useCase.edges.map((e, i) => {
      const color = tone[e.tone ?? "default"];
      return {
        id: `${useCase.id}-e${i}`,
        source: e.from,
        target: e.to,
        sourceHandle: e.loop ? "sb" : "sr",
        targetHandle: e.loop ? "tt" : "tl",
        type: "smoothstep",
        animated: e.tone !== "muted",
        label: e.label,
        labelShowBg: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: e.tone === "muted" ? "4 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });

    return { nodes, edges };
  }, [useCase, tone]);

  const canvas = (
    <ReactFlow
      // remount when the graph or the container size changes so fitView re-runs
      key={`${useCase.id}-${expanded ? "full" : "inline"}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.08 }}
      minZoom={0.4}
      maxZoom={2.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      // drag to pan once zoomed in; ctrl/⌘-scroll and pinch zoom, so a plain
      // wheel scroll still moves the page
      panOnDrag
      panOnScroll={false}
      zoomOnScroll={false}
      zoomOnPinch
      zoomOnDoubleClick
      preventScrolling={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color={tone.muted} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );

  return (
    <>
      <div className="ta-fcanvas">
        <button
          type="button"
          className="ta-fcanvas__zoom"
          onClick={() => setExpanded(true)}
          aria-label="Enlarge diagram"
        >
          Enlarge
        </button>
        {canvas}
      </div>
      <p className="ta-fcanvas__hint">
        Too small? Use the <strong>+ / −</strong> controls, <kbd>Ctrl</kbd> +
        scroll to zoom, drag to pan — or <strong>Enlarge</strong> for the
        full-screen view.
      </p>

      {expanded ? (
        <div
          className="ta-fmodal"
          role="dialog"
          aria-modal="true"
          aria-label={`${useCase.title} — enlarged diagram`}
        >
          <button
            type="button"
            className="ta-fmodal__backdrop"
            onClick={() => setExpanded(false)}
            aria-label="Close enlarged diagram"
          />
          <div className="ta-fmodal__panel">
            <header className="ta-fmodal__head">
              <h3>{useCase.title}</h3>
              <button
                type="button"
                className="ta-fcanvas__zoom"
                onClick={() => setExpanded(false)}
              >
                Close (Esc)
              </button>
            </header>
            <div className="ta-fmodal__canvas">{canvas}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
