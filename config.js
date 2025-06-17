

const config = {
    // --- Session and Client Settings ---
    session: {
        clientId: 'super-bot' // A unique name for your session file
    },

    // --- API Server Settings ---
    // The bot runs a small web server to listen for commands from n8n (e.g., to send a reply).
    api: {
        port: 5002 // The port for the API server to listen on. Make sure it's not in use.

    },
    
    // --- n8n Webhook Settings ---
    // The URL where the bot will send incoming message data.
    n8n: {
        webhookUrl: 'https://ai-n8n.ddns.net/webhook/whatsssss' // IMPORTANT: Replace with your actual n8n webhook URL.
    },

    // --- Humanization Settings (The "Anti-Detection" Logic) ---
    // These values control how the bot behaves to appear more human.
    // All delay values are in milliseconds (1000ms = 1 second).
    humanize: {
        // --- Delays before acting ---
        // Simulates the time a person takes to see and react to a message.
        minReadDelay: 10000,       // Minimum time to wait before marking a message as "read"
        maxReadDelay: 15000,       // Maximum time

        minReplyThinkDelay: 1500,   // Minimum time to "think" after reading before starting to type
        maxReplyThinkDelay: 5000,   // Maximum time

        // --- Typing Simulation ---
        // Simulates the speed and style of a human typist.
        minCharDelay: 90,           // Minimum delay between keystrokes
        maxCharDelay: 250,          // Maximum delay between keystrokes

        errorProbability: 0.10,     // 10% chance of making a "typo" at each character
        maxBackspaceChars: 3,       // If a typo happens, what's the max characters to "delete"

        minPauseAfterTyping: 700,   // Minimum pause after finishing typing, before sending
        maxPauseAfterTyping: 2200,  // Maximum pause
    }
};

module.exports = config;