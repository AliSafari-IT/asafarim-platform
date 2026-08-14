"use client";

import { useState } from "react";
import { Badge, Button } from "@asafarim/ui";
import { AddressFields, type AddressFieldsValue } from "../../_components/AddressFields";
import styles from "./profile.module.css";

export interface LocationLike {
  id: string;
  type: string;
  label: string | null;
  street1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: string;
  isPrimary: boolean;
}

function toAddressValue(loc: LocationLike): AddressFieldsValue {
  return {
    type: loc.type || "home",
    label: loc.label ?? "",
    street1: loc.street1 ?? "",
    city: loc.city ?? "",
    state: loc.state ?? "",
    postalCode: loc.postalCode ?? "",
    country: loc.country ?? "",
    lat: loc.lat,
    lng: loc.lng,
    accuracy: loc.accuracy,
    source: loc.source,
  };
}

export function LocationCard({
  location,
  onUpdate,
  onDelete,
}: {
  location: LocationLike;
  onUpdate: (id: string, value: AddressFieldsValue) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<AddressFieldsValue>(toAddressValue(location));
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    setBusy(true);
    try {
      await onUpdate(location.id, value);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await onDelete(location.id);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className={styles.locationCard}>
        <AddressFields value={value} onChange={setValue} idPrefix={`loc-${location.id}`} />
        <div className={styles.locationActions} style={{ marginTop: "0.5rem" }}>
          <Button size="sm" onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const summary = [location.street1, location.city, location.state, location.postalCode, location.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={styles.locationCard}>
      <div className={styles.locationHead}>
        <span>
          <strong style={{ textTransform: "capitalize" }}>{location.label || location.type}</strong>{" "}
          {location.isPrimary ? <Badge tone="success">Primary</Badge> : null}
        </span>
      </div>
      <p className="u-muted">{summary || "No address details yet."}</p>
      {location.lat != null && location.lng != null ? (
        <p className="u-muted" style={{ fontSize: "var(--text-xs, 12px)" }}>
          📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          {location.source === "browser" ? " (from browser)" : ""}
        </p>
      ) : null}
      <div className={styles.locationActions}>
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
          Edit
        </Button>
        <Button size="sm" variant="danger" onClick={handleDelete} disabled={busy}>
          {busy ? "Removing…" : "Remove"}
        </Button>
      </div>
    </div>
  );
}
