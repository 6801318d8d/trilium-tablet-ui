# Trilium tablet UI

A custom theme (`#appCss`) and widget (`#widget`) that adapt [Trilium Notes](https://github.com/TriliumNext/Trilium)'
mobile layout to a tablet. It was made and tested on an 11-inch Android tablet (1385 × 866 dp in landscape) with the
official Android app and the mobile web frontend. Every rule applies only to the mobile layout on screens of 700 dp
or more, so phones and the desktop layout are unchanged.

| Text note, note tree open | Canvas note, tool options |
|---|---|
| ![](screenshots/tree.png) | ![](screenshots/canvas.png) |
| **Menu as a side panel** | **New note: choose the type** |
| ![](screenshots/menu.png) | ![](screenshots/new_note.png) |
| **Calendar collection: one top bar** | **Portrait** |
| ![](screenshots/collection.png) | ![](screenshots/portrait.png) |
| **A note's menu from the tree (long press)** | |
| ![](screenshots/tree_menu.png) | |

## What it changes

- **Landscape: a navigation rail** on the left with a label under each launcher; Sync at the bottom.
- **Docked side panels.** On the left: Menu, the note tree, the menu of a note in the tree, Recent changes, Bookmarks,
  the note types of "New" or the quick search, one at a time. On the right: the note's "…" menu, the note panel
  (outline, attributes, connections) or the canvas tool options. The note area shrinks instead of being covered, and
  the panels start below the system status bar.
- **Menu and the note's "…" menu:** one column of equal rows, in groups like a settings list.
- **Recent changes:** one row per note (title, path, time on the right; the whole row opens the note), the day on top
  while scrolling, deleted notes dimmed with a small "undelete" button. **Quick search results** and **Bookmarks** use
  the same rows: title, path under it (and a two-line extract for search results, none for raw JSON).
- **Note tree:** the top bar names the folder you are in ("‹" goes up a level); the open note is highlighted; the tree
  closes when a note is chosen in it or the open note is tapped. A long press on a note, or on the folder's name,
  opens its menu (Move, Clone, Duplicate, Archive, colour…), which takes the tree's place, titled with the note's name.
  The folder's own "…" is gone, so the only "…" on screen is the open note's.
- **New** asks for the note type first, with an optional title; without one the note is named after its type and the
  time ("Canvas 07:42"), so the tree does not fill up with notes called "New note". **Search** opens the quick search
  in the left panel, with results as you type, instead of replacing the open note with a search note.
- **Collections:** the collection's bar (view type, settings, calendar navigation) joins the title row when it fits.
- **Text notes:** a reading column of about 720 dp, a compact formatting toolbar docked to the bottom edge and, in
  landscape, the outline of the headings in the free space on the right (from three headings).
- **Canvas notes (Excalidraw):**
  - zoom (one button with the level: zoom in, zoom out, fit to drawing, 100%), undo/redo, tool options and full-screen
    drawing sit in the note's top bar; the tool bar is compact, centred and docked to the bottom edge;
  - rectangle, diamond and ellipse share one **Shapes** button, arrow and line one **Lines** button: a tap picks the
    last tool used in the group, a second tap shows the group; Excalidraw's "More tools" menu (frame, web embed, laser
    pointer, Mermaid) opens above the tool bar;
  - a drawing tool stays active after a shape or a frame (Excalidraw's padlock is always on, so its button is gone);
    pen mode is a switch at the top of the tool options (it turns on by itself at the first pen stroke);
  - tool options open in the right panel with a button; tapping a tool only changes the tool;
  - stroke width is a continuous slider; Stroke and Background get a row of your own colours (add, apply, remove,
    and Excalidraw's five can be removed too);
  - with a drawing tool (pencil, shapes, lines, text), a row sets the colour and, except for text, the thickness
    (thin, medium, thick) with one tap, without opening the tool options; it sits on the tool bar's line, as one
    island with it (smaller in portrait), or above it where both do not fit;
  - the eraser deletes strokes as soon as it touches them (Excalidraw greys them out until the pen lifts);
  - the pen's side button switches to the eraser and back, where the tablet's pen service passes it to apps as a media
    key (as in a "remote control" mode: one press, not a hold, so there is no "erase while held");
  - a "Pen pressure" slider stretches the pen's pressure, so light and firm strokes differ more;
  - in pen mode one finger moves the sheet; the drawing stays in place when a side panel opens;
  - images in canvases load in the Android app too (its requests repeat the image's `Content-Type` header, and the
    data URL built from it did not decode).
- **Touch details:** a long press on an icon button shows its name (hover tooltips never appear on a touch screen);
  the note panel button has an info icon; a top-bar button works at the first tap also while a side panel is open
  (the panel closing used to move the buttons under the finger); a rail button opens its panel at the first tap also
  while Menu or another left panel is open, and only the button of the open panel stays green; the docked dialogs
  open without the backdrop's flash; every button whose menu or panel is open is green, "More tools" included; no grey
  "hover" left on the last button touched; pen taps that the WebView ends without a click are completed.
- **Light on the page:** nothing is measured or rewritten while a pen or finger is down on a drawing, and attributes
  are written only when their value changes.
- **Sync within seconds:** a few seconds after an edit the app asks for a sync at once (it syncs once a minute
  otherwise), so the server, and the web pages open on it, show the change almost at once.

## Install

1. Create a **code note** of type CSS, paste [`tablet_ui.css`](tablet_ui.css) and add the label `#appCss`.
2. Create a **code note** of type JavaScript (frontend), paste [`tablet_ui.js`](tablet_ui.js) and add the label
   `#widget`.
3. Optional, the **Notes** button of the rail: create a frontend JavaScript note with
   [`tablet_ui_notes_toggle.js`](tablet_ui_notes_toggle.js). Then, in the mobile launch bar configuration
   (Menu → Configure launch bar), add a *script launcher*, set its `script` relation to that note, its title to
   "Notes" and its icon to `bx bx-sitemap`, and move it to the top of the visible launchers.
4. Restart the app (or reload the page).

To turn it off, rename the labels to `#disabled:appCss` and `#disabled:widget` and restart.

## Notes

- Tested with Trilium 0.107 (nightly builds of November 2026), theme-next and the classic Light theme.
- It relies on Trilium's and Excalidraw's DOM structure and class names, so an update can break parts of it.
- Excalidraw's API is private to Trilium's canvas widget; the canvas features reach the Excalidraw instance through
  Preact's base component class. In Trilium's own code they would use the API directly.
- Your colours and the pen pressure level are stored in the device's local storage.

Upstream discussion: [TriliumNext/Trilium#12609](https://github.com/TriliumNext/Trilium/issues/12609) (feature
request) and [#12610](https://github.com/TriliumNext/Trilium/pull/12610) (draft pull request for the navigation rail
and docked panels).

## License

[GNU Affero General Public License v3.0](LICENSE) or later, the same licence as Trilium.
