const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const jar = process.env.AE2WEB_RELEASE_JAR;
const root = path.resolve(__dirname, '..');
const key = 'AAAAAAAAAAAAAAAAAAAAAA';
const renamedKey = 'BBBBBBBBBBBBBBBBBBBBBA';
const unsafeKey = 'CCCCCCCCCCCCCCCCCCCCCA';

test(
    'official released UI: Chinese names/search, safe HTML, unchanged crafting POST and browser-only rollback',
    { skip: !jar, timeout: 60000 },
    async (t) => {
        const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || '../../ui-tests/node_modules/playwright');
        const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json')));
        assert.equal(
            crypto.createHash('sha256').update(fs.readFileSync(jar)).digest('hex'),
            provenance.releaseJarSha256
        );
        const html = execFileSync(
            'python3',
            [
                '-c',
                'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("assets/webpage.html"))',
                jar
            ],
            { encoding: 'utf8' }
        )
            .replace('https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js', '/jquery.js')
            // The HTTP server fills these three template fields for each authenticated page.
            .replaceAll('_REPLACE_ME_USERNAME', 'TestPlayer')
            .replaceAll('_REPLACE_ME_IS_ADMIN', 'false')
            .replaceAll('_REPLACE_ME_VERSION_OUTDATED', 'false');
        const jquery = fs.readFileSync(require.resolve('jquery/dist/jquery.min.js'));
        const resources = [
            { itemKey: key, itemid: 'minecraft:iron_ingot', itemname: 'Iron Ingot', quantity: 64, craftable: true },
            {
                itemKey: renamedKey,
                itemid: 'minecraft:iron_ingot',
                itemname: 'My renamed ingot',
                quantity: 1,
                craftable: false
            },
            { itemKey: unsafeKey, itemid: 'test:special', itemname: 'Special item', quantity: 8, craftable: false }
        ];
        const requests = [];
        const server = http.createServer(async (request, response) => {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString();
            const url = new URL(request.url, 'http://localhost');
            requests.push({ path: url.pathname, method: request.method, body, headers: request.headers });
            if (url.pathname === '/') {
                response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
                return;
            }
            if (url.pathname === '/jquery.js') {
                response.writeHead(200, { 'Content-Type': 'application/javascript' }).end(jquery);
                return;
            }
            let data;
            if (url.pathname === '/api/grids')
                data = [{ key, owner: 'TestPlayer', cpuCount: 0, isTrackingEnabled: false, accessSources: {} }];
            else if (url.pathname.endsWith('/items')) data = resources;
            else if (url.pathname.endsWith('/cpus')) data = {};
            else if (request.method === 'POST' && url.pathname.endsWith('/crafting-plans')) data = { jobID: 0 };
            else if (url.pathname === '/icon') data = [];
            else {
                response.writeHead(404).end();
                return;
            }
            response
                .writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
                .end(JSON.stringify({ status: 'OK', data }));
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        t.after(() => new Promise((resolve) => server.close(resolve)));
        const browser = await chromium.launch({ headless: true });
        t.after(() => browser.close());
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
        await page.route('https://cdn.jsdelivr.net/npm/chart.js', (route) => route.abort());
        await page.addInitScript({ path: path.join(root, 'ae2web-names.user.js') });
        const base = `http://127.0.0.1:${server.address().port}/`;
        await page.goto(base);
        const panel = page.locator('#ae2web-local-names');
        await panel.getByRole('button', { name: '开启中文名', exact: true }).waitFor();
        await page.locator('#currentgrid').click();
        await page.locator('#gridselection').selectOption(key);
        await page.locator('#terminalcontent').getByText('Iron Ingot', { exact: true }).waitFor();
        assert.equal(await panel.getByRole('button', { name: '开启中文名', exact: true }).isDisabled(), true);
        const names = {
            formatVersion: 1,
            targetMod: '1.2.0-pre-forge-1.20.1',
            identityContract: 'ae2wi-1.2.0-pre-forge-1.20.1',
            minecraftVersion: '1.20.1',
            language: 'zh_cn',
            entries: [
                { key, itemid: 'minecraft:iron_ingot', name: '铁锭' },
                {
                    key: unsafeKey,
                    itemid: 'test:special',
                    name: '<img src=x onerror="window.name=\'injected\'">铜 & 铁'
                }
            ]
        };
        await panel
            .getByLabel('导入中文名称表')
            .setInputFiles({
                name: 'names.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(names))
            });
        await panel
            .getByRole('status')
            .getByText(/名称表已导入/)
            .waitFor();
        await panel.getByRole('button', { name: '开启中文名', exact: true }).click();
        await panel
            .getByRole('status')
            .getByText(/设置已保存/)
            .waitFor();
        await page.reload();
        await panel.getByRole('button', { name: '关闭中文名', exact: true }).waitFor();
        await page.locator('#currentgrid').click();
        await page.locator('#gridselection').selectOption(key);
        await page.locator('#terminalcontent').getByText('铁锭', { exact: true }).waitFor();
        await page.locator('#terminalcontent').getByText('My renamed ingot', { exact: true }).waitFor();
        assert.equal(await page.locator('#terminalcontent img[src="x"]').count(), 0);
        assert.equal(await page.evaluate('window.name'), '');
        const search = page.getByRole('textbox', { name: 'Search terminal items' });
        await search.fill('铁锭');
        await search.dispatchEvent('keyup');
        assert.equal(await page.locator('#terminalcontent td.storage').count(), 1);
        assert.match(await page.locator('#terminalcontent').innerText(), /Stored: 64/);
        page.once('dialog', (dialog) => dialog.accept('7'));
        const order = page.waitForRequest(
            (request) => request.method() === 'POST' && request.url().endsWith('/crafting-plans')
        );
        await page.locator('#terminalcontent').getByRole('button', { name: 'order', exact: true }).click();
        const sent = await order;
        assert.deepEqual(sent.postDataJSON(), { itemKey: key, quantity: 7 });
        assert.equal(sent.headers()['x-ae2-request'], 'true');
        await panel.getByRole('button', { name: '关闭中文名', exact: true }).click();
        await panel
            .getByRole('status')
            .getByText(/设置已保存/)
            .waitFor();
        await page.reload();
        await panel.getByRole('button', { name: '开启中文名', exact: true }).waitFor();
        await page.locator('#currentgrid').click();
        await page.locator('#gridselection').selectOption(key);
        await page.locator('#terminalcontent').getByText('Iron Ingot', { exact: true }).waitFor();
        assert.deepEqual(errors, []);
        const mutations = requests.filter((request) => request.method !== 'GET');
        assert.equal(mutations.length, 1);
        assert.equal(mutations[0].path, `/api/grids/${key}/crafting-plans`);
        assert.deepEqual(JSON.parse(mutations[0].body), { itemKey: key, quantity: 7 });
    }
);
