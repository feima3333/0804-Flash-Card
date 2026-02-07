'use strict';

const STORAGE_KEY = '0804_v5_state';
const LEGACY_KEYS = {
    decks: '0804_v4_decks',
    resources: '0804_v4_resources',
    trash: '0804_v4_trash'
};

let idCounter = 0;

function createId() {
    idCounter += 1;
    return String(Date.now() * 1000 + idCounter);
}

function withFallback(fn, fallbackValue) {
    try {
        return fn();
    } catch (error) {
        console.error(error);
        return fallbackValue;
    }
}

function safeParse(raw, fallbackValue) {
    return withFallback(() => {
        if (typeof raw !== 'string') {
            return fallbackValue;
        }
        return JSON.parse(raw);
    }, fallbackValue);
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
    return normalizeText(value).toLowerCase();
}

function sanitizeBullets(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => normalizeText(item))
        .filter((item) => item.length > 0);
}

function sanitizeCard(input) {
    if (!isObject(input)) {
        return null;
    }

    const frontTitle = normalizeText(input.frontTitle);
    const backContent = typeof input.backContent === 'string' ? input.backContent : '';
    const frontBullets = sanitizeBullets(input.frontBullets);

    if (!frontTitle && !backContent.trim() && frontBullets.length === 0) {
        return null;
    }

    return {
        id: normalizeText(input.id) || createId(),
        frontTitle: frontTitle || 'Untitled Card',
        frontBullets,
        backContent
    };
}

function sanitizeDeck(input) {
    if (!isObject(input)) {
        return null;
    }

    const title = normalizeText(input.title);
    if (!title) {
        return null;
    }

    const category = normalizeText(input.category) || 'Vocabulary';
    const cardsInput = Array.isArray(input.cards) ? input.cards : [];
    const cards = cardsInput
        .map((card) => sanitizeCard(card))
        .filter(Boolean);

    return {
        id: normalizeText(input.id) || createId(),
        title,
        category,
        cards
    };
}

function sanitizeResource(input) {
    if (!isObject(input)) {
        return null;
    }

    const title = normalizeText(input.title);
    if (!title) {
        return null;
    }

    const rawType = normalizeText(input.type).toLowerCase();
    const type = rawType === 'vocab' ? 'vocab' : 'story';

    return {
        id: normalizeText(input.id) || createId(),
        title,
        content: typeof input.content === 'string' ? input.content : '',
        type
    };
}

function sanitizeTrashItem(input) {
    if (!isObject(input)) {
        return null;
    }

    const type = normalizeText(input.type);
    if (!['deck', 'resource', 'card'].includes(type)) {
        return null;
    }

    let data = null;
    if (type === 'deck') {
        data = sanitizeDeck(input.data);
    } else if (type === 'resource') {
        data = sanitizeResource(input.data);
    } else {
        data = sanitizeCard(input.data);
    }

    if (!data) {
        return null;
    }

    return {
        id: normalizeText(input.id) || createId(),
        type,
        data,
        originId: normalizeText(input.originId) || null,
        date: normalizeText(input.date) || new Date().toLocaleString()
    };
}

function normalizeState(raw, migratedFrom = 'none') {
    const source = isObject(raw) ? raw : {};
    const decks = (Array.isArray(source.decks) ? source.decks : [])
        .map((deck) => sanitizeDeck(deck))
        .filter(Boolean);
    const resources = (Array.isArray(source.resources) ? source.resources : [])
        .map((resource) => sanitizeResource(resource))
        .filter(Boolean);
    const trash = (Array.isArray(source.trash) ? source.trash : [])
        .map((item) => sanitizeTrashItem(item))
        .filter(Boolean);

    const metaInput = isObject(source.meta) ? source.meta : {};
    const meta = {
        migratedFrom: normalizeText(metaInput.migratedFrom) || migratedFrom,
        lastSavedAt: normalizeText(metaInput.lastSavedAt) || new Date().toISOString()
    };

    return {
        version: 5,
        decks,
        resources,
        trash,
        meta
    };
}

function hasLegacyData(decks, resources, trash) {
    return decks.length > 0 || resources.length > 0 || trash.length > 0;
}

const startupNotices = [];

function loadState() {
    const rawV5 = localStorage.getItem(STORAGE_KEY);
    const parsedV5 = safeParse(rawV5, null);

    if (isObject(parsedV5) && Array.isArray(parsedV5.decks) && Array.isArray(parsedV5.resources) && Array.isArray(parsedV5.trash)) {
        return normalizeState(parsedV5, normalizeText(parsedV5.meta?.migratedFrom) || 'none');
    }

    if (rawV5) {
        startupNotices.push({
            message: 'Detected corrupted v5 data, trying legacy migration.',
            type: 'error'
        });
    }

    const legacyDecks = safeParse(localStorage.getItem(LEGACY_KEYS.decks), []);
    const legacyResources = safeParse(localStorage.getItem(LEGACY_KEYS.resources), []);
    const legacyTrash = safeParse(localStorage.getItem(LEGACY_KEYS.trash), []);

    const normalizedLegacy = normalizeState(
        {
            decks: Array.isArray(legacyDecks) ? legacyDecks : [],
            resources: Array.isArray(legacyResources) ? legacyResources : [],
            trash: Array.isArray(legacyTrash) ? legacyTrash : []
        },
        'v4'
    );

    if (hasLegacyData(normalizedLegacy.decks, normalizedLegacy.resources, normalizedLegacy.trash)) {
        saveState(normalizedLegacy, { silent: true });
        startupNotices.push({
            message: 'Migrated legacy local data to v5 format.',
            type: 'success'
        });
        return normalizedLegacy;
    }

    return normalizeState({}, 'none');
}

let appState = loadState();
let decks = appState.decks;
let resources = appState.resources;
let trashBin = appState.trash;

let currentDeck = null;
let currentCardIndex = 0;
let currentToolboxTab = 'story';
let currentPickerTab = 'story';
let currentEditPickerTab = 'story';
let currentEditingResourceId = null;
let currentEditingDeckId = null;
let currentDashboardTab = 'Speaking';
let keyboardEnabled = false;
let sorterItems = [];
let pendingDeleteAction = null;
let pendingPreviewCreation = null;
let importMode = 'merge';

const loveNotes = [
    '小宝练习苦啦! 奖励一个抱抱 🤗',
    '雅思必过! 🦆💯',
    '纽约今天很冷, 但想到你就很暖.☀',
    '记得喝水, 记得想我 💧❤',
    '0804 是宇宙最浪漫的坐标 🪐',
    '小幸运和我都陪着宝宝 ❤',
    '最喜欢我的小潜宝宝了~',
    '宝宝也要记得休息眼睛, 可以闭着眼睛亲我'
];

function saveState(state, options = {}) {
    const normalized = normalizeState(state, normalizeText(state?.meta?.migratedFrom) || 'none');
    normalized.meta.lastSavedAt = new Date().toISOString();

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        appState = normalized;
        return true;
    } catch (error) {
        console.error(error);
        if (!options.silent) {
            showToast('保存失败（容量不足）', 'error');
        }
        return false;
    }
}

