// ==UserScript==
// @name         AE2 Web Integration 1.2.0-pre 中文物品名
// @namespace    ae2web-local-names
// @version      1.2.0
// @description  旧版网页汉化、本地物品名、全拼/小鹤双拼与可选模糊音搜索；不修改服务器或请求。
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
    const fuzzyPairs = [
        ['z', 'zh'],
        ['c', 'ch'],
        ['s', 'sh'],
        ['n', 'l'],
        ['f', 'h'],
        ['an', 'ang'],
        ['en', 'eng'],
        ['in', 'ing'],
        ['ian', 'iang'],
        ['uan', 'uang']
    ];
    const searchPreferenceKey = `ae2web-search:${storageKey}`;
    const searchSettings = readSearchSettings();
    let searchRevision = 0;
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

    function readSearchSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(searchPreferenceKey));
            return {
                mode: saved?.mode === 'xiaohe' ? 'xiaohe' : 'pinyin',
                fuzzy: fuzzyPairs
                    .map((pair) => pair.join('/'))
                    .filter((id) => Array.isArray(saved?.fuzzy) && saved.fuzzy.includes(id))
            };
        } catch {
            return { mode: 'pinyin', fuzzy: [] };
        }
    }

    function searchControls() {
        const controls = document.createElement('section');
        controls.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid #556;text-align:left';
        const label = document.createElement('label');
        label.htmlFor = 'ae2web-search-mode';
        label.textContent = '搜索模式 ';
        const mode = document.createElement('select');
        mode.id = label.htmlFor;
        for (const [value, name] of [
            ['pinyin', '全拼'],
            ['xiaohe', '小鹤双拼']
        ]) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            mode.append(option);
        }
        mode.value = searchSettings.mode;
        const hint = document.createElement('p');
        hint.style.cssText = 'margin:6px 0;color:#cdd3e4;font-size:12px';
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.style.cursor = 'pointer';
        const choices = document.createElement('div');
        choices.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px';
        const inputs = fuzzyPairs.map((pair) => {
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = pair.join('/');
            input.checked = searchSettings.fuzzy.includes(input.value);
            input.style.cssText = 'width:auto;margin:0';
            row.append(input, pair.join(' / '));
            choices.append(row);
            return input;
        });
        function describe() {
            hint.textContent =
                mode.value === 'xiaohe'
                    ? '例如：铁锭 tpdk / td；支持部分编码和首字母。'
                    : '例如：铁锭 tieding / td；支持部分拼音和首字母。';
            summary.textContent = searchSettings.fuzzy.length
                ? `模糊音（已开启 ${searchSettings.fuzzy.length} 项）`
                : '模糊音（默认关闭，可多选）';
        }
        function change() {
            searchSettings.mode = mode.value === 'xiaohe' ? 'xiaohe' : 'pinyin';
            searchSettings.fuzzy = inputs.filter((input) => input.checked).map((input) => input.value);
            searchRevision++;
            try {
                localStorage.setItem(searchPreferenceKey, JSON.stringify(searchSettings));
            } catch {
                /* Preferences still work for this tab when storage is unavailable. */
            }
            describe();
            // Redraw only the inventory, never an open CPU, plan or history screen.
            if (window.currentWindow === 0 && typeof window.displayItemList === 'function') window.displayItemList();
        }
        mode.addEventListener('change', change);
        for (const input of inputs) input.addEventListener('change', change);
        details.append(summary, choices);
        controls.append(label, mode, hint, details);
        describe();
        return controls;
    }

    function mount() {
        if (panel || !document.body) return;
        hookPinyinSearch();
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
        panel.append(
            title,
            status,
            file,
            document.createElement('br'),
            toggle,
            clear,
            uiToggle,
            footerToggle,
            searchControls(),
            close
        );
        document.body.append(panel);
        update();
    }

    function hookPinyinSearch() {
        const input = document.getElementById('searchtext');
        const original = window.shouldDisplay;
        if (!input || typeof original !== 'function' || typeof window.searchStringChanged !== 'function') return;
        let matches;
        let revision = -1;
        window.shouldDisplay = function (item, ...args) {
            const result = Reflect.apply(original, this, [item, ...args]);
            if (result) return result;
            const query = window.filteringOptions?.searchString;
            if (typeof query !== 'string' || !query || typeof item?.itemname !== 'string') return result;
            if (item.itemname.length > 2048 || !/[\u3400-\u9fff]/u.test(item.itemname)) return result;
            try {
                if (!matches || revision !== searchRevision) {
                    matches = createPinyinMatcher();
                    revision = searchRevision;
                }
                if (matches(item, query)) {
                    // Reuse the original filters with a synthetic name inside this predicate only.
                    // Never change the real resource, its identity, or the application's query.
                    return Reflect.apply(original, this, [{ ...item, itemname: query }, ...args]);
                }
            } catch {
                // An unavailable dictionary or a search error leaves ordinary searches working.
            }
            return result;
        };
        input.title = 'Choose full pinyin or Xiaohe double pinyin and fuzzy sounds in Chinese display settings.';
    }

    function splitSyllable(syllable) {
        return syllable.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)(.*)$/).slice(1);
    }

    function xiaoheCodes(initial, final) {
        if (!initial) {
            const zero = {
                a: 'aa',
                o: 'oo',
                e: 'ee',
                ai: 'ad',
                ei: 'ew',
                ao: 'ac',
                ou: 'oz',
                an: 'aj',
                en: 'ef',
                ang: 'ah',
                eng: 'eg',
                er: 'er'
            };
            // Two-letter zero-initial syllables keep their original spelling;
            // also accept Rime's first-letter-plus-final-key aliases (ai/ad, an/aj...).
            return zero[final] ? [...new Set([...(final.length === 2 ? [final] : []), zero[final]])] : [];
        }
        const finals = {
            a: 'a',
            o: 'o',
            e: 'e',
            i: 'i',
            u: 'u',
            v: 'v',
            ai: 'd',
            ei: 'w',
            ao: 'c',
            ou: 'z',
            an: 'j',
            en: 'f',
            ang: 'h',
            eng: 'g',
            ong: 's',
            ia: 'x',
            ie: 'p',
            iao: 'n',
            iu: 'q',
            ian: 'm',
            in: 'b',
            iang: 'l',
            ing: 'k',
            iong: 's',
            ua: 'x',
            uo: 'o',
            uai: 'k',
            ui: 'v',
            uan: 'r',
            un: 'y',
            uang: 'l',
            ue: 't',
            ve: 't'
        };
        const first = { zh: 'v', ch: 'i', sh: 'u' }[initial] || initial;
        const last = finals[final];
        if (!last) return [];
        // Rime's Xiaohe layout accepts both ju/qu/xu/yu and jv/qv/xv/yv.
        return final === 'u' && /^[jqxy]$/.test(initial) ? [first + last, first + 'v'] : [first + last];
    }

    function createPinyinMatcher() {
        // PINYIN_DICTIONARY_BEGIN
        /* pinyin-match 1.2.10: simplified dictionary data only.
         * MIT License
         *
         * Copyright (c) 2020 All contributors to pinyin-match
         *
         * Permission is hereby granted, free of charge, to any person obtaining a copy
         * of this software and associated documentation files (the "Software"), to deal
         * in the Software without restriction, including without limitation the rights
         * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
         * copies of the Software, and to permit persons to whom the Software is
         * furnished to do so, subject to the following conditions:
         *
         * The above copyright notice and this permission notice shall be included in all
         * copies or substantial portions of the Software.
         *
         * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
         * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
         * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
         * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
         * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
         * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
         * SOFTWARE.
         */
        // prettier-ignore
        const dictionary = {"a":"阿啊呵腌嗄吖锕","e":"额阿俄恶鹅遏鄂厄饿峨扼娥鳄哦蛾噩愕讹锷垩婀鹗萼谔莪腭锇颚呃阏屙苊轭","ai":"爱埃艾碍癌哀挨矮隘蔼唉皑哎霭捱暧嫒嗳瑷嗌锿砹","ei":"诶","xi":"系西席息希习吸喜细析戏洗悉锡溪惜稀袭夕洒晰昔牺腊烯熙媳栖膝隙犀蹊硒兮熄曦禧嬉玺奚汐徙羲铣淅嘻歙熹矽蟋郗唏皙隰樨浠忾蜥檄郄翕阋鳃舾屣葸螅咭粞觋欷僖醯鼷裼穸饩舄禊诶菥蓰","yi":"祎一以已意议义益亿易医艺食依移衣异伊仪宜射遗疑毅谊亦疫役忆抑尾乙译翼蛇溢椅沂泄逸蚁夷邑怡绎彝裔姨熠贻矣屹颐倚诣胰奕翌疙弈轶蛾驿壹猗臆弋铱旖漪迤佚翊诒怿痍懿饴峄揖眙镒仡黟肄咿翳挹缢呓刈咦嶷羿钇殪荑薏蜴镱噫癔苡悒嗌瘗衤佾埸圯舣酏劓","an":"安案按岸暗鞍氨俺胺铵谙庵黯鹌桉埯犴揞厂广","han":"厂汉韩含旱寒汗涵函喊憾罕焊翰邯撼瀚憨捍酣悍鼾邗颔蚶晗菡旰顸犴焓撖","ang":"昂仰盎肮","ao":"奥澳傲熬凹鳌敖遨鏖袄坳翱嗷拗懊岙螯骜獒鏊艹媪廒聱","wa":"瓦挖娃洼袜蛙凹哇佤娲呙腽","yu":"于与育余预域予遇奥语誉玉鱼雨渔裕愈娱欲吁舆宇羽逾豫郁寓吾狱喻御浴愉禹俞邪榆愚渝尉淤虞屿峪粥驭瑜禺毓钰隅芋熨瘀迂煜昱汩於臾盂聿竽萸妪腴圄谕觎揄龉谀俣馀庾妤瘐鬻欤鹬阈嵛雩鹆圉蜮伛纡窬窳饫蓣狳肀舁蝓燠","niu":"牛纽扭钮拗妞忸狃","o":"哦噢喔","ba":"把八巴拔伯吧坝爸霸罢芭跋扒叭靶疤笆耙鲅粑岜灞钯捌菝魃茇","pa":"怕帕爬扒趴琶啪葩耙杷钯筢","pi":"被批副否皮坏辟啤匹披疲罢僻毗坯脾譬劈媲屁琵邳裨痞癖陂丕枇噼霹吡纰砒铍淠郫埤濞睥芘蚍圮鼙罴蜱疋貔仳庀擗甓陴","bi":"比必币笔毕秘避闭佛辟壁弊彼逼碧鼻臂蔽拂泌璧庇痹毙弼匕鄙陛裨贲敝蓖吡篦纰俾铋毖筚荸薜婢哔跸濞秕荜愎睥妣芘箅髀畀滗狴萆嬖襞舭","bai":"百白败摆伯拜柏佰掰呗擘捭稗","bo":"波博播勃拨薄佛伯玻搏柏泊舶剥渤卜驳簿脖膊簸菠礴箔铂亳钵帛擘饽跛钹趵檗啵鹁擗踣","bei":"北被备倍背杯勃贝辈悲碑臂卑悖惫蓓陂钡狈呗焙碚褙庳鞴孛鹎邶鐾","ban":"办版半班般板颁伴搬斑扮拌扳瓣坂阪绊钣瘢舨癍","pan":"判盘番潘攀盼拚畔胖叛拌蹒磐爿蟠泮袢襻丬","bin":"份宾频滨斌彬濒殡缤鬓槟摈膑玢镔豳髌傧","bang":"帮邦彭旁榜棒膀镑绑傍磅蚌谤梆浜蒡","pang":"旁庞乓磅螃彷滂逄耪胖","beng":"泵崩蚌蹦迸绷甭嘣甏堋","bao":"报保包宝暴胞薄爆炮饱抱堡剥鲍曝葆瀑豹刨褒雹孢苞煲褓趵鸨龅勹","bu":"不部步布补捕堡埔卜埠簿哺怖钚卟瓿逋晡醭钸","pu":"普暴铺浦朴堡葡谱埔扑仆蒲曝瀑溥莆圃璞濮菩蹼匍噗氆攵镨攴镤","mian":"面棉免绵缅勉眠冕娩腼渑湎沔黾宀眄","po":"破繁坡迫颇朴泊婆泼魄粕鄱珀陂叵笸泺皤钋钷","fan":"反范犯繁饭泛翻凡返番贩烦拚帆樊藩矾梵蕃钒幡畈蘩蹯燔","fu":"府服副负富复福夫妇幅付扶父符附腐赴佛浮覆辅傅伏抚赋辐腹弗肤阜袱缚甫氟斧孚敷俯拂俘咐腑孵芙涪釜脯茯馥宓绂讣呋罘麸蝠匐芾蜉跗凫滏蝮驸绋蚨砩桴赙菔呒趺苻拊阝鲋怫稃郛莩幞祓艴黻黼鳆","ben":"本奔苯笨夯贲锛畚坌","feng":"风丰封峰奉凤锋冯逢缝蜂枫疯讽烽俸沣酆砜葑唪","bian":"变便边编遍辩鞭辨贬匾扁卞汴辫砭苄蝙鳊弁窆笾煸褊碥忭缏","pian":"便片篇偏骗翩扁骈胼蹁谝犏缏","zhen":"镇真针圳振震珍阵诊填侦臻贞枕桢赈祯帧甄斟缜箴疹砧榛鸩轸稹溱蓁胗椹朕畛浈","biao":"表标彪镖裱飚膘飙镳婊骠飑杓髟鳔灬瘭","piao":"票朴漂飘嫖瓢剽缥殍瞟骠嘌莩螵","huo":"和活或货获火伙惑霍祸豁嚯藿锪蠖钬耠镬夥灬劐攉","bie":"别鳖憋瘪蹩","min":"民敏闽闵皿泯岷悯珉抿黾缗玟愍苠鳘","fen":"分份纷奋粉氛芬愤粪坟汾焚酚吩忿棼玢鼢瀵偾鲼","bing":"并病兵冰屏饼炳秉丙摒柄槟禀枋邴冫","geng":"更耕颈庚耿梗埂羹哽赓绠鲠","fang":"方放房防访纺芳仿坊妨肪邡舫彷枋鲂匚钫","xian":"现先县见线限显险献鲜洗宪纤陷闲贤仙衔掀咸嫌掺羡弦腺痫娴舷馅酰铣冼涎暹籼锨苋蚬跹岘藓燹鹇氙莶霰跣猃彡祆筅","fou":"不否缶","ca":"拆擦嚓礤","cha":"查察差茶插叉刹茬楂岔诧碴嚓喳姹杈汊衩搽槎镲苴檫馇锸猹","cai":"才采财材菜彩裁蔡猜踩睬","can":"参残餐灿惨蚕掺璨惭粲孱骖黪","shen":"信深参身神什审申甚沈伸慎渗肾绅莘呻婶娠砷蜃哂椹葚吲糁渖诜谂矧胂","cen":"参岑涔","san":"三参散伞叁糁馓毵","cang":"藏仓苍沧舱臧伧","zang":"藏脏葬赃臧奘驵","chen":"称陈沈沉晨琛臣尘辰衬趁忱郴宸谌碜嗔抻榇伧谶龀肜","cao":"草操曹槽糙嘈漕螬艚屮","ce":"策测册侧厕栅恻","ze":"责则泽择侧咋啧仄箦赜笮舴昃迮帻","zhai":"债择齐宅寨侧摘窄斋祭翟砦瘵哜","dao":"到道导岛倒刀盗稻蹈悼捣叨祷焘氘纛刂帱忉","ceng":"层曾蹭噌","zha":"查扎炸诈闸渣咋乍榨楂札栅眨咤柞喳喋铡蚱吒怍砟揸痄哳齄","chai":"差拆柴钗豺侪虿瘥","ci":"次此差词辞刺瓷磁兹慈茨赐祠伺雌疵鹚糍呲粢","zi":"资自子字齐咨滋仔姿紫兹孜淄籽梓鲻渍姊吱秭恣甾孳訾滓锱辎趑龇赀眦缁呲笫谘嵫髭茈粢觜耔","cuo":"措错磋挫搓撮蹉锉厝嵯痤矬瘥脞鹾","chan":"产单阐崭缠掺禅颤铲蝉搀潺蟾馋忏婵孱觇廛谄谗澶骣羼躔蒇冁","shan":"山单善陕闪衫擅汕扇掺珊禅删膳缮赡鄯栅煽姗跚鳝嬗潸讪舢苫疝掸膻钐剡蟮芟埏彡骟","zhan":"展战占站崭粘湛沾瞻颤詹斩盏辗绽毡栈蘸旃谵搌","xin":"新心信辛欣薪馨鑫芯锌忻莘昕衅歆囟忄镡","lian":"联连练廉炼脸莲恋链帘怜涟敛琏镰濂楝鲢殓潋裢裣臁奁莶蠊蔹","chang":"场长厂常偿昌唱畅倡尝肠敞倘猖娼淌裳徜昶怅嫦菖鲳阊伥苌氅惝鬯","zhang":"长张章障涨掌帐胀彰丈仗漳樟账杖璋嶂仉瘴蟑獐幛鄣嫜","chao":"超朝潮炒钞抄巢吵剿绰嘲晁焯耖怊","zhao":"着照招找召朝赵兆昭肇罩钊沼嘲爪诏濯啁棹笊","zhou":"调州周洲舟骤轴昼宙粥皱肘咒帚胄绉纣妯啁诌繇碡籀酎荮","che":"车彻撤尺扯澈掣坼砗屮","ju":"车局据具举且居剧巨聚渠距句拒俱柜菊拘炬桔惧矩鞠驹锯踞咀瞿枸掬沮莒橘飓疽钜趄踽遽琚龃椐苣裾榘狙倨榉苴讵雎锔窭鞫犋屦醵","cheng":"成程城承称盛抢乘诚呈净惩撑澄秤橙骋逞瞠丞晟铛埕塍蛏柽铖酲裎枨","rong":"容荣融绒溶蓉熔戎榕茸冗嵘肜狨蝾","sheng":"生声升胜盛乘圣剩牲甸省绳笙甥嵊晟渑眚","deng":"等登邓灯澄凳瞪蹬噔磴嶝镫簦戥","zhi":"制之治质职只志至指织支值知识直致执置止植纸拓智殖秩旨址滞氏枝芝脂帜汁肢挚稚酯掷峙炙栉侄芷窒咫吱趾痔蜘郅桎雉祉郦陟痣蛭帙枳踯徵胝栀贽祗豸鸷摭轵卮轾彘觯絷跖埴夂黹忮骘膣踬","zheng":"政正证争整征郑丁症挣蒸睁铮筝拯峥怔诤狰徵钲","tang":"堂唐糖汤塘躺趟倘棠烫淌膛搪镗傥螳溏帑羰樘醣螗耥铴瑭","chi":"持吃池迟赤驰尺斥齿翅匙痴耻炽侈弛叱啻坻眙嗤墀哧茌豉敕笞饬踟蚩柢媸魑篪褫彳鸱螭瘛眵傺","shi":"是时实事市十使世施式势视识师史示石食始士失适试什泽室似诗饰殖释驶氏硕逝湿蚀狮誓拾尸匙仕柿矢峙侍噬嗜栅拭嘘屎恃轼虱耆舐莳铈谥炻豕鲥饣螫酾筮埘弑礻蓍鲺贳","qi":"企其起期气七器汽奇齐启旗棋妻弃揭枝歧欺骑契迄亟漆戚岂稽岐琦栖缉琪泣乞砌祁崎绮祺祈凄淇杞脐麒圻憩芪伎俟畦耆葺沏萋骐鳍綦讫蕲屺颀亓碛柒啐汔綮萁嘁蛴槭欹芑桤丌蜞","chuai":"揣踹啜搋膪","tuo":"托脱拓拖妥驼陀沱鸵驮唾椭坨佗砣跎庹柁橐乇铊沲酡鼍箨柝","duo":"多度夺朵躲铎隋咄堕舵垛惰哆踱跺掇剁柁缍沲裰哚隳","xue":"学血雪削薛穴靴谑噱鳕踅泶彐","chong":"重种充冲涌崇虫宠忡憧舂茺铳艟","chou":"筹抽绸酬愁丑臭仇畴稠瞅踌惆俦瘳雠帱","qiu":"求球秋丘邱仇酋裘龟囚遒鳅虬蚯泅楸湫犰逑巯艽俅蝤赇鼽糗","xiu":"修秀休宿袖绣臭朽锈羞嗅岫溴庥馐咻髹鸺貅","chu":"出处础初助除储畜触楚厨雏矗橱锄滁躇怵绌搐刍蜍黜杵蹰亍樗憷楮","tuan":"团揣湍疃抟彖","zhui":"追坠缀揣椎锥赘惴隹骓缒","chuan":"传川船穿串喘椽舛钏遄氚巛舡","zhuan":"专转传赚砖撰篆馔啭颛","yuan":"元员院原源远愿园援圆缘袁怨渊苑宛冤媛猿垣沅塬垸鸳辕鸢瑗圜爰芫鼋橼螈眢箢掾","cuan":"窜攒篡蹿撺爨汆镩","chuang":"创床窗闯幢疮怆","zhuang":"装状庄壮撞妆幢桩奘僮戆","chui":"吹垂锤炊椎陲槌捶棰","chun":"春纯醇淳唇椿蠢鹑朐莼肫蝽","zhun":"准屯淳谆肫窀","cu":"促趋趣粗簇醋卒蹴猝蹙蔟殂徂","dun":"吨顿盾敦蹲墩囤沌钝炖盹遁趸砘礅","qu":"区去取曲趋渠趣驱屈躯衢娶祛瞿岖龋觑朐蛐癯蛆苣阒诎劬蕖蘧氍黢蠼璩麴鸲磲","xu":"需许续须序徐休蓄畜虚吁绪叙旭邪恤墟栩絮圩婿戌胥嘘浒煦酗诩朐盱蓿溆洫顼勖糈砉醑","chuo":"辍绰戳淖啜龊踔辶","zu":"组族足祖租阻卒俎诅镞菹","ji":"济机其技基记计系期际及集级几给积极己纪即继击既激绩急奇吉季齐疾迹鸡剂辑籍寄挤圾冀亟寂暨脊跻肌稽忌饥祭缉棘矶汲畸姬藉瘠骥羁妓讥稷蓟悸嫉岌叽伎鲫诘楫荠戟箕霁嵇觊麂畿玑笈犄芨唧屐髻戢佶偈笄跽蒺乩咭赍嵴虮掎齑殛鲚剞洎丌墼蕺彐芰哜","cong":"从丛匆聪葱囱琮淙枞骢苁璁","zong":"总从综宗纵踪棕粽鬃偬枞腙","cou":"凑辏腠楱","cui":"衰催崔脆翠萃粹摧璀瘁悴淬啐隹毳榱","wei":"为位委未维卫围违威伟危味微唯谓伪慰尾魏韦胃畏帷喂巍萎蔚纬潍尉渭惟薇苇炜圩娓诿玮崴桅偎逶倭猥囗葳隗痿猬涠嵬韪煨艉隹帏闱洧沩隈鲔軎","cun":"村存寸忖皴","zuo":"作做座左坐昨佐琢撮祚柞唑嘬酢怍笮阼胙","zuan":"钻纂攥缵躜","da":"大达打答搭沓瘩惮嗒哒耷鞑靼褡笪怛妲","dai":"大代带待贷毒戴袋歹呆隶逮岱傣棣怠殆黛甙埭诒绐玳呔迨","tai":"台太态泰抬胎汰钛苔薹肽跆邰鲐酞骀炱","ta":"他它她拓塔踏塌榻沓漯獭嗒挞蹋趿遢铊鳎溻闼","dan":"但单石担丹胆旦弹蛋淡诞氮郸耽殚惮儋眈疸澹掸膻啖箪聃萏瘅赕","lu":"路六陆录绿露鲁卢炉鹿禄赂芦庐碌麓颅泸卤潞鹭辘虏璐漉噜戮鲈掳橹轳逯渌蓼撸鸬栌氇胪镥簏舻辂垆","tan":"谈探坦摊弹炭坛滩贪叹谭潭碳毯瘫檀痰袒坍覃忐昙郯澹钽锬","ren":"人任认仁忍韧刃纫饪妊荏稔壬仞轫亻衽","jie":"家结解价界接节她届介阶街借杰洁截姐揭捷劫戒皆竭桔诫楷秸睫藉拮芥诘碣嗟颉蚧孑婕疖桀讦疥偈羯袷哜喈卩鲒骱","yan":"研严验演言眼烟沿延盐炎燕岩宴艳颜殷彦掩淹阎衍铅雁咽厌焰堰砚唁焉晏檐蜒奄俨腌妍谚兖筵焱偃闫嫣鄢湮赝胭琰滟阉魇酽郾恹崦芫剡鼹菸餍埏谳讠厣罨","dang":"当党档荡挡宕砀铛裆凼菪谠","tao":"套讨跳陶涛逃桃萄淘掏滔韬叨洮啕绦饕鼗","tiao":"条调挑跳迢眺苕窕笤佻啁粜髫铫祧龆蜩鲦","te":"特忑忒铽慝","de":"的地得德底锝","dei":"得","di":"的地第提低底抵弟迪递帝敌堤蒂缔滴涤翟娣笛棣荻谛狄邸嘀砥坻诋嫡镝碲骶氐柢籴羝睇觌","ti":"体提题弟替梯踢惕剔蹄棣啼屉剃涕锑倜悌逖嚏荑醍绨鹈缇裼","tui":"推退弟腿褪颓蜕忒煺","you":"有由又优游油友右邮尤忧幼犹诱悠幽佑釉柚铀鱿囿酉攸黝莠猷蝣疣呦蚴莸莜铕宥繇卣牖鼬尢蚰侑","dian":"电点店典奠甸碘淀殿垫颠滇癫巅惦掂癜玷佃踮靛钿簟坫阽","tian":"天田添填甜甸恬腆佃舔钿阗忝殄畋栝掭","zhu":"主术住注助属逐宁著筑驻朱珠祝猪诸柱竹铸株瞩嘱贮煮烛苎褚蛛拄铢洙竺蛀渚伫杼侏澍诛茱箸炷躅翥潴邾槠舳橥丶瘃麈疰","nian":"年念酿辗碾廿捻撵拈蔫鲶埝鲇辇黏","diao":"调掉雕吊钓刁貂凋碉鲷叼铫铞","yao":"要么约药邀摇耀腰遥姚窑瑶咬尧钥谣肴夭侥吆疟妖幺杳舀窕窈曜鹞爻繇徭轺铫鳐崾珧","die":"跌叠蝶迭碟爹谍牒耋佚喋堞瓞鲽垤揲蹀","she":"设社摄涉射折舍蛇拾舌奢慑赦赊佘麝歙畲厍猞揲滠","ye":"业也夜叶射野液冶喝页爷耶邪咽椰烨掖拽曳晔谒腋噎揶靥邺铘揲","xie":"些解协写血叶谢械鞋胁斜携懈契卸谐泄蟹邪歇泻屑挟燮榭蝎撷偕亵楔颉缬邂鲑瀣勰榍薤绁渫廨獬躞","zhe":"喆这者着著浙折哲蔗遮辙辄柘锗褶蜇蛰鹧谪赭摺乇磔螫","ding":"定订顶丁鼎盯钉锭叮仃铤町酊啶碇腚疔玎耵","diu":"丢铥","ting":"听庭停厅廷挺亭艇婷汀铤烃霆町蜓葶梃莛","dong":"动东董冬洞懂冻栋侗咚峒氡恫胴硐垌鸫岽胨","tong":"同通统童痛铜桶桐筒彤侗佟潼捅酮砼瞳恸峒仝嗵僮垌茼","zhong":"中重种众终钟忠仲衷肿踵冢盅蚣忪锺舯螽夂","dou":"都斗读豆抖兜陡逗窦渎蚪痘蔸钭篼","du":"度都独督读毒渡杜堵赌睹肚镀渎笃竺嘟犊妒牍蠹椟黩芏髑","duan":"断段短端锻缎煅椴簖","dui":"对队追敦兑堆碓镦怼憝","rui":"瑞兑锐睿芮蕊蕤蚋枘","yue":"月说约越乐跃兑阅岳粤悦曰钥栎钺樾瀹龠哕刖","tun":"吞屯囤褪豚臀饨暾氽","hui":"会回挥汇惠辉恢徽绘毁慧灰贿卉悔秽溃荟晖彗讳诲珲堕诙蕙晦睢麾烩茴喙桧蛔洄浍虺恚蟪咴隳缋哕","wu":"务物无五武午吴舞伍污乌误亡恶屋晤悟吾雾芜梧勿巫侮坞毋诬呜钨邬捂鹜兀婺妩於戊鹉浯蜈唔骛仵焐芴鋈庑鼯牾怃圬忤痦迕杌寤阢","ya":"亚压雅牙押鸭呀轧涯崖邪芽哑讶鸦娅衙丫蚜碣垭伢氩桠琊揠吖睚痖疋迓岈砑","he":"和合河何核盖贺喝赫荷盒鹤吓呵苛禾菏壑褐涸阂阖劾诃颌嗬貉曷翮纥盍","wo":"我握窝沃卧挝涡斡渥幄蜗喔倭莴龌肟硪","en":"恩摁蒽","n":"嗯唔","er":"而二尔儿耳迩饵洱贰铒珥佴鸸鲕","fa":"发法罚乏伐阀筏砝垡珐","quan":"全权券泉圈拳劝犬铨痊诠荃醛蜷颧绻犭筌鬈悛辁畎","fei":"费非飞肥废菲肺啡沸匪斐蜚妃诽扉翡霏吠绯腓痱芾淝悱狒榧砩鲱篚镄","pei":"配培坏赔佩陪沛裴胚妃霈淠旆帔呸醅辔锫","ping":"平评凭瓶冯屏萍苹乒坪枰娉俜鲆","fo":"佛","hu":"和护户核湖互乎呼胡戏忽虎沪糊壶葫狐蝴弧瑚浒鹄琥扈唬滹惚祜囫斛笏芴醐猢怙唿戽槲觳煳鹕冱瓠虍岵鹱烀轷","ga":"夹咖嘎尬噶旮伽尕钆尜","ge":"个合各革格歌哥盖隔割阁戈葛鸽搁胳舸疙铬骼蛤咯圪镉颌仡硌嗝鬲膈纥袼搿塥哿虼","ha":"哈蛤铪","xia":"下夏峡厦辖霞夹虾狭吓侠暇遐瞎匣瑕唬呷黠硖罅狎瘕柙","gai":"改该盖概溉钙丐芥赅垓陔戤","hai":"海还害孩亥咳骸骇氦嗨胲醢","gan":"干感赶敢甘肝杆赣乾柑尴竿秆橄矸淦苷擀酐绀泔坩旰疳澉","gang":"港钢刚岗纲冈杠缸扛肛罡戆筻","jiang":"将强江港奖讲降疆蒋姜浆匠酱僵桨绛缰犟豇礓洚茳糨耩","hang":"行航杭巷夯吭桁沆绗颃","gong":"工公共供功红贡攻宫巩龚恭拱躬弓汞蚣珙觥肱廾","hong":"红宏洪轰虹鸿弘哄烘泓訇蕻闳讧荭黉薨","guang":"广光逛潢犷胱咣桄","qiong":"穷琼穹邛茕筇跫蛩銎","gao":"高告搞稿膏糕镐皋羔锆杲郜睾诰藁篙缟槁槔","hao":"好号毫豪耗浩郝皓昊皋蒿壕灏嚎濠蚝貉颢嗥薅嚆","li":"理力利立里李历例离励礼丽黎璃厉厘粒莉梨隶栗荔沥犁漓哩狸藜罹篱鲤砺吏澧俐骊溧砾莅锂笠蠡蛎痢雳俪傈醴栎郦俚枥喱逦娌鹂戾砬唳坜疠蜊黧猁鬲粝蓠呖跞疬缡鲡鳢嫠詈悝苈篥轹","jia":"家加价假佳架甲嘉贾驾嫁夹稼钾挟拮迦伽颊浃枷戛荚痂颉镓笳珈岬胛袈郏葭袷瘕铗跏蛱恝哿","luo":"啰落罗络洛逻螺锣骆萝裸漯烙摞骡咯箩珞捋荦硌雒椤镙跞瘰泺脶猡倮蠃","ke":"可科克客刻课颗渴壳柯棵呵坷恪苛咳磕珂稞瞌溘轲窠嗑疴蝌岢铪颏髁蚵缂氪骒钶锞","qia":"卡恰洽掐髂袷咭葜","gei":"给","gen":"根跟亘艮哏茛","hen":"很狠恨痕哏","gou":"构购够句沟狗钩拘勾苟垢枸篝佝媾诟岣彀缑笱鞲觏遘","kou":"口扣寇叩抠佝蔻芤眍筘","gu":"股古顾故固鼓骨估谷贾姑孤雇辜菇沽咕呱锢钴箍汩梏痼崮轱鸪牯蛊诂毂鹘菰罟嘏臌觚瞽蛄酤牿鲴","pai":"牌排派拍迫徘湃俳哌蒎","gua":"括挂瓜刮寡卦呱褂剐胍诖鸹栝呙","tou":"钭投头透偷愉骰亠","guai":"怪拐乖","kuai":"会快块筷脍蒯侩浍郐蒉狯哙","guan":"关管观馆官贯冠惯灌罐莞纶棺斡矜倌鹳鳏盥掼涫","wan":"万完晚湾玩碗顽挽弯蔓丸莞皖宛婉腕蜿惋烷琬畹豌剜纨绾脘菀芄箢","ne":"呢哪呐讷疒","gui":"规贵归轨桂柜圭鬼硅瑰跪龟匮闺诡癸鳜桧皈鲑刽晷傀眭妫炅庋簋刿宄匦","jun":"军均俊君峻菌竣钧骏龟浚隽郡筠皲麇捃","jiong":"窘炯迥炅冂扃","jue":"决绝角觉掘崛诀獗抉爵嚼倔厥蕨攫珏矍蹶谲镢鳜噱桷噘撅橛孓觖劂爝","gun":"滚棍辊衮磙鲧绲丨","hun":"婚混魂浑昏棍珲荤馄诨溷阍","guo":"国过果郭锅裹帼涡椁囗蝈虢聒埚掴猓崞蜾呙馘","hei":"黑嘿嗨","kan":"看刊勘堪坎砍侃嵌槛瞰阚龛戡凵莰","heng":"衡横恒亨哼珩桁蘅","mo":"万没么模末冒莫摩墨默磨摸漠脉膜魔沫陌抹寞蘑摹蓦馍茉嘿谟秣蟆貉嫫镆殁耱嬷麽瘼貊貘","peng":"鹏朋彭膨蓬碰苹棚捧亨烹篷澎抨硼怦砰嘭蟛堋","hou":"后候厚侯猴喉吼逅篌糇骺後鲎瘊堠","hua":"婳化华划话花画滑哗豁骅桦猾铧砉","huai":"怀坏淮徊槐踝","huan":"还环换欢患缓唤焕幻痪桓寰涣宦垸洹浣豢奂郇圜獾鲩鬟萑逭漶锾缳擐","xun":"讯训迅孙寻询循旬巡汛勋逊熏徇浚殉驯鲟薰荀浔洵峋埙巽郇醺恂荨窨蕈曛獯","huang":"黄荒煌皇凰慌晃潢谎惶簧璜恍幌湟蝗磺隍徨遑肓篁鳇蟥癀","nai":"能乃奶耐奈鼐萘氖柰佴艿","luan":"乱卵滦峦鸾栾銮挛孪脔娈","qie":"切且契窃茄砌锲怯伽惬妾趄挈郄箧慊","jian":"建间件见坚检健监减简艰践兼鉴键渐柬剑尖肩舰荐箭浅剪俭碱茧奸歼拣捡煎贱溅槛涧堑笺谏饯锏缄睑謇蹇腱菅翦戬毽笕犍硷鞯牮枧湔鲣囝裥踺搛缣鹣蒹谫僭戋趼楗","nan":"南难男楠喃囡赧腩囝蝻","qian":"前千钱签潜迁欠纤牵浅遣谦乾铅歉黔谴嵌倩钳茜虔堑钎骞阡掮钤扦芊犍荨仟芡悭缱佥愆褰凵肷岍搴箝慊椠","qiang":"强抢疆墙枪腔锵呛羌蔷襁羟跄樯戕嫱戗炝镪锖蜣","xiang":"向项相想乡象响香降像享箱羊祥湘详橡巷翔襄厢镶飨饷缃骧芗庠鲞葙蟓","jiao":"教交较校角觉叫脚缴胶轿郊焦骄浇椒礁佼蕉娇矫搅绞酵剿嚼饺窖跤蛟侥狡姣皎茭峤铰醮鲛湫徼鹪僬噍艽挢敫","zhuo":"着著缴桌卓捉琢灼浊酌拙茁涿镯淖啄濯焯倬擢斫棹诼浞禚","qiao":"桥乔侨巧悄敲俏壳雀瞧翘窍峭锹撬荞跷樵憔鞘橇峤诮谯愀鞒硗劁缲","xiao":"小效销消校晓笑肖削孝萧俏潇硝宵啸嚣霄淆哮筱逍姣箫骁枭哓绡蛸崤枵魈","si":"司四思斯食私死似丝饲寺肆撕泗伺嗣祀厮驷嘶锶俟巳蛳咝耜笥纟糸鸶缌澌姒汜厶兕","kai":"开凯慨岂楷恺揩锴铠忾垲剀锎蒈","jin":"进金今近仅紧尽津斤禁锦劲晋谨筋巾浸襟靳瑾烬缙钅矜觐堇馑荩噤廑妗槿赆衿卺","qin":"亲勤侵秦钦琴禽芹沁寝擒覃噙矜嗪揿溱芩衾廑锓吣檎螓","jing":"经京精境竞景警竟井惊径静劲敬净镜睛晶颈荆兢靖泾憬鲸茎腈菁胫阱旌粳靓痉箐儆迳婧肼刭弪獍","ying":"应营影英景迎映硬盈赢颖婴鹰荧莹樱瑛蝇萦莺颍膺缨瀛楹罂荥萤鹦滢蓥郢茔嘤璎嬴瘿媵撄潆","jiu":"就究九酒久救旧纠舅灸疚揪咎韭玖臼柩赳鸠鹫厩啾阄桕僦鬏","zui":"最罪嘴醉咀蕞觜","juan":"卷捐圈眷娟倦绢隽镌涓鹃鄄蠲狷锩桊","suan":"算酸蒜狻","yun":"员运云允孕蕴韵酝耘晕匀芸陨纭郧筠恽韫郓氲殒愠昀菀狁","qun":"群裙逡麇","ka":"卡喀咖咔咯佧胩","kang":"康抗扛慷炕亢糠伉钪闶","keng":"坑铿吭","kao":"考靠烤拷铐栲尻犒","ken":"肯垦恳啃龈裉","yin":"因引银印音饮阴隐姻殷淫尹荫吟瘾寅茵圻垠鄞湮蚓氤胤龈窨喑铟洇狺夤廴吲霪茚堙","kong":"空控孔恐倥崆箜","ku":"苦库哭酷裤枯窟挎骷堀绔刳喾","kua":"跨夸垮挎胯侉","kui":"亏奎愧魁馈溃匮葵窥盔逵睽馗聩喟夔篑岿喹揆隗傀暌跬蒉愦悝蝰","kuan":"款宽髋","kuang":"况矿框狂旷眶匡筐邝圹哐贶夼诳诓纩","que":"确却缺雀鹊阙瘸榷炔阕悫","kun":"困昆坤捆琨锟鲲醌髡悃阃","kuo":"扩括阔廓蛞","la":"拉落垃腊啦辣蜡喇剌旯砬邋瘌","lai":"来莱赖睐徕籁涞赉濑癞崃疠铼","lan":"兰览蓝篮栏岚烂滥缆揽澜拦懒榄斓婪阑褴罱啉谰镧漤","lin":"林临邻赁琳磷淋麟霖鳞凛拎遴蔺吝粼嶙躏廪檩啉辚膦瞵懔","lang":"浪朗郎廊狼琅榔螂阆锒莨啷蒗稂","liang":"量两粮良辆亮梁凉谅粱晾靓踉莨椋魉墚","lao":"老劳落络牢捞涝烙姥佬崂唠酪潦痨醪铑铹栳耢","mu":"目模木亩幕母牧莫穆姆墓慕牟牡募睦缪沐暮拇姥钼苜仫毪坶","le":"了乐勒肋叻鳓嘞仂泐","lei":"类累雷勒泪蕾垒磊擂镭肋羸耒儡嫘缧酹嘞诔檑","sui":"随岁虽碎尿隧遂髓穗绥隋邃睢祟濉燧谇眭荽","lie":"列烈劣裂猎冽咧趔洌鬣埒捩躐","leng":"冷愣棱楞塄","ling":"领令另零灵龄陵岭凌玲铃菱棱伶羚苓聆翎泠瓴囹绫呤棂蛉酃鲮柃","lia":"俩","liao":"了料疗辽廖聊寥缪僚燎缭撂撩嘹潦镣寮蓼獠钌尥鹩","liu":"流刘六留柳瘤硫溜碌浏榴琉馏遛鎏骝绺镏旒熘鹨锍","lun":"论轮伦仑纶沦抡囵","lv":"率律旅绿虑履吕铝屡氯缕滤侣驴榈闾偻褛捋膂稆","lou":"楼露漏陋娄搂篓喽镂偻瘘髅耧蝼嵝蒌","mao":"贸毛矛冒貌茂茅帽猫髦锚懋袤牦卯铆耄峁瑁蟊茆蝥旄泖昴瞀","long":"龙隆弄垄笼拢聋陇胧珑窿茏咙砻垅泷栊癃","nong":"农浓弄脓侬哝","shuang":"双爽霜孀泷","shu":"术书数属树输束述署熟殊蔬舒疏鼠淑叔暑枢墅俞曙抒竖蜀薯梳戍恕孰沭赎庶漱塾倏澍纾姝菽黍腧秫毹殳疋摅","shuai":"率衰帅摔甩蟀","lve":"略掠锊","ma":"么马吗摩麻码妈玛嘛骂抹蚂唛蟆犸杩","me":"么麽","mai":"买卖麦迈脉埋霾荬劢","man":"满慢曼漫埋蔓瞒蛮鳗馒幔谩螨熳缦镘颟墁鞔嫚","mi":"米密秘迷弥蜜谜觅靡泌眯麋猕谧咪糜宓汨醚嘧弭脒冖幂祢縻蘼芈糸敉","men":"们门闷瞒汶扪焖懑鞔钔","mang":"忙盲茫芒氓莽蟒邙硭漭","meng":"蒙盟梦猛孟萌氓朦锰檬勐懵蟒蜢虻黾蠓艨甍艋瞢礞","miao":"苗秒妙描庙瞄缪渺淼藐缈邈鹋杪眇喵","mou":"某谋牟缪眸哞鍪蛑侔厶","miu":"缪谬","mei":"美没每煤梅媒枚妹眉魅霉昧媚玫酶镁湄寐莓袂楣糜嵋镅浼猸鹛","wen":"文问闻稳温纹吻蚊雯紊瘟汶韫刎璺玟阌","mie":"灭蔑篾乜咩蠛","ming":"明名命鸣铭冥茗溟酩瞑螟暝","na":"内南那纳拿哪娜钠呐捺衲镎肭","nei":"内那哪馁","nuo":"难诺挪娜糯懦傩喏搦锘","ruo":"若弱偌箬","nang":"囊馕囔曩攮","nao":"脑闹恼挠瑙淖孬垴铙桡呶硇猱蛲","ni":"你尼呢泥疑拟逆倪妮腻匿霓溺旎昵坭铌鲵伲怩睨猊","nen":"嫩恁","neng":"能","nin":"您恁","niao":"鸟尿溺袅脲茑嬲","nie":"摄聂捏涅镍孽捻蘖啮蹑嗫臬镊颞乜陧","niang":"娘酿","ning":"宁凝拧泞柠咛狞佞聍甯","nu":"努怒奴弩驽帑孥胬","nv":"女钕衄恧","ru":"入如女乳儒辱汝茹褥孺濡蠕嚅缛溽铷洳薷襦颥蓐","nuan":"暖","nve":"虐疟","re":"热若惹喏","ou":"区欧偶殴呕禺藕讴鸥瓯沤耦怄","pao":"跑炮泡抛刨袍咆疱庖狍匏脬","pou":"剖掊裒","pen":"喷盆湓","pie":"瞥撇苤氕丿","pin":"品贫聘频拼拚颦姘嫔榀牝","se":"色塞瑟涩啬穑铯槭","qing":"情青清请亲轻庆倾顷卿晴氢擎氰罄磬蜻箐鲭綮苘黥圊檠謦","zan":"赞暂攒堑昝簪糌瓒錾趱拶","shao":"少绍召烧稍邵哨韶捎勺梢鞘芍苕劭艄筲杓潲","sao":"扫骚嫂梢缫搔瘙臊埽缲鳋","sha":"沙厦杀纱砂啥莎刹杉傻煞鲨霎嗄痧裟挲铩唼歃","xuan":"县选宣券旋悬轩喧玄绚渲璇炫萱癣漩眩暄煊铉楦泫谖痃碹揎镟儇","ran":"然染燃冉苒髯蚺","rang":"让壤攘嚷瓤穰禳","rao":"绕扰饶娆桡荛","reng":"仍扔","ri":"日","rou":"肉柔揉糅鞣蹂","ruan":"软阮朊","run":"润闰","sa":"萨洒撒飒卅仨脎","suo":"所些索缩锁莎梭琐嗦唆唢娑蓑羧挲桫嗍睃","sai":"思赛塞腮噻鳃","shui":"说水税谁睡氵","sang":"桑丧嗓搡颡磉","sen":"森","seng":"僧","shai":"筛晒","shang":"上商尚伤赏汤裳墒晌垧觞殇熵绱","xing":"行省星腥猩惺兴刑型形邢饧醒幸杏性姓陉荇荥擤悻硎","shou":"收手受首售授守寿瘦兽狩绶艏扌","shuo":"说数硕烁朔铄妁槊蒴搠","su":"速素苏诉缩塑肃俗宿粟溯酥夙愫簌稣僳谡涑蔌嗉觫","shua":"刷耍唰","shuan":"栓拴涮闩","shun":"顺瞬舜吮","song":"送松宋讼颂耸诵嵩淞怂悚崧凇忪竦菘","sou":"艘搜擞嗽嗖叟馊薮飕嗾溲锼螋瞍","sun":"损孙笋荪榫隼狲飧","teng":"腾疼藤滕誊","tie":"铁贴帖餮萜","tu":"土突图途徒涂吐屠兔秃凸荼钍菟堍酴","wai":"外歪崴","wang":"王望往网忘亡旺汪枉妄惘罔辋魍","weng":"翁嗡瓮蓊蕹","zhua":"抓挝爪","yang":"样养央阳洋扬杨羊详氧仰秧痒漾疡泱殃恙鸯徉佯怏炀烊鞅蛘","xiong":"雄兄熊胸凶匈汹芎","yo":"哟唷","yong":"用永拥勇涌泳庸俑踊佣咏雍甬镛臃邕蛹恿慵壅痈鳙墉饔喁","za":"杂扎咱砸咋匝咂拶","zai":"在再灾载栽仔宰哉崽甾","zao":"造早遭枣噪灶燥糟凿躁藻皂澡蚤唣","zei":"贼","zen":"怎谮","zeng":"增曾综赠憎锃甑罾缯","zhei":"这","zou":"走邹奏揍诹驺陬楱鄹鲰","zhuai":"转拽","zun":"尊遵鳟樽撙","dia":"嗲","nou":"耨"};
        // PINYIN_DICTIONARY_END
        const readings = new Map();
        const activePairs = fuzzyPairs.filter((pair) => searchSettings.fuzzy.includes(pair.join('/')));
        for (const [syllable, characters] of Object.entries(dictionary)) {
            const [initial, final] = splitSyllable(syllable);
            const initials = new Set([initial]);
            const finals = new Set([final]);
            for (const [a, b] of activePairs) {
                if (initial === a) initials.add(b);
                else if (initial === b) initials.add(a);
                if (final === a) finals.add(b);
                else if (final === b) finals.add(a);
            }
            const aliases = new Set();
            for (const first of initials)
                for (const last of finals) {
                    const variant = first + last;
                    if (searchSettings.mode === 'xiaohe')
                        for (const code of xiaoheCodes(first, last)) {
                            aliases.add(code);
                            aliases.add(code[0]);
                        }
                    else aliases.add(variant);
                    aliases.add(variant[0]);
                }
            for (const character of characters) {
                if (!readings.has(character)) readings.set(character, new Set([character]));
                const choices = readings.get(character);
                for (const alias of aliases) choices.add(alias);
            }
        }
        for (const [character, choices] of readings) readings.set(character, [...choices]);
        const cache = new WeakMap();
        const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
        const normalize = (value) =>
            value
                .toLowerCase()
                .normalize('NFD')
                .replace(/u\u0308|u:/g, 'v')
                .replace(/[\u0300-\u036f\s]/g, '');
        let previous;
        let normalized;
        return (item, query) => {
            if (query !== previous) {
                previous = query;
                normalized = normalize(query);
            }
            if (!normalized || normalized.length > 128) return false;
            let record = cache.get(item);
            if (record?.name !== item.itemname) {
                const name = normalize(
                    item.itemname
                        .replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => entities[entity])
                        .replace(/§./gu, '')
                );
                record = {
                    name: item.itemname,
                    tokens: Array.from(name, (character) => readings.get(character) || [character])
                };
                cache.set(item, record);
            }
            if (record.query === normalized) return record.result;
            record.query = normalized;
            record.result = false;
            if (normalized.length > record.tokens.length * 6) return false;
            let positions = new Set();
            for (const choices of record.tokens) {
                positions.add(0);
                const next = new Set();
                for (const offset of positions) {
                    const remaining = normalized.slice(offset);
                    for (const choice of choices) {
                        if (choice.startsWith(remaining)) return (record.result = true);
                        if (remaining.startsWith(choice)) next.add(offset + choice.length);
                    }
                }
                positions = next;
            }
            return false;
        };
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
                'Search supports Chinese, English, full pinyin and initials (for example tieding / td).':
                    '支持中文、英文、全拼和首字母（例如 tieding / td）',
                'Choose full pinyin or Xiaohe double pinyin and fuzzy sounds in Chinese display settings.':
                    '可在“中文显示”中选择全拼或小鹤双拼，并设置模糊音。',
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
