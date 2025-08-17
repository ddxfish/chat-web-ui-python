// static/chat.js

import * as ui from './ui.js';
import * as api from './api.js';

const handleError = (error, action) => {
    console.error(`Error ${action}:`, error);
    ui.renderError(`Failed to ${action}. ${error.message}`);
};

const executeWithErrorHandling = async (asyncFn, action) => {
    try {
        return await asyncFn();
    } catch (error) {
        handleError(error, action);
        return null;
    }
};

export const fetchAndRenderHistory = async (lastKnownHistoryLength) => {
    return executeWithErrorHandling(async () => {
        const history = await api.fetchHistory();
        const isNewMessage = history.length > lastKnownHistoryLength;
        ui.renderHistory(history);
        return { history, newLength: history.length };
    }, 'load chat history') || { history: null, newLength: lastKnownHistoryLength };
};

export const handleTrashClick = async (messageIndex, refreshCallback) => {
    return executeWithErrorHandling(async () => {
        const history = await api.fetchHistory();
        const messagesToDelete = history.length - messageIndex;
        
        if (messagesToDelete <= 0) return null;

        const messagePairs = Math.ceil(messagesToDelete / 2);
        const confirmed = confirm(`Delete the last ${messagesToDelete} messages (${messagePairs} pairs)?`);
        
        if (confirmed) {
            await api.removeLastMessages(messagesToDelete);
            return await refreshCallback();
        }
        return null;
    }, 'delete messages');
};

const attemptStreaming = async (prompt, onChunk, onComplete, onError) => {
    let streamingStarted = false;
    let streamingSucceeded = false;

    await api.postChatMessageStream(
        prompt,
        (chunk) => {
            if (!streamingStarted) {
                ui.addUserMessage(prompt);
                ui.startStreamingMessage();
                streamingStarted = true;
            }
            onChunk(chunk);
        },
        () => {
            if (streamingStarted) {
                ui.finishStreamingMessage();
                streamingSucceeded = true;
            }
            onComplete();
        },
        async (error) => {
            if (streamingStarted) {
                ui.cancelStreamingMessage();
                const lastUserMessage = document.querySelector('.message.user:last-of-type');
                if (lastUserMessage) lastUserMessage.remove();
            }
            await onError(error);
        }
    );

    return { streamingStarted, streamingSucceeded };
};

const fallbackToNonStreaming = async (prompt) => {
    await api.postChatMessage(prompt);
};

export const handleSendMessage = async (promptInput, sendBtn, setProcessingCallback, refreshCallback) => {
    const prompt = promptInput.value.trim();
    if (!prompt) return { streaming: false, added: 0 };
    
    // Setup UI
    setProcessingCallback(true);
    promptInput.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    promptInput.dispatchEvent(new Event('input'));

    try {
        const result = await attemptStreaming(
            prompt,
            ui.appendToStreamingMessage,
            () => {},
            async (error) => {
                console.log('Streaming failed, using fallback');
                await fallbackToNonStreaming(prompt);
            }
        );
        
        if (result.streamingSucceeded) {
            return { streaming: true, added: 2 };
        } else {
            const newLength = await refreshCallback();
            return { streaming: false, newLength };
        }
        
    } catch (error) {
        handleError(error, 'get response');
        return { streaming: false, added: 0 };
    } finally {
        // Cleanup UI
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        promptInput.focus();
        setProcessingCallback(false);
    }
};

export const handleResetChat = async (refreshCallback) => {
    if (!confirm('Are you sure you want to reset the chat?')) return null;
    
    return executeWithErrorHandling(async () => {
        await api.postReset();
        return await refreshCallback();
    }, 'reset chat');
};

export const autoRefreshChat = async (isProcessing, lastKnownHistoryLength) => {
    if (isProcessing || document.getElementById('streaming-message')) {
        return lastKnownHistoryLength;
    }
    
    try {
        const history = await api.fetchHistory();
        
        if (history.length > lastKnownHistoryLength + 1) {
            console.log(`Auto-refresh: ${lastKnownHistoryLength} -> ${history.length}`);
            const result = await fetchAndRenderHistory(lastKnownHistoryLength);
            return result.newLength;
        }
        
        return lastKnownHistoryLength;
    } catch (error) { 
        console.log("Auto-refresh failed:", error.message);
        return lastKnownHistoryLength;
    }
};