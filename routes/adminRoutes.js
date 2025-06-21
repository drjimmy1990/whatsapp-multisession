// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// routes/adminRoutes.js
const express = require('express');
const bcrypt = require('bcrypt');
const { protectAdmin } = require('../src/middleware/auth');
const db = require('../src/db/database');
const SessionManager = require('../src/managers/SessionManager');
const { createTenantWithPassword } = require('../src/utils/user');

const router = express.Router();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- VIEW ROUTES ---
router.get('/admin/login', (req, res) => res.render('admin_login.html'));

router.get('/admin', protectAdmin, async (req, res) => {
    try {
        const [tenants, sessions] = await Promise.all([db.getAllTenants(), db.getAllSessions()]);
        res.render('admin.html', { tenants, sessions });
    } catch (e) {
        console.error("[Admin View] Error loading admin panel data:", e);
        res.status(500).send("Error loading admin panel data.");
    }
});


// --- API ROUTES ---
router.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.save(err => {
            if (err) {
                console.error("[Admin Login] Session save error:", err);
                return res.status(500).json({ message: 'Session save error.' });
            }
            res.status(200).json({ message: 'Login successful.' });
        });
    } else {
        res.status(401).json({ message: 'Invalid password.' });
    }
});

router.post('/api/admin/logout', protectAdmin, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("[Admin Logout] Error destroying session:", err);
            return res.status(500).json({ message: 'Could not log out.' });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: 'Logout successful.' });
    });
});

router.get('/api/dashboard-data', protectAdmin, async (req, res) => {
    try {
        const [tenants, sessions] = await Promise.all([db.getAllTenants(), db.getAllSessions()]);
        res.status(200).json({ tenants, sessions });
    } catch (e) {
        console.error("[API] Failed to fetch dashboard data:", e);
        res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
});

router.post('/api/tenants', protectAdmin, async (req, res) => {
    const { tenantId, name, username, password, webhookUrl, maxSessions } = req.body;
    if (!tenantId || !name || !username || !password) {
        return res.status(400).json({ status: 'error', message: 'Tenant ID, Name, Username, and Password are required.' });
    }
    try {
        await createTenantWithPassword(tenantId, name, username, password, webhookUrl || '', maxSessions || 1);
        res.status(201).json({ status: 'success', message: 'Tenant created successfully.' });
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ status: 'error', message: `Tenant ID or Username already exists.` });
        }
        console.error("[API] Failed to create tenant:", e);
        res.status(500).json({ status: 'error', message: 'Failed to create tenant.' });
    }
});

router.delete('/api/tenants/:tenantId', protectAdmin, async (req, res) => {
    const { tenantId } = req.params;
    try {
        await SessionManager.terminateTenantSessions(tenantId);
        await db.deleteTenant(tenantId);
        res.status(200).json({ status: 'success', message: 'Tenant and all associated sessions deleted.' });
    } catch (e) {
        console.error(`[API] Failed to delete tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to delete tenant.' });
    }
});

router.put('/api/tenants/:tenantId', protectAdmin, async (req, res) => {
    const { tenantId } = req.params;
    const { name, webhookUrl, maxSessions } = req.body;
    if (!name) {
        return res.status(400).json({ status: 'error', message: 'Tenant name is required.' });
    }
    try {
        await db.updateTenantSettings(tenantId, { name, webhookUrl, maxSessions: parseInt(maxSessions, 10) });
        res.status(200).json({ status: 'success', message: 'Tenant updated successfully.' });
    } catch (e) {
        console.error(`[API] Failed to update tenant ${tenantId}:`, e);
        res.status(500).json({ status: 'error', message: 'Failed to update tenant.' });
    }
});

router.put('/api/tenants/:tenantId/password', protectAdmin, async (req, res) => {
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


module.exports = router;