function persistState() {
    appState.decks = decks;
    appState.resources = resources;
    appState.trash = trashBin;
    return saveState(appState);
}

function clearChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

function createEmptyState(message) {
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = message;
    return p;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('notification-area');
    if (!container) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const dot = document.createElement('span');
    dot.style.fontSize = '18px';
    dot.style.color = type === 'success' ? '#00b894' : '#ff7675';
    dot.textContent = '●';

    toast.appendChild(dot);
    toast.appendChild(document.createTextNode(` ${message}`));
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
}

function openModalById(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function toggleMobileSidebar(forceOpen = null) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (!sidebar || !overlay) {
        return;
    }

    const shouldOpen = forceOpen === null ? !sidebar.classList.contains('active') : forceOpen;
    sidebar.classList.toggle('active', shouldOpen);
    overlay.classList.toggle('active', shouldOpen);
}

function updateVocabHelper() {
    const category = document.getElementById('deck-category').value;
    const helper = document.getElementById('vocab-helper');
    if (helper) {
        helper.style.display = category === 'Vocabulary' ? 'block' : 'none';
    }
}

function fillExample() {
    document.getElementById('card-front-input').value = 'example：例子；study：学习；practice：练习';
    document.getElementById('card-back-input').value = '';
}

function showLoveNote() {
    const note = loveNotes[Math.floor(Math.random() * loveNotes.length)];
    openResourceModal('💌 来自 Fermat 的悄悄话', note);
}

