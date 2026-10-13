// Ad-hoc Playwright script: open any URL, print the title and console errors, save a screenshot.
//   cd e2e && node adhoc.js https://markusbaumg.github.io/jahgenda/ [shot.png] [--phone]
// Copy and extend it for one-off checks; it uses the same browser as the test suite.
const { chromium, devices } = require("@playwright/test");

(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [url = "http://127.0.0.1:5500/", out = "adhoc.png"] = args;
  const phone = process.argv.includes("--phone");
  const browser = await chromium.launch();
  const context = await browser.newContext(
    phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 800 } },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console.error:", m.text()));
  await page.goto(url, { waitUntil: "networkidle" });
  console.log("title:", await page.title());
  await page.screenshot({ path: out, fullPage: true });
  console.log("screenshot:", out);
  await browser.close();
})();
