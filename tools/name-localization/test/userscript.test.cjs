const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const jquery = require('jquery');

const script = fs.readFileSync(path.join(__dirname, '../ae2web-names.user.js'), 'utf8');
const key = 'AAAAAAAAAAAAAAAAAAAAAA';
const otherKey = 'BBBBBBBBBBBBBBBBBBBBBA';
function table(name = '铁锭') {
    return {
        formatVersion: 1,
        targetMod: '1.2.0-pre-forge-1.20.1',
        identityContract: 'ae2wi-1.2.0-pre-forge-1.20.1',
        minecraftVersion: '1.20.1',
        language: 'zh_cn',
        entries: [{ key, itemid: 'minecraft:iron_ingot', name }]
    };
}
const item = (extra = {}) => ({
    itemid: 'minecraft:iron_ingot',
    itemname: 'Iron Ingot',
    itemKey: key,
    quantity: 64,
    craftable: true,
    ...extra
});
const response = (data) => ({ status: 'OK', data });
const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

async function fixture(t, options = {}) {
    const dom = new JSDOM(options.html || '<!doctype html><html><body><main>AE2 Web Integration</main></body></html>', {
        url: options.url || 'http://localhost:2324/',
        runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    const window = dom.window;
    if (options.dialogs) Object.assign(window, options.dialogs);
    if (options.Chart) window.Chart = options.Chart;
    if (options.search) window.shouldDisplay = options.search(window);
    Object.defineProperty(window, 'indexedDB', { value: options.storage || new IDBFactory() });
    const $ = jquery(window);
    window.jQuery = window.$ = $;
    if (options.lateJquery) {
        delete window.jQuery;
        delete window.$;
    }
    const requests = [];
    let reply = response([item()]);
    $.ajaxTransport('+json', (settings) => ({
        send(headers, complete) {
            requests.push({ method: settings.type, url: settings.url, data: settings.data, headers: { ...headers } });
            complete(
                options.httpError ? 503 : 200,
                'OK',
                {
                    text: typeof reply === 'string' ? reply : JSON.stringify(reply)
                },
                'Content-Type: application/json'
            );
        },
        abort() {}
    }));
    window.eval(script);
    if (options.lateJquery) {
        window.jQuery = window.$ = $;
        window.document.dispatchEvent(new window.Event('load'));
    }
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await wait();
    const status = () => window.document.querySelector('#ae2web-local-names [role=status]').textContent;
    async function importTable(value) {
        const input = window.document.querySelector('input[type=file]');
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [
                {
                    size: JSON.stringify(value).length,
                    text: async () => JSON.stringify(value)
                }
            ]
        });
        input.dispatchEvent(new window.Event('change'));
        await wait();
    }
    async function toggle() {
        window.document.querySelector('#ae2web-local-names button').click();
        await wait();
    }
    async function request(data = response([item()]), settings = {}) {
        reply = data;
        return new Promise((resolve, reject) =>
            $.ajax({
                url: 'api/grids/grid-key/items',
                method: 'GET',
                dataType: 'json',
                ...settings
            })
                .done((value) => resolve(JSON.parse(JSON.stringify(value))))
                .fail((xhr, status, error) => reject(Object.assign(new Error(status), { error, xhr })))
        );
    }
    return { window, requests, importTable, toggle, request, status };
}

test('import is opt-in; exact key and ID replace only the displayed name', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    assert.equal((await f.request()).data[0].itemname, 'Iron Ingot');
    await f.toggle();
    const original = response([item()]);
    const translated = await f.request(original);
    assert.deepEqual(translated, response([item({ itemname: '铁锭' })]));
    assert.deepEqual(original, response([item()]));
    await f.toggle();
    assert.equal((await f.request()).data[0].itemname, 'Iron Ingot');
});

test('renamed NBT variants, absent identities and conflicting IDs retain original names', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    await f.toggle();
    const original = response([
        item({ itemKey: otherKey, itemname: 'My renamed ingot' }),
        item({ itemKey: null }),
        item({ itemid: 'another:iron_ingot' }),
        item({ identityStatus: 'AMBIGUOUS' }),
        item({ identityStatus: 'UNSUPPORTED' })
    ]);
    assert.deepEqual(await f.request(original), original);
});

