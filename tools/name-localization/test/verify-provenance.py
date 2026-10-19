"""Fail if the isolated identity encoder drifts from the pinned released source."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
metadata = json.loads((root / "provenance.json").read_text())
directory = root / "client/src/main/java/local/ae2web/names/identity"
for source in metadata["sourceFiles"]:
    text = (directory / (source["name"] + ".java")).read_text()
    original_package = (
        "pl.kuba6000.ae2webintegration.core.identity"
        if source["name"] == "StableKey"
        else "pl.kuba6000.ae2webintegration.ae2interface.implementations"
    )
    # Restore the original package statement and StableKey import only.
    text = text.replace("package local.ae2web.names.identity;", "package " + original_package + ";", 1)
    text = text.replace(
        "import local.ae2web.names.identity.StableKey;",
        "import pl.kuba6000.ae2webintegration.core.identity.StableKey;",
    )
    digest = hashlib.sha256(text.encode()).hexdigest()
    assert digest == source["upstreamSha256"], f"Identity source drift: {source['name']}"
    print(f"Verified pinned release source: {source['name']}")
