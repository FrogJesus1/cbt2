/**
 * ResultView
 * Renders query results based on result_type from the engine.
 *
 * Supported types:
 *   "table"  → columns + rows grid
 *   "card"   → title + label/value fields
 *   "list"   → simple list of strings
 *   "text"   → plain text block
 *   "error"  → error message
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ResultView({ result }) {
  if (!result) return null;

  const { ok, result_type, data, command, meta } = result;

  if (result_type === "error" || !ok) {
    return <ErrorResult message={typeof data === "string" ? data : JSON.stringify(data)} command={command} />;
  }

  switch (result_type) {
    case "table":  return <TableResult data={data} meta={meta} command={command} />;
    case "card":   return <CardResult data={data} meta={meta} command={command} />;
    case "list":   return <ListResult data={data} command={command} />;
    case "text":   return <TextResult data={data} command={command} />;
    default:       return <RawResult data={data} command={command} />;
  }
}

// ─── Table ─────────────────────────────────────────────────────────────────────

function TableResult({ data, meta, command }) {
  const { columns = [], rows = [] } = data;
  return (
    <div className="space-y-2">
      <ResultMeta command={command} meta={meta} count={rows.length} />
      <ScrollArea className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2 align-top">
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground italic">
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────────

function CardResult({ data, meta, command }) {
  const { title, fields = [] } = data;
  return (
    <div className="space-y-2">
      <ResultMeta command={command} meta={meta} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {field.label}
              </span>
              <div className="text-sm">{renderCell(field.value)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── List ──────────────────────────────────────────────────────────────────────

function ListResult({ data, command }) {
  return (
    <div className="space-y-2">
      <ResultMeta command={command} count={data?.length} />
      <ul className="space-y-1">
        {(data ?? []).map((item, i) => (
          <li key={i} className="text-sm border-l-2 border-primary/30 pl-3 py-0.5">
            {String(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Text ──────────────────────────────────────────────────────────────────────

function TextResult({ data, command }) {
  return (
    <div className="space-y-2">
      <ResultMeta command={command} />
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{data}</p>
    </div>
  );
}

// ─── Error ─────────────────────────────────────────────────────────────────────

function ErrorResult({ message, command }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-medium mb-0.5">Command failed{command ? `: ${command}` : ""}</p>
      <p className="text-red-600/80">{message}</p>
    </div>
  );
}

// ─── Raw fallback ──────────────────────────────────────────────────────────────

function RawResult({ data, command }) {
  return (
    <div className="space-y-2">
      <ResultMeta command={command} />
      <pre className="rounded-md bg-muted p-4 text-xs overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function ResultMeta({ command, meta, count }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {command && (
        <Badge variant="secondary" className="font-mono text-xs">
          {command}
        </Badge>
      )}
      {typeof count === "number" && (
        <span className="text-xs text-muted-foreground">{count} result{count !== 1 ? "s" : ""}</span>
      )}
      {meta && Object.entries(meta).map(([k, v]) =>
        v !== undefined && v !== null && v !== "" && !Array.isArray(v) ? (
          <span key={k} className="text-xs text-muted-foreground">
            {k}: <span className="font-medium">{String(v)}</span>
          </span>
        ) : null
      )}
    </div>
  );
}

function renderCell(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {Object.entries(value).map(([k, v]) => (
          <span key={k} className="font-mono text-xs">
            <span className="text-muted-foreground">{k}: </span>
            <span className="font-medium">{String(v)}</span>
          </span>
        ))}
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-0.5">
        {value.map((item, i) => (
          <li key={i} className="text-xs text-muted-foreground">{String(item)}</li>
        ))}
      </ul>
    );
  }
  return String(value);
}
