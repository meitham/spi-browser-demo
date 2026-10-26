import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function ready(page) {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Loaded over HTTP · parsed by SPI');
}

test('fetches a serialized object, edits the C++ object and serializes JSON', async ({page}) => {
    const response = page.waitForResponse(response => response.url().endsWith('/data/example.json'));
    await ready(page);
    expect((await response).status()).toBe(200);
    await expect(page.locator('#name')).toHaveValue('Base scenario');
    await expect(page.locator('#total')).toHaveText('1,251.00');
    await page.locator('#name').fill('Edited π scenario');
    await page.locator('#quantity').fill('3');
    await page.locator('#price').fill('12.50');
    await page.locator('#enabled').uncheck();
    await expect(page.locator('#total')).toHaveText('37.50');
    await page.getByRole('button', {name: 'JSON', exact: true}).click();
    const output = JSON.parse(await page.locator('#output').textContent());
    expect(output).toMatchObject({name: 'Edited π scenario', quantity: 3, price: 12.5, enabled: false});
    expect((await (await page.request.get('/data/example.json')).json()).name).toBe('Base scenario');
});

test('reports HTTP and SPI parse errors, retains the object, and recovers', async ({page}) => {
    await ready(page);
    await page.locator('#url').fill('./data/missing.json');
    await page.getByRole('button', {name: 'Load object'}).click();
    await expect(page.getByRole('alert')).toContainText('HTTP 404');
    await expect(page.locator('#name')).toHaveValue('Base scenario');
    await page.route('**/bad.spi', route => route.fulfill({body: 'not a serialized SPI object', contentType: 'text/plain'}));
    await page.locator('#url').fill('./bad.spi');
    await page.getByRole('button', {name: 'Load object'}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText('HTTP 404');
    await expect(page.getByRole('alert')).not.toContainText('[object Object]');
    await expect(page.getByRole('status')).toHaveText('Previous object retained.');
    await page.locator('#url').fill('./data/example.json');
    await page.getByRole('button', {name: 'Load object'}).click();
    await expect(page.getByRole('status')).toHaveText('Loaded over HTTP · parsed by SPI');
    await expect(page.getByRole('alert')).toBeHidden();
});

test('downloads SPI text and loads the same serialized object over HTTP', async ({page}) => {
    await ready(page);
    await page.locator('#name').fill('Downloaded scenario');
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Download'}).click();
    const download = await waiting;
    expect(download.suggestedFilename()).toBe('scenario.spi');
    const text = await readFile(await download.path(), 'utf8');
    expect(text).toContain('Downloaded scenario');
    await page.route('**/downloaded.spi', route => route.fulfill({body: text, contentType: 'text/plain'}));
    await page.locator('#url').fill('./downloaded.spi');
    await page.getByRole('button', {name: 'Load object'}).click();
    await expect(page.getByRole('status')).toHaveText('Loaded over HTTP · parsed by SPI');
    await expect(page.locator('#name')).toHaveValue('Downloaded scenario');
});

test('supports cancellation and displays network failures', async ({page}) => {
    await ready(page);
    const error = await page.evaluate(async () => {
        const {fromURL} = await import('/spi-client.js');
        const controller = new AbortController();
        controller.abort();
        try { const object = await fromURL('/data/example.json', {signal: controller.signal}); object.delete(); }
        catch (error) { return error.name; }
    });
    expect(error).toBe('AbortError');
    await page.route('**/offline.spi', route => route.abort());
    await page.locator('#url').fill('./offline.spi');
    await page.getByRole('button', {name: 'Load object'}).click();
    await expect(page.getByRole('alert')).toContainText('Failed to fetch');
});

test('fits a phone viewport and treats object strings as text', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await ready(page);
    await page.locator('#name').fill('<img src=x onerror=alert(1)>');
    await expect(page.locator('#output')).toContainText('<img');
    await expect(page.locator('#output img')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('explains a missing WASM build', async ({page}) => {
    await page.route('**/vendor/spi.wasm', route => route.fulfill({status: 404, body: 'missing'}));
    await page.goto('/');
    await expect(page.locator('#runtime')).toHaveText('Runtime unavailable');
    await expect(page.getByRole('status')).toContainText('npm run build');
});
