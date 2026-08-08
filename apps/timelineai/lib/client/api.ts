"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: { path: (string | number)[]; message: string }[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thin fetch wrapper: JSON in/out, typed errors from lib/server/api-errors. */
export async function apiFetch<T>(
  input: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(
      payload?.message ?? "Something went wrong. Please try again.",
      res.status,
      payload?.details
    );
  }
  return payload as T;
}
