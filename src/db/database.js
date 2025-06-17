// src/db/database.js (Corrected)

// --- FIX: Add the missing imports for 'path' and 'fs' ---
const path = require('path');
const fs = require('fs');
// --------------------------------------------------------

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const defaultConfig = require('../config');

let db;
const SALT_ROUNDS = 10;

const createTestUser = () => {
    return new Promise((resolve, reject) => {
        const testUsername = 'testuser';
        const testPassword = 'password123';
        
        db.get('SELECT * FROM tenants WHERE username = ?', [testUsername], async (err, row) => {
            if (err) return reject(err);
            if (row) {
                console.log('[DB] Test user already exists.');
                return resolve();
            }

            console.log('[DB] Test user not found. Creating...');
            try {
                const hashedPassword = await bcrypt.hash(testPassword, SALT_ROUNDS);
                const tenantId = 'tenant-test-user';
                const name = 'Test User Co.';
                const webhookUrl = '';
                const maxSessions = 1;
                
                db.run('INSERT INTO tenants (id, name, username, hashedPassword, webhookUrl, maxSessions) VALUES (?, ?, ?, ?, ?, ?)', 
                    [tenantId, name, testUsername, hashedPassword, webhookUrl, maxSessions], 
                    (err) => {
                        if (err) { console.error('[DB] Failed to create test user:', err); return reject(err); }
                        console.log(`[DB] ✅ Test user '${testUsername}' created successfully.`);
                        resolve();
                    }
                );
            } catch (hashError) {
                console.error('[DB] Failed to hash password for test user:', hashError);
                reject(hashError);
            }
        });
    });
};

const initDb = () => {
    return new Promise((resolve, reject) => {
        // Use a subdirectory for the database files
        const dbPath = process.env.DATABASE_PATH || './data/whatsapp-service.db';
        
        // Ensure the directory exists before trying to open the database
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            try {
                fs.mkdirSync(dbDir, { recursive: true });
                console.log(`[DB] Created database directory at: ${dbDir}`);
            } catch (e) {
                console.error('[DB] CRITICAL: Could not create database directory.', e);
                return reject(e);
            }
        }
        
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) { console.error('CRITICAL: Error opening database', err.message); return reject(err); }
            console.log('✅ Connected to the SQLite database.');
        });

        db.run('PRAGMA foreign_keys = ON;', (err) => {
            if (err) { console.error("Could not enable foreign keys:", err.message); return reject(err); }
        });

        db.serialize(async () => {
            console.log('Initializing database schema...');
            db.run(`
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE, hashedPassword TEXT, 
                    webhookUrl TEXT, aiSystemPrompt TEXT, maxSessions INTEGER DEFAULT 1,
                    enableHumanization BOOLEAN DEFAULT 1, minReadDelay INTEGER DEFAULT 10000, maxReadDelay INTEGER DEFAULT 15000,
                    minReplyThinkDelay INTEGER DEFAULT 1500, maxReplyThinkDelay INTEGER DEFAULT 5000, minCharDelay INTEGER DEFAULT 90,
                    maxCharDelay INTEGER DEFAULT 250, errorProbability REAL DEFAULT 0.1, maxBackspaceChars INTEGER DEFAULT 3,
                    minPauseAfterTyping INTEGER DEFAULT 700, maxPauseAfterTyping INTEGER DEFAULT 2200
                )
            `);
            db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, status TEXT NOT NULL,
                    name TEXT, qrCode TEXT, pairingCode TEXT, lastActive TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tenantId) REFERENCES tenants (id) ON DELETE CASCADE,
                    UNIQUE (tenantId, name)
                )
            `);
            console.log('Schema initialization complete.');
            
            try {
                await createTestUser();
                resolve();
            } catch (userError) {
                reject(userError);
            }
        });
    });
};

// --- Helper Promise Wrappers and Public Functions remain the same ---
function run(sql, params = []) { return new Promise((resolve, reject) => { db.run(sql, params, function (err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); }); }); }
function get(sql, params = []) { return new Promise((resolve, reject) => { db.get(sql, params, (err, result) => { if (err) reject(err); else resolve(result); }); }); }
function all(sql, params = []) { return new Promise((resolve, reject) => { db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); }); }); }

const createTenant = (tenantId, name, username, hashedPassword, webhookUrl, maxSessions = 1) => run('INSERT INTO tenants (id, name, username, hashedPassword, webhookUrl, maxSessions) VALUES (?, ?, ?, ?, ?, ?)', [tenantId, name, username, hashedPassword, webhookUrl, maxSessions]);
const getTenantByUsername = (username) => get('SELECT * FROM tenants WHERE username = ?', [username]);
const createSession = (sessionId, tenantId, status) => run('INSERT INTO sessions (id, tenantId, status) VALUES (?, ?, ?)', [sessionId, tenantId, status]);
const getSession = (sessionId) => get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
const getAllActiveSessions = () => all("SELECT * FROM sessions WHERE status = 'CONNECTED'");
const getTenant = (tenantId) => get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
const updateSession = (sessionId, data) => { const fields = Object.keys(data); const values = Object.values(data); if (fields.length === 0) return Promise.resolve(); const setClause = fields.map(field => `${field} = ?`).join(', '); const sql = `UPDATE sessions SET ${setClause} WHERE id = ?`; return run(sql, [...values, sessionId]); };
const getAllTenants = () => all('SELECT * FROM tenants ORDER BY name ASC');
const getAllSessions = () => all('SELECT * FROM sessions ORDER BY lastActive DESC');
const deleteTenant = (tenantId) => run('DELETE FROM tenants WHERE id = ?', [tenantId]);
const deleteSession = (sessionId) => run('DELETE FROM sessions WHERE id = ?', [sessionId]);
const cleanUpStaleSessions = () => run("DELETE FROM sessions WHERE status = 'INITIALIZING' OR status = 'PENDING_SCAN'");
const getSessionsByTenant = (tenantId) => all('SELECT * FROM sessions WHERE tenantId = ? ORDER BY lastActive DESC', [tenantId]);
const updateTenantSettings = (tenantId, settings) => { const fields = Object.keys(settings); const values = Object.values(settings); if (fields.length === 0) { return Promise.resolve(); } const setClause = fields.map(field => `${field} = ?`).join(', '); const sql = `UPDATE tenants SET ${setClause} WHERE id = ?`; return run(sql, [...values, tenantId]); };

module.exports = {
    initDb, createSession, updateSession, getSession, getAllActiveSessions, getTenant,
    getAllTenants, getAllSessions, deleteTenant, deleteSession, createTenant, 
    cleanUpStaleSessions, getSessionsByTenant, getTenantByUsername, updateTenantSettings
};