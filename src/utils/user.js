// src/utils/user.js
const bcrypt = require('bcrypt');
const db  = require('../db/database');

const SALT_ROUNDS = 10; // Standard security practice

/**
 * Creates a new tenant with a securely hashed password.
 * @param {string} tenantId 
 * @param {string} name 
 * @param {string} username 
 * @param {string} password - The plain-text password.
 * @param {string} webhookUrl 
 * @param {number} maxSessions - The maximum number of concurrent sessions allowed.
 */
// --- START OF CHANGE ---
async function createTenantWithPassword(tenantId, name, username, password, webhookUrl, maxSessions = 1) {
    if (!password) {
        throw new Error("Password is required to create a tenant.");
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    // We call the updated db.createTenant function, passing along the maxSessions value.
    return db.createTenant(tenantId, name, username, hashedPassword, webhookUrl, maxSessions);
}
// --- END OF CHANGE ---

module.exports = { createTenantWithPassword };