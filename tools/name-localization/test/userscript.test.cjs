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
    const dom = new JSDOM('<!doctype html><html><body><main>AE2 Web Integration</main></body></html>', {
        url: options.url || 'http://localhost:2324/',
        runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    const window = dom.window;
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
