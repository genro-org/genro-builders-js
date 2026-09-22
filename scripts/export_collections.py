"""Export native dialect collections with the owning Python grammar exporter."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from genro_builders.builder import BuilderBase
from genro_builders.contrib.html import HtmlBuilder
from genro_builders.contrib.svg import SvgBuilder


# Python compiles inherited declarations when a concrete subclass is created.
class BaseGrammar(BuilderBase):
    _name = "base"


def main() -> None:
    destination = Path(__file__).resolve().parents[1] / "src/collections"
    with TemporaryDirectory() as temporary:
        for name, builder in (("base", BaseGrammar), ("html5", HtmlBuilder), ("svg", SvgBuilder)):
            exported = Path(temporary) / f"{name}.json"
            builder.to_grammar(exported)
            document = json.loads(exported.read_text())
            if document.get("document_format") != {
                "name": "builder_grammar", "version": "1.1",
            }:
                raise RuntimeError(f"{name} export requires builder_grammar 1.1")
            (destination / exported.name).write_bytes(exported.read_bytes())


if __name__ == "__main__":
    main()
