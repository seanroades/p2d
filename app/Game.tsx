"use client";

import { useEffect, useRef, useState } from "react";

const VW = 320;
const VH = 192;
const TILE = 16;
const COLS = 20;
const ROWS = 12;

const LEVEL: string[] = [
  "....................", // 0
  "....................", // 1
  "............T.......", // 2  trophy decoration
  "...........####.....", // 3  trophy platform
  "....................", // 4
  ".........SSSS.......", // 5  saw track (visual only)
  "........########....", // 6  saw platform
  "....................", // 7
  "....####............", // 8  left mid platform
  "................##..", // 9  right mid step
  "P##.................", // 10 spawn ledge marker
  "#~~~~~~~~##^^^^^####", // 11 lava | floor | spikes | void edge
];

const COLORS = {
  bg: "#000",
  flicker: "#ffffff",
  brick: "#352326",
  brickEdge: "#1c1316",
  brickHi: "#4e3338",
  spike: "#b8b8b8",
  spikeHi: "#e8e8e8",
  spikeShade: "#5a5a5a",
  lava: "#c4341a",
  lavaHi: "#ffaa44",
  lavaShade: "#7a1a08",
  saw: "#cccccc",
  sawDark: "#5a5a5a",
  sawCenter: "#a02020",
  player: "#e8c0a0",
  playerEye: "#101010",
  playerShirt: "#a8181c",
  playerPants: "#1a1428",
  playerHair: "#3a1f10",
  blood: "#7a0a16",
  trophy: "#d4a52a",
  trophyHi: "#fff2b8",
};

type DeathKind = "" | "spike" | "lava" | "saw" | "void" | "suicide";

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: 1 | -1;
  walkTime: number;
  dying: boolean;
  deathTimer: number;
  deathKind: DeathKind;
  respawning: boolean;
  respawnTimer: number;
};

const PLAYER_W = 8;
const PLAYER_H = 12;
const GRAVITY = 720;
const MAX_FALL = 320;
const MOVE_SPEED = 78;
const JUMP_VEL = 240;
const DEATH_HOLD_MS = 850;
const RESPAWN_MS = 700;

const DEATH_CAPTIONS: Record<DeathKind, string> = {
  "": "",
  spike: "skewered.",
  lava: "boiled.",
  saw: "shredded.",
  void: "swallowed by the dark.",
  suicide: "by their own hand.",
};

function findSpawn() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (LEVEL[r][c] === "P") {
        return {
          x: c * TILE + (TILE - PLAYER_W) / 2,
          y: r * TILE + TILE - PLAYER_H,
        };
      }
    }
  }
  return { x: 8, y: 8 };
}

function tileChar(c: number, r: number) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return ".";
  return LEVEL[r][c] || ".";
}

// Only "#" is solid. "P" is a spawn marker, "T" is decorative.
function isSolid(c: number, r: number) {
  return tileChar(c, r) === "#";
}

function deadlyAt(px: number, py: number): DeathKind {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  const ch = tileChar(c, r);
  if (ch === "^") return "spike";
  if (ch === "~") return "lava";
  return "";
}

function sawCenter(t: number) {
  const cx = (9.5 + ((Math.sin(t * 1.6) + 1) / 2) * 3) * TILE;
  const cy = 5.5 * TILE;
  return { cx, cy, r: 8 };
}

// --- Background flicker setup ---
type Flicker = {
  x: number;
  y: number;
  w: number;
  h: number;
  life: number;
  max: number;
};

