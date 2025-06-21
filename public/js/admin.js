// public/js/admin.js

const tenantsTableBody = document.getElementById('tenants-table-body');
const sessionsTableBody = document.getElementById('sessions-table-body');
const noTenantsMessage = document.getElementById('no-tenants-message');
const noSessionsMessage = document.getElementById('no-sessions-message');
const lastUpdatedEl = document.getElementById('last-updated');
const addTenantForm = document.getElementById('add-tenant-form');
const editTenantModal = document.getElementById('edit-tenant-modal');
const resetPasswordModal = document.getElementById('reset-password-modal');

let AppData = { tenants: [], sessions: [] };

function updateTenantsTable(tenants) {
    tenantsTableBody.innerHTML = '';
    noTenantsMessage.style.display = tenants.length === 0 ? 'block' : 'none';
    tenants.forEach(tenant => {
        const row = tenantsTableBody.insertRow();
        row.innerHTML = `
            <td><code>${tenant.id}</code></td>
            <td>${tenant.name}</td>
            <td><code>${tenant.username || 'N/A'}</code></td>
            <td>${tenant.maxSessions}</td>
            <td><code>${tenant.webhookUrl || 'Not Set'}</code></td>
            <td class="actions">
                <button class="btn-primary" onclick="startSession('${tenant.id}')">Start Session</button>
                <button class="btn-secondary" onclick="openEditModal('${tenant.id}')">Edit</button>
                <button class="btn-warning" onclick="openResetPasswordModal('${tenant.id}')">Password</button>
                <button class="btn-danger" onclick="deleteTenant('${tenant.id}')">Delete</button>
            </td>
        `;
    });
}

function updateSessionsTable(sessions) {
    sessionsTableBody.innerHTML = '';
    noSessionsMessage.style.display = sessions.length === 0 ? 'block' : 'none';
    sessions.forEach(session => {
        const row = sessionsTableBody.insertRow();
        const sessionName = session.name ? session.name : '<em>Not Set</em>';
        let actionsHtml = `<button class="btn-danger" onclick="terminateSession('${session.id}')">Terminate</button>`;
        if (session.status === 'PENDING_SCAN') {
            actionsHtml = `<button class="btn-info" onclick="showLink('${session.id}')">Get User Link</button> ` + actionsHtml;
        }
        row.innerHTML = `
            <td>${sessionName}</td>
            <td><code>${session.id}</code></td>
            <td><code>${session.tenantId}</code></td>
            <td class="status status-${session.status.toLowerCase()}">${session.status}</td>
            <td class="actions">${actionsHtml}</td>
        `;
    });
}

async function refreshData() {
    try {
        const response = await fetch('/api/dashboard-data');
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/admin/login';
            return;
        }
        if (!response.ok) throw new Error('Network response was not ok');
        AppData = await response.json();
        updateTenantsTable(AppData.tenants);
        updateSessionsTable(AppData.sessions);
        lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error('Failed to refresh data:', error);
        lastUpdatedEl.textContent = 'Error updating data.';
    }
}

async function logout() {
    try {
        const response = await fetch('/api/admin/logout', { method: 'POST' });
        if (!response.ok) throw new Error('Logout failed');
        window.location.href = '/admin/login';
    } catch (error) {
        alert('Logout failed. Please try again.');
    }
}

async function addTenant(event) {
    event.preventDefault();
    const formData = new FormData(addTenantForm);
    const tenantData = Object.fromEntries(formData.entries());
    try {
        const response = await fetch('/api/tenants', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tenantData)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Tenant created successfully!');
        addTenantForm.reset();
        refreshData();
    } catch (error) {
        alert('Error creating tenant: ' + error.message);
    }
}

async function startSession(tenantId) {
    if (!confirm(`Start a new session for tenant "${tenantId}"?`)) return;
    try {
        const response = await fetch('/sessions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId: tenantId })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert(`Session started! ID: ${result.sessionId}.`);
        refreshData();
    } catch (error) {
        alert('Error starting session: ' + error.message);
    }
}

async function terminateSession(sessionId) {
    if (!confirm(`Terminate session "${sessionId}"? This cannot be undone.`)) return;
    try {
        const response = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Session terminated successfully.');
        refreshData();
    } catch (error) {
        alert('Error terminating session: ' + error.message);
    }
}

async function deleteTenant(tenantId) {
    if (!confirm(`ARE YOU SURE you want to delete tenant "${tenantId}"? This will terminate all their sessions.`)) return;
    try {
        const response = await fetch(`/api/tenants/${tenantId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Tenant deleted successfully.');
        refreshData();
    } catch (error) {
        alert('Error deleting tenant: ' + error.message);
    }
}

function showLink(sessionId) {
    const url = `${window.location.origin}/user/session/${sessionId}`;
    prompt("Send this link to the user to scan the QR code:", url);
}

// --- MODAL FUNCTIONS ---

function openEditModal(tenantId) {
    const tenant = AppData.tenants.find(t => t.id === tenantId);
    if (!tenant) return;
    document.getElementById('edit-tenant-id').value = tenant.id;
    document.getElementById('edit-name').value = tenant.name;
    document.getElementById('edit-maxSessions').value = tenant.maxSessions;
    document.getElementById('edit-webhookUrl').value = tenant.webhookUrl || '';
    editTenantModal.style.display = 'block';
}

function openResetPasswordModal(tenantId) {
    const tenant = AppData.tenants.find(t => t.id === tenantId);
    if (!tenant) return;
    document.getElementById('reset-password-tenant-id').value = tenant.id;
    document.getElementById('reset-password-tenant-name').textContent = tenant.name;
    document.getElementById('reset-password-form').reset(); // Clear old password

    // Ensure password field is hidden by default
    const passwordInput = document.getElementById('new-password');
    passwordInput.type = 'password';
    passwordInput.nextElementSibling.textContent = 'Show';

    resetPasswordModal.style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function handleEditTenant(event) {
    event.preventDefault();
    const tenantId = document.getElementById('edit-tenant-id').value;
    const name = document.getElementById('edit-name').value;
    const maxSessions = document.getElementById('edit-maxSessions').value;
    const webhookUrl = document.getElementById('edit-webhookUrl').value;

    try {
        const response = await fetch(`/api/tenants/${tenantId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, webhookUrl, maxSessions })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Tenant updated successfully!');
        closeModal('edit-tenant-modal');
        refreshData();
    } catch (error) {
        alert('Error updating tenant: ' + error.message);
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const tenantId = document.getElementById('reset-password-tenant-id').value;
    const password = document.getElementById('new-password').value;

    if (!confirm(`Are you sure you want to reset the password for tenant "${tenantId}"?`)) return;

    try {
        const response = await fetch(`/api/tenants/${tenantId}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        alert('Password updated successfully!');
        closeModal('reset-password-modal');
    } catch (error) {
        alert('Error resetting password: ' + error.message);
    }
}

function togglePasswordVisibility(inputId, button) {
    const passwordInput = document.getElementById(inputId);
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        button.textContent = "Hide";
    } else {
        passwordInput.type = "password";
        button.textContent = "Show";
    }
}

window.onclick = function(event) {
    if (event.target == editTenantModal) {
        closeModal('edit-tenant-modal');
    }
    if (event.target == resetPasswordModal) {
        closeModal('reset-password-modal');
    }
}

setInterval(refreshData, 5000);
document.addEventListener('DOMContentLoaded', refreshData);