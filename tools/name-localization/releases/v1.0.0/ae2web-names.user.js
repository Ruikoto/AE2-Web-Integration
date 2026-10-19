// ==UserScript==
// @name         AE2 Web Integration 1.2.0-pre 中文物品名
// @namespace    ae2web-local-names
// @version      1.0.0
// @description  旧版网页界面汉化与本地物品名称表；不修改服务器或请求。
// @match        http://127.0.0.1:2324/*
// @match        http://localhost:2324/*
// @match        http://k.rainplay.cn/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
    'use strict';
    // Host-only @match supports managers that do not accept ports in match patterns.
    // Restrict the configured public host to its panel port at runtime.
    if (location.hostname === 'k.rainplay.cn' && location.port !== '34392') return;
    // Change @match and this port restriction when using another panel address.
    // Intentionally targets the released 1.2.0-pre jQuery UI, not the newer core UI.
    const target = '1.2.0-pre-forge-1.20.1';
    const contract = 'ae2wi-1.2.0-pre-forge-1.20.1';
    const keyPattern = /^[A-Za-z0-9_-]{21}[AQgw]$/;
    const base = new URL('./', location.href);
    const storageKey = base.origin + base.pathname;
    const ui = localizeInterface();
    const maxBytes = 32 * 1024 * 1024;
    let entries = new Map();
    let enabled = false;
    let hits = 0;
    let hooked = false;
    let busy = false;
    let panel;
    let status;
    let toggle;
    let uiToggle;
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
        if (uiToggle) uiToggle.textContent = ui.enabled() ? '关闭界面汉化' : '开启界面汉化';
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
        panel.setAttribute('aria-labelledby', 'ae2web-local-names-title');
        panel.style.cssText =
            'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#20242b;color:#fff;padding:14px;border:1px solid #778;border-radius:6px;font:14px/1.5 sans-serif;width:340px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;box-shadow:0 6px 24px #0008';
        const title = document.createElement('strong');
        title.id = 'ae2web-local-names-title';
        title.style.cssText = 'display:block;padding-right:52px';
        title.textContent = '中文显示（仅本浏览器）';
        status = document.createElement('p');
        status.setAttribute('role', 'status');
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = '.json,application/json';
        file.style.cssText = 'display:block;width:100%;box-sizing:border-box';
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
        uiToggle = document.createElement('button');
        uiToggle.addEventListener('click', () => {
            ui.setEnabled(!ui.enabled());
            update('界面语言已切换。刷新可更新已打开的图表；物品名称表保持不变。');
        });
        const footer = document.querySelector('body > footer');
        const footerToggle = document.createElement('button');
        footerToggle.type = 'button';
        footerToggle.disabled = !footer;
        const footerPreference = `ae2web-footer-visible:${storageKey}`;
        function showFooter(visible) {
            if (footer) footer.hidden = !visible;
            footerToggle.textContent = visible ? '隐藏底部信息栏' : '显示底部信息栏';
            footerToggle.setAttribute('aria-pressed', String(visible));
            try {
                localStorage.setItem(footerPreference, visible ? 'on' : 'off');
            } catch {
                /* Keep the toggle usable without persistent storage. */
            }
        }
        let footerVisible = false;
        try {
            footerVisible = localStorage.getItem(footerPreference) === 'on';
        } catch {
            /* Start with the footer hidden. */
        }
        showFooter(footerVisible);
        footerToggle.addEventListener('click', () => showFooter(footer?.hidden === true));
        const launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.id = 'ae2web-local-names-button';
        launcher.textContent = '中文显示';
        launcher.setAttribute('aria-controls', panel.id);
        launcher.title = '展开或收起中文显示设置';
        const sidebar = document.querySelector('#terminalsubcontainersettings > section');
        if (sidebar) {
            launcher.style.cssText = 'display:block;width:calc(100% - 10px);margin:10px 5px';
            sidebar.append(launcher);
        } else {
            launcher.style.cssText =
                'position:fixed;top:50%;right:0;z-index:2147483646;writing-mode:vertical-rl;padding:12px 8px;border:1px solid #778;border-radius:6px 0 0 6px;background:#2b3555;color:#fff;font:14px sans-serif;cursor:pointer';
            document.body.append(launcher);
        }
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '收起';
        close.setAttribute('aria-label', '收起中文显示设置');
        close.style.cssText = 'position:absolute;top:10px;right:10px';
        const panelPreference = `ae2web-names-panel-open:${storageKey}`;
        function setOpen(open, focus = false) {
            panel.hidden = !open;
            launcher.setAttribute('aria-expanded', String(open));
            try {
                localStorage.setItem(panelPreference, open ? 'on' : 'off');
            } catch {
                /* Keep the panel usable when storage is blocked. */
            }
            if (focus) (open ? close : launcher).focus();
        }
        launcher.addEventListener('click', () => setOpen(panel.hidden, true));
        close.addEventListener('click', () => setOpen(false, true));
        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false, true);
            }
        });
        let open = false;
        try {
            open = localStorage.getItem(panelPreference) === 'on';
        } catch {
            /* Start collapsed when storage is blocked. */
        }
        setOpen(open);
        panel.append(title, status, file, document.createElement('br'), toggle, clear, uiToggle, footerToggle, close);
        document.body.append(panel);
        update();
    }

    /** Translate display nodes only; application state, API values and identities stay untouched. */
    function localizeInterface() {
        const preferenceKey = `ae2web-ui-language:${storageKey}`;
        let active = true;
        try {
            active = localStorage.getItem(preferenceKey) !== 'off';
        } catch {
            /* Display works without storage. */
        }
        const messages = new Map(
            Object.entries({
                'UNIVERSAL WEB TERMINAL': '通用网页终端',
                'LOADING...': '加载中…',
                'Please wait': '请稍候',
                'No grid selected': '尚未选择网络',
                'Select this grid by default': '默认选择此网络',
                'Enable crafting tracking': '启用合成记录',
                'Access is granted through a controller, Wireless Access Point or terminal assigned to you, or through supported security permissions. The network must have an online controller.':
                    '可通过归属于你的控制器、无线访问点、终端或受支持的安全权限访问网络。网络必须有在线的控制器。',
                'Terminal options': '终端选项',
                Terminal: '终端',
                Crafting: '合成状态',
                'Crafting History': '合成记录',
                Refresh: '刷新',
                Cancel: '取消',
                Start: '开始',
                Close: '关闭',
                Settings: '设置',
                initializing: '初始化中',
                'A-Z': '按名称',
                '# of items': '按数量',
                Mod: '按模组',
                Ascending: '升序',
                Descending: '降序',
                Stored: '已存储',
                Craftable: '可合成',
                'Stored and craftable': '已存储及可合成',
                Items: '物品',
                'Fluid drops': '流体',
                'Items and fluid drops': '物品和流体',
                order: '下单',
                'Ordering unavailable': '无法下单',
                'Automatically refresh current screen': '自动刷新当前界面',
                'Items per row': '每行物品数',
                Local: '本地格式',
                'EN-US': '美式格式',
                Compact: '紧凑格式',
                Scientific: '科学计数法',
                'No format': '不格式化',
                'Number format': '数字格式',
                'Show item id': '显示物品 ID',
                'Show item icons [work in progress]': '显示物品图标［开发中］',
                'Work in progress': '开发中',
                'Purge icon cache': '清空图标缓存',
                'Are you sure you want to purge icons cache? This will result all icons to be redownloaded!':
                    '确定清空图标缓存吗？所有图标都需要重新下载！',
                'You are logged in as': '当前登录用户：',
                LogOut: '退出登录',
                'Search string': '搜索物品',
                'Search terminal items': '搜索终端物品',
                'Select a grid': '选择网络',
                'Select a crafting CPU.': '请选择合成 CPU。',
                'Players with access': '有访问权限的玩家',
                Controller: '控制器',
                'Wireless Access Point': '无线访问点',
                'Security Terminal': '安全终端',
                'Block owner': '方块所有者',
                'Security owner': '安全终端所有者',
                'Security permissions': '安全权限',
                'Tracking history': '合成记录',
                'Tracking history -': '合成记录 —',
                'Job for': '合成任务：',
                '(was cancelled)': '（已取消）',
                'Was cancelled!': '任务已取消！',
                'Started:': '开始时间：',
                'Completed:': '完成时间：',
                'Show interface usage chart': '显示接口使用图表',
                'Hide interface usage chart': '隐藏接口使用图表',
                'Show item crafting chart': '显示物品合成图表',
                'Hide item crafting chart': '隐藏物品合成图表',
                'Interface share': '接口使用情况',
                'Item share': '物品合成情况',
                'Locations:': '位置：',
                'Asking for item list...': '正在获取物品列表…',
                'Asking for tracking history list...': '正在获取合成记录…',
                'Asking for tracking data...': '正在获取任务详情…',
                'Sending order...': '正在发送合成请求…',
                'Submitting job...': '正在提交任务…',
                'Cancelling job...': '正在取消任务…',
                'Calculating, please wait...': '正在计算，请稍候…',
                'How much to order?': '请输入要合成的数量：',
                'Item details are unavailable. Refresh the item list before ordering.':
                    '无法获取物品信息，请刷新物品列表后再下单。',
                'Item details expired. Refresh the item list and place the order again.':
                    '物品信息已过期，请刷新列表后重新下单。',
                'The order response was lost. Check the crafting jobs before placing another order.':
                    '未收到下单响应。请先检查合成任务，再决定是否重新下单。',
                'Select a crafting CPU large enough for this plan.': '请选择存储容量足以容纳此合成计划的 CPU。',
                'The logout response was lost. Please try again.': '未收到退出登录响应，请重试。',
                'Could not load grids.': '无法加载网络列表。',
                'Request failed': '请求失败',
                'New version detected! Consider updating from': '发现新版本！可前往以下页面更新：',
                'Hide for 7 days': '七天内不再提示',
                'This service is hosted using': '本服务使用',
                'Made by': '作者：',
                'Cookie Notice 🍪': 'Cookie 使用说明 🍪',
                'Before you continue, please note that this website uses cookies to:':
                    '本网站使用 Cookie 实现以下功能：',
                'Save your terminal preferences': '保存终端偏好设置',
                'Enable login functionality': '提供登录功能',
                'Improve your overall experience': '改善使用体验',
                'By clicking "Accept", you consent to our use of cookies.':
                    '点击“接受 Cookie”即表示同意本网站使用 Cookie。',
                'Accept Cookies': '接受 Cookie',
                'This service requires authentication': '请先登录',
                Username: '用户名',
                'Username (in-game)': '游戏内用户名',
                Password: '密码',
                'Enter username': '输入用户名',
                'Enter password': '输入密码',
                'Remember me for 7 days': '保持登录七天',
                Enter: '登录',
                'Or register': '或注册账号',
                Continue: '继续',
                'I understand that the password entered above': '我理解：继续操作后，',
                'will be visible to the server owner once continued!': '服务器所有者将能看到上方输入的密码！',
                'You have to be on the server (online) to perform this action!':
                    '执行此操作时，你必须在线并进入服务器！',
                'Invalid password!': '密码错误！',
                'Invalid username!': '用户名无效！',
                'Please enter this command in the game to finish registration:': '请在游戏内输入以下命令完成注册：'
            })
        );
        const errors = new Map(
            Object.entries({
                UNAUTHORIZED: '登录已失效或尚未登录',
                INVALID_USER: '用户名无效',
                INVALID_PASSWORD: '密码错误',
                NOT_ONLINE: '玩家不在线',
                NO_PERMISSIONS: '没有权限',
                GRID_NOT_FOUND: '网络不存在或不可用',
                CPU_NOT_FOUND: '合成 CPU 不存在',
                CPU_NOT_BUSY: '合成 CPU 当前没有任务',
                ITEM_NOT_FOUND: '找不到该物品',
                ITEM_IDENTITY_UNKNOWN: '物品身份信息已过期，请刷新列表',
                AMBIGUOUS_ITEM_KEY: '物品身份不明确',
                INVALID_QUANTITY: '数量无效',
                INVALID_ID: '标识符无效',
                BAD_PARAM: '请求参数无效',
                CSRF_REJECTED: '请求来源校验失败',
                FAIL: '操作失败',
                JOB_NOT_DONE: '合成计划尚未完成',
                TRACKING_NOT_FOUND: '找不到合成记录',
                SERVER_BUSY: '服务器繁忙，请稍后重试',
                SERVER_STOPPING: '服务器正在关闭',
                TIMEOUT: '请求超时',
                INTERNAL_ERROR: '服务器内部错误',
                HTTP_ERROR: '网络请求失败'
            })
        );
        const originals = new Map();
        const attributes = new Map();
        let oldLang;
        let oldTitle;
        let initialized = false;
        let observing = false;
        const excluded =
            'script, style, noscript, textarea, code, pre, #ae2web-local-names, .grid-access-name, .grid-access-uuid, .grid-access-position, #terminalcontent b, #terminalHistoryHeaderText b, #terminalCPUHeaderText b';

        function protectedElement(element) {
            if (!element || element.closest(excluded)) return true;
            return !!element.closest('#username:not(input)');
        }
        function text(value, context) {
            const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
            const source = match[2];
            let result = messages.get(source);
            if (result === undefined && context?.id === 'terminalCPUHeaderText') {
                if (source.endsWith(': Idle')) result = source.slice(0, -6) + '：空闲';
                else if (source.endsWith(': Crafting')) result = source.slice(0, -10) + '：正在合成';
            }
            if (result === undefined && (context?.id === 'currentgrid' || context?.tagName === 'OPTION')) {
                const grid = source.match(
                    /^(Current grid: |Grid )([A-Za-z0-9_-]{22}) \[ Owned by ([\s\S]*) \]\[ CPU count: (\d+) \](\[ Default \])?(\[ Tracked \])?$/
                );
                if (grid)
                    result = `${grid[1] === 'Grid ' ? '网络 ' : '当前网络：'}${grid[2]} [所有者：${grid[3]}][合成 CPU：${grid[4]}]${grid[5] ? '[默认]' : ''}${grid[6] ? '[已记录]' : ''}`;
            }
            if (result === undefined) {
                const prefixes = [
                    ['Stored: ', '库存：'],
                    ['Crafting: ', '合成中：'],
                    ['Scheduled: ', '待处理：'],
                    ['Crafted total: ', '累计合成：'],
                    ['Missing: ', '缺少：'],
                    ['To craft: ', '需要合成：'],
                    ['Steps: ', '步骤：'],
                    ['Available: ', '可用：'],
                    ['Used: ', '使用比例：'],
                    ['Time: ', '耗时：'],
                    ['Efficiency: ', '效率：'],
                    ['Completed in ', '总耗时：'],
                    ['Started ', '开始于 '],
                    ['Completed ', '完成于 '],
                    ['From ', '开始：'],
                    ['To ', '结束：'],
                    ['Crafting Plan - ', '合成计划 — '],
                    ['[Simulation :(] Crafting Plan - ', '［模拟］合成计划 — ']
                ];
                for (const [prefix, translation] of prefixes) {
                    if (source.startsWith(prefix)) {
                        result = translation + source.slice(prefix.length);
                        break;
                    }
                }
                if (source === 'Asking for') result = '正在获取';
                else if (source.startsWith('Asking for ') && source.endsWith('...'))
                    result = '正在获取 ' + source.slice(11, -3) + '…';
                else if (/^\d+ Co-Procs$/.test(source)) result = source.replace(' Co-Procs', ' 个协处理器');
                else if (/^Enter a whole number between 1 and \d+\.$/.test(source))
                    result = source
                        .replace('Enter a whole number between 1 and ', '请输入 1 到 ')
                        .replace(/\.$/, ' 之间的整数。');
                else if (source.startsWith('Dimension: '))
                    result = source.replace('Dimension: ', '维度：').replace(' · Side: ', ' · 朝向：');
            }
            if (result === undefined && context?.closest?.('#alertoverlay')) {
                const code = source.match(/^([A-Z_]+)(?=:|$)/)?.[1];
                if (errors.has(code)) result = errors.get(code) + source.slice(code.length);
            }
            return result === undefined ? value : match[1] + result + match[3];
        }
        function visit(node, translate) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (!translate) {
                    originals.delete(node);
                    return;
                }
                const parent = node.parentElement;
                if (protectedElement(parent)) return;
                const cpu = parent.closest('#terminalCPUList button, #terminalCPUListForJob button');
                if (cpu && cpu.firstChild === node) return;
                const previous = originals.get(node);
                if (previous && previous.output === node.data) return;
                const output = text(node.data, parent);
                if (output !== node.data) {
                    originals.set(node, { input: node.data, output });
                    node.data = output;
                } else originals.delete(node);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (!translate) attributes.delete(node);
            if (translate && protectedElement(node)) return;
            if (translate) {
                const names = ['title', 'placeholder', 'aria-label'];
                if (node.matches('input[type=submit]:not([name]), input[type=button]:not([name])')) names.push('value');
                for (const name of names) {
                    if (!node.hasAttribute(name)) continue;
                    const input = node.getAttribute(name);
                    const previous = attributes.get(node)?.get(name);
                    if (previous && previous.output === input) continue;
                    const output = text(input);
                    if (output !== input) {
                        if (!attributes.has(node)) attributes.set(node, new Map());
                        attributes.get(node).set(name, { input, output });
                        node.setAttribute(name, output);
                    } else attributes.get(node)?.delete(name);
                }
            }
            for (const child of node.childNodes) visit(child, translate);
        }
        const observer = new MutationObserver((changes) => {
            observer.disconnect();
            try {
                for (const change of changes) {
                    for (const removed of change.removedNodes) if (!removed.isConnected) visit(removed, false);
                    if (!active) continue;
                    if (change.type === 'childList') for (const added of change.addedNodes) visit(added, true);
                    else visit(change.target, true);
                }
            } finally {
                observe();
            }
        });
        function observe() {
            if (!observing || !document?.body) return;
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['title', 'placeholder', 'aria-label', 'value']
            });
        }
        function apply() {
            if (!document?.body) return;
            if (!initialized) {
                oldLang = document.documentElement.getAttribute('lang');
                oldTitle = document.title;
                initialized = true;
            }
            observer.disconnect();
            if (active) {
                visit(document.body, true);
                document.documentElement.lang = 'zh-CN';
                if (oldTitle === 'AE2') document.title = 'AE2 网页终端';
            } else {
                for (const [node, record] of originals)
                    if (node.isConnected && node.data === record.output) node.data = record.input;
                for (const [element, records] of attributes)
                    for (const [name, record] of records) {
                        if (element.isConnected && element.getAttribute(name) === record.output)
                            element.setAttribute(name, record.input);
                    }
                originals.clear();
                attributes.clear();
                if (oldLang === null) document.documentElement.removeAttribute('lang');
                else if (oldLang !== undefined) document.documentElement.lang = oldLang;
                if (document.title === 'AE2 网页终端') document.title = oldTitle;
            }
            observing = true;
            observe();
        }
        for (const name of ['alert', 'confirm', 'prompt']) {
            const original = window[name];
            window[name] = function (message, ...args) {
                return Reflect.apply(original, window, [
                    active && typeof message === 'string' ? text(message) : message,
                    ...args
                ]);
            };
        }
        let wrappedChart;
        function hookChart() {
            const original = window.Chart;
            if (typeof original !== 'function' || original === wrappedChart) return;
            wrappedChart = new Proxy(original, {
                construct(target, args, newTarget) {
                    const options = args[1]?.options;
                    if (active && options) {
                        for (const title of [options.title, options.plugins?.title])
                            if (typeof title?.text === 'string') title.text = text(title.text);
                    }
                    const callbacks = options?.plugins?.tooltip?.callbacks;
                    const label = callbacks?.label;
                    if (typeof label === 'function')
                        callbacks.label = function (...values) {
                            const result = Reflect.apply(label, this, values);
                            if (!active) return result;
                            return Array.isArray(result)
                                ? result.map((value) => (typeof value === 'string' ? text(value) : value))
                                : typeof result === 'string'
                                  ? text(result)
                                  : result;
                        };
                    return Reflect.construct(target, args, newTarget);
                }
            });
            window.Chart = wrappedChart;
        }
        document.addEventListener('load', hookChart, true);
        hookChart();
        document.addEventListener('DOMContentLoaded', apply, { once: true });
        if (document.readyState !== 'loading') apply();
        return {
            enabled: () => active,
            setEnabled(value) {
                active = value;
                try {
                    localStorage.setItem(preferenceKey, active ? 'on' : 'off');
                } catch {
                    /* Keep session-only preference. */
                }
                apply();
            }
        };
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
