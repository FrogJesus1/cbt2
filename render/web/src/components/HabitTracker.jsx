export default function HabitTracker({ total, completed, cliMode }) {
  if (cliMode === "cli") {
    const pips = Array.from({ length: total }, (_, i) =>
      i < completed ? "[X]" : "[ ]"
    ).join("");
    return <span className="font-mono text-[#c9a96e]">{pips}</span>;
  }

  return (
    <div className="rounded-none border-2 border-[#7a6245] shadow-[2px_2px_0_0_#7a6245] p-3 bg-[#1a1a1a] w-fit">
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-none border border-[#7a6245] ${
              i < completed ? "bg-[#c9a96e]" : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <div className="text-xs font-mono text-[#7a6245] mt-2">
        {completed}/{total}
      </div>
    </div>
  );
}
