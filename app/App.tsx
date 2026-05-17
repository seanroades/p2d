"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Game from "./Game";

type Phase =
  | "boot"
  | "zoom"
  | "attract"
  | "starting"
  | "playing"
  | "fate"
  | "afterlife"
  | "highscores"
  | "initials";

const BOOT_MS = 2200;
const ZOOM_MS = 1200;
const COIN_MS = 1100;
const SUICIDE_MS = 1800;
const FATE_MS = 4200;
const AFTERLIFE_MS = 3400;
const HIGHSCORES_MS = 9000;

const ROLL_POSITIONS = 4;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const HIGH_SCORE_KEY = "p2d:highscore";
const HIGH_SCORES_KEY = "p2d:highscores";
const VOLUME_KEY = "p2d:volume";
const DEFAULT_VOLUME = 0.55;
const MAX_HIGH_SCORES = 20;

type HighScoreEntry = { deaths: number; initials: string; ts: number };

function normalizeEntry(raw: unknown): HighScoreEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.deaths !== "number" || typeof e.initials !== "string") return null;
  return {
    deaths: Math.max(0, Math.floor(e.deaths)),
    initials: e.initials.slice(0, 3).toUpperCase().padEnd(3, "A"),
    ts: typeof e.ts === "number" ? e.ts : 0,
  };
}

function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(normalizeEntry)
          .filter((e): e is HighScoreEntry => e !== null)
          .sort((a, b) => b.deaths - a.deaths)
          .slice(0, MAX_HIGH_SCORES);
      }
    }
    const legacy = localStorage.getItem(HIGH_SCORE_KEY);
    if (legacy) {
      const p = normalizeEntry(JSON.parse(legacy));
      if (p) return [p];
    }
  } catch {}
  return [];
}

function saveHighScores(list: HighScoreEntry[]) {
  try {
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(list));
  } catch {}
}

function qualifiesForTop(list: HighScoreEntry[], deaths: number): boolean {
  if (deaths <= 0) return false;
  if (list.length < MAX_HIGH_SCORES) return true;
  return deaths > list[MAX_HIGH_SCORES - 1].deaths;
}

function insertHighScoreEntry(
  list: HighScoreEntry[],
  entry: HighScoreEntry,
): HighScoreEntry[] {
  return [...list, entry]
    .sort((a, b) => b.deaths - a.deaths)
    .slice(0, MAX_HIGH_SCORES);
}

function randomOffsetVw() {
  return Math.round((Math.random() - 0.5) * 44 * 10) / 10;
}

type Keys = { left: boolean; right: boolean; jump: boolean };

