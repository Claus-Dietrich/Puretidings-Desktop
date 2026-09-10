# PureTidings Desktop 🚀

**PureTidings Desktop** is a high-performance, standalone RSS and content aggregator desktop application built with **Tauri v2** (Rust + Native WebView).

## ✨ Core Highlights
- **100% Local & Free:** Zero monthly server costs. All feeds, article links, and preferences stay on your machine.
- **No CORS & No IP Bans:** Feed requests are performed natively via Rust (`reqwest`) using your standard residential internet connection. CDNs and feed servers do not block requests.
- **Closed Binary Packaging:** Native executable (`.exe` on Windows, `.AppImage` / `.deb` on Linux) with bundled web assets.
- **Independent Distribution:** Free direct download releases without Chrome Web Store reviews or fees.
- **BYOK Gemini AI Summaries:** Free AI-powered summaries of articles and YouTube videos using your own Google Gemini API key.
- **Reader Mode:** Clean readability article extraction and YouTube player embedding.
- **Backup & OPML:** Full OPML 2.0 import/export and JSON backup/restore (compatible with PureTidings backups).

---

## 🛠️ Automated Cloud Releases (Windows & Linux)

The repository includes a GitHub Actions workflow in `.github/workflows/release.yml`.

Whenever a tag is pushed (e.g. `v1.0.0`) or triggered manually from GitHub's **Actions** tab:
1. **Windows Runner:** Automatically compiles the NSIS Setup `.exe` and `.msi`.
2. **Linux Runner:** Automatically compiles the portable `.AppImage` and `.deb` package.
3. **GitHub Release:** Publishes a release with all download files ready for users.

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
