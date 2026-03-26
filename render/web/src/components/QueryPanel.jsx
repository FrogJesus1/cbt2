/**
 * QueryPanel
 * Input area for running queries against the active engine.
 * Shows available commands from the engine schema.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export function QueryPanel({ schema, onQuery, loading }) {
  const [command, setCommand] = useState("");
  const [params, setParams] = useState({});
  const [selectedCommand, setSelectedCommand] = useState(null);

  const queries = schema?.queries ?? {};

  function handleSelectCommand(cmdKey) {
    setSelectedCommand(cmdKey);
    setCommand(cmdKey);
    setParams({});
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!command.trim()) return;
    onQuery(command.trim(), params);
  }

  const activeQuery = queries[selectedCommand] ?? null;
  const hasParams = activeQuery && Object.keys(activeQuery.params ?? {}).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Command picker */}
      {Object.keys(queries).length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Commands
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(queries).map(([key, def]) => (
              <button
                key={key}
                onClick={() => handleSelectCommand(key)}
                className={[
                  "px-2.5 py-1 rounded text-xs font-mono transition-colors border",
                  selectedCommand === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent",
                ].join(" ")}
                title={def.description}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {activeQuery && (
        <p className="text-sm text-muted-foreground">{activeQuery.description}</p>
      )}

      {/* Param inputs */}
      {hasParams && (
        <div className="grid gap-3">
          {Object.entries(activeQuery.params).map(([paramKey, paramDef]) => (
            <div key={paramKey}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {paramKey}
                {paramDef.required && <span className="text-red-500 ml-0.5">*</span>}
                <span className="ml-1 text-muted-foreground/60">— {paramDef.description}</span>
              </label>
              <input
                type="text"
                placeholder={String(paramDef.example ?? "")}
                value={params[paramKey] ?? ""}
                onChange={(e) => setParams((p) => ({ ...p, [paramKey]: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ))}
        </div>
      )}

      {/* Submit */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => {
            setCommand(e.target.value);
            setSelectedCommand(null);
          }}
          placeholder="Enter command..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={loading || !command.trim()}>
          {loading ? "Running…" : "Run"}
        </Button>
      </form>
    </div>
  );
}
