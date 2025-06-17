// src/WhatsAppWrapper.js
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // Add MessageMedia
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs').promises;
const defaultConfig = require('../config');

// Helper functions
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function getRandomDelay(minMs, maxMs) { return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs; }

class WhatsAppWrapper {
    constructor(options = {}) {
        const dataPath = path.resolve(process.cwd(), 'sessions');
        this.sessionFolderPath = path.join(dataPath, `session-${options.session.clientId}`);

        const puppeteerOptions = {
            headless: true,

            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-blink-features=AutomationControlled'
            ],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        };
        
        const authStrategy = new LocalAuth({
            clientId: options.session.clientId,
            dataPath: dataPath,
        });

        this.client = new Client({
            authStrategy: authStrategy,
            puppeteer: puppeteerOptions,
        });

        this.isReady = false;
        this.sessionName = options.session.clientId;
        this._setupEventHandlers();
    }

    _setupEventHandlers() {
        this.client.on('qr', (qr) => { console.log(`[${this.sessionName}] QR code received. Please scan.`); qrcode.generate(qr, { small: true }); });
        this.client.on('authenticated', () => { console.log(`[${this.sessionName}] ✅ Session is authenticated.`); });
        this.client.on('auth_failure', (msg) => { console.error(`[${this.sessionName}] ❌ AUTHENTICATION FAILURE:`, msg); });
        this.client.on('ready', () => { this.isReady = true; console.log(`[${this.sessionName}] ✅ Client is ready and online.`); });
        this.client.on('disconnected', (reason) => { this.isReady = false; console.warn(`[${this.sessionName}] ⚠️ Client disconnected:`, reason); });
    }

    async initialize() {
        console.log(`[${this.sessionName}] Initializing WhatsApp client...`);
        await this.client.initialize();
    }

    async logout() {
        if (this.client) {
            console.log(`[${this.sessionName}] Logging out client...`);
            await this.client.logout();
            this.isReady = false;
            console.log(`[${this.sessionName}] Client logged out.`);
        }
        try {
            console.log(`[${this.sessionName}] Attempting to delete session folder: ${this.sessionFolderPath}`);
            await fs.rm(this.sessionFolderPath, { recursive: true, force: true });
            console.log(`[${this.sessionName}] ✅ Successfully deleted session folder.`);
        } catch (e) {
            console.error(`[${this.sessionName}] ❌ Error deleting session folder:`, e.message);
        }
    }

    async destroy() {
        console.log(`[${this.sessionName}] Starting graceful destruction of client...`);
        if (this.client) {
            try {
                const browser = this.client.pupBrowser;
                await this.client.destroy();
                if (browser && browser.isConnected()) {
                    await browser.close();
                }
            } catch (e) {
                console.error(`[${this.sessionName}] Error during client destruction:`, e.message);
            }
        }
        console.log(`[${this.sessionName}] Destruction process complete.`);
    }
    
    onNewMessage(callback) {
        this.client.on('message', callback);
    }

    // --- START OF NEW/MODIFIED METHODS ---

    /**
     * A general-purpose message sender. Can send text or pre-constructed MessageMedia objects.
     * @param {string} chatId The ID of the chat to send the message to.
     * @param {string|MessageMedia} content The message content (text) or a MessageMedia object.
     * @param {object} options Additional options for sending (e.g., caption).
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async sendMessage(chatId, content, options = {}) {
        if (!this.isReady) {
            console.error(`[${this.sessionName}] Cannot send message, client not ready.`);
            return false;
        }
        try {
            await this.client.sendMessage(chatId, content, options);
            return true;
        } catch (e) {
            console.error(`[Wrapper] Error in sendMessage to ${chatId}:`, e.message);
            return false;
        }
    }

    /**
     * Fetches media from a URL and sends it.
     * @param {string} chatId The ID of the chat to send the media to.
     * @param {string} url The public URL of the media file.
     * @param {object} options Additional options, like a caption.
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async sendUrlMedia(chatId, url, options = {}) {
        if (!this.isReady) {
            console.error(`[${this.sessionName}] Cannot send media, client not ready.`);
            return false;
        }
        try {
            console.log(`[Wrapper] Fetching media from URL: ${url}`);
            const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
            console.log(`[Wrapper] Media fetched successfully. Mimetype: ${media.mimetype}. Sending to ${chatId}.`);
            return await this.sendMessage(chatId, media, options);
        } catch (e) {
            console.error(`[Wrapper] Error in sendUrlMedia to ${chatId}:`, e);
            throw e; // Re-throw the error so the API layer can catch it and send a specific response.
        }
    }

    /**
     * Simulates human-like typing and sends a text message.
     * @param {string} chatId The ID of the chat to send to.
     * @param {string} text The text to send.
     * @param {object} humanizeConfig The configuration for delays and errors.
     * @returns {Promise<boolean>} True if successful, false otherwise.
     */
    async sendHumanizedMessage(chatId, text, humanizeConfig) {
        if (!this.isReady) { console.error(`[${this.sessionName}] Cannot send message, client not ready.`); return false; }
        const config = humanizeConfig || defaultConfig.humanize;
        try {
            const chat = await this.client.getChatById(chatId);
            if (!chat) { console.error(`Chat with ID ${chatId} not found.`); return false; }
            let typed = "";
            for (let i = 0; i < text.length; i++) {
                await chat.sendStateTyping();
                if (Math.random() < config.errorProbability && typed.length > 1) {
                    const del = Math.min(getRandomDelay(1, config.maxBackspaceChars), typed.length);
                    typed = typed.slice(0, -del);
                    i -= (del + 1);
                    await sleep(getRandomDelay(200, 400));
                    continue;
                }
                typed += text[i];
                await sleep(getRandomDelay(config.minCharDelay, config.maxCharDelay));
            }
            await sleep(getRandomDelay(config.minPauseAfterTyping, config.maxPauseAfterTyping));
            await this.client.sendMessage(chatId, text);
            await chat.clearState();
            return true;
        } catch (e) {
            console.error(`[Wrapper] Error in sendHumanizedMessage to ${chatId}:`, e);
            try { const chat = await this.client.getChatById(chatId); if (chat) await chat.clearState(); } catch (clearError) { /* ignore */ }
            return false;
        }
    }
    // --- END OF NEW/MODIFIED METHODS ---
}

module.exports = WhatsAppWrapper;