# Privacy

PlayGloss collects nothing.

- No analytics, cookies, ads or trackers.
- No accounts. The game makes no network requests while you play.
- The only things stored are your settings, kept on your own device (in your browser's local storage) and never sent anywhere: dark/light choice, color scheme and custom color, the Default/Extreme mode, the Infinite switch, the look to go back to when you leave Extreme mode, the Play Online switch, your font and text size, your background (the scheme's own, a solid color, or a picture you chose, shrunk and kept as text in your browser storage, with its fit and blur), and the Advanced Mode settings (the switch, the odds you set, the "?" switch, the questions you wrote and whether to ask about exporting before a Custom game). A picture, a configuration file or a word list you choose is read only on your device and is never uploaded.
- If you install the website as a web app, your browser also keeps a copy of the game's own files so it works offline. Nothing about you is stored in it.
- Scores, power-ups and answers exist only while the page is open. Nothing about a game is saved or sent.
- The Custom setup (hearts, target score, time to answer, wheel colors and team names) is kept only in the browser tab's temporary session storage, like names and colors, and is erased when you close the tab or app. When you host a Custom game, these rules are sent to the guests on your own network, together with the game itself.
- The optional Wi-Fi name, username and password in the lobby's Login page helper only exist on the host's screen while the lobby is open. They are not saved, not sent to guests and not part of any link or QR code.
- When a host chooses the Extreme color for guests, the guest's page shows that look for the length of the game. It is never saved on the guest's device.

## Online play on the same network

The Play page has an **Online** option to host or join a game. Hosting never runs unless you turn it on, and everything only uses your own local network:

- The **Settings** switch "Play Online" only unlocks the feature; it is off by default and nothing listens on the network while it is off.
- The small network server starts only when you choose **Online**, then press **"Host a game"** on the Play page, and stops when you press Stop, leave the page, close the app, or the game ends.
- It runs on your own Wi-Fi or LAN only. Guests join with **Online > Join a game** (paste the link or scan the QR code), or by opening the link in any browser, on the same network. Nothing goes over the internet.
- **Joining** needs no switch and opens no port. It only connects to the address in the link you give it, and only if that address is on a private network (such as 192.168.x.x or 10.x.x.x); a link to anything else is refused. In the app, a small built-in client does the connecting; on the website, the link opens the host's own join page.
- **Scanning a QR code** uses your camera only after you press the button and only while the preview is open. The picture is read on your device by the browser's or system's own QR reader. It is never saved, recorded or sent anywhere, and the camera is switched off when you scan, cancel or leave. Your link is never sent to PlayGloss or anyone else.
- **Paste link** reads your clipboard only when you press it, once, and keeps nothing.
- The lobby's **Connection** box only helps guests get onto the same Wi-Fi. The Wi-Fi name and password you may type there stay on that screen (and in the optional Wi-Fi QR code drawn on it). They are never saved, never sent to guests by PlayGloss and are not part of the join link; they are gone when you stop hosting.
- The host's mode choice (Default or Extreme, Infinite on or off) is sent to guests so everybody plays by the same rules. It contains nothing about you.
- Game messages are encrypted with the secret in the link. The host's server and the join client only pass them along and never read them.
- The secret part of the join link (after the `#`) never leaves your browser. It travels only by the link or QR code you share yourself.
- Guest names are checked with the same name filter on every device. Offensive names are refused.
- You approve every guest who asks to join, and you can kick anyone at any time.
- After a game, "New game" returns to the lobby with the same guests still connected.
- Your IP address and any data on your local network are never sent to PlayGloss, to GitHub, or anywhere else.

Where you get the game from may keep its own standard server logs (for example your IP address) or collect its own data. That is outside the game's code:

- GitHub: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- Our website host: see names.co.uk privacy policy
- App stores (if you install a packaged app from one): see that store's privacy policy.
