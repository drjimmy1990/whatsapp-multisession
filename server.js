// server.js (Definitive Final Version)
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SessionManager = require('./src/managers/SessionManager');
const db = require('./src/db/database');
const { createTenantWithPassword } = require('./src/utils/user');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    console.log(`[SYSTEM] Data directory not found. Creating it at: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
}


const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 5001;

app.set('trust proxy', 1);

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET || !ADMIN_PASSWORD || !SESSION_SECRET) {
    console.error('FATAL ERROR: One or more required environment variables are not set.');
    console.error('Please ensure JWT_SECRET, ADMIN_PASSWORD, and SESSION_SECRET are defined in your .env file.');
    process.exit(1);
}

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: './data',
        table: 'admin_sessions'
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);

const protectAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        return next();
    }
    res.redirect('/admin/login');
};

const protectUser = (req, res, next) => {
    let token;

    // Look for the token in the Authorization header first
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
    } else {
        // Fallback to the query parameter for now
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ status: 'error', message: 'No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.tenant = decoded;
        next();
    } catch (ex) {
        console.error("Invalid token access attempt:", ex.message);
        return res.status(401).json({ status: 'error', message: 'Invalid token.' });
    }
};
// --- END OF MODIFICATION for protectUser ---


// --- START OF MODIFICATION for protectUserView ---
const protectUserView = (req, res, next) => {
    let token;

    // We only need the query param for the initial page load
    token = req.query.token;

    if (!token) {
        return res.redirect('/login');
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.tenant = decoded;
        next();
    } catch (ex) {
        console.error("Invalid token access attempt:", ex.message);
        res.redirect('/login');
    }
};
async function restoreActiveSessions() { console.log('[SYSTEM] Attempting to restore active sessions...'); try { const activeSessions = await db.getAllActiveSessions(); if (!activeSessions || activeSessions.length === 0) { return console.log('[SYSTEM] No active sessions found in DB to restore.'); } console.log(`[SYSTEM] Found ${activeSessions.length} session(s) to restore.`); for (const session of activeSessions) { SessionManager.startSession(session.id, session.tenantId, true); } } catch (e) { console.error('[SYSTEM] CRITICAL ERROR during session restoration:', e); } }

app.get('/admin/login', (req, res) => res.render('admin_login.html'));
app.get('/admin', protectAdmin, async (req, res) => { try { const [tenants, sessions] = await Promise.all([db.getAllTenants(), db.getAllSessions()]); res.render('admin.html', { tenants, sessions }); } catch (e) { res.status(500).send("Error loading admin panel data."); } });
app.get('/user/session/:sessionId', (req, res) => res.render('user_session.ejs', { sessionId: req.params.sessionId }));
app.get('/login', (req, res) => res.render('login.html'));
app.get('/user/dashboard', protectUserView, async (req, res) => { const tenantId = req.tenant.tenantId; try { const [sessions, tenantDetails] = await Promise.all([db.getSessionsByTenant(tenantId), db.getTenant(tenantId)]); res.render('user_dashboard.html', { sessions, tenant: tenantDetails, token: req.query.token }); } catch (e) { res.status(500).send("Error loading dashboard."); } });

app.post('/api/admin/login', (req, res) => { const { password } = req.body; if (password === ADMIN_PASSWORD) { req.session.isAdmin = true; req.session.save(err => err ? res.status(500).json({ message: 'Session save error.' }) : res.status(200).json({ message: 'Login successful.' })); } else { res.status(401).json({ message: 'Invalid password.' }); } });
app.post('/api/admin/logout', (req, res) => { req.session.destroy(err => { if (err) { return res.status(500).json({ message: 'Could not log out.' }); } res.clearCookie('connect.sid'); res.status(200).json({ message: 'Logout successful.' }); }); });
app.post('/api/login', async (req, res) => { const { username, password } = req.body; if (!username || !password) { return res.status(400).json({ message: 'Username and password are required.' }); } try { const tenant = await db.getTenantByUsername(username); if (!tenant || !tenant.hashedPassword) { return res.status(401).json({ message: 'Invalid credentials or user setup incomplete.' }); } const isMatch = await bcrypt.compare(password, tenant.hashedPassword); if (!isMatch) { return res.status(401).json({ message: 'Invalid credentials.' }); } const token = jwt.sign({ tenantId: tenant.id, name: tenant.name }, JWT_SECRET, { expiresIn: '8h' }); res.status(200).json({ message: 'Login successful', token: token }); } catch (error) { res.status(500).json({ message: 'Server error during login.' }); } });

app.get('/api/dashboard-data', protectAdmin, async (req, res) => { try { const [tenants, sessions] = await Promise.all([db.getAllTenants(), db.getAllSessions()]); res.status(200).json({ tenants, sessions }); } catch (e) { res.status(500).json({ error: "Failed to fetch dashboard data" }); } });
app.post('/api/tenants', protectAdmin, async (req, res) => { const { tenantId, name, username, password, webhookUrl, maxSessions } = req.body; if (!tenantId || !name || !username || !password) { return res.status(400).json({ status: 'error', message: 'Tenant ID, Name, Username, and Password are required.' }); } try { await createTenantWithPassword(tenantId, name, username, password, webhookUrl || '', maxSessions || 1); res.status(201).json({ status: 'success', message: 'Tenant created successfully.' }); } catch (e) { if (e.code === 'SQLITE_CONSTRAINT') { return res.status(409).json({ status: 'error', message: `Tenant ID or Username already exists.` }); } res.status(500).json({ status: 'error', message: 'Failed to create tenant.' }); } });
app.delete('/api/tenants/:tenantId', protectAdmin, async (req, res) => { const { tenantId } = req.params; try { await SessionManager.terminateTenantSessions(tenantId); await db.deleteTenant(tenantId); res.status(200).json({ status: 'success', message: 'Tenant and all associated sessions deleted.' }); } catch (e) { res.status(500).json({ status: 'error', message: 'Failed to delete tenant.' }); } });
app.put('/api/tenants/:tenantId', protectAdmin, async (req, res) => { const { tenantId } = req.params; const { name, webhookUrl, maxSessions } = req.body; if (!name) { return res.status(400).json({ status: 'error', message: 'Tenant name is required.' }); } try { await db.updateTenantSettings(tenantId, { name, webhookUrl, maxSessions: parseInt(maxSessions, 10) }); res.status(200).json({ status: 'success', message: 'Tenant updated successfully.' }); } catch (e) { res.status(500).json({ status: 'error', message: 'Failed to update tenant.' }); } });

app.put('/api/tenants/:tenantId/password', protectAdmin, async (req, res) => {
    const { tenantId } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ status: 'error', message: 'Password is required and must be at least 6 characters long.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.updateTenantPassword(tenantId, hashedPassword);
        console.log(`[API] Admin successfully reset password for tenant: ${tenantId}`);
        res.status(200).json({ status: 'success', message: 'Tenant password updated successfully.' });
    } catch (e) {
        console.error(`[API] Error updating password for tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to update tenant password.' });
    }
});
// --- START OF DEFINITIVE FIX FOR POST /SESSIONS ---
app.post('/sessions', async (req, res) => {
    let tenantId;
    let isUserRequest = false;

    // A user authenticates with a JWT in the Authorization header.
    // An admin authenticates with an express-session cookie.
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        // This is a USER request.
        try {
            const token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            tenantId = decoded.tenantId;
            isUserRequest = true;
        } catch (e) {
            return res.status(401).json({ status: 'error', message: 'Invalid token.' });
        }
    } else if (req.session.isAdmin) {
        // This is an ADMIN request.
        tenantId = req.body.tenantId;
        isUserRequest = false;
    } else {
        // No valid authentication method was provided.
        return res.status(403).json({ status: 'error', message: 'Forbidden. No authentication provided.' });
    }

    if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'Missing "tenantId" in request body.' });
    }

    try {
        const tenant = await db.getTenant(tenantId);
        if (!tenant) {
            return res.status(404).json({ status: 'error', message: 'Tenant not found.' });
        }

        // Session limit check is ONLY applied if it's a user request.
        if (isUserRequest) {
            const activeSessions = await db.getActiveSessionsForTenant(tenantId);
            if (activeSessions.length >= tenant.maxSessions) {
                return res.status(403).json({ 
                    status: 'error', 
                    message: `Active session limit of ${tenant.maxSessions} reached.` 
                });
            }
        }

        const isInitializing = SessionManager.isTenantSessionInitializing(tenantId);
        if (isInitializing) {
            return res.status(409).json({ status: 'error', message: `A session for tenant ${tenantId} is already initializing.` });
        }

        const sessionId = uuidv4();
        await db.createSession(sessionId, tenantId, 'INITIALIZING');
        SessionManager.startSession(sessionId, tenantId, false);
        
        res.status(202).json({ status: 'success', message: 'Session initialization started.', sessionId: sessionId });

    } catch (e) {
        console.error(`[API] Error starting session for tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'An internal error occurred.' });
    }
});
// --- END OF DEFINITIVE FIX FOR POST /SESSIONS ---
app.post('/sessions/:sessionId/send', async (req, res) => { 
    const { sessionId } = req.params; 
    const { chatId, text } = req.body; 
    if (!chatId || !text) { return res.status(400).json({ status: 'error', message: 'Missing "chatId" or "text" in request body.' }); } 
    try { 
        const success = await SessionManager.sendHumanizedMessage(sessionId, chatId, text); 
        if (success) { 
            return res.status(200).json({ status: 'success', message: 'Message sent successfully.' }); 
        } else { 
            return res.status(500).json({ status: 'error', message: 'Failed to send message.' }); 
        } 
    } catch (e) { 
        res.status(500).json({ status: 'error', message: 'An internal error occurred.' }); 
    } 
});

app.delete('/api/sessions/:sessionId', protectAdmin, async (req, res) => { const { sessionId } = req.params; try { await SessionManager.terminateSession(sessionId); res.status(200).json({ status: 'success', message: 'Session terminated.' }); } catch (e) { res.status(500).json({ status: 'error', message: 'Failed to terminate session.' }); } });
app.delete('/api/user/sessions/:sessionId', protectUser, async (req, res) => { const { sessionId } = req.params; const tenantId = req.tenant.tenantId; try { const session = await db.getSession(sessionId); if (!session) { return res.status(404).json({ status: 'error', message: 'Session not found.' }); } if (session.tenantId !== tenantId) { return res.status(403).json({ status: 'error', message: 'Forbidden. You do not own this session.' }); } await SessionManager.terminateSession(sessionId); res.status(200).json({ status: 'success', message: 'Session terminated.' }); } catch (e) { res.status(500).json({ status: 'error', message: 'Failed to terminate session.' }); } });
app.put('/api/sessions/:sessionId/name', protectUser, async (req, res) => { const { sessionId } = req.params; const { name } = req.body; const tenantId = req.tenant.tenantId; if (!name || name.trim().length === 0) { return res.status(400).json({ status: 'error', message: 'Session name cannot be empty.' }); } try { const session = await db.getSession(sessionId); if (!session) { return res.status(404).json({ status: 'error', message: 'Session not found.' }); } if (session.tenantId !== tenantId) { return res.status(403).json({ status: 'error', message: 'Forbidden. You do not own this session.' }); } await db.updateSession(sessionId, { name: name.trim() }); res.status(200).json({ status: 'success', message: 'Session name updated successfully.' }); } catch (e) { if (e.code === 'SQLITE_CONSTRAINT') { return res.status(409).json({ status: 'error', message: `You already have a session named "${name.trim()}".` }); } res.status(500).json({ status: 'error', message: 'Failed to update session name.' }); } });
app.post('/sessions/:sessionId/send', async (req, res) => { const { sessionId } = req.params; const { chatId, text, options = {} } = req.body; if (!chatId || !text) { return res.status(400).json({ status: 'error', message: 'Missing "chatId" or "text" in request body.' }); } try { const success = await SessionManager.sendHumanizedMessage(sessionId, chatId, text, options); if (success) { return res.status(200).json({ status: 'success', message: 'Message sent successfully.' }); } else { return res.status(500).json({ status: 'error', message: 'Failed to send message.' }); } } catch (e) { res.status(500).json({ status: 'error', message: 'An internal error occurred.' }); } });
app.post('/api/sessions/:sessionId/send-media', async (req, res) => { const { sessionId } = req.params; const { chatId, mediaUrl, caption } = req.body; if (!chatId || !mediaUrl) { return res.status(400).json({ status: 'error', message: 'Missing "chatId" or "mediaUrl" in request body.' }); } try { const success = await SessionManager.sendUrlMedia(sessionId, chatId, mediaUrl, caption); if (success) { return res.status(200).json({ status: 'success', message: 'Media message sent successfully.' }); } else { return res.status(500).json({ status: 'error', message: 'Failed to send media message. The session might be offline or the URL is invalid.' }); } } catch (e) { const errorMessage = e.message.includes('MIME type') ? 'Could not determine file type from URL. Please use a direct link to a media file.' : 'An internal error occurred while sending media.'; res.status(500).json({ status: 'error', message: errorMessage }); } });
app.get('/sessions/:sessionId/status', async (req, res) => { const { sessionId } = req.params; try { const session = await db.getSession(sessionId); if (!session) { return res.status(404).json({ status: 'error', message: 'Session not found.' }); } res.status(200).json({ status: 'success', data: session }); } catch (e) { res.status(500).json({ status: 'error', message: 'An internal error occurred.' }); } });
app.get('/health', (req, res) => { res.status(200).json({ status: 'ok', uptime: `${process.uptime().toFixed(2)}s`, activeSessions: SessionManager.getActiveSessionsCount() }); });
app.put('/user/settings/ai', protectUser, async (req, res) => {
    const tenantId = req.tenant.tenantId;
    const { aiSystemPrompt } = req.body;
    try {
        await db.updateTenantSettings(tenantId, { aiSystemPrompt });
        res.status(200).json({ status: 'success', message: 'AI settings updated successfully.' });
    } catch (e) {
        console.error(`[API] Error updating AI settings for tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to update AI settings.' });
    }
});

