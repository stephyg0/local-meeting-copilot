import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

// Render the desktop face proportions directly at each Chrome icon size.
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("chrome-extension/icons", { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>
      html,body { margin:0; width:100%; height:100%; background:transparent; }
      .face { width:100%; height:100%; border-radius:50%; display:flex;
        align-items:center; justify-content:center; gap:${size * 3 / 28}px;
        background:linear-gradient(145deg,#78e0b1,#7aa7ff); }
      .eye { width:${size * 4 / 28}px; height:${size * 7 / 28}px;
        border-radius:999px; background:#0b1513; }
      </style><div class="face"><span class="eye"></span><span class="eye"></span></div>`);
    await page.screenshot({ path: `chrome-extension/icons/bulby-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
