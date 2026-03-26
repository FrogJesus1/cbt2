export default function ActionCard({ title, subtitle, onDetails, cliMode }) {
  if (cliMode === "cli") {
    return (
      <span className="font-mono text-[#c9a96e]">
        {title} — {subtitle}
      </span>
    );
  }

  return (
    <div className="rounded-none border-2 border-[#7a6245] shadow-[2px_2px_0_0_#7a6245] p-4 bg-[#1a1a1a] w-fit min-w-[200px]">
      <div className="font-mono font-bold text-[#c9a96e] text-sm">{title}</div>
      <div className="font-mono text-[#7a6245] text-xs mt-0.5">{subtitle}</div>
      <button
        onClick={onDetails}
        className="mt-3 rounded-none border border-[#7a6245] px-3 py-1 text-xs font-mono text-[#c9a96e] hover:bg-[#7a6245] hover:text-[#1a1a1a] transition-colors"
      >
        Details
      </button>
    </div>
  );
}