// Route for updating Humanization settings
app.put('/user/settings/humanization', protectUser, async (req, res) => {
    const tenantId = req.tenant.tenantId;
    const { 
        enableHumanization, minCharDelay, maxCharDelay, 
        errorProbability, maxBackspaceChars, minPauseAfterTyping, maxPauseAfterTyping 
    } = req.body;
    
    // --- FIX: Convert to numbers BEFORE validation ---
    const numMinCharDelay = parseInt(minCharDelay, 10);
    const numMaxCharDelay = parseInt(maxCharDelay, 10);
    const numMinPauseAfterTyping = parseInt(minPauseAfterTyping, 10);
    const numMaxPauseAfterTyping = parseInt(maxPauseAfterTyping, 10);

    // Now, validate using the numbers
    if (numMinCharDelay > numMaxCharDelay || numMinPauseAfterTyping > numMaxPauseAfterTyping) {
        return res.status(400).json({ status: 'error', message: 'Min values cannot be greater than max values.' });
    }

    try {
        // We can now use the numeric variables we already created
        const settingsToUpdate = {
            enableHumanization: !!enableHumanization,
            minCharDelay: numMinCharDelay,
            maxCharDelay: numMaxCharDelay,
            errorProbability: parseFloat(errorProbability),
            maxBackspaceChars: parseInt(maxBackspaceChars, 10),
            minPauseAfterTyping: numMinPauseAfterTyping,
            maxPauseAfterTyping: numMaxPauseAfterTyping,
        };

        await db.updateTenantSettings(tenantId, settingsToUpdate);
        res.status(200).json({ status: 'success', message: 'Humanization settings updated successfully.' });
    } catch (e) {
        console.error(`[API] Error updating humanization settings for tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to update humanization settings.' });
    }
});
app.get('/api/tenant/status', protectUser, async (req, res) => { const tenantId = req.tenant.tenantId; try { const sessions = await db.getSessionsByTenant(tenantId); res.status(200).json({ sessions }); } catch (e) { res.status(500).json({ error: "Failed to fetch tenant status" }); } });

async function startServer() { try { await db.initDb(); await db.cleanUpStaleSessions(); const server = app.listen(PORT, async () => { console.log(`✅ WhatsApp Service API server is running on http://localhost:${PORT}`); await new Promise(resolve => setTimeout(resolve, 2000)); await restoreActiveSessions(); }); const gracefulShutdown = async () => { console.log('\n[SERVER] Received shutdown signal. Closing connections gracefully.'); server.close(async () => { await SessionManager.shutdown(); process.exit(0); }); }; process.on('SIGINT', gracefulShutdown); process.on('SIGTERM', gracefulShutdown); } catch (error) { console.error('Failed to start server:', error); process.exit(1); } }
startServer();