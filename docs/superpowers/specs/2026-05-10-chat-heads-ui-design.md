# Chat-heads UI iteration — Design

**Status:** Draft for user review
**Date:** 2026-05-10
**Builds on:** Phase 7 chat infra, Phase 9a auto-restore.

## Goal

Když uživatel minimalizuje chat panel, místo "thin header strip" se panel sbalí do **kruhového chat-headu** ve stacku nad launcherem (Messenger-style). Stack drží všechny aktivní thready tak, že uživatel může rychle přepínat mezi více AI agenty.

## Decisions (z brainstormu)

| Téma | Volba |
|---|---|
| Otevřených panelů současně | **1** (single-chat-active) |
| Kdy se chat-head objeví | Když má agent **aktivní thread**; otevřením z launcheru → použitím → minimalize/close-then-reopen |
| Max viditelných v stacku | **5**; ostatní pod **+N** overflow pillem |
| Vizuál chat-headu | **B** — jen ikona (44px), white border, modrý gradient pozadí |
| Label | Hover → label vyjede zprava zpod kruhu, končí 8px od levé hrany; pill bílý, animace `cubic-bezier(0.34, 1.56, 0.64, 1)` 0.22s |
| Source labelu | `agent.name` truncated na ~16 znaků (s `…`); žádný extra config |
| Klik na chat-head | Otevře panel pro ten thread; pokud byl jiný panel otevřený, ten se automaticky minimalizuje (single rule) |
| ▼ minimize button | Panel sbalí, chat-head se objeví v stacku |
| ✕ close button | Panel zavře **a** chat-head zmizí ze stacku; thread zůstane v IndexedDB historii (přístupný přes launcher → popover → historie) |
| Unread indikace | Když AI dokončí odpověď zatímco je panel minimalizovaný, modrá **ripple animace** (variant B) — z kruhu se opakovaně šíří vlny ven (1.6s cyklus, dva pulzy s offsetem 0.8s). Po otevření panelu zmizí. |

## Architecture

### State

`chat-storage.js` settings se rozšiřuje o jeden field:
```js
{
    chatPanelOpen: boolean,
    lastActiveAgentId: string | null,
    lastActiveThreadId: string | null,
    threadsSidebarOpen: boolean,
    activeChatHeads: [{ agentId, threadId, hasUnread: boolean }, ...]  // NEW
}
```

`activeChatHeads` je pořadové pole — index 0 = top of stack (nejnovější aktivní), index N-1 = bottom (nejstarší). **Stack je deduplikovaný podle `agentId`** — každý agent má max 1 head; přidání druhého threadu pro stejného agenta nahradí `threadId` v existujícím heads záznamu (head se přesune na top, ale neduplikuje). Multi-thread historie je dostupná přes launcher → popover → historie threadů.

In-memory state v `chat-heads.js` (nový module) drží:
- `_state.heads = [...]` — mirror settings.activeChatHeads
- `_state.openHeadIndex = number | null` — který head je právě open jako panel (single rule); `null` = panel zavřený

### Files

| Path | Status | Responsibility |
|---|---|---|
| `assets/js/ai-ui/chat-heads.js` | **Create** | Render + manage chat-head stack; addHead, removeHead, focusHead, markUnread, clearUnread, render |
| `assets/js/ai-ui/chat-launcher.js` | Modify | Mount chat-heads container above launcher button; expose `refreshChatHeads()` |
| `assets/js/ai-ui/chat-panel.js` | Modify | On `openForAgent` → call `chatHeads.addHead/focusHead`; on `_toggleMinimize` (closing direction) → leave head in stack but mark not-open; on `close()` → call `chatHeads.removeHead`; on stream complete while minimized → call `chatHeads.markUnread` |
| `assets/js/ai/chat-storage.js` | Modify | Add `activeChatHeads` to default settings shape; helper `appendChatHead(agentId, threadId)`, `removeChatHead(threadId)`, `setChatHeadUnread(threadId, bool)` (or do it via existing `updateSettings`) |
| `assets/css/ai-chat.css` | Modify | New rules `.chat-heads-stack`, `.chat-head`, `.chat-head__circle`, `.chat-head__label`, `.chat-head--unread`, `.chat-heads-overflow`, animation keyframes |
| `dist/...` | Mirror | Each modified file |
| `sw.js` + `dist/sw.js` | Modify | Bump v30 → v31; add `chat-heads.js` to ASSETS_TO_CACHE |
| `tests/test-suites/chat-heads.test.js` | **Create** | ~10 unit tests (state mutations, settings persistence, max-5 logic, mark/clear unread) |
| `tests/test-runner.html` | Modify | Add new test suite tag |
| `tests/test-suites/chat-panel-tool-loop.test.js` | (no change) | — |

