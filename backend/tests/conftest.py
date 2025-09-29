# Ensures the FastAPI app package is importable when running tests from repo root or backend dir.
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = BACKEND_ROOT / "app"

# Add backend root so `import app.main` works (app is a subpackage there)
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# (Optional) also add the app dir directly (not strictly required now)
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))
