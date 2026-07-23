/** Config-driven, no live data binding (mirrors M06's SettingsPanelRenderer exactly — settings content IS the spec's config, not fetched). */
export interface LiveSettingsPanelProps {
  sections: Array<{ title: string; fields: Array<{ label: string; value?: string }> }>;
}

export function LiveSettingsPanel({ sections }: LiveSettingsPanelProps) {
  if (sections.length === 0) {
    return <p className="ab-hint">This settings panel has no sections yet.</p>;
  }
  return (
    <div className="ab-settings">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="ab-settings__section">
          <h3>{section.title}</h3>
          <dl>
            {section.fields.map((field, fieldIndex) => (
              <div className="ab-settings__row" key={`${field.label}-${fieldIndex}`}>
                <dt>{field.label}</dt>
                <dd>{field.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
