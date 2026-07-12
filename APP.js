        const ADMIN_PASSWORD = '0000';
const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyVDci8KW2wdO44OhQP6FRAgdFV6-OabouFbR1vM3YMUj290yOf4GqyTAFznHZXLBGlng/exec';

let allMessages = [];
let currentTab = 'unread';
let idCounter = 0;
let pendingSyncs = new Map();

function generateId() { return ++idCounter; }

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function formatTime(ts) {
    if (!ts) return 'Unknown';
    try {
        const d = new Date(ts);
        if (isNaN(d)) return ts;
        return d.toLocaleString('en-US', { 
            hour12: true, 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    } catch { return ts; }
}

function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function syncStatusToSheet(rowIndex, status) {
    const key = `${rowIndex}-${status}`;
    if (pendingSyncs.has(key)) {
        console.log(`Sync already in progress for row ${rowIndex}`);
        return;
    }
    
    pendingSyncs.set(key, true);
    
    try {
        const localChanges = JSON.parse(localStorage.getItem('messageStatusChanges') || '{}');
        localChanges[rowIndex] = status;
        localStorage.setItem('messageStatusChanges', JSON.stringify(localChanges));
        
        const url = `${GOOGLE_SHEETS_URL}?action=updateStatus&rowIndex=${rowIndex}&status=${status}&t=${Date.now()}`;
        
        await fetch(url, {
            method: 'GET',
            mode: 'no-cors'
        });
        
        console.log(`Status synced: row ${rowIndex} → ${status}`);
        showToast(`Message ${status === 'read' ? 'marked as read' : status === 'archive' ? 'archived' : status === 'deleted' ? 'deleted' : 'updated'}`, 'success');
        
    } catch (e) {
        console.warn('Failed to sync status:', e);
        showToast('Status saved locally (offline mode)', 'error');
    } finally {
        pendingSyncs.delete(key);
    }
}

function login() {
    const pwd = document.getElementById('passwordInput').value;
    if (pwd === ADMIN_PASSWORD) {
        localStorage.setItem('admin_logged_in', 'true');
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('adminSection').style.display = 'block';
        loadMessages();
    } else {
        const err = document.getElementById('loginError');
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 2800);
    }
}

function logout() {
    localStorage.removeItem('admin_logged_in');
    document.getElementById('adminSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
    pendingSyncs.clear();
}

document.getElementById('passwordInput').addEventListener('keypress', e => { 
    if (e.key === 'Enter') login(); 
});

async function loadMessages() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '<div class="spinner">Loading messages...</div>';

    try {
        const resp = await fetch(GOOGLE_SHEETS_URL + '?t=' + Date.now());
        const data = await resp.json();
        console.log('Raw data:', data);

        let messagesArray = [];
        if (Array.isArray(data)) {
            messagesArray = data;
        } else if (data && typeof data === 'object') {
            messagesArray = data.data || data.messages || data.rows || [];
            if (!Array.isArray(messagesArray)) {
                messagesArray = [data];
            }
        }

        const raw = messagesArray.length > 0 && messagesArray[0] && typeof messagesArray[0] === 'object' 
            ? messagesArray 
            : messagesArray.slice(1);
        
        const newMessages = [];

        raw.forEach((row, index) => {
            let rowData = [];
            if (Array.isArray(row)) {
                rowData = row;
            } else if (row && typeof row === 'object') {
                const keys = ['timestamp', 'name', 'email', 'mobile', 'institution', 'message', 'status'];
                rowData = keys.map(k => row[k] || '');
            }
            
            if (!rowData || rowData.length < 5) return;
            
            const ts = rowData[0] || '';
            const name = rowData[1] || 'Anonymous';
            const email = rowData[2] || '';
            const mobile = rowData[3] || '';
            const institution = rowData[4] || '';
            const message = rowData[5] || '';
            
            if (!ts && !name && !email && !mobile && !institution && !message) return;

            let status = 'unread';
            if (rowData.length > 6 && rowData[6]) {
                const s = rowData[6].toString().toLowerCase().trim();
                if (['unread', 'read', 'archive', 'deleted'].includes(s)) {
                    status = s;
                }
            }

            const rowIndex = index + 2;
            const id = generateId();
            newMessages.push({
                id: id,
                rowIndex: rowIndex,
                timestamp: ts,
                name: name,
                email: email,
                mobile: mobile,
                institution: institution,
                message: message,
                status: status,
            });
        });


        newMessages.sort((a, b) => {
            const da = new Date(a.timestamp);
            const db = new Date(b.timestamp);
            if (isNaN(da) || isNaN(db)) return 0;
            return db - da; 
        });

        const localChanges = JSON.parse(localStorage.getItem('messageStatusChanges') || '{}');
        newMessages.forEach(m => {
            if (localChanges[m.rowIndex]) {
                m.status = localChanges[m.rowIndex];
            }
        });

        if (allMessages.length > 0) {
            const oldMap = new Map();
            allMessages.forEach(m => oldMap.set(m.rowIndex, m.status));
            newMessages.forEach(m => {
                if (oldMap.has(m.rowIndex)) {
                    m.status = oldMap.get(m.rowIndex);
                }
            });
        }

        allMessages = newMessages;
        updateCountsAndRender();
        showToast(`Loaded ${allMessages.length} messages`, 'success');

    } catch (err) {
        console.error('Error loading messages:', err);
        container.innerHTML = `
            <div class="error">
                ❌ Error: ${err.message}
                <br><br>
                <button onclick="loadMessages()" class="retry-btn">🔄 Retry</button>
            </div>
        `;
        showToast('Failed to load messages', 'error');
    }
}

function renderMessages(tab) {
    const container = document.getElementById('messagesContainer');
    let filtered = [];

    if (tab === 'unread') {
        filtered = allMessages.filter(m => m.status === 'unread');
    } else if (tab === 'read') {
        filtered = allMessages.filter(m => m.status === 'read');
    } else if (tab === 'archive') {
        filtered = allMessages.filter(m => m.status === 'archive');
    } else if (tab === 'deleted') {
        filtered = allMessages.filter(m => m.status === 'deleted');
    }

    filtered.sort((a, b) => {
        const da = new Date(a.timestamp);
        const db = new Date(b.timestamp);
        if (isNaN(da) || isNaN(db)) return 0;
        return db - da; 
    });


    document.getElementById('unreadBadge').textContent = allMessages.filter(m => m.status === 'unread').length;
    document.getElementById('readBadge').textContent = allMessages.filter(m => m.status === 'read').length;
    document.getElementById('archiveBadge').textContent = allMessages.filter(m => m.status === 'archive').length;
    document.getElementById('deletedBadge').textContent = allMessages.filter(m => m.status === 'deleted').length;
    document.getElementById('unreadCount').textContent = allMessages.filter(m => m.status === 'unread').length;
    document.getElementById('messageCount').textContent = allMessages.length;
    document.getElementById('totalMessages').textContent = allMessages.length;

    if (filtered.length === 0) {
        const msgs = {
            'unread': 'No unread messages.',
            'read': 'No messages marked as read.',
            'archive': 'No archived messages.',
            'deleted': 'No deleted messages.'
        };
        container.innerHTML = `
            <div class="no-messages">
                <div class="icon">📭</div>
                <h3>Nothing here</h3>
                <p>${msgs[tab] || 'No messages.'}</p>
            </div>
        `;
        return;
    }

    let html = '<div class="messages-grid">';
    filtered.forEach((msg) => {
        const isUnread = msg.status === 'unread';
        const isArchived = msg.status === 'archive';
        const isDeleted = msg.status === 'deleted';
        const cardClass = isUnread ? 'message-card unread' : 'message-card';

        let actions = '';
        if (isUnread) {
            actions += `<button class="mark-read-btn" onclick="markRead(${msg.id})">✅ Mark read</button>`;
            actions += `<button class="archive-btn" onclick="archiveMsg(${msg.id})">🗃️ Archive</button>`;
            actions += `<button class="delete-btn" onclick="deleteMsg(${msg.id})">🗑️ Delete</button>`;
        } else if (isArchived) {
            actions += `<button class="unarchive-btn" onclick="unarchiveMsg(${msg.id})">↩️ Unarchive</button>`;
            actions += `<button class="delete-btn" onclick="deleteMsg(${msg.id})">🗑️ Delete</button>`;
        } else if (isDeleted) {
            actions += `<button class="unarchive-btn" onclick="restoreMsg(${msg.id})">↩️ Restore</button>`;
        } else {
            actions += `<button class="archive-btn" onclick="archiveMsg(${msg.id})">🗃️ Archive</button>`;
            actions += `<button class="delete-btn" onclick="deleteMsg(${msg.id})">🗑️ Delete</button>`;
        }

        let statusBadge = '';
        if (isUnread) statusBadge = `<span class="status-badge unread-badge">🔴 Unread</span>`;
        else if (isArchived) statusBadge = `<span class="status-badge archived-badge">📦 Archive</span>`;
        else if (isDeleted) statusBadge = `<span class="status-badge deleted-badge">🗑️ Deleted</span>`;
        else statusBadge = `<span class="status-badge read-badge">✅ Read</span>`;

        html += `
            <div class="${cardClass}">
                <div class="card-header">
                    <div>
                        <span class="sender-name">${escapeHtml(msg.name)}</span>
                        ${statusBadge}
                        <br>
                        <span class="sender-email">📧 ${escapeHtml(msg.email)}</span>
                        ${msg.mobile && msg.mobile !== 'Not provided' ? `<span class="sender-mobile">📱 ${escapeHtml(msg.mobile)}</span>` : ''}
                        ${msg.institution && msg.institution !== 'Not provided' ? `<span class="sender-institution">🏫 ${escapeHtml(msg.institution)}</span>` : ''}
                    </div>
                    <span class="msg-time">🕐 ${formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-body">${escapeHtml(msg.message)}</div>
                <div class="card-actions">
                    ${actions}
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function updateCountsAndRender() {
    renderMessages(currentTab);
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    renderMessages(tab);
}

async function markRead(id) {
    const msg = allMessages.find(m => m.id === id);
    if (msg && msg.status === 'unread') {
        msg.status = 'read';
        await syncStatusToSheet(msg.rowIndex, 'read');
        updateCountsAndRender();
    }
}

async function archiveMsg(id) {
    const msg = allMessages.find(m => m.id === id);
    if (msg && msg.status !== 'archive' && msg.status !== 'deleted') {
        msg.status = 'archive';
        await syncStatusToSheet(msg.rowIndex, 'archive');
        updateCountsAndRender();
    }
}

async function unarchiveMsg(id) {
    const msg = allMessages.find(m => m.id === id);
    if (msg && msg.status === 'archive') {
        msg.status = 'read';
        await syncStatusToSheet(msg.rowIndex, 'read');
        updateCountsAndRender();
    }
}

async function deleteMsg(id) {
    if (confirm('Move this message to Deleted?')) {
        const msg = allMessages.find(m => m.id === id);
        if (msg && msg.status !== 'deleted') {
            msg.status = 'deleted';
            await syncStatusToSheet(msg.rowIndex, 'deleted');
            updateCountsAndRender();
        }
    }
}

async function restoreMsg(id) {
    const msg = allMessages.find(m => m.id === id);
    if (msg && msg.status === 'deleted') {
        msg.status = 'read';
        await syncStatusToSheet(msg.rowIndex, 'read');
        updateCountsAndRender();
    }
}


if (localStorage.getItem('admin_logged_in') === 'true') {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminSection').style.display = 'block';
    loadMessages();
} else {
    document.getElementById('loginSection').style.display = 'block';
}
