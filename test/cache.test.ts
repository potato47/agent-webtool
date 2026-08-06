import { describe, expect, test } from "bun:test";
import { LRUCache } from "../src/core/cache.ts";

describe("LRUCache", () => {
  test("hit + miss", () => {
    const c = new LRUCache<string>({ maxEntries: 10, maxBytes: 1000, ttlMs: 60_000 });
    c.set("a", "A", 1);
    expect(c.get("a")).toBe("A");
    expect(c.get("z")).toBeUndefined();
  });

  test("evicts when maxEntries exceeded", () => {
    const c = new LRUCache<string>({ maxEntries: 2, maxBytes: 1000, ttlMs: 60_000 });
    c.set("a", "A", 1);
    c.set("b", "B", 1);
    c.set("c", "C", 1); // evicts 'a'
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("B");
    expect(c.get("c")).toBe("C");
  });

  test("evicts when maxBytes exceeded", () => {
    const c = new LRUCache<string>({ maxEntries: 100, maxBytes: 10, ttlMs: 60_000 });
    c.set("a", "A", 6);
    c.set("b", "B", 6); // total 12 > 10, evicts 'a'
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("B");
  });

  test("TTL expiration", async () => {
    const c = new LRUCache<string>({ maxEntries: 10, maxBytes: 1000, ttlMs: 10 });
    c.set("a", "A", 1);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.get("a")).toBeUndefined();
  });

  test("LRU recency: get bumps to MRU", () => {
    const c = new LRUCache<string>({ maxEntries: 2, maxBytes: 1000, ttlMs: 60_000 });
    c.set("a", "A", 1);
    c.set("b", "B", 1);
    expect(c.get("a")).toBe("A"); // 'a' is now MRU
    c.set("c", "C", 1); // should evict 'b', not 'a'
    expect(c.get("a")).toBe("A");
    expect(c.get("b")).toBeUndefined();
    expect(c.get("c")).toBe("C");
  });

  test("skips entries larger than maxBytes", () => {
    const c = new LRUCache<string>({ maxEntries: 10, maxBytes: 10, ttlMs: 60_000 });
    c.set("huge", "H", 100);
    expect(c.get("huge")).toBeUndefined();
  });
});
