export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-black">
      <h1
        className="flex flex-col items-center text-center font-sans text-7xl font-bold uppercase leading-[0.95] tracking-tight text-[#3a0808] sm:text-8xl md:text-9xl"
        style={{
          filter: "blur(6px)",
          transform: "translateX(var(--tv-x, 0))",
        }}
      >
        <span>Playing</span>
        <span>To</span>
        <span>Die</span>
      </h1>
    </div>
  );
}
