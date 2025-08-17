// static/main.js

import * as chat from './chat.js';

// --- DOM Element References ---
const chatForm = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const refreshBtn = document.getElementById('refresh-btn');
const resetBtn = document.getElementById('reset-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

// --- Global State ---
let lastKnownHistoryLength = 0;
let isProcessing = false;
let lastAutoRefresh = 0;
let autoRefreshInterval = null;

// --- Helper Functions ---
const setProcessing = (processing) => {
    isProcessing = processing;
    // Pause auto-refresh during processing to prevent race conditions
    if (processing) {
        pauseAutoRefresh();
    } else {
        resumeAutoRefresh();
    }
};

const pauseAutoRefresh = () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log("Auto-refresh paused during processing");
    }
};

const resumeAutoRefresh = () => {
    if (!autoRefreshInterval) {
        autoRefreshInterval = setInterval(handleAutoRefresh, 4000);
        console.log("Auto-refresh resumed after processing");
    }
};

const refreshHistory = async () => {
    const result = await chat.fetchAndRenderHistory(lastKnownHistoryLength);
    if (result.newLength !== undefined) {
        lastKnownHistoryLength = result.newLength;
    }
    return result.newLength;
};

const handleTextareaInput = () => {
    promptInput.parentElement.dataset.replicatedValue = promptInput.value;
};

const handleTextareaKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        // Only handle if not currently processing to avoid double submission
        if (!isProcessing) {
            handleSendClick();
        }
    }
};

// --- Event Handlers ---
const handleSendClick = async () => {
    // Prevent double submission
    if (isProcessing) {
        console.log("Send already in progress, ignoring click");
        return;
    }
    
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    
    console.log(`=== SEND CLICK START (history length: ${lastKnownHistoryLength}) ===`);
    
    try {
        const result = await chat.handleSendMessage(
            promptInput, 
            sendBtn, 
            setProcessing, 
            refreshHistory
        );
        
        // Update history length based on what actually happened
        if (result && result.streaming) {
            // Streaming worked, UI was updated manually
            lastKnownHistoryLength += 2; // user + assistant
            console.log(`Streaming success - updated length to: ${lastKnownHistoryLength}`);
        } else if (result && result.newLength !== undefined && result.newLength !== null) {
            // Fell back to non-streaming and refreshed
            lastKnownHistoryLength = result.newLength;
            console.log(`Fallback success - updated length to: ${lastKnownHistoryLength}`);
        }
    } catch (error) {
        console.error("Error in handleSendClick:", error);
    }
    
    console.log(`=== SEND CLICK END (final length: ${lastKnownHistoryLength}) ===`);
};

const handleRefreshClick = () => {
    refreshHistory();
};

const handleResetClick = async () => {
    const newLength = await chat.handleResetChat(refreshHistory);
    if (newLength !== null) {
        lastKnownHistoryLength = newLength;
    }
};

const handleAutoRefresh = async () => {
    // Don't auto-refresh if we're processing
    if (isProcessing) {
        console.log("Auto-refresh skipped: processing");
        return;
    }
    
    // Don't auto-refresh too frequently
    const now = Date.now();
    if (now - lastAutoRefresh < 3000) {  // Minimum 3 seconds between auto-refreshes
        return;
    }
    lastAutoRefresh = now;
    
    console.log(`Auto-refresh check: known length ${lastKnownHistoryLength}`);
    const newLength = await chat.autoRefreshChat(isProcessing, lastKnownHistoryLength);
    if (newLength !== lastKnownHistoryLength) {
        console.log(`Auto-refresh updated length: ${lastKnownHistoryLength} -> ${newLength}`);
        lastKnownHistoryLength = newLength;
    }
};

const handleTrashClick = async (messageIndex) => {
    const newLength = await chat.handleTrashClick(messageIndex, refreshHistory);
    if (newLength !== null) {
        lastKnownHistoryLength = newLength;
    }
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-collapsed');
    }
    
    const chatContainer = document.getElementById('chat-container');
    console.log('Chat container found:', chatContainer);
    
    if (chatContainer) {
        chatContainer.addEventListener('click', (e) => {
            console.log('=== CLICK DETECTED ===');
            console.log('Target element:', e.target);
            console.log('Target classes:', Array.from(e.target.classList));
            console.log('Target dataset:', e.target.dataset);
            
            if (e.target.classList.contains('message-trash')) {
                console.log('Direct hit on trash element!');
                e.preventDefault();
                e.stopPropagation();
                
                const messageIndex = parseInt(e.target.dataset.messageIndex);
                console.log('Message index from dataset:', messageIndex);
                
                if (!isNaN(messageIndex)) {
                    console.log('Calling handleTrashClick...');
                    handleTrashClick(messageIndex);
                } else {
                    console.error('Invalid messageIndex:', e.target.dataset.messageIndex);
                }
            } else {
                console.log('Not a trash element click, ignoring');
            }
        });
        console.log('Trash click handler attached to chat container');
    } else {
        console.error('Chat container not found!');
    }
    
    // Initialize
    await refreshHistory();
    
    // Start auto-refresh
    resumeAutoRefresh();
});

// Form and input events - Remove duplicate form submission handler
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    // Do nothing here - only handle via button click to avoid double submission
});

promptInput.addEventListener('keydown', handleTextareaKeydown);
promptInput.addEventListener('input', handleTextareaInput);
sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleSendClick();
});

// Control button events
refreshBtn.addEventListener('click', handleRefreshClick);
resetBtn.addEventListener('click', handleResetClick);
sidebarToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
});