function navTo(viewId) {
    if (window.innerWidth <= 768) {
        toggleMobileSidebar(false);
    }

    document.querySelectorAll('.view-section').forEach((section) => {
        section.style.display = 'none';
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) {
        targetView.style.display = viewId === 'study' ? 'flex' : 'block';
    }

    document.querySelectorAll('.sidebar .btn').forEach((button) => {
        button.classList.remove('btn-active');
    });

    const navButtonMap = {
        dashboard: 'nav-dashboard',
        create: 'nav-create',
        toolbox: 'nav-toolbox',
        'add-resource': 'nav-add-resource',
        trash: 'nav-trash',
        settings: 'nav-settings'
    };

    const activeButtonId = navButtonMap[viewId];
    if (activeButtonId) {
        document.getElementById(activeButtonId).classList.add('btn-active');
    }

    if (viewId === 'dashboard') {
        renderDashboard(currentDashboardTab);
    } else if (viewId === 'toolbox') {
        renderToolbox(currentToolboxTab);
    } else if (viewId === 'create') {
        renderToolboxPicker();
    } else if (viewId === 'trash') {
        renderTrash();
    }

    keyboardEnabled = viewId === 'study';
}

function isSpeakingCategory(category) {
    const value = normalizeText(category).toLowerCase();
    if (!value) {
        return false;
    }
    if (value.includes('speaking')) {
        return true;
    }
    return /^part\s*1$/.test(value) || /^part\s*2$/.test(value) || /^part\s*3$/.test(value);
}

function getSpeakingPart(category) {
    const value = normalizeText(category).toLowerCase();
    if (value.includes('part 1') || value === 'part1') {
        return 1;
    }
    if (value.includes('part 2') || value === 'part2') {
        return 2;
    }
    if (value.includes('part 3') || value === 'part3') {
        return 3;
    }
    return 0;
}

function filterDashboard() {
    const term = normalizeKey(document.getElementById('dashboard-search').value);
    document.querySelectorAll('#dashboard-content .card-item').forEach((card) => {
        const titleElement = card.querySelector('h3');
        const title = titleElement ? normalizeKey(titleElement.textContent) : '';
        card.style.display = title.includes(term) ? 'block' : 'none';
    });
}

function renderDashboard(tabName = 'Speaking') {
    currentDashboardTab = tabName;
    const container = document.getElementById('dashboard-content');
    clearChildren(container);

    document.getElementById('dash-btn-speaking').classList.toggle('active', tabName === 'Speaking');
    document.getElementById('dash-btn-vocab').classList.toggle('active', tabName === 'Vocabulary');

    if (decks.length === 0) {
        container.appendChild(createEmptyState('No collections yet.'));
        return;
    }

    if (tabName === 'Speaking') {
        const speakingDecks = decks
            .filter((deck) => isSpeakingCategory(deck.category))
            .sort((a, b) => getSpeakingPart(a.category) - getSpeakingPart(b.category));

        if (speakingDecks.length === 0) {
            container.appendChild(createEmptyState('No Speaking decks found.'));
            return;
        }

        const part1 = speakingDecks.filter((deck) => getSpeakingPart(deck.category) === 1);
        const part2 = speakingDecks.filter((deck) => getSpeakingPart(deck.category) === 2);
        const part3 = speakingDecks.filter((deck) => getSpeakingPart(deck.category) === 3);
        const other = speakingDecks.filter((deck) => getSpeakingPart(deck.category) === 0);

        if (part1.length) renderExpandableSection(container, 'Speaking Part 1', part1);
        if (part2.length) renderExpandableSection(container, 'Speaking Part 2', part2);
        if (part3.length) renderExpandableSection(container, 'Speaking Part 3', part3);
        if (other.length) renderExpandableSection(container, 'Speaking (Other)', other);
        return;
    }

    const vocabDecks = decks.filter((deck) => !isSpeakingCategory(deck.category));
    if (vocabDecks.length === 0) {
        container.appendChild(createEmptyState('No Vocabulary decks found.'));
        return;
    }
    renderExpandableSection(container, 'Vocabulary Lists', vocabDecks);
}

function renderExpandableSection(container, title, deckList) {
    const sectionId = `sec-${title.replace(/[^a-zA-Z0-9]+/g, '-')}`;

    const header = document.createElement('div');
    header.className = 'section-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'section-title-group';
    titleGroup.appendChild(document.createTextNode(title));

    const count = document.createElement('span');
    count.textContent = String(deckList.length);
    titleGroup.appendChild(count);
    header.appendChild(titleGroup);

    if (deckList.length > 4) {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'btn-view-all';
        toggleButton.dataset.action = 'toggle-section';
        toggleButton.dataset.sectionId = sectionId;
        toggleButton.dataset.expanded = 'false';
        toggleButton.textContent = `View All (${deckList.length}) ▼`;
        header.appendChild(toggleButton);
    }

    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'grid-list';
    grid.id = sectionId;

    deckList.forEach((deck, index) => {
        const item = createDeckElement(deck);
        if (index >= 4) {
            item.classList.add('hidden-deck');
            item.style.display = 'none';
        }
        grid.appendChild(item);
    });

    container.appendChild(grid);
}

function toggleSection(sectionId, button) {
    const section = document.getElementById(sectionId);
    if (!section) {
        return;
    }

    const isExpanded = button.dataset.expanded === 'true';
    const allCards = section.querySelectorAll('.card-item');

    if (isExpanded) {
        allCards.forEach((card, index) => {
            card.style.display = index < 4 ? 'block' : 'none';
        });
        button.dataset.expanded = 'false';
        button.textContent = `View All (${allCards.length}) ▼`;
        return;
    }

    allCards.forEach((card) => {
        card.style.display = 'block';
    });
    button.dataset.expanded = 'true';
    button.textContent = 'Collapse ▲';
}

function createDeckElement(deck) {
    const card = document.createElement('div');
    card.className = 'card-item';
    card.dataset.deckId = deck.id;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'item-action-btn btn-delete-item';
    deleteBtn.dataset.action = 'delete-deck';
    deleteBtn.dataset.deckId = deck.id;
    deleteBtn.type = 'button';
    deleteBtn.textContent = '×';

    const editBtn = document.createElement('button');
    editBtn.className = 'item-action-btn btn-edit-item';
    editBtn.dataset.action = 'edit-deck';
    editBtn.dataset.deckId = deck.id;
    editBtn.type = 'button';
    editBtn.textContent = '✎';

    const categoryTag = document.createElement('span');
    categoryTag.style.fontSize = '10px';
    categoryTag.style.background = '#eee';
    categoryTag.style.padding = '3px 8px';
    categoryTag.style.borderRadius = '10px';
    categoryTag.textContent = normalizeText(deck.category) || 'Uncategorized';

    const title = document.createElement('h3');
    title.textContent = deck.title;

    const meta = document.createElement('p');
    meta.textContent = `${deck.cards.length} Cards`;

    card.appendChild(deleteBtn);
    card.appendChild(editBtn);
    card.appendChild(categoryTag);
    card.appendChild(title);
    card.appendChild(meta);

    return card;
}

function resourceTypeLabel(type) {
    return type === 'vocab' ? 'Vocabulary' : 'Story';
}

function renderToolbox(tab = 'story') {
    currentToolboxTab = tab;

    document.getElementById('tab-btn-story').classList.toggle('active', tab === 'story');
    document.getElementById('tab-btn-vocab').classList.toggle('active', tab === 'vocab');

    const list = document.getElementById('resource-list');
    clearChildren(list);

    const filtered = resources.filter((resource) => (resource.type || 'story') === tab);
    if (filtered.length === 0) {
        list.appendChild(createEmptyState('No materials yet.'));
        return;
    }

    filtered.forEach((resource) => {
        const card = document.createElement('div');
        card.className = 'card-item';
        card.dataset.resourceId = resource.id;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'item-action-btn btn-delete-item';
        deleteBtn.dataset.action = 'delete-resource';
        deleteBtn.dataset.resourceId = resource.id;
        deleteBtn.type = 'button';
        deleteBtn.textContent = '×';

        const editBtn = document.createElement('button');
        editBtn.className = 'item-action-btn btn-edit-item';
        editBtn.dataset.action = 'edit-resource';
        editBtn.dataset.resourceId = resource.id;
        editBtn.type = 'button';
        editBtn.textContent = '✎';

        const typeTag = document.createElement('span');
        typeTag.style.fontSize = '10px';
        typeTag.style.background = '#eee';
        typeTag.style.padding = '3px 8px';
        typeTag.style.borderRadius = '10px';
        typeTag.textContent = resourceTypeLabel(resource.type);

        const title = document.createElement('h3');
        title.textContent = resource.title;

        const preview = document.createElement('p');
        preview.textContent = resource.content.length > 90 ? `${resource.content.slice(0, 90)}...` : resource.content || '(No content)';

        card.appendChild(deleteBtn);
        card.appendChild(editBtn);
        card.appendChild(typeTag);
        card.appendChild(title);
        card.appendChild(preview);

        list.appendChild(card);
    });
}

function insertResourceLink(title) {
    const input = document.getElementById('card-back-input');
    const text = `${input.value.length > 0 ? '\n' : ''}[${title}]`;
    input.value += text;
    input.selectionStart = input.selectionEnd = input.value.length;
    input.focus();
}

function insertEditLink(title) {
    const input = document.getElementById('edit-back-content');
    const text = `${input.value.length > 0 ? '\n' : ''}[${title}]`;
    input.value += text;
    input.selectionStart = input.selectionEnd = input.value.length;
    input.focus();
}

function setPickerTab(tab) {
    currentPickerTab = tab;
    document.getElementById('tab-picker-story').classList.toggle('active', tab === 'story');
    document.getElementById('tab-picker-vocab').classList.toggle('active', tab === 'vocab');
    document.getElementById('tab-picker-deck').classList.toggle('active', tab === 'deck');
    renderToolboxPicker();
}

function setEditPickerTab(tab) {
    currentEditPickerTab = tab;
    document.getElementById('edit-picker-story').classList.toggle('active', tab === 'story');
    document.getElementById('edit-picker-vocab').classList.toggle('active', tab === 'vocab');
    document.getElementById('edit-picker-deck').classList.toggle('active', tab === 'deck');
    renderEditPicker();
}

function createPickerItem(titleText, previewText, onClick) {
    const item = document.createElement('div');
    item.className = 'toolbox-draggable';
    item.draggable = true;

    const title = document.createElement('div');
    title.textContent = titleText;

    const preview = document.createElement('div');
    preview.style.fontSize = '11px';
    preview.style.color = '#888';
    preview.textContent = previewText;

    item.appendChild(title);
    item.appendChild(preview);
    item.addEventListener('click', onClick);

    return item;
}

function renderToolboxPicker() {
    const list = document.getElementById('toolbox-picker-list');
    const search = normalizeKey(document.getElementById('toolbox-picker-search').value);
    clearChildren(list);

    if (currentPickerTab === 'deck') {
        const deckMatches = decks.filter((deck) => normalizeKey(deck.title).includes(search));
        deckMatches.forEach((deck) => {
            const item = createPickerItem(`📂 ${deck.title}`, `${deck.cards.length} cards`, () => {
                insertResourceLink(deck.title);
            });
            item.classList.add('deck');
            item.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', `\n[${deck.title}]`);
                event.dataTransfer.effectAllowed = 'copy';
            });
            list.appendChild(item);
        });
        return;
    }

    const matches = resources.filter((resource) => {
        const type = resource.type || 'story';
        return type === currentPickerTab && normalizeKey(resource.title).includes(search);
    });

    matches.forEach((resource) => {
        const preview = resource.content.length > 80 ? `${resource.content.slice(0, 80)}...` : resource.content;
        const item = createPickerItem(resource.title, preview, () => {
            insertResourceLink(resource.title);
        });
        if (resource.type === 'vocab') {
            item.classList.add('deck');
        }
        item.addEventListener('dragstart', (event) => {
            event.dataTransfer.setData('text/plain', `\n[${resource.title}]`);
            event.dataTransfer.effectAllowed = 'copy';
        });
        list.appendChild(item);
    });
}

