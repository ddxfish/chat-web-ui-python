// static/chat.js

import * as ui from './ui.js';
import * as api from './api.js';

/**
 * Common error handler for consistent error management
 */
export const handleError = (error, action) => {
    console.error(`Error ${action}:`, error);
    ui.renderError(`Failed to ${action}. ${error.message}`);
};

/**
 * Fetch and render history
 */
export const fetchAndRenderHistory = async (lastKnownHistoryLength) => {
    try {
        const history = await api.fetchHistory();
        const isNewMessage = history.length > lastKnownHistoryLength;
        
        ui.renderHistory(history);

        return { history, newLength: history.length };
    } catch (error) {
        console.error('Error fetching history:', error);
        ui.renderError(`Could not load chat history. ${error.message}`);
        return { history: null, newLength: lastKnownHistoryLength };
    }
};

/**
 * Handle trash icon clicks to delete messages
 */
export const handleTrashClick = async (messageIndex, refreshCallback) => {
    console.log('handleTrashClick called with index:', messageIndex);
    
    try {
        const history = await api.fetchHistory();
        const messagesToDelete = history.length - messageIndex + 1;
        
        console.log(`Total messages: ${history.length}, clicked AI index: ${messageIndex}, will delete: ${messagesToDelete} (including user message)`);
        
        if (messagesToDelete <= 0) {
            console.log('No messages to delete');
            return;
        }

        const confirmed = confirm(`Delete the last ${messagesToDelete} messages (${messagesToDelete/2} pairs)?`);
        console.log('User confirmed:', confirmed);
        
        if (!confirmed) return;
        
        console.log('Calling API to delete messages...');
        await api.removeLastMessages(messagesToDelete);
        
        console.log('API call successful, refreshing chat...');
        const result = await fetchAndRenderHistory(false);
        
        console.log(`Successfully deleted ${messagesToDelete} messages`);
        return result.newLength;
        
    } catch (error) {
        console.error('Error deleting messages:', error);
        ui.renderError(`Failed to delete messages: ${error.message}`);
        return null;
    }
};

/**
 * Handle sending chat messages
 */
export const handleSendMessage = async (promptInput, sendBtn, setProcessingCallback, refreshCallback) => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    
    setProcessingCallback(true);
    promptInput.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    promptInput.dispatchEvent(new Event('input'));

    ui.showStatusMessage();

    try {
        await api.postChatMessage(prompt);
        const result = await refreshCallback();
        return result;
    } catch (error) {
        handleError(error, 'get response');
        return null;
    } finally {
        ui.removeStatusMessage();
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        promptInput.focus();
        setProcessingCallback(false);
    }
};

/**
 * Handle chat reset
 */
export const handleResetChat = async (refreshCallback) => {
    if (!confirm('Are you sure you want to reset the chat?')) return null;
    try {
        await api.postReset();
        const result = await fetchAndRenderHistory(0);
        return result.newLength;
    } catch (error) {
        handleError(error, 'reset chat');
        return null;
    }
};

/**
 * Auto-refresh chat for external updates
 */
export const autoRefreshChat = async (isProcessing, lastKnownHistoryLength) => {
    if (isProcessing) return lastKnownHistoryLength;
    try {
        const history = await api.fetchHistory();
        if (history.length > lastKnownHistoryLength) {
            console.log('New message detected from external source, refreshing UI...');
            const result = await fetchAndRenderHistory(lastKnownHistoryLength);
            return result.newLength;
        }
        return lastKnownHistoryLength;
    } catch (error) { 
        /* Fail silently on background refresh */ 
        return lastKnownHistoryLength;
    }
};