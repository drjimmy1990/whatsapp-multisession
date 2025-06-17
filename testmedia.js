// test-url-media.js
// A standalone script to test sending media from URLs using whatsapp-web.js

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// --- 1. CONFIGURATION ---
// ===============================================================================================
// >> IMPORTANT <<: Replace this with your own WhatsApp number, including the country code.
//                  Format: [country_code][number]@c.us. For example: '12345678901@c.us'
const TARGET_CHAT_ID = '201099238811@c.us'; 
// ===============================================================================================

// --- 2. PUBLIC URLS FOR TEST ASSETS ---
// A reliable public URL for testing sending an image.
const IMAGE_URL = 'https://i.ibb.co/d4jDSFm3/Screenshot-2025-05-28-223311.png';
// A reliable public URL for testing sending audio.
const AUDIO_URL = 'https://www.w3schools.com/html/horse.mp3';

// Helper function for delays
const sleep = ms => new Promise(res => setTimeout(res, ms));


// --- 3. WHATSAPP CLIENT INITIALIZATION ---
console.log('[SYSTEM] Initializing WhatsApp client...');
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'url-media-test-session' }) // Use a separate session for this test
});

client.on('qr', (qr) => {
    console.log('[QRCODE] A QR code is required for the first run. Please scan it with your phone.');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('[SYSTEM] ✅ Authenticated successfully.');
});

client.on('auth_failure', msg => {
    console.error('[SYSTEM] ❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    console.log('[SYSTEM] ⚠️ Client was logged out:', reason);
});


// --- 4. MAIN TEST LOGIC ---
client.on('ready', async () => {
    console.log('[SYSTEM] ✅ Client is ready!');
    console.log(`[SYSTEM] Target chat ID is set to: ${TARGET_CHAT_ID}`);
    if (TARGET_CHAT_ID === 'xxxxxxxxxxx@c.us') {
        console.error('\n[FATAL] Please set the TARGET_CHAT_ID in the script before running.\n');
        await client.destroy();
        process.exit(1);
    }
    
    await runAllTests();

    console.log('[SYSTEM] All tests completed. Shutting down client.');
    await client.destroy();
    process.exit(0);
});

async function runAllTests() {
    console.log('\n--- Starting URL Media Sending Tests ---');
    
    // Test 1: Send a simple text message to confirm connection
    await client.sendMessage(TARGET_CHAT_ID, '🚀 Starting URL media tests...');
    await sleep(2000);

    // Test 2: Send an image from a public URL
    await testSendImageFromUrl();
    await sleep(3000);

    // Test 3: Send an audio file from a public URL
    await testSendAudioFromUrl();
    await sleep(3000);
}

async function testSendImageFromUrl() {
    try {
        console.log('[TEST] Sending image from URL...');
        const media = await MessageMedia.fromUrl(IMAGE_URL);
        await client.sendMessage(TARGET_CHAT_ID, media, { caption: 'This image came from a URL.' });
        console.log('[SUCCESS] Image from URL sent.');
    } catch (e) {
        console.error('[FAIL] Failed to send image from URL:', e.message);
    }
}

async function testSendAudioFromUrl() {
    try {
        console.log('[TEST] Sending audio from URL...');
        const audioMedia = await MessageMedia.fromUrl(AUDIO_URL);

        // Send as a standard audio file
        await client.sendMessage(TARGET_CHAT_ID, audioMedia, { caption: 'This audio file came from a URL.'});
        console.log('[SUCCESS] Audio from URL sent.');
        
        // Optional: Send as a voice note as well
        // await sleep(2000);
        // await client.sendMessage(TARGET_CHAT_ID, audioMedia, { sendAudioAsVoice: true });
        // console.log('[SUCCESS] Audio from URL sent as voice note.');

    } catch (e) {
        console.error('[FAIL] Failed to send audio from URL:', e.message);
    }
}


// --- 5. START THE CLIENT ---
client.initialize();