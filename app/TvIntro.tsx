"use client";

import { useEffect, useState, type CSSProperties } from "react";

const POSITION_COUNT = 4;
const ROLL_DURATION_S = 56;

const styles = `
.tv-frame {
  position: relative;
  overflow: hidden;
  background: #000;
}

.tv-jitter {
  position: absolute;
  inset: 0;
  animation: tv-jitter 7s steps(1, end) infinite;
  will-change: transform, filter;
}

.tv-roll {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: ${(POSITION_COUNT + 1) * 100}vh;
  animation: tv-roll ${ROLL_DURATION_S}s linear infinite;
  will-change: transform;
}

.tv-roll-frame {
  position: relative;
  height: 100vh;
  display: flex;
}

@keyframes tv-roll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-${POSITION_COUNT * 100}vh); }
}

@keyframes tv-jitter {
  0%, 5%, 11%, 16%, 22%, 28%, 33%, 39%, 45%, 51%, 57%, 63%, 69%, 75%, 81%, 87%, 93% {
    transform: translateX(0);
    filter: none;
  }
  6% { transform: translateX(-9px); filter: drop-shadow(3px 0 0 rgba(255, 30, 60, 0.55)) drop-shadow(-3px 0 0 rgba(0, 200, 255, 0.55)); }
  7%, 8% { transform: translateX(7px); filter: brightness(1.25) contrast(1.1); }
  9%, 10% { transform: translateX(-4px); }
  17% { transform: translateX(-14px) skewX(-1.5deg); filter: hue-rotate(20deg); }
  18%, 19% { transform: translateX(11px) skewX(0.8deg); filter: drop-shadow(-3px 0 0 rgba(255, 80, 80, 0.6)) drop-shadow(3px 0 0 rgba(80, 200, 255, 0.6)); }
  20%, 21% { transform: translateX(-5px); }
  29% { transform: translateX(8px); filter: brightness(1.35); }
  30%, 31%, 32% { transform: translateX(-10px) skewX(-0.5deg); filter: drop-shadow(2px 0 0 rgba(255, 0, 0, 0.55)) drop-shadow(-2px 0 0 rgba(0, 255, 255, 0.55)); }
  40% { transform: translateX(-7px); filter: hue-rotate(-15deg); }
  41%, 42% { transform: translateX(5px); }
  43%, 44% { transform: translateX(-3px); }
  52% { transform: translateX(16px) skewX(1.2deg); filter: brightness(1.4) contrast(1.4) hue-rotate(-25deg); }
  53%, 54% { transform: translateX(-13px) skewX(-1.4deg); filter: drop-shadow(4px 0 0 rgba(255, 40, 80, 0.7)) drop-shadow(-4px 0 0 rgba(40, 200, 255, 0.7)); }
  55%, 56% { transform: translateX(6px); filter: contrast(1.2); }
  64% { transform: translateX(-6px); }
  65%, 66% { transform: translateX(4px); filter: brightness(1.2); }
  67%, 68% { transform: translateX(-9px); filter: hue-rotate(10deg); }
  76% { transform: translateX(11px) skewX(0.6deg); filter: drop-shadow(-2px 0 0 rgba(255, 100, 100, 0.5)) drop-shadow(2px 0 0 rgba(100, 200, 255, 0.5)); }
  77%, 78% { transform: translateX(-7px); }
  79%, 80% { transform: translateX(3px); filter: contrast(1.3); }
  88% { transform: translateX(-12px) skewX(-1deg); filter: hue-rotate(-30deg) brightness(1.4); }
  89%, 90% { transform: translateX(9px); filter: drop-shadow(3px 0 0 rgba(255, 30, 30, 0.6)) drop-shadow(-3px 0 0 rgba(30, 200, 255, 0.6)); }
  91%, 92% { transform: translateX(-4px); }
}

.tv-on {
  animation: tv-page-on 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transform-origin: center center;
}
@keyframes tv-page-on {
  0%, 10% { transform: scaleY(0.001) scaleX(1.3); filter: brightness(0); }
  16% { transform: scaleY(0.004) scaleX(1.2); filter: brightness(8) contrast(2); }
  22% { transform: scaleY(1.1) scaleX(1); filter: brightness(3); }
  28% { transform: translate(-5px, 3px); filter: brightness(1.7) contrast(1.4); }
  34% { transform: translate(6px, -3px); filter: brightness(1.4) hue-rotate(8deg); }
  40% { transform: translate(-3px, 4px); filter: brightness(1.2); }
  46% { transform: translate(4px, -2px); filter: brightness(1.1) hue-rotate(-6deg); }
  54% { transform: translate(-2px, 1px); filter: brightness(1.05); }
  62% { transform: translate(1px, 0); }
  100% { transform: none; filter: none; }
}

.tv-overlay {
  position: fixed; inset: 0; pointer-events: none; z-index: 9999; overflow: hidden;
}
.tv-overlay > div { position: absolute; inset: 0; }
.tv-black { background: #000; animation: tv-black 1.6s ease-out both; }
@keyframes tv-black {
  0%, 10% { opacity: 1; }
  18%, 100% { opacity: 0; }
}
.tv-flash {
  background: #fff;
  transform-origin: center center;
  animation: tv-flash 1.6s cubic-bezier(0.4, 0, 0.2, 1) both;
}
@keyframes tv-flash {
  0% { transform: scaleY(0); opacity: 0; }
  10% { transform: scaleY(0.003); opacity: 1; }
  16% { transform: scaleY(0.006); opacity: 1; }
  20% { transform: scaleY(0.5); opacity: 1; }
  26% { transform: scaleY(1); opacity: 0.95; }
  36% { transform: scaleY(1); opacity: 0.35; }
  55% { transform: scaleY(1); opacity: 0.05; }
  100% { transform: scaleY(1); opacity: 0; }
}
.tv-static {
  inset: -10%;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' seed='5'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 220px 220px;
  mix-blend-mode: screen;
  opacity: 0;
  animation: tv-static 1.6s steps(10) both;
}
@keyframes tv-static {
  0%, 20% { opacity: 0; transform: translate(0, 0); }
  24% { opacity: 0.85; transform: translate(2%, -3%); }
  32% { opacity: 0.7; transform: translate(-3%, 2%); }
  42% { opacity: 0.45; transform: translate(1%, -2%); }
  58% { opacity: 0.2; transform: translate(-1%, 1%); }
  100% { opacity: 0; transform: translate(0, 0); }
}
.tv-scanlines {
  background: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent 2px,
    rgba(0, 0, 0, 0.4) 3px,
    transparent 4px
  );
  opacity: 0;
  animation: tv-scanlines 1.6s ease-out both;
  mix-blend-mode: multiply;
}
@keyframes tv-scanlines {
  0%, 20% { opacity: 0; }
  28% { opacity: 0.6; }
  55% { opacity: 0.25; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .tv-on, .tv-roll, .tv-jitter { animation: none !important; }
  .tv-overlay { display: none !important; }
}
`;

