# PureTidings Desktop 🚀

**PureTidings Desktop** is a high-performance, standalone RSS and content aggregator desktop application built with **Tauri v2** (Rust + Native WebView).

## ✨ Core Highlights
- **100% Local & Free:** Zero monthly server costs. All feeds, article links, and preferences stay on your machine.
- **Universal IMAP Email & Newsletters:** Connect directly to any IMAP inbox via native Rust TLS (`imap`, `mail-parser`) to read newsletters alongside RSS feeds with bidirectional read sync.
- **High-Fidelity Sandboxed Email Viewer:** Isolated iframe rendering with anti-hotlink CDN bypass (`no-referrer`), Light/Dark mode toggle, and pristine multi-format export (MD, HTML, TXT).
- **No CORS & No IP Bans:** Feed and article requests run natively via Rust (`reqwest` with `rustls`) using your residential internet connection.
- **Native Multi-Language (i18n):** Instant runtime switching between English, German, Spanish, and French.
- **BYOK Gemini AI Summaries with Direct Storage:** Free AI-powered summaries of articles and YouTube videos (TL;DW) using your own Google Gemini API key, saved directly to disk (`/storage/emulated/0/Download/` on Android, Downloads folder on Desktop) via native Rust IPC (`save_download_file`) with multi-format export (MD, HTML, TXT) and Share sheet fallback.
- **Touch-Enabled Resizable & Draggable Modals:** Free-floating Reader and Settings dialogs with completely unrestricted desktop resizing, right-edge width drag handle, corner grip (`◢`), 1-tap Fit/Maximize button (`⛶`), and mobile landscape auto-clamping.
- **Touch-Friendly Feed & Folder Hierarchy Management:** Dedicated 1-tap Up (▲) and Down (▼) buttons for effortless feed and folder reordering on touchscreens, Android, and desktop, plus parent folder selection with automatic cycle detection for instant folder nesting and re-parenting.
- **Streamlined Mobile Settings Layout:** Removed redundant in-dialog refresh buttons and tightened margins, maximizing horizontal space for feed titles and URLs on mobile screens.
- **Native Mobile & Desktop Notifications:** System notifications across Windows Toast, macOS, Linux, and Android status bar (`tauri-plugin-notification` with dedicated high-importance channel, sound, and heads-up banner).
- **System Autostart & Screen Wake Lock:** Optional automatic background launch on system boot (Windows, macOS, Linux) and Screen Wake Lock to keep displays awake on mobile devices.
- **Fluid Responsive Reader Typography:** Dynamic font scaling (`clamp(1.15rem, 4.2vw, 1.45rem)`) and mobile portrait header stacking prevent oversized titles on small screens.
- **External Browser Integration:** Seamless link opening in your system default browser on desktop and Android (`tauri-plugin-opener`).
- **Nextcloud & WebDAV Cross-Device Sync:** Seamless, privacy-preserving cross-device synchronization between desktop and mobile via any Nextcloud, ownCloud, MagentaCloud, or WebDAV server with Set-Union article status merging and zero third-party cloud lock-in.
- **Automated Local Backups & OPML:** Full OPML 2.0 import/export, direct clipboard/text restoration, and automated daily JSON backups to a dedicated local directory.
- **Multi-Platform Native Packages:** Automated CI/CD release builds for Windows (`.exe`, `.msi`), macOS (`.dmg` universal binary for Apple Silicon & Intel), Linux (`.AppImage`, `.deb`, `.rpm`), and Android (`.apk`).

---

## ℹ️ Important Note: YouTube Feed Queries & AI Video Transcripts

When querying multiple YouTube channels simultaneously (e.g., when refreshing all feeds at once), YouTube's servers may temporarily trigger anti-bot rate limiting ("Are you a human?" check). 

If you open a video during this temporary window, YouTube may withhold transcripts for a brief cooldown period (typically 5–15 minutes), during which the AI video summary cannot be retrieved. After waiting a few minutes, transcript retrieval and AI summaries will automatically work again as expected—**this is standard upstream YouTube IP rate limiting, not a bug in the application**.

> **Pro-Tip:** In Settings under **Automation & Schedule**, keep the **"🎲 Randomize fetch timing (±20% jitter)"** option enabled to spread background requests naturally.

---

## ☁️ Nextcloud & WebDAV Cross-Device Cloud Sync

PureTidings Desktop & Mobile features native, zero-middleman cloud synchronization via **Nextcloud**, **ownCloud**, **MagentaCloud**, **Hetzner Storage Share**, or any standard WebDAV server.

### 🌟 What Gets Synchronized?
- **Complete Feed & Folder Hierarchy (`feedTree`):** All custom folders, subfolders, feed assignments, and order.
- **Article States:** Read articles (`readLinks`), starred favorites (`favoritedLinks`), and AI summary drawer items (`summaryLinks`).
- **Configuration & Rules:** Keyword filter rules (`rules`), connected IMAP email inboxes (`emailAccounts`), and UI language preferences (`appLanguage`).

