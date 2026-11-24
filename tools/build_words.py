#!/usr/bin/env python3
"""Build tools/data/words.json for PlayGloss from Princeton WordNet + a word-frequency list.

Setup (once):
    pip install nltk wordfreq better-profanity
    python -m nltk.downloader wordnet
    python -c "from wordfreq import top_n_list; from pathlib import Path; Path('freq.txt').write_text('\n'.join(top_n_list('en',150000)), encoding='utf-8')"

Frequency list: a plain text file, ONE WORD PER LINE, MOST COMMON FIRST (extra columns
such as counts are ignored). Choose a list whose license fits your project and credit
it in CREDITS.md. For a quick test only you can export one from the `wordfreq` package:
    pip install wordfreq
    python3 -c "from wordfreq import top_n_list; print('\\n'.join(top_n_list('en',150000)))" > freq.txt
(wordfreq's data is CC BY-SA, so check that before shipping the result.)

Run from the PROJECT ROOT (the folder that contains web/ and tools/):
    python3 tools/build_words.py --freq freq.txt

Output: tools/data/words.json and tools/words_review.tsv (read this before releasing).
Then run tools/pack_words.py, which packs the list into web/js/words.js (the only file the game loads).
Same --seed gives the same set every time.

0.1.6: EVERY level now has 1,400 words (11,200 in total), so Advanced Mode can give any level (even 100%) the odds
it likes without running out of fresh words. The wrong meanings are taken from the meanings of the chosen words
themselves (same kind of word, different topic), so every sentence is stored once and the pack stays small.

EXTREME MODE (0.1.4) used a second list with flipped word counts. Since 0.1.6 every level has the same number of
words, so Extreme mode uses the one list and --extreme is no longer needed (the old flag is still accepted and ignored).
"""
import argparse, json, random, re, sys
from functools import lru_cache

PER_LEVEL = 1400
TIERS = [(tid, PER_LEVEL) for tid in ("very-easy", "easy", "normal", "hard", "very-hard", "extremely-hard", "insanely-hard", "impossible")]
# Rank windows (0-based, in the cleaned list ordered by frequency) each tier samples from. Every window holds well over
# 1,400 usable words. They scale down automatically if the cleaned list is shorter than the last window.
WINDOWS = [(200, 2800), (2800, 5600), (5600, 8800), (8800, 12400),
           (12400, 16400), (16400, 20400), (20400, 24400), (24400, 27700)]

STOP = set("""the and for are but not you all any can had her was one our out has his how its may new now old see two way who
did get let say she too use that this with have from they will would there their what about which when your said each
than them then these some into more other could been were also only over such here very just like even most much many
must after again where those being both does doing done off yet nor""".split())
OFFENSIVE = re.compile(r"offensive|vulgar|derogatory|disparaging|obscene|slur|contemptuous|ethnic|racial|sexual|genital|"
                       r"sexually|obscenity|pejorative|insulting|taboo", re.I)
BAD_DEF = re.compile(r"plural of|past tense|past participle|variant|abbreviation|short for|alternative|"
                     r"informal|slang|used (?:as|in|of|with)|\bsee\b|\bhttp", re.I)
# Words that are not offensive but do not belong in a family word game (checked on the word itself, not its meanings).
SENSITIVE = {"faeces", "feces", "faecal", "fecal", "abortionist", "sexuality"}
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
        if w in seen or w in STOP or w in SENSITIVE or not WORD.match(w):
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




def freq_from_wordfreq(n):
    """The n most common English words, most common first (needs: pip install wordfreq)."""
    try:
        from wordfreq import top_n_list
    except ImportError:
        sys.exit("wordfreq is missing. Run: pip install wordfreq   (or give your own list with --freq FILE)")
    return top_n_list("en", n)


