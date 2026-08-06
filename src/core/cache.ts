interface CacheNode<V> {
  key: string;
  value: V;
  size: number;
  expiresAt: number;
  prev: CacheNode<V> | null;
  next: CacheNode<V> | null;
}

/** Tiny LRU+TTL cache. Insertion order is the recency order; HEAD = most recent. */
export class LRUCache<V> {
  private map = new Map<string, CacheNode<V>>();
  private head: CacheNode<V> | null = null;
  private tail: CacheNode<V> | null = null;
  private totalSize = 0;

  constructor(
    private readonly opts: {
      maxEntries: number;
      maxBytes: number;
      ttlMs: number;
    },
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: string): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    if (node.expiresAt <= Date.now()) {
      this.remove(node);
      return undefined;
    }
    this.touch(node);
    return node.value;
  }

  set(key: string, value: V, size: number): void {
    const existing = this.map.get(key);
    if (existing) this.remove(existing);

    const safeSize = Math.max(1, size);
    if (safeSize > this.opts.maxBytes) return; // too large; skip caching

    const node: CacheNode<V> = {
      key,
      value,
      size: safeSize,
      expiresAt: Date.now() + this.opts.ttlMs,
      prev: null,
      next: null,
    };
    this.map.set(key, node);
    this.totalSize += safeSize;
    this.attach(node);
    this.evict();
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.totalSize = 0;
  }

  private touch(node: CacheNode<V>): void {
    if (node === this.head) return;
    this.detach(node);
    this.attach(node);
  }

  private attach(node: CacheNode<V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private detach(node: CacheNode<V>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
  }

  private remove(node: CacheNode<V>): void {
    this.detach(node);
    this.map.delete(node.key);
    this.totalSize -= node.size;
  }

  private evict(): void {
    while (
      this.tail &&
      (this.map.size > this.opts.maxEntries || this.totalSize > this.opts.maxBytes)
    ) {
      this.remove(this.tail);
    }
  }
}
