// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// routes/sessionRoutes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { protectAdmin, protectUser } = require('../src/middleware/auth');
const db = require('../src/db/database');
const SessionManager = require('../src/managers/SessionManager');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: `${process.uptime().toFixed(2)}s`,
        activeSessions: SessionManager.getActiveSessionsCount()
    });
});

router.post('/sessions', async (req, res) => {
    let tenantId;
    let isUserRequest = false;

    // Determine if the request is from an authenticated user or an admin
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            tenantId = decoded.tenantId;
            isUserRequest = true;
        } catch (e) {
            return res.status(401).json({ status: 'error', message: 'Invalid token.' });
        }
    } else if (req.session.isAdmin) {
        tenantId = req.body.tenantId;
        isUserRequest = false;
    } else {
        return res.status(403).json({ status: 'error', message: 'Forbidden. No authentication provided.' });
    }

    if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'Missing "tenantId" in request body for admin or invalid token for user.' });
    }

    try {
        const tenant = await db.getTenant(tenantId);
        if (!tenant) {
            return res.status(404).json({ status: 'error', message: 'Tenant not found.' });
        }

        // Only apply session limit check for user requests
        if (isUserRequest) {
            const activeSessions = await db.getActiveSessionsForTenant(tenantId);
            if (activeSessions.length >= tenant.maxSessions) {
                return res.status(403).json({
                    status: 'error',
                    message: `Active session limit of ${tenant.maxSessions} reached.`
                });
            }
        }

        if (SessionManager.isTenantSessionInitializing(tenantId)) {
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

// Admin-only route to terminate any session
router.delete('/api/sessions/:sessionId', protectAdmin, async (req, res) => {
    const { sessionId } = req.params;
    try {
        await SessionManager.terminateSession(sessionId);
        res.status(200).json({ status: 'success', message: 'Session terminated.' });
    } catch (e) {
        console.error(`[API] Admin failed to terminate session ${sessionId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to terminate session.' });
    }
});

router.get('/sessions/:sessionId/status', async (req, res) => {
    const { sessionId } = req.params;
    try {
        const session = await db.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ status: 'error', message: 'Session not found.' });
        }
        res.status(200).json({ status: 'success', data: session });
    } catch (e) {
        console.error(`[API] Error getting status for session ${sessionId}:`, e);
        res.status(500).json({ status: 'error', message: 'An internal error occurred.' });
    }
});

// This is a generic send route, could be used by any authenticated system in the future.
// For now, it's not protected by a specific role, but requires some form of auth to have happened in /sessions
router.post('/sessions/:sessionId/send', async (req, res) => {
    const { sessionId } = req.params;
    const { chatId, text, options = {} } = req.body;
    if (!chatId || !text) {
        return res.status(400).json({ status: 'error', message: 'Missing "chatId" or "text" in request body.' });
    }
    try {
        const success = await SessionManager.sendHumanizedMessage(sessionId, chatId, text, options);
        if (success) {
            return res.status(200).json({ status: 'success', message: 'Message sent successfully.' });
        } else {
            return res.status(500).json({ status: 'error', message: 'Failed to send message. Session might be offline.' });
        }
    } catch (e) {
        console.error(`[API] Error sending message for session ${sessionId}:`, e);
        res.status(500).json({ status: 'error', message: 'An internal error occurred.' });
    }
});

router.post('/api/sessions/:sessionId/send-media', async (req, res) => {
    const { sessionId } = req.params;
    const { chatId, mediaUrl, caption } = req.body;
    if (!chatId || !mediaUrl) {
        return res.status(400).json({ status: 'error', message: 'Missing "chatId" or "mediaUrl" in request body.' });
    }
    try {
        const success = await SessionManager.sendUrlMedia(sessionId, chatId, mediaUrl, caption);
        if (success) {
            return res.status(200).json({ status: 'success', message: 'Media message sent successfully.' });
        } else {
            return res.status(500).json({ status: 'error', message: 'Failed to send media message. The session might be offline or the URL is invalid.' });
        }
    } catch (e) {
        const errorMessage = e.message.includes('MIME type') ? 'Could not determine file type from URL. Please use a direct link to a media file.' : 'An internal error occurred while sending media.';
        res.status(500).json({ status: 'error', message: errorMessage });
    }
});

module.exports = router;