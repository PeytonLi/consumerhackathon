import { useEffect, useRef, useState, type ReactNode } from "react";
import { describeRewardMode } from "../convex/lib/rewardMode.js";
import {
  classifyPlayerArchetype,
  computeCalibratedPropLine,
  gradeKrillionDiveWithSystemOne,
  type KrillionGradeResult,
} from "../convex/lib/systemOne.js";
import { evaluateWordleMask } from "../convex/nickel.js";
import {
  CADENCE_LABELS,
  DEMO_MEMBERS,
  GAMES,
  GAME_ORDER,
  TAB_TITLES,
  THEME_LABELS,
  findLeague,
  potLabel,
  type Cadence,
  type GameKind,
  type League,
  type Member,
  type RewardMode,
  type TabKind,
  type ThemeType,
} from "../shared/league.js";

interface GameResult {
  points: number;
  total: number;
  summary: string;
  tier: string;
}

interface Wager {
  id: number;
  maker: string;
  target: string;
  line: number;
  side: "over" | "under";
  stake: number;
}

type Finish = (points: number, summary: string, tier: string) => void;

const TABS: TabKind[] = ["play", "board", "league", "wrapped"];
const REWARD_OPTIONS: { value: RewardMode; label: string }[] = [
  { value: "points_only", label: "Points" },
  { value: "cash_only", label: "Cash" },
  { value: "hybrid", label: "Both" },
];

function readLocation() {
  const query = new URLSearchParams(window.location.search);
  const code = window.location.pathname.match(/^\/c\/([A-Za-z0-9]+)/)?.[1] ?? query.get("league");
  const tab = query.get("tab") as TabKind | null;
  const game = query.get("g") as GameKind | null;
  return {
    code,
    tab: tab && TABS.includes(tab) ? tab : "play",
    game: game && GAME_ORDER.includes(game) ? game : null,
    handle: (query.get("u") ?? "sritej").toLowerCase(),
  };
}

function useCountdown(seconds: number, running: boolean, onZero: () => void) {
  const [left, setLeft] = useState(seconds);
  const callback = useRef(onZero);
  callback.current = onZero;
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - (Date.now() - started) / 1000);
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        callback.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [running, seconds]);
  return left;
}

function useSweep(active: boolean, periodMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = ((now - started) / periodMs) % 2;
      setValue(t < 1 ? t : 2 - t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, periodMs]);
  return value;
}

function PrimaryButton(props: { children: ReactNode; onClick: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="w-full rounded-full bg-paper py-4 text-[15px] font-semibold text-ink transition active:scale-[0.98] disabled:opacity-30"
    >
      {props.children}
    </button>
  );
}

function Segmented<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={props.name} className="flex rounded-full border border-line p-1">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={props.value === option.value}
          onClick={() => props.onChange(option.value)}
          className={
            "flex-1 rounded-full py-2.5 text-sm transition " +
            (props.value === option.value ? "bg-paper font-semibold text-ink" : "text-soft")
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Avatar({ member, size = 36 }: { member: Member; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold " +
        (member.played ? "bg-paper text-ink" : "border border-line text-mute")
      }
    >
      {member.name[0]}
    </span>
  );
}

function Track({ value, zone }: { value: number; zone?: { center: number; width: number } }) {
  return (
    <div className="relative h-14 rounded-full border border-line bg-card">
      {zone && (
        <div
          className="absolute top-1 bottom-1 rounded-full bg-accent/25 ring-1 ring-accent"
          style={{ left: (zone.center - zone.width / 2) * 100 + "%", width: zone.width * 100 + "%" }}
        />
      )}
      <div className="absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper" style={{ left: 6 + value * 88 + "%" }} />
    </div>
  );
}

