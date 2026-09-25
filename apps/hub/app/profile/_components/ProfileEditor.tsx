"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, ConfirmDialog, Input, Label, Textarea } from "@asafarim/ui";
import { AddressFields, EMPTY_ADDRESS, type AddressFieldsValue } from "../../_components/AddressFields";
import { LocationCard, type LocationLike } from "./LocationCard";
import { profileStrength } from "../../_lib/profile-strength";
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

type Details = {
  name: string;
  username: string;
  bio: string;
  jobTitle: string;
  company: string;
  website: string;
  phone: string;
  timezone: string;
};

async function parseJsonError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Something went wrong. Please try again.";
}

function toDetails(user: ProfileUser): Details {
  return {
    name: user.name ?? "",
    username: user.username ?? "",
    bio: user.bio ?? "",
    jobTitle: user.jobTitle ?? "",
    company: user.company ?? "",
    website: user.website ?? "",
    phone: user.phone ?? "",
    timezone: user.timezone ?? "",
  };
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
  const { update: updateSession } = useSession();

  // `baseline` is what the server last confirmed, so the save bar can tell
  // edited fields from saved ones without another round trip.
  const [baseline, setBaseline] = useState<Details>(() => toDetails(user));
  const [details, setDetails] = useState<Details>(() => toDetails(user));
  const [image, setImage] = useState(user.image ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [locations, setLocations] = useState<LocationLike[]>(initialLocations);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newAddress, setNewAddress] = useState<AddressFieldsValue>(EMPTY_ADDRESS);
  const [addingLocation, setAddingLocation] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LocationLike | null>(null);

  const dirty = useMemo(
    () => (Object.keys(details) as (keyof Details)[]).some((k) => details[k] !== baseline[k]),
    [details, baseline]
  );

  const completeness = profileStrength({
    ...baseline,
    image,
    locationCount: locations.length,
  });

  function set<K extends keyof Details>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSaved(false);
      setDetails((prev) => ({ ...prev, [key]: e.target.value }));
    };
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, image: image || null }),
      });
      if (!res.ok) {
        setError(await parseJsonError(res));
        return;
      }
      setBaseline(details);
      setSaved(true);
      await updateSession();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError(await parseJsonError(res));
        return;
      }
      const data = (await res.json()) as { image: string };
      setImage(data.image);
      // Re-sync the auth token so the header avatar (server-rendered from the
      // session) reflects the new image, then re-render server components.
      await updateSession();
      router.refresh();
    } catch {
      setError("Avatar upload failed. Please try again.");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    setError("");
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      if (!res.ok) {
        setError(await parseJsonError(res));
        return;
      }
      setImage("");
      await updateSession();
      router.refresh();
    } catch {
      setError("Failed to remove avatar. Please try again.");
    } finally {
      setUploadingAvatar(false);
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

  const displayName = baseline.name || baseline.username || user.email;
  const initial = displayName.charAt(0).toUpperCase();
  const facts = [
    { label: "Role", value: [baseline.jobTitle, baseline.company].filter(Boolean).join(" · ") },
    { label: "Website", value: baseline.website },
    { label: "Timezone", value: baseline.timezone },
  ];

  return (
    <div className={styles.layout}>
      {/* ─── Identity panel ─────────────────────────────────────────── */}
      <aside className={styles.identity} aria-label="Your identity">
        <div className={styles.cover} aria-hidden="true" />
        <div className={styles.avatarWrap}>
          {image ? (
            <img src={image} alt="" className={styles.avatar} width={88} height={88} />
          ) : (
            <span className={`${styles.avatar} ${styles.avatarFallback}`}>{initial}</span>
          )}
          <button
            type="button"
            className={styles.avatarEdit}
            disabled={uploadingAvatar}
            onClick={() => document.getElementById("avatar-upload")?.click()}
            aria-label={image ? "Change avatar" : "Add avatar"}
            title={image ? "Change avatar" : "Add avatar"}
          >
            {uploadingAvatar ? "…" : "✎"}
          </button>
          <input
            id="avatar-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            hidden
          />
        </div>

        <h2 className={styles.name}>{displayName}</h2>
        <p className={styles.handle}>@{baseline.username || "—"}</p>
        <p className={styles.email}>{user.email}</p>

        <div className={styles.roles}>
          {roles.map((role) => (
            <Badge key={role} tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>
              {role}
            </Badge>
          ))}
        </div>

        {image && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={handleRemoveAvatar}
            disabled={uploadingAvatar}
          >
            Remove avatar
          </button>
        )}

        <div className={styles.meter}>
          <div className={styles.meterRow}>
            <span>Profile strength</span>
            <strong>{completeness}%</strong>
          </div>
          <div className={styles.meterBar}>
            <div className={styles.meterFill} style={{ width: `${Math.max(completeness, 4)}%` }} />
          </div>
        </div>

        <dl className={styles.facts}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value || <span className={styles.missing}>Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </aside>

      {/* ─── Editor ─────────────────────────────────────────────────── */}
      <div className={styles.main}>
        <form className={styles.panel} onSubmit={handleSaveProfile}>
          {error ? <Alert tone="error">{error}</Alert> : null}

          <fieldset className={styles.group}>
            <legend>Basics</legend>
            <div className={styles.fields}>
              <div className={styles.field}>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={details.name} onChange={set("name")} autoComplete="name" />
              </div>
              <div className={styles.field}>
                <Label htmlFor="username">Username</Label>
                <Input id="username" value={details.username} onChange={set("username")} minLength={3} maxLength={24} />
              </div>
              <div className={styles.field}>
                <Label htmlFor="jobTitle">Job title</Label>
                <Input id="jobTitle" value={details.jobTitle} onChange={set("jobTitle")} autoComplete="organization-title" />
              </div>
              <div className={styles.field}>
                <Label htmlFor="company">Company</Label>
                <Input id="company" value={details.company} onChange={set("company")} autoComplete="organization" />
              </div>
              <div className={`${styles.field} ${styles.wide}`}>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  rows={3}
                  value={details.bio}
                  onChange={set("bio")}
                  placeholder="A line or two about what you build."
                />
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Contact</legend>
            <div className={`${styles.fields} ${styles.fields3}`}>
              <div className={styles.field}>
                <Label htmlFor="website">Website</Label>
                <Input id="website" type="url" value={details.website} onChange={set("website")} placeholder="https://" />
              </div>
              <div className={styles.field}>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={details.phone} onChange={set("phone")} autoComplete="tel" />
              </div>
              <div className={styles.field}>
                <div className={styles.labelRow}>
                  <Label htmlFor="timezone">Timezone</Label>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => {
                      setSaved(false);
                      setDetails((prev) => ({
                        ...prev,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      }));
                    }}
                  >
                    Detect
                  </button>
                </div>
                <Input id="timezone" value={details.timezone} onChange={set("timezone")} placeholder="Europe/Brussels" />
              </div>
            </div>
          </fieldset>

          <div className={styles.saveBar}>
            <span className={styles.saveState} data-state={dirty ? "dirty" : saved ? "saved" : "idle"}>
              {dirty ? "Unsaved changes" : saved ? "All changes saved" : "Up to date"}
            </span>
            {dirty && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDetails(baseline)} disabled={saving}>
                Discard
              </Button>
            )}
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        <section id="addresses" className={styles.panel} aria-labelledby="addresses-title">
          <div className={styles.panelHead}>
            <h2 id="addresses-title">Addresses</h2>
            {!showAddLocation && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddLocation(true)}>
                + Add address
              </Button>
            )}
          </div>

          {showAddLocation && (
            <form className={styles.addForm} onSubmit={handleAddLocation}>
              <AddressFields value={newAddress} onChange={setNewAddress} idPrefix="new-addr" />
              <div className={styles.actions}>
                <Button type="submit" size="sm" disabled={addingLocation}>
                  {addingLocation ? "Adding…" : "Add address"}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowAddLocation(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {locations.length > 0 ? (
            <div className={styles.locations}>
              {locations.map((loc) => (
                <LocationCard
                  key={loc.id}
                  location={loc}
                  onUpdate={handleUpdateLocation}
                  onDelete={async () => setPendingDelete(loc)}
                />
              ))}
            </div>
          ) : (
            !showAddLocation && <p className={styles.empty}>No addresses yet.</p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this address?"
        message={
          pendingDelete
            ? `“${pendingDelete.label || pendingDelete.type}” will be removed from your profile.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await handleDeleteLocation(target.id);
        }}
      />
    </div>
  );
}
