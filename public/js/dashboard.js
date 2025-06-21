// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// public/js/dashboard.js

// --- START OF MODIFICATION ---

// Global state
let token = null;
let tenantId = null;

// DOM Elements
const sessionsTableBody = document.getElementById('sessions-table-body');
const noSessionsMessage = document.getElementById('no-sessions-message');

function updateSessionStatusUI(sessions) {
    sessionsTableBody.innerHTML = '';
    noSessionsMessage.style.display = sessions.length === 0 ? 'block' : 'none';

    sessions.forEach(session => {
        const row = sessionsTableBody.insertRow();
        const sessionName = session.name ? session.name : '<em>Not Set</em>';
        let actionsHtml = `<button class="btn-secondary" onclick="editSessionName('${session.id}', '${session.name || ''}')">Name</button>
                           <button class="btn-danger" onclick="terminateSession('${session.id}')">Terminate</button>`;

        if (session.status === 'PENDING_SCAN') {
            actionsHtml += ` <button class="btn-info" onclick="showLink('${session.id}')">Show QR Link</button>`;
        }
        row.innerHTML = `
            <td>${sessionName}</td>
            <td><code>${session.id}</code></td>
            <td class="status status-${session.status.toLowerCase()}">${session.status}</td>
            <td class="actions">${actionsHtml}</td>
        `;
    });
}

function populateDashboard(data) {
    const { tenant, sessions } = data;
    tenantId = tenant.id; // Store tenantId for later use

    // Populate Welcome Message
    document.getElementById('welcome-header').textContent = `Welcome, ${tenant.name}`;
    document.getElementById('welcome-message').innerHTML = `Manage your WhatsApp sessions and settings here. Your account can have a maximum of <strong>${tenant.maxSessions}</strong> session(s).`;
    
    // Populate Sessions Table
    updateSessionStatusUI(sessions);

    // Populate Settings Forms
    document.getElementById('aiSystemPrompt').value = tenant.aiSystemPrompt || '';
    
    const humanizationCheckbox = document.getElementById('enableHumanization');
    humanizationCheckbox.checked = tenant.enableHumanization;
    document.getElementById('minCharDelay').value = tenant.minCharDelay;
    document.getElementById('maxCharDelay').value = tenant.maxCharDelay;
    document.getElementById('minPauseAfterTyping').value = tenant.minPauseAfterTyping;
    document.getElementById('maxPauseAfterTyping').value = tenant.maxPauseAfterTyping;
    document.getElementById('errorProbability').value = tenant.errorProbability;
    document.getElementById('maxBackspaceChars').value = tenant.maxBackspaceChars;

    toggleWarning(); // Update warning visibility based on checkbox state
}

async function initializeDashboard() {
    token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    try {
        const response = await fetch('/api/user/dashboard-data', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
             localStorage.removeItem('jwtToken');
             window.location.href = '/login';
             return;
        }

        if (!response.ok) {
            throw new Error('Failed to load dashboard data.');
        }

        const result = await response.json();
        populateDashboard(result.data);
    } catch (error) {
        console.error('Initialization Error:', error);
        document.body.innerHTML = `<h1>Error</h1><p>Could not load dashboard. Please <a href="/login">try logging in again</a>.</p>`;
    }
}

async function refreshSessions() {
    try {
        const response = await fetch(`/api/tenant/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        updateSessionStatusUI(data.sessions);
    } catch (error) {
        console.error('Failed to refresh status:', error);
    }
}

async function startSession() {
    if (!tenantId) {
        alert('Tenant information not loaded. Please refresh.');
        return;
    }
    try {
        const response = await fetch(`/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ tenantId: tenantId })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('New session is starting! The dashboard will update shortly.');
        await refreshSessions();
    } catch (error) {
        alert('Error starting session: ' + error.message);
    }
}

async function editSessionName(sessionId, currentName) {
    const newName = prompt("Enter a new name for this session:", currentName);
    if (newName === null || newName.trim() === '') return;
    try {
        const response = await fetch(`/api/sessions/${sessionId}/name`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: newName })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Session name updated!');
        await refreshSessions();
    } catch (error) {
        alert('Error updating name: ' + error.message);
    }
}

async function terminateSession(sessionId) {
    if (!confirm(`Are you sure you want to terminate session ${sessionId}?`)) return;
    try {
        const response = await fetch(`/api/user/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Session terminated successfully.');
        await refreshSessions();
    } catch (error) {
        alert('Error terminating session: ' + error.message);
    }
}


function showLink(sessionId) {
    const url = `${window.location.origin}/user/session/${sessionId}`;
    window.open(url, '_blank');
}

async function saveSettings(event) {
    event.preventDefault();
    const feedbackEl = document.getElementById('settings-feedback');
    feedbackEl.style.display = 'none';
    const aiSystemPrompt = document.getElementById('aiSystemPrompt').value;
    try {
        const response = await fetch(`/user/settings/ai`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ aiSystemPrompt: aiSystemPrompt })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        feedbackEl.textContent = '✅ AI settings saved successfully!';
        feedbackEl.style.color = '#28a745';
        feedbackEl.style.display = 'block';
    } catch (error) {
        feedbackEl.textContent = `❌ Error: ${error.message}`;
        feedbackEl.style.color = '#dc3545';
        feedbackEl.style.display = 'block';
    }
}

function toggleWarning() {
    const checkbox = document.getElementById('enableHumanization');
    const warningBox = document.getElementById('humanization-warning');
    warningBox.style.display = checkbox.checked ? 'none' : 'block';
}

async function saveHumanizationSettings(event) {
    event.preventDefault();
    const feedbackEl = document.getElementById('humanization-feedback');
    feedbackEl.textContent = '';
    feedbackEl.style.display = 'none';

    const form = document.getElementById('humanization-form');
    const formData = new FormData(form);

    const settings = Object.fromEntries(formData.entries());
    settings.enableHumanization = document.getElementById('enableHumanization').checked;

    try {
        const response = await fetch(`/user/settings/humanization`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(settings)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        feedbackEl.textContent = '✅ Humanization settings saved successfully!';
        feedbackEl.style.color = '#28a745';
        feedbackEl.style.display = 'block';
    } catch (error) {
        feedbackEl.textContent = `❌ Error: ${error.message}`;
        feedbackEl.style.color = '#dc3545';
        feedbackEl.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setInterval(refreshSessions, 4000);
});
// --- END OF MODIFICATION ---