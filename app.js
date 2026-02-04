// 监听类别变化，显示/隐藏Vocabulary格式提示
        function updateVocabHelper() {
            const cat = document.getElementById('deck-category').value;
            const helper = document.getElementById('vocab-helper');
            if (helper) {
                helper.style.display = cat === 'Vocabulary' ? 'block' : 'none';
            }
        }
        
        // 填入示例
        function fillExample() {
            document.getElementById('card-front-input').value = 'example：例子；study：学习；practice：练习';
            document.getElementById('card-back-input').value = '';
        }
        
        let decks = JSON.parse(localStorage.getItem('0804_v4_decks')) || [];
        let resources = JSON.parse(localStorage.getItem('0804_v4_resources')) || [];
        let trashBin = JSON.parse(localStorage.getItem('0804_v4_trash')) || [];

        let currentDeck = null; let currentCardIndex = 0;
        let currentPickerTab = 'story'; let currentEditPickerTab = 'story'; 
        let currentEditingResourceId = null; let currentEditingDeckId = null;
        let sorterItems = []; let pendingDeleteAction = null;
        let currentDashboardTab = 'Speaking';

        const loveNotes = [
            "小宝练习苦啦! 奖励一个抱抱 🤗", 
            "雅思必过! 🦆💯", 
            "纽约今天很冷, 但想到你就很暖.☀", 
            "记得喝水, 记得想我 💧❤", 
            "0804 是宇宙最浪漫的坐标 🪐", 
            "小幸运和我都陪着宝宝 ❤",
            "最喜欢我的小潜宝宝了~",
            "宝宝也要记得休息眼睛, 可以闭着眼睛亲我"
        ];

        function showLoveNote() {
            const note = loveNotes[Math.floor(Math.random() * loveNotes.length)];
            openModal("💌 来自 Fermat 的悄悄话", `<div style="text-align:center; font-size:18px; padding:20px; line-height:1.6; color:#fd79a8; font-weight:bold;">${note}</div>`);
        }

        
        // 键盘快捷键（仅在study模式下）
        let keyboardEnabled = false;
        
        document.addEventListener('keydown', function(e) {
            if (!keyboardEnabled) return;
            
            // 防止在输入框中触发
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.key) {
                case ' ':  // 空格翻转
                    e.preventDefault();
                    flipCard({ target: document.getElementById('flashcard') });
                    break;
                case 'ArrowLeft':  // 左箭头 - 不会
                    e.preventDefault();
                    nextCard(false);
                    break;
                case 'ArrowRight':  // 右箭头 - 会了
                    e.preventDefault();
                    nextCard(true);
                    break;
                case 'e':
                case 'E':  // E键 - 编辑
                    e.preventDefault();
                    openEditCardModal();
                    break;
            }
        });
        window.onload = () => {
            document.querySelectorAll('.modal-overlay').forEach(el => el.style.display = 'none');
            navTo('dashboard');
        };

        function toggleMobileSidebar() {
            document.querySelector('.sidebar').classList.toggle('active');
            document.querySelector('.mobile-overlay').classList.toggle('active');
        }

        function navTo(viewId) {
            if (window.innerWidth <= 768) {
                document.querySelector('.sidebar').classList.remove('active');
                document.querySelector('.mobile-overlay').classList.remove('active');
            }
            document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
            document.getElementById(`view-${viewId}`).style.display = (viewId === 'study') ? 'flex' : 'block';
            document.querySelectorAll('.sidebar .btn').forEach(b => b.classList.remove('btn-active'));
            
            const btnMap = { 'dashboard': 'nav-dashboard', 'create': 'nav-create', 'toolbox': 'nav-toolbox', 'add-resource': 'nav-add-resource', 'trash': 'nav-trash', 'settings': 'nav-settings' };
            if(btnMap[viewId]) document.getElementById(btnMap[viewId]).classList.add('btn-active');
            
            if(viewId === 'dashboard') renderDashboard(currentDashboardTab);
            if(viewId === 'toolbox') renderToolbox('story');
            if(viewId === 'create') renderToolboxPicker();
            if(viewId === 'trash') renderTrash();
            if(viewId === 'study') { keyboardEnabled = true; } else { keyboardEnabled = false; }
        }

        function showToast(msg, type='success') {
            const c = document.getElementById('notification-area');
            const t = document.createElement('div'); t.className = `toast ${type}`;
            t.innerHTML = `<span style="font-size:18px; color:${type==='success'?'#00b894':'#ff7675'};">●</span> ${msg}`;
            c.appendChild(t); setTimeout(() => { t.remove(); }, 3500);
        }

        /* --- BACKUP SYSTEM --- */
        function exportData() {
            const data = { decks, resources, trash: trashBin, date: new Date().toLocaleString() };
            const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `0804_Backup_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast("Backup downloaded!");
        }
        function triggerImport() { 
            // 显示导入选项模态框
            document.getElementById('import-options-modal').style.display = 'flex'; 
        }
        let importMode = 'merge'; // 'merge' or 'replace'
        
        function selectImportMode(mode) {
            importMode = mode;
            closeModal('import-options-modal');
            document.getElementById('import-file-input').click();
        }
        
        function importData(input) {
            const file = input.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try { 
                    const imported = JSON.parse(e.target.result);
                    if (!imported.decks) {
                        showToast("Invalid backup file", "error");
                        return;
                    }
                    
                    if (importMode === 'replace') {
                        // 完全替换模式：清空现有数据，导入所有内容
                        decks = imported.decks || [];
                        resources = imported.resources || [];
                        trashBin = imported.trash || [];
                        
                        localStorage.setItem('0804_v4_decks', JSON.stringify(decks));
                        localStorage.setItem('0804_v4_resources', JSON.stringify(resources));
                        localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin));
                        
                        showToast(`Success! Replaced with ${decks.length} decks & ${resources.length} resources.`);
                    } else {
                        // 合并模式：只添加不存在的数据
                        const currentDeckIds = new Set(decks.map(d => d.id));
                        const newDecks = (imported.decks || []).filter(d => !currentDeckIds.has(d.id));
                        decks = [...decks, ...newDecks];

                        const currentResIds = new Set(resources.map(r => r.id));
                        const newResources = (imported.resources || []).filter(r => !currentResIds.has(r.id));
                        resources = [...resources, ...newResources];

                        if(imported.trash) {
                            const currentTrashIds = new Set(trashBin.map(t => t.id));
                            const newTrash = imported.trash.filter(t => !currentTrashIds.has(t.id));
                            trashBin = [...trashBin, ...newTrash];
                        }

                        localStorage.setItem('0804_v4_decks', JSON.stringify(decks));
                        localStorage.setItem('0804_v4_resources', JSON.stringify(resources));
                        localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin));

                        const totalNew = newDecks.length + newResources.length;
                        if(totalNew === 0) showToast("No new data found. All data already exists.", "error");
                        else showToast(`Success! Merged ${newDecks.length} decks & ${newResources.length} resources.`);
                    }
                    
                    renderDashboard(currentDashboardTab); 
                } catch (err) { 
                    console.error(err);
                    showToast("Error parsing file", "error"); 
                }
            }; 
            reader.readAsText(file); 
            input.value = '';
        }

        /* --- DASHBOARD --- */
        
        // Dashboard搜索功能
        function filterDashboard() {
            const searchTerm = document.getElementById('dashboard-search').value.toLowerCase();
            const allCards = document.querySelectorAll('.card-item');
            
            allCards.forEach(card => {
                const title = card.querySelector('h3').textContent.toLowerCase();
                if (title.includes(searchTerm)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }
        function isSpeakingCategory(cat) {
            const c = (cat || '').trim();
            if (!c) return false;
            const lower = c.toLowerCase();
            if (lower.includes('speaking')) return true;
            // tolerate shortened labels like "Part 1" / "Part2"
            if (/part\s*1/i.test(c) || /^part\s*1$/i.test(c) || /^part1$/i.test(c)) return true;
            if (/part\s*2/i.test(c) || /^part\s*2$/i.test(c) || /^part2$/i.test(c)) return true;
            if (/part\s*3/i.test(c) || /^part\s*3$/i.test(c) || /^part3$/i.test(c)) return true;
            return false;
        }
        function getSpeakingPart(cat) {
            const c = (cat || '').trim().toLowerCase();
            if (!c) return 0;
            if (c.includes('part 1') || c == 'part1' || c == 'part 1') return 1;
            if (c.includes('part 2') || c == 'part2' || c == 'part 2') return 2;
            if (c.includes('part 3') || c == 'part3' || c == 'part 3') return 3;
            return 0;
        }

        function renderDashboard(tabName = 'Speaking') {
            currentDashboardTab = tabName;
            const container = document.getElementById('dashboard-content');
            container.innerHTML = '';

            document.getElementById('dash-btn-speaking').classList.toggle('active', tabName === 'Speaking');
            document.getElementById('dash-btn-vocab').classList.toggle('active', tabName === 'Vocabulary');

            if (decks.length === 0) {
                container.innerHTML = '<p style="color:#999;">No collections yet.</p>';
                return;
            }

            if (tabName === 'Speaking') {
                const speakingDecks = decks
                    .filter(d => isSpeakingCategory(d.category))
                    .sort((a, b) => {
                        const pa = getSpeakingPart(a.category);
                        const pb = getSpeakingPart(b.category);
                        return (pa || 99) - (pb || 99);
                    });

                if (speakingDecks.length === 0) {
                    container.innerHTML = '<p style="color:#999;">No Speaking decks found.</p>';
                    return;
                }

                const part1 = speakingDecks.filter(d => getSpeakingPart(d.category) === 1);
                const part2 = speakingDecks.filter(d => getSpeakingPart(d.category) === 2);
                const part3 = speakingDecks.filter(d => getSpeakingPart(d.category) === 3);
                const other = speakingDecks.filter(d => getSpeakingPart(d.category) === 0);

                if (part1.length) renderExpandableSection(container, 'Speaking Part 1', part1);
                if (part2.length) renderExpandableSection(container, 'Speaking Part 2', part2);
                if (part3.length) renderExpandableSection(container, 'Speaking Part 3', part3);
                if (other.length) renderExpandableSection(container, 'Speaking (Other)', other);

                return;
            }

            // Vocabulary tab
            const vocabDecks = decks.filter(d => !isSpeakingCategory(d.category));
            if (vocabDecks.length === 0) {
                container.innerHTML = '<p style="color:#999;">No Vocabulary decks found.</p>';
                return;
            }
            renderExpandableSection(container, 'Vocabulary Lists', vocabDecks);
        }

        function renderExpandableSection(container, title, deckList) {
            const header = document.createElement('div'); header.className = 'section-header';
            const showButton = deckList.length > 4; const sectionId = 'sec-' + title.replace(/\s/g, '-');
            header.innerHTML = `<div class="section-title-group">${title} <span>${deckList.length}</span></div>${showButton ? `<button class="btn-view-all" onclick="toggleSection('${sectionId}', this)">View All (<span>${deckList.length}</span>) ▼</button>` : ''}`;
            container.appendChild(header);
            const grid = document.createElement('div'); grid.className = 'grid-list'; grid.id = sectionId;
            deckList.forEach((d, index) => { const el = createDeckElement(d); if (index >= 4) el.classList.add('hidden-deck'); grid.appendChild(el); });
            container.appendChild(grid);
        }
        function toggleSection(sectionId, btn) {
            const section = document.getElementById(sectionId); const hiddenItems = section.querySelectorAll('.hidden-deck');
            const isExpanding = hiddenItems.length > 0 && hiddenItems[0].style.display !== 'block';
            if (isExpanding) { section.querySelectorAll('.card-item').forEach(el => el.style.display = 'block'); btn.innerHTML = 'Collapse ▲'; } 
            else { const allItems = section.querySelectorAll('.card-item'); allItems.forEach((el, idx) => { if(idx >= 4) el.style.display = 'none'; }); btn.innerHTML = `View All (<span>${allItems.length}</span>) ▼`; }
        }
        function createDeckElement(d) {
            const el = document.createElement('div'); el.className = 'card-item';
            el.innerHTML = `<button class="item-action-btn btn-delete-item" onclick="confirmDeleteDeck(${d.id}, event)">×</button><button class="item-action-btn btn-edit-item" onclick="openEditDeckModal(${d.id}, event)">✎</button><span style="font-size:10px;background:#eee;padding:3px 8px;border-radius:10px;">${((d.category || 'Uncategorized').trim() || 'Uncategorized')}</span><h3>${d.title}</h3><p>${d.cards.length} Cards</p>`;
            el.onclick = () => startStudy(d.id); return el;
        }

        /* --- DELETE HANDLERS --- */
        function showConfirmModal(msg, action) { document.getElementById('confirm-msg').innerText = msg; pendingDeleteAction = action; document.getElementById('confirm-modal').style.display = 'flex'; }
        document.getElementById('confirm-btn-action').onclick = () => { if(pendingDeleteAction) pendingDeleteAction(); closeModal('confirm-modal'); };
        function confirmDeleteDeck(id, e) { e.stopPropagation(); showConfirmModal("Move collection to trash?", () => { const d = decks.find(d => d.id === id); if(d) { moveToTrash('deck', d); decks = decks.filter(d => d.id !== id); localStorage.setItem('0804_v4_decks', JSON.stringify(decks)); renderDashboard(currentDashboardTab); showToast("Moved to trash."); } }); }
        function deleteResource(id, e) { e.stopPropagation(); showConfirmModal("Move material to trash?", () => { const r = resources.find(r => r.id === id); if(r) { moveToTrash('resource', r); resources = resources.filter(r => r.id !== id); localStorage.setItem('0804_v4_resources', JSON.stringify(resources)); renderToolbox(null); showToast("Moved to trash."); } }); }
        function confirmDeleteCard() { showConfirmModal("Delete this specific card?", () => { const c = currentDeck.cards[currentCardIndex]; moveToTrash('card', c, currentDeck.id); currentDeck.cards.splice(currentCardIndex, 1); localStorage.setItem('0804_v4_decks', JSON.stringify(decks)); showToast("Moved to trash."); if(currentDeck.cards.length === 0) navTo('dashboard'); else { if(currentCardIndex >= currentDeck.cards.length) currentCardIndex = 0; loadCard(); } }); }
        function moveToTrash(type, data, originId = null) { trashBin.unshift({ id: Date.now(), type, data, originId, date: new Date().toLocaleString() }); localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin)); }
        function renderTrash() { const c = document.getElementById('trash-list'); if(!c) return; c.innerHTML = ''; if(trashBin.length === 0) { c.innerHTML = '<p style="color:#999;">Trash is empty.</p>'; return; } trashBin.forEach(item => { const el = document.createElement('div'); el.className = 'trash-item'; let title = item.type === 'deck' ? "📚 " + item.data.title : (item.type === 'resource' ? "📄 " + item.data.title : "🃏 " + item.data.frontTitle); el.innerHTML = `<div class="trash-item-info"><span class="trash-type">${item.date}</span><span class="trash-title">${title}</span></div><div class="trash-actions"><button class="btn-restore" onclick="restoreItem(${item.id})">Restore</button><button class="btn-forever" onclick="hardDelete(${item.id})">Delete</button></div>`; c.appendChild(el); }); }
        function restoreItem(id) { const index = trashBin.findIndex(i => i.id === id); if(index === -1) return; const item = trashBin[index]; if(item.type === 'deck') { decks.push(item.data); localStorage.setItem('0804_v4_decks', JSON.stringify(decks)); } else if(item.type === 'resource') { resources.push(item.data); localStorage.setItem('0804_v4_resources', JSON.stringify(resources)); } else if(item.type === 'card') { let deck = decks.find(d => d.id === item.originId); if(!deck) { deck = decks.find(d => d.title === "Restored Cards"); if(!deck) { deck = { id: Date.now(), title: "Restored Cards", category: "Vocabulary", cards: [] }; decks.push(deck); } } deck.cards.push(item.data); localStorage.setItem('0804_v4_decks', JSON.stringify(decks)); } trashBin.splice(index, 1); localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin)); renderTrash(); showToast("Restored!"); }
        function hardDelete(id) { showConfirmModal("Delete forever?", () => { trashBin = trashBin.filter(i => i.id !== id); localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin)); renderTrash(); showToast("Deleted."); }); }
        function confirmEmptyTrash() { showConfirmModal("Empty trash?", () => { trashBin = []; localStorage.setItem('0804_v4_trash', JSON.stringify(trashBin)); renderTrash(); showToast("Trash emptied."); }); }

        /* --- STANDARD LOGIC --- */
        function insertResourceLink(t) { const el=document.getElementById('card-back-input'); const v = (el.value.length > 0 ? "\n" : "") + `[${t}]`; el.value += v; el.selectionStart = el.selectionEnd = el.value.length; el.focus(); }
        function insertEditLink(t) { const el=document.getElementById('edit-back-content'); const v = (el.value.length > 0 ? "\n" : "") + `[${t}]`; el.value += v; el.selectionStart = el.selectionEnd = el.value.length; el.focus(); }
        function setPickerTab(t) { currentPickerTab=t; document.getElementById('tab-picker-story').className=`tab-btn ${t==='story'?'active':''}`; document.getElementById('tab-picker-deck').className=`tab-btn ${t==='deck'?'active':''}`; document.getElementById('tab-picker-vocab').className=`tab-btn ${t==='vocab'?'active':''}`; renderToolboxPicker(); }
        function renderToolboxPicker() { 
            const c=document.getElementById('toolbox-picker-list'); const s=document.getElementById('toolbox-picker-search').value.toLowerCase(); c.innerHTML=''; 
            if (currentPickerTab === 'deck') {
                const f = decks.filter(d => d.title.toLowerCase().includes(s));
                f.forEach(d => { const el = document.createElement('div'); el.className = 'toolbox-draggable deck'; el.draggable = true; el.innerHTML = `📂 <span>${d.title}</span><div class="preview-tooltip">${d.cards.length} cards</div>`; el.onclick = () => insertResourceLink(d.title); el.ondragstart = (e) => { e.dataTransfer.setData("text/plain", `\n[${d.title}]`); e.dataTransfer.effectAllowed="copy"; }; c.appendChild(el); });
            } else {
                const f=resources.filter(r=>((r.type||'story')===currentPickerTab)&&r.title.toLowerCase().includes(s)); 
                f.forEach(r=>{ const el=document.createElement('div'); el.className=`toolbox-draggable ${r.type||'story'}`; el.draggable=true; if(r.type==='vocab') el.innerHTML=`<span>${r.title}</span><div class="preview-tooltip">${r.content.substring(0,100)}...</div>`; else el.innerHTML=`<strong>${r.title}</strong><div class="preview-tooltip">${r.content.substring(0,100)}...</div>`; el.onclick=()=>insertResourceLink(r.title); el.ondragstart=(e)=>{e.dataTransfer.setData("text/plain", `\n[${r.title}]`);e.dataTransfer.effectAllowed="copy";}; c.appendChild(el); }); 
            }
        }
        function setEditPickerTab(t) { currentEditPickerTab = t; document.getElementById('edit-picker-story').className = `tab-btn ${t==='story'?'active':''}`; document.getElementById('edit-picker-vocab').className = `tab-btn ${t==='vocab'?'active':''}`; document.getElementById('edit-picker-deck').className = `tab-btn ${t==='deck'?'active':''}`; renderEditPicker(); }
        function renderEditPicker() {
            const c = document.getElementById('edit-picker-list'); c.innerHTML=''; const s = document.getElementById('edit-picker-search').value.toLowerCase();
            if (currentEditPickerTab === 'deck') { const f = decks.filter(d => d.title.toLowerCase().includes(s)); f.forEach(d => { const el = document.createElement('div'); el.className = 'toolbox-draggable deck'; el.style.marginBottom = "8px"; el.innerHTML = `📂 <span>${d.title}</span>`; el.draggable = true; el.onclick = () => insertEditLink(d.title); el.ondragstart = (e) => { e.dataTransfer.setData("text/plain", `\n[${d.title}]`); }; c.appendChild(el); }); } 
            else { const f = resources.filter(r => ((r.type||'story')===currentEditPickerTab) && r.title.toLowerCase().includes(s)); f.forEach(r => { const el = document.createElement('div'); el.className = 'toolbox-draggable story'; el.style.marginBottom = "8px"; el.innerHTML = `<span>${r.title}</span>`; el.draggable = true; el.onclick = () => insertEditLink(r.title); el.ondragstart = (e) => { e.dataTransfer.setData("text/plain", `\n[${r.title}]`); }; c.appendChild(el); }); }
        }
        function loadCard() {
            const c = currentDeck.cards[currentCardIndex]; const el = document.getElementById('flashcard'); el.classList.remove('is-flipped');
            setTimeout(()=>{
                document.getElementById('card-deck-badge-back').innerText = currentDeck.title; document.getElementById('card-front-title').innerText = c.frontTitle;
                const ul = document.getElementById('card-front-reqs'); ul.innerHTML='';
                if(c.frontBullets && c.frontBullets.length) { ul.style.display='block'; c.frontBullets.forEach(b=>{const li=document.createElement('li');li.innerText=b;ul.appendChild(li)}); } else ul.style.display='none';
                const raw = c.backContent || ""; const container = document.getElementById('card-back-content');
                if(!raw.trim()) container.innerHTML = '<span style="color:#aaa; font-style:italic;">(No content)</span>';
                else {
                    const lines = raw.split('\n').filter(l => l.trim() !== '');
                    if(lines.length > 1 || raw.includes('•') || raw.includes('- ')) {
                        let html = '<ul class="flashcard-list">';
                        lines.forEach(line => { let text = line.replace(/^[•\-\*]\s*/, ''); text = text.replace(/\[(.*?)\]/g, (m,t) => createLink(t)).replace(/【(.*?)】/g, (m,t) => createLink(t)); html += `<li>${text}</li>`; });
                        html += '</ul>'; container.innerHTML = html;
                    } else { container.innerHTML = raw.replace(/\[(.*?)\]/g, (m,t) => createLink(t)).replace(/【(.*?)】/g, (m,t) => createLink(t)); }
                }
            }, 200);
        }
        function createLink(term) { const lower = term.trim().toLowerCase(); const deck = decks.find(d => d.title.toLowerCase() === lower); if(deck) return `<span class="smart-link" onclick="handleDeckClick(event, '${deck.id}')">📦 ${term}</span>`; const res = resources.find(x => x.title.trim().toLowerCase() === lower); if(res) return `<span class="smart-link" onclick="handleRefClick(event, '${term}')">📄 ${term}<span class="ref-tooltip">${res.content.substring(0,80)}...</span></span>`; return `<b>${term}</b>`; }
        window.handleRefClick = function(e,term) { e.stopPropagation(); const r=resources.find(x=>x.title.trim().toLowerCase()===term.trim().toLowerCase()); if(r) openModal(r.title, r.content); }
        window.handleDeckClick = function(e, deckId) { e.stopPropagation(); const deck = decks.find(d => d.id == deckId); if(deck && deck.cards.length > 0) { const card = deck.cards[0]; openModal("📦 " + deck.title, card.backContent || "(Empty Card)"); } else { showToast("Deck empty", "error"); } }
        function flipCard(e) { if(e.target.classList.contains('smart-link') || e.target.closest('button')) return; document.getElementById('flashcard').classList.toggle('is-flipped'); }
        function openEditDeckModal(id, e) { e.stopPropagation(); currentEditingDeckId=id; const d=decks.find(x=>x.id===id); if(d){ document.getElementById('edit-deck-name').value=d.title; document.getElementById('edit-deck-cat').value=d.category||'Speaking Part 2'; document.getElementById('edit-deck-modal').style.display='flex'; } }
        function saveDeckEdits() { const d=decks.find(x=>x.id===currentEditingDeckId); if(d){ d.title=document.getElementById('edit-deck-name').value; d.category=document.getElementById('edit-deck-cat').value; localStorage.setItem('0804_v4_decks', JSON.stringify(decks)); renderDashboard(currentDashboardTab); closeModal('edit-deck-modal'); showToast("Updated!"); } }
        function toggleImportMode() { const m=document.getElementById('res-type-select').value; document.getElementById('import-single').style.display=m==='story'?'block':'none'; document.getElementById('import-sorter').style.display=m==='sorter'?'block':'none'; }

        /* ✅ 正确的保存素材（Add Material） */
        function saveResource() { 
            const t = document.getElementById('res-title').value.trim();
            const c = document.getElementById('res-content').value;
            if (!t) {
                showToast("Title needed","error");
                return;
            }
            resources.push({id: Date.now(), title: t, content: c, type: 'story'});
            localStorage.setItem('0804_v4_resources', JSON.stringify(resources));
            showToast("Saved");
            document.getElementById('res-title').value = "";
            document.getElementById('res-content').value = "";
            navTo('toolbox');
        }

        /* ✅ 生成卡片（Create Flashcard 的按钮调用这个） */
        function processDeck() { 
            const fr=document.getElementById('card-front-input').value; 
            const br=document.getElementById('card-back-input').value; 
            const ti=document.getElementById('deck-title').value||"Untitled"; 
            const cat=document.getElementById('deck-category').value; 
            if(!fr.trim()){ 
                document.getElementById('card-front-input').style.borderColor="#ff7675"; 
                showToast("Prompt is empty!", "error"); return; 
            }
            
            // ✨ 新功能：Vocabulary 批量单词卡片创建
            if(cat === "Vocabulary") {
                // 解析格式：英文：中文；英文：中文
                const pairs = fr.split(/；|;/).map(p => p.trim()).filter(p => p);
                if(pairs.length === 0) {
                    showToast("请输入单词！格式：英文：中文；英文：中文", "error");
                    return;
                }
                
                const newCards = [];
                let hasError = false;
                
                pairs.forEach((pair, index) => {
                    // 分割英文和中文
                    const parts = pair.split(/：|:/).map(p => p.trim());
                    if(parts.length !== 2 || !parts[0] || !parts[1]) {
                        showToast(`格式错误！请检查第 ${index + 1} 个单词`, "error");
                        hasError = true;
                        return;
                    }
                    
                    const english = parts[0];
                    const chinese = parts[1];
                    
                    // 创建单词卡片
                    newCards.push({
                        id: Date.now() + index,
                        frontTitle: english,
                        frontBullets: [],
                        backContent: chinese
                    });
                });
                
                if(hasError) return;

                // 显示预览确认（只预览，不在这里落库，避免重复）
                showPreviewModal(newCards, ti, cat);
                return;
            }
            
            // 原有的 Speaking 类型卡片创建逻辑
            const l=fr.split(/\n+/).filter(x=>x.trim()); let tl=[], bl=[], sp=false; 
            l.forEach(x=>{ 
                if(x.toLowerCase().startsWith('you should')||x.includes('should say:')){sp=true;return;} 
                if(!sp) tl.push(x.trim()); 
                else { 
                    let c=x.replace(/^(and )?explain /i,'').replace(/^(and )?describe /i,'').trim(); 
                    if(c) bl.push(c); 
                } 
            }); 
            let ft=sp?(tl.length?tl.join(' '):ti):(l.length>1?ti:fr.trim()||ti); 
            if(!sp&&l.length>1) bl=l; 
            const nc={id:Date.now(),frontTitle:ft,frontBullets:bl,backContent:br.trim()}; 
            const idx=decks.findIndex(d=>d.title===ti); 
            if(idx>-1) decks[idx].cards.push(nc); 
            else decks.push({id:Date.now(),title:ti,category:cat,cards:[nc]}); 
            localStorage.setItem('0804_v4_decks',JSON.stringify(decks)); 
            document.getElementById('card-front-input').value=""; 
            document.getElementById('card-back-input').value=""; 
            showToast("宝宝真棒! ❤️"); 
        }

        function startStudy(id) { currentDeck=decks.find(d=>d.id===id); currentCardIndex=0; if(!currentDeck||!currentDeck.cards.length) return showToast("Empty deck","error"); navTo('study'); loadCard(); }
        function nextCard(g) { currentCardIndex++; if(currentCardIndex<currentDeck.cards.length) loadCard(); else { showToast("宝宝辛苦啦! 😘"); navTo('dashboard'); } }
        function openEditResourceModal(id, e) { e.stopPropagation(); currentEditingResourceId=id; const r=resources.find(x=>x.id===id); document.getElementById('edit-res-title').value=r.title; document.getElementById('edit-res-content').value=r.content; document.getElementById('edit-resource-modal').style.display='flex'; }
        function saveResourceEdits() { const idx=resources.findIndex(r=>r.id===currentEditingResourceId); if(idx>-1){ resources[idx].title=document.getElementById('edit-res-title').value; resources[idx].content=document.getElementById('edit-res-content').value; localStorage.setItem('0804_v4_resources',JSON.stringify(resources)); renderToolbox(null); closeModal('edit-resource-modal'); } }
        function openEditCardModal() { const c=currentDeck.cards[currentCardIndex]; document.getElementById('edit-front-title').value=c.frontTitle; document.getElementById('edit-front-bullets').value=c.frontBullets?c.frontBullets.join('\n'):''; document.getElementById('edit-back-content').value=c.backContent; document.getElementById('edit-card-modal').style.display='flex'; renderEditPicker(); }
        function saveCardEdits() { const c=currentDeck.cards[currentCardIndex]; c.frontTitle=document.getElementById('edit-front-title').value; c.frontBullets=document.getElementById('edit-front-bullets').value.split('\n').filter(x=>x.trim()); c.backContent=document.getElementById('edit-back-content').value; localStorage.setItem('0804_v4_decks',JSON.stringify(decks)); closeModal('edit-card-modal'); loadCard(); }
        function openModal(t, c) { if(arguments.length===2){ document.getElementById('modal-title').innerText=t; document.getElementById('modal-body').innerHTML=c; document.getElementById('res-modal').style.display='flex'; } }
        
        // 显示卡片预览模态框
        function showPreviewModal(cards, title, category) {
            const modal = document.getElementById('preview-modal');
            const list = document.getElementById('preview-list');
            list.innerHTML = '';
            
            cards.forEach((card, idx) => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 10px; background: #f8f9fa; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
                item.innerHTML = `
                    <div>
                        <span style="font-weight: 700; color: var(--primary-dark);">${card.frontTitle}</span>
                        <span style="color: #888; margin: 0 8px;">→</span>
                        <span>${card.backContent}</span>
                    </div>
                    <span style="color: #00b894;">✓</span>
                `;
                list.appendChild(item);
            });
            
            document.getElementById('preview-count').innerText = cards.length;
            document.getElementById('preview-deck-title').innerText = title;
            
            // 设置确认按钮的点击事件
            document.getElementById('confirm-create-btn').onclick = () => {
                // ✅ 只有点击确认才真正写入 decks（避免出现两份同名 deck）
                const existingIdx = decks.findIndex(d => d.title === title && (d.category || '') === category);
                if (existingIdx > -1) {
                    decks[existingIdx].cards.push(...cards);
                } else {
                    decks.push({
                        id: Date.now(),
                        title: title,
                        category: category,
                        cards: cards
                    });
                }

                localStorage.setItem('0804_v4_decks', JSON.stringify(decks));
                document.getElementById('card-front-input').value = "";
                document.getElementById('card-back-input').value = "";
                closeModal('preview-modal');
                renderDashboard(currentDashboardTab);
                showToast(`成功创建 ${cards.length} 个单词卡片! 宝宝真棒! ❤️`);
            };
            
            modal.style.display = 'flex';
        }
        function closeModal(id) { document.getElementById(id).style.display='none'; }
