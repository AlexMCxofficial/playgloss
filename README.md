# PlayGloss

An English guess-the-meaning game for one to four players sharing one screen. Spin the wheel, get a word, pick the right meaning, and be first to 100 points.

- Free and open source (MIT)
- No ads, no trackers, no accounts, no data collection
- Works fully offline, on phone and desktop, in dark or light mode
- Play online on the same network with the **Online** option on the Play page: host from the app (opt-in, off by default), join from the app or the website by pasting the link or scanning the QR code
- Play in the browser: https://alexmcxofficial.github.io/playgloss/

## Download

Installers are on the [Releases page](https://github.com/AlexMCxofficial/playgloss/releases).

| Platform                          | Hardware                | Format                               | Status                                    |
| --------------------------------- | ----------------------- | ------------------------------------ | ----------------------------------------- |
| Windows 10 and 11                 | 64-bit                  | `.exe` installer                     | Tested                                    |
| Windows 10                        | 32-bit                  | `.exe` installer                     | Built, not tested on a real 32-bit PC     |
| macOS                             | Intel and Apple Silicon | `.dmg`                               | Built, not tested on a real Mac, unsigned |
| Linux (Debian 12+, Ubuntu 22.04+) | 64-bit                  | `.deb` or `.AppImage`                | Tested on Debian                          |
| Android 7.0+                      | 64-bit and 32-bit ARM   | `.apk`                               | Tested                                    |
| iPhone and iPad                   | any                     | web app (Safari, Add to Home Screen) | Works from the website                    |

Not supported: Windows 7 and 8, 32-bit Linux, Linux on ARM, Android on Intel (emulators).

Winget and F-Droid listings are not available yet. The Windows and Mac apps are not signed, so your system may warn you the first time. The [documentation](web/docs.html) explains how to open them.

## How to play

In 1 vs 1 and 2 vs 2 a random draw from 0 to 9 decides who goes first, and the play order is shown in a Turn order list. Each turn the player spins the wheel, and it lands on a difficulty or a power-up.

- **Solo:** just you, racing to 100 points. The game tells you how many turns it took. No resign or draw.
- **1 vs 1:** two players, each with a card showing name, color, score and power-ups, and their own Offer draw and Resign buttons.
- **2 vs 2:** two teams of two. A Team Scoreboard shows each team's combined score, and a leaderboard shows each player's share. A draw offer is for everyone, but resigning is only for you.

| Level               | Points | Time | Words |
| ------------------- | ------ | ---- | ----- |
| Very Easy           | 1      | 15 s | 500   |
| Easy                | 2      | 15 s | 300   |
| Normal              | 3      | 20 s | 200   |
| Hard                | 4      | 20 s | 150   |
| Very Hard           | 5      | 25 s | 100   |
| Extremely Hard      | 8      | 25 s | 75    |
| Insanely Hard       | 10     | 30 s | 50    |
| Impossible (Almost) | 15     | 30 s | 25    |

- **Power-ups:** 2x doubles your points if correct, 3x triples them, Shield gives half the points if you are wrong, and Free 5 gives 5 points straight away. You choose 2x, 3x or Shield after you see the level and before you see the word. One power-up per question, and it is used up either way.
- **The wheel looks evenly divided, but the odds are not.** Easier levels come up far more often.
- **Names and colors:** pick any color (16 presets, a hex code, RGB sliders or a color wheel; the two sides cannot have the same or a look-alike color) and a name of up to 16 characters, with bold, italic and underline if you like. Offensive names are refused with a red message.
- **Settings:** the gear at the top left opens Settings, where you can choose Light or Dark and a color scheme: PlayGloss, OLED, Yaru (Ubuntu orange), Extreme (dark red) or Custom. Under Modes, choose Default or Extreme, and switch Infinite on or off. Mode and color are separate: Extreme mode picks the Extreme color automatically, but you can still change either one. Settings stay on your device.
- **Extreme mode:** level odds are flipped (Impossible comes up as often as Very Easy does in Default). Points, time per level and the Easter egg odds do not change. Its larger WordNet word list is packed into `web/js/words.js` together with the normal one; regenerate it with the commands below if you ever want a different set.
- **Infinite mode:** no 100-point goal. Each player gets three Minecraft-style hearts; a wrong answer or time up costs a heart. See Documentation for how elimination works in solo and team games.
- **Online modes:** the host chooses Default or Extreme and Infinite in the Host a game tab; joining players see the same rules. The lobby's Connection section helps identify open Wi-Fi, password Wi-Fi or a login-page network. Wi-Fi names/passwords are not stored or sent by PlayGloss.
- **Winning:** when someone reaches 100, the round finishes so everyone gets the same number of turns. The higher score wins, and a tie goes to a sudden-death spin.
- **Switching pages:** open Home or Documentation and come back, and your game is still there for as long as the tab or window stays open.
- There is a very rare Easter egg. Good luck.

The full rules, the exact odds and install steps for every platform are in [`web/docs.html`](web/docs.html).

## Known limits

- The offensive-name check is basic. It works offline, in English only, and it cannot catch everything.
- Wrong answers are chosen automatically from other words' meanings, so a few may be accidentally right or oddly worded. Report any you find.
- The word list uses each word's most common meaning only.
- Memory use differs a lot between systems because the apps use each system's own web engine. I have not measured it properly yet.
- Online play only works on a local network (Wi-Fi or LAN), not over the internet. Hosting is off by default and only starts when you choose Online, then press "Host a game", after turning it on in Settings. Joining only connects to a private network address that you paste or scan. The website can join a game but cannot host one, and the in-app QR scanner needs a system or browser with a built-in QR reader (for example Chrome on Android).

## Run it locally

    cd web
    python3 -m http.server

Then open http://localhost:8000.

## Build the apps

The apps are made with [Tauri 2](https://tauri.app/). The game itself is the plain files in `web/`, so there is nothing to compile for the front end.

    npm install
    npx tauri dev            # opens the app window
    npx tauri build          # builds installers for your own system

You need Rust and your system's Tauri prerequisites first. GitHub Actions builds the installers for every platform (manual runs only):

- **Build desktop apps:** Windows 64-bit `.exe`, macOS `.dmg`, Linux `.deb` and `.AppImage`
- **Build Windows 32-bit app:** the 32-bit `.exe`
- **Build Android app:** the signed `.apk` (needs signing secrets in the repository settings)
- **Deploy website:** publishes `web/` to GitHub Pages whenever it changes

## Project layout

    web/                 the game and website (everything you need to host it)
      play.html          the game page
      docs.html          rules and install help
      settings.html      theme and color scheme
      sw.js, manifest.json   offline web app support
      js/core/           wheel odds, game rules and the name filter (no visuals)
      js/ui.js           screen, wheel drawing, timer, saving the game
      js/color.js        color picker (presets, hex, RGB, wheel)
      js/theme.js, js/settings.js   theme and color scheme
      js/words.js        generated questions
    src-tauri/           Tauri app configuration for the desktop and Android apps
    tools/build_words.py builds the normal and Extreme word lists from WordNet
    fastlane/            store text and screenshots for F-Droid
    .github/workflows/   the build and publishing workflows

## Generate the WordNet word lists (Windows PowerShell)

From the project folder (the one containing `tools/` and `web/`), run these commands. Python 3 must be installed and available as `py`.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install nltk wordfreq better-profanity
py -m nltk.downloader wordnet
py -c "from wordfreq import top_n_list; from pathlib import Path; Path('freq.txt').write_text('\n'.join(top_n_list('en', 120000)), encoding='utf-8')"
py tools/build_words.py --freq freq.txt
py tools/build_words.py --freq freq.txt --extreme
```

This makes `tools/data/words.json` and `tools/data/words_extreme.json`, plus review sheets in `tools/`. Then run `python3 tools/pack_words.py` to pack both into `web/js/words.js`. Check both review sheets before releasing. If PowerShell blocks the activate line, open a fresh PowerShell and run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first, then activate the environment.

For Mac/Linux use `python3 -m venv .venv`, `source .venv/bin/activate`, and replace `py` with `python3`.

`freq.txt` is only a local build-time ranking file; it is not included in the game. The game word meanings come from Princeton WordNet. `wordfreq` data is CC BY-SA; see `CREDITS.md` for the project's licensing notes.

## How this project was made

PlayGloss was built by AlexMC together with an AI assistant, Claude, made by Anthropic. I am telling you plainly so you can judge it for yourself, and so any store, distribution or project with a policy about AI-assisted code can decide what to do.

- **AlexMC** decided what to build: the rules, the odds, the game modes, the look, the platforms and the stores. I also tested it on real devices, ran the builds and made the releases.
- **Claude** wrote most of the code from those instructions: the game logic and interface, the offline web app files, the Tauri setup, the word-list script, the GitHub Actions workflows, the documentation and the store text.
- **Not AI-generated:** the word meanings come from Princeton WordNet (the script only selects and arranges them), and the app icon and the Easter egg screen design were supplied by AlexMC.

Everything is open source under the MIT License, so you can read all of it. If you contribute, please say so in your pull request if you used an AI tool.

## Privacy

See `PRIVACY.md`. In short: PlayGloss collects nothing.

## License and credits

PlayGloss is released under the MIT License (see `LICENSE`). Third-party material, including Princeton WordNet, is listed in `CREDITS.md` with its license.
