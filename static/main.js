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
const newSessionBtn = document.getElementById('new-session-btn');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const chatContainer = document.getElementById('chat-container');
const sessionsList = document.getElementById('sessions-list');
const sessionItemTemplate = document.getElementById('session-item-template');

// State
let lastKnownHistoryLength = 0;
let isProcessing = false;
let autoRefreshInterval = null;
let currentSessionId = null;
let sessions = [];

// Auto-naming refresh tracking
let namingRefreshScheduled = false;

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

const refreshSessions = async () => {
    try {
        const data = await api.fetchSessions();
        sessions = data.sessions || [];
        currentSessionId = data.active_session;
        renderSessionsList();
        updateUIState();
        console.log('Sessions refreshed');
    } catch (error) {
        console.error('Failed to refresh sessions:', error);
    }
};

const scheduleNamingRefresh = () => {
    if (namingRefreshScheduled) return;
    
    namingRefreshScheduled = true;
    console.log('Scheduling session name refresh in 3 seconds...');
    
    setTimeout(async () => {
        console.log('Auto-refreshing sessions for naming update');
        await refreshSessions();
        namingRefreshScheduled = false;
    }, 3000); // Wait 3 seconds for AI naming to complete
};

const updateUIState = () => {
    // Enable/disable chat input based on active session
    const hasActiveSession = currentSessionId !== null;
    promptInput.disabled = !hasActiveSession;
    sendBtn.disabled = !hasActiveSession;
    resetBtn.disabled = !hasActiveSession;
    
    if (!hasActiveSession) {
        promptInput.placeholder = "Create a new chat to start messaging...";
        chatContainer.innerHTML = '<div style="text-align: center; color: #999; margin-top: 2rem;">No active chat. Create a new one to get started!</div>';
    } else {
        promptInput.placeholder = "Type your message...";
    }
};

const renderSessionsList = () => {
    sessionsList.innerHTML = '';
    
    sessions.forEach(session => {
        const sessionClone = sessionItemTemplate.content.cloneNode(true);
        const sessionItem = sessionClone.querySelector('.session-item');
        const sessionName = sessionClone.querySelector('.session-name');
        const sessionMeta = sessionClone.querySelector('.session-meta');
        const deleteBtn = sessionClone.querySelector('.session-delete-btn');
        
        sessionItem.dataset.sessionId = session.id;
        
        // Display name: replace underscores with spaces for UI display
        const displayName = session.name.replace(/_/g, ' ');
        sessionName.textContent = displayName;
        
        // Format meta info
        const messageCount = session.message_count;
        const lastActive = new Date(session.last_active);
        const now = new Date();
        const diffMs = now - lastActive;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        let timeAgo;
        if (diffMins < 1) timeAgo = 'now';
        else if (diffMins < 60) timeAgo = `${diffMins}m`;
        else if (diffHours < 24) timeAgo = `${diffHours}h`;
        else timeAgo = `${diffDays}d`;
        
        sessionMeta.innerHTML = `<span>${messageCount} msgs</span><span>${timeAgo}</span>`;
        
        // Mark active session
        if (session.id === currentSessionId) {
            sessionItem.classList.add('active');
        }
        
        // Session click handler
        sessionItem.addEventListener('click', (e) => {
            if (e.target === deleteBtn) return; // Don't switch when deleting
            handleSessionSwitch(session.id);
        });
        
        // Delete button handler
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleSessionDelete(session.id);
        });
        
        sessionsList.appendChild(sessionClone);
    });
};

const handleSessionSwitch = async (sessionId) => {
    if (sessionId === currentSessionId || isProcessing) return;
    
    try {
        await api.activateSession(sessionId);
        currentSessionId = sessionId;
        lastKnownHistoryLength = 0; // Reset history length for new session
        await refreshHistory();
        await refreshSessions(); // Update active state in UI
        console.log(`Switched to session: ${sessionId}`);
    } catch (error) {
        console.error('Failed to switch session:', error);
        ui.renderError(`Failed to switch to session: ${error.message}`);
    }
};

const handleSessionDelete = async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    const sessionName = session ? session.name.replace(/_/g, ' ') : sessionId;
    
    if (!confirm(`Delete chat "${sessionName}"?`)) return;
    
    try {
        await api.deleteSession(sessionId);
        
        // If we deleted the active session, just clear the current state
        // DON'T auto-create a new session
        if (sessionId === currentSessionId) {
            currentSessionId = null;
            lastKnownHistoryLength = 0;
            chatContainer.innerHTML = '';
        }
        
        await refreshSessions(); // This will update the UI state properly
        console.log(`Deleted session: ${sessionId}`);
    } catch (error) {
        console.error('Failed to delete session:', error);
        ui.renderError(`Failed to delete session: ${error.message}`);
    }
};

const handleNewSession = async () => {
    if (isProcessing) return;
    
    try {
        const result = await api.createSession();
        currentSessionId = result.session_id;
        lastKnownHistoryLength = 0;
        
        // Clear chat container and refresh everything
        chatContainer.innerHTML = '';
        await refreshSessions();
        await refreshHistory();
        
        // Focus on input
        promptInput.focus();
        
        console.log(`Created new session: ${currentSessionId}`);
    } catch (error) {
        console.error('Failed to create new session:', error);
        ui.renderError(`Failed to create new session: ${error.message}`);
    }
};

