/**
 * Smoke test: the built SQLite DB exists and has non-zero content in every table.
 * Intentionally minimal — the full contract-test suite lives elsewhere in the
 * fleet manifests (backstage/catalog/fleet-manifests).
 */
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const DB_PATH = process.env["RBI_DB_PATH"] ?? "data/rbi.db";

describe("rbi.db content", () => {
  it("database file exists", () => {
    expect(existsSync(DB_PATH)).toBe(true);
  });

  it("circulars table has rows", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS c FROM circulars").get() as { c: number };
    db.close();
    expect(row.c).toBeGreaterThan(0);
  });

  it("frameworks table has rows", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS c FROM frameworks").get() as { c: number };
    db.close();
    expect(row.c).toBeGreaterThan(0);
  });

  it("every circular has a pdf_url", () => {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS c FROM circulars WHERE pdf_url IS NULL OR pdf_url = ''").get() as { c: number };
    db.close();
    expect(row.c).toBe(0);
  });
});