function Krillion({ league, onFinish }: { league: League; onFinish: Finish }) {
  const [phase, setPhase] = useState<"ready" | "running" | "grading" | "done">("ready");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<KrillionGradeResult | null>(null);
  const latest = useRef({ answer, phase });
  latest.current = { answer, phase };

  const submit = async () => {
    if (latest.current.phase !== "running") return;
    setPhase("grading");
    const given = latest.current.answer.trim();
    const graded = await gradeKrillionDiveWithSystemOne({
      categoryPrompt: league.krillionPrompt,
      answer: given,
      leagueTheme: league.themeType,
    });
    setResult(graded);
    setPhase("done");
    onFinish(graded.basePoints, given || "No answer", graded.tierLabel);
  };
  const left = useCountdown(GAMES.krillion.seconds, phase === "running", submit);

  if (phase === "ready") {
    return (
      <div className="space-y-6">
        <p className="font-serif text-4xl leading-tight">{league.krillionPrompt}</p>
        <p className="text-sm text-soft">You get 25 seconds. The answer fewest people would give dives deepest.</p>
        <PrimaryButton onClick={() => setPhase("running")}>Start the clock</PrimaryButton>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="space-y-5">
        <p className="kicker">You said</p>
        <p className="font-serif text-5xl leading-none">{answer.trim() || "Nothing"}</p>
        <div className="h-2 rounded-full bg-card">
          <div className="h-2 rounded-full bg-accent" style={{ width: result.depthMeters / 10 + "%" }} />
        </div>
        <div className="flex justify-between text-sm">
          <span>{result.tierLabel}</span>
          <span className="font-mono text-soft">{result.depthMeters} m</span>
        </div>
        <p className="text-sm text-soft">{result.explanation}</p>
        <p className="kicker">Graded in {result.evaluationMs} ms</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <p className="font-serif text-3xl leading-tight">{league.krillionPrompt}</p>
        <span aria-label="Seconds left" className={"font-mono text-3xl tabular-nums " + (left < 6 ? "text-accent" : "")}>
          {Math.ceil(left)}
        </span>
      </div>
      <div className="h-1 rounded-full bg-card">
        <div className="h-1 rounded-full bg-paper" style={{ width: (left / GAMES.krillion.seconds) * 100 + "%" }} />
      </div>
      <input
        autoFocus
        aria-label="Your answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && submit()}
        placeholder="Your answer"
        autoComplete="off"
        autoCorrect="off"
        className="w-full border-b border-line bg-transparent pb-3 font-serif text-4xl outline-none placeholder:text-line focus:border-paper"
      />
      <PrimaryButton onClick={submit} disabled={phase === "grading" || !answer.trim()}>
        {phase === "grading" ? "Grading" : "Lock it in"}
      </PrimaryButton>
    </div>
  );
}

function WordBlitz({ league, onFinish }: { league: League; onFinish: Finish }) {
  const [guesses, setGuesses] = useState<{ word: string; mask: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [over, setOver] = useState(false);

  const guess = () => {
    const word = draft.toUpperCase();
    if (word.length !== 5 || over) return;
    const mask = evaluateWordleMask(league.wordleTarget, word);
    const next = [...guesses, { word, mask }];
    setGuesses(next);
    setDraft("");
    const solved = mask === "GGGGG";
    if (!solved && next.length < 4) return;
    setOver(true);
    const greens = Math.max(...next.map((g) => g.mask.split("").filter((c) => c === "G").length));
    onFinish(solved ? 100 - (next.length - 1) * 20 : greens * 8, solved ? "Solved in " + next.length : "Missed the word", solved ? "Solved" : "Missed");
  };

  const rows = [0, 1, 2, 3].map((row) => guesses[row] ?? { word: row === guesses.length ? draft.toUpperCase() : "", mask: "" });
  const tile = (mark: string | undefined) =>
    mark === "G" ? "bg-good text-ink border-good" : mark === "Y" ? "bg-warn text-ink border-warn" : mark === "B" ? "bg-card text-mute border-line" : "border-line";

  return (
    <div className="space-y-6">
      <div className="space-y-2" aria-label="Guess grid">
        {rows.map((row, r) => (
          <div key={r} className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className={"flex aspect-square items-center justify-center rounded-lg border font-serif text-3xl " + tile(row.mask[c])}>
                {row.word[c] ?? ""}
              </div>
            ))}
          </div>
        ))}
      </div>
      {over ? (
        <p className="text-sm text-soft">The word was {league.wordleTarget}.</p>
      ) : (
        <>
          <input
            aria-label="Five letter guess"
            value={draft}
            maxLength={5}
            onChange={(event) => setDraft(event.target.value.replace(/[^a-zA-Z]/g, ""))}
            onKeyDown={(event) => event.key === "Enter" && guess()}
            placeholder="Five letters"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            className="w-full border-b border-line bg-transparent pb-3 font-serif text-3xl uppercase tracking-widest outline-none placeholder:text-line focus:border-paper"
          />
          <PrimaryButton onClick={guess} disabled={draft.length !== 5}>
            Guess {guesses.length + 1} of 4
          </PrimaryButton>
        </>
      )}
    </div>
  );
}

