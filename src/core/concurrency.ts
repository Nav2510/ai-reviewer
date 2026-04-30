import pLimit from "p-limit";

export interface MapWithLimitOptions {
  concurrency?: number;
}

export async function mapWithLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: MapWithLimitOptions = {},
): Promise<R[]> {
  const limit = pLimit(Math.max(1, opts.concurrency ?? 4));
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}
