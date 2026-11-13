/* Tablet UI script for Trilium's mobile layout. Note "tablet_ui.js", label #widget; its styles are in
   "tablet_ui.css" (#appCss). Labelled #widget (not #run=mobileStartup) so that Trilium runs it
   before it builds the layout: the top-bar tools appear together with the bar. Returns no widget.
   - Canvas notes: zoom, undo/redo and Draw/Done sit in the note's top bar (our buttons press Excalidraw's own, which
     tablet_ui.css hides). Draw hides the rail (or the bottom bar) and the note tree; Done brings them back.
   - Tool options (colour, width, opacity): a button in the top bar opens and closes them (the right panel in
     landscape); tapping a tool only changes the tool.
   - Pen mode: once Excalidraw has seen a pen ("Pen mode - prevent touch" on), one finger moves the sheet while a
     drawing tool is active (Excalidraw itself ignores that finger). Two fingers still pinch-zoom.
   - "New" asks for the note type first (a panel with Trilium's types), then creates the note.
   - "Search" opens the quick search in the left panel (results as you type) instead of a search note.
   - Pen taps that the WebView ends without a click (after writing) are completed by the script.
   - Canvas: shape tools stay active after drawing (the padlock is on in every note, unless opened by hand). The pen
     mode and padlock toggles sit in the top bar, so the tool bar is narrower and stays centred.
   - Canvas: a left panel opening or closing does not move the drawing on screen; the pen-mode button shows from the
     start (the tool bar no longer grows at the first pen tap), pen mode still turns on at the first pen stroke.
   - "Notes" launcher (a script launcher, icon bx-sitemap): green while the note tree is open. The tree closes when a
     note is chosen in it, or at a tap on the open note.
   - Collections: the collection's bar (view type, settings, calendar navigation) joins the note's title row when it
     fits there.
   - Canvas tool options: stroke width is a continuous slider (0.5-12) instead of three buttons; Stroke and Background
     have a row of the user's own colours (add, apply, remove), kept on the device; the pencil has a "Pen pressure"
     slider that stretches the pen's pressure.
   Turn it off: rename the label to #disabled:widget and restart the app. */
// a #widget note must hand Trilium its widgets: none here (the code below only adds behaviour)
if (typeof module !== 'undefined') module.exports = [];

