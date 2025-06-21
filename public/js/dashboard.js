// public/js/dashboard.js

// Read initial data from the container's data attributes
const dashboardContainer = document.getElementById('dashboard-container');
const token = dashboardContainer.dataset.token;
const tenantId = dashboardContainer.dataset.tenantId;

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

async function refreshStatus() {
    try {
        const response = await fetch(`/api/tenant/status?token=${token}`);
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        updateSessionStatusUI(data.sessions);
    } catch (error) {
        console.error('Failed to refresh status:', error);
    }
}

async function startSession() {
    try {
        const response = await fetch(`/sessions?token=${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId: tenantId })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('New session is starting! The dashboard will update shortly.');
        await refreshStatus();
    } catch (error) {
        alert('Error starting session: ' + error.message);
    }
}

async function editSessionName(sessionId, currentName) {
    const newName = prompt("Enter a new name for this session:", currentName);
    if (newName === null || newName.trim() === '') return;
    try {
        const response = await fetch(`/api/sessions/${sessionId}/name?token=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Session name updated!');
        await refreshStatus();
    } catch (error) {
        alert('Error updating name: ' + error.message);
    }
}

async function terminateSession(sessionId) {
    if (!confirm(`Are you sure you want to terminate session ${sessionId}?`)) return;
    try {
        const response = await fetch(`/api/user/sessions/${sessionId}?token=${token}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Session terminated successfully.');
        await refreshStatus();
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
        const response = await fetch(`/user/settings/ai?token=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch(`/user/settings/humanization?token=${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
    const initialSessionsData = dashboardContainer.dataset.initialSessions;
    if (initialSessionsData) {
        try {
            const initialSessions = JSON.parse(initialSessionsData);
            updateSessionStatusUI(initialSessions);
        } catch (e) {
            console.error("Could not parse initial session data", e);
            updateSessionStatusUI([]);
        }
    }
    setInterval(refreshStatus, 4000);
    toggleWarning();
});