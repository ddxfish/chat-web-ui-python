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

// --- Helper Functions ---
const setProcessing = (processing) => {
    isProcessing = processing;
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
        handleSendClick();
    }
};

// --- Event Handlers ---
const handleSendClick = async () => {
    const newLength = await chat.handleSendMessage(
        promptInput, 
        sendBtn, 
        setProcessing, 
        refreshHistory
    );
    if (newLength !== null && newLength !== undefined) {
        lastKnownHistoryLength = newLength;
    }
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
    const newLength = await chat.autoRefreshChat(isProcessing, lastKnownHistoryLength);
    lastKnownHistoryLength = newLength;
};

const handleTrashClick = async (messageIndex) => {
    const newLength = await chat.handleTrashClick(messageIndex);
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
    refreshHistory();
    
    // Start auto-refresh
    setInterval(handleAutoRefresh, 4000);
});

// Form and input events
chatForm.addEventListener('submit', (e) => e.preventDefault());
promptInput.addEventListener('keydown', handleTextareaKeydown);
promptInput.addEventListener('input', handleTextareaInput);
sendBtn.addEventListener('click', handleSendClick);

// Control button events
refreshBtn.addEventListener('click', handleRefreshClick);
resetBtn.addEventListener('click', handleResetClick);
sidebarToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
});