test('all resource views translate nested outputs while CPU names and job IDs stay unchanged', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    await f.toggle();
    const payload = response({ id: 9, name: 'Main CPU', quantity: 48, finalOutput: item(), inputs: [item()] });
    for (const route of ['cpus', 'cpus/cpu1', 'crafting-plans/9', 'crafting-history', 'crafting-history/9']) {
        const translated = await f.request(payload, { url: 'api/grids/grid-key/' + route });
        assert.equal(translated.data.finalOutput.itemname, '铁锭');
        assert.equal(translated.data.inputs[0].itemname, '铁锭');
        assert.equal(translated.data.name, 'Main CPU');
        assert.equal(translated.data.id, 9);
        assert.equal(translated.data.quantity, 48);
    }
});

test('crafting and cancellation POSTs, PATCHes, DELETEs and their bodies are untouched', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    await f.toggle();
    for (const method of ['POST', 'PATCH', 'DELETE']) {
        const body = JSON.stringify({ itemKey: key, quantity: 123, cpuKey: 'cpu1' });
        const result = await f.request(response([item()]), {
            method,
            data: body,
            contentType: 'application/json',
            headers: { 'X-AE2-Request': 'true' }
        });
        assert.equal(result.data[0].itemname, 'Iron Ingot');
        const sent = f.requests.at(-1);
        assert.equal(sent.method, method);
        assert.equal(sent.data, body);
        assert.equal(sent.headers['X-AE2-Request'], 'true');
    }
});

test('settings, login, icons, other origins and other panel paths are untouched', async (t) => {
    const f = await fixture(t, { url: 'https://example.test/panel/' });
    await f.importTable(table());
    await f.toggle();
    for (const url of [
        'api/grids/grid-key/settings',
        'api/context',
        'icon?items=' + key,
        'https://other.test/panel/api/grids/grid-key/items',
        '/another/api/grids/grid-key/items'
    ]) {
        const original = response([item()]);
        assert.deepEqual(await f.request(original, { url }), original);
    }
    assert.equal((await f.request(response([item()]))).data[0].itemname, '铁锭');
});

test('unsafe markup is escaped before the legacy innerHTML renderer sees it', async (t) => {
    const f = await fixture(t);
    const name = '<img src=x onerror="alert(1)">铜 & 铁\'锭';
    await f.importTable(table(name));
    await f.toggle();
    const translated = (await f.request()).data[0].itemname;
    const cell = f.window.document.createElement('td');
    cell.innerHTML = '<b>' + translated + '</b>';
    assert.equal(cell.textContent, name);
    assert.equal(cell.querySelector('img'), null);
    assert.equal(cell.querySelectorAll('b').length, 1);
});

test('invalid imports cannot replace the previously enabled valid table', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    await f.toggle();
    const invalid = [
        { ...table(), language: 'en_us' },
        { ...table(), targetMod: 'other-version' },
        { ...table(), identityContract: 'different-codec' },
        { ...table(), entries: [table().entries[0], table().entries[0]] },
        { ...table(), entries: [{ ...table().entries[0], key: 'bad-key' }] },
        { ...table(), entries: [{ ...table().entries[0], key: [key] }] },
        { ...table(), language: ['zh_cn'] },
        { ...table(), entries: [{ ...table().entries[0], name: 'bad\u0000name' }] },
        { ...table(), entries: [{ ...table().entries[0], name: '\ud800' }] }
    ];
    for (const value of invalid) {
        await f.importTable(value);
        assert.equal((await f.request()).data[0].itemname, '铁锭');
    }
});

test('API failures and malformed JSON keep normal jQuery failure behavior', async (t) => {
    const f = await fixture(t);
    await f.importTable(table());
    await f.toggle();
    const failure = { status: 'UNAUTHORIZED', data: [item()] };
    assert.deepEqual(await f.request(failure), failure);
    await assert.rejects(f.request('{broken'), /parsererror/);
    const http = await fixture(t, { httpError: true });
    await http.importTable(table());
    await http.toggle();
    await assert.rejects(http.request(), (error) => error.xhr.status === 503);
});

