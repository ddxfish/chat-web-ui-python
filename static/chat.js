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
    
    return executeWithErrorHandling(async () => {
        isRegenerating = true;
        
        try {
            // Get current history to validate message
            const history = await api.fetchHistory();
            
            if (!history[messageIndex]) {
                throw new Error('Invalid message index');
            }
            
            const currentMessage = history[messageIndex];
            let userPrompt;
            let deleteFromIndex;
            
            if (currentMessage.role === 'assistant') {
                // Regenerating assistant message - delete from the user message that prompted it
                const userMessageIndex = messageIndex - 1;
                if (userMessageIndex < 0 || history[userMessageIndex].role !== 'user') {
                    throw new Error('No user message found to regenerate from');
                }
                userPrompt = history[userMessageIndex].content;
                deleteFromIndex = userMessageIndex; // Delete user message too to avoid duplicates
            } else if (currentMessage.role === 'user') {
                // Regenerating from user message - delete from this user message
                userPrompt = currentMessage.content;
                deleteFromIndex = messageIndex;
            } else {
                throw new Error('Can only regenerate user or assistant messages');
            }
            
            const messagesToDelete = history.length - deleteFromIndex;
            
            console.log(`Regenerating: deleting ${messagesToDelete} messages from index ${deleteFromIndex}, re-sending: "${userPrompt.substring(0, 50)}..."`);
            
            // Delete from the user message onward (clean slate)
            await api.removeLastMessages(messagesToDelete);
            
            // CRITICAL: Refresh UI immediately to show deletion before regenerating
            await refreshCallback();
            
            // Re-send the user message - backend will add both user + assistant messages cleanly
            let regenerateSucceeded = false;
            
            const result = await attemptStreaming(
                userPrompt,
                ui.appendToStreamingMessage,
                () => {
                    regenerateSucceeded = true;
                },
                async (error) => {
                    console.log('Regenerate streaming failed, using fallback');
                    await fallbackToNonStreaming(userPrompt);
                },
                false // isRegenerate=false so UI shows the user message being added
            );
            
            // Always refresh after regeneration to update indexes and show final result
            const newLength = await refreshCallback();
            
            // FIX: Force toolbar index update after regeneration to ensure buttons work
            ui.forceUpdateToolbarIndexes();
            
            return newLength;
        } finally {
            // FIX: Always clear the regenerating flag
            isRegenerating = false;
        }
        
    }, 'regenerate message');
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