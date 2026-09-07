"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
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

type StepData = { label: string; detail?: string; kind: NodeKind };
type StepNodeType = Node<StepData, "step">;

const TONE_COLOR = {
  default: "var(--line-strong)",
  ok: "var(--accent)",
  muted: "var(--muted)",
  warn: "var(--accent-2)",
} as const;

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
 * Renders one use-case graph. Panning and zooming are disabled so the
 * diagram reads as a static illustration that happens to be inspectable —
 * the page keeps scrolling normally over it.
 */
export function UseCaseFlow({ useCase }: { useCase: UseCase }) {
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
      const color = TONE_COLOR[e.tone ?? "default"];
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
  }, [useCase]);

  return (
    <div className="ta-fcanvas">
      <ReactFlow
        // remount on use-case change so fitView re-runs against the new graph
        key={useCase.id}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        minZoom={0.4}
        maxZoom={1}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--line)" />
      </ReactFlow>
    </div>
  );
}
