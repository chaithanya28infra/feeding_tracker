import { openDB } from "idb";
import { initialState, type State } from "./model";
// Keep the original database ID so rebranding preserves existing care logs and timers.
const db = () =>
  openDB("littlenest", 1, {
    upgrade(db) {
      db.createObjectStore("state");
    },
  });
export async function loadState(): Promise<State> {
  return (await (await db()).get("state", "current")) ?? initialState;
}
export async function saveState(state: State) {
  await (await db()).put("state", state, "current");
}
