"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Home,
  Heart,
  Droplets,
  Clock3,
  Settings,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Moon,
  Sun,
  Leaf,
  Play,
  Pause,
  Square,
  X,
  Check,
  Download,
  Trash2,
  Pencil,
  Baby as BabyIcon,
  Sparkles,
  BarChart3,
  ShieldCheck,
  CircleCheck,
  CloudOff,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import {
  initialState,
  totals,
  changeTimer,
  clock,
  minutes,
  diaperCounts,
  dayKey,
  mergeById,
  type State,
  type Side,
  type CareEvent,
  type Feed,
  type Diaper,
} from "@/lib/model";
import { loadState, saveState } from "@/lib/storage";
import { Button } from "@/components/ui/button";
type Tab = "Home" | "Feeding" | "Diapers" | "History" | "Settings" | "Insights";
const nav = [
  { name: "Home", icon: Home },
  { name: "Feeding", icon: Heart },
  { name: "Diapers", icon: Droplets },
  { name: "History", icon: Clock3 },
  { name: "Insights", icon: BarChart3 },
] as const;
export default function App() {
  const [state, setState] = useState<State>(initialState),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState<Tab>("Home"),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("all"),
    [date, setDate] = useState(""),
    [editing, setEditing] = useState<CareEvent | null>(null),
    [manual, setManual] = useState(false),
    [selected, setSelected] = useState<Side>("left"),
    [notes, setNotes] = useState(""),
    [online, setOnline] = useState(true),
    [period, setPeriod] = useState(7);
  const current = useRef(state),
    channel = useRef<BroadcastChannel | null>(null),
    readyRef = useRef(false);
  useEffect(() => {
    loadState()
      .then((s) => {
        current.current = s;
        setState(s);
        setNotes(s.timer?.notes ?? "");
        const last = s.events.find((e): e is Feed => e.kind === "feed");
        setSelected(last?.lastSide === "left" ? "right" : "left");
        setReady(true);
        readyRef.current = true;
      })
      .catch(() =>
        setError(
          "Local storage is unavailable. Please enable browser storage to save care logs.",
        ),
      );
    const i = setInterval(() => setNow(Date.now()), 1000);
    setOnline(navigator.onLine);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    channel.current = new BroadcastChannel("littlenest");
    channel.current.onmessage = (e) => {
      current.current = e.data;
      setState(e.data);
    };
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((reg) =>
          reg.active?.postMessage({
            type: "CACHE_ASSETS",
            urls: performance
              .getEntriesByType("resource")
              .map((r) => r.name)
              .filter((url) =>
                url.startsWith(location.origin + "/_next/static/"),
              ),
          }),
        )
        .catch(() => {});
    return () => {
      clearInterval(i);
      channel.current?.close();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);
  async function update(fn: (s: State) => State) {
    try {
      const next = fn(current.current);
      await saveState(next);
      current.current = next;
      setState(next);
      channel.current?.postMessage(next);
    } catch {
      setError(
        "Could not save. Your existing data is safe. Please free up device storage and try again.",
      );
    }
  }
  async function locked(fn: () => Promise<void>) {
    if (navigator.locks)
      await navigator.locks.request("littlenest-write", async () => {
        current.current = await loadState();
        await fn();
      });
    else await fn();
  }
  async function start(side: Side) {
    await locked(async () => {
      if (current.current.timer) {
        setTab("Feeding");
        return;
      }
      const t = Date.now();
      await update((s) => ({
        ...s,
        timer: {
          id: crypto.randomUUID(),
          start: t,
          side,
          paused: false,
          segments: [{ side, start: t, end: null }],
        },
      }));
      setTab("Feeding");
    });
  }
  async function timerAction(a: "pause" | "resume" | Side) {
    await locked(async () =>
      update((s) => ({
        ...s,
        timer: s.timer ? changeTimer(s.timer, a, Date.now()) : null,
      })),
    );
  }
  async function finish() {
    await locked(async () => {
      const t = current.current.timer;
      if (!t) return;
      const end = Date.now(),
        v = totals(t, end);
      if (v.left + v.right < 1000) {
        setNotice("Log at least one second before saving.");
        return;
      }
      await update((s) => ({
        ...s,
        timer: null,
        events: mergeById(s.events, {
          id: t.id,
          kind: "feed",
          start: t.start,
          end,
          ...v,
          lastSide: t.side,
          notes: t.notes ?? notes,
          segments: t.segments.map((segment) => ({
            ...segment,
            end: segment.end ?? end,
          })),
        }),
      }));
      setSelected(t.side === "left" ? "right" : "left");
      setNotes("");
      setNotice("Feeding saved. A little moment, beautifully kept.");
      setTab("Home");
    });
  }
  async function diaper(type: Diaper["type"]) {
    const event: Diaper = {
      id: crypto.randomUUID(),
      kind: "diaper",
      type,
      start: Date.now(),
      notes: "",
    };
    await locked(async () =>
      update((s) => ({ ...s, events: mergeById(s.events, event) })),
    );
    setEditing(event);
    setNotice("Diaper logged. You can adjust the details below.");
  }
  async function remove(id: string) {
    await locked(async () =>
      update((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) })),
    );
    setEditing(null);
    setNotice("Entry removed.");
  }
  const tz = state.baby.timezone,
    today = dayKey(now, tz),
    daily = state.events.filter((e) => dayKey(e.start, tz) === today),
    feeds = daily.filter((e): e is Feed => e.kind === "feed"),
    counts = diaperCounts(daily),
    lastFeed = state.events.find((e): e is Feed => e.kind === "feed"),
    lastDiaper = state.events.find((e): e is Diaper => e.kind === "diaper"),
    suggest: Side = lastFeed?.lastSide === "left" ? "right" : "left";
  const time = (n: number) =>
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      }).format(n),
    ago = (n: number) => formatDistanceToNow(n, { addSuffix: true }),
    duration = feeds.reduce((a, f) => a + f.left + f.right, 0),
    age = state.baby.dob
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(`${today}T12:00:00Z`) -
              Date.parse(`${state.baby.dob}T12:00:00Z`)) /
              86400000,
          ),
        )
      : null;
  const timer = state.timer,
    live = timer ? totals(timer, now) : { left: 0, right: 0 };
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "nestlittlebaby-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const visible = state.events.filter(
    (e) =>
      (filter === "all" ||
        (filter === "feed" && e.kind === "feed") ||
        (e.kind === "diaper" && (filter === "diaper" || filter === e.type))) &&
      (!date || dayKey(e.start, tz) === date),
  );
  function Timeline({ events }: { events: CareEvent[] }) {
    return (
      <div className="timeline">
        {events.length === 0 ? (
          <div className="empty">
            <Leaf size={28} />
            <h3>A fresh little beginning</h3>
            <p>
              Your care moments will appear here.
              <br />
              Start a feed or log a diaper to begin.
            </p>
          </div>
        ) : (
          events.map((e) => (
            <button
              className="activity"
              key={e.id}
              onClick={() => setEditing(e)}
            >
              <span
                className={`activity-icon ${e.kind === "feed" ? "peach" : "blue"}`}
              >
                {e.kind === "feed" ? (
                  <Heart size={20} />
                ) : (
                  <Droplets size={20} />
                )}
              </span>
              <span className="activity-main">
                <strong>
                  {e.kind === "feed"
                    ? "Breastfeeding"
                    : e.type === "both"
                      ? "Wet & dirty diaper"
                      : e.type === "wet"
                        ? "Wet diaper"
                        : "Dirty diaper"}
                </strong>
                <small>
                  {e.kind === "feed"
                    ? `${minutes(e.left + e.right)} · ${e.left && e.right ? "Both sides" : e.lastSide + " side"}`
                    : e.notes || "A fresh start, all comfortable"}
                  {e.kind === "feed" && e.notes ? ` · ${e.notes}` : ""}
                </small>
              </span>
              <span className="activity-time">
                {time(e.start)}
                <small>{ago(e.start)}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))
        )}
      </div>
    );
  }
  return (
    <div className={state.dark ? "app dark" : "app"}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Home");
          }}
        >
          <span className="brand-icon">
            <Image
              src="/brand/nest-mark.png"
              width={44}
              height={44}
              alt="Nest Little Baby logo"
            />
          </span>
          <span className="brand-wordmark">
            <strong>Nest</strong>
            <span>Little Baby</span>
          </span>
        </a>
        <div className="workspace-label">YOUR LITTLE WORLD</div>
        <button className="baby-switch" onClick={() => setTab("Settings")}>
          <span className="baby-avatar">
            <BabyIcon />
          </span>
          <span>
            <strong>{state.baby.name}</strong>
            <small>
              {age === null
                ? "Set up baby’s profile"
                : `${age} days of little wonders`}
            </small>
          </span>
          <ChevronRight size={14} />
        </button>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              className={tab === n.name ? "active" : ""}
              onClick={() => {
                setTab(n.name);
                setFilter("all");
              }}
            >
              <n.icon size={20} />
              {n.name}
              {n.name === "Home" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="gentle">
            <Sparkles size={21} />
            <p>
              You’re doing better
              <br />
              than you think.
            </p>
            <small>One little moment at a time.</small>
          </div>
          <button
            onClick={() => setTab("Settings")}
            className={tab === "Settings" ? "settings active" : "settings"}
          >
            <Settings size={19} />
            Settings
          </button>
          <div className="local-status">
            <span /> Saved on this device
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span className="header-identity">
            <Image
              src="/brand/nest-mark.png"
              width={32}
              height={32}
              alt=""
              preload
            />
            <span className="header-brand-name">Nest Little Baby</span>
            <span className="header-tagline">
              Your calm corner of parenthood
            </span>
          </span>
          <div>
            <span className="status">
              <span />
              {online ? "Local mode" : "Offline · local mode"}
            </span>
            <button
              aria-label="Toggle nighttime mode"
              className="icon-button"
              onClick={() => update((s) => ({ ...s, dark: !s.dark }))}
            >
              {state.dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="profile"
              onClick={() => setTab("Settings")}
              aria-label="Baby profile"
            >
              <BabyIcon size={19} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-title">
            <div>
              <p className="eyebrow">
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: tz,
                }).format(now)}
              </p>
              <h1>
                {tab === "Home" ? (
                  <>
                    Little moments. <em>Lots of love.</em>
                  </>
                ) : tab === "Feeding" ? (
                  "A moment to nourish."
                ) : tab === "Diapers" ? (
                  "Fresh, happy, comfortable."
                ) : tab === "History" ? (
                  "Your little care story."
                ) : tab === "Insights" ? (
                  "A rhythm of your own."
                ) : (
                  "Make yourself at home."
                )}
              </h1>
              <p>
                {tab === "Home"
                  ? `A little overview of ${state.baby.name === "Your little one" ? "your baby" : state.baby.name}’s day.${age === null ? "" : ` ${age} days of little wonders.`} You’re doing wonderfully.`
                  : tab === "Feeding"
                    ? "Settle in. We’ll keep track of the time."
                    : tab === "Diapers"
                      ? "One tap to keep track of the little changes."
                      : tab === "History"
                        ? "Every feed, every change, lovingly remembered."
                        : tab === "Insights"
                          ? "Simple patterns from your recorded care moments."
                          : "Your baby, your preferences, your peaceful little space."}
              </p>
            </div>
            <button className="date-chip" onClick={() => setTab("History")}>
              <Clock3 size={15} /> Today
            </button>
          </div>
          {!ready && <div className="banner">Opening your nest…</div>}
          {error && (
            <div role="alert" className="banner error">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="banner" role="status">
              <Check size={17} />
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {tab === "Home" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="tag">
                    <span /> THE LITTLE THINGS ADD UP
                  </span>
                  <h2>
                    A new day.
                    <br />A little more <em>growing.</em>
                  </h2>
                  <p>
                    Feeds, fresh diapers, and all the in-between.
                    <br />
                    We’re here to help you find your rhythm.
                  </p>
                  <Button
                    disabled={!ready}
                    onClick={() => (timer ? setTab("Feeding") : start(suggest))}
                  >
                    <Plus size={18} />
                    {timer ? "Return to active feed" : "Start a feeding"}
                    <ArrowUpRight size={17} />
                  </Button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-sun" />
                  <div className="art-spark">✧</div>
                  <Image
                    className="hero-brand-mark"
                    src="/brand/nest-mark.png"
                    width={220}
                    height={220}
                    alt=""
                    preload
                  />
                  <span className="art-caption">small moments, big love</span>
                  <span className="art-dot" />
                </div>
                <div className="hero-note">
                  <Heart size={16} /> Made for your little one. And you.
                </div>
              </section>
              <div className="section-heading">
                <h2>
                  Today, at a glance <span>♡</span>
                </h2>
                <span>A fresh start, every day</span>
              </div>
              <section className="stats">
                <div className="stat">
                  <div>
                    <span className="stat-icon peach">
                      <Heart size={19} />
                    </span>
                    <span className="stat-label">FEEDING SESSIONS</span>
                  </div>
                  <strong>
                    {feeds.length}
                    <small>feeds today</small>
                  </strong>
                  <p>
                    {lastFeed
                      ? `Last feed ${ago(lastFeed.start)}`
                      : "Ready whenever baby is"}
                  </p>
                  <span className="stat-decoration">⌁</span>
                </div>
                <div className="stat">
                  <div>
                    <span className="stat-icon sage">
                      <Clock3 size={19} />
                    </span>
                    <span className="stat-label">NURSING TIME</span>
                  </div>
                  <strong>
                    {Math.floor(duration / 60000)}
                    <small>minutes today</small>
                  </strong>
                  <p>A little nourishment, a lot of love</p>
                </div>
                <div className="stat">
                  <div>
                    <span className="stat-icon blue">
                      <Droplets size={19} />
                    </span>
                    <span className="stat-label">WET DIAPERS</span>
                  </div>
                  <strong>
                    {counts.wet}
                    <small>changes today</small>
                  </strong>
                  <p>{counts.total} total diaper changes</p>
                </div>
                <div className="stat">
                  <div>
                    <span className="stat-icon lilac">
                      <BabyIcon size={19} />
                    </span>
                    <span className="stat-label">DIRTY DIAPERS</span>
                  </div>
                  <strong>
                    {counts.dirty}
                    <small>changes today</small>
                  </strong>
                  <p>Little changes, lovingly logged</p>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="card recent">
                  <div className="card-heading">
                    <h2>Little moments, lately</h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("History")}
                    >
                      View history <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <Timeline events={state.events.slice(0, 4)} />
                </section>
                <section className="card quick">
                  <div className="card-heading">
                    <h2>A little check-in</h2>
                    <Leaf size={18} />
                  </div>
                  <div className="last-feed">
                    <span className="stat-icon peach">
                      <Heart size={19} />
                    </span>
                    <div>
                      <small>LAST FEEDING</small>
                      <strong>
                        {lastFeed
                          ? ago(lastFeed.start)
                          : "Your first feed awaits"}
                      </strong>
                      <p>
                        {lastFeed
                          ? `${lastFeed.lastSide === "left" ? "Left" : "Right"} side last · Try ${suggest} next`
                          : "We’ll remember your last side for you"}
                      </p>
                    </div>
                  </div>
                  <div className="next-side">
                    <span>Next up, perhaps?</span>
                    <span>
                      {suggest === "left" ? "L" : "R"}
                      <small>{suggest} side</small>
                    </span>
                  </div>
                  <button
                    className="diaper-shortcut"
                    disabled={!ready}
                    onClick={() => setTab("Diapers")}
                  >
                    <Droplets size={20} />
                    Log a diaper change
                    <Plus size={18} />
                  </button>
                  <p className="last-change">
                    {lastDiaper
                      ? `Last diaper change ${ago(lastDiaper.start)}`
                      : "A fresh diaper is just one tap away"}
                  </p>
                </section>
              </div>
              <footer className="page-footer">
                <Leaf size={15} /> A little less to remember. A little more time
                together.
                <span>
                  <ShieldCheck size={14} /> Private by nature
                </span>
              </footer>
            </>
          )}
          {tab === "Feeding" && (
            <div className="feeding-layout">
              <section className="card timer-card">
                <span className="tag">
                  {timer
                    ? timer.paused
                      ? "TAKE YOUR TIME"
                      : "A LITTLE NOURISHMENT"
                    : "READY WHEN YOU ARE"}
                </span>
                <h2>
                  {timer
                    ? timer.paused
                      ? "A peaceful pause."
                      : "Just you and your little one."
                    : "Let’s settle in."}
                </h2>
                <div
                  className={`timer ${timer && !timer.paused ? "running" : ""}`}
                >
                  {clock(live.left + live.right)}
                </div>
                <p className="muted">
                  {timer
                    ? `Started at ${time(timer.start)} · ${timer.paused ? "Paused" : `Nursing on the ${timer.side}`}`
                    : `Suggested starting side: ${suggest}`}
                </p>
                <div className="side-buttons">
                  {(["left", "right"] as const).map((side) => (
                    <button
                      key={side}
                      className={
                        (timer?.side ?? selected) === side ? "selected" : ""
                      }
                      onClick={() =>
                        timer ? timerAction(side) : setSelected(side)
                      }
                      disabled={!ready}
                    >
                      <span>{side === "left" ? "L" : "R"}</span>
                      <strong>
                        {side === "left" ? "Left breast" : "Right breast"}
                      </strong>
                      <small>{minutes(live[side])}</small>
                    </button>
                  ))}
                </div>
                <label className="notes-label">
                  A little note (optional)
                  <textarea
                    value={notes}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNotes(value);
                      if (timer)
                        locked(async () =>
                          update((s) => ({
                            ...s,
                            timer: s.timer
                              ? { ...s.timer, notes: value }
                              : null,
                          })),
                        );
                    }}
                    maxLength={1000}
                    placeholder="Anything you’d like to remember…"
                  />
                </label>
                <div className="timer-controls">
                  {timer ? (
                    <>
                      <button
                        className="secondary"
                        onClick={() =>
                          timerAction(timer.paused ? "resume" : "pause")
                        }
                      >
                        {timer.paused ? (
                          <Play size={17} />
                        ) : (
                          <Pause size={17} />
                        )}{" "}
                        {timer.paused ? "Resume" : "Pause"}
                      </button>
                      <button className="primary" onClick={finish}>
                        <Square size={16} />
                        Stop & save
                      </button>
                    </>
                  ) : (
                    <button
                      className="primary"
                      disabled={!ready}
                      onClick={() => start(selected)}
                    >
                      <Play size={18} />
                      Start feeding
                    </button>
                  )}
                </div>
              </section>
              <aside className="card tip-card">
                <span className="stat-icon sage">
                  <Leaf />
                </span>
                <h3>Follow your own rhythm.</h3>
                <p>
                  Switch sides whenever you’re ready. Each side’s time is
                  recorded separately, and your timer stays with you when you
                  close the app.
                </p>
                <button className="text-button" onClick={() => setManual(true)}>
                  <Plus size={16} />
                  Add a past feeding
                </button>
                <hr />
                <small>
                  Duration is a care log, not an estimate of milk intake.
                </small>
              </aside>
            </div>
          )}
          {tab === "Diapers" && (
            <>
              <section className="card diaper-card">
                <div className="section-heading">
                  <h2>A fresh little start</h2>
                  <span>Tap to log right now</span>
                </div>
                <div className="diaper-buttons">
                  {(["wet", "dirty", "both"] as const).map((type, i) => (
                    <button
                      key={type}
                      disabled={!ready}
                      onClick={() => diaper(type)}
                      className={["blue", "peach", "lilac"][i]}
                    >
                      <Droplets size={38} />
                      <h3>{["Pee", "Poop", "Both"][i]}</h3>
                      <p>{["Wet diaper", "Dirty diaper", "Wet & dirty"][i]}</p>
                      <span>
                        <Plus size={16} /> Log change
                      </span>
                    </button>
                  ))}
                </div>
                <p className="muted">
                  Saved immediately. Adjust the time, add a note, or undo after
                  logging.
                </p>
              </section>
              <section className="card">
                <div className="card-heading">
                  <h2>Today’s changes</h2>
                  <span>
                    {counts.total} total · {counts.wet} wet · {counts.dirty}{" "}
                    dirty
                  </span>
                </div>
                <Timeline events={daily.filter((e) => e.kind === "diaper")} />
              </section>
            </>
          )}
          {tab === "History" && (
            <section className="card">
              <div className="card-heading">
                <h2>Every little moment</h2>
                <button className="secondary" onClick={() => setManual(true)}>
                  <Plus size={16} />
                  Add feeding
                </button>
              </div>
              <div className="filters">
                <select
                  aria-label="Filter event type"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All activity</option>
                  <option value="feed">Feeding</option>
                  <option value="diaper">All diapers</option>
                  <option value="wet">Wet diapers</option>
                  <option value="dirty">Dirty diapers</option>
                  <option value="both">Both</option>
                </select>
                <input
                  aria-label="Filter by date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {date && (
                  <button className="text-button" onClick={() => setDate("")}>
                    Clear date
                  </button>
                )}
              </div>
              {[...new Set(visible.map((e) => dayKey(e.start, tz)))].map(
                (day) => {
                  const events = visible.filter(
                    (e) => dayKey(e.start, tz) === day,
                  );
                  return (
                    <div key={day}>
                      <div className="history-day">
                        {day === today ? "Today" : day}
                        <span>
                          {events.filter((e) => e.kind === "feed").length} feeds
                          ·{" "}
                          {minutes(
                            events.reduce(
                              (n, e) =>
                                n + (e.kind === "feed" ? e.left + e.right : 0),
                              0,
                            ),
                          )}{" "}
                          nursing · {diaperCounts(events).total} diapers
                        </span>
                      </div>
                      <Timeline events={events} />
                    </div>
                  );
                },
              )}
              {!visible.length && <Timeline events={[]} />}
            </section>
          )}
          {tab === "Insights" && (
            <section className="card">
              <div className="card-heading">
                <h2>Your care rhythm</h2>
                <select
                  aria-label="Insight period"
                  value={period}
                  onChange={(e) => setPeriod(+e.target.value)}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
              <Insights events={state.events} timezone={tz} period={period} />
              <p className="muted">
                Your logs tell a story, not a medical recommendation. Nursing
                time does not measure milk intake.
              </p>
            </section>
          )}
          {tab === "Settings" && (
            <section className="card settings-card">
              <h2>Your little one</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  await update((s) => ({
                    ...s,
                    baby: {
                      name: String(data.get("name")).trim(),
                      dob: String(data.get("dob")),
                      timezone: String(data.get("timezone")),
                      weight: String(data.get("weight")),
                      preferences: String(data.get("preferences")),
                    },
                  }));
                  setNotice("Baby profile saved.");
                }}
              >
                <div className="form-grid">
                  <label>
                    Baby’s name
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={state.baby.name}
                    />
                  </label>
                  <label>
                    Date of birth
                    <input
                      name="dob"
                      type="date"
                      max={today}
                      defaultValue={state.baby.dob}
                    />
                  </label>
                  <label>
                    Birth weight (optional)
                    <input
                      name="weight"
                      maxLength={40}
                      placeholder="e.g. 3.2 kg"
                      defaultValue={state.baby.weight}
                    />
                  </label>
                  <label>
                    Baby’s timezone
                    <select name="timezone" defaultValue={tz}>
                      {Intl.supportedValuesOf("timeZone").map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Feeding preferences
                  <textarea
                    name="preferences"
                    maxLength={1000}
                    defaultValue={state.baby.preferences}
                    placeholder="What works for your little one?"
                  />
                </label>
                <button className="primary" disabled={!ready}>
                  <Check size={16} />
                  Save profile
                </button>
              </form>
              <hr />
              <h3>A peaceful nighttime view</h3>
              <button
                className="secondary"
                onClick={() => update((s) => ({ ...s, dark: !s.dark }))}
              >
                <Moon size={17} />
                {state.dark ? "Use light mode" : "Use nighttime mode"}
              </button>
              <hr />
              <h3>A rhythm of your own</h3>
              <button className="secondary" onClick={() => setTab("Insights")}>
                <BarChart3 size={17} />
                View care insights
              </button>
              <hr />
              <h3>Your data, in your hands</h3>
              <p>
                Phase 1 keeps care logs in this browser’s IndexedDB. Export a
                backup before clearing browser data. Account sign-in,
                invitations, and shared sync are planned for Phase 2.
              </p>
              <button className="secondary" onClick={exportData}>
                <Download size={17} />
                Export baby data
              </button>
              <hr />
              <h3>Reminders & installation</h3>
              <p>
                Reminders are off. This version does not send background
                reminders. On iPhone, add Nest Little Baby to your Home Screen
                using Safari’s Share menu. iOS web push requires a Home Screen
                installation on iOS 16.4 or later and explicit permission; it
                requires a push service, planned for a later phase.
              </p>
            </section>
          )}
        </main>
        <nav className="mobile-nav">
          {[
            ...nav.filter((n) => n.name !== "Insights"),
            { name: "Settings" as const, icon: Settings },
          ].map((n) => (
            <button
              key={n.name}
              className={tab === n.name ? "active" : ""}
              onClick={() => setTab(n.name)}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      {(editing || manual) && (
        <EventEditor
          event={editing}
          timezone={tz}
          onClose={() => {
            setEditing(null);
            setManual(false);
          }}
          onDelete={remove}
          onSave={async (event) => {
            await locked(async () => {
              if (
                event.kind === "feed" &&
                (current.current.events.some(
                  (e) =>
                    e.kind === "feed" &&
                    e.id !== event.id &&
                    e.start < event.end &&
                    e.end > event.start,
                ) ||
                  (current.current.timer &&
                    event.end > current.current.timer.start))
              )
                throw Error(
                  "This feeding overlaps another session. Please adjust the times.",
                );
              await update((s) => ({
                ...s,
                events: mergeById(s.events, event),
              }));
            });
            setEditing(null);
            setManual(false);
            setNotice("Care moment saved.");
          }}
        />
      )}
    </div>
  );
}
function localInput(n: number, tz: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(n);
  return parts.replace(" ", "T");
}
function parseLocal(value: string, tz: string) {
  const target = Date.parse(value + "Z");
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const shown = Date.parse(localInput(guess, tz) + "Z");
    guess += target - shown;
  }
  if (localInput(guess, tz) !== value)
    throw Error(
      "That local time does not exist due to daylight saving time. Choose another time.",
    );
  return guess;
}
function EventEditor({
  event,
  timezone,
  onClose,
  onSave,
  onDelete,
}: {
  event: CareEvent | null;
  timezone: string;
  onClose: () => void;
  onSave: (e: CareEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const feed = !event || event.kind === "feed";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-heading">
          <h2 id="editor-title">
            {event ? "Edit this little moment" : "Add a past feeding"}
          </h2>
          <button
            className="icon-button"
            aria-label="Close editor"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setSaving(true);
            try {
              const d = new FormData(e.currentTarget),
                start = parseLocal(String(d.get("start")), timezone),
                notes = String(d.get("notes"));
              if (start > Date.now() + 60000)
                throw Error("Choose a time in the past.");
              let next: CareEvent;
              if (feed) {
                const left = Number(d.get("left")) * 60000,
                  right = Number(d.get("right")) * 60000,
                  end = parseLocal(String(d.get("end")), timezone);
                if (
                  left + right <= 0 ||
                  end <= start ||
                  left + right > end - start + 60000
                )
                  throw Error(
                    "Check the times: nursing duration must fit within the session and be greater than zero.",
                  );
                if (end > Date.now() + 60000)
                  throw Error("The end time must be in the past.");
                next = {
                  id: event?.id ?? crypto.randomUUID(),
                  kind: "feed",
                  start,
                  end,
                  left,
                  right,
                  lastSide: String(d.get("lastSide")) as Side,
                  notes,
                };
              } else {
                next = {
                  ...(event as Diaper),
                  start,
                  type: String(d.get("type")) as Diaper["type"],
                  notes,
                  color: String(d.get("color")),
                  consistency: String(d.get("consistency")),
                };
              }
              await onSave(next);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Start time · {timezone}
            <input
              name="start"
              type="datetime-local"
              required
              defaultValue={localInput(
                event?.start ?? Date.now() - 1200000,
                timezone,
              )}
            />
          </label>
          {feed ? (
            <>
              <label>
                End time
                <input
                  name="end"
                  type="datetime-local"
                  required
                  defaultValue={localInput(
                    event?.kind === "feed" ? event.end : Date.now(),
                    timezone,
                  )}
                />
              </label>
              <div className="form-grid">
                <label>
                  Left (minutes)
                  <input
                    name="left"
                    type="number"
                    min="0"
                    max="1440"
                    step="0.01"
                    required
                    defaultValue={
                      event?.kind === "feed"
                        ? (event.left / 60000).toFixed(2)
                        : 10
                    }
                  />
                </label>
                <label>
                  Right (minutes)
                  <input
                    name="right"
                    type="number"
                    min="0"
                    max="1440"
                    step="0.01"
                    required
                    defaultValue={
                      event?.kind === "feed"
                        ? (event.right / 60000).toFixed(2)
                        : 10
                    }
                  />
                </label>
              </div>
              <label>
                Last side used
                <select
                  name="lastSide"
                  defaultValue={
                    event?.kind === "feed" ? event.lastSide : "right"
                  }
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Diaper type
                <select name="type" defaultValue={event.type}>
                  <option value="wet">Wet</option>
                  <option value="dirty">Dirty</option>
                  <option value="both">Both</option>
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Poop color
                  <input
                    name="color"
                    maxLength={50}
                    defaultValue={event.color}
                  />
                </label>
                <label>
                  Consistency
                  <input
                    name="consistency"
                    maxLength={50}
                    defaultValue={event.consistency}
                  />
                </label>
              </div>
            </>
          )}
          <label>
            Notes
            <textarea
              name="notes"
              maxLength={1000}
              defaultValue={event?.notes}
            />
          </label>
          {error && (
            <p role="alert" className="validation">
              {error}
            </p>
          )}
          <div className="modal-actions">
            {event && (
              <button
                className="delete-button"
                type="button"
                onClick={() => {
                  if (confirm("Remove this care entry?")) onDelete(event.id);
                }}
              >
                <Trash2 size={16} />
                Delete / undo
              </button>
            )}
            <button disabled={saving} className="primary">
              <Check size={17} />
              {saving ? "Saving…" : "Save moment"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Insights({
  events,
  timezone,
  period,
}: {
  events: CareEvent[];
  timezone: string;
  period: number;
}) {
  const data = Array.from({ length: period }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (period - 1 - i));
    const key = dayKey(d.getTime(), timezone),
      items = events.filter((e) => dayKey(e.start, timezone) === key),
      f = items.filter((e): e is Feed => e.kind === "feed"),
      c = diaperCounts(items);
    return {
      day: key.slice(5),
      feeds: f.length,
      minutes: Math.round(f.reduce((a, e) => a + e.left + e.right, 0) / 60000),
      wet: c.wet,
      dirty: c.dirty,
      left: f.reduce((a, e) => a + e.left, 0) / 60000,
      right: f.reduce((a, e) => a + e.right, 0) / 60000,
    };
  });
  const total = data.reduce((a, d) => a + d.minutes, 0),
    sessions = data.reduce((a, d) => a + d.feeds, 0);
  return (
    <>
      <div className="insight-summary">
        <div>
          <strong>{sessions}</strong>
          <small>feeding sessions</small>
        </div>
        <div>
          <strong>{total}m</strong>
          <small>total nursing</small>
        </div>
        <div>
          <strong>{sessions ? Math.round(total / sessions) : 0}m</strong>
          <small>average session</small>
        </div>
        <div>
          <strong>
            {Math.round(data.reduce((a, d) => a + d.left, 0))} /{" "}
            {Math.round(data.reduce((a, d) => a + d.right, 0))}m
          </strong>
          <small>left / right</small>
        </div>
      </div>
      {[
        { title: "Daily nursing time", keys: ["minutes"], colors: ["#64826c"] },
        { title: "Feeding sessions", keys: ["feeds"], colors: ["#c99477"] },
        {
          title: "Diaper changes",
          keys: ["wet", "dirty"],
          colors: ["#89aab9", "#b5a0bf"],
        },
      ].map((chart) => (
        <div className="chart" key={chart.title}>
          <h3>{chart.title}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 13 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              {chart.keys.map((k, i) => (
                <Bar
                  key={k}
                  name={k}
                  dataKey={k}
                  fill={chart.colors[i]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </>
  );
}
