"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type DomainBrand,
  fileToLogoDataUrl,
  getDomainBrand,
  setDomainBrand,
} from "@/lib/domain-logos";

/** "Acme App, a product of Acme Inc." from whatever names are present. */
function brandCaption(brand: DomainBrand): string {
  const product = brand.productName?.trim();
  const company = brand.companyName?.trim();
  if (product && company) return `${product}, a product of ${company}`;
  if (product) return product;
  if (company) return `A product of ${company}`;
  return "";
}

/**
 * Set the product + company branding for a domain (host). Stored in
 * localStorage and embedded into exported HTML/PDF reports for runs against
 * that domain.
 */
export function DomainBrandControl({
  host,
  defaultBrand,
  disabled,
}: {
  host: string;
  defaultBrand?: DomainBrand;
  disabled?: boolean;
}) {
  const [brand, setBrand] = useState<DomainBrand>({});
  const [busy, setBusy] = useState<"product" | "company" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getDomainBrand(host);
    const empty =
      !stored.productName && !stored.companyName && !stored.productLogo && !stored.companyLogo;
    setBrand(empty && defaultBrand ? { ...defaultBrand } : stored);
    setError(null);
  }, [host, defaultBrand]);

  function update(patch: Partial<DomainBrand>) {
    const next = { ...brand, ...patch };
    setBrand(next);
    setDomainBrand(host, next);
  }

  async function pick(which: "product" | "company", file: File | undefined) {
    if (!file) return;
    setBusy(which);
    setError(null);
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      update(which === "product" ? { productLogo: dataUrl } : { companyLogo: dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the image.");
    } finally {
      setBusy(null);
    }
  }

  const caption = brandCaption(brand);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-muted-foreground">
        Report branding for <code className="rounded bg-muted px-1">{host}</code> — shown on every
        page of exported reports.
      </div>

      <BrandRow
        label="Product"
        namePlaceholder="e.g. Acme App"
        name={brand.productName ?? ""}
        logo={brand.productLogo}
        busy={busy === "product"}
        disabled={disabled}
        onName={(value) => update({ productName: value })}
        onPick={(file) => pick("product", file)}
        onClear={() => update({ productLogo: undefined })}
      />
      <BrandRow
        label="Company"
        namePlaceholder="e.g. Acme Inc."
        name={brand.companyName ?? ""}
        logo={brand.companyLogo}
        busy={busy === "company"}
        disabled={disabled}
        onName={(value) => update({ companyName: value })}
        onPick={(file) => pick("company", file)}
        onClear={() => update({ companyLogo: undefined })}
      />

      {caption && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Preview: <span className="font-medium text-foreground">{caption}</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function BrandRow({
  label,
  name,
  namePlaceholder,
  logo,
  busy,
  disabled,
  onName,
  onPick,
  onClear,
}: {
  label: string;
  name: string;
  namePlaceholder: string;
  logo?: string;
  busy: boolean;
  disabled?: boolean;
  onName: (value: string) => void;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={`${label} logo`} className="max-h-10 max-w-full object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">none</span>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {logo ? "Replace" : "Logo"}
      </Button>
      {logo && (
        <Button size="sm" variant="ghost" onClick={onClear} disabled={disabled || busy} title="Remove logo">
          <X className="h-4 w-4" />
        </Button>
      )}
      <input
        className="h-9 min-w-[140px] flex-1 rounded-md border border-border bg-muted px-3 text-sm"
        placeholder={namePlaceholder}
        value={name}
        onChange={(event) => onName(event.target.value)}
        disabled={disabled}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          onPick(file);
        }}
      />
    </div>
  );
}
