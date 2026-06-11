/**
 * Branded splash window — shown while the web app loads.
 *
 * Conek-teal card with the Conek AI logo, a shine sweep across the
 * wordmark, a pulsing halo glow, and loading dots. Self-contained: the logo
 * is inlined as base64 and the page is loaded from a data: URL, so nothing
 * extra needs to resolve at runtime (works identically packaged and in dev).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { BrowserWindow, app } from "electron";

const SPLASH_WIDTH = 460;
const SPLASH_HEIGHT = 320;

function loadLogoBase64(): string | null {
  try {
    const logoPath = path.join(app.getAppPath(), "assets", "splash-logo.png");
    return readFileSync(logoPath).toString("base64");
  } catch (err) {
    console.warn(
      "[splash] Logo asset missing — splash will be text-only:",
      err,
    );
    return null;
  }
}

function buildSplashHtml(): string {
  const logoBase64 = loadLogoBase64();
  const logoSrc = logoBase64 ? `data:image/png;base64,${logoBase64}` : "";

  const logoMarkup = logoBase64
    ? `<div class="logo-wrap">
         <img class="logo" src="${logoSrc}" alt="Conek AI" draggable="false" />
         <div class="shine" style="-webkit-mask-image:url('${logoSrc}')"></div>
       </div>`
    : `<div class="logo-text">Conek AI</div>`;

  return /* html */ `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  html, body { background: transparent; overflow: hidden; }
  body {
    width: ${SPLASH_WIDTH}px;
    height: ${SPLASH_HEIGHT}px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-app-region: drag;
  }

  /* Pulsing halo glow bleeding into the transparent window edge */
  .halo {
    position: absolute;
    width: 400px;
    height: 250px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(53, 191, 198, 0.45), transparent 65%);
    filter: blur(36px);
    animation: halo-pulse 2.6s ease-in-out infinite;
  }
  @keyframes halo-pulse {
    0%, 100% { opacity: 0.55; transform: scale(0.92); }
    50%      { opacity: 1;    transform: scale(1.06); }
  }

  /* Brand card — near-black with the teal wordmark for maximum legibility */
  .card {
    position: relative;
    width: 380px;
    height: 240px;
    border-radius: 24px;
    border: 1px solid rgba(53, 191, 198, 0.25);
    background: linear-gradient(160deg, #232323 0%, #161616 55%, #0d0d0d 100%);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    overflow: hidden;
    animation: card-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  @keyframes card-in {
    from { opacity: 0; transform: scale(0.86) translateY(14px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Soft teal light rays inside the card, like the app background */
  .card::before {
    content: "";
    position: absolute;
    inset: -40%;
    background:
      conic-gradient(from 200deg at 30% -10%,
        transparent 0deg, rgba(53, 191, 198, 0.14) 8deg, transparent 18deg,
        transparent 40deg, rgba(53, 191, 198, 0.09) 50deg, transparent 62deg);
    animation: rays-drift 7s ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes rays-drift {
    from { transform: rotate(-3deg); }
    to   { transform: rotate(4deg); }
  }

  .logo-wrap { position: relative; width: 290px; }
  .logo { width: 100%; display: block; }

  /* Shine sweep masked to the logo pixels so it tracks the letterforms */
  .shine {
    position: absolute;
    inset: 0;
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    background: linear-gradient(115deg,
      transparent 30%,
      rgba(255, 255, 255, 0.95) 48%,
      rgba(255, 255, 255, 0.95) 52%,
      transparent 70%);
    background-size: 260% 100%;
    background-repeat: no-repeat;
    animation: shine-sweep 2.4s ease-in-out infinite;
  }
  @keyframes shine-sweep {
    0%       { background-position: 130% 0; }
    55%, 100% { background-position: -130% 0; }
  }

  .logo-text {
    font-size: 52px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #35bfc6;
  }

  /* Loading dots — teal pellets on the dark card */
  .dots { display: flex; gap: 10px; }
  .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #35bfc6;
    box-shadow: 0 0 8px rgba(53, 191, 198, 0.45);
    opacity: 0.4;
    animation: dot-bounce 1.2s ease-in-out infinite;
  }
  .dots span:nth-child(2) { animation-delay: 0.15s; }
  .dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes dot-bounce {
    0%, 60%, 100% { opacity: 0.4; transform: translateY(0) scale(1); }
    30%           { opacity: 1;   transform: translateY(-6px) scale(1.12); }
  }

  /* Fade-out, triggered from the main process before close */
  body.fade-out .card  { animation: card-out 0.32s ease-in both; }
  body.fade-out .halo  { transition: opacity 0.32s ease-in; opacity: 0 !important; }
  @keyframes card-out {
    to { opacity: 0; transform: scale(1.05); }
  }
</style>
</head>
<body>
  <div class="halo"></div>
  <div class="card">
    ${logoMarkup}
    <div class="dots"><span></span><span></span><span></span></div>
  </div>
</body>
</html>`;
}

export function createSplashWindow(): BrowserWindow {
  const splash = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    center: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splash.setMenuBarVisibility(false);
  void splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(buildSplashHtml())}`,
  );
  return splash;
}

/** Fade the splash out, then destroy it. Safe to call once. */
export function dismissSplash(splash: BrowserWindow | null): void {
  if (!splash || splash.isDestroyed()) return;
  void splash.webContents
    .executeJavaScript(`document.body.classList.add("fade-out"); true;`)
    .catch(() => undefined);
  setTimeout(() => {
    if (!splash.isDestroyed()) splash.destroy();
  }, 340);
}
