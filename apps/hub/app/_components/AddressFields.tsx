"use client";

import { useState } from "react";
import { Button, FormRow, Input, Label, Select } from "@asafarim/ui";

export interface AddressFieldsValue {
  type: string;
  label: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  source: string;
}

export const EMPTY_ADDRESS: AddressFieldsValue = {
  type: "home",
  label: "",
  street1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  lat: null,
  lng: null,
  accuracy: null,
  source: "manual",
};

// Keep in sync with LocationTypeSchema in packages/auth/src/locations.ts.
const ADDRESS_TYPE_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "billing", label: "Billing" },
  { value: "shipping", label: "Shipping" },
  { value: "other", label: "Other" },
];

/** The reusable set of structured-address inputs (sign-up + profile). */
export function AddressFields({
  value,
  onChange,
  idPrefix = "addr",
}: {
  value: AddressFieldsValue;
  onChange: (next: AddressFieldsValue) => void;
  idPrefix?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState("");

  function set<K extends keyof AddressFieldsValue>(key: K, v: AddressFieldsValue[K]) {
    onChange({ ...value, [key]: v });
  }

  async function handleGeocodeAddress() {
    setGeocodeError("");
    if (!value.street1.trim()) {
      setGeocodeError("Enter a street address first.");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street1: value.street1,
          city: value.city,
          state: value.state,
          postalCode: value.postalCode,
          country: value.country,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | { lat: number; lng: number; formatted: string }
        | { error: string };
      if (!res.ok || !("lat" in data)) {
        setGeocodeError("error" in data ? data.error : "Couldn't look up that address.");
        return;
      }
      onChange({ ...value, lat: data.lat, lng: data.lng, accuracy: null, source: "geocoded" });
    } catch {
      setGeocodeError("Couldn't reach the address lookup service. Please try again.");
    } finally {
      setGeocoding(false);
    }
  }

  function handleUseMyLocation() {
    setLocationError("");
    if (!("geolocation" in navigator)) {
      setLocationError("This browser doesn't support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          ...value,
          lat: Math.round(position.coords.latitude * 1e6) / 1e6,
          lng: Math.round(position.coords.longitude * 1e6) / 1e6,
          accuracy: position.coords.accuracy ?? null,
          source: "browser",
        });
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. You can allow it in your browser's site settings, or enter coordinates manually."
            : "Couldn't determine your location. Please try again or enter coordinates manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <FormRow>
          <Label htmlFor={`${idPrefix}-type`}>Address type</Label>
          <Select
            id={`${idPrefix}-type`}
            options={ADDRESS_TYPE_OPTIONS}
            value={value.type}
            onChange={(e) => set("type", e.target.value)}
          />
        </FormRow>
        <FormRow>
          <Label htmlFor={`${idPrefix}-label`}>Custom label (optional)</Label>
          <Input
            id={`${idPrefix}-label`}
            value={value.label}
            onChange={(e) => set("label", e.target.value)}
            placeholder="e.g. My apartment"
            maxLength={50}
          />
        </FormRow>
      </div>
      <FormRow>
        <Label htmlFor={`${idPrefix}-street1`}>Street address</Label>
        <Input
          id={`${idPrefix}-street1`}
          value={value.street1}
          onChange={(e) => set("street1", e.target.value)}
          autoComplete="address-line1"
        />
      </FormRow>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
        <FormRow>
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
            autoComplete="address-level2"
          />
        </FormRow>
        <FormRow>
          <Label htmlFor={`${idPrefix}-postal`}>Postal code</Label>
          <Input
            id={`${idPrefix}-postal`}
            value={value.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            autoComplete="postal-code"
          />
        </FormRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.75rem" }}>
        <FormRow>
          <Label htmlFor={`${idPrefix}-state`}>State / region</Label>
          <Input
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(e) => set("state", e.target.value)}
            autoComplete="address-level1"
          />
        </FormRow>
        <FormRow>
          <Label htmlFor={`${idPrefix}-country`}>Country code</Label>
          <Input
            id={`${idPrefix}-country`}
            value={value.country}
            onChange={(e) => set("country", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="BE"
            maxLength={2}
            autoComplete="country"
          />
        </FormRow>
      </div>

      <FormRow>
        <Label>Coordinates</Label>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button type="button" size="sm" variant="secondary" onClick={handleGeocodeAddress} disabled={geocoding}>
            {geocoding ? "Looking up…" : "🔎 Look up from address"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleUseMyLocation} disabled={locating}>
            {locating ? "Locating…" : "📍 Use my current location"}
          </Button>
          {value.lat != null && value.lng != null ? (
            <span className="u-muted" style={{ fontSize: "var(--text-xs, 12px)" }}>
              {value.source === "browser"
                ? "From your device's current position"
                : value.source === "geocoded"
                  ? "Looked up from the address above"
                  : "Set manually"}
              {value.accuracy != null ? ` · ±${Math.round(value.accuracy)}m` : ""}
            </span>
          ) : null}
        </div>
        <p className="u-muted" style={{ fontSize: "var(--text-xs, 12px)", marginTop: "0.25rem" }}>
          "Look up from address" geocodes the fields above. "Use my current location" uses your
          device's GPS/network position instead — the two can disagree if you aren't physically
          at this address right now.
        </p>
        {geocodeError ? (
          <p className="u-muted" style={{ color: "var(--danger, #d33)", fontSize: "var(--text-xs, 12px)", marginTop: "0.25rem" }}>
            {geocodeError}
          </p>
        ) : null}
        {locationError ? (
          <p className="u-muted" style={{ color: "var(--danger, #d33)", fontSize: "var(--text-xs, 12px)", marginTop: "0.25rem" }}>
            {locationError}
          </p>
        ) : null}
      </FormRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <FormRow>
          <Label htmlFor={`${idPrefix}-lat`}>My latitude</Label>
          <Input
            id={`${idPrefix}-lat`}
            type="number"
            step="any"
            min={-90}
            max={90}
            value={value.lat ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set("lat", v === "" ? null : Number(v));
              if (value.source !== "manual") set("source", "manual");
            }}
            placeholder="e.g. 50.8503"
          />
        </FormRow>
        <FormRow>
          <Label htmlFor={`${idPrefix}-lng`}>My longitude</Label>
          <Input
            id={`${idPrefix}-lng`}
            type="number"
            step="any"
            min={-180}
            max={180}
            value={value.lng ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set("lng", v === "" ? null : Number(v));
              if (value.source !== "manual") set("source", "manual");
            }}
            placeholder="e.g. 4.3517"
          />
        </FormRow>
      </div>
    </>
  );
}
