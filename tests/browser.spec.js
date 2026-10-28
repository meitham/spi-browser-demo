import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';

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
    await page.getByRole('button', {name: 'Load from URL'}).click();
    await expect(page.getByRole('alert')).toContainText('HTTP 404');
    await expect(page.locator('#name')).toHaveValue('Base scenario');
    await page.route('**/bad.spi', route => route.fulfill({body: 'not a serialized SPI object', contentType: 'text/plain'}));
    await page.locator('#url').fill('./bad.spi');
    await page.getByRole('button', {name: 'Load from URL'}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText('HTTP 404');
    await expect(page.getByRole('alert')).not.toContainText('[object Object]');
    await expect(page.getByRole('status')).toHaveText('Previous object retained.');
    await page.locator('#url').fill('./data/example.json');
    await page.getByRole('button', {name: 'Load from URL'}).click();
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
    await page.getByRole('button', {name: 'Load from URL'}).click();
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
    await page.getByRole('button', {name: 'Load from URL'}).click();
    await expect(page.getByRole('alert')).toContainText('Could not fetch the object');
});

for (const format of ['TEXT', 'JSON']) {
    test(`loads downloaded ${format} from a second HTTP server only when CORS is allowed`, async ({page}) => {
        await ready(page);
        await page.locator('#name').fill('HTTP round trip');
        if (format === 'JSON') await page.getByRole('button', {name: 'JSON', exact: true}).click();
        const waiting = page.waitForEvent('download');
        await page.getByRole('button', {name: 'Download'}).click();
        const download = await waiting;
        const body = await readFile(await download.path());
        const origin = new URL(page.url()).origin;
        let allowCORS = false;
        let requests = 0;
        const server = createServer((request, response) => {
            requests++;
            if (allowCORS) response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Cache-Control', 'no-store');
            response.end(body);
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            await page.locator('#name').fill('Current object');
            await page.locator('#url').fill(`http://127.0.0.1:${server.address().port}/${download.suggestedFilename()}`);
            await page.getByRole('button', {name: 'Load from URL'}).click();
            await expect(page.getByRole('alert')).toContainText('requires the file server to allow CORS');
            await expect(page.locator('#name')).toHaveValue('Current object');
            expect(requests).toBe(1);
            allowCORS = true;
            await page.getByRole('button', {name: 'Load from URL'}).click();
            await expect(page.getByRole('status')).toHaveText('Loaded over HTTP · parsed by SPI');
            await expect(page.locator('#name')).toHaveValue('HTTP round trip');
            await expect(page.getByRole('alert')).toBeHidden();
            expect(requests).toBe(2);
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    });
}

for (const format of ['TEXT', 'JSON']) {
    test(`reopens a downloaded ${format} file using the file picker without uploading`, async ({page}) => {
        await ready(page);
        await page.locator('#name').fill('Saved π scenario');
        await page.locator('#quantity').fill('7');
        await page.locator('#price').fill('12.50');
        await page.locator('#enabled').uncheck();
        if (format === 'JSON') await page.getByRole('button', {name: 'JSON', exact: true}).click();
        const expected = await page.locator('#output').textContent();
        const waiting = page.waitForEvent('download');
        await page.getByRole('button', {name: 'Download'}).click();
        const download = await waiting;
        const path = await download.path();
        const file = {name: download.suggestedFilename(), mimeType: 'text/plain', buffer: await readFile(path)};
        const requests = [];
        page.on('request', request => requests.push(request.url()));
        // Reopening the same file twice must also work.
        for (let i = 0; i < 2; i++) {
            await page.locator('#name').fill('Changed after download');
            const choosing = page.waitForEvent('filechooser');
            await page.getByRole('button', {name: 'Open file…', exact: true}).click();
            await (await choosing).setFiles(file);
            await expect(page.getByRole('status')).toHaveText(`Opened ${file.name} · parsed by SPI`);
            await expect(page.locator('#name')).toHaveValue('Saved π scenario');
            await expect(page.locator('#quantity')).toHaveValue('7');
            await expect(page.locator('#price')).toHaveValue('12.5');
            await expect(page.locator('#enabled')).not.toBeChecked();
            await expect(page.locator('#output')).toHaveText(expected);
        }
        expect(requests).toEqual([]);
    });
}

test('retains the current object after an invalid local file and then recovers', async ({page}) => {
    await ready(page);
    await page.locator('#file').setInputFiles({name: 'broken.spi', mimeType: 'text/plain', buffer: Buffer.from('invalid SPI text')});
    await expect(page.getByRole('status')).toHaveText('Previous object retained.');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('#name')).toHaveValue('Base scenario');
    await page.locator('#file').setInputFiles({name: 'restored.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({class: 'Map', name: 'Restored', quantity: 1, price: 2, enabled: true}))});
    await expect(page.getByRole('status')).toHaveText('Opened restored.json · parsed by SPI');
    await expect(page.locator('#name')).toHaveValue('Restored');
    await expect(page.getByRole('alert')).toBeHidden();
});

test('directs local filesystem URLs to the file picker', async ({page}) => {
    await ready(page);
    await page.locator('#url').fill('file:///Users/example/Downloads/scenario.spi');
    await page.getByRole('button', {name: 'Load from URL'}).click();
    await expect(page.getByRole('alert')).toContainText('Use Open file…');
    await expect(page.locator('#name')).toHaveValue('Base scenario');
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