const CUP_ZONES = [
  { center: 0.5, width: 0.24 },
  { center: 0.3, width: 0.21 },
  { center: 0.72, width: 0.18 },
  { center: 0.42, width: 0.16 },
  { center: 0.62, width: 0.14 },
];

function CupPong({ onFinish }: { onFinish: Finish }) {
  const [shots, setShots] = useState<boolean[]>([]);
  const active = shots.length < 5;
  const position = useSweep(active, 1100 - shots.length * 110);
  const zone = CUP_ZONES[Math.min(shots.length, 4)];

  const release = () => {
    if (!active) return;
    const next = [...shots, Math.abs(position - zone.center) <= zone.width / 2];
    setShots(next);
    if (next.length < 5) return;
    const made = next.filter(Boolean).length;
    onFinish(made * 20, made + " of 5 cups", made >= 4 ? "Hot hand" : made >= 2 ? "Steady" : "Cold");
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2" aria-label="Throws">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={
              "h-2 flex-1 rounded-full " + (shots[i] === undefined ? "bg-card" : shots[i] ? "bg-good" : "bg-accent")
            }
          />
        ))}
      </div>
      <Track value={position} zone={zone} />
      <p className="text-sm text-soft">
        {active ? "Throw " + (shots.length + 1) + " of 5. The cup gets smaller each time." : shots.filter(Boolean).length + " of 5 landed."}
      </p>
      {active && <PrimaryButton onClick={release}>Throw</PrimaryButton>}
    </div>
  );
}

function MiniGolf({ onFinish }: { onFinish: Finish }) {
  const [power, setPower] = useState<number | null>(null);
  const position = useSweep(power === null, 800);
  const pin = 0.68;
  const feet = power === null ? null : Math.round(Math.abs(power - pin) * 60);

  const putt = () => {
    if (power !== null) return;
    setPower(position);
    const distance = Math.round(Math.abs(position - pin) * 60);
    onFinish(Math.max(0, 100 - distance * 4), distance === 0 ? "Hole in one" : distance + " ft from the pin", distance === 0 ? "Ace" : distance <= 5 ? "Tap in" : "Long putt");
  };

  return (
    <div className="space-y-6">
      <div className="relative h-24 rounded-2xl border border-line bg-card">
        <div className="absolute top-1/2 h-px w-full bg-line" />
        <div className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent" style={{ left: 6 + pin * 88 + "%" }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper transition-all duration-700"
          style={{ left: 6 + (power ?? 0) * 88 + "%" }}
        />
      </div>
      <p className="kicker">Power</p>
      <Track value={power ?? position} />
      <p className="text-sm text-soft">
        {feet === null ? "One putt. Stop the meter where the ball should stop." : feet === 0 ? "Hole in one." : "You finished " + feet + " ft from the pin."}
      </p>
      {power === null && <PrimaryButton onClick={putt}>Putt</PrimaryButton>}
    </div>
  );
}

const FLEET = new Set([1, 6, 11, 13, 14, 22, 23, 24]);