function renderEditPicker() {
    const list = document.getElementById('edit-picker-list');
    const search = normalizeKey(document.getElementById('edit-picker-search').value);
    clearChildren(list);

    if (currentEditPickerTab === 'deck') {
        decks
            .filter((deck) => normalizeKey(deck.title).includes(search))
            .forEach((deck) => {
                const item = createPickerItem(`📂 ${deck.title}`, `${deck.cards.length} cards`, () => {
                    insertEditLink(deck.title);
                });
                item.classList.add('deck');
                item.addEventListener('dragstart', (event) => {
                    event.dataTransfer.setData('text/plain', `\n[${deck.title}]`);
                });
                list.appendChild(item);
            });
        return;
    }

    resources
        .filter((resource) => {
            const type = resource.type || 'story';
            return type === currentEditPickerTab && normalizeKey(resource.title).includes(search);
        })
        .forEach((resource) => {
            const item = createPickerItem(resource.title, resourceTypeLabel(resource.type), () => {
                insertEditLink(resource.title);
            });
            item.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', `\n[${resource.title}]`);
            });
            list.appendChild(item);
        });
}

function renderLinkedText(container, text) {
    const content = String(text || '');
    const regex = /(\[(.*?)\]|【(.*?)】)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            container.appendChild(document.createTextNode(content.slice(lastIndex, match.index)));
        }

        const term = normalizeText(match[2] || match[3] || '');
        if (!term) {
            container.appendChild(document.createTextNode(match[0]));
        } else {
            container.appendChild(createReferenceNode(term));
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        container.appendChild(document.createTextNode(content.slice(lastIndex)));
    }
}

function createReferenceNode(term) {
    const deck = decks.find((item) => normalizeKey(item.title) === normalizeKey(term));
    if (deck) {
        const link = document.createElement('span');
        link.className = 'smart-link';
        link.dataset.linkType = 'deck';
        link.dataset.deckId = deck.id;
        link.textContent = `📦 ${term}`;
        return link;
    }

    const resource = resources.find((item) => normalizeKey(item.title) === normalizeKey(term));
    if (resource) {
        const link = document.createElement('span');
        link.className = 'smart-link';
        link.dataset.linkType = 'resource';
        link.dataset.resourceId = resource.id;
        link.textContent = `📄 ${term}`;
        return link;
    }

    const strong = document.createElement('strong');
    strong.textContent = term;
    return strong;
}

function renderLinkedMultiline(container, text) {
    const lines = String(text || '').split('\n');
    lines.forEach((line, index) => {
        renderLinkedText(container, line);
        if (index < lines.length - 1) {
            container.appendChild(document.createElement('br'));
        }
    });
}

function openResourceModal(title, content) {
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    modalTitle.textContent = title;
    clearChildren(modalBody);

    if (!String(content || '').trim()) {
        modalBody.textContent = '(No content)';
    } else {
        renderLinkedMultiline(modalBody, content);
    }

    openModalById('res-modal');
}

function loadCard() {
    if (!currentDeck || currentDeck.cards.length === 0) {
        return;
    }

    const card = currentDeck.cards[currentCardIndex];
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('is-flipped');

    setTimeout(() => {
        document.getElementById('card-deck-badge-back').textContent = currentDeck.title;
        document.getElementById('card-front-title').textContent = card.frontTitle;

        const requirements = document.getElementById('card-front-reqs');
        clearChildren(requirements);

        if (card.frontBullets.length > 0) {
            requirements.style.display = 'block';
            card.frontBullets.forEach((bullet) => {
                const li = document.createElement('li');
                li.textContent = bullet;
                requirements.appendChild(li);
            });
        } else {
            requirements.style.display = 'none';
        }

        const backContainer = document.getElementById('card-back-content');
        clearChildren(backContainer);

        const raw = card.backContent || '';
        if (!raw.trim()) {
            const empty = document.createElement('span');
            empty.style.color = '#aaa';
            empty.style.fontStyle = 'italic';
            empty.textContent = '(No content)';
            backContainer.appendChild(empty);
            return;
        }

        const lines = raw.split('\n').filter((line) => line.trim().length > 0);
        const shouldRenderAsList = lines.length > 1 || raw.includes('•') || raw.includes('- ');

        if (!shouldRenderAsList) {
            renderLinkedText(backContainer, raw);
            return;
        }

        const list = document.createElement('ul');
        list.className = 'flashcard-list';

        lines.forEach((line) => {
            const li = document.createElement('li');
            const text = line.replace(/^[•\-*]\s*/, '');
            renderLinkedText(li, text);
            list.appendChild(li);
        });

        backContainer.appendChild(list);
    }, 200);
}

function startStudy(deckId) {
    currentDeck = decks.find((deck) => deck.id === deckId);
    currentCardIndex = 0;

    if (!currentDeck || currentDeck.cards.length === 0) {
        showToast('Empty deck', 'error');
        return;
    }

    navTo('study');
    loadCard();
}

function goToNextCard() {
    if (!currentDeck) {
        return;
    }

    currentCardIndex += 1;
    if (currentCardIndex < currentDeck.cards.length) {
        loadCard();
        return;
    }

    showToast('完成当前卡组，辛苦啦!', 'success');
    navTo('dashboard');
}

function goToPreviousCard() {
    if (!currentDeck) {
        return;
    }

    if (currentCardIndex === 0) {
        showToast('Already at first card.', 'error');
        return;
    }

    currentCardIndex -= 1;
    loadCard();
}

function flipCard(event) {
    if (event.target.closest('.smart-link') || event.target.closest('button')) {
        return;
    }
    document.getElementById('flashcard').classList.toggle('is-flipped');
}

function showConfirmModal(message, action) {
    pendingDeleteAction = action;
    document.getElementById('confirm-msg').textContent = message;
    openModalById('confirm-modal');
}

function moveToTrash(type, data, originId = null) {
    const item = {
        id: createId(),
        type,
        data,
        originId,
        date: new Date().toLocaleString()
    };
    trashBin.unshift(item);
}

function confirmDeleteDeck(deckId) {
    showConfirmModal('Move collection to trash?', () => {
        const target = decks.find((deck) => deck.id === deckId);
        if (!target) {
            return;
        }

        moveToTrash('deck', target);
        decks = decks.filter((deck) => deck.id !== deckId);
        persistState();
        renderDashboard(currentDashboardTab);
        showToast('Moved to trash.');
    });
}

function confirmDeleteResource(resourceId) {
    showConfirmModal('Move material to trash?', () => {
        const target = resources.find((resource) => resource.id === resourceId);
        if (!target) {
            return;
        }

        moveToTrash('resource', target);
        resources = resources.filter((resource) => resource.id !== resourceId);
        persistState();
        renderToolbox(currentToolboxTab);
        showToast('Moved to trash.');
    });
}

