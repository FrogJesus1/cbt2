"""
CLI card renderer.
Renders a {"title": ..., "fields": [{"label": ..., "value": ...}]} result.
"""


def render_card(data: dict, indent: int = 2):
    title = data.get("title", "")
    fields = data.get("fields", [])

    pad = " " * indent
    label_width = max((len(str(f.get("label", ""))) for f in fields), default=8) + 1

    print()
    print(f"{pad}{title}")
    print(f"{pad}{'─' * max(len(title), 40)}")
    print()

    for field in fields:
        label = str(field.get("label", ""))
        value = field.get("value")
        formatted = _format_value(value)

        if "\n" in formatted:
            print(f"{pad}{label:<{label_width}}")
            for line in formatted.splitlines():
                print(f"{pad}  {line}")
        else:
            print(f"{pad}{label:<{label_width}} {formatted}")

    print()


def _format_value(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, dict):
        return "  ".join(f"{k}: {v}" for k, v in value.items())
    if isinstance(value, list):
        return "\n".join(f"• {item}" for item in value)
    return str(value)
