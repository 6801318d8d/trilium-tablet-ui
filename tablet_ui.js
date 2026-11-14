// SPDX-License-Identifier: AGPL-3.0-or-later
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
   - A long press on an icon button shows its name (hover tooltips never show on a touch screen); that press does not
     press the button.
   - Canvas: one zoom button with a menu (zoom in, zoom out, fit to drawing, 100%); rectangle, diamond and ellipse
     share a "Shapes" button, arrow and line a "Lines" button; a drawing tool stays active after drawing (Excalidraw's
     padlock, always on: its button is hidden); pen mode is a switch in the tool options; a row of colours and three
     thicknesses above the tool bar while a drawing tool is active; the eraser deletes strokes as soon as it
     touches them. The pen's button, in the pen service's Remote control mode, switches to the eraser and back.
     A pen side button that reaches the page as
     button 2 erases while held (on the tablet this was made on, the pen's button never reaches the page).
   - Canvas images load in the Android app too (its fetch repeats the Content-Type header, see below).
   - "Note panel" (outline, attributes, connections): an info icon, and in landscape a docked right panel, like "…".
   - "New": an optional title; without one the note is named after its type and the time.
   - Text notes in landscape: the outline of the headings in the free space right of the reading column.
   - A few seconds after an edit the app syncs at once (it syncs once a minute otherwise), so the server and the web
     pages open on it show the change within seconds.
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

    // ---------------------------------------------------------------- canvas images: one Content-Type
    // The Android app answers api/ requests through its own fetch, which repeats the Content-Type header
    // ("image/png, image/png"). The blob of a canvas image gets that type, the data URL Trilium builds from it
    // ("data:image/png, image/png;base64,...") does not decode, and Excalidraw shows a broken image although the
    // attachment is fine. An image response whose Content-Type repeats one value gets that value once.
    if (typeof window.fetch === 'function' && !window.fetch.__tuiOneType) {
        const fetchBefore = window.fetch;
        const fetchOneType = async function (...args) {
            const res = await fetchBefore.apply(this, args);
            try {
                const ct = res.headers.get('content-type') || '';
                if (res.status !== 200 || !ct.includes(',')) return res;
                const parts = ct.split(',').map(s => s.trim()).filter(Boolean);
                const one = parts[0].toLowerCase();
                if (!one.startsWith('image/') || !parts.every(p => p.toLowerCase() === one)) return res;
                const headers = new Headers(res.headers);
                headers.set('content-type', parts[0]);
                const bytes = await res.arrayBuffer();
                return new Response(new Blob([bytes], { type: parts[0] }), { status: res.status, statusText: res.statusText, headers });
            } catch (err) {
                return res;
            }
        };
        fetchOneType.__tuiOneType = true;
        window.fetch = fetchOneType;
    }

    // ---------------------------------------------------------------- canvas tools in the top bar
    const tools = document.createElement('div');
    tools.id = 'tui-canvas-tools';
    tools.innerHTML =
        '<button type="button" data-act="zoom" class="tui-zoom" aria-label="Zoom" aria-haspopup="menu" aria-expanded="false">100%</button>' +
        '<span class="tui-sep"></span>' +
        '<button type="button" data-act="undo" class="icon-action bx bx-undo" aria-label="Undo"></button>' +
        '<button type="button" data-act="redo" class="icon-action bx bx-redo" aria-label="Redo"></button>' +
        '<span class="tui-sep"></span>' +
        '<button type="button" data-act="penmode" class="icon-action bx bx-pen tui-penmode" aria-label="Pen mode: one finger moves the sheet"></button>' +
        '<button type="button" data-act="lock" class="icon-action bx bx-lock-open-alt tui-lock" aria-label="Keep the tool active after drawing"></button>' +
        '<button type="button" data-act="props" class="icon-action bx bx-slider-alt tui-props" aria-label="Tool options"></button>' +
        '<button type="button" data-act="draw" class="icon-action bx tui-draw" aria-label="Full-screen drawing"></button>';
    const target = {
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
    // zoom: one button showing the zoom level; its menu zooms in and out (it stays open for repeated taps), fits the
    // drawing to the screen or goes back to 100%. Pinching with two fingers still zooms too.
    const zoomBtn = tools.querySelector('[data-act="zoom"]');
    const zoomMenu = document.createElement('div');
    zoomMenu.id = 'tui-zoom-menu';
    zoomMenu.hidden = true;
    zoomMenu.setAttribute('role', 'menu');
    zoomMenu.innerHTML = [['in', 'bx-zoom-in', 'Zoom in'], ['out', 'bx-zoom-out', 'Zoom out'], ['fit', 'bx-expand-alt', 'Fit to drawing'],
        ['reset', 'bx-reset', 'Zoom to 100%']].map(([z, icon, label]) =>
        `<button type="button" role="menuitem" data-z="${z}"><span class="bx ${icon}"></span><span>${label}</span></button>`).join('');
    document.body.appendChild(zoomMenu);
    const setZoomOpen = on => {
        if (on) {
            const r = zoomBtn.getBoundingClientRect();
            zoomMenu.hidden = false;
            const w = zoomMenu.offsetWidth;
            zoomMenu.style.top = Math.round(r.bottom + 6) + 'px';
            zoomMenu.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
        } else {
            zoomMenu.hidden = true;
        }
        zoomBtn.classList.toggle('on', on);
        zoomBtn.setAttribute('aria-expanded', String(on));
    };
    zoomMenu.addEventListener('click', e => {
        const b = e.target.closest('[data-z]');
        if (!b) return;
        let z = b.dataset.z;
        const app = q('.note-split.active .excalidraw')?.__tuiApp;
        // an empty drawing has nothing to fit (Excalidraw would zoom out to 10 %): 100 % instead
        if (z === 'fit' && app && !app.scene.getNonDeletedElements().length) z = 'reset';
        if (z === 'fit') {
            const action = app && (app.actionManager.actions.zoomToFit || app.actionManager.actions.zoomToFitSelection);
            if (action) app.actionManager.executeAction(action, 'ui');
        } else {
            const t = exq({ in: '.zoom-in-button', out: '.zoom-out-button', reset: '.reset-zoom-button' }[z]);
            if (t && !t.disabled) t.click();
        }
        if (z === 'fit' || z === 'reset') setZoomOpen(false);
        setTimeout(syncTools, 60);
    });
    document.addEventListener('pointerdown', e => {   // a tap elsewhere closes the menu (and still does its own job)
        if (zoomMenu.hidden || !e.target || !e.target.closest) return;
        if (!e.target.closest('#tui-zoom-menu, #tui-canvas-tools .tui-zoom')) setZoomOpen(false);
    }, true);

    // the padlock (keep the tool active after drawing) is on in every canvas note, and comes back on after Excalidraw
    // resets it (opening a note, loading its content), unless it was opened by hand in that note
    const canvasNoteId = () => location.hash.split('?')[0].split('/').pop() || '';
    const unlockedByHand = new Set();

    tools.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'zoom') { setZoomOpen(zoomMenu.hidden); return; }
        if (act === 'penmode' || act === 'lock') {   // Excalidraw's own toggles, moved here from its tool bar
            const app = q('.note-split.active .excalidraw')?.__tuiApp;
            if (!app) return;
            if (act === 'penmode') app.setState(s => ({ penMode: !s.penMode, penDetected: true }));
            else {
                const lockNow = !app.state.activeTool.locked;
                if (lockNow) unlockedByHand.delete(canvasNoteId()); else unlockedByHand.add(canvasNoteId());
                app.setState(s => ({ activeTool: { ...s.activeTool, locked: lockNow } }));
            }
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
    // writes only when the value changes: the same value written again still counts as a DOM change, which the
    // WebView then processes (every 250 ms, also while drawing)
    const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
    const setDisabled = (el, value) => { if (el.disabled !== value) el.disabled = value; };
    const setStyleVar = (el, name, value) => { if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value); };
    const setPos = (el, props) => { for (const [k, v] of Object.entries(props)) if (el.style[k] !== v) el.style[k] = v; };
    // mirror Excalidraw's state: zoom value, undo/redo available
    const syncTools = () => {
        const reset = exq('.reset-zoom-button');
        const label = tools.querySelector('.tui-zoom');
        if (reset && label.textContent !== reset.textContent.trim()) label.textContent = reset.textContent.trim() || '100%';
        for (const act of ['undo', 'redo']) {
            const src = exq(target[act]);
            setDisabled(tools.querySelector(`[data-act="${act}"]`), !src || src.disabled);
        }
        const appNow = q('.note-split.active .excalidraw')?.__tuiApp;
        const pen = tools.querySelector('[data-act="penmode"]'), lock = tools.querySelector('[data-act="lock"]');
        const penOn = !!(appNow && appNow.state.penMode), lockOn = !!(appNow && appNow.state.activeTool && appNow.state.activeTool.locked);
        setDisabled(pen, !appNow);
        setDisabled(lock, !appNow);
        pen.classList.toggle('on', penOn);
        setAttr(pen, 'aria-pressed', String(penOn));
        lock.classList.toggle('on', lockOn);
        lock.classList.toggle('bx-lock-alt', lockOn);
        lock.classList.toggle('bx-lock-open-alt', !lockOn);
        setAttr(lock, 'aria-pressed', String(lockOn));
        const bar = exq('.App-menu_top .shapes-section');
        if (bar) setStyleVar(body, '--tui-tb-half', Math.ceil(bar.getBoundingClientRect().width / 2) + 'px');
        const props = tools.querySelector('[data-act="props"]');
        const available = !!exq('.Island.App-menu__left');
        setDisabled(props, !available);
        props.classList.toggle('on', available && body.classList.contains('tui-props-open'));
        setAttr(props, 'aria-pressed', String(props.classList.contains('on')));
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
        if (!q('.note-split.active.type-canvas') && !zoomMenu.hidden) setZoomOpen(false);
        // Trilium's two buttons on the right have their names only in hover tooltips: give them accessible names, which
        // the long press below shows
        for (const [icon, name] of [['bx-dock-bottom', 'Note panel'], ['bx-dots-horizontal-rounded', 'Note menu']]) {
            for (const b of document.querySelectorAll(`.title-row .icon-action.${icon}`)) {
                if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', name);
            }
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
            !!q('.tn-dropdown-portal.note-actions > .dropdown-menu.show'), !!q('.modal.mobile-note-panel.show'),
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
            for (const c of ['tui-coll-merged', 'tui-coll-compact']) if (split.classList.contains(c)) split.classList.remove(c);
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
                // the tool stays after drawing a shape or a frame (the padlock on): Excalidraw goes back to the pointer
                // otherwise. Keyed by the note's id, not its path (opening a note from a partial path rewrites the
                // path while the canvas loads and resets the padlock); opened by hand, it stays open in that note.
                // The image tool is left alone (locked, it would ask for another image after each one).
                const lockWanted = app => {
                    const tool = app.state && app.state.activeTool;
                    const nid = canvasNoteId();
                    return !!tool && !tool.locked && tool.type !== 'image' && !!nid && !unlockedByHand.has(nid) &&
                        body.classList.contains('mobile');
                };
                if (lockWanted(this) && !this.__tuiLocking) {
                    this.__tuiLocking = true;
                    const app = this;
                    setTimeout(() => {
                        app.__tuiLocking = false;
                        if (lockWanted(app)) app.setState(s => ({ activeTool: { ...s.activeTool, locked: true } }));
                    }, 0);
                }
                // the eraser deletes strokes as soon as it touches them: Excalidraw greys them out (20 %) and deletes them
                // only when the pen lifts. Its eraser handler runs at each eraser movement and marks the strokes it
                // met; right after it, Excalidraw's own eraseElements (what it runs when the pen lifts) deletes them,
                // saved and undoable as usual. Nothing runs while the eraser meets no stroke.
                if (!this.__tuiEraseHooked && typeof this.handleEraser === 'function' && typeof this.eraseElements === 'function') {
                    this.__tuiEraseHooked = true;
                    const app = this, handleEraser = this.handleEraser;
                    this.handleEraser = (...args) => {
                        handleEraser.apply(app, args);
                        if (app.elementsPendingErasure && app.elementsPendingErasure.size) app.eraseElements();
                    };
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

    // quiet while drawing: while a pen or a finger is down on the drawing, the DOM work below (measuring and placing
    // bars and panels) waits, so the stroke's frames carry only Excalidraw's own work; it runs once when it lifts
    let drawingDown = null, missedWhileDrawing = false;
    window.addEventListener('pointerdown', e => {
        if (e.target && e.target.closest && e.target.closest('canvas.excalidraw__canvas.interactive')) drawingDown = e.pointerId;
    }, true);
    for (const type of ['pointerup', 'pointercancel']) {
        window.addEventListener(type, e => {
            if (drawingDown === null || e.pointerId !== drawingDown) return;
            drawingDown = null;
            if (missedWhileDrawing) { missedWhileDrawing = false; setTimeout(() => { queueCollectionBar(); syncTools(); }, 0); }
        }, true);
    }
    const drawingNow = () => { if (drawingDown === null) return false; missedWhileDrawing = true; return true; };

    // at most once per frame: the DOM changes often while a note loads
    let collQueued = false;
    const queueCollectionBar = () => {
        if (drawingNow()) return;
        if (collQueued) return;
        collQueued = true;
        requestAnimationFrame(() => { collQueued = false; syncCollectionBar(); syncStrokeRange(); syncCanvasLeft(); watchSidebar(); syncActiveRow(); syncPalettes(); syncPressureRange(); syncOutline(); syncShapes(); syncQuickColours(); syncPenModeRow(); syncSearchRows(); syncBookmarkRows(); });
    };

    new MutationObserver(() => { if (drawingNow()) return; place(); syncNotes(); queueCollectionBar(); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', queueCollectionBar);
    setInterval(() => { if (drawingNow()) return; place(); syncNotes(); syncChrome(); syncTools(); syncPanels(); syncCollectionBar(); syncStrokeRange(); syncTreePick(); syncCanvasLeft(); watchSidebar(); syncActiveRow(); syncPalettes(); syncPressureRange(); syncOutline(); syncShapes(); syncQuickColours(); syncPenModeRow(); syncSearchRows(); syncBookmarkRows(); }, 250);
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
    // an optional title above the types; without one the note is named after its type and the time ("Canvas 07:42"),
    // with the date too when it does not go into a day note, so the tree does not fill with notes called "New note"
    newPanel.innerHTML = '<div class="tui-new-title">New note</div>' +
        '<input type="text" class="tui-new-name" placeholder="Title (optional)" aria-label="Title of the new note" ' +
        'autocomplete="off" enterkeyhint="done">' +
        '<div class="tui-new-hint">Without a title: the type and the time, e.g. "Canvas 07:42"</div>' +
        NOTE_TYPES.map(([, , icon, title], i) =>
            `<button type="button" class="tui-new-item" data-i="${i}"><span class="bx ${icon}"></span><span>${title}</span></button>`).join('');
    document.body.appendChild(newPanel);
    const newName = newPanel.querySelector('.tui-new-name');
    newName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); newName.blur(); } });   // then pick the type
    const two = n => String(n).padStart(2, '0');
    const autoTitle = (typeTitle, parent) => {
        const d = new Date();
        const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
        const label = typeTitle === 'Text' ? 'Note' : typeTitle;
        const dayNote = parent && typeof parent.hasLabel === 'function' && parent.hasLabel('dateNote');
        return dayNote ? `${label} ${time}` : `${label} ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${time}`;
    };
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
        const [type, mime, , typeTitle] = NOTE_TYPES[Number(b.dataset.i)];
        const typed = newName.value.trim();
        newName.blur();
        setNewOpen(false);
        try {
            // where the stock launcher creates notes: the #inbox note, else today's day note (backend scripts are off
            // by default, so this uses the frontend API). The note has its title already, so nothing gets the focus
            // (focus "none"): no keyboard pops up over a new canvas
            const parent = (await api.searchForNote('#inbox')) || (await api.getTodayNote());
            const opts = { type, isProtected: !!parent.isProtected, title: typed || autoTitle(typeTitle, parent), focus: 'none' };
            if (mime) opts.mime = mime;
            await api.createNote(parent.noteId, opts);
            newName.value = '';
        } catch (err) {
            if (api.showError) api.showError('The note could not be created: ' + (err && err.message || err));
            else console.error(err);
        }
    });

    // ---------------------------------------------------------------- pen taps that end without a click
    // after writing with the pen, the WebView sometimes ends a pen tap (pointerdown and pointerup on the same button)
    // without the click (seen on the tablet: a tap on "New" needed a second try). When no click follows
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
    // down): a short one on a button is a tap
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

    // ---------------------------------------------------------------- long press: the name of an icon button
    // Trilium's and Excalidraw's tooltips appear on mouse hover only, so on the tablet an icon's meaning stayed a
    // guess. Holding a finger or the pen on an icon button for about half a second shows its name above it (below it
    // in the top bar); that press does not press the button. Buttons whose own text already says what they do, and
    // the labelled launchers of the rail and the bottom bar, are left alone.
    const TIP_TARGET = 'button, label.ToolIcon, .icon-action, .ck-button, [role="button"], .dropdown-menu-button';
    const tip = document.createElement('div');
    tip.id = 'tui-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    const tipName = el => {
        const group = TOOL_GROUPS.find(g => el.matches(g.btnSel));   // Shapes and Lines share one button (below)
        if (group) return group.name;
        let n = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-bs-original-title') ||
            el.getAttribute('data-cke-tooltip-text') || '';
        if (!n) {
            const by = el.getAttribute('aria-labelledby');
            const lab = (by && document.getElementById(by)) || el.querySelector('.ck-button__label');
            if (lab) n = lab.textContent;
        }
        if (!n) {   // an Excalidraw tool: the radio input inside the label carries the name
            const input = el.querySelector('input[aria-label], input[title]');
            if (input) n = input.getAttribute('aria-label') || input.getAttribute('title');
        }
        return String(n || '').split(' — ')[0].trim();   // Excalidraw's titles end with " — <shortcut key>"
    };
    let tipTimer = null, tipStart = null, swallowPress = null, tipHideTimer = null;
    const hideTip = () => { tip.hidden = true; };
    const showTip = (el, name) => {
        clearTimeout(tipHideTimer);
        tip.textContent = name;
        tip.hidden = false;
        const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
        let top = r.top - h - 10;
        if (top < 60) top = r.bottom + 10;   // the top bar: below the button
        tip.style.top = Math.round(top) + 'px';
        tip.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))) + 'px';
    };
    window.addEventListener('pointerdown', e => {
        clearTimeout(tipTimer);
        tipTimer = null;
        hideTip();
        swallowPress = null;
        const t = e.target;
        if (!t || !t.closest || t.closest('#launcher-pane, canvas, input:not([type=radio]), textarea, [contenteditable="true"]')) return;
        const el = t.closest(TIP_TARGET);
        if (!el) return;
        const name = tipName(el);
        const text = (el.innerText || '').trim();
        if (!name || (text && (text.length > 6 || text === name))) return;
        tipStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
        tipTimer = setTimeout(() => {
            tipTimer = null;
            showTip(el, name);
            swallowPress = { el, until: 0 };
            penTap = null;   // nor is it completed as a pen tap
        }, 450);
    }, true);
    window.addEventListener('pointermove', e => {
        if (!tipTimer || !tipStart || e.pointerId !== tipStart.id) return;
        if (Math.hypot(e.clientX - tipStart.x, e.clientY - tipStart.y) > 10) { clearTimeout(tipTimer); tipTimer = null; }
    }, true);
    const endPress = () => {
        if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
        if (!tip.hidden) {
            if (swallowPress) swallowPress.until = Date.now() + 700;
            clearTimeout(tipHideTimer);
            tipHideTimer = setTimeout(hideTip, 1500);
        }
    };
    window.addEventListener('pointerup', endPress, true);
    window.addEventListener('pointercancel', endPress, true);
    window.addEventListener('click', e => {
        if (!swallowPress) return;
        if (swallowPress.until && Date.now() > swallowPress.until) { swallowPress = null; return; }
        if (swallowPress.el.contains(e.target)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
    window.addEventListener('contextmenu', e => { if (!tip.hidden || tipTimer) e.preventDefault(); }, true);

    // ---------------------------------------------------------------- the pen's side button erases
    // Excalidraw erases with the pen's eraser end (pointer button 5) while it touches, and goes back to the previous
    // tool when the pen lifts. The side (barrel) button arrives as button 2, which Excalidraw ignores: on the canvas it
    // becomes button 5, so holding the side button while drawing erases. The context menu a held side button can
    // open is not shown.
    let barrelPointer = null, barrelUntil = 0;
    const asEraser = e => {
        try {
            Object.defineProperty(e, 'button', { value: e.type === 'pointermove' ? -1 : 5, configurable: true });
            Object.defineProperty(e, 'buttons', { value: e.type === 'pointerup' ? 0 : 32, configurable: true });
        } catch (err) { /* leave it */ }
    };
    window.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'pen' || !(e.button === 2 || (e.buttons & 2))) return;
        if (!e.target || !e.target.closest || !e.target.closest('canvas.excalidraw__canvas.interactive')) return;
        barrelPointer = e.pointerId;
        asEraser(e);
    }, true);
    window.addEventListener('pointermove', e => { if (barrelPointer !== null && e.pointerId === barrelPointer) asEraser(e); }, true);
    for (const type of ['pointerup', 'pointercancel']) {
        window.addEventListener(type, e => {
            if (barrelPointer === null || e.pointerId !== barrelPointer) return;
            asEraser(e);
            barrelPointer = null;
            barrelUntil = Date.now() + 600;
        }, true);
    }
    window.addEventListener('contextmenu', e => {
        if (barrelPointer === null && Date.now() > barrelUntil) return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    // ---------------------------------------------------------------- the pen's button: eraser and back
    // The button of a Bluetooth pen paired with the tablet's pen service may reach apps only in that service's "remote
    // control" mode, as a media key at each press (MediaTrackPrevious; keydown and keyup together,
    // nothing while it is held). On a canvas such a key switches to the eraser, and the next one back to the tool used
    // before. A second key within 250 ms (a double press) is ignored.
    const PEN_KEYS = new Set(['MediaTrackPrevious', 'MediaTrackNext', 'MediaPlayPause', 'MediaPlay', 'MediaPause']);
    let toolBeforeEraser = null, lastPenKey = 0;
    window.addEventListener('keydown', e => {
        if (!PEN_KEYS.has(e.key)) return;
        const app = canvasApp();
        if (!app || !q('.note-split.active.type-canvas')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat || Date.now() - lastPenKey < 250) return;
        lastPenKey = Date.now();
        const type = app.state.activeTool && app.state.activeTool.type;
        if (type === 'eraser') app.setActiveTool({ type: toolBeforeEraser || 'freedraw' });
        else { toolBeforeEraser = type; app.setActiveTool({ type: 'eraser' }); }
        setTimeout(syncShapes, 30);
    }, true);
    window.addEventListener('keyup', e => {
        if (PEN_KEYS.has(e.key) && canvasApp() && q('.note-split.active.type-canvas')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    // ---------------------------------------------------------------- edits reach the server within seconds
    // The app syncs with its server once a minute, so a change made here reached the server, and the web pages open on
    // it (which redraw the note by themselves), up to a minute later. A few seconds after the last edit (a pen or a
    // finger lifted from the note, a key released in it) the widget asks for a sync at once, as the "Sync now" button
    // does (POST api/sync/now): at most one every 5 s. Where no sync server is configured (the server's own web pages)
    // the answer is NOT_CONFIGURED and the widget stops asking.
    let syncTimer = null, lastSyncAt = 0, syncUnavailable = false;
    const syncSoon = delay => {
        if (syncUnavailable) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(async () => {
            const wait = lastSyncAt + 5000 - Date.now();
            if (wait > 0) { syncSoon(wait); return; }
            lastSyncAt = Date.now();
            try {
                const res = await fetch('api/sync/now', {
                    method: 'POST', body: '{}',
                    headers: { 'Content-Type': 'application/json', 'x-csrf-token': (window.glob && glob.csrfToken) || '' }
                });
                const answer = await res.json().catch(() => ({}));
                if (answer && answer.errorCode === 'NOT_CONFIGURED') syncUnavailable = true;
            } catch (err) { /* the regular sync catches up */ }
        }, delay);
    };
    const afterEdit = e => {
        const t = e.target;
        if (t && t.closest && t.closest('.note-split.active .note-detail, .note-split.active .title-row input.note-title')) syncSoon(3000);
    };
    window.addEventListener('pointerup', afterEdit, true);
    window.addEventListener('keyup', afterEdit, true);

    // ---------------------------------------------------------------- "Note panel": a docked right panel
    // Trilium's note panel (outline, attributes, connections) opens as a dialog over the note. In landscape
    // tablet_ui.css docks it on the right like the "…" menu, with no backdrop, and the note area shrinks. Here: its
    // button opens and closes it, it and the other right panels ("…", the canvas tool options) take turns, and the
    // dialog's focus trap lets the note keep the focus while it is docked (so the text stays editable).
    const notePanel = () => q('.modal.mobile-note-panel.show');
    const wide = () => window.innerWidth >= 992;
    const closeNotePanel = () => notePanel()?.querySelector('.btn-close')?.click();
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || !t.closest || !wide()) return;
        if (t.closest('.title-row .mobile-note-panel-button')) {
            if (notePanel()) {   // open: the button closes it
                e.preventDefault();
                e.stopImmediatePropagation();
                closeNotePanel();
                return;
            }
            if (body.classList.contains('tui-props-open')) { body.classList.remove('tui-props-open'); syncTools(); }
            return;
        }
        if (notePanel() && t.closest('.title-row .icon-action.bx-dots-horizontal-rounded, #tui-canvas-tools [data-act="props"]')) {
            closeNotePanel();
        }
    }, true);
    document.documentElement.addEventListener('focusin', e => {
        const p = notePanel() || recentPanel();
        if (!p || !wide() || p.contains(e.target)) return;
        e.stopPropagation();   // Bootstrap's focus trap listens on the document
    });

    // ---------------------------------------------------------------- "Recent": a docked left panel
    // Trilium's "Recent changes" dialog is, in landscape, the left side panel like Menu and Bookmarks (tablet_ui.css):
    // the Recent button opens and closes it, and it takes turns with the other left panels (Menu, tree, New, Search,
    // Bookmarks). A note opened from it closes it, as in the tree.
    const recentPanel = () => q('.modal.recent-changes-dialog.show');
    const closeRecent = () => recentPanel()?.querySelector('.btn-close')?.click();
    document.addEventListener('click', e => {
        const t = e.target;
        if (!t || !t.closest || !wide() || !recentPanel()) return;
        if (t.closest('#launcher-pane .launcher-button.bx-history')) {   // open: the button closes it
            e.preventDefault();
            e.stopImmediatePropagation();
            closeRecent();
            return;
        }
        if (t.closest('#launcher-pane')) { closeRecent(); return; }   // another left panel takes the place
        if (t.closest('.recent-changes-dialog .note-title a')) setTimeout(closeRecent, 150);
    }, true);

    // the two docked dialogs open without a flash: Bootstrap adds the dark backdrop (fading in) about a third of a
    // second before the dialog itself, so the whole app dimmed for a moment. From the tap on their buttons the
    // backdrop is hidden (body.tui-docking, tablet_ui.css), until neither dialog is open any more.
    let dockingSince = 0;
    document.addEventListener('pointerdown', e => {
        const t = e.target;
        if (!t || !t.closest || !wide()) return;
        if (t.closest('#launcher-pane .launcher-button.bx-history, .title-row .mobile-note-panel-button')) {
            dockingSince = Date.now();
            body.classList.add('tui-docking');
        }
    }, true);
    setInterval(() => {
        if (body.classList.contains('tui-docking') && !recentPanel() && !notePanel() && Date.now() - dockingSince > 1500 &&
            !q('.modal.recent-changes-dialog[style*="display: block"], .modal.mobile-note-panel[style*="display: block"]')) {
            body.classList.remove('tui-docking');
        }
    }, 300);

    // a tap on a top-bar button while a right side panel is open ("…", the note panel, the tool options): the panel
    // closes at the first touch, the note area widens by the panel's width and the buttons move before the click, which
    // then lands beside the button (a tap on the info button only closed "…"). Such taps act when the finger goes down,
    // on the button under it, and the click that follows is dropped.
    // Trilium closes "…" at the touch itself, before this listener: the state is read at pointerover, which comes
    // just before pointerdown (a finger or the pen has no hover before it touches).
    let earlyTapUntil = 0, rightOpenAt = 0;
    const rightPanelOpen = () => !!(q('.tn-dropdown-portal.note-actions > .dropdown-menu.show') || notePanel() ||
        (body.classList.contains('tui-props-open') && q('.note-split.active .excalidraw .Island.App-menu__left')));
    window.addEventListener('pointerover', () => { if (rightPanelOpen()) rightOpenAt = Date.now(); }, true);
    // While "…" is open, Trilium lays a transparent cover over the whole screen that catches the touch and closes the
    // menu: the button is looked for under the cover, and the cover is left to close the menu.
    window.addEventListener('pointerdown', e => {
        let t = e.target;
        if (!t || !t.closest || !wide()) return;
        const onCover = !!t.closest('.global-menu-cover');
        if (onCover) t = document.elementsFromPoint(e.clientX, e.clientY).find(el => !el.closest('.global-menu-cover')) || t;
        const b = t.closest('.note-split.active .title-row button, .note-split.active .title-row .icon-action');
        if (!b) return;
        if (!rightPanelOpen() && Date.now() - rightOpenAt > 600) return;
        if (onCover && b.matches('.bx-dots-horizontal-rounded')) return;   // "…" itself: the cover closes it
        if (!onCover) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        penTap = null;   // nor is it completed later as a pen tap
        earlyTapUntil = Date.now() + 800;
        b.click();
    }, true);
    window.addEventListener('click', e => {
        if (!e.isTrusted || Date.now() > earlyTapUntil) return;
        earlyTapUntil = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    // ---------------------------------------------------------------- outline of text notes (landscape)
    // A text note with three headings or more lists them in the free space right of the reading column; a tap
    // scrolls to that heading, and the heading in view is marked. Shown only where it fits (no side panel in the way).
    const outlineBox = document.createElement('nav');
    outlineBox.id = 'tui-outline';
    outlineBox.hidden = true;
    outlineBox.setAttribute('aria-label', 'Outline');
    document.body.appendChild(outlineBox);
    let outlineSig = '', outlineHeads = [];
    const hideOutline = () => { if (!outlineBox.hidden) outlineBox.hidden = true; };
    const syncOutline = () => {
        const split = q('.note-split.active.type-text');
        const content = split && [...split.querySelectorAll('.note-detail-editable-text-editor, .note-detail-readonly-text-content')]
            .find(c => c.getClientRects().length > 0);
        if (!content || !wide() || body.classList.contains('tui-focus')) return hideOutline();
        const heads = [...content.querySelectorAll('h2, h3, h4')].filter(h => h.textContent.trim());
        if (heads.length < 3) return hideOutline();
        const sr = split.getBoundingClientRect(), cr = content.getBoundingClientRect();
        const room = sr.right - cr.right - 40;
        if (room < 190) return hideOutline();
        const sig = heads.map(h => h.tagName + ':' + h.textContent.trim()).join('|');
        outlineHeads = heads;
        if (sig !== outlineSig) {
            outlineSig = sig;
            outlineBox.innerHTML = '<div class="tui-outline-title">Outline</div>' +
                heads.map((h, i) => `<button type="button" class="tui-outline-item lvl-${h.tagName[1]}" data-i="${i}"></button>`).join('');
            outlineBox.querySelectorAll('.tui-outline-item').forEach((b, i) => { b.textContent = heads[i].textContent.trim(); });
        }
        const row = split.querySelector(':scope > .title-row');
        const top = Math.round((row ? row.getBoundingClientRect().bottom : sr.top) + 24);
        outlineBox.style.top = top + 'px';
        outlineBox.style.left = Math.round(cr.right + 32) + 'px';
        outlineBox.style.width = Math.round(Math.min(260, room)) + 'px';
        outlineBox.style.maxHeight = (window.innerHeight - top - 16) + 'px';
        outlineBox.hidden = false;
        let active = 0;   // the last heading above the upper quarter of the note area
        const line = top + (sr.bottom - top) / 4;
        heads.forEach((h, i) => { if (h.getBoundingClientRect().top <= line) active = i; });
        outlineBox.querySelectorAll('.tui-outline-item').forEach((b, i) => b.classList.toggle('active', i === active));
    };
    outlineBox.addEventListener('click', e => {
        const b = e.target.closest('.tui-outline-item');
        const h = b && outlineHeads[Number(b.dataset.i)];
        if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    let outlineQueued = false;
    const queueOutline = () => {
        if (outlineQueued) return;
        outlineQueued = true;
        requestAnimationFrame(() => { outlineQueued = false; syncOutline(); });
    };
    document.addEventListener('scroll', queueOutline, true);
    window.addEventListener('resize', queueOutline);

    // ---------------------------------------------------------------- Shapes and Lines: one tool button per group
    // Rectangle, diamond and ellipse share one button of the tool bar ("Shapes"), arrow and line another ("Lines"):
    // Excalidraw's rectangle and arrow buttons, which show the last tool used in their group (tablet_ui.css hides the
    // other buttons and draws the icons). A tap picks that tool; a tap while a tool of the group is active opens a
    // small bar with the group's tools above the button. The last tool of each group is kept on this device.
    const TOOL_GROUPS = [
        { name: 'Shapes', cls: 'shape', tools: ['rectangle', 'diamond', 'ellipse'], key: 'tui-shape-v1' },
        { name: 'Lines', cls: 'line', tools: ['arrow', 'line'], key: 'tui-line-v1' }
    ];
    const setGroupBar = (g, on) => {
        const btn = on && [...document.querySelectorAll('.note-split.active ' + g.btnSel)].find(b => b.getBoundingClientRect().width > 0);
        if (!btn) { g.bar.hidden = true; return; }
        for (const o of TOOL_GROUPS) if (o !== g) o.bar.hidden = true;
        g.bar.hidden = false;
        const r = btn.getBoundingClientRect(), w = g.bar.offsetWidth, h = g.bar.offsetHeight;
        g.bar.style.left = Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))) + 'px';
        g.bar.style.top = Math.round(r.top - h - 14) + 'px';
    };
    for (const g of TOOL_GROUPS) {
        g.btnSel = `.excalidraw .App-toolbar label:has(input[data-testid="toolbar-${g.tools[0]}"])`;
        g.last = g.tools[0];
        try { const v = localStorage.getItem(g.key); if (g.tools.includes(v)) g.last = v; } catch (e) { /* default */ }
        g.bar = document.createElement('div');
        g.bar.className = 'tui-group-bar';
        g.bar.id = `tui-${g.cls}-bar`;
        g.bar.hidden = true;
        g.bar.setAttribute('role', 'menu');
        g.bar.setAttribute('aria-label', g.name);
        g.bar.innerHTML = g.tools.map(s =>
            `<button type="button" role="menuitem" data-tool="${s}" aria-label="${s[0].toUpperCase() + s.slice(1)}"></button>`).join('');
        document.body.appendChild(g.bar);
        g.bar.addEventListener('click', e => {
            const b = e.target.closest('[data-tool]');
            const app = canvasApp();
            if (!b || !app) return;
            app.setActiveTool({ type: b.dataset.tool });
            setGroupBar(g, false);
            setTimeout(syncShapes, 30);
        });
    }
    const GROUP_BTNS = TOOL_GROUPS.map(g => g.btnSel).join(', ');
    const syncShapes = () => {
        const app = canvasApp();
        const type = app && app.state.activeTool && app.state.activeTool.type;
        for (const g of TOOL_GROUPS) {
            if (g.tools.includes(type) && type !== g.last) {
                g.last = type;
                try { localStorage.setItem(g.key, type); } catch (e) { /* kept for this session */ }
            }
            for (const s of g.tools) {
                const c = `tui-${g.cls}-${s}`;
                if (body.classList.contains(c) !== (s === g.last)) body.classList.toggle(c, s === g.last);
            }
            const on = g.tools.includes(type);
            if (body.classList.contains(`tui-${g.cls}-on`) !== on) body.classList.toggle(`tui-${g.cls}-on`, on);
            for (const b of g.bar.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === type);
            if (!g.bar.hidden && !q('.note-split.active.type-canvas')) setGroupBar(g, false);
        }
    };
    window.addEventListener('click', e => {
        const t = e.target;
        const btn = t && t.closest && t.closest(GROUP_BTNS);
        const g = btn && TOOL_GROUPS.find(x => btn.matches(x.btnSel));
        if (!g) return;
        e.preventDefault();   // not Excalidraw's own choice of that one tool
        e.stopImmediatePropagation();
        const app = canvasApp();
        if (!app) return;
        if (g.tools.includes(app.state.activeTool.type)) setGroupBar(g, g.bar.hidden);
        else { app.setActiveTool({ type: g.last }); setGroupBar(g, false); }
        setTimeout(syncShapes, 30);
    }, true);
    document.addEventListener('pointerdown', e => {   // a tap elsewhere closes the bar (and still does its own job)
        if (!e.target || !e.target.closest) return;
        for (const g of TOOL_GROUPS) {
            if (!g.bar.hidden && !e.target.closest('#' + g.bar.id) && !e.target.closest(g.btnSel)) setGroupBar(g, false);
        }
    }, true);

    // ---------------------------------------------------------------- the pencil's colours, one tap away
    // While the pencil is the active tool, a row of colours sits above the tool bar: the Stroke colours of the tool
    // options (Excalidraw's, minus the ones removed, then the user's own), the current one marked. A tap sets the
    // colour of the next strokes without opening the tool options. Hidden while the tool options are open.
    const DEFAULT_STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
    const quickColours = document.createElement('div');
    quickColours.id = 'tui-quick-colours';
    quickColours.hidden = true;
    quickColours.setAttribute('role', 'toolbar');
    quickColours.setAttribute('aria-label', 'Colour and thickness');
    document.body.appendChild(quickColours);
    let quickSig = '', quickW = 0, quickWc = 0, quickCompact = false;
    const strokeChoices = ex => {
        const column = ex.querySelector('.Island.App-menu__left .panelColumn');
        const row = column && [...column.children].find(r => { const h = r.querySelector(':scope > h3'); return h && KINDS.stroke.label.test(h.textContent); });
        const picks = row ? [...row.querySelectorAll('.color-picker__top-picks .color-picker__button')].map(topPickColour).filter(Boolean) : [];
        const base = picks.length ? picks : DEFAULT_STROKES;
        return [...base.filter(c => !palette.hidden.stroke.includes(c)), ...palette.stroke.filter(c => !base.includes(c))];
    };
    const syncQuickColours = () => {
        const ex = q('.note-split.active .excalidraw');
        const app = ex && ex.__tuiApp;
        const tool = app && app.state.activeTool && app.state.activeTool.type;
        const bar = ex && [...ex.querySelectorAll('.App-toolbar')].find(b => b.getBoundingClientRect().width > 0);
        const show = !!bar && QUICK_TOOLS.includes(tool) && !body.classList.contains('tui-props-open') &&
            !ex.querySelector('.App-toolbar__extra-tools-dropdown') && TOOL_GROUPS.every(g => g.bar.hidden);
        if (!show) {
            if (!quickColours.hidden) quickColours.hidden = true;
            if (body.classList.contains('tui-quick-on')) body.classList.remove('tui-quick-on');
            return;
        }
        const colours = strokeChoices(ex);
        const current = String(app.state.currentItemStrokeColor || '').toLowerCase();
        const width = app.state.currentItemStrokeWidth;
        const sig = `${colours.join(',')}|${current}|${tool === 'text' ? '' : width}`;
        if (sig !== quickSig) {
            quickSig = sig;
            quickColours.innerHTML = colours.map(c =>
                `<button type="button" class="tui-quick-swatch${c === current ? ' active' : ''}" data-colour="${c}" aria-label="Colour ${c}" style="--tui-swatch:${c}"></button>`).join('') +
                (tool === 'text' ? '' : '<span class="tui-quick-sep"></span>' + QUICK_WIDTHS.map(([w, label]) =>
                    `<button type="button" class="tui-quick-width${w === width ? ' active' : ''}" data-width="${w}" aria-label="${label}" style="--tui-w:${w}"></button>`).join(''));
            // its width at the normal size and at the compact one (smaller swatches), measured once per content
            quickColours.hidden = false;
            quickColours.classList.remove('tui-compact');
            quickW = quickColours.offsetWidth;
            quickColours.classList.add('tui-compact');
            quickWc = quickColours.offsetWidth;
            quickCompact = true;
        }
        quickColours.hidden = false;
        // on the tool bar's line, right of it, when both fit in the drawing area (the bar moves left by half the row's
        // width, so the two stay centred together); otherwise above the bar
        // the normal size if it fits beside the bar, else the compact one (portrait), else above the bar
        const barW = bar.getBoundingClientRect().width, areaW = ex.getBoundingClientRect().width;
        const compact = barW + quickW + 24 > areaW && barW + quickWc + 24 <= areaW;
        if (quickCompact !== compact) { quickColours.classList.toggle('tui-compact', compact); quickCompact = compact; }
        const w = compact ? quickWc : quickW;
        const joined = barW + w + 24 <= areaW;
        if (joined) {
            setStyleVar(body, '--tui-quick-w', w + 'px');
            if (!body.classList.contains('tui-quick-on')) body.classList.add('tui-quick-on');
            if (!quickColours.classList.contains('tui-joined')) quickColours.classList.add('tui-joined');
            const r = bar.getBoundingClientRect();   // after the shift
            const pb = getComputedStyle(bar).paddingBottom;
            setPos(quickColours, { left: Math.round(r.right - 1) + 'px', top: Math.round(r.top) + 'px', height: Math.round(r.height) + 'px', paddingBottom: pb });
        } else {
            if (body.classList.contains('tui-quick-on')) body.classList.remove('tui-quick-on');
            if (quickColours.classList.contains('tui-joined')) quickColours.classList.remove('tui-joined');
            const r = bar.getBoundingClientRect(), h = quickColours.offsetHeight;
            setPos(quickColours, { left: Math.round(Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))) + 'px',
                top: Math.round(r.top - h - 10) + 'px', height: '', paddingBottom: '' });
        }
    };
    quickColours.addEventListener('click', e => {
        const c = e.target.closest('[data-colour]'), w = e.target.closest('[data-width]');
        if (c) applyColour('stroke', c.dataset.colour);
        if (w) {
            const app = canvasApp();
            const action = app && app.actionManager.actions.changeStrokeWidth;
            if (action) app.actionManager.executeAction(action, 'ui', Number(w.dataset.width));
        }
        quickSig = '';
        setTimeout(syncQuickColours, 30);
    });

    // ---------------------------------------------------------------- pen mode: a switch in the tool options
    // Pen mode (only the pen draws; one finger moves the sheet) turns on by itself at the first pen stroke. Its switch
    // sits at the top of the tool options instead of the top bar.
    const syncPenModeRow = () => {
        const ex = q('.note-split.active .excalidraw');
        const app = ex && ex.__tuiApp;
        const column = ex && ex.querySelector('.Island.App-menu__left .panelColumn');
        if (!app || !column) return;
        let row = column.querySelector(':scope > .tui-penmode-row');
        if (!row) {
            row = document.createElement('fieldset');
            row.className = 'tui-penmode-row';
            row.innerHTML = '<legend>Pen mode</legend><label><input type="checkbox" role="switch">' +
                '<span>Only the pen draws; one finger moves the sheet</span></label>';
            row.querySelector('input').addEventListener('change', ev => {
                const a = canvasApp();
                if (a) a.setState({ penMode: ev.target.checked, penDetected: true });
            });
        }
        if (column.firstElementChild !== row) column.prepend(row);
        const input = row.querySelector('input');
        if (input.checked !== !!app.state.penMode) input.checked = !!app.state.penMode;
    };


    // ---------------------------------------------------------------- search results and bookmarks: rows like Recent
    // Quick search: Trilium writes a result's path and title as one line ("path › title"), which wrapped over three
    // lines; the title and the path go into attributes that tablet_ui.css shows on two lines. The extract of a canvas
    // or another JSON note (raw JSON) is not shown. Bookmarks: the note's path under its title, from the bookmarked
    // notes (the children of _lbBookmarks), matched to the rows by title.
    const syncSearchRows = () => {
        for (const t of document.querySelectorAll('.quick-search-menu .search-result-title')) {
            const text = t.textContent.replace(/\s+/g, ' ').trim();
            if (t.__tuiText === text) continue;
            t.__tuiText = text;
            const i = text.lastIndexOf('›');
            setAttr(t, 'data-tui-title', i < 0 ? text : text.slice(i + 1).trim());
            setAttr(t, 'data-tui-path', i < 0 ? '' : text.slice(0, i).trim());
            const content = t.closest('.quick-search-item')?.querySelector('.search-result-content');
            if (content) {
                const raw = /^\s*("\w+"\s*:|[{\[])/.test(content.textContent) || /"elements"\s*:/.test(content.textContent);
                if (content.classList.contains('tui-sr-raw') !== raw) content.classList.toggle('tui-sr-raw', raw);
            }
        }
    };
    let bookmarkPaths = null, bookmarkPathsAt = 0, bookmarkPathsLoading = false;
    const notePathTitles = async note => {
        const names = [];
        for (let cur = note, guard = 0; cur && guard < 20; guard++) {
            const parents = (await cur.getParentNotes()).filter(n => n && n.noteId !== 'root' && !n.noteId.startsWith('_'));
            cur = parents[0];
            if (cur) names.unshift(cur.title);
        }
        return names.join(' › ');
    };
    const loadBookmarkPaths = async () => {
        bookmarkPathsLoading = true;
        try {
            const holder = await api.getNote('_lbBookmarks');
            const map = {};
            for (const n of holder ? await holder.getChildNotes() : []) map[n.title] = await notePathTitles(n);
            bookmarkPaths = map;
            bookmarkPathsAt = Date.now();
        } catch (e) { bookmarkPaths = bookmarkPaths || {}; } finally { bookmarkPathsLoading = false; }
    };
    const syncBookmarkRows = () => {
        const rows = document.querySelectorAll('.tn-dropdown-portal.right-dropdown-widget > .dropdown-menu.show li.dropdown-item .tn-menu-name');
        if (!rows.length) return;
        if ((!bookmarkPaths || Date.now() - bookmarkPathsAt > 10000) && !bookmarkPathsLoading) { loadBookmarkPaths().then(syncBookmarkRows); if (!bookmarkPaths) return; }
        for (const r of rows) setAttr(r, 'data-tui-path', bookmarkPaths[r.textContent.trim()] || '');
    };

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