test('table persists for this panel only, and clear restores original names', async (t) => {
    const storage = new IDBFactory();
    const f = await fixture(t, { storage });
    await f.importTable(table());
    await f.toggle();
    const restored = await fixture(t, { storage });
    assert.equal((await restored.request()).data[0].itemname, '铁锭');
    const different = await fixture(t, { storage, url: 'http://localhost:2324/other/' });
    assert.equal((await different.request()).data[0].itemname, 'Iron Ingot');
    restored.window.document.querySelectorAll('#ae2web-local-names button')[1].click();
    await wait();
    assert.equal((await restored.request()).data[0].itemname, 'Iron Ingot');
    const cleared = await fixture(t, { storage });
    assert.equal((await cleared.request()).data[0].itemname, 'Iron Ingot');
});

test('blocked browser storage leaves ordinary requests operational and names disabled', async (t) => {
    const f = await fixture(t, {
        storage: {
            open() {
                throw new Error('storage denied');
            }
        }
    });
    assert.equal((await f.request()).data[0].itemname, 'Iron Ingot');
    await f.importTable(table());
    assert.equal((await f.request()).data[0].itemname, 'Iron Ingot');
});

test('document-start installation hooks jQuery when its script subsequently loads', async (t) => {
    const f = await fixture(t, { lateJquery: true });
    await f.importTable(table());
    await f.toggle();
    assert.equal((await f.request()).data[0].itemname, '铁锭');
});

test('configured public panel URL supports importing and resolving names', async (t) => {
    const f = await fixture(t, { url: 'http://k.rainplay.cn:34392/' });
    await f.importTable(table());
    await f.toggle();
    assert.equal((await f.request()).data[0].itemname, '铁锭');
});

test('configured public host on other ports does not inject UI or open storage', async (t) => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'http://k.rainplay.cn:34393/',
        runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    Object.defineProperty(dom.window, 'indexedDB', {
        get() {
            throw new Error('Storage must not be accessed');
        }
    });
    dom.window.eval(script);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    assert.equal(dom.window.document.querySelector('#ae2web-local-names'), null);
});

test('storage quota failures preserve the previous table and enabled state', async (t) => {
    const factory = new IDBFactory();
    let denyWrites = false;
    const storage = {
        open(...args) {
            const request = factory.open(...args);
            request.addEventListener('success', () => {
                const db = request.result;
                const transaction = db.transaction.bind(db);
                db.transaction = (names, mode) => {
                    if (denyWrites && mode === 'readwrite') throw new Error('QuotaExceeded');
                    return transaction(names, mode);
                };
            });
            return request;
        }
    };
    const f = await fixture(t, { storage });
    await f.importTable(table());
    await f.toggle();
    denyWrites = true;
    await f.importTable(table('错误替换名'));
    assert.equal((await f.request()).data[0].itemname, '铁锭');
    await f.toggle();
    assert.equal((await f.request()).data[0].itemname, '铁锭');
});

test('UI translation covers dynamic labels and display attributes without altering identities or inputs', async (t) => {
    const f = await fixture(t, {
        html: `<!doctype html><html lang="en"><head><title>AE2</title></head><body>
      <h1>UNIVERSAL WEB TERMINAL</h1><button id="sortByButton"># of items</button>
      <input id="searchtext" placeholder="Search string" aria-label="Search terminal items">
      <input id="password" name="password" type="password" value="Settings">
      <input id="submit" type="submit" value="Enter">
      <select id="numberformat"><option value="2">Compact</option></select>
      <span id="username">Settings</span><strong class="grid-access-name">Controller</strong>
      <div id="terminalCPUList"><button name="cpu-original-key">Refresh</button></div>
      <div id="terminalcontent"><table><tr><td><b>Settings</b><br>Stored: 64<button>order</button></td></tr></table></div>
      <div id="alertoverlay"></div></body></html>`
    });
    const d = f.window.document;
    assert.equal(d.querySelector('h1').textContent, '通用网页终端');
    assert.equal(d.getElementById('sortByButton').textContent, '按数量');
    assert.equal(d.getElementById('searchtext').getAttribute('aria-label'), '搜索终端物品');
    assert.equal(d.getElementById('submit').value, '登录');
    assert.equal(d.querySelector('option').value, '2');
    assert.equal(d.querySelector('option').textContent, '紧凑格式');
    assert.equal(d.getElementById('password').value, 'Settings');
    assert.equal(d.getElementById('username').textContent, 'Settings');
    assert.equal(d.querySelector('.grid-access-name').textContent, 'Controller');
    assert.equal(d.querySelector('#terminalCPUList button').textContent, 'Refresh');
    assert.equal(d.querySelector('#terminalcontent b').textContent, 'Settings');
    assert.match(d.getElementById('terminalcontent').textContent, /库存：64/);
    d.getElementById('sortByButton').textContent = 'Descending';
    d.getElementById('alertoverlay').textContent = 'GRID_NOT_FOUND: test';
    await wait();
    assert.equal(d.getElementById('sortByButton').textContent, '降序');
    assert.equal(d.getElementById('alertoverlay').textContent, '网络不存在或不可用: test');
    const toggle = [...d.querySelectorAll('#ae2web-local-names button')].find((b) => b.textContent === '关闭界面汉化');
    toggle.click();
    assert.equal(d.getElementById('sortByButton').textContent, 'Descending');
    assert.equal(d.getElementById('submit').value, 'Enter');
    assert.equal(d.getElementById('searchtext').getAttribute('aria-label'), 'Search terminal items');
    assert.equal(d.querySelector('#terminalcontent b').textContent, 'Settings');
    assert.equal(d.documentElement.lang, 'en');
    assert.equal(d.title, 'AE2');
    await f.importTable(table());
    await f.toggle();
    assert.equal((await f.request()).data[0].itemname, '铁锭');
});

