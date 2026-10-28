// MOT-58: records docs/VERIFICATION.md's demo script from the running app as real browser video.
// Needs the dev server on 127.0.0.1:5173 and playwright-core@1.62.1 (Chromium 1234), installed outside
// this repo: npm i playwright-core@1.62.1 in a scratch folder, then node record-demo.mjs <outDir>.
// Convert: ffmpeg -i demo.webm -vf scale=1280:-2,fps=24 -c:v libx264 -crf 30 -pix_fmt yuv420p docs/MOT-58-demo.mp4
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: OUT, size: { width: 1600, height: 900 } }, acceptDownloads: true });
const page = await context.newPage();
const pause = (ms) => page.waitForTimeout(ms);
const caption = async (text) => page.evaluate((t) => {
  let el = document.getElementById('demo-caption');
  if (!el) {
    el = document.createElement('div'); el.id = 'demo-caption';
    el.style.cssText = 'position:fixed;left:20px;bottom:20px;z-index:99;background:#000;color:#fff;font:600 15px "IBM Plex Sans",sans-serif;padding:10px 14px;border-radius:10px;max-width:640px';
    document.body.appendChild(el);
  }
  el.textContent = 'Demo, recorded from the running app · ' + t;
}, text);
const go = async (text) => { await caption(text); await pause(700); };

await page.goto('http://127.0.0.1:5173/?view=trip');
await page.waitForSelector('text=Make this my trip');
await go('First screen: traveler, host, tour guide'); await pause(2500);

await page.click('text=Make this my trip');
await page.waitForSelector('text=Saturday walk');
await go('Sample trip: five lanes, trip brief, sample photos'); await pause(3500);

await page.getByRole('button', { name: 'Saturday walk', exact: true }).click();
await go('Edit a card: notes, day, time, who can see it');
await page.getByRole('textbox', { name: 'Day', exact: true }).fill('2026-10-28');
await page.getByRole('textbox', { name: 'Time', exact: true }).fill('16:00');
await pause(1200);
await page.getByRole('button', { name: 'Done', exact: true }).click();
await pause(1500);
await page.getByRole('button', { name: 'Today', exact: true }).click();
await go('Today: cards for today in the trip time zone'); await pause(3000);
await page.getByRole('button', { name: 'Board', exact: true }).click();

await caption('Review changes: labeled test adapter, Stop');
await page.click('text=Review sample changes');
await pause(400);
await page.getByRole('button', { name: 'Stop', exact: true }).click(); await pause(2500);
await page.getByRole('button', { name: 'Try again', exact: true }).click();
await page.waitForSelector('text=2 suggested changes');
await go('Peek: tool called, sources, exact operation');
await page.getByRole('button', { name: /Peek details/ }).first().click(); await pause(2500);
await page.getByRole('button', { name: /Apply 1 selected/ }).click();
await go('Applied one change; Undo removes only it'); await pause(1500);
await page.locator('.m-toast-action').click(); await pause(2000);
const close = page.getByRole('button', { name: 'Close review' });
if (await close.count()) await close.click();

await page.getByRole('button', { name: /Switch board/ }).click();
await page.getByRole('menuitem', { name: 'Start a new board' }).click();
await page.getByRole('button', { name: 'Create a guest copy' }).click();
await page.waitForSelector('text=Talat Noi welcome guide');
await go('Host guide: three lanes, Guide / Stay only / Private'); await pause(2500);
await page.getByRole('button', { name: 'Create a guest copy' }).click();
await page.locator('.mot-include label', { hasText: 'Riverside afternoon' }).locator('input').click();
await go('Create a guest copy: tick what the guest gets'); await pause(2500);
await page.getByRole('button', { name: 'Create guest copy', exact: true }).click();
await go('Guest copy: only the ticked guide cards'); await pause(3000);

await page.getByRole('button', { name: /Switch board/ }).click();
await page.getByRole('menuitem', { name: /Bangkok, our way/ }).first().click();
await page.getByRole('button', { name: 'Keepsakes', exact: true }).click();
await go('Keepsakes: postcard from a trip photo'); await pause(2500);
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Download postcard' }).click();
await (await dl).saveAs(join(OUT, 'postcard.png'));
await pause(2500);

await page.getByRole('button', { name: 'Board', exact: true }).click();
await page.getByRole('button', { name: /Export ZIP/ }).click();
await go('Export: full backup, or a copy to share'); await pause(3000);
await page.keyboard.press('Escape');
await go('Saved on this device. Muse not connected.'); await pause(2500);

await context.close();
await browser.close();
const video = readdirSync(OUT).find((f) => f.endsWith('.webm'));
renameSync(join(OUT, video), join(OUT, 'demo.webm'));
console.log('ok', join(OUT, 'demo.webm'));
