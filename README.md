# PureTidings Desktop 🚀

**PureTidings Desktop** is a high-performance, standalone RSS and content aggregator desktop application built with **Tauri v2** (Rust + Native WebView).

## ✨ Core Highlights
- **100% Local & Free:** Zero monthly server costs. All feeds, article links, and preferences stay on your machine.
- **Universal IMAP Email & Newsletters:** Connect directly to any IMAP inbox via native Rust TLS (`imap`, `mail-parser`) to read newsletters alongside RSS feeds with bidirectional read sync.
- **High-Fidelity Sandboxed Email Viewer:** Isolated iframe rendering with anti-hotlink CDN bypass (`no-referrer`), Light/Dark mode toggle, and pristine multi-format export (MD, HTML, TXT).
- **No CORS & No IP Bans:** Feed and article requests run natively via Rust (`reqwest` with `rustls`) using your residential internet connection.
- **Native Multi-Language (i18n):** Instant runtime switching between English, German, Spanish, and French.
- **BYOK Gemini AI Summaries:** Free AI-powered summaries of articles and YouTube videos (TL;DW) using your own Google Gemini API key, with 1-tap Android Native Share sheet export (`navigator.share`) and multi-format save (MD, HTML, TXT).
- **Draggable & Resizable Reader & Settings:** Free-floating modal windows with mouse and touch dragging/resizing, viewport auto-clamping, and responsive mobile landscape support.
- **Native Mobile & Desktop Notifications:** System notifications across Windows Toast, macOS, Linux, and Android status bar (`tauri-plugin-notification`).
- **External Browser Integration:** Seamless link opening in your system default browser on desktop and Android (`tauri-plugin-opener`).
- **Automated Local Backups & OPML:** Full OPML 2.0 import/export, direct clipboard/text restoration, and automated daily JSON backups to a dedicated local directory.
- **Multi-Platform Native Packages:** Automated CI/CD release builds for Windows (`.exe`, `.msi`), macOS (`.dmg` universal binary for Apple Silicon & Intel), Linux (`.AppImage`, `.deb`, `.rpm`), and Android (`.apk`).

---

## 🛠️ Automated Cloud Releases (Windows, macOS, Linux & Android)

The repository includes GitHub Actions release workflows in `.github/workflows/`.

Whenever a tag is pushed (e.g. `v1.0.38`) or triggered manually from GitHub's **Actions** tab:
1. **Windows Runner:** Automatically compiles the NSIS Setup `.exe` and `.msi`.
2. **macOS Runner:** Automatically compiles universal Apple Silicon & Intel DMG (`.dmg`) and App bundle.
3. **Linux Runner:** Automatically compiles portable `.AppImage`, `.deb`, and `.rpm` packages.
4. **Android Runner:** Automatically compiles and signs the standalone 64-bit ARM APK (`PureTidings_aarch64.apk`).
5. **GitHub Release:** Publishes a release with all 8 download assets ready for users.

### Triggering a Release via Git:
```bash
git tag v1.0.0
git push origin v1.0.0
```

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