test('UI dialogs preserve return values and defaults; chart data labels and CPU names remain unchanged', async (t) => {
    const calls = [];
    const f = await fixture(t, {
        dialogs: {
            prompt(message, initial) {
                calls.push([message, initial]);
                return '7';
            },
            confirm(message) {
                calls.push(message);
                return false;
            },
            alert(message) {
                calls.push(message);
            }
        },
        Chart: function Chart(id, config) {
            this.id = id;
            this.config = config;
        }
    });
    assert.equal(f.window.prompt('How much to order?', '1'), '7');
    assert.deepEqual(calls[0], ['请输入要合成的数量：', '1']);
    assert.equal(
        f.window.confirm('Are you sure you want to purge icons cache? This will result all icons to be redownloaded!'),
        false
    );
    assert.match(calls[1], /确定清空图标缓存/);
    const labels = ['Settings', 'Start'];
    const chart = new f.window.Chart('chart', {
        data: { labels },
        options: {
            title: { text: 'Interface share' },
            plugins: {
                tooltip: {
                    callbacks: {
                        label() {
                            return ['From 12:00', 'To 13:00'];
                        }
                    }
                }
            }
        }
    });
    assert.equal(chart.config.data.labels, labels);
    assert.equal(chart.config.options.title.text, '接口使用情况');
    assert.deepEqual(chart.config.options.plugins.tooltip.callbacks.label(), ['开始：12:00', '结束：13:00']);
    const d = f.window.document;
    const cpu = d.createElement('span');
    cpu.id = 'terminalCPUHeaderText';
    cpu.textContent = 'Refresh: Idle';
    d.body.append(cpu);
    const grid = d.createElement('span');
    grid.id = 'currentgrid';
    grid.textContent = `Current grid: ${key} [ Owned by Settings ][ CPU count: 5 ][ Default ][ Tracked ]`;
    d.body.append(grid);
    await wait();
    assert.equal(cpu.textContent, 'Refresh：空闲');
    assert.equal(grid.textContent, `当前网络：${key} [所有者：Settings][合成 CPU：5][默认][已记录]`);
});

function legacySearch(window) {
    window.filteringOptions = { searchString: '', storedCraftable: 2, itemsType: 2 };
    window.searchStringChanged = (input) => (window.filteringOptions.searchString = input.value.toLowerCase());
    return (resource) => {
        const filters = window.filteringOptions;
        if (filters.storedCraftable !== 2 && resource.craftable !== (filters.storedCraftable === 1)) return false;
        if (filters.itemsType !== 2 && (resource.itemid === 'ae2fc:fluid_drop:0') !== (filters.itemsType === 1))
            return false;
        return !filters.searchString || resource.itemname.toLowerCase().includes(filters.searchString);
    };
}
const searchPage = {
    html: '<!doctype html><html><body><input id="searchtext"></body></html>',
    search: legacySearch
};

