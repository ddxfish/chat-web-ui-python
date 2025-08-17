// static/main.js

import * as chat from './chat.js';
import * as ui from './ui.js';
import * as api from './api.js';

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
    if (isProcessing || ui.isCurrentlyEditing()) return;
    
    const newLength = await chat.autoRefreshChat(isProcessing, lastKnownHistoryLength);
    updateHistoryLength(newLength);
};

// Toolbar action handlers
const handleTrashClick = async (messageIndex) => {
    const newLength = await chat.handleTrashClick(messageIndex, refreshHistory);
    updateHistoryLength(newLength);
};

const handleRegenerateClick = async (messageIndex) => {
    const newLength = await chat.handleRegenerateMessage(messageIndex, refreshHistory);
    updateHistoryLength(newLength);
};

const handleEditClick = async (messageIndex) => {
    // Check if already editing
    if (ui.isCurrentlyEditing()) {
        console.log('Already editing a message');
        return;
    }
    
    // Get the message element
    const allMessages = chatContainer.querySelectorAll('.message');
    const messageElement = allMessages[messageIndex];
    
    if (!messageElement) {
        console.error('Message element not found for index:', messageIndex);
        return;
    }
    
    // Get current message data from history (fetch only, don't render!)
    try {
        const history = await api.fetchHistory();  // Just fetch, don't render!
        const message = history[messageIndex];
        
        if (!message) {
            console.error('Message not found in history for index:', messageIndex);
            return;
        }
        
        // Start editing
        ui.startEditingMessage(messageElement, messageIndex, message.content, message.role);
        
    } catch (error) {
        console.error('Error starting edit:', error);
    }
};

const handleContinueClick = async (messageIndex) => {
    // Continue button does the same as regenerate - it regenerates from the user message
    console.log('Continue button clicked for message index:', messageIndex);
    await handleRegenerateClick(messageIndex);
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
    
    // Chat container click delegation for toolbar buttons AND continue button
    chatContainer?.addEventListener('click', (e) => {
        // Handle continue button
        if (e.target.classList.contains('continue-btn') || e.target.id === 'continue-btn') {
            e.preventDefault();
            e.stopPropagation();
            
            const messageIndex = parseInt(e.target.dataset.messageIndex);
            if (!isNaN(messageIndex)) {
                handleContinueClick(messageIndex);
            } else {
                console.error('Invalid continue button message index:', e.target.dataset);
            }
            return;
        }
        
        // Handle toolbar buttons
        if (e.target.classList.contains('toolbar-btn')) {
            e.preventDefault();
            e.stopPropagation();
            
            const action = e.target.dataset.action;
            const messageIndex = parseInt(e.target.dataset.messageIndex);
            
            if (!isNaN(messageIndex) && action) {
                // Allow trash, regenerate, and edit actions
                if (action === 'trash' || action === 'regenerate' || action === 'edit') {
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

// Listen for message save events from edit interface
document.addEventListener('messageSave', async (e) => {
    const { messageIndex, newContent, role } = e.detail;
    
    try {
        const newLength = await chat.handleEditMessage(messageIndex, newContent, role, refreshHistory);
        updateHistoryLength(newLength);
        ui.finishEditingMessage(true);
    } catch (error) {
        console.error('Error saving edited message:', error);
        ui.finishEditingMessage(false);
    }
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