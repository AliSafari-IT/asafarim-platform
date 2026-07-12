export interface PipelineDiagramStage {
  label: string;
}

export interface PipelineDiagramProps {
  stages: PipelineDiagramStage[];
}

/**
 * Compact animated pipeline diagram: a horizontal chain of stage nodes with a
 * subtle CSS-only flow animation along each connector. Pure CSS, no SVG —
 * mirrors PlatformMap's approach. Respects prefers-reduced-motion.
 */
export function PipelineDiagram({ stages }: PipelineDiagramProps) {
  return (
    <div className="ui-pipelinediagram" role="img" aria-label={`Pipeline: ${stages.map((s) => s.label).join(" → ")}`}>
      {stages.map((stage, i) => (
        <span key={stage.label} className="ui-pipelinediagram__segment">
          <span className="ui-pipelinediagram__node">{stage.label}</span>
          {i < stages.length - 1 ? (
            <span className="ui-pipelinediagram__connector" aria-hidden="true">
              <span className="ui-pipelinediagram__pulse" />
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