// Event Handlers
const handleTextareaInput = () => {
    promptInput.parentElement.dataset.replicatedValue = promptInput.value;
};

const handleTextareaKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !isProcessing && currentSessionId) {
        event.preventDefault();
        handleSendClick();
    }
};

const handleSendClick = async () => {
    if (isProcessing || !promptInput.value.trim() || !currentSessionId) return;
    
    // Check if this is the first message in a new session
    const isFirstMessage = lastKnownHistoryLength === 0;
    console.log(`Sending message - isFirstMessage: ${isFirstMessage}, lastKnownHistoryLength: ${lastKnownHistoryLength}`);
    
    const result = await chat.handleSendMessage(promptInput, sendBtn, setProcessing, refreshHistory);
    
    if (result?.streaming) {
        updateHistoryLength(lastKnownHistoryLength + 2);
        console.log(`Streaming result - new length: ${lastKnownHistoryLength + 2}`);
        
        // Always schedule refresh for sessions with 2 messages (first exchange)
        setTimeout(async () => {
            console.log('Checking if we need to refresh for naming...');
            const currentHistory = await api.fetchHistory();
            console.log(`Current history length: ${currentHistory.length}`);
            
            if (currentHistory.length === 2) {
                console.log('First exchange detected, refreshing sessions for naming update in 3 seconds...');
                setTimeout(async () => {
                    console.log('Auto-refreshing sessions for naming update');
                    await refreshSessions();
                }, 3000);
            }
        }, 500);
        
        // Refresh sessions to update message count
        setTimeout(refreshSessions, 1000);
    } else if (result?.newLength !== undefined) {
        updateHistoryLength(result.newLength);
        console.log(`Non-streaming result - new length: ${result.newLength}`);
        
        // Always schedule refresh for sessions with 2 messages (first exchange)
        setTimeout(async () => {
            console.log('Checking if we need to refresh for naming...');
            const currentHistory = await api.fetchHistory();
            console.log(`Current history length: ${currentHistory.length}`);
            
            if (currentHistory.length === 2) {
                console.log('First exchange detected, refreshing sessions for naming update in 3 seconds...');
                setTimeout(async () => {
                    console.log('Auto-refreshing sessions for naming update');
                    await refreshSessions();
                }, 3000);
            }
        }, 500);
        
        setTimeout(refreshSessions, 500);
    }
};

const handleResetClick = async () => {
    if (!currentSessionId) return;
    
    const newLength = await chat.handleResetChat(refreshHistory);
    updateHistoryLength(newLength);
    setTimeout(refreshSessions, 500);
};

const handleAutoRefresh = async () => {
    if (isProcessing || ui.isCurrentlyEditing() || !currentSessionId) return;
    
    const newLength = await chat.autoRefreshChat(isProcessing, lastKnownHistoryLength);
    const lengthChanged = newLength !== lastKnownHistoryLength;
    updateHistoryLength(newLength);
    
    // Refresh sessions less frequently
    if (lengthChanged) {
        setTimeout(refreshSessions, 500);
    }
};

// Toolbar action handlers
const handleTrashClick = async (messageIndex) => {
    if (!currentSessionId) return;
    
    const newLength = await chat.handleTrashClick(messageIndex, refreshHistory);
    updateHistoryLength(newLength);
    setTimeout(refreshSessions, 500);
};

const handleRegenerateClick = async (messageIndex) => {
    if (!currentSessionId) return;
    
    const newLength = await chat.handleRegenerateMessage(messageIndex, refreshHistory);
    updateHistoryLength(newLength);
    setTimeout(refreshSessions, 1000);
};

const handleEditClick = async (messageIndex) => {
    if (ui.isCurrentlyEditing() || !currentSessionId) {
        console.log('Already editing a message or no active session');
        return;
    }
    
    const allMessages = chatContainer.querySelectorAll('.message');
    const messageElement = allMessages[messageIndex];
    
    if (!messageElement) {
        console.error('Message element not found for index:', messageIndex);
        return;
    }
    
    try {
        const history = await api.fetchHistory();
        const message = history[messageIndex];
        
        if (!message) {
            console.error('Message not found in history for index:', messageIndex);
            return;
        }
        
        ui.startEditingMessage(messageElement, messageIndex, message.content, message.role);
    } catch (error) {
        console.error('Error starting edit:', error);
    }
};

const handleContinueClick = async (messageIndex) => {
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
    
    // Initialize - DON'T auto-create sessions
    await refreshSessions();
    if (currentSessionId) {
        await refreshHistory();
    }
    setProcessing(false); // Start auto-refresh
});

// Listen for message save events from edit interface
document.addEventListener('messageSave', async (e) => {
    const { messageIndex, newContent, role } = e.detail;
    
    try {
        const newLength = await chat.handleEditMessage(messageIndex, newContent, role, refreshHistory);
        updateHistoryLength(newLength);
        ui.finishEditingMessage(true);
        setTimeout(refreshSessions, 500);
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
newSessionBtn.addEventListener('click', handleNewSession);
refreshBtn.addEventListener('click', refreshHistory);
resetBtn.addEventListener('click', handleResetClick);
sidebarToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
});