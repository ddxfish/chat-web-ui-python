// static/chat.js

import * as ui from './ui.js';
import * as api from './api.js';

// State to prevent concurrent operations
let isRegenerating = false;

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
            const newLength = await refreshCallback();
            // FIX: Force toolbar index update after deletion
            ui.forceUpdateToolbarIndexes();
            return newLength;
        }
        return null;
    }, 'delete messages');
};

export const handleEditMessage = async (messageIndex, newContent, role, refreshCallback) => {
    return executeWithErrorHandling(async () => {
        await api.updateMessage(messageIndex, newContent);
        const newLength = await refreshCallback();
        // FIX: Force toolbar index update after editing
        ui.forceUpdateToolbarIndexes();
        return newLength;
    }, 'edit message');
};

const attemptStreaming = async (prompt, onChunk, onComplete, onError, isRegenerate = false) => {
    let streamingStarted = false;
    let streamingSucceeded = false;

    await api.postChatMessageStream(
        prompt,
        (chunk) => {
            if (!streamingStarted) {
                if (!isRegenerate) {
                    ui.addUserMessage(prompt);
                }
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
                if (!isRegenerate) {
                    const lastUserMessage = document.querySelector('.message.user:last-of-type');
                    if (lastUserMessage) lastUserMessage.remove();
                }
            }
            await onError(error);
        }
    );

    return { streamingStarted, streamingSucceeded };
};

const fallbackToNonStreaming = async (prompt) => {
    await api.postChatMessage(prompt);
    // FIX: Update toolbar indexes after non-streaming operation
    ui.forceUpdateToolbarIndexes();
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
            },
            false // isRegenerate flag
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

export const handleRegenerateMessage = async (messageIndex, refreshCallback) => {
    // FIX: Prevent concurrent regenerate operations
    if (isRegenerating) {
        console.log('Regeneration already in progress, ignoring click');
        return null;
    }
    
    isRegenerating = true;
    const startTime = Date.now();
    console.log(`=== REGENERATION START ${startTime} ===`);
    
    try {
        console.log(`[${Date.now() - startTime}ms] Getting current history...`);
        const history = await api.fetchHistory();
        console.log(`[${Date.now() - startTime}ms] Got history, length: ${history.length}`);
        
        if (!history[messageIndex]) {
            throw new Error('Invalid message index');
        }
        
        const currentMessage = history[messageIndex];
        let userPrompt;
        let deleteFromIndex;
        
        if (currentMessage.role === 'assistant') {
            const userMessageIndex = messageIndex - 1;
            if (userMessageIndex < 0 || history[userMessageIndex].role !== 'user') {
                throw new Error('No user message found to regenerate from');
            }
            userPrompt = history[userMessageIndex].content;
            deleteFromIndex = userMessageIndex;
        } else if (currentMessage.role === 'user') {
            userPrompt = currentMessage.content;
            deleteFromIndex = messageIndex;
        } else {
            throw new Error('Can only regenerate user or assistant messages');
        }
        
        const messagesToDelete = history.length - deleteFromIndex;
        console.log(`[${Date.now() - startTime}ms] Regenerating: deleting ${messagesToDelete} messages from index ${deleteFromIndex}`);
        
        // Delete messages and refresh immediately
        await api.removeLastMessages(messagesToDelete);
        await refreshCallback();
        console.log(`[${Date.now() - startTime}ms] Messages deleted and UI refreshed`);
        
        // CRITICAL FIX: Clear the regenerating flag right after the streaming setup
        // but before the potentially slow streaming completes
        let streamingSetupComplete = false;
        
        // Re-send the user message
        await attemptStreaming(
            userPrompt,
            ui.appendToStreamingMessage,
            () => {
                console.log(`[${Date.now() - startTime}ms] Regeneration streaming completed`);
            },
            async (error) => {
                console.log(`[${Date.now() - startTime}ms] Regenerate streaming failed, using fallback`);
                await fallbackToNonStreaming(userPrompt);
            },
            false
        );
        
        // CRITICAL FIX: Clear flag immediately after streaming attempt is set up
        // Don't wait for the long cleanup process
        isRegenerating = false;
        console.log(`[${Date.now() - startTime}ms] === REGENERATION FLAG CLEARED - READY FOR NEXT ===`);
        
        // SIMPLIFIED CLEANUP: Make this optional and non-blocking
        // Schedule cleanup to happen in background without blocking next regeneration
        setTimeout(async () => {
            try {
                console.log(`[${Date.now() - startTime}ms] Background cleanup starting...`);
                ui.forceUpdateToolbarIndexes();
                console.log(`[${Date.now() - startTime}ms] Background cleanup completed`);
            } catch (err) {
                console.warn(`[${Date.now() - startTime}ms] Background cleanup failed:`, err);
            }
        }, 100); // Small delay to ensure UI is ready
        
    } catch (error) {
        console.error(`[${Date.now() - startTime}ms] Regeneration error:`, error);
        ui.renderError(`Failed to regenerate message. ${error.message}`);
        // Clear flag on error
        isRegenerating = false;
    }
    
    // No finally block needed - flag is cleared immediately after streaming setup
    console.log(`[${Date.now() - startTime}ms] === REGENERATION FUNCTION COMPLETE ===`);
};

export const handleResetChat = async (refreshCallback) => {
    if (!confirm('Are you sure you want to reset the chat?')) return null;
    
    return executeWithErrorHandling(async () => {
        await api.postReset();
        const newLength = await refreshCallback();
        // FIX: Force toolbar index update after reset
        ui.forceUpdateToolbarIndexes();
        return newLength;
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