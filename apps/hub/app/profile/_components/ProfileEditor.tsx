"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, FormRow, Input, Label, Textarea } from "@asafarim/ui";
import { AddressFields, EMPTY_ADDRESS, type AddressFieldsValue } from "../../_components/AddressFields";
import { LocationCard, type LocationLike } from "./LocationCard";
import styles from "./profile.module.css";

interface ProfileUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  image: string | null;
  bio: string | null;
  jobTitle: string | null;
  company: string | null;
  website: string | null;
  phone: string | null;
  preferredLocale: string | null;
  timezone: string | null;
}

async function parseJsonError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Something went wrong. Please try again.";
}

export function ProfileEditor({
  user,
  roles,
  initialLocations,
}: {
  user: ProfileUser;
  roles: string[];
  initialLocations: LocationLike[];
}) {
  const router = useRouter();

  const [name, setName] = useState(user.name ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [company, setCompany] = useState(user.company ?? "");
  const [website, setWebsite] = useState(user.website ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [timezone, setTimezone] = useState(user.timezone ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [locations, setLocations] = useState<LocationLike[]>(initialLocations);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newAddress, setNewAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS);
  const [addingLocation, setAddingLocation] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, bio, jobTitle, company, website, phone, timezone }),
      });
      if (!res.ok) {
        setError(await parseJsonError(res));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    setAddingLocation(true);
    setError("");
    try {
      const res = await fetch("/api/profile/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newAddress, isPrimary: locations.length === 0 }),
      });
      if (!res.ok) {
        setError(await parseJsonError(res));
        return;
      }
      const data = (await res.json()) as { location: LocationLike };
      setLocations((prev) => [...prev, data.location]);
      setNewAddress(EMPTY_ADDRESS);
      setShowAddLocation(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setAddingLocation(false);
    }
  }

  async function handleUpdateLocation(id: string, value: AddressFieldsValue) {
    const res = await fetch(`/api/profile/locations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    if (!res.ok) {
      setError(await parseJsonError(res));
      return;
    }
    const data = (await res.json()) as { location: LocationLike };
    setLocations((prev) => prev.map((loc) => (loc.id === id ? data.location : loc)));
  }

  async function handleDeleteLocation(id: string) {
    const res = await fetch(`/api/profile/locations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(await parseJsonError(res));
      return;
    }
    setLocations((prev) => prev.filter((loc) => loc.id !== id));
  }

  return (
    <div className={styles.grid}>
      <Card variant="elevated" title={user.name ?? "Unnamed"}>
        <p className="u-mono">@{user.username ?? "—"}</p>
        <p>{user.email}</p>
        <p>
          {roles.map((role) => (
            <span key={role} style={{ marginRight: "0.35rem" }}>
              <Badge tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>{role}</Badge>
            </span>
          ))}
        </p>
      </Card>

      <Card title="Edit your details">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {saved ? <Alert tone="info">Profile updated.</Alert> : null}

        <form onSubmit={handleSaveProfile}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <FormRow>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormRow>
            <FormRow>
              <Label htmlFor="username">Username</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} maxLength={24} />
            </FormRow>
          </div>

          <FormRow>
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
          </FormRow>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <FormRow>
              <Label htmlFor="jobTitle">Job title</Label>
              <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </FormRow>
            <FormRow>
              <Label htmlFor="company">Company</Label>
              <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </FormRow>
          </div>

          <FormRow>
            <Label htmlFor="website">Website</Label>
            <Input id="website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </FormRow>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <FormRow>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </FormRow>
            <FormRow>
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Amsterdam" />
            </FormRow>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </Card>

      <Card title="Addresses">
        {locations.map((loc) => (
          <LocationCard
            key={loc.id}
            location={loc}
            onUpdate={handleUpdateLocation}
            onDelete={handleDeleteLocation}
          />
        ))}

        {showAddLocation ? (
          <form onSubmit={handleAddLocation}>
            <AddressFields value={newAddress} onChange={setNewAddress} idPrefix="new-addr" />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button type="submit" size="sm" disabled={addingLocation}>
                {addingLocation ? "Adding…" : "Add address"}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddLocation(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <button type="button" className={styles.addToggle} onClick={() => setShowAddLocation(true)}>
            + Add an address
          </button>
        )}
      </Card>
    </div>
  );
}