test('pinyin search supports full syllables, initials, partial endings, polyphonic characters and mixed names', async (t) => {
    const f = await fixture(t, searchPage);
    const resource = item({ itemname: '铁锭' });
    function matches(name, query) {
        f.window.searchStringChanged({ value: query });
        return f.window.shouldDisplay({ ...resource, itemname: name });
    }
    for (const query of ['铁', 'tieding', 'td', 'ding', 'tied', 'tie锭', '  TIE DING  ', 'tiědìng'])
        assert.equal(matches('铁锭', query), true, query);
    assert.equal(matches('重型铁锭', 'zhongxtd'), true);
    assert.equal(matches('重型铁锭', 'chongxing'), true);
    assert.equal(matches('铝锭', 'lvd'), true);
    assert.equal(matches('铝锭', 'lüding'), true);
    assert.equal(matches('ME 64k 铁锭', 'me64ktd'), true);
    assert.equal(matches('§a铁§r锭', 'tieding'), true);
    assert.equal(matches('铁&amp;锭', 'tie&ding'), true);
    assert.equal(matches('Iron Ingot', 'iron'), true);
    assert.equal(matches('自定义铁锭', 'zdyt'), true);
    for (const query of ['tongding', 'ttd', 'ieding', 'not-a-match', 'an'.repeat(1000)])
        assert.equal(matches('铁锭', query), false, query.slice(0, 24));
});

test('pinyin search preserves original inventory/type filters and never mutates resources or search state', async (t) => {
    const f = await fixture(t, searchPage);
    const filters = f.window.filteringOptions;
    const resource = Object.freeze(item({ itemname: '铁锭' }));
    const original = JSON.stringify(resource);
    filters.searchString = 'td';
    assert.equal(f.window.shouldDisplay(resource), true);
    filters.storedCraftable = 0;
    assert.equal(f.window.shouldDisplay(resource), false);
    filters.storedCraftable = 1;
    assert.equal(f.window.shouldDisplay(resource), true);
    filters.itemsType = 1;
    assert.equal(f.window.shouldDisplay(resource), false);
    const fluid = Object.freeze({ ...resource, itemid: 'ae2fc:fluid_drop:0' });
    assert.equal(f.window.shouldDisplay(fluid), true);
    assert.equal(JSON.stringify(resource), original);
    assert.deepEqual(JSON.parse(JSON.stringify(filters)), { searchString: 'td', storedCraftable: 1, itemsType: 1 });
    assert.deepEqual(f.requests, []);
});

test('cached pinyin follows changed names and queries, and names toggle falls back to visible English names', async (t) => {
    const f = await fixture(t, searchPage);
    await f.importTable(table());
    await f.toggle();
    const resource = (await f.request()).data[0];
    f.window.filteringOptions.searchString = 'td';
    assert.equal(f.window.shouldDisplay(resource), true);
    resource.itemname = '铜锭';
    f.window.filteringOptions.searchString = 'tieding';
    assert.equal(f.window.shouldDisplay(resource), false);
    f.window.filteringOptions.searchString = 'tongding';
    assert.equal(f.window.shouldDisplay(resource), true);
    await f.toggle();
    const english = (await f.request()).data[0];
    assert.equal(english.itemname, 'Iron Ingot');
    assert.equal(f.window.shouldDisplay(english), false);
    f.window.filteringOptions.searchString = 'iron';
    assert.equal(f.window.shouldDisplay(english), true);
    f.window.filteringOptions.searchString = '';
    assert.equal(f.window.shouldDisplay(english), true);
});

test('offline pinyin dictionary matches its pinned provenance and retains its standalone license', () => {
    const crypto = require('node:crypto');
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../vendor/pinyin-match.json')));
    const dictionary = script.match(/const dictionary = (\{[^\n]+\});/)[1];
    assert.equal(crypto.createHash('sha256').update(dictionary).digest('hex'), metadata.dictionarySha256);
    const license = fs.readFileSync(path.join(__dirname, '../vendor/pinyin-match.LICENSE'), 'utf8');
    const embedded = script.split('/* pinyin-match 1.2.10: simplified dictionary data only.')[1].split('*/')[0];
    assert.equal(
        embedded
            .split('\n')
            .map((line) => line.replace(/^\s*\* ?/, ''))
            .join('\n')
            .trim(),
        license.trim()
    );
});
