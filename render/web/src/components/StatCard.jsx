export default function StatCard({ label, value, cliMode }) {
  if (cliMode === "hidden") return null;

  if (cliMode === "data-only") {
    return <span>{`${label.toUpperCase()}: ${value}`}</span>;
  }

  return (
    <div className="rounded-none border-2 border-[#7a6245] shadow-[2px_2px_0_0_#7a6245] p-4 bg-[#1a1a1a] w-fit min-w-[120px]">
      <div className="text-3xl font-mono font-bold text-[#c9a96e]">{value}</div>
      <div className="text-xs font-mono text-[#7a6245] uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}
