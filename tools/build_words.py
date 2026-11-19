#!/usr/bin/env python3
"""Build web/js/words.js for PlayGloss from Princeton WordNet + a word-frequency list.

Setup (once):
    pip install nltk better-profanity
    python3 -c "import nltk; nltk.download('wordnet')"

Frequency list: a plain text file, ONE WORD PER LINE, MOST COMMON FIRST (extra columns
such as counts are ignored). Choose a list whose license fits your project and credit
it in CREDITS.md. For a quick test only you can export one from the `wordfreq` package:
    pip install wordfreq
    python3 -c "from wordfreq import top_n_list; print('\\n'.join(top_n_list('en',120000)))" > freq.txt
(wordfreq's data is CC BY-SA, so check that before shipping the result.)

Run from the PROJECT ROOT (the folder that contains web/ and tools/):
    python3 tools/build_words.py --freq freq.txt

Output: web/js/words.js (the game) and tools/words_review.tsv (read this before releasing).
Same --seed gives the same set every time.
"""
import argparse, json, random, re, sys
from functools import lru_cache

TIERS = [  # id, how many words
    ("very-easy", 500), ("easy", 300), ("normal", 200), ("hard", 150),
    ("very-hard", 100), ("extremely-hard", 75), ("insanely-hard", 50), ("impossible", 25),
]
# Rank windows (0-based, in the cleaned list ordered by frequency) each tier samples from.
# They scale down automatically if the cleaned list is shorter than the last window.
WINDOWS = [(200, 3000), (3000, 6000), (6000, 11000), (11000, 17000),
           (17000, 25000), (25000, 35000), (35000, 48000), (48000, 65000)]

STOP = set("""the and for are but not you all any can had her was one our out has his how its may new now old see two way who
did get let say she too use that this with have from they will would there their what about which when your said each
than them then these some into more other could been were also only over such here very just like even most much many
must after again where those being both does doing done off yet nor""".split())
OFFENSIVE = re.compile(r"offensive|vulgar|derogatory|disparaging|obscene|slur|contemptuous|ethnic|racial|sexual|genital|"
                       r"sexually|obscenity|pejorative|insulting|taboo", re.I)
BAD_DEF = re.compile(r"plural of|past tense|past participle|variant|abbreviation|short for|alternative|"
                     r"informal|slang|used (?:as|in|of|with)|\bsee\b|\bhttp", re.I)
WORD = re.compile(r"^[a-z]{3,}$")


def toks(s):
    return {t for t in re.findall(r"[a-z]{4,}", s.lower()) if t not in STOP}


def clean_def(d, w, pos):
    d = d.split(";")[0].strip()
    d = re.sub(r"^\([^)]*\)\s*", "", d)
    if not 8 <= len(d) <= 95 or BAD_DEF.search(d):
        return None
    stem = w[: max(4, len(w) - 3)]
    if stem in d.lower():
        return None
    if pos == "v" and not d.lower().startswith("to "):
        d = "to " + d
    return d[0].lower() + d[1:] if d[1:2].islower() else d


def candidates(words, wn, bad=None, limit=None):
    """Single, lowercase, non-offensive WordNet lemmas in frequency order, using the most common sense."""
    out, seen = [], set()
    for i, w in enumerate(words):
        if limit and len(out) >= limit:
            break
        if i % 10000 == 0:
            print(f"  checked {i} words, {len(out)} usable", flush=True)
        if w in seen or w in STOP or not WORD.match(w):
            continue
        seen.add(w)
        syns = wn.synsets(w)
        own = [s for s in syns if any(l.name() == w for l in s.lemmas()) and s.pos() in "nvasr"]
        if not own or any(OFFENSIVE.search(s.definition()) for s in syns):
            continue
        s = own[0]
        pos = "a" if s.pos() == "s" else s.pos()
        d = clean_def(s.definition(), w, pos)
        if not d:
            continue
        if bad and (bad(w) or any(bad(x.definition()) for x in syns)):
            continue  # profanity filter: the word itself or any of its senses
        out.append({"word": w, "pos": pos, "meaning": d, "lex": s.lexname(),
                    "syn": {l.name().lower() for l in s.lemmas()}})
    return out


