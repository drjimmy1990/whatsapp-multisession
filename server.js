// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// server.js (Refactored with Robust Shutdown)
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const SessionManager = require('./src/managers/SessionManager');
const db = require('./src/db/database');

const adminRoutes = require('./routes/adminRoutes');
const userRoutes = require('./routes/userRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    console.log(`[SYSTEM] Data directory not found. Creating it at: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5001;

const { JWT_SECRET, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
if (!JWT_SECRET || !ADMIN_PASSWORD || !SESSION_SECRET) {
    console.error('FATAL ERROR: One or more required environment variables are not set.');
    console.error('Please ensure JWT_SECRET, ADMIN_PASSWORD, and SESSION_SECRET are defined in your .env file.');
    process.exit(1);
}

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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

app.use('/', adminRoutes);
app.use('/', userRoutes);
app.use('/', sessionRoutes);

async function restoreActiveSessions() {
    console.log('[SYSTEM] Attempting to restore active sessions...');
    try {
        const activeSessions = await db.getAllActiveSessions();
        if (!activeSessions || activeSessions.length === 0) {
            return console.log('[SYSTEM] No active sessions found in DB to restore.');
        }
        console.log(`[SYSTEM] Found ${activeSessions.length} session(s) to restore.`);
        for (const session of activeSessions) {
            SessionManager.startSession(session.id, session.tenantId, true);
        }
    } catch (e) {
        console.error('[SYSTEM] CRITICAL ERROR during session restoration:', e);
    }
}

async function startServer() {
    try {
        await db.initDb();
        await db.cleanUpStaleSessions();

        const server = app.listen(PORT, async () => {
            console.log(`✅ WhatsApp Service API server is running on http://localhost:${PORT}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await restoreActiveSessions();
        });

        // --- START OF ROBUST SHUTDOWN IMPLEMENTATION ---

        let isShuttingDown = false;
        const activeSockets = new Set();

        // Track all active connections
        server.on('connection', (socket) => {
            activeSockets.add(socket);
            socket.on('close', () => {
                activeSockets.delete(socket);
            });
        });

        const gracefulShutdown = async () => {
            // Prevent the function from running multiple times
            if (isShuttingDown) {
                console.log('[SERVER] Shutdown already in progress. Please wait.');
                return;
            }
            isShuttingDown = true;
            console.log('\n[SERVER] Received shutdown signal. Closing connections gracefully.');

            // Forcefully close all lingering connections
            console.log(`[SERVER] Destroying ${activeSockets.size} active connections...`);
            for (const socket of activeSockets) {
                socket.destroy();
            }
            console.log('[SERVER] All connections destroyed.');

            // Now, close the server. It will close immediately since all connections are gone.
            server.close(async () => {
                console.log('[SERVER] HTTP server closed.');
                // Shut down the session manager and WhatsApp clients
                await SessionManager.shutdown();
                console.log('[SERVER] Graceful shutdown complete.');
                process.exit(0);
            });
        };
        // --- END OF ROBUST SHUTDOWN IMPLEMENTATION ---

        process.on('SIGINT', gracefulShutdown);
        process.on('SIGTERM', gracefulShutdown);

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();