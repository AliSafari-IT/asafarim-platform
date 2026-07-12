"use client";

import { FormRow, Input, Label } from "@asafarim/ui";

export interface AddressFieldsValue {
  street1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const EMPTY_ADDRESS: AddressFieldsValue = {
  street1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

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
  function set<K extends keyof AddressFieldsValue>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  return (
    <>
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
            placeholder="US"
            maxLength={2}
            autoComplete="country"
          />
        </FormRow>
      </div>
    </>
  );
}