### Module API (`chat-heads.js`)

```js
// Initialize: read settings, render stack
export async function init();

// Add a thread to the stack (idempotent by threadId).
// If already present, brings to top (index 0). If stack would exceed 5, oldest
// goes into +N overflow.
export async function addHead({ agentId, threadId });

// Remove a thread from the stack. Called by chat-panel close().
export async function removeHead(threadId);

// Mark a head as having unread content (start ripple animation).
export async function markUnread(threadId);

// Clear unread (called when chat-panel.openForAgent for that thread).
export async function clearUnread(threadId);

// Refresh DOM from current state. Called externally when state may have
// changed via storage events (e.g., agent renamed in Settings).
export async function refresh();

// Public API for chat-panel to query without DOM lookup
export function getOpenHead(); // -> { agentId, threadId } | null
export function isHeadActive(threadId); // -> bool
```

### DOM structure

```html
<aside id="chatLauncher" class="chat-launcher" ...>...</aside>
<div id="chatHeadsStack" class="chat-heads-stack">
    <button class="chat-head" data-thread-id="t_abc" data-agent-id="a_xyz">
        <span class="chat-head__circle">🤖</span>
        <span class="chat-head__label">Validátor</span>
    </button>
    <button class="chat-head chat-head--unread" data-thread-id="t_def" ...>
        <span class="chat-head__circle">🔍</span>
        <span class="chat-head__label">Hledač</span>
    </button>
    <button class="chat-heads-overflow" data-count="3">+3</button>
</div>
```

Stack se renderuje **nad** launcherem (sourozenec v body). Pozice: `position: fixed; right: 24px; bottom: 96px;` (=~ launcher.bottom + launcher.height + gap).

Když je panel otevřený (`.chat-panel.is-open`), stack se posouvá nahoru (skip pozici panel) — `.chat-heads-stack` `bottom` přepočítáno přes JS na `chatPanel.offsetTop - 60`.

### CSS (klíčové selektory)

