// static/main.js

import * as chat from './chat.js';

// DOM Elements
const chatForm = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const refreshBtn = document.getElementById('refresh-btn');
const resetBtn = document.getElementById('reset-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const chatContainer = document.getElementById('chat-container');

// State
let lastKnownHistoryLength = 0;
let isProcessing = false;
let autoRefreshInterval = null;

// Helper functions
const setProcessing = (processing) => {
    isProcessing = processing;
    if (processing) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    } else if (!autoRefreshInterval) {
        autoRefreshInterval = setInterval(handleAutoRefresh, 4000);
    }
};

const updateHistoryLength = (newLength) => {
    if (newLength !== null && newLength !== undefined) {
        lastKnownHistoryLength = newLength;
    }
    return lastKnownHistoryLength;
};

const refreshHistory = async () => {
    const result = await chat.fetchAndRenderHistory(lastKnownHistoryLength);
    return updateHistoryLength(result.newLength);
};

// Event Handlers
const handleTextareaInput = () => {
    promptInput.parentElement.dataset.replicatedValue = promptInput.value;
};

const handleTextareaKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !isProcessing) {
        event.preventDefault();
        handleSendClick();
    }
};

const handleSendClick = async () => {
    if (isProcessing || !promptInput.value.trim()) return;
    
    const result = await chat.handleSendMessage(promptInput, sendBtn, setProcessing, refreshHistory);
    
    if (result?.streaming) {
        updateHistoryLength(lastKnownHistoryLength + 2);
    } else if (result?.newLength !== undefined) {
        updateHistoryLength(result.newLength);
    }
};

const handleResetClick = async () => {
    const newLength = await chat.handleResetChat(refreshHistory);
    updateHistoryLength(newLength);
};

const handleAutoRefresh = async () => {
    if (isProcessing) return;
    
    const newLength = await chat.autoRefreshChat(isProcessing, lastKnownHistoryLength);
    updateHistoryLength(newLength);
};

// Toolbar action handlers
const handleTrashClick = async (messageIndex) => {
    const newLength = await chat.handleTrashClick(messageIndex, refreshHistory);
    updateHistoryLength(newLength);
};

const handleRegenerateClick = async (messageIndex) => {
    // Placeholder for regenerate functionality
    console.log('Regenerate clicked for message:', messageIndex);
    // TODO: Implement regenerate logic
};

const handleEditClick = async (messageIndex) => {
    // Placeholder for edit functionality
    console.log('Edit clicked for message:', messageIndex);
    // TODO: Implement edit logic
};

const handleToolbarAction = (action, messageIndex) => {
    switch (action) {
        case 'trash':
            handleTrashClick(messageIndex);
            break;
        case 'regenerate':
            handleRegenerateClick(messageIndex);
            break;
        case 'edit':
            handleEditClick(messageIndex);
            break;
        default:
            console.warn('Unknown toolbar action:', action);
    }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-collapsed');
    }
    
    // Chat container click delegation for toolbar buttons
    chatContainer?.addEventListener('click', (e) => {
        if (e.target.classList.contains('toolbar-btn')) {
            e.preventDefault();
            e.stopPropagation();
            
            const action = e.target.dataset.action;
            const messageIndex = parseInt(e.target.dataset.messageIndex);
            
            if (!isNaN(messageIndex) && action) {
                // Only allow trash action for now, others are placeholders
                if (action === 'trash') {
                    handleToolbarAction(action, messageIndex);
                } else {
                    console.log(`${action} functionality coming soon!`);
                }
            } else {
                console.error('Invalid toolbar button data:', e.target.dataset);
            }
        }
    });
    
    // Initialize
    await refreshHistory();
    setProcessing(false); // Start auto-refresh
});

// Form events
chatForm.addEventListener('submit', (e) => e.preventDefault());
promptInput.addEventListener('keydown', handleTextareaKeydown);
promptInput.addEventListener('input', handleTextareaInput);
sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleSendClick();
});

// Control button events
refreshBtn.addEventListener('click', refreshHistory);
resetBtn.addEventListener('click', handleResetClick);
sidebarToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
});