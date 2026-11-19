# Credits

PlayGloss itself is MIT licensed (see `LICENSE`). Everything below is third-party and keeps its own license.

## Shipped with the game

### Word meanings: Princeton WordNet 3.0

The questions in `web/js/words.js` are generated from WordNet (words and their definitions).
WordNet is not MIT licensed; its notice must stay with every copy that includes it:

> WordNet Release 3.0
>
> This software and database is being provided to you, the LICENSEE, by Princeton University under the following license. By obtaining, using and/or copying this software and database, you agree that you have read, understood, and will comply with these terms and conditions.
>
> Permission to use, copy, modify and distribute this software and database and its documentation for any purpose and without fee or royalty is hereby granted, provided that you agree to comply with the following copyright notice and statements, including the disclaimer, and that the same appear on ALL copies of the software, database and documentation, including modifications that you make for internal use or for distribution.
>
> WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
>
> THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. BY WAY OF EXAMPLE, BUT NOT LIMITATION, PRINCETON UNIVERSITY MAKES NO REPRESENTATIONS OR WARRANTIES OF MERCHANTABILITY OR FITNESS FOR ANY PARTICULAR PURPOSE OR THAT THE USE OF THE LICENSED SOFTWARE, DATABASE OR DOCUMENTATION WILL NOT INFRINGE ANY THIRD PARTY PATENTS, COPYRIGHTS, TRADEMARKS OR OTHER RIGHTS.
>
> The name of Princeton University or Princeton may not be used in advertising or publicity pertaining to distribution of the software and/or database. Title to copyright in this software, database and any associated documentation shall at all times remain with Princeton University and LICENSEE agrees to preserve same.

Source: https://wordnet.princeton.edu/

To cite WordNet:

- Miller, G. A. (1995). WordNet: A Lexical Database for English. *Communications of the ACM*, 38(11), 39-41.
- Fellbaum, C. (Ed.). (1998). *WordNet: An Electronic Lexical Database*. Cambridge, MA: MIT Press.

## Inside the apps only (Windows, macOS, Linux and Android; not the website)

### Tauri 2 (MIT or Apache 2.0)

The apps are built with [Tauri](https://tauri.app/), including its window and web view libraries (`tao` and `wry`) and the other Rust libraries it uses. They are compiled into the app. Each keeps its own license, mostly MIT and Apache 2.0. The full list with versions is in `src-tauri/Cargo.lock`.

### Web engines (provided by your system, not shipped by PlayGloss)

- Microsoft Edge WebView2 on Windows. The Windows installer can download it from Microsoft if it is missing.
- WebKit on macOS, and WebKitGTK on Linux (LGPL).
- Android System WebView on Android.

## Build tools only (not shipped with the game)

- Tauri CLI, `@tauri-apps/cli` (MIT or Apache 2.0), and the Rust toolchain (MIT or Apache 2.0): build the apps
- GitHub Actions: builds the apps and publishes the website on GitHub Pages
- NLTK (Apache 2.0): reads WordNet in `tools/build_words.py`
- better-profanity (MIT): filters offensive words in `tools/build_words.py`
- wordfreq (code Apache 2.0, data CC BY-SA 4.0): ranked words by how common they are in `tools/build_words.py`. Only the ordering was used; none of its data is shipped.

## Design inspiration (no code or files included)

- Yaru, Ubuntu's default theme (https://github.com/ubuntu/yaru): the Yaru color scheme in Settings borrows its look, Ubuntu orange (`#E95420`) with warm grays. No Yaru files are used. Ubuntu and Yaru belong to Canonical, and PlayGloss is not affiliated with or endorsed by Canonical.

## Shipped with the game (online play only)

### lean-qr by David Evans (MIT)

A minimal QR code generator, used to draw the QR code that guests scan to join a hosted game. Only the single file `web/js/online/lean-qr.js` is included, taken from the ha.mr repository by p2r3.

> Copyright (c) 2021-2025 David Evans
>
> MIT License
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

ha.mr by p2r3 (MIT, Copyright (c) 2026 p2r3): the idea of packing QR codes into the compact alphanumeric mode inspired the all-caps link trick used for the join QR code. Only the lean-qr file from ha.mr is included; ha.mr's own compress.js and alphabets.js are not used.

## Original work

The wheel, rules, interface, name filter, color picker, settings and Easter egg are original to PlayGloss (MIT, AlexMC). The app icon and logo were supplied by AlexMC.

## Made with AI assistance

Most of the code and text was written by Claude, an AI assistant made by Anthropic, from instructions and testing by AlexMC. See "How this project was made" in `README.md`.
