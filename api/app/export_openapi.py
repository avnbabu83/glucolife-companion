"""Write the OpenAPI document the web and iOS clients are built against.

    python -m app.export_openapi [openapi.json]
"""

from __future__ import annotations

import json
import sys

from app.main import app


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else "openapi.json"
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(app.openapi(), fh, indent=2)
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
