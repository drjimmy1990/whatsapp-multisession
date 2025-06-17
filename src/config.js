// src/config.js
// This file holds the DEFAULT configuration for the service.
// These values are used as a fallback if a specific tenant has not
// configured their own custom settings in the database.

const config = {
    // --- Default Humanization Settings ---
    // These values control how the bot behaves to appear more human.
    // They can be overridden on a per-tenant basis from the database.
    // All delay values are in milliseconds (1000ms = 1 second).
    humanize: {
        
        // --- Defaults for INCOMING message handling ---
        // This simulates how the bot "reacts" to receiving a message.
        // This logic is used by the SessionManager.
        
        enabled: true,               // Whether to enable this behavior by default for new tenants.
        
        minReadDelay: 10000,         // Default minimum time to wait before marking a message as "read".
        maxReadDelay: 15000,         // Default maximum time.

        minReplyThinkDelay: 1500,    // Default minimum time to "think" after reading before starting to type.
        maxReplyThinkDelay: 5000,    // Default maximum time.

        
        // --- Defaults for OUTGOING message handling ---
        // This simulates the speed and style of a human typist.
        // This logic is used by the WhatsAppWrapper's sendHumanizedMessage method.
        
        minCharDelay: 90,            // Default minimum delay between keystrokes.
        maxCharDelay: 250,           // Default maximum delay.

        errorProbability: 0.10,      // 10% chance of making a "typo" at each character.
        maxBackspaceChars: 3,        // If a typo happens, what's the max characters to "delete".

        minPauseAfterTyping: 700,    // Default minimum pause after finishing typing, before sending.
        maxPauseAfterTyping: 2200,   // Default maximum pause.
    }
};

module.exports = config;