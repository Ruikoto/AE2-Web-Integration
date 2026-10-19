// ==UserScript==
// @name         AE2 Web Integration 1.2.0-pre 中文物品名
// @namespace    ae2web-local-names
// @version      0.1.0
// @description  本地名称表；只替换旧版网页 GET 响应中的 itemname，不修改服务器或请求。
// @match        http://127.0.0.1:2324/*
// @match        http://localhost:2324/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
    'use strict';
    // Change @match to the exact address of YOUR panel before installing.
    // Intentionally targets the released 1.2.0-pre jQuery UI, not the newer core UI.
    const target = '1.2.0-pre-forge-1.20.1';
    const contract = 'ae2wi-1.2.0-pre-forge-1.20.1';
    const keyPattern = /^[A-Za-z0-9_-]{21}[AQgw]$/;
    const base = new URL('./', location.href);
    const storageKey = base.origin + base.pathname;
    const maxBytes = 32 * 1024 * 1024;
    let entries = new Map();
    let enabled = false;
    let hits = 0;
    let hooked = false;
    let busy = false;
    let panel;
    let status;
    let toggle;
    let database;
    let restored = Promise.resolve();

    function validate(value) {
        if (
            !value ||
            value.formatVersion !== 1 ||
            value.targetMod !== target ||
            value.identityContract !== contract ||
            value.minecraftVersion !== '1.20.1' ||
            typeof value.language !== 'string' ||
            !/^zh(?:_|-)cn$/i.test(value.language) ||
            !Array.isArray(value.entries) ||
            value.entries.length === 0 ||
            value.entries.length > 250000
        )
            throw new Error('名称表版本、目标 Mod、中文语言或条目数量不匹配');
        const result = new Map();
        for (const item of value.entries) {
            if (
                !item ||
                typeof item.key !== 'string' ||
                !keyPattern.test(item.key) ||
                typeof item.name !== 'string' ||
                !item.name.trim() ||
                item.name.length > 1024 ||
                Array.from(item.name).some(
                    (character) =>
                        character.codePointAt(0) < 32 ||
                        character.codePointAt(0) === 127 ||
                        (character.codePointAt(0) >= 0xd800 && character.codePointAt(0) <= 0xdfff)
                ) ||
                typeof item.itemid !== 'string' ||
                item.itemid.length > 512 ||
                !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item.itemid) ||
                result.has(item.key)
            )
                throw new Error('名称表包含无效或重复条目');
            result.set(item.key, { name: item.name, itemid: item.itemid });
        }
        return result;
    }

    // Legacy formatItemName uses innerHTML. Escape names before they reach that renderer.
    function escaped(text) {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return text.replace(/[&<>"']/g, (character) => entities[character]);
    }

    function translate(envelope) {
        if (!enabled || !envelope || envelope.status !== 'OK') return envelope;
        const pending = [envelope.data];
        let visited = 0;
        while (pending.length) {
            const value = pending.pop();
            if (!value || typeof value !== 'object') continue;
            if (++visited > 500000) break;
            if (
                !Array.isArray(value) &&
                typeof value.itemname === 'string' &&
                typeof value.itemKey === 'string' &&
                typeof value.itemid === 'string' &&
                (!value.identityStatus || value.identityStatus === 'OK')
            ) {
                const item = entries.get(value.itemKey);
                // Both exact AE identity and registry ID must agree. No base-key or name fallback.
                if (item && item.itemid === value.itemid) {
                    value.itemname = escaped(item.name);
                    hits++;
                }
            }
            for (const child of Object.values(value)) {
                if (child && typeof child === 'object') pending.push(child);
            }
        }
        update();
        return envelope;
    }

    function resourceGet(options) {
        if (String(options.type || options.method || 'GET').toUpperCase() !== 'GET') return false;
        const url = new URL(options.url, location.href);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return false;
        const relative = url.pathname.slice(base.pathname.length);
        return /^api\/grids\/[^/]+\/(?:items|cpus(?:\/[^/]+)?|crafting-plans\/[^/]+|crafting-history(?:\/[^/]+)?)$/.test(
            relative
        );
    }

    function hook() {
        const jquery = window.jQuery;
        if (hooked || !jquery?.ajaxPrefilter) return;
        hooked = true;
        jquery.ajaxPrefilter('json', (options) => {
            if (!resourceGet(options)) return;
            const parse = options.converters['text json'] || JSON.parse;
            if (typeof parse !== 'function') return;
            // Use the original converter first: preserve normal JSON/HTTP error handling.
            options.converters['text json'] = (text) => {
                const original = parse(text);
                if (!enabled) return original;
                try {
                    // A failed conversion must never return a partially changed response.
                    return translate(JSON.parse(JSON.stringify(original)));
                } catch {
                    return original;
                }
            };
        });
        update();
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ae2web-local-names', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('panels');
            request.onerror = () => reject(new Error('浏览器本地存储不可用'));
            request.onblocked = () => reject(new Error('请关闭其他终端标签页后重试'));
            request.onsuccess = () => resolve(request.result);
        });
    }

    async function save(value) {
        const db = await database;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('panels', 'readwrite');
            const store = transaction.objectStore('panels');
            if (value) store.put(value, storageKey);
            else store.delete(storageKey);
            transaction.oncomplete = resolve;
            transaction.onabort = transaction.onerror = () => reject(new Error('保存失败，原有设置保持不变'));
        });
    }

    let table;
    function update(message) {
        if (!status) return;
        status.textContent =
            message ||
            `${enabled ? '已开启' : '已关闭'} · ${entries.size} 个名称 · 本页匹配 ${hits} 次${hooked ? '' : ' · 未检测到旧版网页接口'}`;
        toggle.textContent = enabled ? '关闭中文名' : '开启中文名';
        toggle.disabled = busy || !table || !hooked;
    }

    async function action(work) {
        if (busy) return;
        busy = true;
        update();
        try {
            await restored;
            await work();
        } catch (error) {
            update(error.message);
        } finally {
            busy = false;
            toggle.disabled = !table || !hooked;
        }
    }

    function mount() {
        if (panel || !document.body) return;
        panel = document.createElement('aside');
        panel.id = 'ae2web-local-names';
        panel.style.cssText =
            'position:fixed;bottom:8px;right:8px;z-index:2147483647;background:#20242b;color:#fff;padding:10px;border:1px solid #778;border-radius:6px;font:14px sans-serif;max-width:360px';
        const title = document.createElement('strong');
        title.textContent = '中文物品名（仅本浏览器）';
        status = document.createElement('p');
        status.setAttribute('role', 'status');
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = '.json,application/json';
        file.setAttribute('aria-label', '导入中文名称表');
        file.addEventListener('change', () =>
            action(async () => {
                const selected = file.files[0];
                if (!selected) return;
                if (selected.size > maxBytes) throw new Error('名称表超过 32 MiB');
                const candidate = JSON.parse(await selected.text());
                const validated = validate(candidate);
                await save({ table: candidate, enabled: false });
                table = candidate;
                entries = validated;
                enabled = false;
                hits = 0;
                update('名称表已导入；点击“开启中文名”并刷新网页。无需重新合成或移动物品。');
            })
        );
        toggle = document.createElement('button');
        toggle.addEventListener('click', () =>
            action(async () => {
                await save({ table, enabled: !enabled });
                enabled = !enabled;
                update('设置已保存。请刷新网页，使已显示的列表使用新设置。');
            })
        );
        const clear = document.createElement('button');
        clear.textContent = '清除名称表';
        clear.addEventListener('click', () =>
            action(async () => {
                await save(null);
                enabled = false;
                entries = new Map();
                table = undefined;
                hits = 0;
                file.value = '';
                update('已清除。刷新网页即可恢复原始名称。');
            })
        );
        panel.append(title, status, file, document.createElement('br'), toggle, clear);
        document.body.append(panel);
        update();
    }

    // jQuery is loaded before the release's inline application. Its load event lets us
    // register the converter before the application sends its first request.
    document.addEventListener('load', hook, true);
    document.addEventListener(
        'DOMContentLoaded',
        () => {
            hook();
            mount();
        },
        { once: true }
    );
    hook();
    if (document.readyState !== 'loading') mount();
    database = openDatabase();
    restored = (async () => {
        const db = await database;
        const saved = await new Promise((resolve, reject) => {
            const request = db.transaction('panels').objectStore('panels').get(storageKey);
            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });
        if (saved) {
            entries = validate(saved.table);
            table = saved.table;
            enabled = saved.enabled === true;
        }
        update();
    })().catch(() => {
        enabled = false;
        update('本地名称表未载入；使用原始名称，可重新导入。');
    });
})();
