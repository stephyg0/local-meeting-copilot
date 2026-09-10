import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

// Render the desktop face proportions directly at each Chrome icon size.
// Keep a little transparent padding so Bulby does not feel oversized in taskbars.
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("chrome-extension/icons", { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const name of [16, 32, 48, 128, "desktop"]) {
    const size = name === "desktop" ? 128 : name;
    const iconSize = Math.round(size * (name === "desktop" ? 0.77 : 0.86));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>
      html,body { margin:0; width:100%; height:100%; background:transparent; }
      body { display:grid; place-items:center; }
      .face { width:${iconSize}px; height:${iconSize}px; border-radius:50%; display:flex;
        align-items:center; justify-content:center; gap:${iconSize * 3 / 28}px;
        background:linear-gradient(145deg,#78e0b1,#7aa7ff); }
      .eye { width:${iconSize * 4 / 28}px; height:${iconSize * 7 / 28}px;
        border-radius:999px; background:#0b1513; }
      </style><div class="face"><span class="eye"></span><span class="eye"></span></div>`);
    await page.screenshot({ path: `chrome-extension/icons/bulby-${name}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
