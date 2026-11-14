# PlayGloss

An English guess-the-meaning game for two players. Spin the wheel, get a word, pick the right meaning, and be the first team to reach 100 points.

- Free and open source (MIT)
- No ads, no trackers, no data collection
- No network requests while playing; runs on phone and desktop, in dark or light mode

## How to play

Red always starts. Each turn the team spins the wheel. It lands on a difficulty or a power-up.

| Level | Points | Time | Words |
|---|---|---|---|
| Very Easy | 1 | 15 s | 500 |
| Easy | 2 | 15 s | 300 |
| Normal | 3 | 20 s | 200 |
| Hard | 4 | 20 s | 150 |
| Very Hard | 5 | 25 s | 100 |
| Extremely Hard | 8 | 25 s | 75 |
| Insanely Hard | 10 | 30 s | 50 |
| Impossible (Almost) | 15 | 30 s | 25 |

- **Difficulty:** a word appears with four possible meanings. Pick the right one before time runs out.
- **Power-ups** (landing on one uses your turn and keeps it for later):
  - **2x** doubles your points if correct. **3x** triples them.
  - **Shield** gives half the points if you answer wrong (decimals are possible).
  - **Free 5** gives 5 points straight away.
- After the wheel shows a difficulty, you may use one power-up before the word is revealed. It is used up whether you answer right or wrong, and only one can be active per question.
- The wheel looks evenly divided, but the odds are not. Easier levels come up far more often.
- First to 100 or more wins, but Blue always gets the last turn of the round. A tie at the end goes to a sudden-death spin.
- As in chess, either team can resign or offer a draw on its turn.
- There is a very rare Easter egg. Good luck.

## Run it locally

    cd web
    python3 -m http.server

Then open http://localhost:8000.

## Project layout

    web/                 the game and website (this folder is all you need to host it)
      play.html          the game page
      js/core/           wheel odds and game rules (no visuals)
      js/ui.js           screen, wheel drawing, timer
      js/words.js        generated questions
    tools/build_words.py builds js/words.js from WordNet and a frequency list

## Rebuild the word list

    pip install nltk better-profanity
    python3 -c "import nltk; nltk.download('wordnet')"
    python3 tools/build_words.py --freq freq.txt

`freq.txt` is a word list, one word per line, most common first. Read the top of `tools/build_words.py` for details, and check `tools/words_review.tsv` before releasing.

## Privacy

See `PRIVACY.md`. In short: PlayGloss collects nothing.

## License and credits

PlayGloss is released under the MIT License (see `LICENSE`). Third-party material, including Princeton WordNet, is listed in `CREDITS.md` with its license.
