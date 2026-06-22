import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise SystemExit(message)


manifest_path = ROOT / "manifest.webmanifest"
sw_path = ROOT / "service-worker.js"
index_path = ROOT / "index.html"

require(manifest_path.exists(), "manifest.webmanifest is missing")
require(sw_path.exists(), "service-worker.js is missing")
require(index_path.exists(), "index.html is missing")

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

for key in ["name", "short_name", "start_url", "scope", "display", "icons"]:
    require(key in manifest, f"manifest key missing: {key}")

require(manifest["display"] in {"standalone", "fullscreen"}, "display must be standalone or fullscreen")
require(manifest.get("orientation") == "landscape", "orientation should be landscape for Quest VR")
require(any(icon.get("sizes") == "512x512" for icon in manifest["icons"]), "512x512 icon is required")

for icon in manifest["icons"]:
    src = icon["src"].replace("./", "")
    path = ROOT / src
    require(path.exists(), f"icon missing: {src}")
    with Image.open(path) as image:
      size = f"{image.width}x{image.height}"
      require(size == icon["sizes"], f"icon size mismatch for {src}: expected {icon['sizes']}, got {size}")

index = index_path.read_text(encoding="utf-8")
require('rel="manifest"' in index, "index.html must link manifest")
require("serviceWorker" in (ROOT / "src" / "app.js").read_text(encoding="utf-8"), "app.js must register service worker")

print("PWA validation passed")
