"""
CLI table renderer.
Renders a {"columns": [...], "rows": [[...]]} result as a terminal table.
"""

import shutil


def render_table(data: dict, indent: int = 2):
    columns = data.get("columns", [])
    rows = data.get("rows", [])

    if not columns:
        return

    # Compute column widths
    widths = [len(str(c)) for c in columns]
    for row in rows:
        for i, cell in enumerate(row):
            if i < len(widths):
                widths[i] = max(widths[i], len(str(cell)))

    term_width = shutil.get_terminal_size().columns - indent * 2
    # Clamp widths so table fits
    total = sum(widths) + (len(widths) - 1) * 3
    if total > term_width and len(widths) > 1:
        excess = total - term_width
        widths[-1] = max(8, widths[-1] - excess)

    pad = " " * indent

    def fmt_row(cells):
        parts = []
        for i, cell in enumerate(cells):
            w = widths[i] if i < len(widths) else 8
            parts.append(str(cell)[:w].ljust(w))
        return pad + "   ".join(parts)

    divider = pad + "─" * min(sum(widths) + (len(widths) - 1) * 3, term_width)

    print(divider)
    print(fmt_row(columns))
    print(divider)
    for row in rows:
        print(fmt_row(row))
    if rows:
        print(divider)
    else:
        print(pad + "(no results)")
        print(divider)