```css
.chat-heads-stack {
    position: fixed;
    right: 24px;
    bottom: 96px;
    display: flex;
    flex-direction: column-reverse; /* index 0 = top of stack visually */
    align-items: flex-end;
    gap: 10px;
    z-index: 9000;
}
.chat-head {
    position: relative;
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
}
.chat-head__circle {
    position: relative;
    z-index: 2;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--primary-gradient, linear-gradient(135deg, #667eea, #5568d3));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: white;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    transition: transform 0.18s ease;
}
.chat-head__label {
    position: absolute;
    top: 50%;
    right: 100%;
    margin-right: 8px;
    background: var(--bg-primary, white);
    color: var(--text-primary, #1f2937);
    padding: 6px 14px;
    border-radius: 22px;
    font-size: 0.88em;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    white-space: nowrap;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-50%) translateX(28px);
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s;
}
.chat-head:hover .chat-head__label,
.chat-head:focus-visible .chat-head__label {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
}
.chat-head:hover .chat-head__circle,
.chat-head:focus-visible .chat-head__circle {
    transform: scale(1.05);
}

/* Unread state — ripple animation */
.chat-head--unread::before,
.chat-head--unread::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(59, 130, 246, 0.7);
    z-index: 1;
    pointer-events: none;
    animation: chatHeadRipple 1.6s ease-out infinite;
}
.chat-head--unread::after { animation-delay: 0.8s; }
@keyframes chatHeadRipple {
    0%   { transform: scale(1);   opacity: 0.9; }
    100% { transform: scale(1.6); opacity: 0; }
}

/* Overflow pill */
.chat-heads-overflow {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(0,0,0,0.6);
    color: white;
    font-size: 0.85em;
    font-weight: 700;
    border: 2px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

### Behavior flows

**A. Open agent z launcheru (žádný thread):**
1. User klik launcher → popover → klik agent
2. `chat-panel.openForAgent(agentId)` proběhne (existující Phase 7+ flow)
3. Když user pošle první zprávu, vznikne thread → `chat-panel._send` po `createThread` zavolá `chatHeads.addHead({ agentId, threadId })`
4. Settings persistuje `lastActiveAgentId/ThreadId/PanelOpen=true` + `activeChatHeads` array

**B. Otevírání existujícího threadu z launcher historie:**
1. User klik launcher → popover → klik thread z historie
2. `chat-panel.openForAgent(agentId)` + `_state.threadId = thread.id`
3. `chatHeads.addHead({ agentId, threadId })` — přidá head pokud ještě není
4. Settings updated

**C. Switch mezi threadem A → B (single-chat-active rule):**
1. User klik na chat-head B (zatímco A je open jako panel)
2. `chatHeads` zjistí že `openHeadIndex` ukazuje na A → call `chat-panel.openForAgent(agentB)` který:
   - Aborts pending request from A (existing behavior)
   - Replaces panel content
3. Settings: `lastActiveAgentId/ThreadId` updated to B; A zůstává v `activeChatHeads` list (jen není "open")

**D. Minimize:**
1. User klik ▼ na panelu
2. Panel sbalí (`.chat-panel--minimized` třída), nezavírá se ani neřeší abort
3. Stream doběhne na pozadí; po dokončení (`finish_reason !== 'tool_calls'` event) chat-panel zavolá `chatHeads.markUnread(threadId)` pokud panel je v minimized stavu
4. Po user klikne na ten head → `chat-panel.openForAgent(agentId)` + `clearUnread(threadId)`

**E. Close (X):**
1. User klik ✕ na panelu
2. Existující `close()` aborts request, hides panel
3. Plus: `chatHeads.removeHead(threadId)` → odstraní z `activeChatHeads` array, re-renders stack
4. Thread zůstává v `chat-storage` `KEY_THREADS` — user může re-otevřít z launcher historie

**F. Cross-page navigation:**
1. Page navigates → init.js DOMContentLoaded
2. `chatHeads.init()` reads `settings.activeChatHeads` → renders stack
3. Existující auto-restore logic (Phase 9a) také proběhne — pokud `chatPanelOpen=true`, `chat-panel.openForAgent(lastActiveAgentId)` znovu otevře panel
4. `chat-panel` po `openForAgent` zavolá `chatHeads.focusHead(threadId)` → značí který head je open

**G. Overflow popover (+N):**
1. Stack má 6+ aktivních threadů → 5 viditelných + `+N` pill
2. Klik na +N → popover s plnou listou (mění se na dropdown s mini chat-head rows: ikona + název + relative time)
3. Klik na položku v popover → standard chat-head behavior

### Error model

`chat-heads.js` failuje gracefully:
- Pokud `chat-storage.getSettings()` throw → log warn, render empty stack
- Pokud `activeChatHeads` obsahuje stale agentId (smazaný) → `chatHeads.refresh()` to detekuje a vyřadí; settings se vyčistí
- Pokud thread byl smazán z historie → stejná logika

### Test plan

`tests/test-suites/chat-heads.test.js` (~10 tests):
1. `addHead` přidá nový head a persistuje do settings
2. `addHead` na duplikátní threadId přesune head na top (index 0), nepřidá nový
3. Stack větší než 5 → 6. add posune nejstarší do "overflow" zóny (in-state oddělené pole nebo flag)
4. `removeHead` odstraní z stacku a settings
5. `markUnread` toggluje `hasUnread` flag
6. `clearUnread` ho ruší
7. `init()` zhydratuje state z settings
8. `init()` filtruje out heads se smazaným agentem
9. `getOpenHead()` vrací správný agent/thread
10. Render: stack DOM má správný počet `.chat-head` elementů + `.chat-heads-overflow` pokud > 5

Plus 1-2 integration tests v `chat-panel-tool-loop.test.js` že close()/minimize triggers correct chat-heads calls.

### Migration / breaking changes

- Žádné breaking changes pro stávající chat-panel API
- Settings `activeChatHeads` defaultuje na `[]` pro existující uživatele
- Existující "minimized header strip" stylování se odstraní (`.chat-panel--minimized` přestane existovat — místo toho panel zmizí a head se objeví)

### Out of scope (later)

- Right-click / long-press menu na chat-head (close, settings)
- Drag-to-reorder heads
- Per-agent unread sound notification
- Změnit pravidlo "1 head per agent" na "1 head per thread" (zatím držíme po-agentově pro čistší vizuál)

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Stack překrývá launcher na malém viewport | Hard limit 5 + responsive: na vh < 600px snižit max na 3 |
| Animace ripple drobí baterii když je 5 unread | Pause animace pokud `document.hidden === true` (Page Visibility API) |
| Active chat-head s neexistujícím threadem (race po smazání agenta) | `init()` validuje, automaticky vyčistí |
| Unread state přetrvá po reload | Persistuje v settings.activeChatHeads[].hasUnread; clearuje se po openForAgent |
