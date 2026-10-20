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
const cpuKey = 'test/cpu:1';

for (const chineseUi of [false, true])
    test(
        `official released UI (${chineseUi ? 'Chinese' : 'English'}): names/search, safe HTML, unchanged crafting POST and rollback`,
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
                else if (url.pathname.endsWith('/cpus'))
                    data = { [cpuKey]: { name: 'Refresh', isBusy: false, availableStorage: 4096, coProcessors: 2 } };
                else if (request.method === 'POST' && url.pathname.endsWith('/crafting-plans')) data = { jobID: 12 };
                else if (url.pathname.endsWith('/crafting-plans/12'))
                    data = {
                        isDone: true,
                        isSimulating: false,
                        bytesTotal: 1024,
                        plan: [{ ...resources[0], missing: 0, requested: 7, steps: 1, stored: 64, usedPercent: 0.5 }]
                    };
                else if (url.pathname.endsWith('/submit') || url.pathname.endsWith('/cancel')) data = {};
                else if (url.pathname.endsWith(`/cpus/${encodeURIComponent(cpuKey)}`))
                    data = {
                        finalOutput: { ...resources[0], quantity: 7 },
                        items: [{ ...resources[0], active: 2, pending: 5, stored: 64 }]
                    };
                else if (url.pathname.endsWith('/crafting-history'))
                    data = [{ id: 9, finalOutput: resources[0], timeStarted: 1000, timeDone: 3000 }];
                else if (url.pathname.endsWith('/crafting-history/9'))
                    data = {
                        finalOutput: resources[0],
                        timeStarted: 1000,
                        timeDone: 3000,
                        items: [{ ...resources[0], craftedTotal: 7, timeSpentOn: 1000, craftsPerSec: 7 }],
                        interfaceShare: []
                    };
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
            await page.addInitScript({
                content:
                    (chineseUi
                        ? ''
                        : 'localStorage.setItem(`ae2web-ui-language:${location.origin}${new URL("./", location.href).pathname}`, "off");\n') +
                    fs.readFileSync(path.join(root, 'ae2web-names.user.js'), 'utf8')
            });
            const base = `http://127.0.0.1:${server.address().port}/`;
            await page.goto(base);
            const panel = page.locator('#ae2web-local-names');
            const launcher = page.locator('#ae2web-local-names-button');
            await launcher.waitFor();
            assert.equal(await panel.isHidden(), true);
            assert.equal(await page.locator('body > footer').isHidden(), true);
            assert.equal(
                await page.locator('#terminalsubcontainersettings > section > #ae2web-local-names-button').count(),
                1
            );
            await launcher.click();
            assert.equal(await launcher.getAttribute('aria-expanded'), 'true');
            await panel.getByRole('button', { name: '显示底部信息栏', exact: true }).click();
            assert.equal(await page.locator('body > footer').isVisible(), true);
            assert.equal(
                await page.locator('body > footer a').first().getAttribute('href'),
                'https://github.com/kuba6000/AE2-Web-Integration'
            );
            await page.reload();
            await panel.getByRole('button', { name: '隐藏底部信息栏', exact: true }).waitFor();
            assert.equal(await page.locator('body > footer').isVisible(), true);
            await panel.getByRole('button', { name: '隐藏底部信息栏', exact: true }).click();
            await panel.getByRole('button', { name: '收起中文显示设置', exact: true }).click();
            assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
            assert.equal(await launcher.evaluate((element) => element === element.ownerDocument.activeElement), true);
            await page.reload();
            await launcher.waitFor();
            assert.equal(await panel.isHidden(), true);
            assert.equal(await page.locator('body > footer').isHidden(), true);
            await launcher.click();
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
            await panel.getByLabel('导入中文名称表').setInputFiles({
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
            await panel.getByRole('button', { name: '收起中文显示设置', exact: true }).focus();
            await page.keyboard.press('Escape');
            assert.equal(await panel.isHidden(), true);
            assert.equal(await page.locator('#terminalcontent').getByText('铁锭', { exact: true }).isVisible(), true);
            await launcher.click();
            await page.locator('#terminalcontent').getByText('My renamed ingot', { exact: true }).waitFor();
            assert.equal(await page.locator('#terminalcontent img[src="x"]').count(), 0);
            assert.equal(await page.evaluate('window.name'), '');
            const search = page.getByRole('textbox', { name: chineseUi ? '搜索终端物品' : 'Search terminal items' });
            await search.fill('铁锭');
            await search.dispatchEvent('keyup');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 1);
            assert.match(await page.locator('#terminalcontent').innerText(), chineseUi ? /库存：64/ : /Stored: 64/);
            for (const query of ['tieding', 'TD', 'ding', 'tie ding', 'tied', 'tiědìng']) {
                await search.fill(query);
                await search.dispatchEvent('keyup');
                assert.equal(await page.locator('#terminalcontent td.storage').count(), 1, query);
                await page.locator('#terminalcontent').getByText('铁锭', { exact: true }).waitFor();
            }
            await search.fill('tongding');
            await search.dispatchEvent('keyup');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 0);
            await search.fill('td');
            await search.dispatchEvent('keyup');
            for (const count of [0, 1, 1]) {
                await page.locator('#storedCraftableButton').click();
                assert.equal(await page.locator('#terminalcontent td.storage').count(), count);
            }
            for (const count of [1, 0, 1]) {
                await page.locator('#itemsFluidsButton').click();
                assert.equal(await page.locator('#terminalcontent td.storage').count(), count);
            }
            if (chineseUi) {
                const benchmark = await page.evaluate(`(() => {
                    const previous = filteringOptions.searchString;
                    const names = ['铁锭', '铜锭', '重型钢板', 'ME 64k 存储元件', '熔融铝'];
                    const items = Array.from({length: 21242}, (_, i) => ({itemname: names[i % 5], itemid: 'test:sample', craftable: true}));
                    const start = performance.now();
                    filteringOptions.searchString = 'tieding';
                    const full = items.filter(shouldDisplay).length;
                    const first = performance.now();
                    filteringOptions.searchString = 'td';
                    const initials = items.filter(shouldDisplay).length;
                    const done = performance.now();
                    filteringOptions.searchString = previous;
                    return {full, initials, firstMs: first-start, cachedNamesMs: done-first};
                })()`);
                assert.equal(benchmark.full, 4249);
                assert.equal(benchmark.initials, 8498);
                t.diagnostic(`Local Chromium search benchmark (21,242 synthetic items): ${JSON.stringify(benchmark)}`);
            }
            const searchMode = panel.getByLabel('搜索模式', { exact: true });
            await search.fill('tpdk');
            await search.dispatchEvent('keyup');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 0);
            await searchMode.selectOption('xiaohe');
            assert.equal(
                await page.locator('#terminalcontent td.storage').count(),
                1,
                'mode change reapplies the query without a keypress'
            );
            await search.fill('tpdb');
            await search.dispatchEvent('keyup');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 0);
            await panel.locator('details > summary').click();
            const fuzzyIng = panel.getByLabel('in / ing', { exact: true });
            await fuzzyIng.check();
            assert.equal(
                await page.locator('#terminalcontent td.storage').count(),
                1,
                'fuzzy change reapplies the same query'
            );
            await fuzzyIng.uncheck();
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 0);
            await fuzzyIng.check();
            await page.reload();
            await panel.getByRole('button', { name: '关闭中文名', exact: true }).waitFor();
            assert.equal(await searchMode.inputValue(), 'xiaohe');
            assert.equal(await fuzzyIng.isChecked(), true);
            await page.locator('#currentgrid').click();
            await page.locator('#gridselection').selectOption(key);
            await page.locator('#terminalcontent').getByText('铁锭', { exact: true }).waitFor();
            await search.fill('tpdb');
            await search.dispatchEvent('keyup');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 1);
            for (const count of [0, 1, 1]) {
                await page.locator('#storedCraftableButton').click();
                assert.equal(await page.locator('#terminalcontent td.storage').count(), count);
            }
            await searchMode.selectOption('pinyin');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 0);
            await searchMode.selectOption('xiaohe');
            assert.equal(await page.locator('#terminalcontent td.storage').count(), 1);
            page.once('dialog', (dialog) => {
                assert.equal(dialog.message(), chineseUi ? '请输入要合成的数量：' : 'How much to order?');
                assert.equal(dialog.defaultValue(), '1');
                return dialog.accept('7');
            });
            const order = page.waitForRequest(
                (request) => request.method() === 'POST' && request.url().endsWith('/crafting-plans')
            );
            await page
                .locator('#terminalcontent')
                .getByRole('button', { name: chineseUi ? '下单' : 'order', exact: true })
                .click();
            const sent = await order;
            assert.deepEqual(sent.postDataJSON(), { itemKey: key, quantity: 7 });
            assert.equal(sent.headers()['x-ae2-request'], 'true');
            await page
                .locator('#terminalJobHeaderText')
                .getByRole('button', { name: chineseUi ? '开始' : 'Start', exact: true })
                .waitFor();
            assert.match(await page.locator('#terminalcontent').innerText(), chineseUi ? /需要合成：7/ : /To craft: 7/);
            await searchMode.selectOption('pinyin');
            assert.match(
                await page.locator('#terminalcontent').innerText(),
                chineseUi ? /需要合成：7/ : /To craft: 7/,
                'changing preferences must not replace an open plan'
            );
            await searchMode.selectOption('xiaohe');
            const cpuButton = page.locator('#terminalCPUListForJob button');
            assert.match(await cpuButton.innerText(), /^Refresh\n/);
            assert.match(await cpuButton.innerText(), chineseUi ? /2 个协处理器/ : /2 Co-Procs/);
            await cpuButton.click();
            const submit = page.waitForRequest(
                (request) => request.method() === 'POST' && request.url().endsWith('/submit')
            );
            await page
                .locator('#terminalJobHeaderText')
                .getByRole('button', { name: chineseUi ? '开始' : 'Start', exact: true })
                .click();
            assert.deepEqual((await submit).postDataJSON(), { cpuKey });
            await page
                .locator('#terminalTerminalHeader')
                .getByRole('button', { name: chineseUi ? '合成状态' : 'Crafting', exact: true })
                .click();
            await page
                .locator('#terminalCPUHeaderText')
                .getByText(chineseUi ? /^Refresh：正在合成 铁锭 x7$/ : /^Refresh: Crafting 铁锭 x7$/)
                .waitFor();
            assert.match(
                await page.locator('#terminalCPUHeaderText').innerText(),
                chineseUi ? /^Refresh：正在合成 铁锭 x7$/ : /^Refresh: Crafting 铁锭 x7$/
            );
            assert.match(await page.locator('#terminalcontent').innerText(), chineseUi ? /待处理：5/ : /Scheduled: 5/);
            const cancel = page.waitForRequest(
                (request) => request.method() === 'POST' && request.url().endsWith('/cancel')
            );
            await page.locator('#cancelJobOnCPUButton').click();
            assert.equal(
                new URL((await cancel).url()).pathname,
                `/api/grids/${key}/cpus/${encodeURIComponent(cpuKey)}/cancel`
            );
            await page
                .locator('#terminalCPUHeader')
                .getByRole('button', { name: chineseUi ? '终端' : 'Terminal', exact: true })
                .click();
            await page
                .locator('#terminalTerminalHeader')
                .getByRole('button', { name: chineseUi ? '合成记录' : 'Crafting History', exact: true })
                .click();
            await page.locator('#terminalcontent td.button').waitFor();
            assert.match(
                await page.locator('#terminalcontent').innerText(),
                chineseUi ? /合成任务： 铁锭 x64/ : /Job for 铁锭 x64/
            );
            await page.locator('#terminalcontent td.button').click();
            await page
                .locator('#toggleInterfaceShare')
                .getByText(chineseUi ? '显示接口使用图表' : 'Show interface usage chart', { exact: true })
                .waitFor();
            assert.match(
                await page.locator('#terminalHistoryDetails').innerText(),
                chineseUi ? /开始时间：/ : /Started:/
            );
            await page
                .locator('#terminalHistoryHeader')
                .getByRole('button', { name: chineseUi ? '终端' : 'Terminal', exact: true })
                .click();
            if (chineseUi) {
                // The original mobile page collapses its settings column independently.
                await panel.getByRole('button', { name: '收起中文显示设置', exact: true }).click();
                if (process.env.AE2WEB_SCREENSHOT_DIR) {
                    fs.mkdirSync(process.env.AE2WEB_SCREENSHOT_DIR, { recursive: true });
                    await page.screenshot({
                        path: path.join(process.env.AE2WEB_SCREENSHOT_DIR, 'terminal-collapsed.png')
                    });
                }
                await page.setViewportSize({ width: 390, height: 844 });
                await page.locator('#terminalsubcontainersettings > button.collapsible').click();
                await launcher.click();
                await panel.locator('details > summary').click();
                assert.equal(await panel.getByRole('checkbox').count(), 10);
                assert.equal(await panel.getByLabel('in / ing', { exact: true }).isChecked(), true);
                const bounds = await panel.boundingBox();
                assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
                assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 844);
                if (process.env.AE2WEB_SCREENSHOT_DIR)
                    await page.screenshot({
                        path: path.join(process.env.AE2WEB_SCREENSHOT_DIR, 'terminal-mobile.png')
                    });
                await page.setViewportSize({ width: 1280, height: 720 });
                if (process.env.AE2WEB_SCREENSHOT_DIR)
                    await page.screenshot({
                        path: path.join(process.env.AE2WEB_SCREENSHOT_DIR, 'terminal-expanded.png')
                    });
                await panel.getByRole('button', { name: '关闭界面汉化', exact: true }).click();
                await page.getByRole('textbox', { name: 'Search terminal items' }).waitFor();
                await page.reload();
                await panel.getByRole('button', { name: '开启界面汉化', exact: true }).waitFor();
                await page.locator('#currentgrid').click();
                await page.locator('#gridselection').selectOption(key);
                await page.locator('#terminalcontent').getByText('铁锭', { exact: true }).waitFor();
                await page.locator('#terminalcontent').getByRole('button', { name: 'order', exact: true }).waitFor();
                await panel.getByRole('button', { name: '开启界面汉化', exact: true }).click();
                await page.getByRole('textbox', { name: '搜索终端物品' }).waitFor();
            }
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
            assert.equal(mutations.length, 3);
            assert.equal(mutations[0].path, `/api/grids/${key}/crafting-plans`);
            assert.deepEqual(JSON.parse(mutations[0].body), { itemKey: key, quantity: 7 });
            assert.equal(mutations[1].path, `/api/grids/${key}/crafting-plans/12/submit`);
            assert.deepEqual(JSON.parse(mutations[1].body), { cpuKey });
            assert.equal(mutations[2].body, '');
            for (const mutation of mutations) assert.equal(mutation.headers['x-ae2-request'], 'true');
        }
    );

