"""Local developer manual; package.json owns the version."""
import json
from pathlib import Path

project = "Genro Builders JS"
author = "Softwell S.r.l."
copyright = "2026, Softwell S.r.l."
release = json.loads((Path(__file__).resolve().parents[1] / "package.json").read_text())["version"]
version = release
extensions = ["myst_parser"]
source_suffix = {".md": "markdown"}
root_doc = "index"
exclude_patterns = []
nitpicky = True
html_theme = "sphinx_rtd_theme"
html_title = f"Genro Builders JS {release}"
