// Per-domain branding, set on the Run page and embedded into exported HTML/PDF
// reports. Each domain (host) can carry a product (name + logo) and the company
// behind it (name + logo), so a report reads e.g. "Acme App, a product of
// Acme Inc.". Stored in localStorage; logos are data URLs so the export is
// fully self-contained.

export interface DomainBrand {
  productName?: string;
  productLogo?: string; // data URL
  companyName?: string;
  companyLogo?: string; // data URL
}

const STORAGE_KEY = "e2e_domain_logos";

/** Hostname for a URL, or null. Local/Default runs resolve to "localhost". */
export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isNonEmpty(brand: DomainBrand): boolean {
  return Boolean(brand.productName || brand.productLogo || brand.companyName || brand.companyLogo);
}

export function getDomainBrands(): Record<string, DomainBrand> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
  const out: Record<string, DomainBrand> = {};
  for (const [host, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    // Migrate the previous single-logo shape ({ dataUrl, name }) to a product.
    if (typeof v.dataUrl === "string" && v.productLogo === undefined && v.companyLogo === undefined) {
      out[host] = {
        productLogo: v.dataUrl,
        productName: typeof v.name === "string" ? v.name : undefined,
      };
      continue;
    }
    out[host] = {
      productName: typeof v.productName === "string" ? v.productName : undefined,
      productLogo: typeof v.productLogo === "string" ? v.productLogo : undefined,
      companyName: typeof v.companyName === "string" ? v.companyName : undefined,
      companyLogo: typeof v.companyLogo === "string" ? v.companyLogo : undefined,
    };
  }
  return out;
}

export function getDomainBrand(host: string): DomainBrand {
  return getDomainBrands()[host] ?? {};
}

export function setDomainBrand(host: string, brand: DomainBrand): void {
  const all = getDomainBrands();
  const cleaned: DomainBrand = {
    productName: brand.productName?.trim() || undefined,
    productLogo: brand.productLogo || undefined,
    companyName: brand.companyName?.trim() || undefined,
    companyLogo: brand.companyLogo || undefined,
  };
  if (isNonEmpty(cleaned)) all[host] = cleaned;
  else delete all[host];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota — ignore */
  }
}

/**
 * Read an image File, downscale it to a small PNG data URL (max edge px) so it
 * stays well within localStorage limits and embeds cleanly into a report.
 */
export async function fileToLogoDataUrl(file: File, maxEdge = 220): Promise<string> {
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image."));
    image.src = original;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height || 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
