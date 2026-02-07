# PROJECT CONTEXT - 0804 Flash Card

Last updated: 2026-02-07
Repo: `feima3333/0804-Flash-Card`
Current commit: `49348dc`
Branch: `main`

## 1) Project Goal
A romantic IELTS flashcard web app for daily study (for girlfriend), with a soft visual style and fast mobile-first usage.

## 2) Tech Stack
- Pure static web app (no build tool)
- HTML + CSS + vanilla JavaScript
- Storage: browser `localStorage`
- Deploy: Vercel static hosting (push to `main` triggers deployment)

## 3) Current File Structure
- `index.html`
- `assets/styles.css`
- `assets/app.js`
- image assets in repo root (`0804*.png`)

## 4) Data Model (v5)
Primary local storage key:
- `0804_v5_state`

State shape:
```json
{
  "version": 5,
  "decks": [],
  "resources": [],
  "trash": [],
  "meta": {
    "migratedFrom": "v4|none",
    "lastSavedAt": "ISO-8601"
  }
}
```

Legacy read/migration keys:
- `0804_v4_decks`
- `0804_v4_resources`
- `0804_v4_trash`

## 5) What Was Recently Improved
Implemented in commit `49348dc`:
- Split single-file app into multi-file static structure.
- Removed inline `onclick/onchange/onkeyup/...`; switched to event listeners.
- Added robust storage layer:
  - `withFallback`
  - `safeParse`
  - `loadState`
  - `saveState`
  - `persistState`
- Added auto migration from v4 keys to v5 state.
- Reworked rendering to avoid unsafe `innerHTML` for user content.
- Kept reference syntax rendering:
  - `[Title]`
  - `【Title】`
- Import engine upgraded:
  - deck identity: `title + category`
  - card dedupe: `frontTitle + backContent`
  - resource dedupe: `title + type`
  - merge report toast after import
- Study control semantics changed to neutral navigation:
  - previous card / next card

## 6) Existing Core Features
- Dashboard with speaking/vocabulary grouping
- Create deck/cards (including vocabulary bulk input)
- Study mode (flip, prev/next, edit/delete)
- Toolbox resources (story/vocab)
- Add material + sorter bundle flow
- Trash/restore/permanent delete
- Backup export/import (merge/replace)

## 7) Confirmed User Decisions
- Keep manual import/export sync for now (no cloud sync yet)
- Interested in adding free pronunciation/reading feature next

## 8) Proposed Next Feature (Not implemented yet)
Free pronunciation support via browser APIs:
- TTS: `speechSynthesis` (recommended first)
- Optional speech recognition later: `SpeechRecognition` (browser-dependent)

## 9) Constraints / Notes
- No backend currently
- No package.json / no build step
- Keep UX simple and romantic tone
- Preserve existing data compatibility and avoid breaking old users

## 10) Quick Handoff Prompt For Next Chat
Use this in a new conversation:

"Please read `/Users/feima/Documents/New project/0804-Flash-Card/PROJECT.CONTEXT.md` first, then continue implementing the next feature for this project."

## 11) Manual Smoke Checklist
- Open app and confirm dashboard loads
- Create a new deck/card
- Enter study mode, flip card, prev/next
- Edit deck/resource/card and verify persistence
- Export backup, then import in merge mode
- Move item to trash and restore it
- Refresh page and ensure data still exists

