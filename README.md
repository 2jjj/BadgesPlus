# BadgesPlus

**🇺🇸 English** · [🇧🇷 Português](README.pt-BR.md)

A plugin for **[Vesktop](https://github.com/Vencord/Vesktop)** (and Vencord) that shows people's profile badges **without opening their profile** and lets you **search server members by badge**.

- Badges right after the name, **in chat and in the member list**
- Badge search: find who has **Nitro Opal**, **Early Supporter**, **24-month Boost**, **HypeSquad**... and message them directly
- 29 settings: size, spacing, limit, order, which badges to show, loading speed and more
- **English and Portuguese**: follows Discord's language, or pick one in the settings
- Automatic installer for Windows

> Using BetterDiscord? Get **[lirenzzzin/BadgesPlus-BetterDiscord](https://github.com/lirenzzzin/BadgesPlus-BetterDiscord)**

---

## Automatic install (Windows)

1. Click **Code → Download ZIP** on this page and extract the zip.
2. Double-click **`install.bat`**.
3. Answer **Y** when it asks something.
4. In Vesktop, go to **Settings → Vencord → Plugins**, search for **BadgesPlus** and enable it.

The installer does everything by itself, in English or Portuguese depending on your Windows language:

| Step | What happens |
|---|---|
| 1 | Checks that you have **Git**, **Node.js** and **pnpm**. If something is missing, offers to install it with `winget` |
| 2 | Downloads the Vencord source into `Documents\Vencord` (or updates it, if it's already there) |
| 3 | Copies the plugin into `Documents\Vencord\src\userplugins\badgesPlus` |
| 4 | Builds Vencord with the plugin |
| 5 | Finds Vesktop (installed or portable) and closes it, if it's open |
| 6 | Sets Vesktop's **Vencord Location** to the built folder |
| 7 | Opens Vesktop again |

Before changing Vesktop's settings, the installer saves a copy of them as `state.json.bak`.

> `install.bat` also works on its own: if you download only that file, the installer downloads the rest from GitHub.

### Update

Run **`install.bat`** again. It updates Vencord and the plugin and builds everything again.

> ⚠️ **Don't use the update button in Vencord's "Updater" tab.** It replaces your build with the official one, which doesn't have the plugin.

### Uninstall

Run **`uninstall.bat`**. Vesktop goes back to the official Vencord and the plugin is removed.

### Installer options

Both scripts accept options, e.g. `install.bat -Lang en`:

| Option | What it does |
|---|---|
| `-Lang en` / `-Lang pt` | Forces the language (default: Windows language) |
| `-VencordDir "C:\path"` | Uses another folder for the Vencord source (default: `Documents\Vencord`) |
| `-Yes` | Answers "yes" to every question |
| `-SkipVesktop` | Only builds, doesn't touch Vesktop (install only) |
| `-Canary` | Injects into the official **Discord Canary** instead of Vesktop (closes it first, injects Vencord, reopens) |

---

## How to use

### Badges next to the name

Once the plugin is enabled, badges show up by themselves in chat and in the member list. Hover over one to see its name.

- Badges like **HypeSquad, Bug Hunter, Early Supporter and Active Developer** show up right away.
- **Nitro and Boost** only exist in the person's full profile. The plugin loads profiles in the background, one at a time, starting with whoever is on screen, so these appear gradually.

### Badge search

1. Open a channel in any server.
2. Click the **Nitro icon** in the channel bar, next to pins and the member list.
3. You'll see buttons for every badge in the server and how many people have each one.
4. Click a badge to select it. It gets a **green outline** and the list of people who have it appears.
5. Select several to combine them. By default only people with **all** of them show up; you can switch to **any** in the settings.
6. For each person in the results:
   - click the **name or avatar** to open their profile;
   - click the **chat bubble** to open a DM with them.

**Tips**

- Discord only loads part of the members of big servers. The search shows "X members loaded of Y". Scrolling the member list loads more people.
- The **"Load badges of N members"** link fetches the profile of whoever is missing, to find Nitro and Boost. You can see how many are left and click **Stop** at any time.

---

## Settings

In **Settings → Vencord → Plugins → BadgesPlus** (gear icon). Everything applies immediately, no restart needed.

| Group | Options |
|---|---|
| **Language** | Auto (follows Discord) · English · Português |
| **Where to show** | In chat · In the member list · On your own account · On bots |
| **Appearance** | Size in chat · Size in member list · Space between badges · Max badges per person · Show "+N" when over the limit · Order (same as Discord / Nitro first / Nitro last) · Hover text (short name or Discord's text) |
| **Which badges** | Nitro · Boost · HypeSquad · Discord programs (Staff, Partner, Bug Hunter, Early Supporter, Developers...) · Originally known as · Quests and Orbs · Other |
| **Personalize** | Badge filter (show everything / only the list / everything but the list) · Badge list (ids, exact or prefix with `*`, e.g. `premium_*`) — applies to chat, member list and search · Quick message (the message the chat-bubble button sends) |
| **Loading** | Load profiles automatically · Speed (Fast 0.5s / Normal 1s / Safe 2s / Very safe 4s) · Load bot profiles · **Load everyone in the background** (slow, account-safe; servers and DMs/friends; discovers the whole server with a deep scan; continues across restarts) |
| **Search** | Show the button · Combine badges (all / any) · Load badges when opening · Message button · Close the search when opening a DM · Include bots · Max results |

Some options only show up when their "parent" option is on. For example, the chat size only appears if "Show in chat" is on.

---

## Manual install

If you'd rather do it by hand, or you're not on Windows:

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
```

1. Copy the `badgesPlus` folder from this repository into `Vencord/src/userplugins/`. Note: it's **`userplugins`**, not `plugins`.
2. Build:
   ```bash
   pnpm build
   ```
3. In Vesktop: **Settings → Vesktop → Open Developer Settings → Vencord Location** and pick the `Vencord/dist` folder.
4. Close Vesktop **completely** (tray icon near the clock → Quit) and open it again.
5. Enable **BadgesPlus** in **Settings → Vencord → Plugins**.

On the official Discord app (no Vesktop), run `pnpm inject` instead of step 3. For **Discord Canary**:

1. Close Discord Canary completely.
2. `pnpm inject -- -install -location "%LOCALAPPDATA%\DiscordCanary"` (from the `Vencord` folder).
3. Open Discord Canary.

> Discord Canary re-downloads itself when it updates — the injection (and the plugin) disappears until you run the command again. This is how Vencord works on Canary, not a bug. If Canary applies an update and BadgesPlus vanishes, run the same two commands again (clone/build/copy are already done).

---

## Troubleshooting

**The plugin doesn't show up in the plugin list**
- Run `install.bat` again and read the messages. If a step fails, it shows up in red.
- Quit Vesktop from the tray icon near the clock → **Quit**. Just closing the window isn't enough.

**The plugin disappeared after a while**
- Vencord was probably updated from the *Updater* tab. Run `install.bat` again.

**The Nitro button doesn't show up in the channel bar**
- It only shows up inside servers, not in DMs.
- Check that **"Badge search button"** is on in the plugin settings.
- If it still doesn't show up, Discord may have changed its code. Open the console (`Ctrl+Shift+I`), look for errors mentioning "BadgesPlus" and [open an issue](https://github.com/lirenzzzin/BadgesPlus/issues).

**Nitro/Boost badges take a while to show up**
- That's normal: Discord hands out one profile at a time. If Discord asks to slow down, the plugin slows down by itself. If it takes too long, use the **Normal** speed.

---

## Disclaimer

Client mods like Vencord are against Discord's Terms of Service. Use at your own risk. The plugin loads profiles slowly, respects Discord's limits and **never sends messages automatically**: the message button only opens the conversation.

## License

[GPL-3.0](LICENSE), the same license as Vencord.
