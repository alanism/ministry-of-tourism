// Shared selectors for the actual R4 destination and Export surfaces.
const assert = require('node:assert/strict');

async function createTripThroughDestination(page, { city, country = 'Spain', registry = false }) {
  await page.getByRole('button', { name: 'Make this my trip', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Choose destination', exact: true });
  await picker.getByRole('combobox', { name: 'Destination city', exact: true }).fill(city);
  if (registry) {
    // Source-dependent tests choose an explicit registry ID, never infer identity from the typed city.
    await picker.getByRole('option').filter({ hasText: city }).filter({ hasNotText: 'as you typed it' }).click();
  } else {
    await picker.getByRole('option').filter({ hasText: `Use “${city}” as you typed it` }).click();
    await picker.getByRole('searchbox', { name: 'Country', exact: true }).fill(country);
    await picker.getByRole('group', { name: 'Countries', exact: true })
      .getByRole('button', { name: country, exact: true }).click();
  }
  await picker.getByRole('heading', { name: `${city}, ${country}`, exact: true }).waitFor();
  await picker.getByRole('button', { name: 'Create trip', exact: true }).click();
  await page.getByRole('button', { name: 'Composition', exact: true }).waitFor();
}

async function openExport(page) {
  await page.getByRole('navigation', { name: 'Trip views', exact: true })
    .getByRole('button', { name: 'Export', exact: true }).click();
  const surface = page.getByRole('region', { name: 'Export your trip', exact: true });
  await surface.waitFor();
  assert.equal(await surface.getByRole('checkbox', { name: 'Include private content', exact: true }).isChecked(), false);
  return surface;
}

async function exportThroughSurface(page, format) {
  const surface = await openExport(page);
  const card = surface.getByRole('article', {
    name: format === 'pdf' ? 'Magazine PDF' : 'Editable package', exact: true,
  });
  await card.getByRole('button', {
    name: format === 'pdf' ? 'Export PDF' : 'Export package', exact: true,
  }).click();
  await card.getByText(/^Download ready/).waitFor({ timeout: 60000 });
  const details = card.getByText('For agents · the same real artifact', { exact: true }).locator('..');
  const receipt = JSON.parse(await details.locator('pre').textContent());
  assert.equal(receipt.downloadReady, true);
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.scope, 'stay');
  return { card, receipt };
}

module.exports = { createTripThroughDestination, openExport, exportThroughSurface };
