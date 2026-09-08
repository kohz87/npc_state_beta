from pathlib import Path

path = Path('tests/structure.test.mjs')
text = path.read_text()
text = text.replace("assert.equal(manifest.version, '0.5.11');", "assert.equal(manifest.version, '0.5.12');")
text = text.replace("assert.match(schema, /NPC_STATE_VERSION = '0.5.11'/);", "assert.match(schema, /NPC_STATE_VERSION = '0.5.12'/);")
path.write_text(text)
print('Aligned structural release assertion to v0.5.12')