function Salvo({ onFinish }: { onFinish: Finish }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [fired, setFired] = useState(false);

  const toggle = (cell: number) => {
    if (fired) return;
    setPicked((current) => (current.includes(cell) ? current.filter((c) => c !== cell) : current.length < 5 ? [...current, cell] : current));
  };
  const fire = () => {
    setFired(true);
    const hits = picked.filter((cell) => FLEET.has(cell)).length;
    onFinish(hits * 20, hits + " of 5 hits", hits >= 4 ? "Sharpshooter" : hits >= 2 ? "On target" : "Open water");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-2" aria-label="Target grid">
        {Array.from({ length: 25 }, (_, cell) => {
          const chosen = picked.includes(cell);
          const hit = fired && chosen && FLEET.has(cell);
          const miss = fired && chosen && !FLEET.has(cell);
          const ship = fired && !chosen && FLEET.has(cell);
          return (
            <button
              key={cell}
              type="button"
              aria-label={"Cell " + (cell + 1)}
              aria-pressed={chosen}
              onClick={() => toggle(cell)}
              className={
                "aspect-square rounded-lg border transition " +
                (hit ? "border-good bg-good" : miss ? "border-accent bg-accent/30" : ship ? "border-soft bg-line" : chosen ? "border-paper bg-paper" : "border-line bg-card")
              }
            />
          );
        })}
      </div>
      <p className="text-sm text-soft">
        {fired ? picked.filter((cell) => FLEET.has(cell)).length + " of 5 shots hit the fleet." : "Pick five cells, then fire. " + picked.length + " of 5 chosen."}
      </p>
      {!fired && (
        <PrimaryButton onClick={fire} disabled={picked.length !== 5}>
          Fire
        </PrimaryButton>
      )}
    </div>
  );
}

