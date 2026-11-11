"""DiabetEasy API (phase 1 backend)."""

import sys

if sys.version_info < (3, 11):  # pragma: no cover - depends on the interpreter
    sys.stderr.write(
        f"DiabetEasy API needs Python 3.11 or newer (3.12 is the pinned version), "
        f"but this is Python {sys.version.split()[0]}.\n"
    )
    raise SystemExit(1)
