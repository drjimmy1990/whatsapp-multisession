// public/js/user_session.js

const card = document.querySelector('.card');
const sessionId = card.dataset.sessionId; // Get sessionId from data attribute
const qrContainer = document.getElementById('qr-container');
const statusMessageEl = document.getElementById('status-message');

async function pollStatus() {
    try {
        const response = await fetch(`/sessions/${sessionId}/status`);
        if (!response.ok) {
            throw new Error('Session not found or server error.');
        }
        const result = await response.json();
        const session = result.data;

        updateUI(session.status, session.qrCode);

    } catch (error) {
        console.error("Polling error:", error);
        updateUI('ERROR', null);
    }
}

function updateUI(status, qrCodeString) {
    qrContainer.innerHTML = ''; // Clear previous content
    
    switch (status) {
        case 'PENDING_SCAN':
            statusMessageEl.textContent = 'Scan the code below:';
            qrContainer.appendChild(statusMessageEl);
            const canvas = document.createElement('canvas');
            qrContainer.appendChild(canvas);
            QRCode.toCanvas(canvas, qrCodeString, { width: 256 }, function (error) {
                if (error) console.error(error);
            });
            break;
        
        case 'CONNECTED':
            statusMessageEl.textContent = '✅ Success! Your account is connected.';
            statusMessageEl.className = 'status-connected';
            qrContainer.appendChild(statusMessageEl);
            // Stop polling once connected
            clearInterval(pollingInterval);
            break;

        case 'ERROR':
        case 'DISCONNECTED':
            statusMessageEl.textContent = '❌ Error! Please contact support or try starting a new session.';
            statusMessageEl.className = 'status-error';
            qrContainer.appendChild(statusMessageEl);
            clearInterval(pollingInterval);
            break;

        default: // INITIALIZING, etc.
            statusMessageEl.textContent = 'Initializing session, please wait...';
            qrContainer.appendChild(statusMessageEl);
    }
}

// Start polling every 3 seconds
const pollingInterval = setInterval(pollStatus, 3000);
// And run once immediately on page load
pollStatus();