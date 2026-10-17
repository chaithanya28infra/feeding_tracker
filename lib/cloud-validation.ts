import type { State } from "./model";
export function validateBackup(input: unknown): State {
  if (!input || typeof input !== "object") throw Error("Invalid backup.");
  const s = input as State;
  if (
    !s.baby ||
    typeof s.baby.name !== "string" ||
    !s.baby.name.trim() ||
    s.baby.name.length > 80
  )
    throw Error("Add a baby name in Settings first.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s.baby.dob) ||
    !Number.isFinite(Date.parse(s.baby.dob)) ||
    new Date(s.baby.dob).toISOString().slice(0, 10) !== s.baby.dob ||
    s.baby.dob > new Date().toISOString().slice(0, 10)
  )
    throw Error("Add a valid date of birth in Settings first.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: s.baby.timezone }).format();
  } catch {
    throw Error("Invalid baby timezone.");
  }
  if (
    typeof s.baby.weight !== "string" ||
    s.baby.weight.length > 40 ||
    typeof s.baby.preferences !== "string" ||
    s.baby.preferences.length > 1000
  )
    throw Error("Invalid baby preferences.");
  if (!Array.isArray(s.events) || s.events.length > 10000)
    throw Error("Backup supports up to 10,000 events.");
  const ids = new Set<string>();
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (const e of s.events) {
    if (!e || !uuid.test(e.id) || ids.has(e.id))
      throw Error("Events need unique UUIDs.");
    ids.add(e.id);
    if (
      !Number.isFinite(e.start) ||
      e.start < 0 ||
      e.start > Date.now() + 60000 ||
      typeof e.notes !== "string" ||
      e.notes.length > 1000
    )
      throw Error("Invalid event time or notes.");
    if (e.kind === "feed") {
      if (
        !Number.isFinite(e.end) ||
        e.end < e.start ||
        e.end > Date.now() + 60000 ||
        !Number.isFinite(e.left) ||
        !Number.isFinite(e.right) ||
        e.left < 0 ||
        e.right < 0 ||
        e.left + e.right > e.end - e.start + 60000 ||
        !["left", "right"].includes(e.lastSide)
      )
        throw Error("Invalid feeding duration.");
    } else if (e.kind === "diaper") {
      if (
        !["wet", "dirty", "both"].includes(e.type) ||
        [e.color, e.consistency].some(
          (x) => x !== undefined && (typeof x !== "string" || x.length > 50),
        )
      )
        throw Error("Invalid diaper details.");
    } else throw Error("Unknown event type.");
  }
  // A running timer is device-local. Never restart an old timer from a cloud backup.
  return {
    baby: {
      name: s.baby.name.trim(),
      dob: s.baby.dob,
      timezone: s.baby.timezone,
      weight: s.baby.weight,
      preferences: s.baby.preferences,
    },
    events: s.events,
    timer: null,
    dark: !!s.dark,
  };
}
export function mergeBackup(local: State, backup: State): State {
  if (local.timer)
    throw Error("Save your active feeding before restoring a backup.");
  const events = new Map(backup.events.map((e) => [e.id, e]));
  for (const event of local.events) events.set(event.id, event);
  return {
    ...local,
    baby: backup.baby,
    events: [...events.values()].sort((a, b) => b.start - a.start),
  };
}