function confirmDeleteCard() {
    if (!currentDeck || currentDeck.cards.length === 0) {
        return;
    }

    showConfirmModal('Delete this specific card?', () => {
        const card = currentDeck.cards[currentCardIndex];
        moveToTrash('card', card, currentDeck.id);
        currentDeck.cards.splice(currentCardIndex, 1);
        persistState();

        if (currentDeck.cards.length === 0) {
            showToast('Card deleted, deck is now empty.');
            navTo('dashboard');
            return;
        }

        if (currentCardIndex >= currentDeck.cards.length) {
            currentCardIndex = currentDeck.cards.length - 1;
        }

        showToast('Moved to trash.');
        loadCard();
    });
}

function renderTrash() {
    const list = document.getElementById('trash-list');
    clearChildren(list);

    if (trashBin.length === 0) {
        list.appendChild(createEmptyState('Trash is empty.'));
        return;
    }

    trashBin.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'trash-item';

        const info = document.createElement('div');

        const date = document.createElement('span');
        date.className = 'trash-type';
        date.textContent = item.date;

        const title = document.createElement('span');
        title.className = 'trash-title';
        if (item.type === 'deck') {
            title.textContent = `📚 ${item.data.title}`;
        } else if (item.type === 'resource') {
            title.textContent = `📄 ${item.data.title}`;
        } else {
            title.textContent = `🃏 ${item.data.frontTitle}`;
        }

        info.appendChild(date);
        info.appendChild(document.createElement('br'));
        info.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'trash-actions';

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'btn-restore';
        restoreBtn.dataset.action = 'restore-trash';
        restoreBtn.dataset.trashId = item.id;
        restoreBtn.textContent = 'Restore';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-forever';
        deleteBtn.dataset.action = 'delete-trash';
        deleteBtn.dataset.trashId = item.id;
        deleteBtn.textContent = 'Delete';

        actions.appendChild(restoreBtn);
        actions.appendChild(deleteBtn);

        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
    });
}

function restoreItem(trashId) {
    const index = trashBin.findIndex((item) => item.id === trashId);
    if (index === -1) {
        return;
    }

    const item = trashBin[index];
    if (item.type === 'deck') {
        decks.push(item.data);
    } else if (item.type === 'resource') {
        resources.push(item.data);
    } else {
        let targetDeck = decks.find((deck) => deck.id === item.originId);
        if (!targetDeck) {
            targetDeck = decks.find((deck) => normalizeKey(deck.title) === normalizeKey('Restored Cards'));
            if (!targetDeck) {
                targetDeck = {
                    id: createId(),
                    title: 'Restored Cards',
                    category: 'Vocabulary',
                    cards: []
                };
                decks.push(targetDeck);
            }
        }
        targetDeck.cards.push(item.data);
    }

    trashBin.splice(index, 1);
    persistState();
    renderTrash();
    showToast('Restored!');
}

function hardDelete(trashId) {
    showConfirmModal('Delete forever?', () => {
        trashBin = trashBin.filter((item) => item.id !== trashId);
        persistState();
        renderTrash();
        showToast('Deleted.');
    });
}

function confirmEmptyTrash() {
    showConfirmModal('Empty trash?', () => {
        trashBin = [];
        persistState();
        renderTrash();
        showToast('Trash emptied.');
    });
}

function openEditDeckModal(deckId) {
    const deck = decks.find((item) => item.id === deckId);
    if (!deck) {
        return;
    }

    currentEditingDeckId = deckId;
    document.getElementById('edit-deck-name').value = deck.title;
    document.getElementById('edit-deck-cat').value = deck.category || 'Speaking Part 2';
    openModalById('edit-deck-modal');
}

function saveDeckEdits() {
    const deck = decks.find((item) => item.id === currentEditingDeckId);
    if (!deck) {
        return;
    }

    const nextTitle = normalizeText(document.getElementById('edit-deck-name').value);
    if (!nextTitle) {
        showToast('Deck title cannot be empty.', 'error');
        return;
    }

    deck.title = nextTitle;
    deck.category = document.getElementById('edit-deck-cat').value;
    persistState();
    renderDashboard(currentDashboardTab);
    closeModal('edit-deck-modal');
    showToast('Updated!');
}

function openEditResourceModal(resourceId) {
    const resource = resources.find((item) => item.id === resourceId);
    if (!resource) {
        return;
    }

    currentEditingResourceId = resourceId;
    document.getElementById('edit-res-title').value = resource.title;
    document.getElementById('edit-res-content').value = resource.content;
    openModalById('edit-resource-modal');
}

function saveResourceEdits() {
    const index = resources.findIndex((resource) => resource.id === currentEditingResourceId);
    if (index === -1) {
        return;
    }

    const title = normalizeText(document.getElementById('edit-res-title').value);
    if (!title) {
        showToast('Title needed', 'error');
        return;
    }

    resources[index].title = title;
    resources[index].content = document.getElementById('edit-res-content').value;
    persistState();
    closeModal('edit-resource-modal');
    renderToolbox(currentToolboxTab);
    showToast('Updated!');
}

function openEditCardModal() {
    if (!currentDeck || currentDeck.cards.length === 0) {
        return;
    }

    const card = currentDeck.cards[currentCardIndex];
    document.getElementById('edit-front-title').value = card.frontTitle;
    document.getElementById('edit-front-bullets').value = card.frontBullets.join('\n');
    document.getElementById('edit-back-content').value = card.backContent;
    setEditPickerTab(currentEditPickerTab);
    openModalById('edit-card-modal');
}

function saveCardEdits() {
    if (!currentDeck || currentDeck.cards.length === 0) {
        return;
    }

    const card = currentDeck.cards[currentCardIndex];
    card.frontTitle = normalizeText(document.getElementById('edit-front-title').value) || 'Untitled Card';
    card.frontBullets = document
        .getElementById('edit-front-bullets')
        .value
        .split('\n')
        .map((line) => normalizeText(line))
        .filter(Boolean);
    card.backContent = document.getElementById('edit-back-content').value;

    persistState();
    closeModal('edit-card-modal');
    loadCard();
    showToast('Card updated.');
}

function toggleImportMode() {
    const mode = document.getElementById('res-type-select').value;
    document.getElementById('import-single').style.display = mode === 'story' ? 'block' : 'none';
    document.getElementById('import-sorter').style.display = mode === 'sorter' ? 'block' : 'none';
}

function saveResource() {
    const title = normalizeText(document.getElementById('res-title').value);
    const content = document.getElementById('res-content').value;

    if (!title) {
        showToast('Title needed', 'error');
        return;
    }

    resources.push({
        id: createId(),
        title,
        content,
        type: 'story'
    });

    persistState();
    document.getElementById('res-title').value = '';
    document.getElementById('res-content').value = '';
    showToast('Saved');
    navTo('toolbox');
}

