"use client";

import { useState } from "react";
import { NODE_LEGEND, USE_CASES } from "./flows";
import { UseCaseFlow } from "./UseCaseFlow";

/**
 * Tabbed explorer: one large diagram at a time instead of four cramped
 * ones. The rail doubles as the use-case list, so the page reads top-down
 * without needing four separate canvases on screen at once.
 */
export function UseCaseExplorer() {
  const [activeId, setActiveId] = useState(USE_CASES[0].id);
  const active = USE_CASES.find((u) => u.id === activeId) ?? USE_CASES[0];

  return (
    <section className="ta-explorer">
      <div className="ta-explorer__rail" role="tablist" aria-label="Use cases">
        {USE_CASES.map((uc, i) => {
          const selected = uc.id === active.id;
          return (
            <button
              key={uc.id}
              type="button"
              role="tab"
              id={`ta-tab-${uc.id}`}
              aria-selected={selected}
              aria-controls={`ta-panel-${uc.id}`}
              tabIndex={selected ? 0 : -1}
              className="ta-explorer__tab"
              onClick={() => setActiveId(uc.id)}
            >
              <span className="ta-explorer__tabno">{String(i + 1).padStart(2, "0")}</span>
              <span className="ta-explorer__tabtitle">{uc.title}</span>
              <span className="ta-badge">{uc.tag}</span>
            </button>
          );
        })}
      </div>

      <div
        className="ta-explorer__panel"
        role="tabpanel"
        id={`ta-panel-${active.id}`}
        aria-labelledby={`ta-tab-${active.id}`}
      >
        <header className="ta-explorer__head">
          <h2>{active.title}</h2>
          <p>{active.body}</p>
        </header>

        <UseCaseFlow useCase={active} />

        <p className="ta-explorer__readas">
          <strong>How to read it:</strong> {active.readAs}
        </p>

        <ul className="ta-legend" aria-label="Diagram legend">
          {NODE_LEGEND.map((l) => (
            <li key={l.kind}>
              <span className="ta-legend__swatch" data-kind={l.kind} aria-hidden="true" />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