test(
    'official login UI: Chinese labels and registration warning preserve form fields and auth command',
    { skip: !jar, timeout: 60000 },
    async (t) => {
        const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || '../../ui-tests/node_modules/playwright');
        const html = execFileSync(
            'python3',
            [
                '-c',
                'import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read("assets/login.html"))',
                jar
            ],
            { encoding: 'utf8' }
        ).replace('_REPLACE_ME_IS_PUBLIC_MODE', 'true');
        const posts = [];
        const server = http.createServer(async (request, response) => {
            if (request.method === 'POST') {
                const chunks = [];
                for await (const chunk of request) chunks.push(chunk);
                posts.push(Buffer.concat(chunks).toString());
                response.writeHead(204).end();
            } else response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        t.after(() => new Promise((resolve) => server.close(resolve)));
        const browser = await chromium.launch({ headless: true });
        t.after(() => browser.close());
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
        await page.addInitScript({ path: path.join(root, 'ae2web-names.user.js') });
        const base = `http://127.0.0.1:${server.address().port}/`;
        await page.goto(base + '?INVALID_PASSWORD');
        await page.getByRole('button', { name: '接受 Cookie', exact: true }).click();
        assert.equal(await page.locator('#ae2web-local-names').isHidden(), true);
        assert.equal(await page.locator('body > footer').isHidden(), true);
        assert.equal((await page.locator('#maininfo').innerText()).trim(), '密码错误！');
        assert.equal(await page.title(), 'AE2 网页终端');
        assert.match(
            await page.locator('label[for=remainder]').innerText(),
            /我理解：继续操作后，\s*服务器所有者将能看到上方输入的密码！/
        );
        await page.locator('#username').fill('Refresh');
        await page.locator('#password').fill('Settings');
        await page.locator('#remember').check();
        const login = page.waitForRequest((request) => request.method() === 'POST');
        await page.locator('#formlogin').getByRole('button', { name: '登录', exact: true }).click();
        assert.deepEqual(Object.fromEntries(new URLSearchParams((await login).postData())), {
            username: 'Refresh',
            password: 'Settings',
            remember: 'on'
        });
        await page.locator('#rusername').fill('Controller');
        await page.locator('#rpassword').fill('Continue');
        await page.locator('#remainder').check();
        const registration = page.waitForRequest((request) => request.method() === 'POST');
        await page.locator('#formregister').getByRole('button', { name: '继续', exact: true }).click();
        assert.deepEqual(Object.fromEntries(new URLSearchParams((await registration).postData())), {
            register: 'Controller',
            password: 'Continue',
            remainder: 'on'
        });
        await page.goto(base + '?confirmregistration&token=Settings-Refresh-TestToken');
        assert.match(
            await page.locator('#maininfo').innerText(),
            /请在游戏内输入以下命令完成注册：\n\/ae2webintegration auth Settings-Refresh-TestToken/
        );
        await page.locator('#ae2web-local-names-button').click();
        await page.locator('#ae2web-local-names').getByRole('button', { name: '关闭界面汉化', exact: true }).click();
        assert.match(
            await page.locator('#maininfo').innerText(),
            /Please enter this command in the game to finish registration:/
        );
        assert.equal(await page.title(), 'AE2');
        assert.notEqual(await page.locator('html').getAttribute('lang'), 'zh-CN');
        assert.equal(posts.length, 2);
        assert.deepEqual(errors, []);
    }
);
