"use client";

import { useMemo, useState, type CSSProperties } from "react";

const PROMPT_TONES = {
  precise:
    "Use exact language, state assumptions, and separate facts from inference.",
  curious:
    "Explore competing explanations and surface the most useful unanswered question.",
  decisive:
    "Recommend one clear path, explain the trade-off, and end with the next action.",
} as const;

export function PromptComposerLab() {
  const [tone, setTone] = useState<keyof typeof PROMPT_TONES>("precise");
  const [depth, setDepth] = useState(3);
  const [structured, setStructured] = useState(true);

  return (
    <div className="labs-study labs-prompt-study">
      <div className="labs-study__toolbar" aria-label="Prompt controls">
        <div>
          <span className="labs-study__label">Voice</span>
          <div className="labs-study__choices">
            {(
              Object.keys(PROMPT_TONES) as Array<keyof typeof PROMPT_TONES>
            ).map((item) => (
              <button
                key={item}
                type="button"
                className={tone === item ? "is-active" : undefined}
                onClick={() => setTone(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <label className="labs-study__range">
          <span>
            <span className="labs-study__label">Depth</span>
            <strong>{depth}/5</strong>
          </span>
          <input
            type="range"
            min="1"
            max="5"
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          />
        </label>
        <label className="labs-study__toggle">
          <input
            type="checkbox"
            checked={structured}
            onChange={(event) => setStructured(event.target.checked)}
          />
          <span aria-hidden="true" /> Structured output
        </label>
      </div>
      <div className="labs-prompt-preview">
        <div className="labs-prompt-preview__topline">
          <span>COMPOSED INSTRUCTION</span>
          <span>
            {tone} · depth {depth}
          </span>
        </div>
        <p className="labs-prompt-preview__lead">
          You are a thoughtful product strategist helping a small team make a
          difficult decision.
        </p>
        <p>{PROMPT_TONES[tone]}</p>
        <p>
          Develop{" "}
          {depth === 1 ? "a concise answer" : `${depth} layers of reasoning`}{" "}
          using evidence the reader can inspect.
        </p>
        {structured ? (
          <div className="labs-prompt-preview__schema">
            <span>01 / finding</span>
            <span>02 / trade-off</span>
            <span>03 / next move</span>
          </div>
        ) : null}
        <div className="labs-prompt-preview__meter">
          <i style={{ width: `${28 + depth * 12}%` }} />
          <span>{54 + depth * 9} tokens</span>
        </div>
      </div>
    </div>
  );
}

const RETRIEVAL_DOCS = [
  { title: "Architecture decision log", score: 94, type: "primary" },
  { title: "Support themes · September", score: 82, type: "signal" },
  { title: "Launch retrospective", score: 71, type: "primary" },
  { title: "Draft positioning notes", score: 58, type: "draft" },
  { title: "Unrelated billing FAQ", score: 31, type: "noise" },
];

export function RetrievalThresholdStudio() {
  const [threshold, setThreshold] = useState(65);
  const included = RETRIEVAL_DOCS.filter(
    (document) => document.score >= threshold
  );

  return (
    <div className="labs-study labs-retrieval-study">
      <div className="labs-retrieval-head">
        <div>
          <span className="labs-study__label">Relevance threshold</span>
          <strong>{threshold}%</strong>
        </div>
        <span>
          {included.length} of {RETRIEVAL_DOCS.length} sources pass
        </span>
      </div>
      <input
        className="labs-retrieval-slider"
        aria-label="Relevance threshold"
        type="range"
        min="25"
        max="95"
        value={threshold}
        onChange={(event) => setThreshold(Number(event.target.value))}
      />
      <div className="labs-retrieval-scale" aria-hidden="true">
        <span>more context</span>
        <span>more precision</span>
      </div>
      <div className="labs-retrieval-list">
        {RETRIEVAL_DOCS.map((document) => {
          const passes = document.score >= threshold;
          return (
            <div
              className={passes ? "is-included" : "is-excluded"}
              key={document.title}
            >
              <span
                className="labs-retrieval-state"
                aria-label={passes ? "Included" : "Excluded"}
              >
                {passes ? "✓" : "×"}
              </span>
              <div>
                <strong>{document.title}</strong>
                <small>{document.type}</small>
              </div>
              <span className="labs-retrieval-bar">
                <i style={{ width: `${document.score}%` }} />
              </span>
              <b>{document.score}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AGENT_ROUTES = {
  research: ["Brief", "Search", "Read", "Compare", "Synthesize"],
  release: ["Diff", "Tests", "Risk", "Approve", "Ship"],
  incident: ["Alert", "Logs", "Trace", "Mitigate", "Review"],
} as const;

export function AgentRouteSandbox() {
  const [mission, setMission] = useState<keyof typeof AGENT_ROUTES>("research");
  const [guardrails, setGuardrails] = useState(true);
  const [runs, setRuns] = useState(0);
  const route = AGENT_ROUTES[mission];

  return (
    <div className="labs-study labs-agent-study">
      <div className="labs-study__toolbar">
        <div>
          <span className="labs-study__label">Mission</span>
          <div className="labs-study__choices">
            {(
              Object.keys(AGENT_ROUTES) as Array<keyof typeof AGENT_ROUTES>
            ).map((item) => (
              <button
                key={item}
                type="button"
                className={mission === item ? "is-active" : undefined}
                onClick={() => setMission(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <label className="labs-study__toggle">
          <input
            type="checkbox"
            checked={guardrails}
            onChange={(event) => setGuardrails(event.target.checked)}
          />
          <span aria-hidden="true" /> Approval gates
        </label>
        <button
          type="button"
          className="labs-study__run"
          onClick={() => setRuns((value) => value + 1)}
        >
          Run route ↗
        </button>
      </div>
      <div className="labs-agent-map">
        <div className="labs-agent-map__line" aria-hidden="true" />
        {route.map((step, index) => {
          const gated = guardrails && (index === 2 || index === 4);
          return (
            <div
              className={`labs-agent-node ${gated ? "is-gated" : ""}`}
              key={step}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i>{gated ? "◇" : "●"}</i>
              <strong>{step}</strong>
              <small>
                {gated ? "approval" : index === 0 ? "input" : "tool"}
              </small>
            </div>
          );
        })}
      </div>
      <div className="labs-agent-report">
        <span>route / {mission}</span>
        <span>{guardrails ? "2 gates" : "autonomous"}</span>
        <span>
          {runs ? `run ${String(runs).padStart(2, "0")} complete` : "ready"}
        </span>
      </div>
    </div>
  );
}

export function VoiceShapeLab() {
  const [warmth, setWarmth] = useState(64);
  const [pace, setPace] = useState(48);
  const [energy, setEnergy] = useState(72);
  const bars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, index) => {
        const wave = Math.abs(Math.sin(index * (0.22 + pace / 700)));
        return Math.max(8, Math.round(wave * energy * 0.72 + warmth * 0.18));
      }),
    [energy, pace, warmth]
  );

  return (
    <div className="labs-study labs-voice-study">
      <div className="labs-voice-stage">
        <div
          className="labs-voice-orb"
          style={{ "--voice-warmth": `${warmth}%` } as CSSProperties}
        >
          <span>VOICE / 01</span>
        </div>
        <div className="labs-waveform" aria-label="Generated voice waveform">
          {bars.map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
        <p>
          “The clearest interface is the one that already knows when to listen.”
        </p>
      </div>
      <div className="labs-voice-controls">
        {(["warmth", "pace", "energy"] as const).map((property) => {
          const value =
            property === "warmth"
              ? warmth
              : property === "pace"
                ? pace
                : energy;
          const setter =
            property === "warmth"
              ? setWarmth
              : property === "pace"
                ? setPace
                : setEnergy;
          return (
            <label className="labs-study__range" key={property}>
              <span>
                <span className="labs-study__label">{property}</span>
                <strong>{value}</strong>
              </span>
              <input
                type="range"
                min="10"
                max="95"
                value={value}
                onChange={(event) => setter(Number(event.target.value))}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function ContextBudgetGarden() {
  const [sources, setSources] = useState(34);
  const [history, setHistory] = useState(22);
  const [tools, setTools] = useState(14);
  const total = sources + history + tools;
  const answer = Math.max(0, 100 - total);
  const controls = [
    { label: "sources", value: sources, setter: setSources },
    { label: "history", value: history, setter: setHistory },
    { label: "tools", value: tools, setter: setTools },
  ];

  return (
    <div className="labs-study labs-budget-study">
      <div className="labs-budget-visual">
        <div
          className="labs-budget-ring labs-budget-ring--sources"
          style={
            { "--budget-size": `${36 + sources * 1.5}px` } as CSSProperties
          }
        >
          <span>
            sources
            <br />
            <strong>{sources}%</strong>
          </span>
        </div>
        <div
          className="labs-budget-ring labs-budget-ring--history"
          style={
            { "--budget-size": `${36 + history * 1.5}px` } as CSSProperties
          }
        >
          <span>
            history
            <br />
            <strong>{history}%</strong>
          </span>
        </div>
        <div
          className="labs-budget-ring labs-budget-ring--tools"
          style={{ "--budget-size": `${36 + tools * 1.5}px` } as CSSProperties}
        >
          <span>
            tools
            <br />
            <strong>{tools}%</strong>
          </span>
        </div>
        <div className="labs-budget-core">
          <span>answer</span>
          <strong>{answer}%</strong>
        </div>
      </div>
      <div className="labs-budget-controls">
        {controls.map(({ label, value, setter }) => (
          <label className="labs-study__range" key={label}>
            <span>
              <span className="labs-study__label">{label}</span>
              <strong>{value}%</strong>
            </span>
            <input
              type="range"
              min="5"
              max="50"
              value={value}
              onChange={(event) => setter(Number(event.target.value))}
            />
          </label>
        ))}
        <div className={`labs-budget-health ${answer < 15 ? "is-tight" : ""}`}>
          <span>available for answer</span>
          <strong>{answer}%</strong>
        </div>
      </div>
    </div>
  );
}
