// CoDev — A GPT 4.0 Virtual Developer, by  twitter.com/@etherlegend 
// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware to protect admin-only routes.
 * Checks for a valid session.
 */
const protectAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        return next();
    }
    // If it's an API request, send JSON, otherwise redirect.
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    res.redirect('/admin/login');
};

/**
 * Middleware to protect user-only API routes.
 * Checks for a valid JWT in the Authorization header.
 */
const protectUser = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'No token provided or malformed header.' });
    }
    
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.tenant = decoded; // Attach tenant info to the request object
        next();
    } catch (ex) {
        console.error("Invalid token access attempt:", ex.message);
        return res.status(401).json({ status: 'error', message: 'Invalid token.' });
    }
};

module.exports = {
    protectAdmin,
    protectUser
};