function randomOffsetVw() {
  return Math.round(((Math.random() - 0.5) * 44) * 10) / 10;
}

export default function TvIntro({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(true);
  const [positions, setPositions] = useState<number[]>(() =>
    Array(POSITION_COUNT).fill(0),
  );

  useEffect(() => {
    setPositions(
      Array.from({ length: POSITION_COUNT }, () => randomOffsetVw()),
    );

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setActive(false);
      return;
    }
    const t = setTimeout(() => setActive(false), 1700);
    return () => clearTimeout(t);
  }, []);

  const frames = [...positions, positions[0]];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className={`tv-frame flex flex-1 flex-col ${active ? "tv-on" : ""}`}>
        <div className="tv-jitter">
          <div className="tv-roll">
            {frames.map((x, i) => (
              <div
                key={i}
                className="tv-roll-frame"
                style={{ "--tv-x": `${x}vw` } as CSSProperties}
                aria-hidden={i > 0 ? true : undefined}
              >
                {children}
              </div>
            ))}
          </div>
        </div>
      </div>
      {active && (
        <div className="tv-overlay" aria-hidden="true">
          <div className="tv-black" />
          <div className="tv-flash" />
          <div className="tv-static" />
          <div className="tv-scanlines" />
        </div>
      )}
    </>
  );
}