export default function Game({
  onDeath,
  volume = 0.55,
  endTrigger = 0,
}: {
  onDeath?: () => void;
  volume?: number;
  endTrigger?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [deathCount, setDeathCount] = useState(0);
  const [captionKey, setCaptionKey] = useState(0);
  const captionRef = useRef<string>("");
  const onDeathRef = useRef(onDeath);
  const volumeRef = useRef(volume);
  const dieRef = useRef<(kind: DeathKind) => void>(() => {});
  const lastEndTriggerRef = useRef(endTrigger);
  useEffect(() => {
    onDeathRef.current = onDeath;
  }, [onDeath]);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);
  useEffect(() => {
    if (endTrigger !== lastEndTriggerRef.current) {
      lastEndTriggerRef.current = endTrigger;
      if (endTrigger > 0) dieRef.current("suicide");
    }
  }, [endTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const spawn = findSpawn();
    const player: PlayerState = {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      walkTime: 0,
      dying: false,
      deathTimer: 0,
      deathKind: "",
      respawning: false,
      respawnTimer: 0,
    };
    const keys = {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
    };
    let sawT = 0;

    const deathAudio = new Audio("/death.mp3");
    deathAudio.preload = "auto";

    const jumpAudio = new Audio("/jump.mp3");
    jumpAudio.preload = "auto";

    // Background flickers
    let flickers: Flicker[] = [];
    let flickerSpawnT = 0.3 + Math.random() * 1.0;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          keys.left = true;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          keys.right = true;
          break;
        case "ArrowUp":
        case "w":
        case "W":
        case " ":
          if (!keys.jump) keys.jumpPressed = true;
          keys.jump = true;
          e.preventDefault();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          keys.left = false;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          keys.right = false;
          break;
        case "ArrowUp":
        case "w":
        case "W":
        case " ":
          keys.jump = false;
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const respawn = () => {
      const s = findSpawn();
      player.x = s.x;
      player.y = s.y;
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      player.facing = 1;
      player.walkTime = 0;
      player.dying = false;
      player.deathTimer = 0;
      player.deathKind = "";
      player.respawning = true;
      player.respawnTimer = RESPAWN_MS;
    };

    const die = (kind: DeathKind) => {
      if (player.dying || kind === "") return;
      player.dying = true;
      player.deathTimer = DEATH_HOLD_MS;
      player.deathKind = kind;
      player.vx = 0;
      if (kind !== "void" && kind !== "saw") player.vy = 0;
      captionRef.current = DEATH_CAPTIONS[kind];
      if (kind !== "suicide") {
        setDeathCount((prev) => prev + 1);
        onDeathRef.current?.();
      }
      setCaptionKey((k) => k + 1);
      try {
        deathAudio.volume = volumeRef.current * 0.05;
        deathAudio.currentTime = 0;
        void deathAudio.play().catch(() => {});
      } catch {}
    };
    dieRef.current = die;

    const collideMove = (dt: number) => {
      // Horizontal
      player.x += player.vx * dt;
      {
        const top = player.y;
        const bottom = player.y + PLAYER_H - 1;
        const r0 = Math.floor(top / TILE);
        const r1 = Math.floor(bottom / TILE);
        if (player.vx > 0) {
          const c = Math.floor((player.x + PLAYER_W - 1) / TILE);
          for (let r = r0; r <= r1; r++) {
            if (isSolid(c, r)) {
              player.x = c * TILE - PLAYER_W;
              player.vx = 0;
              break;
            }
          }
        } else if (player.vx < 0) {
          const c = Math.floor(player.x / TILE);
          for (let r = r0; r <= r1; r++) {
            if (isSolid(c, r)) {
              player.x = (c + 1) * TILE;
              player.vx = 0;
              break;
            }
          }
        }
      }
      // Vertical
      player.y += player.vy * dt;
      player.onGround = false;
      {
        const left = player.x;
        const right = player.x + PLAYER_W - 1;
        const c0 = Math.floor(left / TILE);
        const c1 = Math.floor(right / TILE);
        if (player.vy >= 0) {
          // Use feet position (no -1) so resting flush on a tile counts as ground.
          const r = Math.floor((player.y + PLAYER_H) / TILE);
          for (let c = c0; c <= c1; c++) {
            if (isSolid(c, r)) {
              player.y = r * TILE - PLAYER_H;
              player.vy = 0;
              player.onGround = true;
              break;
            }
          }
        } else if (player.vy < 0) {
          const r = Math.floor(player.y / TILE);
          for (let c = c0; c <= c1; c++) {
            if (isSolid(c, r)) {
              player.y = (r + 1) * TILE;
              player.vy = 0;
              break;
            }
          }
        }
      }
    };

    const update = (dt: number) => {
      sawT += dt;

      // Flicker spawning + decay
      flickerSpawnT -= dt;
      if (flickerSpawnT <= 0) {
        const burst = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < burst; i++) {
          const isLine = Math.random() < 0.3;
          const life = 0.08 + Math.random() * 0.22;
          flickers.push({
            x: Math.floor(Math.random() * VW),
            y: Math.floor(Math.random() * VH),
            w: isLine
              ? 24 + Math.floor(Math.random() * 70)
              : 3 + Math.floor(Math.random() * 6),
            h: isLine
              ? 1 + Math.floor(Math.random() * 2)
              : 3 + Math.floor(Math.random() * 4),
            life,
            max: life,
          });
        }
        flickerSpawnT = 0.06 + Math.random() * 0.45;
      }
      if (flickers.length > 0) {
        flickers = flickers.filter((f) => {
          f.life -= dt;
          return f.life > 0;
        });
      }

      if (player.dying) {
        player.deathTimer -= dt * 1000;
        if (player.deathKind === "void" || player.deathKind === "saw") {
          player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);
          player.y += player.vy * dt;
        }
        if (player.deathTimer <= 0) {
          if (player.deathKind === "suicide") {
            // Hold slumped — App will unmount Game shortly.
            player.deathTimer = 0;
          } else {
            respawn();
          }
        }
        return;
      }

      if (player.respawning) {
        player.respawnTimer -= dt * 1000;
        if (player.respawnTimer <= 0) {
          player.respawning = false;
          player.respawnTimer = 0;
        }
        keys.jumpPressed = false;
        return;
      }

      const ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      player.vx = ax * MOVE_SPEED;
      if (ax !== 0) player.facing = ax > 0 ? 1 : -1;

      if (keys.jumpPressed && player.onGround) {
        player.vy = -JUMP_VEL;
        player.onGround = false;
        try {
          jumpAudio.volume = volumeRef.current * 0.02;
          jumpAudio.currentTime = 0;
          void jumpAudio.play().catch(() => {});
        } catch {}
      }
      keys.jumpPressed = false;
      if (!keys.jump && player.vy < -90) player.vy = -90;

      player.vy = Math.min(MAX_FALL, player.vy + GRAVITY * dt);

      collideMove(dt);

      if (player.x < 0) player.x = 0;

      if (Math.abs(player.vx) > 1 && player.onGround) player.walkTime += dt;

      // Deadly tile sampling
      const samples: [number, number][] = [
        [player.x + 1, player.y + 1],
        [player.x + PLAYER_W - 2, player.y + 1],
        [player.x + 1, player.y + PLAYER_H - 1],
        [player.x + PLAYER_W - 2, player.y + PLAYER_H - 1],
        [player.x + PLAYER_W / 2, player.y + PLAYER_H / 2],
      ];
      for (const [sx, sy] of samples) {
        const kind = deadlyAt(sx, sy);
        if (kind) {
          die(kind);
          return;
        }
      }

      // Saw collision
      const saw = sawCenter(sawT);
      const px = player.x + PLAYER_W / 2;
      const py = player.y + PLAYER_H / 2;
      const dx = px - saw.cx;
      const dy = py - saw.cy;
      if (dx * dx + dy * dy < (saw.r + 1) * (saw.r + 1)) {
        die("saw");
        return;
      }

      // Void
      if (player.y > VH + 20) die("void");
    };

    // ---- Rendering ----

    const drawBg = () => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, VW, VH);
    };

    const drawFlickers = () => {
      for (const f of flickers) {
        const k = f.life / f.max;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + k * 0.4})`;
        ctx.fillRect(f.x, f.y, f.w, f.h);
      }
    };

    const drawBrick = (x: number, y: number, c: number, r: number) => {
      ctx.fillStyle = COLORS.brick;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.brickHi;
      if (!isSolid(c, r - 1)) ctx.fillRect(x, y, TILE, 2);
      ctx.fillStyle = COLORS.brickEdge;
      if (!isSolid(c, r + 1)) ctx.fillRect(x, y + TILE - 2, TILE, 2);
      ctx.fillStyle = COLORS.brickEdge;
      const offset = r % 2 === 0 ? 7 : 11;
      ctx.fillRect(x + offset, y + 2, 1, TILE - 4);
      ctx.fillRect(x, y + 7, TILE, 1);
    };

    const drawSpike = (x: number, y: number) => {
      ctx.fillStyle = COLORS.spikeShade;
      ctx.fillRect(x, y + TILE - 2, TILE, 2);
      for (let i = 0; i < 4; i++) {
        const sx = x + i * 4;
        ctx.fillStyle = COLORS.spike;
        ctx.fillRect(sx + 1, y + 10, 3, 6);
        ctx.fillRect(sx + 1, y + 7, 3, 3);
        ctx.fillRect(sx + 2, y + 4, 1, 3);
        ctx.fillStyle = COLORS.spikeHi;
        ctx.fillRect(sx + 1, y + 10, 1, 5);
        ctx.fillRect(sx + 2, y + 5, 1, 2);
      }
    };

    const drawLava = (x: number, y: number, t: number) => {
      ctx.fillStyle = COLORS.lavaShade;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = COLORS.lava;
      const bob = Math.floor(((Math.sin(t * 4 + x * 0.3) + 1) / 2) * 2);
      ctx.fillRect(x, y + 2 + bob, TILE, TILE - 2 - bob);
      ctx.fillStyle = COLORS.lavaHi;
      const phase = Math.floor(t * 3 + x * 0.1) % 4;
      ctx.fillRect(x + ((phase * 4) % TILE), y + 4, 3, 1);
      ctx.fillRect(x + (((phase + 2) * 3) % TILE), y + 8, 2, 1);
    };

    const drawTrophy = (x: number, y: number) => {
      ctx.fillStyle = COLORS.trophy;
      ctx.fillRect(x + 4, y + 4, 8, 2);
      ctx.fillRect(x + 5, y + 6, 6, 3);
      ctx.fillRect(x + 7, y + 9, 2, 3);
      ctx.fillRect(x + 4, y + 12, 8, 1);
      ctx.fillStyle = COLORS.trophyHi;
      ctx.fillRect(x + 5, y + 5, 2, 1);
      ctx.fillRect(x + 5, y + 7, 1, 2);
    };

    const drawTiles = (t: number) => {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ch = LEVEL[r][c];
          const x = c * TILE;
          const y = r * TILE;
          if (ch === "#") drawBrick(x, y, c, r);
          else if (ch === "^") drawSpike(x, y);
          else if (ch === "~") drawLava(x, y, t);
          else if (ch === "T") drawTrophy(x, y);
        }
      }
    };

    const drawSaw = (t: number) => {
      const { cx, cy, r } = sawCenter(t);
      const rot = t * 22;
      ctx.fillStyle = COLORS.sawDark;
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI * 2) / 8;
        const tx = cx + Math.cos(a) * (r + 2);
        const ty = cy + Math.sin(a) * (r + 2);
        ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
      }
      ctx.fillStyle = COLORS.saw;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.sawDark;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.sawCenter;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.saw;
      ctx.fillRect(
        Math.round(cx + Math.cos(rot) * 3) - 1,
        Math.round(cy + Math.sin(rot) * 3) - 1,
        2,
        2,
      );
    };

    const drawPlayer = () => {
      const respawning = player.respawning;
      const k = respawning
        ? Math.max(0, player.respawnTimer / RESPAWN_MS)
        : 0;

      if (respawning && k > 0.45 && Math.random() < 0.22) return;

      let offX = 0;
      let offY = 0;
      if (respawning && Math.random() < 0.35 + k * 0.4) {
        offX = Math.floor((Math.random() - 0.5) * 8 * k);
        offY = Math.floor((Math.random() - 0.5) * 4 * k);
      }

      const x = Math.round(player.x) + offX;
      const y = Math.round(player.y) + offY;
      const flip = player.facing === -1;
      ctx.save();
      if (respawning) {
        ctx.globalAlpha = 1 - k;
      }
      if (flip) {
        ctx.translate(x + PLAYER_W, y);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(x, y);
      }

      const dying = player.dying;
      const slumped = dying && player.deathKind !== "void";

      if (
        slumped &&
        (player.deathKind === "spike" || player.deathKind === "suicide")
      ) {
        ctx.fillStyle = COLORS.blood;
        ctx.fillRect(-2, PLAYER_H - 1, PLAYER_W + 4, 1);
        ctx.fillRect(-1, PLAYER_H - 2, PLAYER_W + 2, 1);
      } else if (slumped && player.deathKind === "lava") {
        ctx.fillStyle = "rgba(255,180,120,0.7)";
        ctx.fillRect(2, -2, 2, 2);
        ctx.fillRect(5, -4, 1, 1);
      }

      ctx.fillStyle = COLORS.playerHair;
      ctx.fillRect(1, 0, 6, 2);
      ctx.fillRect(0, 1, 1, 1);
      ctx.fillRect(7, 1, 1, 1);

      ctx.fillStyle = COLORS.player;
      ctx.fillRect(1, 2, 6, 4);

      ctx.fillStyle = COLORS.playerEye;
      if (dying) {
        ctx.fillRect(2, 3, 1, 1);
        ctx.fillRect(3, 4, 1, 1);
        ctx.fillRect(5, 3, 1, 1);
        ctx.fillRect(4, 4, 1, 1);
      } else {
        ctx.fillRect(2, 3, 1, 1);
        ctx.fillRect(5, 3, 1, 1);
      }

      ctx.fillStyle = COLORS.playerShirt;
      ctx.fillRect(1, 6, 6, 3);
      ctx.fillStyle = COLORS.player;
      ctx.fillRect(0, 6, 1, 3);
      ctx.fillRect(7, 6, 1, 3);

      ctx.fillStyle = COLORS.playerPants;
      const walking = Math.abs(player.vx) > 1 && player.onGround && !dying;
      const frame = walking ? Math.floor(player.walkTime * 8) % 2 : 0;
      ctx.fillRect(1, 9, 6, 1);
      if (dying) {
        ctx.fillRect(0, 10, 8, 2);
      } else if (frame === 0) {
        ctx.fillRect(1, 10, 2, 2);
        ctx.fillRect(5, 10, 2, 2);
      } else {
        ctx.fillRect(2, 10, 2, 2);
        ctx.fillRect(4, 10, 2, 2);
      }

      ctx.restore();
    };

    const render = () => {
      drawBg();
      drawFlickers();
      drawTiles(sawT);
      drawSaw(sawT);
      drawPlayer();
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      render();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      deathAudio.pause();
      deathAudio.src = "";
      jumpAudio.pause();
      jumpAudio.src = "";
    };
  }, []);

  return (
    <div className="game-wrap">
      <style>{`
        .game-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          overflow: hidden;
        }
        .game-canvas {
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          width: 100%;
          height: 100%;
          display: block;
          background: #0c0a14;
        }
        .game-hud {
          position: absolute;
          top: 6%;
          left: 0;
          right: 0;
          text-align: center;
          font-family: ui-monospace, "Geist Mono", monospace;
          color: #ff5454;
          text-shadow:
            0 0 4px rgba(255, 60, 60, 0.95),
            0 0 10px rgba(255, 20, 30, 0.55);
          pointer-events: none;
          user-select: none;
        }
        .game-hud .count {
          color: #ffd0d0;
          font-size: clamp(11px, 3.4cqw, 22px);
          font-weight: 800;
          letter-spacing: 0.42em;
        }
        .game-caption {
          position: absolute;
          bottom: 16%;
          left: 0;
          right: 0;
          text-align: center;
          font-family: ui-monospace, "Geist Mono", monospace;
          font-size: clamp(11px, 3.4cqw, 22px);
          font-weight: 800;
          letter-spacing: 0.42em;
          color: #ff5a5a;
          text-shadow:
            0 0 6px rgba(255, 60, 60, 0.9),
            0 0 16px rgba(220, 20, 40, 0.55);
          pointer-events: none;
          user-select: none;
          animation: caption-pulse 1.4s ease-out forwards;
        }
        @keyframes caption-pulse {
          0%   { opacity: 0; transform: translateY(6px); }
          15%  { opacity: 1; transform: translateY(0); }
          70%  { opacity: 0.85; }
          100% { opacity: 0; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        className="game-canvas"
        width={VW}
        height={VH}
        aria-label="Playing To Die — pixel platformer"
      />
      <div className="game-hud" aria-hidden="true">
        <div className="count">
          DEATHS · {String(deathCount).padStart(4, "0")}
        </div>
      </div>
      {captionKey > 0 && (
        <div key={captionKey} className="game-caption" aria-live="polite">
          {captionRef.current}
        </div>
      )}
    </div>
  );
}
