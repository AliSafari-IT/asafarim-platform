import { describe, expect, it, vi } from "vitest";
import type { ResuMatchAiProvider } from "../env";
import { AiProviderError } from "./providerError";
import { createProviderRegistry } from "./providerRegistry";

interface FakeProvider {
  readonly name: ResuMatchAiProvider;
}

function fakeLoaders() {
  return {
    fixture: vi.fn(async (): Promise<FakeProvider> => ({ name: "fixture" })),
    openai: vi.fn(async (): Promise<FakeProvider> => ({ name: "openai" })),
    anthropic: vi.fn(async (): Promise<FakeProvider> => ({
      name: "anthropic",
    })),
  };
}

describe("createProviderRegistry", () => {
  it("resolves each provider name through its own loader", async () => {
    const loaders = fakeLoaders();
    const get = createProviderRegistry<FakeProvider>({
      label: "test",
      loaders,
    });

    for (const name of ["fixture", "openai", "anthropic"] as const) {
      expect((await get(name)).name).toBe(name);
    }
  });

  it("loads lazily: only the selected provider's loader runs", async () => {
    const loaders = fakeLoaders();
    const get = createProviderRegistry<FakeProvider>({
      label: "test",
      loaders,
    });

    expect(loaders.fixture).not.toHaveBeenCalled();
    await get("fixture");
    expect(loaders.fixture).toHaveBeenCalledTimes(1);
    expect(loaders.openai).not.toHaveBeenCalled();
    expect(loaders.anthropic).not.toHaveBeenCalled();
  });

  it("caches: a second lookup returns the same instance without reloading", async () => {
    const loaders = fakeLoaders();
    const get = createProviderRegistry<FakeProvider>({
      label: "test",
      loaders,
    });

    const first = await get("openai");
    const second = await get("openai");
    expect(second).toBe(first);
    expect(loaders.openai).toHaveBeenCalledTimes(1);
  });

  it("keeps a separate cache per registry", async () => {
    const a = createProviderRegistry<FakeProvider>({
      label: "a",
      loaders: fakeLoaders(),
    });
    const b = createProviderRegistry<FakeProvider>({
      label: "b",
      loaders: fakeLoaders(),
    });

    expect(await a("fixture")).not.toBe(await b("fixture"));
  });

  it("throws a labelled error for an unknown name, including prototype keys", async () => {
    const get = createProviderRegistry<FakeProvider>({
      label: "job-meta",
      loaders: fakeLoaders(),
    });

    await expect(get("bogus" as ResuMatchAiProvider)).rejects.toThrow(
      "unknown ResuMatch job-meta provider: bogus"
    );
    await expect(get("toString" as ResuMatchAiProvider)).rejects.toThrow(
      "unknown ResuMatch job-meta provider: toString"
    );
  });

  it("does not cache a failed load", async () => {
    const loaders = fakeLoaders();
    loaders.openai.mockRejectedValueOnce(new Error("sdk missing"));
    const get = createProviderRegistry<FakeProvider>({
      label: "test",
      loaders,
    });

    await expect(get("openai")).rejects.toThrow("sdk missing");
    expect((await get("openai")).name).toBe("openai");
    expect(loaders.openai).toHaveBeenCalledTimes(2);
  });
});

describe("AiProviderError", () => {
  class DomainProviderError extends AiProviderError {
    constructor(message: string, retryable = true) {
      super(message, retryable);
      this.name = "DomainProviderError";
    }
  }

  it("defaults retryable to true", () => {
    expect(new AiProviderError("boom").retryable).toBe(true);
    expect(new DomainProviderError("boom").retryable).toBe(true);
  });

  it("keeps an explicit retryable=false", () => {
    expect(new DomainProviderError("bad request", false).retryable).toBe(false);
  });

  it("lets a subclass keep its own name and instanceof", () => {
    const err = new DomainProviderError("boom");
    expect(err.name).toBe("DomainProviderError");
    expect(err.message).toBe("boom");
    expect(err).toBeInstanceOf(DomainProviderError);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toBeInstanceOf(Error);
  });
});
