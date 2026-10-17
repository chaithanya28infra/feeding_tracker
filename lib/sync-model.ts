import type { State, CareEvent } from "./model";
export type SyncSnapshot = Pick<State, "baby" | "events">;
export type Conflict = {
  keys: string[];
  remote: SyncSnapshot;
  revision: number;
};
export type SyncBinding = {
  userId: string;
  babyId: string;
  enabled: boolean;
  base: SyncSnapshot;
  revision: number;
  pending: SyncSnapshot | null;
  conflict?: Conflict;
};
export function snapshot(state: State): SyncSnapshot {
  return {
    baby: state.baby,
    events: [...state.events].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export function same(a: unknown, b: unknown) {
  return canonical(a) === canonical(b);
}
export function reconcile(
  base: SyncSnapshot,
  local: SyncSnapshot,
  remote: SyncSnapshot,
  prefer?: "local" | "remote",
) {
  const conflicts: string[] = [];
  function choose<T>(key: string, b: T, l: T, r: T): T {
    const content = (value: unknown) => {
      if (!key.startsWith("event:") || !value || typeof value !== "object")
        return value;
      const { createdBy, createdByName, updatedBy, updatedByName, ...fields } =
        value as Record<string, unknown>;
      return fields;
    };
    const equal = (a: unknown, c: unknown) => same(content(a), content(c));
    if (equal(l, r)) return r;
    if (equal(l, b)) return r;
    if (equal(r, b)) return l;
    conflicts.push(key);
    return prefer === "remote" ? r : l;
  }
  const baby = { ...local.baby };
  for (const key of Object.keys(baby) as (keyof typeof baby)[])
    baby[key] = choose(
      "baby." + key,
      base.baby[key],
      local.baby[key],
      remote.baby[key],
    );
  const b = new Map(base.events.map((e) => [e.id, e])),
    l = new Map(local.events.map((e) => [e.id, e])),
    r = new Map(remote.events.map((e) => [e.id, e]));
  const events: CareEvent[] = [];
  for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const event = choose("event:" + id, b.get(id), l.get(id), r.get(id));
    if (event) events.push(event);
  }
  // New sessions from different devices may overlap even if their IDs differ.
  const feeds = events
    .filter((e) => e.kind === "feed")
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < feeds.length; i++)
    if (feeds[i - 1].end > feeds[i].start) conflicts.push("overlapping-feeds");
  return {
    value: { baby, events: events.sort((a, b) => a.id.localeCompare(b.id)) },
    conflicts: [...new Set(conflicts)],
  };
}
