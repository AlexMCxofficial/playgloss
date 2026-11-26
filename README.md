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

| Level               | Points | Time | Words (0.1.6) |
| ------------------- | ------ | ---- | ----- |
| Very Easy           | 1      | 15 s | 1,400 |
| Easy                | 2      | 15 s | 1,400 |
| Normal              | 3      | 20 s | 1,400 |
| Hard                | 4      | 20 s | 1,400 |
| Very Hard           | 5      | 25 s | 1,400 |
| Extremely Hard      | 8      | 25 s | 1,400 |
| Insanely Hard       | 10     | 30 s | 1,400 |
| Impossible (Almost) | 15     | 30 s | 1,400 |

- **Power-ups:** 2x doubles your points if correct, 3x triples them, Shield gives half the points if you are wrong, and Free 5 gives 5 points straight away. You choose 2x, 3x or Shield after you see the level and before you see the word. One power-up per question, and it is used up either way.
- **The wheel looks evenly divided, but the odds are not.** Easier levels come up far more often.
- **Names and colors:** pick any color (16 presets, a hex code, RGB sliders or a color wheel; the two sides cannot have the same or a look-alike color) and a name of up to 16 characters, with bold, italic and underline if you like. Offensive names are refused with a red message.
- **Settings:** the gear at the top left opens Settings, where you can choose Light or Dark and a color scheme: PlayGloss, OLED, Yaru (Ubuntu orange), Extreme (dark red) or Custom. Under Modes, choose Default or Extreme, and switch Infinite on or off. Mode and color are separate: Extreme mode picks the Extreme color automatically, but you can still change either one. Settings stay on your device.
- **Extreme mode:** level odds are flipped (Impossible comes up as often as Very Easy does in Default). Points, time per level and the Easter egg odds do not change. Since 0.1.6 every level has its own 1,400 words (11,200 in all, packed into `web/js/words.js`), so Extreme mode uses the same list; regenerate it with the commands below if you ever want a different set.
- **Infinite mode:** no 100-point goal. Each player gets three Minecraft-style hearts; a wrong answer or time up costs a heart. See Documentation for how elimination works in solo and team games.
- **Custom mode (0.1.5):** the Play page has a Custom tab, left of Online. In tabs (General, Time, Colors, Teams) you choose Default or Extreme, Infinite on or off, the hearts (1 to 10, with Infinite) or the target score (100 to 1000, without it), the time to answer (Very Easy gives the most time, Impossible the least), and the color of each level on the wheel. Custom is played by two teams of two, like 2 vs 2, and it works on phones and iPads.
- **Progress bars (0.1.5):** the bar above each name fills from left to right as you get closer to the goal (100 points, or the Custom target score). With Infinite it starts full and loses one share for every lost heart (a third with 3 hearts). It shows no number.
- **Fonts (0.1.6):** Settings → General → Fonts offers seven fonts: System (your device's own font, the default), Helvetica, Arial, Segoe UI, Compasse, Fira Code and JetBrains Mono. A size slider goes from 75% to 150% (100% is the default) and scales the whole app. Fira Code and JetBrains Mono (SIL Open Font License) are shipped in `web/fonts/`. Helvetica, Arial, Segoe UI and Compasse are not shipped (they are proprietary, and Compasse is a commercial font): they show only where they are installed, otherwise a similar font is used.
- **Background (0.1.6):** Settings → General → Background has three types: **Scheme** (the color scheme's own background, the default), **Color** (one solid color from the color picker: presets, hex, RGB or the wheel; text and cards adapt so they stay readable) and **Image** (your own picture, shrunk to fit a screen and kept only on your device). Image adds **Fit** (Cover fills the screen and crops, Contain shows the whole picture) and **Blur** (0 to 10, 0 is the default).
- **Advanced Mode (0.1.6):** the last section of Settings. It is off by default. When it is on and Custom rules is on (Play page), an **Advanced** tab appears before Teams with:
  - **Probabilities**: the chance of each of the 8 levels and of 2x, 3x, Shield and Free 5, in percent with up to two decimals. They must add up to exactly 100%, and the page always shows how much is left to give out and the most each item can still take. Extreme mode still flips the eight level chances. The Easter egg's chance cannot be changed.
  - **Enable/Disable "?"**: switches the surprise slice on or off.
  - **Questions**: *Default* (the built-in words, now 1,400 for every level) or *Custom* (your own multiple-choice questions with 2, 3 or 4 choices, up to 1,000). Import and export them as a CSV word list (`word,meaning,wrong1,wrong2,wrong3,choices`).
  - **Advanced Custom Mode Configurations**: export or import the whole Custom setup plus the Advanced settings as one JSON file. Without Advanced Mode the same box is called **Custom Mode Configurations**. Saving a file, sharing it or copying the text all work on Windows, macOS, Linux, Android and in the browser.
  - **Export question**: before every Start game or Host a game with Custom rules, with or without Advanced Mode, PlayGloss asks "Would you like to export this configuration?". Tick "Don't show this again" to stop it (you can turn it back on in the same box).
- **Documentation navigation (0.1.7):** the Documentation page has tabs and sub-tabs (Getting Started, Game Modes, Settings, Online Play, Download and Install, Privacy and Legal) and a search bar. On large screens it is a sidebar with a toggle icon, and Settings → General → Documentation puts it on the left or the right. On tablets and phones it is a drawer opened with the Contents button (always on the left on phones, where the choice is greyed out). Fixed: choosing Image as the background type in Settings now shows the picture picker and highlights Image.
- **Online modes:** the host chooses Default, Extreme or Custom and Infinite in the Host a game tab; joining players see the same rules. The host can also set the guests' **Color** to Extreme: every guest gets the Extreme look (dark red), the host's own look never changes, and guests can still switch to light (Dark brings Extreme back). The lobby's Connection section helps identify open Wi-Fi, password Wi-Fi or a login-page network. For a login-page network you can note the Wi-Fi name, username (for example `ssxxxxx` at a school) and password on the host's screen. Wi-Fi names, usernames and passwords are not stored or sent by PlayGloss.
- **Winning:** when someone reaches 100, the round finishes so everyone gets the same number of turns. The higher score wins, and a tie goes to a sudden-death spin.
- **Switching pages:** open Home or Documentation and come back, and your game is still there for as long as the tab or window stays open.
- There is a very rare Easter egg. Good luck.

The full rules, the exact odds and install steps for every platform are in [`web/docs.html`](web/docs.html).

### Kahoot-like hosting

Use the Windows, macOS or Linux app with **Advanced Mode** and **Play Online** enabled. On the Play page, open **Online → Host a game → Custom rules → Advanced → Layout**, choose **Kahoot-like**, then host. Share the LAN invite link or QR code with at least two players. Guests can join on Android or in a browser. The desktop host controls the room and spectates.

- With difficulty tiers on, one wheel spin sets each round's tier. Players get different questions at that tier. Set the number of rounds in Difficulty Tiers.
- Turn tiers off to write or import an ordered set of up to 1,000 questions with per-question points, multipliers and answer formats. Multiple choice, tick box and matching pairs are supported.
- Customize admission, the RAM-based room size, previews, timed scoring, the top-five leaderboard, streaks and the final podium. The host sees the wheel and countdown while players answer, followed by aggregate results when the timer ends or everyone answers.
- Partial scoring for tick boxes and matching pairs is on by default. Correct tick-box selections earn a share, with incorrect selections offsetting them. Each correct match earns a share. Turn partial scoring off in Answer Format to award points only for a fully correct answer. Only fully correct answers build streaks. The room limit is an estimate capped at 128 players. Export/Import saves the spectator settings, wheel settings and custom questions together.

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
      js/theme.js, js/settings.js   theme, color scheme, fonts and background
      js/advanced.js     Advanced Mode (odds, "?" switch, own questions)
      js/transfer.js     saving, copying and loading configuration and word list files
      fonts/             Fira Code and JetBrains Mono (SIL OFL, see CREDITS.md)
      js/words.js        generated questions
    src-tauri/           Tauri app configuration for the desktop and Android apps
    tools/build_words.py builds the word list (1,400 words per level) from WordNet
    fastlane/            store text and screenshots for F-Droid
    .github/workflows/   the build and publishing workflows

## Generate the WordNet word lists (Windows PowerShell)

From the project folder (the one containing `tools/` and `web/`), run these commands. Python 3 must be installed and available as `py`.

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install nltk wordfreq better-profanity
py -m nltk.downloader wordnet
py -c "from wordfreq import top_n_list; from pathlib import Path; Path('freq.txt').write_text('\n'.join(top_n_list('en', 150000)), encoding='utf-8')"
py tools/build_words.py --freq freq.txt
py tools/pack_words.py
```

This makes `tools/data/words.json` (1,400 words for each of the 8 levels), plus a review sheet in `tools/`. `pack_words.py` packs it into `web/js/words.js`. Check the review sheet before releasing. (Extreme mode no longer needs its own list.) If PowerShell blocks the activate line, open a fresh PowerShell and run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first, then activate the environment.

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