function parseRawNotes() {
    const raw = document.getElementById('sorter-raw-input').value;
    const tokens = raw
        .split(/[\n,，;；、]+/)
        .map((token) => normalizeText(token))
        .filter(Boolean);

    const seen = new Set();
    sorterItems = [];
    tokens.forEach((token) => {
        const key = normalizeKey(token);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        sorterItems.push({
            id: createId(),
            text: token,
            selected: true
        });
    });

    const step2 = document.getElementById('sorter-step-2');
    if (sorterItems.length === 0) {
        step2.style.display = 'none';
        showToast('No items detected.', 'error');
        return;
    }

    step2.style.display = 'block';
    renderSorterItems();
}

function renderSorterItems() {
    const list = document.getElementById('sorter-results-list');
    clearChildren(list);

    sorterItems.forEach((item) => {
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '8px 10px';
        row.style.marginBottom = '6px';
        row.style.border = '1px solid #eee';
        row.style.borderRadius = '8px';
        row.style.background = '#fff';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.selected;
        checkbox.dataset.sorterId = item.id;
        checkbox.style.width = 'auto';
        checkbox.style.margin = '0';

        const text = document.createElement('span');
        text.textContent = item.text;

        row.appendChild(checkbox);
        row.appendChild(text);
        list.appendChild(row);
    });
}

function bundleSelectedItems() {
    const title = normalizeText(document.getElementById('sorter-category-name').value);
    if (!title) {
        showToast('Category name is required.', 'error');
        return;
    }

    const selected = sorterItems.filter((item) => item.selected).map((item) => item.text);
    if (selected.length === 0) {
        showToast('Select at least one item.', 'error');
        return;
    }

    resources.push({
        id: createId(),
        title,
        content: selected.join('\n'),
        type: 'vocab'
    });

    persistState();

    document.getElementById('sorter-category-name').value = '';
    document.getElementById('sorter-raw-input').value = '';
    document.getElementById('sorter-step-2').style.display = 'none';
    sorterItems = [];
    clearChildren(document.getElementById('sorter-results-list'));

    showToast(`Bundled ${selected.length} items.`);
    navTo('toolbox');
}

function deckIdentityKey(deck) {
    return `${normalizeKey(deck.title)}|${normalizeKey(deck.category)}`;
}

function cardIdentityKey(card) {
    return `${normalizeKey(card.frontTitle)}|${normalizeKey(card.backContent)}`;
}

function resourceIdentityKey(resource) {
    return `${normalizeKey(resource.title)}|${normalizeKey(resource.type || 'story')}`;
}

function trashIdentityKey(item) {
    const title = item.type === 'card' ? item.data.frontTitle : item.data.title;
    return `${normalizeKey(item.type)}|${normalizeKey(item.originId || '')}|${normalizeKey(title)}|${normalizeKey(item.date)}`;
}

function applyCardsToDeck(targetDeck, cards) {
    const existingKeys = new Set(targetDeck.cards.map((card) => cardIdentityKey(card)));
    let added = 0;
    let skipped = 0;

    cards.forEach((card) => {
        const key = cardIdentityKey(card);
        if (existingKeys.has(key)) {
            skipped += 1;
            return;
        }
        existingKeys.add(key);
        targetDeck.cards.push(card);
        added += 1;
    });

    return { added, skipped };
}

function showPreviewModal(cards, title, category) {
    pendingPreviewCreation = { cards, title, category };

    document.getElementById('preview-count').textContent = String(cards.length);
    document.getElementById('preview-deck-title').textContent = title;

    const list = document.getElementById('preview-list');
    clearChildren(list);

    cards.forEach((card) => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px; background:#f8f9fa; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px;';

        const left = document.createElement('div');

        const front = document.createElement('span');
        front.style.fontWeight = '700';
        front.style.color = 'var(--primary-dark)';
        front.textContent = card.frontTitle;

        const arrow = document.createElement('span');
        arrow.style.color = '#888';
        arrow.style.margin = '0 8px';
        arrow.textContent = '→';

        const back = document.createElement('span');
        back.textContent = card.backContent;

        left.appendChild(front);
        left.appendChild(arrow);
        left.appendChild(back);

        const check = document.createElement('span');
        check.style.color = '#00b894';
        check.textContent = '✓';

        row.appendChild(left);
        row.appendChild(check);
        list.appendChild(row);
    });

    openModalById('preview-modal');
}

function confirmPreviewCreation() {
    if (!pendingPreviewCreation) {
        return;
    }

    const { cards, title, category } = pendingPreviewCreation;
    const key = `${normalizeKey(title)}|${normalizeKey(category)}`;

    const deck = decks.find((item) => deckIdentityKey(item) === key);
    let addedCards = 0;
    let skippedCards = 0;

    if (deck) {
        const result = applyCardsToDeck(deck, cards);
        addedCards = result.added;
        skippedCards = result.skipped;
    } else {
        decks.push({
            id: createId(),
            title,
            category,
            cards: [...cards]
        });
        addedCards = cards.length;
    }

    persistState();

    document.getElementById('card-front-input').value = '';
    document.getElementById('card-back-input').value = '';
    closeModal('preview-modal');
    renderDashboard(currentDashboardTab);

    pendingPreviewCreation = null;
    showToast(`Created ${addedCards} cards${skippedCards ? `, skipped ${skippedCards} duplicates` : ''}.`);
}

function processDeck() {
    const frontInput = document.getElementById('card-front-input').value;
    const backInput = document.getElementById('card-back-input').value;
    const title = normalizeText(document.getElementById('deck-title').value) || 'Untitled';
    const category = document.getElementById('deck-category').value;

    if (!frontInput.trim()) {
        document.getElementById('card-front-input').style.borderColor = '#ff7675';
        showToast('Prompt is empty!', 'error');
        return;
    }

    if (category === 'Vocabulary') {
        const pairs = frontInput
            .split(/；|;/)
            .map((item) => normalizeText(item))
            .filter(Boolean);

        if (pairs.length === 0) {
            showToast('请输入单词！格式：英文：中文；英文：中文', 'error');
            return;
        }

        const cards = [];
        for (let index = 0; index < pairs.length; index += 1) {
            const pair = pairs[index];
            const parts = pair.split(/：|:/).map((part) => normalizeText(part));
            if (parts.length !== 2 || !parts[0] || !parts[1]) {
                showToast(`格式错误！请检查第 ${index + 1} 个单词`, 'error');
                return;
            }

            cards.push({
                id: createId(),
                frontTitle: parts[0],
                frontBullets: [],
                backContent: parts[1]
            });
        }

        showPreviewModal(cards, title, category);
        return;
    }

    const lines = frontInput.split(/\n+/).filter((line) => normalizeText(line));
    const titleLines = [];
    let bulletLines = [];
    let isSplitPointReached = false;

    lines.forEach((line) => {
        const lowered = line.toLowerCase();
        if (lowered.startsWith('you should') || lowered.includes('should say:')) {
            isSplitPointReached = true;
            return;
        }

        if (!isSplitPointReached) {
            titleLines.push(normalizeText(line));
            return;
        }

        const bullet = line
            .replace(/^(and )?explain /i, '')
            .replace(/^(and )?describe /i, '')
            .trim();
        if (bullet) {
            bulletLines.push(bullet);
        }
    });

    const frontTitle = isSplitPointReached
        ? (titleLines.length ? titleLines.join(' ') : title)
        : (lines.length > 1 ? title : normalizeText(frontInput) || title);

    if (!isSplitPointReached && lines.length > 1) {
        bulletLines = lines;
    }

    const card = {
        id: createId(),
        frontTitle,
        frontBullets: bulletLines,
        backContent: backInput.trim()
    };

    const deckKey = `${normalizeKey(title)}|${normalizeKey(category)}`;
    const existingDeck = decks.find((deck) => deckIdentityKey(deck) === deckKey);

    if (existingDeck) {
        const mergeResult = applyCardsToDeck(existingDeck, [card]);
        if (mergeResult.added === 0) {
            showToast('Duplicate card skipped.', 'error');
            return;
        }
    } else {
        decks.push({
            id: createId(),
            title,
            category,
            cards: [card]
        });
    }

    persistState();
    document.getElementById('card-front-input').value = '';
    document.getElementById('card-back-input').value = '';
    showToast('宝宝真棒! ❤️');
}

