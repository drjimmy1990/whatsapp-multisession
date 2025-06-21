// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// routes/userRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { protectUser } = require('../src/middleware/auth');
const db = require('../src/db/database');
const SessionManager = require('../src/managers/SessionManager');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// --- VIEW ROUTES ---
router.get('/login', (req, res) => res.render('login.html'));

router.get('/user/dashboard', (req, res) => {
    // This just serves the static shell. The client-side JS handles auth and data fetching.
    res.render('user_dashboard.html', {});
});

router.get('/user/session/:sessionId', (req, res) => {
    // This page is for scanning the QR code, which doesn't require user login itself.
    res.render('user_session.ejs', { sessionId: req.params.sessionId });
});

// --- API ROUTES ---
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const tenant = await db.getTenantByUsername(username);
        if (!tenant || !tenant.hashedPassword) {
            return res.status(401).json({ message: 'Invalid credentials or user setup incomplete.' });
        }
        const isMatch = await bcrypt.compare(password, tenant.hashedPassword);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const token = jwt.sign({ tenantId: tenant.id, name: tenant.name }, JWT_SECRET, { expiresIn: '8h' });
        res.status(200).json({ message: 'Login successful', token: token });
    } catch (error) {
        console.error('[API Login] Server error during user login:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

router.get('/api/user/dashboard-data', protectUser, async (req, res) => {
    const tenantId = req.tenant.tenantId;
    try {
        const [sessions, tenantDetails] = await Promise.all([
            db.getSessionsByTenant(tenantId),
            db.getTenant(tenantId)
        ]);
        if (!tenantDetails) {
            return res.status(404).json({ status: 'error', message: 'Tenant not found.' });
        }
        const { hashedPassword, ...safeTenantDetails } = tenantDetails;
        res.status(200).json({
            status: 'success',
            data: { sessions, tenant: safeTenantDetails }
        });
    } catch (e) {
        console.error(`[API] Error fetching dashboard data for tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Error loading dashboard data.' });
    }
});

router.get('/api/tenant/status', protectUser, async (req, res) => {
    const tenantId = req.tenant.tenantId;
    try {
        const sessions = await db.getSessionsByTenant(tenantId);
        res.status(200).json({ sessions });
    } catch (e) {
        console.error(`[API] Failed to fetch tenant status for ${tenantId}:`, e);
        res.status(500).json({ error: "Failed to fetch tenant status" });
    }
});

router.put('/user/settings/ai', protectUser, async (req, res) => {
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

router.put('/user/settings/humanization', protectUser, async (req, res) => {
    const tenantId = req.tenant.tenantId;
    const settings = req.body;

    const numMinCharDelay = parseInt(settings.minCharDelay, 10);
    const numMaxCharDelay = parseInt(settings.maxCharDelay, 10);
    const numMinPauseAfterTyping = parseInt(settings.minPauseAfterTyping, 10);
    const numMaxPauseAfterTyping = parseInt(settings.maxPauseAfterTyping, 10);

    if (numMinCharDelay > numMaxCharDelay || numMinPauseAfterTyping > numMaxPauseAfterTyping) {
        return res.status(400).json({ status: 'error', message: 'Min values cannot be greater than max values.' });
    }

    try {
        const settingsToUpdate = {
            enableHumanization: !!settings.enableHumanization,
            minCharDelay: numMinCharDelay,
            maxCharDelay: numMaxCharDelay,
            errorProbability: parseFloat(settings.errorProbability),
            maxBackspaceChars: parseInt(settings.maxBackspaceChars, 10),
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

router.delete('/api/user/sessions/:sessionId', protectUser, async (req, res) => {
    const { sessionId } = req.params;
    const tenantId = req.tenant.tenantId;
    try {
        const session = await db.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Session not found.' });
        }
        if (session.tenantId !== tenantId) {
            return res.status(403).json({ status: 'error', message: 'Forbidden. You do not own this session.' });
        }
        await SessionManager.terminateSession(sessionId);
        res.status(200).json({ status: 'success', message: 'Session terminated.' });
    } catch (e) {
        console.error(`[API] User ${tenantId} failed to terminate session ${sessionId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to terminate session.' });
    }
});

router.put('/api/sessions/:sessionId/name', protectUser, async (req, res) => {
    const { sessionId } = req.params;
    const { name } = req.body;
    const tenantId = req.tenant.tenantId;
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ status: 'error', message: 'Session name cannot be empty.' });
    }
    try {
        const session = await db.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Session not found.' });
        }
        if (session.tenantId !== tenantId) {
            return res.status(403).json({ status: 'error', message: 'Forbidden. You do not own this session.' });
        }
        await db.updateSession(sessionId, { name: name.trim() });
        res.status(200).json({ status: 'success', message: 'Session name updated successfully.' });
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ status: 'error', message: `You already have a session named "${name.trim()}".` });
        }
        console.error(`[API] User ${tenantId} failed to name session ${sessionId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to update session name.' });
    }
});

module.exports = router;