(() => {
    // widgets load on the desktop layout too: this is for the mobile one only
    if (window.glob && glob.device && glob.device !== 'mobile') return;
    if (window.__tabletUiStarted) return;
    window.__tabletUiStarted = true;
    const body = document.body;
    const q = s => document.querySelector(s);
    const exq = s => q('.note-split.active .excalidraw ' + s);

    // ---------------------------------------------------------------- canvas tools in the top bar
    const tools = document.createElement('div');
    tools.id = 'tui-canvas-tools';
    tools.innerHTML =
        '<button type="button" data-act="zoom-out" class="icon-action bx bx-minus" aria-label="Zoom out"></button>' +
        '<button type="button" data-act="zoom-reset" class="tui-zoom" aria-label="Reset zoom">100%</button>' +
        '<button type="button" data-act="zoom-in" class="icon-action bx bx-plus" aria-label="Zoom in"></button>' +
        '<span class="tui-sep"></span>' +
        '<button type="button" data-act="undo" class="icon-action bx bx-undo" aria-label="Undo"></button>' +
        '<button type="button" data-act="redo" class="icon-action bx bx-redo" aria-label="Redo"></button>' +
        '<span class="tui-sep"></span>' +
        '<button type="button" data-act="penmode" class="icon-action bx bx-pen tui-penmode" aria-label="Pen mode: one finger moves the sheet"></button>' +
        '<button type="button" data-act="lock" class="icon-action bx bx-lock-open-alt tui-lock" aria-label="Keep the tool active after drawing"></button>' +
        '<button type="button" data-act="props" class="icon-action bx bx-slider-alt tui-props" aria-label="Tool options"></button>' +
        '<button type="button" data-act="draw" class="icon-action bx tui-draw" aria-label="Full-screen drawing"></button>';
    const target = {
        'zoom-out': '.zoom-out-button',
        'zoom-reset': '.reset-zoom-button',
        'zoom-in': '.zoom-in-button',
        'undo': '.undo-button-container button',
        'redo': '.redo-button-container button'
    };
    const drawBtn = tools.querySelector('.tui-draw');
    const renderDraw = () => {
        const on = body.classList.contains('tui-focus');
        drawBtn.classList.toggle('bx-fullscreen', !on);
        drawBtn.classList.toggle('bx-exit-fullscreen', on);
        drawBtn.classList.toggle('on', on);
        drawBtn.setAttribute('aria-pressed', String(on));
        drawBtn.setAttribute('aria-label', on ? 'Done: show the note tree and the bars' : 'Full-screen drawing');
    };
    renderDraw();
    tools.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'penmode' || act === 'lock') {   // Excalidraw's own toggles, moved here from its tool bar
            const app = q('.note-split.active .excalidraw')?.__tuiApp;
            if (!app) return;
            if (act === 'penmode') app.setState(s => ({ penMode: !s.penMode, penDetected: true }));
            else app.setState(s => ({ activeTool: { ...s.activeTool, locked: !s.activeTool.locked } }));
            setTimeout(syncTools, 60);
            return;
        }
        if (act === 'props') {
            body.classList.toggle('tui-props-open');
            syncTools();
            return;
        }
        if (act === 'draw') {
            body.classList.toggle('tui-focus');
            renderDraw();
            setTimeout(() => window.dispatchEvent(new Event('resize')), 60);   // Excalidraw measures its new size
            return;
        }
        const t = exq(target[act]);
        if (t && !t.disabled) t.click();
        setTimeout(syncTools, 60);
    });
    // mirror Excalidraw's state: zoom value, undo/redo available
    const syncTools = () => {
        const reset = exq('.reset-zoom-button');
        const label = tools.querySelector('.tui-zoom');
        if (reset && label.textContent !== reset.textContent.trim()) label.textContent = reset.textContent.trim() || '100%';
        for (const act of ['undo', 'redo']) {
            const src = exq(target[act]);
            tools.querySelector(`[data-act="${act}"]`).disabled = !src || src.disabled;
        }
        const appNow = q('.note-split.active .excalidraw')?.__tuiApp;
        const pen = tools.querySelector('[data-act="penmode"]'), lock = tools.querySelector('[data-act="lock"]');
        const penOn = !!(appNow && appNow.state.penMode), lockOn = !!(appNow && appNow.state.activeTool && appNow.state.activeTool.locked);
        pen.disabled = lock.disabled = !appNow;
        pen.classList.toggle('on', penOn);
        pen.setAttribute('aria-pressed', String(penOn));
        lock.classList.toggle('on', lockOn);
        lock.classList.toggle('bx-lock-alt', lockOn);
        lock.classList.toggle('bx-lock-open-alt', !lockOn);
        lock.setAttribute('aria-pressed', String(lockOn));
        const bar = exq('.App-menu_top .shapes-section');
        if (bar) body.style.setProperty('--tui-tb-half', Math.ceil(bar.getBoundingClientRect().width / 2) + 'px');
        const props = tools.querySelector('[data-act="props"]');
        const available = !!exq('.Island.App-menu__left');
        props.disabled = !available;
        props.classList.toggle('on', available && body.classList.contains('tui-props-open'));
        props.setAttribute('aria-pressed', String(props.classList.contains('on')));
    };
    // one colour for the top bar, the rail and the tool bars: the rail's, read from the theme
    const syncChrome = () => {
        const pane = q('#launcher-pane');
        if (!pane) return;
        const c = getComputedStyle(pane).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' && body.style.getPropertyValue('--tui-chrome-bg') !== c) {
            body.style.setProperty('--tui-chrome-bg', c);
        }
    };
    // keep the tools in the active note's top bar, before its own buttons on the right
    const place = () => {
        const row = q('.note-split.active .title-row');
        const anchor = row && row.querySelector('.mobile-note-panel-button');
        if (row && anchor && tools.parentElement !== row) row.insertBefore(tools, anchor);
        if (!q('.note-split.active.type-canvas') && body.classList.contains('tui-focus')) {
            body.classList.remove('tui-focus');
            renderDraw();
        }
    };

    // ---------------------------------------------------------------- "Notes" launcher: green while the tree is open
    const syncNotes = () => {
        if (!treeOpen() && body.classList.contains('tui-search-open')) body.classList.remove('tui-search-open');
        const b = q('#launcher-pane .launcher-button.bx-sitemap');
        if (!b) return;
        const w = document.getElementById('mobile-sidebar-wrapper');
        b.classList.toggle('on', !!w && !w.classList.contains('left-pane-hidden'));
    };
    // Menu and the tree share the left panel: tapping Notes while Menu is open closes Menu and shows the tree (instead
    // of toggling a tree that Menu was hiding)
    const menuOpen = () => !!q('.tn-dropdown-portal.global-menu > .dropdown-menu.show');
    const treeOpen = () => { const w = document.getElementById('mobile-sidebar-wrapper'); return !!w && !w.classList.contains('left-pane-hidden'); };
    let swallowNotesClick = false;
    document.addEventListener('pointerdown', e => {
        if (!e.target || !e.target.closest || !e.target.closest('#launcher-pane .launcher-button.bx-sitemap')) return;
        if (menuOpen()) {
            q('#launcher-pane .global-menu-button')?.click();   // closes Menu
            swallowNotesClick = treeOpen();                     // the tree is already open: just let it show
        }
    }, true);
    document.addEventListener('click', e => {
        if (!e.target || !e.target.closest || !e.target.closest('#launcher-pane .launcher-button.bx-sitemap')) return;
        if (body.classList.contains('tui-search-open') && treeOpen()) {   // from the search to the tree: keep the panel
            body.classList.remove('tui-search-open');
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if (swallowNotesClick) { swallowNotesClick = false; e.stopPropagation(); e.preventDefault(); }
        setTimeout(syncNotes, 120);
    }, true);

    // side panels change the canvas size: tell Excalidraw to measure itself again
    let panelState = '';
    const syncPanels = () => {
        const s = [menuOpen(), treeOpen(), newOpen(), !!q('.tn-dropdown-portal.right-dropdown-widget > .dropdown-menu.show'),
            !!q('.tn-dropdown-portal.note-actions > .dropdown-menu.show'),
            body.classList.contains('tui-props-open') && !!q('.note-split.active .excalidraw .Island.App-menu__left'),
            body.classList.contains('tui-focus')].join();
        if (s !== panelState) { panelState = s; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); }
    };

    // ---------------------------------------------------------------- collections: one top bar
    // the collection's bar joins the title row when its controls fit between the title (sized to its text, at most
    // 40% of the row) and the buttons on the right; tablet_ui.css places it. Nothing measured here depends on the merge
    const measure = document.createElement('canvas').getContext('2d');
    const syncCollectionBar = () => {
        const split = q('.note-split.active');
        if (!split) return;
        const unmark = () => {
            split.classList.remove('tui-coll-merged', 'tui-coll-compact');
            for (const e of split.querySelectorAll('.tui-coll-static, .tui-coll-bar')) e.classList.remove('tui-coll-static', 'tui-coll-bar');
        };
        const row = split.querySelector(':scope > .title-row');
        const input = row && row.querySelector('.note-title-widget input.note-title');
        const anchor = row && [...row.querySelectorAll('.mobile-note-panel-button, .note-actions, #tui-canvas-tools')]
            .find(e => e.getBoundingClientRect().width > 0);
        // the collection's bar: the one right under the title row (marked bars count even while lifted into it)
        const rr = row && row.getBoundingClientRect();
        const bar = rr && [...split.querySelectorAll('.collection-properties')].find(b => {
            const r = b.getBoundingClientRect();
            return r.height > 0 && (b.classList.contains('tui-coll-bar') || Math.abs(r.top - rr.bottom) < 6);
        });
        if (!bar || !input || !anchor || window.innerWidth < 700) return unmark();
        const cs = getComputedStyle(input);
        measure.font = cs.font;
        const sr = split.getBoundingClientRect();
        const wl = input.getBoundingClientRect().left;
        const text = measure.measureText(input.value || input.placeholder || '').width +
            parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) * 2 + 6;
        const titleW = Math.ceil(Math.min(text, rr.width * 0.4));
        const left = wl - sr.left + titleW + 8;
        const right = sr.right - anchor.getBoundingClientRect().left + 4;
        // what the controls need: their own widths, plus the gaps of their containers. An element that stretches (the
        // calendar's month title) counts with its text, or its min-width if larger, not with the room it fills now
        const natural = k => {
            const ks = getComputedStyle(k);
            if (!(parseFloat(ks.flexGrow) > 0)) return k.getBoundingClientRect().width;
            measure.font = ks.font;
            return Math.max(parseFloat(ks.minWidth) || 0, measure.measureText(k.textContent).width) +
                parseFloat(ks.paddingLeft) + parseFloat(ks.paddingRight) + 4;
        };
        let need = 8;
        for (const c of bar.children) {
            const kids = [...c.children].filter(k => k.getBoundingClientRect().width > 0);
            const gap = parseFloat(getComputedStyle(c).columnGap) || 0;
            need += kids.reduce((s, k) => s + natural(k), 0) + gap * Math.max(0, kids.length - 1) + (kids.length ? 8 : 0);
        }
        // not enough room: the view-type button can show its icon only (.tui-coll-compact); the label's width is
        // measured while it is visible and kept on the button
        const vb = bar.querySelector('.left-container .dropdown-toggle');
        const compactNow = split.classList.contains('tui-coll-compact');
        let saving = 0;
        if (vb) {
            if (!compactNow) {
                measure.font = getComputedStyle(vb).font;
                vb.dataset.tuiFullW = String(vb.getBoundingClientRect().width);
                vb.dataset.tuiSaving = String(Math.max(0, measure.measureText(vb.textContent).width - 5));
            } else if (vb.dataset.tuiFullW) {
                need += parseFloat(vb.dataset.tuiFullW) - vb.getBoundingClientRect().width;   // as if the label showed
            }
            saving = parseFloat(vb.dataset.tuiSaving || '0');
        }
        const avail = sr.width - left - right;
        if (need - (need > avail ? saving : 0) > avail) return unmark();
        split.classList.toggle('tui-coll-compact', need > avail);
        // the containers between the bar and the note pane stop being the bar's reference
        for (let e = bar.parentElement; e && e !== split; e = e.parentElement) {
            if (e.classList.contains('tui-coll-static') || getComputedStyle(e).position !== 'static') e.classList.add('tui-coll-static');
        }
        bar.classList.add('tui-coll-bar');
        split.style.setProperty('--tui-title-w', titleW + 'px');
        split.style.setProperty('--tui-coll-left', left + 'px');
        split.style.setProperty('--tui-coll-right', right + 'px');
        split.style.setProperty('--tui-coll-h', Math.round(rr.height) + 'px');
        split.classList.add('tui-coll-merged');
    };
    // ---------------------------------------------------------------- stroke width: a continuous slider
    // Excalidraw's instance is private to Trilium's canvas widget. It extends Preact's base component class, whose
    // prototype any of Trilium's Preact-wrapped widgets leads to (component.el.__c); wrapping setState there sees the
    // instance at its next state update, and we keep it on its container element. The slider then runs Excalidraw's
    // own "change stroke width" action, so the value is saved and undoable like the three buttons it replaces.
    // Without the instance nothing changes: the buttons stay.
    let baseHooked = false;
    const hookBaseComponent = () => {
        if (baseHooked) return;
        let proto = null;
        for (const d of document.querySelectorAll('[data-component-id^="ReactWrappedWidget"]')) {
            const inst = d.component && d.component.el && d.component.el.__c;
            if (inst) { proto = Object.getPrototypeOf(inst); break; }
        }
        if (!proto || typeof proto.setState !== 'function') return;
        baseHooked = true;
        if (proto.__tuiHooked) return;
        proto.__tuiHooked = true;
        const setState = proto.setState;
        proto.setState = function (...args) {
            if (this && this.actionManager && this.scene) {
                const el = this.excalidrawContainerRef && this.excalidrawContainerRef.current;
                if (el && el.__tuiApp !== this) el.__tuiApp = this;
                // the pen-mode button from the start, so the tool bar does not grow at the first pen tap; pen mode
                // itself still turns on at the first pen stroke (see below), as Excalidraw does
                // the tool stays after drawing a shape (the padlock on), once per note: Excalidraw goes back to the
                // pointer after each rectangle otherwise; opened by hand, it stays open in that note
                const noteKey = location.hash.split('?')[0];
                if (this.state && this.state.activeTool && !this.state.activeTool.locked && this.__tuiLockedFor !== noteKey &&
                    body.classList.contains('mobile')) {
                    this.__tuiLockedFor = noteKey;
                    const app = this;
                    setTimeout(() => app.setState(s => ({ activeTool: { ...s.activeTool, locked: true } })), 0);
                }
                if (this.state && !this.state.penDetected && !this.__tuiPenShown && body.classList.contains('mobile')) {
                    this.__tuiPenShown = true;
                    this.__tuiAutoPen = true;
                    const app = this;
                    setTimeout(() => app.setState({ penDetected: true }), 0);
                }
            }
            return setState.apply(this, args);
        };
    };
    const STROKE = { min: 0.5, max: 12, step: 0.5 };
    const strokeValue = app => {
        // the selected elements' width when they share one, else the width for new elements
        try {
            const ids = app.state.selectedElementIds || {};
            const widths = new Set(app.scene.getNonDeletedElements().filter(e => ids[e.id]).map(e => e.strokeWidth));
            if (widths.size === 1) return [...widths][0];
        } catch (e) { /* older Excalidraw: fall back to the current item */ }
        return app.state.currentItemStrokeWidth;
    };
    const syncStrokeRange = () => {
        hookBaseComponent();
        const ex = q('.note-split.active .excalidraw');
        const app = ex && ex.__tuiApp;
        const fs = ex && ex.querySelector('.Island.App-menu__left [data-testid^="strokeWidth"]')?.closest('fieldset');
        if (!app || !fs) return;
        let box = fs.querySelector(':scope > .tui-stroke-range');
        if (!box) {
            box = document.createElement('div');
            box.className = 'tui-stroke-range';
            box.innerHTML = `<input type="range" min="${STROKE.min}" max="${STROKE.max}" step="${STROKE.step}" aria-label="Stroke width"><output></output>`;
            const input = box.querySelector('input');
            const out = box.querySelector('output');
            input.addEventListener('input', () => { out.textContent = input.value; });
            input.addEventListener('change', () => {
                const a = ex.__tuiApp;
                const action = a && a.actionManager.actions.changeStrokeWidth;
                if (action) a.actionManager.executeAction(action, 'ui', parseFloat(input.value));
            });
            fs.appendChild(box);
        }
        const input = box.querySelector('input');
        if (document.activeElement !== input) {
            const v = strokeValue(app);
            if (typeof v === 'number' && String(v) !== input.value) {
                input.value = String(v);
                box.querySelector('output').textContent = String(v);
            }
        }
    };

    // at most once per frame: the DOM changes often while a note loads
    let collQueued = false;
    const queueCollectionBar = () => {
        if (collQueued) return;
        collQueued = true;
        requestAnimationFrame(() => { collQueued = false; syncCollectionBar(); syncStrokeRange(); syncCanvasLeft(); watchSidebar(); syncActiveRow(); syncPalettes(); syncPressureRange(); });
    };

    new MutationObserver(() => { place(); syncNotes(); queueCollectionBar(); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', queueCollectionBar);
    setInterval(() => { place(); syncNotes(); syncChrome(); syncTools(); syncPanels(); syncCollectionBar(); syncStrokeRange(); syncTreePick(); syncCanvasLeft(); watchSidebar(); syncActiveRow(); syncPalettes(); syncPressureRange(); }, 250);
    place();
    syncNotes();

    // ---------------------------------------------------------------- pen pressure response
    // the pen's pressure moves in a narrow band (often 0.3-0.6), so the pencil's
    // line hardly changes width. Before Excalidraw reads it, the pressure of pen events is stretched around 0.5:
    // p' = 0.5 + (p - 0.5) * k, k = 1 + level / 40 (level 0 = as recorded, 100 = k 3.5), clamped to 0-1. Only pen
    // events; the level is a slider "Pen pressure" in the pencil's tool options, kept in this device's storage.
    const PRESSURE_KEY = 'tui-pressure-v1';
    let pressureLevel = 50;
    try { const v = Number(localStorage.getItem(PRESSURE_KEY)); if (localStorage.getItem(PRESSURE_KEY) !== null && v >= 0 && v <= 100) pressureLevel = v; } catch (e) { /* default */ }
    const stretchPressure = p => {
        if (!(p > 0) || pressureLevel === 0) return p;
        const k = 1 + pressureLevel / 40;
        return Math.min(1, Math.max(0, 0.5 + (p - 0.5) * k));
    };
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
        window.addEventListener(type, e => {
            if (e.pointerType !== 'pen' || pressureLevel === 0) return;
            const p = e.pressure;
            try { Object.defineProperty(e, 'pressure', { value: stretchPressure(p), configurable: true }); } catch (err) { /* leave it */ }
        }, true);
    }
    const syncPressureRange = () => {
        const ex = q('.note-split.active .excalidraw');
        const app = ex && ex.__tuiApp;
        const widthFs = ex && ex.querySelector('.Island.App-menu__left [data-testid^="strokeWidth"]')?.closest('fieldset');
        let box = ex && ex.querySelector('.Island.App-menu__left .tui-pressure');
        const wanted = !!(app && widthFs && app.state.activeTool && app.state.activeTool.type === 'freedraw');
        if (!wanted) { if (box) box.remove(); return; }
        if (!box) {
            box = document.createElement('fieldset');
            box.className = 'tui-pressure';
            box.innerHTML = '<legend>Pen pressure</legend><div class="tui-stroke-range"><input type="range" min="0" max="100" step="5" aria-label="Pen pressure"><output></output></div>';
            const input = box.querySelector('input'), out = box.querySelector('output');
            const show = () => { out.textContent = input.value === '0' ? 'off' : input.value; };
            input.addEventListener('input', () => {
                pressureLevel = Number(input.value);
                try { localStorage.setItem(PRESSURE_KEY, String(pressureLevel)); } catch (e) { /* no storage */ }
                show();
            });
            input.value = String(pressureLevel);
            show();
        }
        if (box.previousElementSibling !== widthFs) widthFs.after(box);
    };

    // ---------------------------------------------------------------- my colours for Stroke and Background
    // under Excalidraw's five colours, a row of the user's own: "+" opens the system colour picker
    // and adds the colour, a tap applies one (Excalidraw's own actions, so it is saved and undoable), the pencil turns on
    // removing (a tap on a colour removes it, Excalidraw's five included; "restore" brings those back; the tick ends
    // it). Kept in this device's storage.
    const PALETTE_KEY = 'tui-palette-v1';
    const KINDS = {
        stroke: { label: /stroke/i, action: 'changeStrokeColor', key: 'currentItemStrokeColor' },
        background: { label: /background/i, action: 'changeBackgroundColor', key: 'currentItemBackgroundColor' }
    };
    const loadPalette = () => {
        try {
            const p = JSON.parse(localStorage.getItem(PALETTE_KEY) || '{}');
            const h = p.hidden || {};
            return {
                stroke: Array.isArray(p.stroke) ? p.stroke : [], background: Array.isArray(p.background) ? p.background : [],
                hidden: { stroke: Array.isArray(h.stroke) ? h.stroke : [], background: Array.isArray(h.background) ? h.background : [] }
            };
        } catch (e) { return { stroke: [], background: [], hidden: { stroke: [], background: [] } }; }
    };
    let palette = loadPalette();
    const savePalette = () => {
        try { localStorage.setItem(PALETTE_KEY, JSON.stringify(palette)); } catch (e) { /* no storage: the row still works now */ }
    };
    let paletteEditing = false;
    const canvasApp = () => q('.note-split.active .excalidraw')?.__tuiApp;
    const applyColour = (kind, colour) => {
        const app = canvasApp();
        const action = app && app.actionManager.actions[KINDS[kind].action];
        if (action) app.actionManager.executeAction(action, 'ui', { [KINDS[kind].key]: colour });
    };
    const colourInput = document.createElement('input');
    colourInput.type = 'color';
    colourInput.tabIndex = -1;
    colourInput.style.cssText = 'position:fixed;left:50%;top:40%;width:1px;height:1px;opacity:0;pointer-events:none;border:0;padding:0';
    document.body.appendChild(colourInput);
    let pickingFor = null;
    colourInput.addEventListener('change', () => {
        if (!pickingFor) return;
        const c = colourInput.value.toLowerCase();
        if (!palette[pickingFor].includes(c)) { palette[pickingFor].push(c); savePalette(); }
        applyColour(pickingFor, c);
        redrawPalettes();
    });
    const onPaletteClick = e => {
        const box = e.currentTarget, kind = box.dataset.kind;
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.act === 'add') {
            pickingFor = kind;
            const cur = String((canvasApp()?.state || {})[KINDS[kind].key] || '');
            if (/^#[0-9a-f]{6}$/i.test(cur)) colourInput.value = cur;
            if (colourInput.showPicker) { try { colourInput.showPicker(); return; } catch (err) { /* fall back to click */ } }
            colourInput.click();
            return;
        }
        if (b.dataset.act === 'edit') { paletteEditing = !paletteEditing; redrawPalettes(); return; }
        if (b.dataset.act === 'reset') { palette.hidden[kind] = []; savePalette(); redrawPalettes(); return; }
        const c = b.dataset.colour;
        if (paletteEditing) {
            palette[kind] = palette[kind].filter(x => x !== c);
            savePalette();
        } else {
            applyColour(kind, c);
        }
        redrawPalettes();
    };
    const syncPalettes = () => {
        const ex = q('.note-split.active .excalidraw');
        const column = ex && ex.querySelector('.Island.App-menu__left .panelColumn');
        const app = ex && ex.__tuiApp;
        if (!column || !app) return;
        for (const row of column.children) {
            const h = row.querySelector(':scope > h3');
            const kind = h && Object.keys(KINDS).find(k => KINDS[k].label.test(h.textContent));
            if (!kind) continue;
            let box = row.querySelector(':scope > .tui-palette');
            if (!box) {
                box = document.createElement('div');
                box.className = 'tui-palette';
                box.dataset.kind = kind;
                box.addEventListener('click', onPaletteClick);
                row.appendChild(box);
            }
            const current = String(app.state[KINDS[kind].key] || '').toLowerCase();
            for (const pick of row.querySelectorAll('.color-picker__top-picks .color-picker__button')) {
                const c = topPickColour(pick);
                const hide = palette.hidden[kind].includes(c);
                if (pick.hasAttribute('data-tui-hidden') !== hide) pick.toggleAttribute('data-tui-hidden', hide);
            }
            if (row.hasAttribute('data-tui-editing') !== paletteEditing) row.toggleAttribute('data-tui-editing', paletteEditing);
            const sig = `${palette[kind].join(',')}|${palette.hidden[kind].join(',')}|${current}|${paletteEditing}`;
            if (box.__sig === sig) continue;
            box.__sig = sig;
            box.classList.toggle('editing', paletteEditing);
            box.innerHTML = palette[kind].map(c =>
                `<button type="button" class="tui-swatch${c === current ? ' active' : ''}" data-colour="${c}" title="${paletteEditing ? 'Remove ' : ''}${c}" style="--tui-swatch:${c}"></button>`).join('') +
                '<button type="button" class="tui-swatch-add bx bx-plus" data-act="add" title="Add a colour" aria-label="Add a colour"></button>' +
                `<button type="button" class="tui-swatch-edit bx ${paletteEditing ? 'bx-check' : 'bx-pencil'}" data-act="edit" title="${paletteEditing ? 'Done' : 'Remove colours'}" aria-label="${paletteEditing ? 'Done' : 'Remove colours'}"></button>` +
                (paletteEditing && palette.hidden[kind].length
                    ? '<button type="button" class="tui-swatch-reset bx bx-reset" data-act="reset" title="Bring back Excalidraw\'s colours" aria-label="Bring back Excalidraw\'s colours"></button>'
                    : '');
        }
    };
    const topPickColour = el => (el.getAttribute('data-testid') || '').replace('color-top-pick-', '').toLowerCase() || String(el.title || '').toLowerCase();
    // while removing, a tap on one of Excalidraw's colours removes it instead of applying it
    document.addEventListener('click', e => {
        if (!paletteEditing) return;
        const pick = e.target && e.target.closest && e.target.closest('.Island.App-menu__left .color-picker__top-picks .color-picker__button');
        if (!pick) return;
        const row = pick.closest('.panelColumn > *');
        const box = row && row.querySelector(':scope > .tui-palette');
        if (!box) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const kind = box.dataset.kind, c = topPickColour(pick);
        if (c && !palette.hidden[kind].includes(c)) { palette.hidden[kind].push(c); savePalette(); }
        redrawPalettes();
    }, true);
    const redrawPalettes = () => {
        for (const b of document.querySelectorAll('.tui-palette')) b.__sig = '';
        syncPalettes();
    };

    // ---------------------------------------------------------------- the tree closes when a note is chosen
    // a note chosen in the tree closes it, and so does a tap on the open note while the
    // tree is open; that tap does nothing else. Rows with children step into them and keep the tree open.
    let closingTree = false;   // our own click on the tree toggle must not be taken for the tap being swallowed
    const closeTree = () => {
        if (!treeOpen()) return;
        closingTree = true;
        try { q('.note-split.active .toggle-sidebar-button button')?.click(); } finally { closingTree = false; }
    };
    let treePick = null;
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('.quick-search-menu')) {   // a result of the quick search, or "Show in full search"
            if (t.closest('.dropdown-item, button')) treePick = { key: location.hash, until: Date.now() + 3000 };
            return;
        }
        if (!t.closest('#mobile-sidebar-wrapper .mobile-note-navigator')) return;
        if (t.closest('.mobile-navigator-back, .mobile-navigator-row-chevron, .mobile-navigator-current-action, .mobile-navigator-row.has-children')) return;
        const row = t.closest('.mobile-navigator-row, .mobile-navigator-current-tile');
        if (!row) return;
        if (row.classList.contains('is-active')) { setTimeout(closeTree, 50); return; }
        treePick = { key: location.hash, until: Date.now() + 3000 };
    }, true);
    const syncTreePick = () => {
        if (!treePick) return;
        if (location.hash !== treePick.key) { treePick = null; closeTree(); }
        else if (Date.now() > treePick.until) treePick = null;
    };
    let swallowTap = false;
    const onNoteContent = t => !!t.closest('.note-split.active') &&
        !t.closest('.title-row, .App-toolbar, .shapes-section, .Island, .classic-toolbar-island, #tui-canvas-tools, .dropdown-menu');
    document.addEventListener('pointerdown', e => {
        swallowTap = false;
        const t = e.target;
        const newShown = typeof newOpen === 'function' && newOpen();   // the New panel closes the same way
        if (!(treeOpen() || newShown) || !t || !t.closest || !onNoteContent(t)) return;
        swallowTap = true;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTree();
        if (newShown) setNewOpen(false);
    }, { capture: true, passive: false });
    for (const type of ['pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick']) {
        document.addEventListener(type, e => {
            if (!swallowTap || closingTree) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (type === 'click') swallowTap = false;
        }, { capture: true, passive: false });
    }

    // ---------------------------------------------------------------- "New": the note type first
    // the New launcher opens a panel with Trilium's note types (its own list, names and
    // icons); the note is created only once a type is chosen, where the stock launcher puts it: the inbox, or today's
    // day note. Landscape: the left panel, in place of the tree or Menu; portrait: over the note.
    const NOTE_TYPES = [
        ['text', '', 'bx-note', 'Text'],
        ['spreadsheet', 'application/json', 'bx-table', 'Spreadsheet'],
        ['book', '', 'bx-book', 'Collection'],
        ['canvas', 'application/json', 'bx-pen', 'Canvas'],
        ['mermaid', 'text/mermaid', 'bx-selection', 'Mermaid Diagram'],
        ['mindMap', 'application/json', 'bx-sitemap', 'Mind Map'],
        ['relationMap', 'application/json', 'bx-shape-polygon', 'Relation Map'],
        ['render', '', 'bx-extension', 'Render Note'],
        ['webView', '', 'bx-globe-alt', 'Web View'],
        ['code', 'text/plain', 'bx-code', 'Code'],
        ['code', 'text/x-markdown', 'bxl-markdown', 'Markdown']
    ];
    const newPanel = document.createElement('div');
    newPanel.id = 'tui-new-panel';
    newPanel.hidden = true;
    newPanel.setAttribute('role', 'dialog');
    newPanel.setAttribute('aria-label', 'New note');
    newPanel.innerHTML = '<div class="tui-new-title">New note</div>' + NOTE_TYPES.map(([, , icon, title], i) =>
        `<button type="button" class="tui-new-item" data-i="${i}"><span class="bx ${icon}"></span><span>${title}</span></button>`).join('');
    document.body.appendChild(newPanel);
    const newButton = () => q('#launcher-pane .launcher-button.bx-file-blank');
    const newOpen = () => !newPanel.hidden;
    const setNewOpen = on => {
        // portrait: the panel ends above the bottom bar
        const pane = q('#launcher-pane');
        const bar = pane && window.innerWidth < 992 ? pane.getBoundingClientRect().height : 0;
        newPanel.style.setProperty('--tui-new-bottom', bar + 'px');
        newPanel.hidden = !on;
        body.classList.toggle('tui-new-open', on);
        newButton()?.classList.toggle('on', on);
    };
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest('#launcher-pane .launcher-button.bx-file-blank')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!newOpen()) {
                if (menuOpen()) q('#launcher-pane .global-menu-button')?.click();
                closeTree();
            }
            setNewOpen(!newOpen());
            return;
        }
        if (newOpen() && !t.closest('#tui-new-panel')) setNewOpen(false);   // a tap elsewhere closes it
    }, true);
    newPanel.addEventListener('click', async e => {
        const b = e.target.closest('.tui-new-item');
        if (!b) return;
        const [type, mime] = NOTE_TYPES[Number(b.dataset.i)];
        setNewOpen(false);
        try {
            // where the stock launcher creates notes: the #inbox note, else today's day note (backend scripts are off
            // by default, so this uses the frontend API); the new note opens with its title ready to type
            const parent = (await api.searchForNote('#inbox')) || (await api.getTodayNote());
            const opts = { type, isProtected: !!parent.isProtected };
            if (mime) opts.mime = mime;
            await api.createNote(parent.noteId, opts);
        } catch (err) {
            if (api.showError) api.showError('The note could not be created: ' + (err && err.message || err));
            else console.error(err);
        }
    });

    // ---------------------------------------------------------------- pen taps that end without a click
    // after writing with the pen, the WebView sometimes ends a pen tap (pointerdown and pointerup on the same button)
    // without the click (seen on the tablet 2026-11-13: a tap on "New" needed a second try). When no click follows
    // within 120 ms (or the system cancels a short tap), the tap is completed here; a late native click on the same
    // element is then ignored, so nothing
    // runs twice. Only for buttons and the like, outside the drawing and text fields.
    const CLICKABLE = 'button, a[href], label, [role="button"], .launcher-button, .dropdown-item, .tui-new-item';
    let penTap = null;
    let completed = null;   // { el, at }: an element whose tap was completed here
    const clickableOf = t => {
        if (!t || !t.closest || t.closest('canvas, input, textarea, [contenteditable="true"]')) return null;
        return t.closest(CLICKABLE);
    };
    window.addEventListener('pointerdown', e => {
        penTap = null;
        if (e.pointerType !== 'pen') return;
        const el = clickableOf(e.target);
        if (el) penTap = { el, id: e.pointerId, at: Date.now() };
    }, true);
    const completeTap = el => {
        if (!el.isConnected) return;
        completed = { el, at: Date.now() };
        el.click();
    };
    // the system can also take a pen tap away from the page (pointercancel a few tens of ms after the pen touched
    // down, seen 2026-11-13): a short one on a button is a tap
    window.addEventListener('pointercancel', e => {
        if (!penTap || e.pointerId !== penTap.id) return;
        const tap = penTap;
        penTap = null;
        if (Date.now() - tap.at < 400) setTimeout(() => completeTap(tap.el), 0);
    }, true);
    window.addEventListener('pointerup', e => {
        if (!penTap || e.pointerId !== penTap.id) return;
        const tap = penTap;
        penTap = null;
        if (clickableOf(e.target) !== tap.el) return;
        // the click is watched on the window, before any handler (ours for New and Search included) stops it
        let clicked = false;
        const seen = ev => { if (ev.target && tap.el.contains(ev.target)) clicked = true; };
        window.addEventListener('click', seen, true);
        setTimeout(() => {
            window.removeEventListener('click', seen, true);
            if (!clicked) completeTap(tap.el);
        }, 120);
    }, true);
    window.addEventListener('click', e => {
        if (!completed || !e.isTrusted) return;
        if (Date.now() - completed.at > 600) { completed = null; return; }
        if (completed.el.contains(e.target)) {   // the native click came after all: already done
            e.preventDefault();
            e.stopImmediatePropagation();
            completed = null;
        }
    }, true);

    // ---------------------------------------------------------------- the drawing stays put when a left panel opens
    // a left panel (tree, Menu, New) or the full-screen drawing moves the drawing area's left edge; Excalidraw would
    // carry the drawing along, so its scroll is shifted by the same amount and the drawing keeps its place on screen
    let canvasEl = null, canvasLeft = 0;
    const syncCanvasLeft = () => {
        const ex = q('.note-split.active .excalidraw');
        if (!ex) { canvasEl = null; return; }
        const left = ex.getBoundingClientRect().left;
        if (ex !== canvasEl) { canvasEl = ex; canvasLeft = left; return; }
        const delta = left - canvasLeft;
        canvasLeft = left;
        const app = ex.__tuiApp;
        if (!delta || !app || !app.state) return;
        const zoom = (app.state.zoom && app.state.zoom.value) || 1;
        app.setState({ scrollX: app.state.scrollX - delta / zoom });
    };
    let leftQueued = false;
    const queueCanvasLeft = () => {
        if (leftQueued) return;
        leftQueued = true;
        requestAnimationFrame(() => { leftQueued = false; syncCanvasLeft(); });
    };
    new MutationObserver(queueCanvasLeft).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const watchSidebar = () => {
        const w = document.getElementById('mobile-sidebar-wrapper');
        if (w && !w.__tuiWatched) {
            w.__tuiWatched = true;
            new MutationObserver(queueCanvasLeft).observe(w, { attributes: true, attributeFilter: ['class'] });
        }
    };

    // ---------------------------------------------------------------- the open note, visible in the tree
    // when the tree opens or shows another level, its list scrolls to the open note's row, which
    // tablet_ui.css marks like the other active items
    let activeRowKey = '';
    const syncActiveRow = () => {
        const nav = treeOpen() && q('#mobile-sidebar-wrapper .mobile-note-navigator');
        const row = nav && nav.querySelector('.mobile-navigator-row.is-active');
        const level = nav && nav.querySelector('.mobile-navigator-current-title');
        const key = nav ? `${level ? level.textContent : ''}|${row ? row.textContent : ''}` : '';
        if (key === activeRowKey) return;
        activeRowKey = key;
        if (row) row.scrollIntoView({ block: 'center' });
    };

    // ---------------------------------------------------------------- "Search": the quick search in the left panel
    // Search no longer replaces the open note with a search note: in landscape it opens the
    // left panel with Trilium's quick search ready to type. The results show after a pause in typing (the quick search
    // itself waits for Enter, which is sent for it), a result opens the note and closes the panel, and "Show in full
    // search" is still there. Search is green while the panel shows the search; Notes turns it into the tree.
    const quickSearchEditor = () => q('#mobile-sidebar-wrapper .quick-search .cm-content');
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || !t.closest || !t.closest('#launcher-pane .launcher-button.bx-search') || window.innerWidth < 992) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (body.classList.contains('tui-search-open') && treeOpen()) { closeTree(); return; }   // Search again: closes
        if (menuOpen()) q('#launcher-pane .global-menu-button')?.click();
        if (newOpen()) setNewOpen(false);
        if (!treeOpen()) q('.note-split.active .toggle-sidebar-button button')?.click();
        body.classList.add('tui-search-open');
        setTimeout(() => quickSearchEditor()?.focus(), 150);
    }, true);
    let searchTimer = null;
    const onSearchTyping = e => {
        if (!e.isTrusted || e.key === 'Enter') return;   // not the Enter sent below
        const ed = e.target && e.target.closest && e.target.closest('#mobile-sidebar-wrapper .quick-search .cm-content');
        if (!ed) return;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (ed.textContent.trim().length < 2 || document.activeElement !== ed) return;
            for (const type of ['keydown', 'keyup']) {
                ed.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
            }
        }, 600);
    };
    // the editor takes the input events itself: its key and composition events tell that the text changed
    for (const type of ['beforeinput', 'keyup', 'compositionend']) document.addEventListener(type, onSearchTyping, true);

    // the first pen stroke on a canvas turns pen mode on (Excalidraw's own rule, which the button shown from the start
    // above would otherwise skip); turned off by hand afterwards, it stays off
    document.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'pen') return;
        const c = e.target && e.target.closest && e.target.closest('canvas.excalidraw__canvas.interactive');
        const app = c && c.closest('.excalidraw').__tuiApp;
        if (!app || !app.__tuiAutoPen) return;
        app.__tuiAutoPen = false;
        if (!app.state.penMode) app.setState({ penMode: true });
    }, true);

    // ---------------------------------------------------------------- one finger moves the sheet in pen mode
    let pan = null;
    const penModeOn = root => !!root.querySelector('.ToolIcon__penMode input:checked');
    const activeTool = root => {
        const i = root.querySelector('.App-toolbar input[type=radio]:checked');
        return i ? (i.getAttribute('data-testid') || '').replace('toolbar-', '') : '';
    };
    document.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'touch') return;
        if (pan) { pan = null; return; }   // a second finger: leave pinch-zoom to Excalidraw
        const canvas = e.target && e.target.closest && e.target.closest('canvas.excalidraw__canvas.interactive');
        if (!canvas) return;
        const root = canvas.closest('.excalidraw');
        if (!root || !penModeOn(root)) return;
        if (['selection', 'lasso', 'text', 'image', 'hand', 'laser'].includes(activeTool(root))) return;
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY, canvas };
    }, true);
    document.addEventListener('pointermove', e => {
        if (!pan || e.pointerId !== pan.id) return;
        const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
        pan.x = e.clientX;
        pan.y = e.clientY;
        if (!dx && !dy) return;
        pan.canvas.dispatchEvent(new WheelEvent('wheel', {
            deltaX: -dx, deltaY: -dy, deltaMode: 0, bubbles: true, cancelable: true,
            clientX: e.clientX, clientY: e.clientY
        }));
    }, true);
    const stop = e => { if (pan && e.pointerId === pan.id) pan = null; };
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);
})();
