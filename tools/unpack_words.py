#!/usr/bin/env python3
"""Rebuilds tools/data/words.json and tools/data/words_extreme.json from web/js/words.js. MIT License (see LICENSE).

Use it when the readable lists have drifted from the packed file the game really ships (tests/test_words.js fails)
and the packed file is the one that was reviewed. It is the exact reverse of tools/pack_words.py, so afterwards
`python3 tools/pack_words.py` writes the same web/js/words.js again.

Run from the project root: python3 tools/unpack_words.py
"""
import json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PACK = os.path.join(ROOT, "web/js/words.js")
OUT = {"n": "tools/data/words.json", "x": "tools/data/words_extreme.json"}


def main():
    with open(PACK, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r'\{\n c: (\d+),\n t: ("(?:[^"\\]|\\.)*"),\n n: \{\n(.*?)\n \},\n x: \{\n(.*?)\n \}\n\}\);\s*$', text, re.S)
    if not m:
        sys.exit("web/js/words.js does not have the layout written by tools/pack_words.py")
    count = int(m.group(1))
    table = json.loads(m.group(2)).split("\n")
    if len(table) != count:
        sys.exit("sentence count %d does not match the header (%d)" % (len(table), count))
    sections = {"n": m.group(3), "x": m.group(4)}
    for key, body in sections.items():
        data = {}
        for level, csv in re.findall(r'"([^"]+)": "([^"]*)"', body):
            nums = [int(p, 36) for p in csv.split(",")] if csv else []
            if len(nums) % 5:
                sys.exit("level %s has a broken row" % level)
            data[level] = [
                {"word": table[nums[i]], "meaning": table[nums[i + 1]], "wrong": [table[n] for n in nums[i + 2:i + 5]]}
                for i in range(0, len(nums), 5)
            ]
        path = os.path.join(ROOT, OUT[key])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print("Wrote %s: %d levels, %d words" % (OUT[key], len(data), sum(len(v) for v in data.values())))


main()
