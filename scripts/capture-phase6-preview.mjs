import puppeteer from "puppeteer-core";

const shots = [
  ["guest-day", "phase6-01-guest-date.png"],
  ["guest-hour", "phase6-02-guest-hour.png"],
  ["guest-request", "phase6-03-guest-request.png"],
  ["host-once", "phase6-04-host-date-block.png"],
  ["host-recurring", "phase6-05-host-recurring-block.png"],
  ["guest-restricted", "phase6-06-guest-sees-block.png"],
  ["host-exception", "phase6-07-open-exception.png"],
  ["approve-plain", "phase6-08-approve-without-discount.png"],
  ["approve-percent", "phase6-09-percent-discount.png"],
  ["approve-fixed", "phase6-10-fixed-discount.png"],
  ["approve-percent", "phase6-11-fee-payout.png"],
  ["renter-amount", "phase6-12-renter-amount.png"],
  ["payment-protection", "phase6-13-payment-protection.png"],
  ["discount-audit", "phase6-14-discount-audit.png"],
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
await page.goto("http://127.0.0.1:3000/dev/approval-discount-preview", { waitUntil: "networkidle0" });
await page.waitForSelector("#guest-day");
const percentBox = await page.$("#approve-percent input[type='checkbox']");
if (percentBox) {
  await percentBox.click();
  const value = await page.$("#approve-percent input[inputmode='decimal']");
  if (value) {
    await value.click({ clickCount: 3 });
    await value.type("20");
  }
}
const text = await page.evaluate(() => document.body.innerText);
if (!/Sample data only/i.test(text) || !/Original booking amount/.test(text)) {
  throw new Error("preview did not render the sample screens");
}
for (const [id, file] of shots) {
  const element = await page.$(`#${id}`);
  if (!element) throw new Error(`missing #${id}`);
  await element.screenshot({ path: `/opt/cursor/artifacts/${file}` });
}
await browser.close();
console.log("captured", shots.length);
