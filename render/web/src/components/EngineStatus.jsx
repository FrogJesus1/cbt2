/**
 * EngineStatus
 * Sidebar panel showing loaded engines and their status.
 */

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export function EngineStatus({ engines = [], primaryId, activeEngineId, onSelectEngine }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Engines
          </p>
          <div className="space-y-1">
            {engines.map((engine) => (
              <EngineItem
                key={engine.id}
                engine={engine}
                isActive={engine.id === activeEngineId}
                onClick={() => onSelectEngine(engine.id)}
              />
            ))}
            {engines.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No engines loaded</p>
            )}
          </div>
        </div>

        <Separator />

        {engines.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Data Summary
            </p>
            {engines.map((engine) => (
              engine.id === activeEngineId && engine.summary && (
                <div key={engine.id} className="space-y-1">
                  {Object.entries(engine.summary).map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="font-mono font-medium">{String(value)}</span>
                    </div>
                  ))}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function EngineItem({ engine, isActive, onClick }) {
  const isReady = engine.ready !== false;
  const isPrimary = engine.primary;

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-accent hover:text-accent-foreground",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{engine.engine || engine.id}</span>
        <div className="flex items-center gap-1 shrink-0">
          {isPrimary && (
            <Badge variant={isActive ? "secondary" : "outline"} className="text-[10px] py-0 px-1.5">
              primary
            </Badge>
          )}
          <span
            className={[
              "w-2 h-2 rounded-full",
              isReady ? "bg-green-500" : "bg-amber-400",
            ].join(" ")}
          />
        </div>
      </div>
    </button>
  );
}