def good_wrong(t, c):
    if c["word"] == t["word"] or c["lex"] == t["lex"] or c["word"] in t["syn"]:
        return False
    a, b = toks(t["meaning"]), toks(c["meaning"])
    if a and b and len(a & b) / len(a | b) >= 0.25:
        return False
    if not 0.55 <= len(c["meaning"]) / len(t["meaning"]) <= 1.8:
        return False
    return t["word"][: max(4, len(t["word"]) - 3)] not in c["meaning"].lower()


def build(words, wn, seed=1, log=print, bad=None):
    cand = candidates(words, wn, bad, limit=WINDOWS[-1][1] + 5000)
    n = len(cand)
    log(f"{n} usable words after cleaning")
    scale = min(1.0, n / WINDOWS[-1][1])
    if scale < 1:
        log(f"WARNING: only {n} usable words; windows scaled by {scale:.2f}. Use a longer frequency list.")
    rnd = random.Random(seed)
    bypos = {}
    for c in cand:
        bypos.setdefault(c["pos"], []).append(c)
    result, review, taken = {}, [], set()
    for (tid, count), (lo, hi) in zip(TIERS, WINDOWS):
        lo, hi = int(lo * scale), int(hi * scale)
        window = cand[lo:hi]
        rnd.shuffle(window)
        items = []
        for t in window:
            if len(items) == count:
                break
            if t["word"] in taken:
                continue
            pool = bypos[t["pos"]]
            wrong = []
            for _ in range(600):
                c = rnd.choice(pool)
                if good_wrong(t, c) and all(c["meaning"] != x["meaning"] and good_wrong(x, c) for x in wrong):
                    wrong.append(c)
                    if len(wrong) == 3:
                        break
            if len(wrong) < 3:
                continue
            taken.add(t["word"])
            items.append({"word": t["word"], "meaning": t["meaning"], "wrong": [x["meaning"] for x in wrong]})
            review.append((tid, t["word"], t["pos"], t["meaning"], " | ".join(x["meaning"] for x in wrong)))
        if len(items) < count:
            log(f"WARNING: {tid} has only {len(items)} of {count} words")
        result[tid] = sorted(items, key=lambda i: i["word"])
    return result, review


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--freq", required=True, help="word list, most common first")
    ap.add_argument("--out", default="web/js/words.js")
    ap.add_argument("--review", default="tools/words_review.tsv")
    ap.add_argument("--blocklist", help="optional file of extra words to exclude, one per line")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--no-profanity-filter", action="store_true", help="skip the better-profanity check (not recommended)")
    a = ap.parse_args()
    try:
        from nltk.corpus import wordnet as wn
        wn.synsets("test")
    except Exception as e:
        sys.exit(f"WordNet not available ({e}).\nRun: pip install nltk && python3 -c \"import nltk; nltk.download('wordnet')\"")
    bad = None
    if not a.no_profanity_filter:
        try:
            from better_profanity import profanity
            profanity.load_censor_words()
            check = lru_cache(maxsize=None)(profanity.contains_profanity)  # each distinct word is checked once
            bad = lambda text: any(check(t) for t in set(re.findall(r"[a-z]+", text.lower())))
        except ImportError:
            sys.exit("Profanity filter missing. Run: pip install better-profanity")
    block = set()
    if a.blocklist:
        block = {l.strip().lower() for l in open(a.blocklist, encoding="utf-8") if l.strip()}
    words = []
    for line in open(a.freq, encoding="utf-8"):
        p = line.split()
        if p and p[0].lower() not in block:
            words.append(p[0].lower())
    result, review = build(words, wn, a.seed, bad=bad)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write("// Generated by tools/build_words.py from Princeton WordNet 3.0 (see CREDITS.md). Do not edit by hand.\n")
        f.write("var WORDS = " + json.dumps(result, ensure_ascii=False, indent=1) + ";\n")
    with open(a.review, "w", encoding="utf-8") as f:
        f.write("level\tword\tpos\tcorrect meaning\twrong meanings\n")
        for r in review:
            f.write("\t".join(r) + "\n")
    print("Wrote", a.out, "and", a.review, "-", {k: len(v) for k, v in result.items()})


if __name__ == "__main__":
    main()
