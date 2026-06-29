        const ADMIN_PASSWORD = '0000';
        const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxVkbPfNB65BUC_7cBUJX3UsC0adGCew1AqTj8XowtBEG_n0X7KLoHtSEj_95Y9DdYd/exec';

        let allMessages = [];
        let currentTab = 'inbox';

        function login() {
            const password = document.getElementById('passwordInput').value;
            if (password === ADMIN_PASSWORD) {
                localStorage.setItem('admin_logged_in', 'true');
                document.getElementById('loginSection').style.display = 'none';
                document.getElementById('adminSection').style.display = 'block';
                loadMessages();
            } else {
                document.getElementById('loginError').style.display = 'block';
                setTimeout(() => {
                    document.getElementById('loginError').style.display = 'none';
                }, 3000);
            }
        }

        function logout() {
            localStorage.removeItem('admin_logged_in');
            document.getElementById('adminSection').style.display = 'none';
            document.getElementById('loginSection').style.display = 'block';
        }

        function switchTab(tab) {
            currentTab = tab;
            document.getElementById('tabInbox').classList.toggle('active', tab === 'inbox');
            document.getElementById('tabArchived').classList.toggle('active', tab === 'archived');
            renderMessages();
        }

        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = `toast ${type}`;
            toast.style.display = 'block';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 3000);
        }

        async function loadMessages() {
            const container = document.getElementById('messagesContainer');
            container.innerHTML = '<div class="spinner">Loading messages</div>';
            
            try {
                const response = await fetch(GOOGLE_SHEETS_URL);
                const data = await response.json();
                
                if (data && data.length > 1) {
                    const headers = data[0];
                    const statusColumnIndex = headers.indexOf('Status');
                    
                    allMessages = data.slice(1)
                        .filter(msg => msg[0] || msg[1])
                        .map((msg, index) => {
                            let status = 'unread';
                            if (statusColumnIndex !== -1 && msg[statusColumnIndex]) {
                                status = msg[statusColumnIndex];
                            }
                            
                            return {
                                id: index,
                                timestamp: msg[0] || 'No timestamp',
                                name: msg[1] || 'Anonymous',
                                email: msg[2] || 'No email',
                                mobile: msg[3] || 'Not provided',
                                institution: msg[4] || 'Not provided',
                                message: msg[5] || '',
                                status: status,
                                rowIndex: index + 2
                            };
                        });
                    
                    updateStats();
                    renderMessages();
                } else {
                    allMessages = [];
                    updateStats();
                    renderMessages();
                }
            } catch (error) {
                container.innerHTML = `
                    <div class="error">
                         Error loading messages: ${error.message}
                        <br><br>
                        <button class="btn-refresh" onclick="loadMessages()" style="background:var(--purple-4);padding:10px 25px;border:none;border-radius:8px;color:white;cursor:pointer;">🔄 Try Again</button>
                    </div>
                `;
            }
        }

        function updateStats() {
            const total = allMessages.length;
            const unread = allMessages.filter(m => m.status === 'unread').length;
            const archived = allMessages.filter(m => m.status === 'archived').length;
            
            document.getElementById('messageCount').textContent = total;
            document.getElementById('totalMessages').textContent = total;
            document.getElementById('unreadCount').textContent = unread;
            document.getElementById('archivedCount').textContent = archived;
        }

        function renderMessages() {
            const container = document.getElementById('messagesContainer');
            
            let filtered = allMessages;
            if (currentTab === 'inbox') {
                filtered = allMessages.filter(m => m.status !== 'archived');
            } else {
                filtered = allMessages.filter(m => m.status === 'archived');
            }
            
            if (filtered.length === 0) {
                const icon = currentTab === 'inbox' ? '📭' : '📦';
                const title = currentTab === 'inbox' ? 'No messages in inbox' : 'No archived messages';
                const desc = currentTab === 'inbox' ? 'When someone sends a message, it will appear here' : 'Archived messages will appear here';
                container.innerHTML = `
                    <div class="no-messages">
                        <div class="icon">${icon}</div>
                        <h3>${title}</h3>
                        <p>${desc}</p>
                    </div>
                `;
                return;
            }
            
            let html = '<div class="messages-grid">';
            
            filtered.forEach((msg) => {
                const isRead = msg.status === 'read';
                const isArchived = msg.status === 'archived';
                const statusClass = isArchived ? 'archived' : (isRead ? 'read' : '');
                const statusText = isArchived ? 'Archived' : (isRead ? 'Read' : 'Unread');
                const statusBadgeClass = isArchived ? 'archived' : (isRead ? 'read' : 'unread');
                
                html += `
                    <div class="message-card ${statusClass}" id="msg-${msg.id}">
                        <div class="message-header">
                            <div class="sender-info">
                                <span class="sender-name">${escapeHtml(msg.name)}</span>
                                <span class="status-badge ${statusBadgeClass}">${statusText}</span>
                                <br>
                                <span class="sender-email">📧 ${escapeHtml(msg.email)}</span>
                                ${msg.mobile !== 'Not provided' ? `<span class="sender-mobile">📱 ${escapeHtml(msg.mobile)}</span>` : ''}
                                ${msg.institution !== 'Not provided' ? `<span class="sender-institution">🏫 ${escapeHtml(msg.institution)}</span>` : ''}
                            </div>
                            <span class="message-time"> ${escapeHtml(msg.timestamp)}</span>
                        </div>
                        <div class="message-body">${escapeHtml(msg.message)}</div>
                        <div class="message-actions">
                            ${!isArchived ? `
                                <button class="btn-read ${isRead ? 'read-btn' : ''}" onclick="markAsRead(${msg.id})">
                                    ${isRead ? ' Read' : '📖 Mark as Read'}
                                </button>
                                <button class="btn-archive" onclick="archiveMessage(${msg.id})">📦 Archive</button>
                            ` : `
                                <button class="btn-unarchive" onclick="unarchiveMessage(${msg.id})">📤 Unarchive</button>
                            `}
                        </div>
                        <div class="message-meta">Row #${msg.rowIndex} | ID: #${msg.id + 1}</div>
                    </div>
                `;
            });
            
            html += '</div>';
            container.innerHTML = html;
        }

        async function markAsRead(id) {
            const msg = allMessages.find(m => m.id === id);
            if (!msg || msg.status === 'read') return;
            
            try {
                const response = await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'updateStatus',
                        rowIndex: msg.rowIndex,
                        status: 'read'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    msg.status = 'read';
                    updateStats();
                    renderMessages();
                    showToast(' Marked as read!');
                } else {
                    showToast(' Error: ' + (result.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                showToast(' Error: ' + error.message, 'error');
            }
        }

        async function archiveMessage(id) {
            const msg = allMessages.find(m => m.id === id);
            if (!msg) return;
            
            try {
                const response = await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'updateStatus',
                        rowIndex: msg.rowIndex,
                        status: 'archived'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    msg.status = 'archived';
                    updateStats();
                    renderMessages();
                    showToast('📦 Archived!');
                } else {
                    showToast('❌ Error: ' + (result.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                showToast('❌ Error: ' + error.message, 'error');
            }
        }

        async function unarchiveMessage(id) {
            const msg = allMessages.find(m => m.id === id);
            if (!msg) return;
            
            try {
                const response = await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'updateStatus',
                        rowIndex: msg.rowIndex,
                        status: 'read'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    msg.status = 'read';
                    updateStats();
                    renderMessages();
                    showToast('📤 Unarchived!');
                } else {
                    showToast('Error: ' + (result.error || 'Unknown error'), 'error');
                }
            } catch (error) {
                showToast(' Error: ' + error.message, 'error');
            }
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        if (localStorage.getItem('admin_logged_in') === 'true') {
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('adminSection').style.display = 'block';
            loadMessages();
        } else {
            document.getElementById('loginSection').style.display = 'block';
        }

        document.getElementById('passwordInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
