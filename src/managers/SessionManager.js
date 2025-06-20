// src/managers/SessionManager.js
const axios = require('axios');
const WhatsAppWrapper = require('../WhatsAppWrapper');
const db = require('../db/database');
const defaultConfig = require('../config'); // Import default config for humanization fallbacks


class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.initializingTenants = new Set(); 
        console.log('✅ SessionManager initialized.');
    }

    isTenantSessionInitializing(tenantId) {
        return this.initializingTenants.has(tenantId);
    }    

    async startSession(sessionId, tenantId, isRestoring = false) {
        if (this.sessions.has(sessionId)) {
            return console.log(`[${sessionId}] Session is already running or being initialized.`);
        }

        this.initializingTenants.add(tenantId);
        console.log(`[${sessionId}] Preparing to start session for tenant: ${tenantId}. Is Restoring: ${isRestoring}`);
        
        const bot = new WhatsAppWrapper({
            session: { clientId: sessionId }
        });
        this.sessions.set(sessionId, bot);

        bot.client.on('qr', (qr) => db.updateSession(sessionId, { status: 'PENDING_SCAN', qrCode: qr }));
        bot.client.on('ready', () => db.updateSession(sessionId, { status: 'CONNECTED', qrCode: null, name: bot.client.info.pushname || 'My WhatsApp' }));
        bot.client.on('disconnected', (reason) => {
            console.warn(`[${sessionId}] Client disconnected with reason: ${reason}`);
            this.sessions.delete(sessionId);
            db.updateSession(sessionId, { status: 'DISCONNECTED' });
        });

        bot.onNewMessage(async (msg) => {
            if (msg.fromMe || msg.isStatus) return;
            const tenant = await db.getTenant(tenantId);
            if (!tenant || !tenant.webhookUrl) return;
            const contact = await msg.getContact();
            const messageData = { sessionId, chatId: msg.from, messageId: msg.id._serialized, sender: { pushname: contact.pushname, number: contact.number, isMe: contact.isMe }, timestamp: new Date(msg.timestamp * 1000).toISOString(), type: msg.type, body: msg.body, mediaData: null, mediaMimetype: null, mediaFilename: null, };
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media) {
                        messageData.mediaData = media.data;
                        messageData.mediaMimetype = media.mimetype;
                        messageData.mediaFilename = media.filename;
                    }
                } catch (e) { console.error(`[${sessionId}] Failed to download media:`, e.message); }
            }
            try {
                await axios.post(tenant.webhookUrl, { body: messageData }, { timeout: 20000 });
            } catch (e) { console.error(`[${sessionId}] ❌ FAILED to trigger webhook. Error: ${e.message}`); }
        });
        
        try {
            await bot.initialize();
            const finalStatus = await db.getSession(sessionId);

            if (isRestoring && finalStatus.status !== 'CONNECTED') {
                console.error(`[${sessionId}] FAILED TO RESTORE SESSION. Final status is ${finalStatus.status}. Terminating.`);
                await this.terminateSession(sessionId);
                return;
            }
            console.log(`[${sessionId}] Session successfully started with status: ${finalStatus.status}`);

        } catch (err) {
            console.error(`[${sessionId}] CRITICAL FAILURE during bot.initialize():`, err.message);
            await db.updateSession(sessionId, { status: 'ERROR' });
            this.sessions.delete(sessionId);
        } finally {
            this.initializingTenants.delete(tenantId);
            console.log(`[${sessionId}] Initialization process finished. Tenant lock released.`);
        }
    }

    async sendHumanizedMessage(sessionId, chatId, text) {
        const bot = this.sessions.get(sessionId);
        if (!bot || !bot.isReady) {
            console.error(`[Manager] Session ${sessionId} not ready or not found for sending message.`);
            return false;
        }

        try {
            const session = await db.getSession(sessionId);
            const tenant = await db.getTenant(session.tenantId);
            const humanizeConfig = {
                enabled: tenant.enableHumanization ?? defaultConfig.humanize.enabled,
                minCharDelay: tenant.minCharDelay ?? defaultConfig.humanize.minCharDelay,
                maxCharDelay: tenant.maxCharDelay ?? defaultConfig.humanize.maxCharDelay,
                errorProbability: tenant.errorProbability ?? defaultConfig.humanize.errorProbability,
                maxBackspaceChars: tenant.maxBackspaceChars ?? defaultConfig.humanize.maxBackspaceChars,
                minPauseAfterTyping: tenant.minPauseAfterTyping ?? defaultConfig.humanize.minPauseAfterTyping,
                maxPauseAfterTyping: tenant.maxPauseAfterTyping ?? defaultConfig.humanize.maxPauseAfterTyping,
            };

            if (humanizeConfig.enabled) {
                return await bot.sendHumanizedMessage(chatId, text, humanizeConfig);
            } else {
                return await bot.sendMessage(chatId, text);
            }
        } catch (e) {
            console.error(`[Manager] Error during sendHumanizedMessage for session ${sessionId}:`, e);
            return false;
        }
    }

    async sendUrlMedia(sessionId, chatId, mediaUrl, caption) {
        const bot = this.sessions.get(sessionId);
        if (!bot || !bot.isReady) {
            console.error(`[Manager] Session ${sessionId} not ready or not found for sending media.`);
            return false;
        }
        return bot.sendUrlMedia(chatId, mediaUrl, { caption });
    }

    async terminateSession(sessionId) {
        const bot = this.sessions.get(sessionId);
        if (bot && bot instanceof WhatsAppWrapper) {
            await bot.logout(); 
        } else {
            console.log(`[Manager] Session ${sessionId} not in active map. Attempting manual cleanup.`);
            const wrapper = new WhatsAppWrapper({ session: { clientId: sessionId } });
            await wrapper.logout();
        }

        const session = await db.getSession(sessionId);
        if (session) {
            this.initializingTenants.delete(session.tenantId);
        }
        this.sessions.delete(sessionId);
        await db.deleteSession(sessionId); 
        console.log(`[Manager] Session ${sessionId} has been terminated and removed.`);
    }

    // --- START OF FIX ---
    /**
     * Finds all sessions belonging to a tenant and terminates them one by one.
     * This is used when an admin deletes a tenant.
     * @param {string} tenantId The ID of the tenant to clear.
     */
    async terminateTenantSessions(tenantId) {
        console.log(`[Manager] Terminating all sessions for tenant: ${tenantId}`);
        const sessionsToDelete = await db.getSessionsByTenant(tenantId);

        if (!sessionsToDelete || sessionsToDelete.length === 0) {
            console.log(`[Manager] No sessions found for tenant ${tenantId} to terminate.`);
            return;
        }

        console.log(`[Manager] Found ${sessionsToDelete.length} sessions to terminate for tenant ${tenantId}.`);
        const terminationPromises = sessionsToDelete.map(session => this.terminateSession(session.id));
        await Promise.all(terminationPromises);
        console.log(`[Manager] Successfully terminated all sessions for tenant: ${tenantId}`);
    }
    // --- END OF FIX ---
    // NOTE: The duplicated `terminateSession` function that was here has been removed.

    async shutdown() {
        console.log('[Manager] Shutting down all sessions...');
        const shutdownPromises = [];
        for (const bot of this.sessions.values()) {
            if (bot instanceof WhatsAppWrapper) { shutdownPromises.push(bot.destroy()); }
        }
        await Promise.all(shutdownPromises);
        this.sessions.clear();
        console.log('[Manager] All sessions have been shut down.');
    }
    
    getActiveSessionsCount() {
        return this.sessions.size;
    }
}

module.exports = new SessionManager();