function useKeys(): Keys {
  const [keys, setKeys] = useState<Keys>({
    left: false,
    right: false,
    jump: false,
  });
  useEffect(() => {
    const set = (k: keyof Keys, v: boolean) =>
      setKeys((s) => (s[k] === v ? s : { ...s, [k]: v }));
    const onDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") set("left", true);
      else if (k === "ArrowRight" || k === "d" || k === "D") set("right", true);
      else if (
        k === "ArrowUp" ||
        k === "w" ||
        k === "W" ||
        k === " " ||
        k === "Spacebar"
      )
        set("jump", true);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") set("left", false);
      else if (k === "ArrowRight" || k === "d" || k === "D") set("right", false);
      else if (
        k === "ArrowUp" ||
        k === "w" ||
        k === "W" ||
        k === " " ||
        k === "Spacebar"
      )
        set("jump", false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
  return keys;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [positions, setPositions] = useState<number[]>(() =>
    Array(ROLL_POSITIONS).fill(0),
  );
  const [highScores, setHighScores] = useState<HighScoreEntry[]>([]);
  const [currentDeaths, setCurrentDeaths] = useState(0);
  const [initialIdx, setInitialIdx] = useState(0);
  const [initialLetters, setInitialLetters] = useState<
    [number, number, number]
  >([0, 0, 0]);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [fateText, setFateText] = useState<"HEAVEN" | "HELL">("HEAVEN");
  const [endTrigger, setEndTrigger] = useState(0);
  const [ending, setEnding] = useState(false);
  const keys = useKeys();
  const introAudioRef = useRef<HTMLAudioElement>(null);
  const gameAudioRef = useRef<HTMLAudioElement>(null);
  const endAudioRef = useRef<HTMLAudioElement>(null);
  const coinAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const intro = introAudioRef.current;
    const game = gameAudioRef.current;
    const end = endAudioRef.current;
    if (!intro || !game || !end) return;

    const INTRO_VOL = 0.1;
    const GAME_VOL = 1.0;
    const END_VOL = 0.5;
    intro.volume = volume * INTRO_VOL;
    game.volume = volume * GAME_VOL;
    end.volume = volume * END_VOL;
    end.playbackRate =
      phase === "fate" || phase === "afterlife" ? 0.5 : 1.0;

    const isGame = phase === "playing";
    const isEnd =
      phase === "fate" ||
      phase === "afterlife" ||
      phase === "highscores" ||
      phase === "initials";

    if (isGame) {
      intro.pause();
      end.pause();
      if (game.paused) {
        game.currentTime = 0;
        void game.play().catch(() => {});
      }
    } else if (isEnd) {
      intro.pause();
      game.pause();
      if (end.paused) {
        void end.play().catch(() => {});
      }
    } else {
      game.pause();
      end.pause();
      if (intro.paused) {
        void intro.play().catch(() => {});
      }
    }
  }, [phase, volume]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {}
  }, [volume]);

  useEffect(() => {
    setPositions(
      Array.from({ length: ROLL_POSITIONS }, () => randomOffsetVw()),
    );
    setHighScores(loadHighScores());
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      if (stored !== null) {
        const v = parseFloat(stored);
        if (!Number.isNaN(v) && v >= 0 && v <= 1) setVolume(v);
      }
    } catch {}

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("attract");
      return;
    }
    const t1 = setTimeout(() => setPhase("zoom"), BOOT_MS);
    const t2 = setTimeout(() => setPhase("attract"), BOOT_MS + ZOOM_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const insertCoin = () => {
    if (phase !== "attract") return;
    setCurrentDeaths(0);
    const coin = coinAudioRef.current;
    if (coin) {
      try {
        coin.volume = volume * 0.55;
        coin.currentTime = 0;
        void coin.play().catch(() => {});
      } catch {}
    }
    setPhase("starting");
    setTimeout(() => setPhase("playing"), COIN_MS);
  };

  const endGame = () => {
    if (phase !== "playing" || ending) return;
    setEnding(true);
    setEndTrigger((c) => c + 1);
    setTimeout(() => {
      setFateText("HEAVEN");
      setPhase("fate");
      setEnding(false);
    }, SUICIDE_MS);
  };

  useEffect(() => {
    if (phase !== "fate") return;
    let cancelled = false;
    let current: "HEAVEN" | "HELL" = "HEAVEN";
    setFateText(current);

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timeouts.push(t);
    };

    let elapsed = 0;
    let delay = 80;
    const cycle = () => {
      if (cancelled) return;
      current = current === "HEAVEN" ? "HELL" : "HEAVEN";
      setFateText(current);
      elapsed += delay;
      delay = Math.min(700, delay * 1.18);
      if (elapsed < FATE_MS - 900) {
        schedule(cycle, delay);
      } else {
        schedule(() => {
          setFateText("HELL");
          schedule(() => setPhase("afterlife"), 750);
        }, delay);
      }
    };
    schedule(cycle, delay);

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "afterlife") return;
    const t = setTimeout(() => setPhase("highscores"), AFTERLIFE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "highscores") return;
    const t = setTimeout(() => {
      if (qualifiesForTop(highScores, currentDeaths)) {
        setInitialIdx(0);
        setInitialLetters([0, 0, 0]);
        setPhase("initials");
      } else {
        setPhase("attract");
      }
    }, HIGHSCORES_MS);
    return () => clearTimeout(t);
  }, [phase, highScores, currentDeaths]);

  useEffect(() => {
    if (phase !== "initials") return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") {
        e.preventDefault();
        setInitialLetters((prev) => {
          const next = [...prev] as [number, number, number];
          next[initialIdx] = (next[initialIdx] - 1 + 26) % 26;
          return next;
        });
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        e.preventDefault();
        setInitialLetters((prev) => {
          const next = [...prev] as [number, number, number];
          next[initialIdx] = (next[initialIdx] + 1) % 26;
          return next;
        });
      } else if (
        k === " " ||
        k === "Spacebar" ||
        k === "Enter" ||
        k === "ArrowUp" ||
        k === "w" ||
        k === "W"
      ) {
        e.preventDefault();
        if (initialIdx < 2) {
          setInitialIdx(initialIdx + 1);
        } else {
          const initials = initialLetters.map((i) => LETTERS[i]).join("");
          const entry: HighScoreEntry = {
            deaths: currentDeaths,
            initials,
            ts: Date.now(),
          };
          const next = insertHighScoreEntry(highScores, entry);
          setHighScores(next);
          saveHighScores(next);
          setPhase("attract");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, initialIdx, initialLetters, currentDeaths, highScores]);

  const cabinetVisible =
    phase === "zoom" ||
    phase === "attract" ||
    phase === "starting" ||
    phase === "playing" ||
    phase === "fate" ||
    phase === "afterlife" ||
    phase === "highscores" ||
    phase === "initials";

  return (
    <div className="stage">
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <svg
        width="0"
        height="0"
        style={{ position: "absolute", overflow: "hidden" }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id="crt-bubble"
            x="-2%"
            y="-2%"
            width="104%"
            height="104%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              result="map"
              preserveAspectRatio="none"
              x="0"
              y="0"
              width="100%"
              height="100%"
              href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'><defs><linearGradient id='dx' x1='0' x2='1' y1='0' y2='0'><stop offset='0' stop-color='%23ff0000'/><stop offset='1' stop-color='%23000000'/></linearGradient><linearGradient id='dy' x1='0' x2='0' y1='0' y2='1'><stop offset='0' stop-color='%2300ff00'/><stop offset='1' stop-color='%23000000'/></linearGradient></defs><rect width='100' height='100' fill='url(%23dx)'/><rect width='100' height='100' fill='url(%23dy)' style='mix-blend-mode:screen'/></svg>"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale="14"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div className="stage-bg" aria-hidden="true">
        <div className="stage-glow" />
        <div className="stage-vignette" />
      </div>

      <Cabinet
        phase={phase}
        visible={cabinetVisible}
        highScores={highScores}
        positions={positions}
        onCoin={insertCoin}
        onEnd={endGame}
        onDeath={() => setCurrentDeaths((c) => c + 1)}
        currentDeaths={currentDeaths}
        initialIdx={initialIdx}
        initialLetters={initialLetters}
        keys={keys}
        volume={volume}
        onVolumeChange={setVolume}
        fateText={fateText}
        endTrigger={endTrigger}
        ending={ending}
      />

      {(phase === "boot" || phase === "zoom") && (
        <BootOverlay fading={phase === "zoom"} />
      )}

      <audio
        ref={introAudioRef}
        src="/plucky_retro.wav"
        loop
        preload="auto"
        aria-hidden="true"
      />
      <audio
        ref={gameAudioRef}
        src="/opps_2_retro.wav"
        loop
        preload="auto"
        aria-hidden="true"
      />
      <audio
        ref={endAudioRef}
        src="/dummy%20retro.wav"
        loop
        preload="auto"
        aria-hidden="true"
      />
      <audio
        ref={coinAudioRef}
        src="/coin.mp3"
        preload="auto"
        aria-hidden="true"
      />
    </div>
  );
}

function Cabinet({
  phase,
  visible,
  highScores,
  positions,
  onCoin,
  onEnd,
  onDeath,
  currentDeaths,
  initialIdx,
  initialLetters,
  keys,
  volume,
  onVolumeChange,
  fateText,
  endTrigger,
  ending,
}: {
  phase: Phase;
  visible: boolean;
  highScores: HighScoreEntry[];
  positions: number[];
  onCoin: () => void;
  onEnd: () => void;
  onDeath: () => void;
  currentDeaths: number;
  initialIdx: number;
  initialLetters: [number, number, number];
  keys: Keys;
  volume: number;
  onVolumeChange: (v: number) => void;
  fateText: "HEAVEN" | "HELL";
  endTrigger: number;
  ending: boolean;
}) {
  const tilt =
    keys.left && !keys.right ? -1 : keys.right && !keys.left ? 1 : 0;
  return (
    <div
      className={`cabinet ${visible ? "cabinet-visible" : ""}`}
      aria-label="Playing To Die arcade cabinet"
    >
      <div className="cab-marquee">
        <div className="cab-marquee-glow" />
        <div className="cab-marquee-scan" />
      </div>

      <div className="cab-body">
        <div className="cab-side cab-side-l" />
        <div className="cab-side cab-side-r" />

        <div className="cab-bezel">
          <div className="cab-screen-frame">
            <div className="cab-screen">
              {phase === "playing" ? (
                <Game
                  onDeath={onDeath}
                  volume={volume}
                  endTrigger={endTrigger}
                />
              ) : phase === "starting" ? (
                <StartingScreen />
              ) : phase === "fate" ? (
                <FateScreen text={fateText} />
              ) : phase === "afterlife" ? (
                <AfterlifeScreen deaths={currentDeaths} />
              ) : phase === "highscores" ? (
                <HighScoresScreen
                  entries={highScores}
                  yourDeaths={currentDeaths}
                />
              ) : phase === "initials" ? (
                <InitialsScreen
                  deaths={currentDeaths}
                  idx={initialIdx}
                  letters={initialLetters}
                />
              ) : (
                <AttractScreen
                  positions={positions}
                  highScores={highScores}
                />
              )}
              <div className="cab-screen-scanlines" />
              <div className="cab-screen-glitch" />
              <div className="cab-screen-glare" />
              <div className="cab-screen-vignette" />
            </div>
          </div>
        </div>

        <div className="cab-controls">
          <VolumeSlider value={volume} onChange={onVolumeChange} />
          <div className="cab-controls-inner">
            <div
              className="cab-joystick"
              style={{ "--tilt": tilt } as CSSProperties}
              aria-hidden="true"
            >
              <div className="cab-joystick-base" />
              <div className="cab-joystick-arm">
                <div className="cab-joystick-shaft" />
                <div className="cab-joystick-ball" />
              </div>
            </div>

            <div
              className="cab-jump"
              data-pressed={keys.jump ? "true" : "false"}
              aria-hidden="true"
            >
              <div className="cab-jump-ring" />
              <div className="cab-jump-cap" />
              <span className="cab-jump-label">JUMP</span>
            </div>

            <button
              type="button"
              className={`cab-skull ${phase === "playing" && !ending ? "cab-skull-active" : ""}`}
              onClick={onEnd}
              disabled={phase !== "playing" || ending}
              aria-label="End game"
            >
              <div className="cab-skull-ring" />
              <div className="cab-skull-cap">
                <svg
                  viewBox="0 0 16 16"
                  shapeRendering="crispEdges"
                  aria-hidden="true"
                >
                  <rect x="3" y="2" width="10" height="8" fill="#0a0a0a" />
                  <rect x="4" y="10" width="8" height="3" fill="#0a0a0a" />
                  <rect x="5" y="13" width="1" height="1" fill="#0a0a0a" />
                  <rect x="7" y="13" width="1" height="1" fill="#0a0a0a" />
                  <rect x="9" y="13" width="1" height="1" fill="#0a0a0a" />
                  <rect x="11" y="13" width="1" height="1" fill="#0a0a0a" />
                  <rect x="5" y="4" width="2" height="3" fill="#ffffff" />
                  <rect x="9" y="4" width="2" height="3" fill="#ffffff" />
                  <rect x="7" y="8" width="2" height="1" fill="#ffffff" />
                  <rect x="6" y="10" width="1" height="3" fill="#ffffff" />
                  <rect x="8" y="10" width="1" height="3" fill="#ffffff" />
                  <rect x="10" y="10" width="1" height="3" fill="#ffffff" />
                </svg>
              </div>
              <span className="cab-skull-label">GIVE UP</span>
            </button>

            <button
              type="button"
              className={`cab-coin ${phase === "attract" ? "cab-coin-active" : ""}`}
              onClick={onCoin}
              disabled={phase !== "attract"}
              aria-label="Insert coin"
            >
              <div className="cab-coin-plate">
                <div className="cab-coin-slot" />
                {phase === "starting" && <CoinDrop />}
              </div>
              <span className="cab-coin-label">INSERT COIN</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const v = (clientX - rect.left) / rect.width;
    onChange(Math.max(0, Math.min(1, v)));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    setFromClientX(e.clientX);
  };

  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div className="cab-vol" aria-label="Volume">
      <div
        ref={trackRef}
        className="cab-vol-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        tabIndex={0}
      >
        <div className="cab-vol-fill" style={{ width: `${pct}%` }} />
        <div className="cab-vol-knob" style={{ left: `${pct}%` }}>
          <span className="cab-vol-knob-grip" />
        </div>
      </div>
      <div className="cab-vol-icons" aria-hidden="true">
        <svg viewBox="0 0 16 16" className="cab-vol-spk cab-vol-spk-sm">
          <path
            fill="currentColor"
            d="M2 6 H5 L9 3 V13 L5 10 H2 Z"
          />
          <path
            d="M10.5 6 Q12 8 10.5 10"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <svg viewBox="0 0 20 18" className="cab-vol-spk cab-vol-spk-lg">
          <path
            fill="currentColor"
            d="M2 6 H6 L11 2 V16 L6 12 H2 Z"
          />
          <path
            d="M13 5 Q15.5 9 13 13"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M15.5 3 Q19 9 15.5 15"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

function AttractScreen({
  positions,
  highScores,
}: {
  positions: number[];
  highScores: HighScoreEntry[];
}) {
  const frames = [...positions, positions[0]];
  const top = highScores[0];
  return (
    <div className="attract">
      <div className="attract-stars" aria-hidden="true" />
      <div className="attract-roll">
        {frames.map((x, i) => (
          <div
            key={i}
            className="attract-roll-frame"
            style={{ "--tv-x": `${x * 0.18}vw` } as CSSProperties}
            aria-hidden={i > 0}
          >
            <div className="attract-title">
              <span>PLAYING</span>
              <span>TO</span>
              <span>DIE</span>
            </div>
          </div>
        ))}
      </div>
      <div className="attract-foot">
        <div className="attract-blink">▸ INSERT COIN ◂</div>
        <div className="attract-score">
          HIGH · {top ? top.initials : "---"} ·{" "}
          {String(top ? top.deaths : 0).padStart(4, "0")}
        </div>
        <div className="attract-credit">© 1986 P2D CORP</div>
      </div>
    </div>
  );
}

function FateScreen({ text }: { text: "HEAVEN" | "HELL" }) {
  return (
    <div className="fate" aria-hidden="true">
      <div className={`fate-text fate-${text.toLowerCase()}`}>{text}</div>
      <div className="fate-sub">judgement</div>
    </div>
  );
}

function HighScoresScreen({
  entries,
  yourDeaths,
}: {
  entries: HighScoreEntry[];
  yourDeaths: number;
}) {
  const slots: (HighScoreEntry | null)[] = Array.from(
    { length: MAX_HIGH_SCORES },
    (_, i) => entries[i] ?? null,
  );
  const left = slots.slice(0, 10);
  const right = slots.slice(10, 20);
  const yourRank =
    entries.findIndex((e) => e.deaths === yourDeaths) + 1 || null;

  return (
    <div className="scores" aria-hidden="true">
      <div className="scores-title">TOP TWENTY · ALL TIME</div>
      <div className="scores-grid">
        <div className="scores-col">
          {left.map((e, i) => (
            <div
              key={i}
              className={`scores-row ${
                yourRank === i + 1 ? "scores-row-mine" : ""
              }`}
            >
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <span className="ini">{e ? e.initials : "---"}</span>
              <span className="num">
                {e ? String(e.deaths).padStart(4, "0") : "----"}
              </span>
            </div>
          ))}
        </div>
        <div className="scores-col scores-col-right">
          {right.map((e, i) => (
            <div
              key={i}
              className={`scores-row ${
                yourRank === i + 11 ? "scores-row-mine" : ""
              }`}
            >
              <span className="rank">{String(i + 11).padStart(2, "0")}</span>
              <span className="ini">{e ? e.initials : "---"}</span>
              <span className="num">
                {e ? String(e.deaths).padStart(4, "0") : "----"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AfterlifeScreen({ deaths }: { deaths: number }) {
  return (
    <div className="afterlife afterlife-hell">
      <div className="afterlife-fire" aria-hidden="true" />
      <div className="afterlife-fire afterlife-fire-2" aria-hidden="true" />
      <div className="afterlife-embers" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="afterlife-title">HELL</div>
      <div className="afterlife-sub">welcome home</div>
      <div className="afterlife-deaths">
        {String(deaths).padStart(4, "0")} DEATHS
      </div>
    </div>
  );
}

function InitialsScreen({
  deaths,
  idx,
  letters,
}: {
  deaths: number;
  idx: number;
  letters: [number, number, number];
}) {
  return (
    <div className="initials">
      <div className="initials-banner">NEW HIGH SCORE</div>
      <div className="initials-deaths">
        {String(deaths).padStart(4, "0")} DEATHS
      </div>
      <div className="initials-letters">
        {letters.map((l, i) => {
          const state =
            i === idx ? "active" : i < idx ? "locked" : "pending";
          return (
            <div
              key={i}
              className={`initials-letter initials-letter-${state}`}
            >
              {LETTERS[l]}
            </div>
          );
        })}
      </div>
      <div className="initials-hint">◂ ▸ LETTER · JUMP CONFIRM</div>
    </div>
  );
}

function StartingScreen() {
  return (
    <div className="starting">
      <div className="starting-flash" />
      <div className="starting-text">LONG LIVE THE NEW FLESH</div>
      <div className="starting-sub">PLAYER 1</div>
    </div>
  );
}

function CoinDrop() {
  return (
    <div className="coin-drop" aria-hidden="true">
      <div className="coin">25¢</div>
    </div>
  );
}

function BootOverlay({ fading }: { fading: boolean }) {
  return (
    <div
      className={`boot-overlay ${fading ? "boot-fading" : ""}`}
      aria-hidden="true"
    >
      <div className="boot-title">
        <h1>
          <span>Playing</span>
          <span>To</span>
          <span>Die</span>
        </h1>
      </div>
    </div>
  );
}

const POSITION_COUNT = ROLL_POSITIONS;
const ROLL_DURATION_S = 56;

const styles = `
.stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: #000;
  min-height: 100vh;
  overflow: hidden;
}

.stage-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.stage-glow {
  position: absolute;
  inset: -10%;
  background:
    radial-gradient(ellipse at 50% 100%, rgba(30, 30, 36, 0.6) 0%, transparent 55%);
}
.stage-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.65) 100%);
}

/* ===== Cabinet ===== */

.cabinet {
  position: relative;
  z-index: 2;
  height: min(122vh, calc(102vw * 5 / 4), 1416px);
  aspect-ratio: 4 / 5;
  display: flex;
  flex-direction: column;
  filter: drop-shadow(0 40px 80px rgba(0, 0, 0, 0.8))
          drop-shadow(0 0 60px rgba(0, 0, 0, 0.4));
  opacity: 0;
  transform-origin: 50% 100%;
  transform: scale(0.88) translateY(14vh);
  transition:
    opacity 1.1s cubic-bezier(0.4, 0, 0.2, 1) 0.15s,
    transform 1.2s cubic-bezier(0.34, 1.05, 0.4, 1) 0.15s;
  container-type: inline-size;
}
.cabinet-visible {
  opacity: 1;
  transform: scale(1) translateY(0);
}

/* Marquee */
.cab-marquee {
  position: relative;
  height: 12%;
  margin: 0 6%;
  background: linear-gradient(180deg, #1a1a1c 0%, #08080a 100%);
  border: 3px solid #1e1e22;
  border-radius: 8px 8px 4px 4px;
  box-shadow:
    inset 0 0 12px rgba(0,0,0,0.85),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 6px 12px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cab-marquee-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(255, 40, 50, 0.18) 0%, transparent 70%);
  animation: marquee-flicker 4.7s ease-in-out infinite;
}
@keyframes marquee-flicker {
  0%, 100% { opacity: 1; }
  6% { opacity: 0.7; }
  7% { opacity: 1; }
  44% { opacity: 0.85; }
  45% { opacity: 1; }
  76% { opacity: 0.6; }
  77% { opacity: 1; }
}
.cab-marquee-text {
  position: relative;
  display: block;
  text-align: center;
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 900;
  font-size: clamp(16px, 8.4cqw, 72px);
  letter-spacing: 0.2em;
  color: transparent;
  filter: blur(0.4px);
  z-index: 2;
}
.cab-marquee-text > span {
  display: inline-block;
}
.mq-on {
  color: #3a060e;
  text-shadow:
    0 0 3px rgba(90, 10, 18, 0.55),
    0 0 8px rgba(70, 4, 12, 0.35);
}
.mq-off {
  color: transparent;
  -webkit-text-stroke: 1.5px rgba(50, 6, 12, 0.35);
}
.mq-dim {
  color: rgba(60, 4, 10, 0.4);
}
.mq-flicker {
  color: #3a060e;
  text-shadow:
    0 0 3px rgba(90, 10, 18, 0.55),
    0 0 8px rgba(70, 4, 12, 0.35);
  animation: mq-flicker 2.6s ease-in-out infinite;
}
@keyframes mq-flicker {
  0%, 28% { opacity: 1; }
  29%, 31% { opacity: 0.1; }
  32%, 70% { opacity: 1; }
  71%, 72% { opacity: 0.3; }
  73%, 100% { opacity: 1; }
}
.cab-marquee-scan {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 2px,
    rgba(0,0,0,0.4) 3px,
    transparent 4px
  );
  mix-blend-mode: multiply;
  opacity: 0.6;
  z-index: 3;
}

/* Body */
.cab-body {
  position: relative;
  flex: 1;
  background:
    linear-gradient(180deg, #25252a 0%, #181820 50%, #101014 100%);
  border: 4px solid #08080a;
  border-top: 0;
  border-radius: 6px 6px 0 0;
  box-shadow:
    inset 0 0 30px rgba(0,0,0,0.7),
    inset 0 4px 0 rgba(255,255,255,0.04);
  margin: 0 2%;
  display: flex;
  flex-direction: column;
  padding: 4% 6% 6%;
  gap: 4%;
}
.cab-side {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6%;
  background: linear-gradient(180deg, #16161a 0%, #08080c 100%);
}
.cab-side-l { left: 0; border-right: 2px solid #040408; }
.cab-side-r { right: 0; border-left: 2px solid #040408; }

/* Bezel + screen */
.cab-bezel {
  background: #040408;
  border: 4px solid #0d0d11;
  border-radius: 22% / 14%;
  padding: 6%;
  box-shadow:
    inset 0 0 8px rgba(0,0,0,0.95),
    inset 0 2px 0 rgba(255,255,255,0.05);
}
.cab-screen-frame {
  background: #000;
  border: 3px solid #1a1a1c;
  border-radius: 20% / 13%;
  padding: 2px;
  box-shadow:
    inset 0 0 18px rgba(0, 0, 0, 0.92),
    inset 0 0 6px rgba(0, 0, 0, 0.6);
}
.cab-screen {
  position: relative;
  aspect-ratio: 320 / 192;
  background: #000;
  overflow: hidden;
  border-radius: 18% / 12%;
  container-type: inline-size;
  box-shadow:
    inset 0 0 30px rgba(0, 0, 0, 0.85),
    inset 0 0 60px rgba(0, 0, 0, 0.7),
    inset 0 0 120px rgba(0, 0, 0, 0.55);
}
.cab-screen > :first-child {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: url(#crt-bubble) blur(1.7px);
}
.cab-screen-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 2.6px,
    rgba(0,0,0,0.16) 3px,
    transparent 3.4px
  );
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 4;
}
.cab-screen-glitch {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,1) 0%,
    rgba(255,255,255,1) 49%,
    rgba(140, 110, 130, 1) 49.6%,
    rgba(60, 45, 60, 1) 50%,
    rgba(140, 110, 130, 1) 50.4%,
    rgba(255,255,255,1) 51%,
    rgba(255,255,255,1) 100%
  );
  background-size: 100% 260%;
  background-position: 0 -180%;
  animation: screen-roll 30s linear infinite;
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 6;
}
@keyframes screen-roll {
  0%   { background-position: 0 -180%; }
  55%  { background-position: 0 160%; }
  100% { background-position: 0 160%; }
}
.cab-screen-glare {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 48% 32% at 32% 18%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.045) 40%, transparent 65%),
    linear-gradient(140deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 32%, transparent 55%);
  pointer-events: none;
  z-index: 5;
  border-radius: 18% / 12%;
  mix-blend-mode: screen;
}
.cab-screen-vignette {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 105% 95% at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0.72) 58%, rgba(0,0,0,0.92) 82%, rgba(0,0,0,1) 100%);
  pointer-events: none;
  z-index: 5;
}

/* Controls */
.cab-controls {
  background:
    linear-gradient(180deg, #1c1c20 0%, #0e0e12 100%);
  border: 3px solid #08080a;
  border-radius: 6px;
  padding: 5% 5% 6%;
  box-shadow:
    inset 0 0 12px rgba(0,0,0,0.6),
    inset 0 2px 0 rgba(255,255,255,0.05);
  flex: 0 0 auto;
}
.cab-controls-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3%;
  position: relative;
}

/* Volume slider on cabinet */
.cab-vol {
  width: 40%;
  margin: 0 2% 2% auto;
  padding: 0.4cqw 0 0.4cqw;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5cqw;
  font-family: ui-monospace, "Geist Mono", monospace;
  touch-action: none;
  user-select: none;
}
.cab-vol-track {
  position: relative;
  width: 100%;
  height: clamp(7px, 1.7cqw, 12px);
  background: linear-gradient(180deg, #020205 0%, #0c0c14 60%, #18181c 100%);
  border: 1px solid #000;
  border-radius: 2px;
  box-shadow:
    inset 0 1px 3px rgba(0,0,0,0.95),
    inset 0 -1px 0 rgba(255,255,255,0.04),
    0 1px 0 rgba(255,255,255,0.05);
  cursor: pointer;
}
.cab-vol-track:focus-visible {
  outline: 2px solid rgba(255, 80, 80, 0.5);
  outline-offset: 3px;
}
.cab-vol-fill {
  position: absolute;
  top: 1px;
  bottom: 1px;
  left: 0;
  background: linear-gradient(180deg, #6a6a72 0%, #38383e 60%, #1c1c22 100%);
  border-radius: 1px 0 0 1px;
  pointer-events: none;
}
.cab-vol-knob {
  position: absolute;
  top: 50%;
  width: clamp(16px, 4.4cqw, 30px);
  height: clamp(22px, 5.8cqw, 38px);
  background:
    linear-gradient(180deg,
      #e2e2e8 0%,
      #b4b4ba 18%,
      #74747c 52%,
      #3a3a40 88%,
      #2a2a30 100%);
  border: 1.5px solid #04040a;
  border-radius: 2.5px;
  box-shadow:
    inset 0 2px 0 rgba(255,255,255,0.85),
    inset 0 -2px 0 rgba(0,0,0,0.65),
    inset 1px 0 0 rgba(255,255,255,0.18),
    inset -1px 0 0 rgba(0,0,0,0.35),
    0 4px 8px rgba(0,0,0,0.7);
  transform: translate(-50%, -50%);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cab-vol-knob-grip {
  display: block;
  width: 52%;
  height: 56%;
  background-image:
    linear-gradient(
      to right,
      rgba(0,0,0,0.55) 0 1px,
      rgba(255,255,255,0.18) 1px 2px,
      transparent 2px 4px,
      rgba(0,0,0,0.55) 4px 5px,
      rgba(255,255,255,0.18) 5px 6px,
      transparent 6px 8px,
      rgba(0,0,0,0.55) 8px 9px,
      rgba(255,255,255,0.18) 9px 10px,
      transparent 10px 12px,
      rgba(0,0,0,0.55) 12px 13px,
      rgba(255,255,255,0.18) 13px 14px
    );
  background-size: 14px 100%;
  background-position: center;
  background-repeat: no-repeat;
}
.cab-vol-icons {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 0 2px;
}
.cab-vol-spk {
  color: #b8b8c0;
  filter: drop-shadow(0 0 3px rgba(180, 180, 200, 0.25));
  display: block;
}
.cab-vol-spk-sm {
  width: clamp(10px, 2.4cqw, 16px);
  height: clamp(10px, 2.4cqw, 16px);
}
.cab-vol-spk-lg {
  width: clamp(13px, 3cqw, 20px);
  height: clamp(12px, 2.7cqw, 18px);
}

/* Joystick */
.cab-joystick {
  position: relative;
  width: 26cqw;
  height: 26cqw;
  max-width: 160px;
  max-height: 160px;
}
.cab-joystick-base {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 88%;
  height: 32%;
  background: radial-gradient(ellipse at center top, #4a4a52 0%, #1a1a1e 70%);
  border: 2px solid #08080a;
  border-radius: 50%;
  box-shadow:
    inset 0 -4px 0 rgba(0,0,0,0.6),
    inset 0 2px 0 rgba(255,255,255,0.1),
    0 4px 8px rgba(0,0,0,0.4);
  z-index: 1;
}
.cab-joystick-arm {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18%;
  height: 72%;
  transform: rotate(calc(var(--tilt, 0) * 22deg));
  transform-origin: 50% 100%;
  transition: transform 0.12s cubic-bezier(0.4, 1.4, 0.55, 1.1);
  z-index: 2;
}
.cab-joystick-shaft {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 16%;
  height: 62%;
  background: linear-gradient(180deg, #c8c8d0 0%, #7e7e86 60%, #4a4a52 100%);
  border-left: 1px solid rgba(0,0,0,0.5);
  border-right: 1px solid rgba(0,0,0,0.5);
  box-shadow: 0 0 2px rgba(0,0,0,0.5);
}
.cab-joystick-ball {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 50%;
  aspect-ratio: 1 / 1;
  background: radial-gradient(circle at 35% 28%, #ff7878 0%, #d2202c 50%, #780614 100%);
  border: 1px solid rgba(0,0,0,0.55);
  border-radius: 50%;
  box-shadow:
    inset 0 -4px 0 rgba(0,0,0,0.45),
    inset 0 2px 0 rgba(255,255,255,0.35),
    0 3px 6px rgba(0,0,0,0.55);
}

/* JUMP button */
.cab-jump {
  position: relative;
  width: 26cqw;
  height: 26cqw;
  max-width: 160px;
  max-height: 160px;
}
.cab-jump-ring {
  position: absolute;
  inset: 4%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #2a2a32 0%, #0a0a10 80%);
  border: 2px solid #08080a;
  box-shadow:
    inset 0 -4px 0 rgba(0,0,0,0.6),
    inset 0 2px 0 rgba(255,255,255,0.08),
    0 3px 6px rgba(0,0,0,0.5);
}
.cab-jump-cap {
  position: absolute;
  inset: 14%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 26%, #ff7474 0%, #c4101e 60%, #6a0414 100%);
  border: 2px solid #08020a;
  box-shadow:
    inset 0 -5px 0 rgba(0,0,0,0.5),
    inset 0 3px 0 rgba(255,255,255,0.4),
    0 7px 0 rgba(80, 6, 14, 0.95),
    0 9px 14px rgba(0, 0, 0, 0.55);
  transition: transform 0.08s ease-out,
              box-shadow 0.08s ease-out,
              filter 0.08s ease-out;
}
.cab-jump[data-pressed="true"] .cab-jump-cap {
  transform: translateY(6px);
  box-shadow:
    inset 0 -1px 0 rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.2),
    0 1px 0 rgba(80, 6, 14, 0.95),
    0 2px 4px rgba(0, 0, 0, 0.55);
  filter: brightness(0.8);
}
.cab-jump-label {
  position: absolute;
  left: 50%;
  bottom: -2em;
  transform: translateX(-50%);
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 900;
  font-size: clamp(8px, 2.4cqw, 14px);
  letter-spacing: 0.36em;
  color: #ff5454;
  text-shadow: 0 0 6px rgba(255, 60, 80, 0.85), 0 1px 0 rgba(0,0,0,0.7);
  white-space: nowrap;
}

/* Coin slot */
.cab-coin {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
}
.cab-coin:disabled {
  cursor: default;
}
.cab-coin-plate {
  width: 16cqw;
  height: 12cqw;
  max-width: 68px;
  max-height: 52px;
  background: linear-gradient(180deg, #c8c8d0 0%, #6a6a72 60%, #38383e 100%);
  border: 2px solid #14131a;
  border-radius: 4px;
  position: relative;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.4),
    inset 0 -3px 0 rgba(0,0,0,0.4),
    0 2px 4px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cab-coin-slot {
  width: 60%;
  height: 6px;
  background: linear-gradient(180deg, #000 0%, #0a0a0a 60%, #050505 100%);
  box-shadow:
    inset 0 1px 0 rgba(0,0,0,0.95),
    inset 0 -1px 0 rgba(255,255,255,0.08);
  border-radius: 2px;
}
.cab-coin-label {
  font-family: ui-monospace, "Geist Mono", monospace;
  font-size: clamp(6px, 1.6cqw, 11px);
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #ff5454;
  text-shadow: 0 0 6px rgba(255, 50, 60, 0.85), 0 1px 0 rgba(0,0,0,0.7);
  white-space: nowrap;
}
.cab-coin-active .cab-coin-label {
  animation: coin-blink 0.85s steps(2, end) infinite;
}
.cab-coin-active:hover .cab-coin-plate {
  filter: brightness(1.18);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.55),
    inset 0 -3px 0 rgba(0,0,0,0.4),
    0 2px 6px rgba(255, 80, 80, 0.4),
    0 0 12px rgba(255, 80, 80, 0.4);
}
.cab-coin-active:hover .cab-coin-slot {
  box-shadow:
    inset 0 1px 0 rgba(0,0,0,0.95),
    inset 0 0 6px rgba(255, 200, 60, 0.5);
}
@keyframes coin-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0.25; }
}

/* ===== Attract screen ===== */

.attract {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 35%, #2a0008 0%, #0a0004 70%),
    #000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.attract-stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 20% 30%, rgba(255,200,200,0.7), transparent),
    radial-gradient(1px 1px at 70% 20%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1px 1px at 40% 70%, rgba(255,180,180,0.5), transparent),
    radial-gradient(1px 1px at 85% 50%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1px 1px at 12% 60%, rgba(255,210,210,0.4), transparent);
  animation: attract-twinkle 4.2s ease-in-out infinite;
}
@keyframes attract-twinkle {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 0.4; }
}
.attract-roll {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: ${(POSITION_COUNT + 1) * 100}%;
  animation: attract-roll ${ROLL_DURATION_S}s linear infinite;
  will-change: transform;
}
.attract-roll-frame {
  position: relative;
  height: ${100 / (POSITION_COUNT + 1)}%;
  display: flex;
  align-items: center;
  justify-content: center;
}
@keyframes attract-roll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-${(POSITION_COUNT / (POSITION_COUNT + 1)) * 100}%); }
}
.attract-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 900;
  font-size: clamp(7px, 6cqw, 36px);
  line-height: 0.95;
  letter-spacing: 0.06em;
  color: #350510;
  text-shadow:
    0 0 4px rgba(90, 6, 14, 0.6),
    0 0 12px rgba(60, 2, 10, 0.4);
  filter: blur(0.4px);
  transform: translateX(var(--tv-x, 0));
}
.attract-foot {
  position: absolute;
  bottom: 6%;
  left: 0;
  right: 0;
  text-align: center;
  font-family: ui-monospace, "Geist Mono", monospace;
  z-index: 3;
}
.attract-blink {
  font-size: clamp(8px, 3.4cqw, 22px);
  font-weight: 800;
  letter-spacing: 0.32em;
  color: #ffd0d0;
  text-shadow: 0 0 6px rgba(255, 60, 80, 0.95), 0 0 16px rgba(255, 30, 50, 0.6);
  animation: attract-blink 0.9s steps(2, end) infinite;
}
@keyframes attract-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.attract-score {
  margin-top: 1.5em;
  font-size: clamp(6px, 2.2cqw, 13px);
  letter-spacing: 0.36em;
  color: #ff8484;
  text-shadow: 0 0 4px rgba(255, 60, 80, 0.6);
}
.attract-credit {
  margin-top: 0.6em;
  font-size: clamp(5px, 1.6cqw, 10px);
  letter-spacing: 0.32em;
  color: #6a1a24;
}

/* ===== Starting screen (coin inserted) ===== */

.starting {
  position: absolute;
  inset: 0;
  background: #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.starting-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  animation: starting-flash 1.05s ease-out forwards;
}
@keyframes starting-flash {
  0%   { opacity: 1; }
  10%  { opacity: 0.85; }
  30%  { opacity: 0.25; }
  100% { opacity: 0; }
}
.starting-text {
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 900;
  font-size: clamp(8px, 4.6cqw, 32px);
  letter-spacing: 0.14em;
  color: #ff3040;
  text-shadow: 0 0 8px rgba(255, 40, 60, 1), 0 0 24px rgba(255, 20, 60, 0.7);
  animation: starting-pop 1.05s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  z-index: 2;
  text-align: center;
  padding: 0 6%;
  max-width: 92%;
}
.starting-sub {
  margin-top: 0.6em;
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 800;
  font-size: clamp(7px, 3cqw, 18px);
  letter-spacing: 0.42em;
  color: #ffe0e0;
  text-shadow: 0 0 6px rgba(255, 80, 80, 0.7);
  animation: starting-fade 1.05s ease-out 0.2s both;
  z-index: 2;
}
@keyframes starting-pop {
  0%   { opacity: 0; transform: scale(0.6); }
  40%  { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes starting-fade {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

/* ===== Coin drop ===== */

.coin-drop {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: visible;
}
.coin {
  width: 70%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 25%, #ffe896 0%, #d4a52a 50%, #7a5008 100%);
  border: 1px solid #4a3008;
  box-shadow:
    inset 0 -2px 0 rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 2px 4px rgba(0,0,0,0.5);
  font-family: ui-monospace, monospace;
  font-weight: 900;
  font-size: clamp(5px, 1.6cqw, 11px);
  color: #4a2a08;
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 1px 0 rgba(255,255,255,0.3);
  transform: translate(0, -340%);
  animation: coin-fall 0.85s cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards;
}
@keyframes coin-fall {
  0%   { transform: translate(0, -340%) rotate(0deg) scaleX(1); opacity: 1; }
  60%  { transform: translate(0, 0) rotate(540deg) scaleX(1); opacity: 1; }
  68%  { transform: translate(0, 6%) rotate(540deg) scaleX(0.6); }
  78%  { transform: translate(0, 0) rotate(540deg) scaleX(1); }
  100% { transform: translate(0, 0) rotate(540deg) scaleX(1); opacity: 0; }
}

/* ===== Boot overlay (intro fade) ===== */

.boot-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: boot-fade-in 0.8s ease-out both;
}
.boot-fading {
  animation: boot-fade-out 1.1s ease-out forwards;
}
@keyframes boot-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes boot-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
.boot-title {
  display: flex;
  align-items: center;
  justify-content: center;
}
.boot-title h1 {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  font-weight: 900;
  text-transform: uppercase;
  line-height: 0.95;
  letter-spacing: -0.02em;
  color: #1f0408;
  font-size: clamp(4rem, 14vw, 10rem);
  margin: 0;
  filter: blur(6px);
  text-shadow:
    0 0 10px rgba(40, 2, 6, 0.6),
    0 0 28px rgba(30, 2, 6, 0.45);
}

/* ===== Skull / GIVE UP button ===== */

.cab-skull {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  width: 16cqw;
  max-width: 64px;
}
.cab-skull:disabled {
  cursor: default;
  opacity: 0.42;
  filter: saturate(0.4);
}
.cab-skull-ring {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 102%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, #2a2a32 0%, #0a0a10 80%);
  border: 2px solid #08080a;
  box-shadow:
    inset 0 -3px 0 rgba(0,0,0,0.55),
    inset 0 2px 0 rgba(255,255,255,0.06),
    0 3px 6px rgba(0,0,0,0.5);
  z-index: 1;
}
.cab-skull-cap {
  position: relative;
  width: 78%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 26%, #ffffff 0%, #e4e4e8 55%, #9c9ca4 100%);
  border: 2px solid #08080a;
  box-shadow:
    inset 0 -5px 0 rgba(40,40,50,0.4),
    inset 0 3px 0 rgba(255,255,255,0.85),
    0 7px 0 rgba(60, 60, 70, 0.85),
    0 9px 14px rgba(0, 0, 0, 0.55);
  transition: transform 0.08s ease-out,
              box-shadow 0.08s ease-out,
              filter 0.08s ease-out;
  margin-top: 11%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16%;
  z-index: 2;
}
.cab-skull-cap svg {
  width: 100%;
  height: 100%;
  display: block;
}
.cab-skull-active:hover .cab-skull-cap {
  filter: brightness(1.06);
}
.cab-skull-active:active .cab-skull-cap {
  transform: translateY(6px);
  box-shadow:
    inset 0 -1px 0 rgba(40,40,50,0.4),
    inset 0 1px 0 rgba(255,255,255,0.6),
    0 1px 0 rgba(60, 60, 70, 0.85),
    0 2px 4px rgba(0, 0, 0, 0.55);
}
.cab-skull-label {
  position: relative;
  z-index: 3;
  font-family: ui-monospace, "Geist Mono", monospace;
  font-weight: 800;
  font-size: clamp(6px, 1.6cqw, 11px);
  letter-spacing: 0.28em;
  color: #d8d8e0;
  text-shadow: 0 0 6px rgba(220, 220, 230, 0.55), 0 1px 0 rgba(0,0,0,0.7);
  white-space: nowrap;
  margin-top: 2px;
}

/* ===== Afterlife (hell) screen ===== */

.afterlife {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: ui-monospace, "Geist Mono", monospace;
}
.afterlife-hell {
  background:
    radial-gradient(ellipse at 50% 100%, #b81a14 0%, #4a0408 45%, #1a0204 85%, #0a0102 100%);
}
.afterlife-fire {
  position: absolute;
  inset: 30% -10% -10% -10%;
  background:
    radial-gradient(ellipse 30% 65% at 18% 100%, rgba(255, 120, 30, 0.95) 0%, transparent 70%),
    radial-gradient(ellipse 26% 70% at 50% 100%, rgba(255, 180, 50, 0.9) 0%, transparent 70%),
    radial-gradient(ellipse 30% 65% at 82% 100%, rgba(255, 120, 30, 0.95) 0%, transparent 70%),
    radial-gradient(ellipse 20% 50% at 34% 100%, rgba(255, 220, 100, 0.7) 0%, transparent 75%),
    radial-gradient(ellipse 20% 50% at 66% 100%, rgba(255, 80, 20, 0.85) 0%, transparent 75%);
  filter: blur(6px);
  mix-blend-mode: screen;
  animation: hell-fire 1.5s ease-in-out infinite alternate;
}
.afterlife-fire-2 {
  animation-delay: -0.7s;
  animation-duration: 2.1s;
  opacity: 0.6;
  filter: blur(10px);
}
@keyframes hell-fire {
  0%   { transform: translateY(0) scaleY(1); opacity: 0.9; }
  100% { transform: translateY(-3%) scaleY(1.1); opacity: 1; }
}
.afterlife-embers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}
.afterlife-embers span {
  position: absolute;
  bottom: -4%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffb24a;
  box-shadow: 0 0 6px rgba(255, 200, 80, 0.9);
  animation: ember-rise 3.4s linear infinite;
}
.afterlife-embers span:nth-child(1) { left: 12%; animation-delay: 0s; animation-duration: 3.1s; }
.afterlife-embers span:nth-child(2) { left: 24%; animation-delay: 0.6s; animation-duration: 3.7s; }
.afterlife-embers span:nth-child(3) { left: 38%; animation-delay: 1.2s; animation-duration: 2.9s; }
.afterlife-embers span:nth-child(4) { left: 49%; animation-delay: 0.3s; animation-duration: 3.5s; }
.afterlife-embers span:nth-child(5) { left: 58%; animation-delay: 1.8s; animation-duration: 3.2s; }
.afterlife-embers span:nth-child(6) { left: 70%; animation-delay: 0.9s; animation-duration: 3.8s; }
.afterlife-embers span:nth-child(7) { left: 82%; animation-delay: 2.1s; animation-duration: 2.7s; }
.afterlife-embers span:nth-child(8) { left: 92%; animation-delay: 1.5s; animation-duration: 3.4s; }
@keyframes ember-rise {
  0%   { transform: translateY(0); opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 0.85; }
  100% { transform: translateY(-120vh); opacity: 0; }
}
.afterlife-title {
  font-weight: 900;
  font-size: clamp(30px, 22cqw, 160px);
  letter-spacing: 0.06em;
  color: #ffe6e6;
  text-shadow:
    0 0 6px rgba(255, 80, 80, 1),
    0 0 18px rgba(255, 30, 30, 0.95),
    0 0 36px rgba(255, 0, 30, 0.85),
    0 0 64px rgba(180, 0, 20, 0.7);
  animation:
    afterlife-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both,
    hell-pulse 1.4s ease-in-out 0.7s infinite;
  z-index: 2;
}
@keyframes hell-pulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.18); }
}
@keyframes afterlife-pop {
  0%   { opacity: 0; transform: scale(0.5); }
  60%  { opacity: 1; transform: scale(1.06); }
  100% { opacity: 1; transform: scale(1); }
}
.afterlife-sub {
  font-weight: 800;
  font-size: clamp(8px, 3cqw, 18px);
  letter-spacing: 0.4em;
  color: #ffc0b0;
  text-shadow: 0 0 6px rgba(255, 80, 60, 0.8);
  margin-top: 0.6em;
  z-index: 2;
  opacity: 0;
  animation: afterlife-fade 0.8s ease-out 0.7s forwards;
}
.afterlife-deaths {
  position: absolute;
  bottom: 7%;
  font-weight: 800;
  font-size: clamp(8px, 3cqw, 18px);
  letter-spacing: 0.36em;
  color: #ffd0d0;
  text-shadow: 0 0 8px rgba(255, 60, 80, 0.85);
  z-index: 2;
  opacity: 0;
  animation: afterlife-fade 0.8s ease-out 1.4s forwards;
}
@keyframes afterlife-fade {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ===== Initials entry screen ===== */

.initials {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 35%, #1a0008 0%, #0a0004 70%),
    #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: ui-monospace, "Geist Mono", monospace;
}
.initials-banner {
  font-weight: 900;
  font-size: clamp(10px, 4.6cqw, 28px);
  letter-spacing: 0.4em;
  color: #ffd060;
  text-shadow:
    0 0 8px rgba(255, 200, 80, 0.95),
    0 0 18px rgba(255, 160, 30, 0.6);
  animation: initials-blink 1.1s steps(2, end) infinite;
}
@keyframes initials-blink {
  0%, 69% { opacity: 1; }
  70%, 100% { opacity: 0.35; }
}
.initials-deaths {
  margin-top: 0.6em;
  font-weight: 800;
  font-size: clamp(8px, 2.6cqw, 16px);
  letter-spacing: 0.36em;
  color: #ff8484;
  text-shadow: 0 0 6px rgba(255, 60, 80, 0.7);
}
.initials-letters {
  display: flex;
  gap: 5cqw;
  margin-top: 6cqw;
}
.initials-letter {
  font-weight: 900;
  font-size: clamp(28px, 16cqw, 110px);
  line-height: 1;
  min-width: 0.7em;
  text-align: center;
  position: relative;
  transition: color 0.15s ease-out;
}
.initials-letter-pending {
  color: #4a0810;
  text-shadow: 0 0 4px rgba(120, 10, 20, 0.4);
}
.initials-letter-locked {
  color: #ff5454;
  text-shadow:
    0 0 6px rgba(255, 60, 80, 0.85),
    0 0 16px rgba(255, 30, 50, 0.55);
}
.initials-letter-active {
  color: #ffffff;
  text-shadow:
    0 0 6px rgba(255, 255, 255, 0.95),
    0 0 16px rgba(255, 80, 120, 0.7),
    0 0 28px rgba(255, 30, 60, 0.5);
  animation: initials-active 0.7s ease-in-out infinite alternate;
}
.initials-letter-active::before,
.initials-letter-active::after {
  content: "";
  position: absolute;
  left: 50%;
  width: 0;
  height: 0;
  border-left: 0.2em solid transparent;
  border-right: 0.2em solid transparent;
}
.initials-letter-active::before {
  top: -0.5em;
  border-bottom: 0.25em solid #ffd0d0;
  animation: initials-arrow-up 0.7s ease-in-out infinite alternate;
}
.initials-letter-active::after {
  bottom: -0.5em;
  border-top: 0.25em solid #ffd0d0;
  animation: initials-arrow-down 0.7s ease-in-out infinite alternate;
}
@keyframes initials-active {
  0%   { transform: translateY(0); }
  100% { transform: translateY(-3%); }
}
@keyframes initials-arrow-up {
  0%   { transform: translate(-50%, 0); opacity: 0.85; }
  100% { transform: translate(-50%, -25%); opacity: 1; }
}
@keyframes initials-arrow-down {
  0%   { transform: translate(-50%, 0); opacity: 0.85; }
  100% { transform: translate(-50%, 25%); opacity: 1; }
}
.initials-hint {
  position: absolute;
  bottom: 8%;
  font-weight: 800;
  font-size: clamp(7px, 2.2cqw, 13px);
  letter-spacing: 0.32em;
  color: #ffb0b0;
  text-shadow: 0 0 6px rgba(255, 60, 80, 0.55);
}

/* ===== Fate (judgement) screen ===== */

.fate {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 45%, #18040a 0%, #08020a 65%, #02000a 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: ui-monospace, "Geist Mono", monospace;
}
.fate-text {
  font-weight: 900;
  font-size: clamp(28px, 18cqw, 130px);
  letter-spacing: 0.08em;
  line-height: 1;
  z-index: 2;
}
.fate-heaven {
  color: #ffffff;
  text-shadow:
    0 0 10px rgba(255, 255, 255, 1),
    0 0 24px rgba(200, 220, 255, 0.85),
    0 0 48px rgba(160, 200, 255, 0.6);
}
.fate-hell {
  color: #ff1828;
  text-shadow:
    0 0 10px rgba(255, 30, 40, 1),
    0 0 24px rgba(255, 20, 30, 0.85),
    0 0 48px rgba(200, 0, 20, 0.65);
}
.fate-sub {
  margin-top: 1em;
  font-weight: 800;
  font-size: clamp(8px, 2.6cqw, 16px);
  letter-spacing: 0.5em;
  color: #c8a0a0;
  text-shadow: 0 0 4px rgba(140, 80, 80, 0.5);
  z-index: 2;
}

/* ===== High scores screen ===== */

.scores {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 40%, #0e0408 0%, #050004 70%),
    #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5% 4% 4%;
  overflow: hidden;
  font-family: ui-monospace, "Geist Mono", monospace;
  animation: scores-fade-in 0.5s ease-out both;
}
@keyframes scores-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.scores-title {
  font-weight: 900;
  font-size: clamp(8px, 3cqw, 18px);
  letter-spacing: 0.4em;
  color: #ffd060;
  text-shadow:
    0 0 6px rgba(255, 200, 80, 0.85),
    0 0 14px rgba(255, 160, 30, 0.55);
  margin-bottom: 4%;
}
.scores-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5%;
  width: 100%;
  align-items: start;
}
.scores-col {
  display: flex;
  flex-direction: column;
  gap: 0.3cqw;
}
.scores-col-right {
  opacity: 0;
  animation: scores-reveal 0.7s ease-out 2.4s forwards;
}
@keyframes scores-reveal {
  from { opacity: 0; transform: translateX(6px); }
  to   { opacity: 1; transform: translateX(0); }
}
.scores-row {
  display: grid;
  grid-template-columns: 1.7em 2.8em 1fr;
  gap: 0.5em;
  font-size: clamp(11px, 3.4cqw, 22px);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #ff8484;
  text-shadow: 0 0 4px rgba(255, 60, 80, 0.5);
  line-height: 1.05;
}
.scores-row .rank {
  color: #ff5050;
  opacity: 0.7;
}
.scores-row .ini {
  color: #ffd0d0;
  text-shadow: 0 0 5px rgba(255, 80, 100, 0.7);
}
.scores-row .num {
  text-align: right;
  color: #ffb0b0;
}
.scores-row-mine .rank,
.scores-row-mine .ini,
.scores-row-mine .num {
  color: #ffe080;
  text-shadow:
    0 0 5px rgba(255, 200, 80, 0.9),
    0 0 12px rgba(255, 160, 40, 0.55);
}

@media (prefers-reduced-motion: reduce) {
  .cabinet { transition: opacity 0.3s ease-out, transform 0.3s ease-out; }
  .boot-overlay, .attract-roll, .cab-marquee-glow, .attract-stars, .attract-blink, .cab-coin-active .cab-coin-label,
  .afterlife-fire, .afterlife-embers span, .afterlife-title, .afterlife-sub, .afterlife-deaths,
  .initials-banner, .initials-letter-active, .initials-letter-active::before, .initials-letter-active::after,
  .scores, .scores-col-right, .mq-flicker { animation: none !important; }
}
`;
