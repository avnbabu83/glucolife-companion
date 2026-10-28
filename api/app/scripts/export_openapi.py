"""Write the committed API contract the web (phase 2) and iOS (phase 3) clients are built against.

    cd api && python -m app.scripts.export_openapi openapi.json

tests/test_phase1a.py fails when the committed api/openapi.json differs from the generated document.
"""

from __future__ import annotations

from app.export_openapi import main

if __name__ == "__main__":
    main()
