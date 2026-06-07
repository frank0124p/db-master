/**
 * Thin HTTP client for seeding / tearing down test data via the API.
 * Used in tests to set up state without going through the UI.
 */
import { API_PORT } from "../playwright.config.js";

const BASE = `http://localhost:${API_PORT}/api/v1`;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}: ${await res.text()}`);
  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export const testApi = {
  schemas: {
    create: (name: string, domain = "semiconductor") =>
      req<{ id: number; name: string }>("POST", "/schemas", { name, description: "", domain }),
    list: () => req<{ id: number; name: string }[]>("GET", "/schemas"),
    delete: (id: number) => req<void>("DELETE", `/schemas/${id}`),
  },
  tables: {
    create: (schemaId: number, name: string) =>
      req<{ id: number; name: string }>("POST", `/schemas/${schemaId}/tables`, { name, comment: "" }),
  },
  fields: {
    create: (tableId: number, name: string, dataType = "VARCHAR(64)") =>
      req<{ id: number; name: string }>("POST", `/tables/${tableId}/fields`, { name, data_type: dataType, nullable: true }),
  },
  versions: {
    create: (schemaId: number, message = "initial") =>
      req<{ id: number }>("POST", `/schemas/${schemaId}/versions`, { message }),
  },
  naming: {
    list: () => req<{ id: number; stdName: string; concept: string }[]>("GET", "/naming-dictionary"),
    create: (entry: { concept: string; std_name: string; aliases?: string[]; domain?: string }) =>
      req<{ id: number }>("POST", "/naming-dictionary", { ...entry, aliases: entry.aliases ?? [], domain: entry.domain ?? "general" }),
    delete: (id: number) => req<void>("DELETE", `/naming-dictionary/${id}`),
  },
};