function exportData() {
    const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        decks,
        resources,
        trash: trashBin
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `0804_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Backup downloaded!');
}

function triggerImport() {
    openModalById('import-options-modal');
}

function selectImportMode(mode) {
    importMode = mode;
    closeModal('import-options-modal');
    document.getElementById('import-file-input').click();
}

function parseBackupPayload(rawText) {
    const parsed = safeParse(rawText, null);
    if (!isObject(parsed)) {
        throw new Error('Backup root must be an object.');
    }

    const decksInput = parsed.decks;
    const resourcesInput = parsed.resources;
    const trashInput = parsed.trash;

    if (decksInput !== undefined && !Array.isArray(decksInput)) {
        throw new Error('Field "decks" must be an array.');
    }
    if (resourcesInput !== undefined && !Array.isArray(resourcesInput)) {
        throw new Error('Field "resources" must be an array.');
    }
    if (trashInput !== undefined && !Array.isArray(trashInput)) {
        throw new Error('Field "trash" must be an array.');
    }

    const normalizedDecks = (Array.isArray(decksInput) ? decksInput : []).map((deck) => sanitizeDeck(deck)).filter(Boolean);
    const normalizedResources = (Array.isArray(resourcesInput) ? resourcesInput : []).map((resource) => sanitizeResource(resource)).filter(Boolean);
    const normalizedTrash = (Array.isArray(trashInput) ? trashInput : []).map((item) => sanitizeTrashItem(item)).filter(Boolean);

    if (normalizedDecks.length === 0 && normalizedResources.length === 0 && normalizedTrash.length === 0) {
        throw new Error('Backup does not contain valid data.');
    }

    return {
        decks: normalizedDecks,
        resources: normalizedResources,
        trash: normalizedTrash
    };
}

function mergeImportedData(imported) {
    const report = {
        newDecks: 0,
        mergedDecks: 0,
        newCards: 0,
        skippedCards: 0,
        newResources: 0,
        updatedResources: 0,
        skippedResources: 0,
        newTrash: 0
    };

    const deckMap = new Map();
    decks.forEach((deck) => {
        deckMap.set(deckIdentityKey(deck), deck);
    });

    imported.decks.forEach((importedDeck) => {
        const key = deckIdentityKey(importedDeck);
        const existingDeck = deckMap.get(key);

        if (!existingDeck) {
            decks.push(importedDeck);
            deckMap.set(key, importedDeck);
            report.newDecks += 1;
            report.newCards += importedDeck.cards.length;
            return;
        }

        const cardMerge = applyCardsToDeck(existingDeck, importedDeck.cards);
        report.newCards += cardMerge.added;
        report.skippedCards += cardMerge.skipped;
        if (cardMerge.added > 0) {
            report.mergedDecks += 1;
        }
    });

    const resourceMap = new Map();
    resources.forEach((resource) => {
        resourceMap.set(resourceIdentityKey(resource), resource);
    });

    imported.resources.forEach((resource) => {
        const key = resourceIdentityKey(resource);
        const existingResource = resourceMap.get(key);

        if (!existingResource) {
            resources.push(resource);
            resourceMap.set(key, resource);
            report.newResources += 1;
            return;
        }

        if (existingResource.content !== resource.content) {
            existingResource.content = resource.content;
            report.updatedResources += 1;
        } else {
            report.skippedResources += 1;
        }
    });

    const trashKeys = new Set(trashBin.map((item) => trashIdentityKey(item)));
    imported.trash.forEach((item) => {
        const key = trashIdentityKey(item);
        if (trashKeys.has(key)) {
            return;
        }
        trashKeys.add(key);
        trashBin.push(item);
        report.newTrash += 1;
    });

    return report;
}

function importData(input) {
    const file = input.files && input.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = parseBackupPayload(event.target.result);

            if (importMode === 'replace') {
                decks = imported.decks;
                resources = imported.resources;
                trashBin = imported.trash;
                persistState();
                showToast(`Success! Replaced with ${decks.length} decks & ${resources.length} resources.`);
            } else {
                const report = mergeImportedData(imported);
                persistState();
                showToast(
                    `Merged: +${report.newDecks} decks, +${report.newCards} cards, +${report.newResources} resources, ${report.updatedResources} updated, ${report.skippedCards + report.skippedResources} skipped.`
                );
            }

            renderDashboard(currentDashboardTab);
        } catch (error) {
            console.error(error);
            showToast(`Import failed: ${error.message}`, 'error');
        }
    };

    reader.readAsText(file);
    input.value = '';
}

function handleDashboardClick(event) {
    const actionButton = event.target.closest('button[data-action]');
    if (actionButton) {
        event.stopPropagation();
        const action = actionButton.dataset.action;

        if (action === 'toggle-section') {
            toggleSection(actionButton.dataset.sectionId, actionButton);
            return;
        }
        if (action === 'delete-deck') {
            confirmDeleteDeck(actionButton.dataset.deckId);
            return;
        }
        if (action === 'edit-deck') {
            openEditDeckModal(actionButton.dataset.deckId);
            return;
        }
    }

    const deckCard = event.target.closest('.card-item[data-deck-id]');
    if (deckCard) {
        startStudy(deckCard.dataset.deckId);
    }
}

function handleResourceListClick(event) {
    const actionButton = event.target.closest('button[data-action]');
    if (actionButton) {
        event.stopPropagation();
        const action = actionButton.dataset.action;
        if (action === 'delete-resource') {
            confirmDeleteResource(actionButton.dataset.resourceId);
            return;
        }
        if (action === 'edit-resource') {
            openEditResourceModal(actionButton.dataset.resourceId);
            return;
        }
    }

    const card = event.target.closest('.card-item[data-resource-id]');
    if (card) {
        const resource = resources.find((item) => item.id === card.dataset.resourceId);
        if (resource) {
            openResourceModal(resource.title, resource.content);
        }
    }
}

function handleTrashClick(event) {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) {
        return;
    }

    const trashId = actionButton.dataset.trashId;
    if (actionButton.dataset.action === 'restore-trash') {
        restoreItem(trashId);
    } else if (actionButton.dataset.action === 'delete-trash') {
        hardDelete(trashId);
    }
}

function handleSmartLinkClick(event) {
    const link = event.target.closest('.smart-link');
    if (!link) {
        return;
    }

    event.stopPropagation();

    if (link.dataset.linkType === 'deck') {
        const deck = decks.find((item) => item.id === link.dataset.deckId);
        if (deck && deck.cards.length > 0) {
            openResourceModal(`📦 ${deck.title}`, deck.cards[0].backContent || '(Empty Card)');
        } else {
            showToast('Deck empty', 'error');
        }
        return;
    }

    if (link.dataset.linkType === 'resource') {
        const resource = resources.find((item) => item.id === link.dataset.resourceId);
        if (resource) {
            openResourceModal(resource.title, resource.content);
        }
    }
}

function bindEvents() {
    document.getElementById('mobile-menu-btn').addEventListener('click', () => toggleMobileSidebar());
    document.getElementById('mobile-overlay').addEventListener('click', () => toggleMobileSidebar(false));

    document.getElementById('love-heart').addEventListener('click', showLoveNote);

    document.getElementById('nav-dashboard').addEventListener('click', () => navTo('dashboard'));
    document.getElementById('nav-create').addEventListener('click', () => navTo('create'));
    document.getElementById('nav-toolbox').addEventListener('click', () => navTo('toolbox'));
    document.getElementById('nav-add-resource').addEventListener('click', () => navTo('add-resource'));
    document.getElementById('nav-trash').addEventListener('click', () => navTo('trash'));
    document.getElementById('nav-settings').addEventListener('click', () => navTo('settings'));

    document.getElementById('dashboard-search').addEventListener('input', filterDashboard);
    document.getElementById('dash-btn-speaking').addEventListener('click', () => renderDashboard('Speaking'));
    document.getElementById('dash-btn-vocab').addEventListener('click', () => renderDashboard('Vocabulary'));

    document.getElementById('tab-btn-story').addEventListener('click', () => renderToolbox('story'));
    document.getElementById('tab-btn-vocab').addEventListener('click', () => renderToolbox('vocab'));

    document.getElementById('deck-category').addEventListener('change', updateVocabHelper);
    document.getElementById('fill-example-btn').addEventListener('click', fillExample);
    document.getElementById('generate-cards-btn').addEventListener('click', processDeck);

    document.getElementById('tab-picker-story').addEventListener('click', () => setPickerTab('story'));
    document.getElementById('tab-picker-vocab').addEventListener('click', () => setPickerTab('vocab'));
    document.getElementById('tab-picker-deck').addEventListener('click', () => setPickerTab('deck'));
    document.getElementById('toolbox-picker-search').addEventListener('input', renderToolboxPicker);

    document.getElementById('res-type-select').addEventListener('change', toggleImportMode);
    document.getElementById('save-resource-btn').addEventListener('click', saveResource);
    document.getElementById('parse-raw-notes-btn').addEventListener('click', parseRawNotes);
    document.getElementById('bundle-selected-btn').addEventListener('click', bundleSelectedItems);

    document.getElementById('sorter-results-list').addEventListener('change', (event) => {
        const checkbox = event.target.closest('input[type="checkbox"][data-sorter-id]');
        if (!checkbox) {
            return;
        }

        const item = sorterItems.find((entry) => entry.id === checkbox.dataset.sorterId);
        if (item) {
            item.selected = checkbox.checked;
        }
    });

    document.getElementById('flashcard').addEventListener('click', flipCard);
    document.getElementById('study-prev-btn').addEventListener('click', goToPreviousCard);
    document.getElementById('study-next-btn').addEventListener('click', goToNextCard);
    document.getElementById('study-delete-btn').addEventListener('click', confirmDeleteCard);
    document.getElementById('study-edit-btn').addEventListener('click', openEditCardModal);

    document.getElementById('empty-trash-btn').addEventListener('click', confirmEmptyTrash);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-btn').addEventListener('click', triggerImport);
    document.getElementById('import-file-input').addEventListener('change', (event) => importData(event.target));

    document.getElementById('save-card-edits-btn').addEventListener('click', saveCardEdits);
    document.getElementById('save-resource-edits-btn').addEventListener('click', saveResourceEdits);
    document.getElementById('save-deck-edits-btn').addEventListener('click', saveDeckEdits);

    document.getElementById('edit-picker-story').addEventListener('click', () => setEditPickerTab('story'));
    document.getElementById('edit-picker-vocab').addEventListener('click', () => setEditPickerTab('vocab'));
    document.getElementById('edit-picker-deck').addEventListener('click', () => setEditPickerTab('deck'));
    document.getElementById('edit-picker-search').addEventListener('input', renderEditPicker);

    document.getElementById('confirm-create-btn').addEventListener('click', confirmPreviewCreation);
    document.getElementById('preview-cancel-btn').addEventListener('click', () => closeModal('preview-modal'));

    document.getElementById('confirm-cancel-btn').addEventListener('click', () => closeModal('confirm-modal'));
    document.getElementById('confirm-btn-action').addEventListener('click', () => {
        if (pendingDeleteAction) {
            pendingDeleteAction();
            pendingDeleteAction = null;
        }
        closeModal('confirm-modal');
    });

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (event) => {
            if (event.target !== overlay) {
                return;
            }
            closeModal(overlay.id);
        });
    });

    document.querySelectorAll('[data-modal-content]').forEach((content) => {
        content.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });

    document.querySelectorAll('[data-close-modal]').forEach((button) => {
        button.addEventListener('click', () => {
            closeModal(button.dataset.closeModal);
        });
    });

    document.querySelectorAll('.import-option[data-import-mode]').forEach((option) => {
        option.addEventListener('click', () => {
            selectImportMode(option.dataset.importMode);
        });
    });

    document.getElementById('dashboard-content').addEventListener('click', handleDashboardClick);
    document.getElementById('resource-list').addEventListener('click', handleResourceListClick);
    document.getElementById('trash-list').addEventListener('click', handleTrashClick);
    document.addEventListener('click', handleSmartLinkClick);

    document.addEventListener('keydown', (event) => {
        if (!keyboardEnabled) {
            return;
        }

        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            return;
        }

        if (event.key === ' ') {
            event.preventDefault();
            flipCard({ target: document.getElementById('flashcard') });
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goToPreviousCard();
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goToNextCard();
            return;
        }

        if (event.key === 'e' || event.key === 'E') {
            event.preventDefault();
            openEditCardModal();
        }
    });
}

function init() {
    bindEvents();
    toggleImportMode();
    updateVocabHelper();
    navTo('dashboard');

    startupNotices.forEach((notice) => {
        showToast(notice.message, notice.type);
    });
}

document.addEventListener('DOMContentLoaded', init);