### ⚙️ How to Configure Nextcloud Sync
1. Open PureTidings **Settings** ⚙️ and navigate to the **Backup & OPML** tab.
2. Under **Nextcloud & WebDAV Cloud Sync**, check **"Enable Nextcloud / WebDAV Cross-Device Sync"**.
3. Fill in your server details:
   - **WebDAV Server URL:** Enter your base Nextcloud URL (e.g. `https://cloud.your-domain.com`).
   - **Username:** Your Nextcloud username (or email address).
   - **App Password / Token:** A dedicated App Password generated in your Nextcloud account (*Settings > Security > Devices & sessions > Create new app password*).
   - **Remote File Path:** The target cloud path (e.g. `/puretidings_sync.json` or `/NEXTCLOUD PureTidings sync/puretidings_sync.json`).
4. Click **"Test Connection"** to verify authentication, then click **"Sync Now"** and **"Save Settings"**.

### 🛡️ Built-in Failsafes & Resilience
- **Zero Brute-Force Triggers (`ENDPOINT_CACHE`):** Working WebDAV endpoints are cached in memory to eliminate repeated probing and avoid triggering Nextcloud's built-in Brute Force Protection (`OCA\DAV\Connector\Sabre\Exception\TooManyRequests` / HTTP 429).
- **Automatic Folder Creation (`MKCOL`):** PureTidings proactively checks and creates any missing parent directories on your server before uploading, automatically recovering from HTTP 404/409 errors.
- **Safe Desktop User-Agent:** Communicates via a standard desktop identifier (`PureTidings/1.0`), preventing antivirus heuristic false positives.
- **Set-Union Merging:** Merges article states and uses timestamp authority (`feedTreeUpdatedAt`) so changes from multiple devices merge seamlessly without data loss.

---

## 💻 Chromebook & ChromeOS Installation Guide

PureTidings runs smoothly and natively on Chromebooks:

### Method 1: Native Linux App (.deb) via Crostini (Recommended for Intel & AMD Chromebooks)
1. **Enable Linux:** Open ChromeOS **Settings** > **Advanced** > **Developers** and click **Turn On** next to **Linux development environment (Beta / Crostini)**.
2. **Download Package:** Download the latest `PureTidings_amd64.deb` from [GitHub Releases](https://github.com/Claus-Dietrich/Puretidings-Desktop/releases/latest).
3. **Move to Linux Files:** In the ChromeOS **Files** app, drag the `.deb` file into your **Linux files** folder.
4. **Install:** Double-click or right-click the file and choose **"Install with Linux"**, or open the Linux Terminal and run:
   ```bash
   sudo dpkg -i PureTidings_*_amd64.deb && sudo apt-get install -f
   ```
5. **Launch:** PureTidings will appear directly in your ChromeOS App Launcher with full window resizing, offline storage, and keyboard shortcuts.

### Method 2: Android App (.apk) via ARCVM (Recommended for ARM-based Chromebooks)
1. On ARM-based Chromebooks (MediaTek, Qualcomm Snapdragon, Rockchip), download `PureTidings_aarch64.apk` from [GitHub Releases](https://github.com/Claus-Dietrich/Puretidings-Desktop/releases/latest).
2. Install or sideload the APK through the ChromeOS Android subsystem.
3. PureTidings opens in an adaptive, resizable window supporting touch, keyboard, and mouse.

### Method 3: Building from Source in Chromebook Linux Container
To compile PureTidings directly inside your Chromebook Crostini container:
```bash
# 1. Install prerequisites
sudo apt update && sudo apt install -y curl build-essential libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev git

# 2. Install Node.js (v20 LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# 3. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source $HOME/.cargo/env

# 4. Clone and build PureTidings Desktop
git clone https://github.com/Claus-Dietrich/Puretidings-Desktop.git
cd Puretidings-Desktop
npm install
npm run tauri build
```
The compiled binary and Debian installer will be located in `src-tauri/target/release/bundle/deb/`.

---

## 🛠️ Automated Cloud Releases (Windows, macOS, Linux & Android)

The repository includes GitHub Actions release workflows in `.github/workflows/`.

Whenever a tag is pushed (e.g. `v1.0.42`) or triggered manually from GitHub's **Actions** tab:
1. **Windows Runner:** Automatically compiles the NSIS Setup `.exe` and `.msi`.
2. **macOS Runner:** Automatically compiles universal Apple Silicon & Intel DMG (`.dmg`) and App bundle.
3. **Linux Runner:** Automatically compiles portable `.AppImage`, `.deb`, and `.rpm` packages.
4. **Android Runner:** Automatically compiles and signs the standalone 64-bit ARM APK (`PureTidings_aarch64.apk`).
5. **GitHub Release:** Publishes a release with all 8 download assets ready for users.

---

## 💻 Local Development (Optional)

### Prerequisites on Windows
1. **Node.js:** v18+ (already installed)
2. **Rust & Cargo:** Installed via [rustup.rs](https://rustup.rs/) (`winget install Rustlang.Rustup`)
3. **Visual Studio C++ Build Tools:** (`winget install Microsoft.VisualStudio.2022.BuildTools`)

### Commands
```bash
cd puretidings-desktop
npm install

# Run in Development Mode
npm run dev

# Build Production Binaries (.exe / .msi)
npm run build
```
The compiled application will be located in:
`src-tauri/target/release/puretidings-desktop.exe`
and the installers in:
`src-tauri/target/release/bundle/`