def build(words, wn, seed=1, log=print, bad=None, tiers=TIERS):
    cand = candidates(words, wn, bad, limit=WINDOWS[-1][1] + 5000)
    n = len(cand)
    log(f"{n} usable words after cleaning")
    scale = min(1.0, n / WINDOWS[-1][1])
    if scale < 1:
        log(f"WARNING: only {n} usable words; windows scaled by {scale:.2f}. Use a longer frequency list.")
    rnd = random.Random(seed)
    # Pass 1: shuffle the window of every level and keep the first `count` plus a reserve for words that find no wrong meanings.
    RESERVE = 1200
    chosen = []
    for (tid, count), (lo, hi) in zip(tiers, WINDOWS):
        window = cand[int(lo * scale):int(hi * scale)]
        rnd.shuffle(window)
        if len(window) < count:
            log(f"WARNING: {tid} has only {len(window)} candidates for {count} words")
        chosen.append((tid, count, window[:count + RESERVE]))
    # Pass 2: the wrong meanings come from the meanings of the chosen words, so every sentence is stored once.
    bypos, allpos = {}, {}
    for _, _, items in chosen:
        for c in items:
            bypos.setdefault(c["pos"], []).append(c)
    for c in cand:
        allpos.setdefault(c["pos"], []).append(c)

    def wrongs(t):
        for pool in (bypos[t["pos"]], allpos[t["pos"]]):  # the whole cleaned list only if the chosen words do not offer enough
            wrong = []
            for _ in range(600):
                c = rnd.choice(pool)
                if good_wrong(t, c) and all(c["meaning"] != x["meaning"] and good_wrong(x, c) for x in wrong):
                    wrong.append(c)
                    if len(wrong) == 3:
                        return wrong
        return None

    result, review = {}, []
    for tid, count, items in chosen:
        out = []
        for t in items:
            if len(out) == count:
                break
            wrong = wrongs(t)
            if not wrong:
                continue
            out.append({"word": t["word"], "meaning": t["meaning"], "wrong": [x["meaning"] for x in wrong]})
            review.append((tid, t["word"], t["pos"], t["meaning"], " | ".join(x["meaning"] for x in wrong)))
        if len(out) < count:
            log(f"WARNING: {tid} has only {len(out)} of {count} words")
        result[tid] = sorted(out, key=lambda i: i["word"])
    return result, review


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--freq", help="word list, most common first (optional: without it the wordfreq package is used)")
    ap.add_argument("--extreme", action="store_true", help="ignored since 0.1.6 (every level has the same number of words)")
    ap.add_argument("--wordfreq-size", type=int, default=150000, help="how many words to take from wordfreq (default 150000)")
    ap.add_argument("--out")
    ap.add_argument("--review")
    ap.add_argument("--blocklist", help="optional file of extra words to exclude, one per line")
    ap.add_argument("--seed", type=int)
    ap.add_argument("--no-profanity-filter", action="store_true", help="skip the better-profanity check (not recommended)")
    a = ap.parse_args()
    name = "words"
    a.out = a.out or f"tools/data/{name}.json"
    a.review = a.review or f"tools/{name}_review.tsv"
    if a.seed is None:
        a.seed = 1
    tiers = TIERS
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
    if a.freq:
        raw = [l.split()[0] for l in open(a.freq, encoding="utf-8-sig") if l.split()]  # utf-8-sig: also reads a file saved with a BOM
    else:
        raw = freq_from_wordfreq(a.wordfreq_size)
    words = [w.lower() for w in raw if w.lower() not in block]
    result, review = build(words, wn, a.seed, bad=bad, tiers=tiers)
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    with open(a.review, "w", encoding="utf-8", newline="\n") as f:
        f.write("level\tword\tpos\tcorrect meaning\twrong meanings\n")
        for r in review:
            f.write("\t".join(r) + "\n")
    print("Wrote", a.out, "and", a.review, "-", {k: len(v) for k, v in result.items()})
    print("Now run: python3 tools/pack_words.py   (it makes web/js/words.js, the file the game loads)")


if __name__ == "__main__":
    main()
