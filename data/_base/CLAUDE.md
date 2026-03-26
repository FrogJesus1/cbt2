# data/_base — Engine Contract

## Purpose

Defines `EngineBase`, the abstract base class every engine must implement.
This is the only shared code between engines and the rendering layer.

## Files

| File | Purpose |
|---|---|
| `engine_base.py` | Abstract base class with five required methods |
| `__init__.py` | Re-exports `EngineBase` |

## The Five Methods

| Method | Returns | Purpose |
|---|---|---|
| `name()` | `str` | Human-readable engine name |
| `description()` | `str` | One-line summary |
| `schema()` | `dict` | Available query types and their params |
| `status()` | `dict` | Load state and data stats |
| `query(command, params)` | `dict` | Execute a query, return structured result |

## Return Shapes

### `query()` result
```python
{
    "ok": bool,
    "command": str,
    "result_type": "table" | "card" | "list" | "text" | "error",
    "data": ...,   # shape depends on result_type — see engine_base.py docstring
    "meta": dict
}
```

## Rules

- Never add methods to `EngineBase` unless ALL engines implement them
- Never import from `render/` inside any engine
- Never import from `data/` inside any renderer
- The renderer only ever calls these five methods — nothing else
