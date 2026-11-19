# PlayGloss 0.1.3

A fix-and-polish release: accurate text styles in the name boxes, a much stronger name filter, and online play on the same network.

## Fixed
- **Bold and italic now preview correctly** in the name boxes on the new-game screen, in all three modes. Before, only underline showed.
- Names now use a regular weight in the game, so a Bold choice is easy to see. The current player in the Turn order list is marked with a ring instead of bold text.

## Improved
- **A much stronger name filter.** It now catches names that are offensive to other people even when they are disguised: letters swapped for symbols or numbers (like `sh*t`), spaced out or repeated letters, look-alike characters from other alphabets, and rude acronyms. Mild words such as "damn" are still fine.
- The check runs on your device, works in English only and is still basic, so it can't catch everything. If it blocks something it shouldn't, or misses something, please open an issue on GitHub.

## Added
- **Online play on the same network (opt-in).** Turn on "Play Online" in Settings (off by default), then press "Host a game" on the Play page. Guests join by opening the link or scanning the QR code on the same network. You approve every guest, choose which seats they take, and can kick anyone at any time. After a game, "New game" returns to the lobby with the same guests still connected. Online play only works in the app (Windows, macOS, Linux, Android), not on the website.

## Documentation
- Documentation, README and the privacy notice are up to date. The privacy notice now describes the settings saved on your device and the temporary session storage that keeps your game when you switch pages, plus how online play works.
- The app description now says one to four players.

## Downloads
| Platform | Hardware | File |
|---|---|---|
| Windows 10 and 11 | 64-bit | `PlayGloss_0.1.3_x64-setup.exe` |
| Windows 10 | 32-bit | `PlayGloss_0.1.3_x86-setup.exe` (not yet tested on a real 32-bit PC) |
| macOS | Intel and Apple Silicon | `.dmg` |
| Linux (Debian 12+, Ubuntu 22.04+) | 64-bit | `.deb` or `.AppImage` |
| Android 7.0+ | 64-bit and 32-bit ARM | `.apk` |
| iPhone and iPad | any | open the website and use Add to Home Screen |

Not available: Windows 7 and 8, 32-bit Linux, and Linux on ARM.

The Windows and Mac apps are not signed, so you may see a warning the first time. The Documentation page explains how to open them.

PlayGloss still collects no data, has no ads and works fully offline. MIT licensed.