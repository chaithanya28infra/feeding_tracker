export type Side = "left" | "right";
export type Segment = { side: Side; start: number; end: number | null };
export type Timer = {
  id: string;
  start: number;
  side: Side;
  segments: Segment[];
  paused: boolean;
  notes?: string;
};
type CareAttribution = {
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
};
export type Feed = CareAttribution & {
  id: string;
  kind: "feed";
  start: number;
  end: number;
  left: number;
  right: number;
  lastSide: Side;
  notes: string;
  segments?: Segment[];
};
export type Diaper = CareAttribution & {
  id: string;
  kind: "diaper";
  start: number;
  type: "wet" | "dirty" | "both";
  notes: string;
  color?: string;
  consistency?: string;
};
export type CareEvent = Feed | Diaper;
export type Baby = {
  name: string;
  dob: string;
  timezone: string;
  weight: string;
  preferences: string;
};
export type State = {
  baby: Baby;
  events: CareEvent[];
  timer: Timer | null;
  dark: boolean;
};
export const initialState: State = {
  baby: {
    name: "Your little one",
    dob: "",
    timezone: "America/Phoenix",
    weight: "",
    preferences: "",
  },
  events: [],
  timer: null,
  dark: false,
};
export function totals(timer: Timer, now: number) {
  return timer.segments.reduce(
    (a, s) => ({
      ...a,
      [s.side]: a[s.side] + Math.max(0, (s.end ?? now) - s.start),
    }),
    { left: 0, right: 0 },
  );
}
export function changeTimer(
  timer: Timer,
  action: "pause" | "resume" | Side,
  now: number,
): Timer {
  const segments = timer.segments.map((s) =>
    s.end === null ? { ...s, end: now } : s,
  );
  if (action === "pause") return { ...timer, segments, paused: true };
  const side = action === "resume" ? timer.side : action;
  return {
    ...timer,
    side,
    paused: false,
    segments: [...segments, { side, start: now, end: null }],
  };
}
export function diaperCounts(events: CareEvent[]) {
  return events.reduce(
    (a, e) =>
      e.kind === "diaper"
        ? {
            wet: a.wet + Number(e.type !== "dirty"),
            dirty: a.dirty + Number(e.type !== "wet"),
            total: a.total + 1,
          }
        : a,
    { wet: 0, dirty: 0, total: 0 },
  );
}
export function dayKey(time: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export function clock(ms: number) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function minutes(ms: number) {
  return `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
}
export function mergeById(events: CareEvent[], event: CareEvent) {
  return [...events.filter((e) => e.id !== event.id), event].sort(
    (a, b) => b.start - a.start,
  );
}