export default function App() {
  const start = useRef(readLocation()).current;
  const [league, setLeague] = useState<League>(() => findLeague(start.code));
  const [members, setMembers] = useState<Member[]>(DEMO_MEMBERS);
  const [tab, setTab] = useState<TabKind>(start.tab);
  const [game, setGame] = useState<GameKind | null>(start.tab === "play" ? start.game : null);
  const [done, setDone] = useState<Partial<Record<GameKind, GameResult>>>({});
  const [liveGame, setLiveGame] = useState<GameKind | null>(null);
  const [paid, setPaid] = useState(false);
  const [wagers, setWagers] = useState<Wager[]>([
    { id: 1, maker: "Alex", target: "Sritej", line: 62.5, side: "under", stake: 5 },
    { id: 2, maker: "Maya", target: "Peyton", line: 64.5, side: "over", stake: 10 },
  ]);
  const [wagerTarget, setWagerTarget] = useState("u_peyton");
  const [wagerSide, setWagerSide] = useState<"over" | "under">("over");
  const [wagerStake, setWagerStake] = useState("5");

  const me = members.find((m) => m.handle === start.handle) ?? members[0];
  const others = members.filter((m) => m.id !== me.id);
  const reward = describeRewardMode({
    rewardMode: league.rewardMode,
    potBalanceCents: league.potBalanceCents,
    buyInCents: league.buyInCents,
    customRewardLabel: league.customRewardLabel,
    nickelBalance: me.nickels,
  });
  const standings = [...members].sort((a, b) => b.seasonPoints - a.seasonPoints);
  const playedCount = members.filter((m) => m.played).length;
  const poachTarget = others.find((m) => m.poachable && m.unclaimed > 0);
  const stakeUnit = reward.showNickelPoints ? "nickels" : "dollars";

  const finish = (kind: GameKind): Finish => (points, summary, tier) => {
    const total = Math.round(points * league.squadMultiplier);
    setDone((current) => ({ ...current, [kind]: { points, total, summary, tier } }));
    setLiveGame(kind);
    setMembers((current) =>
      current.map((m) =>
        m.id === me.id
          ? {
              ...m,
              played: true,
              answer: m.played ? m.answer : summary,
              tier: m.played ? m.tier : tier,
              pointsToday: m.pointsToday + total,
              seasonPoints: m.seasonPoints + total,
              nickels: m.nickels + m.unclaimed,
              unclaimed: 0,
            }
          : m
      )
    );
  };

  const poach = () => {
    if (!poachTarget) return;
    setMembers((current) =>
      current.map((m) =>
        m.id === poachTarget.id
          ? { ...m, unclaimed: 0, poachable: false }
          : m.id === me.id
            ? { ...m, nickels: m.nickels + poachTarget.unclaimed, poached: m.poached + poachTarget.unclaimed }
            : m
      )
    );
  };

  const placeWager = () => {
    const target = members.find((m) => m.id === wagerTarget);
    const stake = Number(wagerStake);
    if (!target || (reward.showNickelPoints && stake > me.nickels)) return;
    const { lineValue } = computeCalibratedPropLine([Math.round(target.seasonPoints / 10)]);
    setWagers((current) => [{ id: Date.now(), maker: me.name, target: target.name, line: lineValue, side: wagerSide, stake }, ...current]);
    if (reward.showNickelPoints) {
      setMembers((current) => current.map((m) => (m.id === me.id ? { ...m, nickels: m.nickels - stake } : m)));
    }
  };

  const openGame = (kind: GameKind) => {
    setLiveGame(null);
    setGame(kind);
  };

  const renderGame = (kind: GameKind) => {
    if (kind === "krillion") return <Krillion league={league} onFinish={finish(kind)} />;
    if (kind === "wordle") return <WordBlitz league={league} onFinish={finish(kind)} />;
    if (kind === "cup_pong") return <CupPong onFinish={finish(kind)} />;
    if (kind === "mini_golf") return <MiniGolf onFinish={finish(kind)} />;
    return <Salvo onFinish={finish(kind)} />;
  };

  const gameResult = game ? done[game] : undefined;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 pb-28">
      <header className="border-b border-line pt-8 pb-6">
        <div className="flex items-center justify-between">
          <span className="kicker text-paper">Nickel</span>
          <span className="kicker">{league.code}</span>
        </div>
        <h1 className="mt-5 font-serif text-[44px] leading-none">{league.name}</h1>
        <p className="mt-3 text-sm text-soft">
          {potLabel(league)}. {league.daysLeft} days left.
        </p>
        <div className="mt-5 flex items-center justify-between text-sm">
          <span>
            Playing as <span className="font-semibold">{me.name}</span>
          </span>
          <span className="font-mono text-soft" aria-label="Your balance">
            {me.nickels} nickels
          </span>
        </div>
      </header>

      {tab === "play" && game && (
        <main className="pt-6">
          <button type="button" onClick={() => setGame(null)} className="kicker">
            All games
          </button>
          <div className="mt-5 mb-7">
            <p className="kicker text-accent">{GAMES[game].seconds} seconds</p>
            <h2 className="mt-2 font-serif text-5xl leading-none">{GAMES[game].title}</h2>
          </div>
          {gameResult && (
            <div className="mb-7 rounded-2xl border border-line bg-card p-5" aria-label="Round result">
              <div className="flex items-end justify-between">
                <span className="font-serif text-6xl leading-none">+{gameResult.total}</span>
                <span className="text-right text-sm text-soft">
                  {gameResult.summary}
                  <br />
                  {gameResult.points} x {league.squadMultiplier} squad streak
                </span>
              </div>
            </div>
          )}
          {(!gameResult || liveGame === game) && renderGame(game)}
          {gameResult && (
            <div className="mt-6">
              <PrimaryButton onClick={() => setGame(null)}>See what everyone put</PrimaryButton>
            </div>
          )}
        </main>
      )}

      {tab === "play" && !game && (
        <main className="pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-3xl">Today</h2>
            <span className="kicker">
              {playedCount} of {members.length} played
            </span>
          </div>
          {!me.played && <p className="mt-2 text-sm text-soft">Play one game to see what everyone put.</p>}
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <Avatar member={m} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{m.name}</p>
                  {m.played ? (
                    <p className={"truncate text-sm text-soft " + (me.played ? "" : "blur-sm select-none")} aria-hidden={!me.played}>
                      {m.answer}, {m.tier}
                    </p>
                  ) : (
                    <p className="text-sm text-mute">Has not played</p>
                  )}
                </div>
                <span className={"font-mono text-sm " + (m.played && !me.played ? "blur-sm select-none" : "text-soft")}>
                  {m.played ? "+" + m.pointsToday : ""}
                </span>
              </li>
            ))}
          </ul>

          {me.played && poachTarget && (
            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-accent/50 p-4">
              <p className="text-sm">
                {poachTarget.name} has not played. {poachTarget.unclaimed} nickels are up for grabs.
              </p>
              <button type="button" onClick={poach} className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink">
                Poach
              </button>
            </div>
          )}

          <h2 className="mt-9 font-serif text-3xl">Games</h2>
          <ul className="mt-3 border-t border-line">
            {GAME_ORDER.map((kind, index) => (
              <li key={kind}>
                <button type="button" onClick={() => openGame(kind)} className="flex w-full items-center gap-4 border-b border-line py-4 text-left">
                  <span className="kicker w-5">0{index + 1}</span>
                  <span className="flex-1">
                    <span className="block font-serif text-2xl leading-tight">{GAMES[kind].title}</span>
                    <span className="block text-sm text-soft">{GAMES[kind].blurb}</span>
                  </span>
                  <span className="font-mono text-sm text-soft">{done[kind] ? "+" + done[kind].total : GAMES[kind].seconds + "s"}</span>
                </button>
              </li>
            ))}
          </ul>
        </main>
      )}

      {tab === "board" && (
        <main className="pt-6">
          <h2 className="font-serif text-3xl">Put a nickel on it</h2>
          <p className="mt-2 text-sm text-soft">Call the over or under on a friend's score today.</p>
          <div className="mt-5 space-y-4 rounded-2xl border border-line bg-card p-5">
            <label className="block">
              <span className="kicker">Friend</span>
              <select
                aria-label="Friend"
                value={wagerTarget}
                onChange={(event) => setWagerTarget(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-ink px-3 py-3"
              >
                {others.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <Segmented
              name="Side"
              value={wagerSide}
              onChange={setWagerSide}
              options={[
                { value: "over", label: "Over" },
                { value: "under", label: "Under" },
              ]}
            />
            <Segmented
              name="Stake"
              value={wagerStake}
              onChange={setWagerStake}
              options={["5", "10", "15"].map((value) => ({ value, label: reward.showNickelPoints ? value : "$" + value }))}
            />
            <PrimaryButton onClick={placeWager}>
              Place {reward.showNickelPoints ? wagerStake + " " + stakeUnit : "$" + wagerStake}
            </PrimaryButton>
          </div>
          <ul className="mt-6 divide-y divide-line border-y border-line" aria-label="Open wagers">
            {wagers.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <p className="text-[15px]">
                    {w.maker} took the {w.side} on {w.target}
                  </p>
                  <p className="text-sm text-soft">Line {w.line} points</p>
                </div>
                <span className="font-mono text-sm">{reward.showNickelPoints ? w.stake + " nkl" : "$" + w.stake}</span>
              </li>
            ))}
          </ul>
        </main>
      )}

      {tab === "league" && (
        <main className="pt-6">
          <h2 className="font-serif text-3xl">Standings</h2>
          <ol className="mt-3 divide-y divide-line border-y border-line">
            {standings.map((m, index) => (
              <li key={m.id} className="flex items-center gap-4 py-3">
                <span className="w-6 font-serif text-2xl text-mute">{index + 1}</span>
                <span className="flex-1">
                  <span className="block text-[15px]">{m.name}</span>
                  <span className="block text-sm text-mute">{m.school}</span>
                </span>
                <span className="font-mono text-sm">{m.seasonPoints}</span>
              </li>
            ))}
          </ol>

          <h2 className="mt-9 font-serif text-3xl">What you play for</h2>
          <p className="mt-2 text-sm text-soft">{reward.seasonPrizeHeadline}</p>
          <div className="mt-4 space-y-5">
            <div>
              <p className="kicker mb-2">Rewards</p>
              <Segmented
                name="Reward mode"
                value={league.rewardMode}
                options={REWARD_OPTIONS}
                onChange={(rewardMode) => setLeague((current) => ({ ...current, rewardMode, buyInCents: current.buyInCents || 500 }))}
              />
            </div>
            {reward.showWhopCheckout ? (
              <PrimaryButton
                disabled={paid}
                onClick={() => {
                  setPaid(true);
                  setLeague((current) => ({ ...current, potBalanceCents: current.potBalanceCents + current.buyInCents }));
                }}
              >
                {paid ? "Buy-in paid" : "Pay the $" + (league.buyInCents / 100).toFixed(0) + " buy-in with Whop"}
              </PrimaryButton>
            ) : (
              <label className="block">
                <span className="kicker">The stakes</span>
                <input
                  aria-label="The stakes"
                  value={league.customRewardLabel}
                  onChange={(event) => setLeague((current) => ({ ...current, customRewardLabel: event.target.value }))}
                  className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-3"
                />
              </label>
            )}
            <div>
              <p className="kicker mb-2">Payout</p>
              <Segmented
                name="Payout cadence"
                value={league.cadence}
                options={(Object.keys(CADENCE_LABELS) as Cadence[]).map((value) => ({ value, label: CADENCE_LABELS[value].replace("Every ", "") }))}
                onChange={(cadence) => setLeague((current) => ({ ...current, cadence }))}
              />
            </div>
            <label className="block">
              <span className="kicker">League type</span>
              <select
                aria-label="League type"
                value={league.themeType}
                onChange={(event) => setLeague((current) => ({ ...current, themeType: event.target.value as ThemeType }))}
                className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-3"
              >
                {(Object.keys(THEME_LABELS) as ThemeType[]).map((value) => (
                  <option key={value} value={value}>
                    {THEME_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </main>
      )}

      {tab === "wrapped" && (
        <main className="pt-6">
          <p className="kicker text-accent">Season recap</p>
          <h2 className="mt-2 font-serif text-5xl leading-none">Nickel Wrapped</h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { label: "Season leader", member: standings[0], stat: standings[0].seasonPoints + " points" },
              { label: "Deepest diver", member: [...members].sort((a, b) => b.krillions - a.krillions)[0], stat: "krillions" },
              { label: "Nickel bandit", member: [...members].sort((a, b) => b.poached - a.poached)[0], stat: "nickels poached" },
              { label: "Biggest hater", member: [...members].sort((a, b) => b.fades - a.fades)[0], stat: "unders taken" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-line bg-card p-4">
                <p className="kicker">{item.label}</p>
                <p className="mt-3 font-serif text-3xl leading-none">{item.member.name}</p>
                <p className="mt-2 text-sm text-soft">
                  {item.label === "Deepest diver" ? item.member.krillions + " " : item.label === "Nickel bandit" ? item.member.poached + " " : item.label === "Biggest hater" ? item.member.fades + " " : ""}
                  {item.stat}
                </p>
              </div>
            ))}
          </div>
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {standings.map((m) => {
              const archetype = classifyPlayerArchetype({ krillions: m.krillions, stolenNickels: m.poached, fadesPlaced: m.fades, avgPoints: m.seasonPoints / 10 });
              return (
                <li key={m.id} className="py-4">
                  <p className="kicker">{m.name}</p>
                  <p className="mt-1 font-serif text-2xl">{archetype.title}</p>
                  <p className="text-sm text-soft">{archetype.tagline}</p>
                </li>
              );
            })}
          </ul>
        </main>
      )}

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 border-t border-line bg-ink/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md">
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => {
                setTab(value);
                setGame(null);
              }}
              className={"flex-1 py-4 text-sm " + (tab === value ? "font-semibold text-paper" : "text-mute")}
            >
              {TAB_TITLES[value]}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
