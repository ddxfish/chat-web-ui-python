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
        const messagesToDelete = history.length - messageIndex;
        
        console.log(`Total messages: ${history.length}, clicked AI index: ${messageIndex}, will delete: ${messagesToDelete}`);
        
        if (messagesToDelete <= 0) {
            console.log('No messages to delete');
            return;
        }

        const messagePairs = Math.ceil(messagesToDelete / 2);
        const confirmed = confirm(`Delete the last ${messagesToDelete} messages (${messagePairs} pairs)?`);
        console.log('User confirmed:', confirmed);
        
        if (!confirmed) return;
        
        console.log('Calling API to delete messages...');
        await api.removeLastMessages(messagesToDelete);
        
        console.log('API call successful, refreshing chat...');
        const result = await refreshCallback();
        
        console.log(`Successfully deleted ${messagesToDelete} messages`);
        return result;
        
    } catch (error) {
        console.error('Error deleting messages:', error);
        ui.renderError(`Failed to delete messages: ${error.message}`);
        return null;
    }
};

/**
 * Handle sending chat messages with streaming support
 */
export const handleSendMessage = async (promptInput, sendBtn, setProcessingCallback, refreshCallback) => {
    const prompt = promptInput.value.trim();
    if (!prompt) return { streaming: false, added: 0 };
    
    setProcessingCallback(true);
    promptInput.value = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    promptInput.dispatchEvent(new Event('input'));

    console.log("=== SENDING MESSAGE ===");
    console.log("Prompt:", prompt);

    let streamingStarted = false;
    let streamingSucceeded = false;

    try {
        console.log("Attempting streaming...");
        
        await api.postChatMessageStream(
            prompt,
            // onChunk - first chunk means streaming works
            (chunk) => {
                if (!streamingStarted) {
                    console.log("First chunk received - streaming is working!");
                    // Add user message to UI since streaming is working
                    ui.addUserMessage(prompt);
                    ui.startStreamingMessage();
                    streamingStarted = true;
                }
                ui.appendToStreamingMessage(chunk);
            },
            // onComplete  
            async () => {
                console.log("Streaming completed successfully");
                if (streamingStarted) {
                    ui.finishStreamingMessage();
                    streamingSucceeded = true;
                }
            },
            // onError - streaming failed
            async (error) => {
                console.log('=== STREAMING FAILED ===');
                console.log('Error:', error);
                console.log('Streaming started?', streamingStarted);
                
                if (streamingStarted) {
                    // Streaming started but failed mid-way - clean up UI
                    console.log("Cleaning up partial streaming message");
                    ui.cancelStreamingMessage();
                    
                    // Remove the user message we added since we'll re-add via refresh
                    const lastUserMessage = document.querySelector('.message.user:last-of-type');
                    if (lastUserMessage) {
                        console.log("Removing user message due to streaming failure");
                        lastUserMessage.remove();
                    }
                }
                
                // Always try fallback, regardless of whether streaming started
                console.log("=== FALLBACK TO NON-STREAMING ===");
                try {
                    await api.postChatMessage(prompt);
                    console.log("Non-streaming API call succeeded");
                } catch (fallbackError) {
                    console.error("Fallback also failed:", fallbackError);
                    throw fallbackError; // Re-throw to be caught by outer try/catch
                }
            }
        );
        
        if (streamingSucceeded) {
            console.log("=== STREAMING SUCCESS ===");
            return { streaming: true, added: 2 };
        } else {
            // Streaming failed, but fallback succeeded - refresh to show messages
            console.log("=== FALLBACK SUCCESS - REFRESHING ===");
            const newLength = await refreshCallback();
            return { streaming: false, newLength: newLength };
        }
        
    } catch (error) {
        console.error("=== SEND MESSAGE ERROR ===", error);
        
        // Clean up any partial UI state
        if (streamingStarted) {
            ui.cancelStreamingMessage();
            const lastUserMessage = document.querySelector('.message.user:last-of-type');
            if (lastUserMessage) {
                lastUserMessage.remove();
            }
        }
        
        handleError(error, 'get response');
        return { streaming: false, added: 0 };
    } finally {
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
        const result = await refreshCallback();
        return result;
    } catch (error) {
        handleError(error, 'reset chat');
        return null;
    }
};

/**
 * Auto-refresh chat for external updates
 */
export const autoRefreshChat = async (isProcessing, lastKnownHistoryLength) => {
    if (isProcessing) {
        console.log("Skipping auto-refresh: processing in progress");
        return lastKnownHistoryLength;
    }
    
    // Don't refresh if we have an active streaming message
    const streamingMsg = document.getElementById('streaming-message');
    if (streamingMsg) {
        console.log("Skipping auto-refresh: streaming in progress");
        return lastKnownHistoryLength;
    }
    
    try {
        const history = await api.fetchHistory();
        
        // Only refresh if there's a significant change (more than 1 message difference)
        if (history.length > lastKnownHistoryLength + 1) {
            console.log(`Auto-refresh: history length ${history.length} vs known ${lastKnownHistoryLength}`);
            console.log('Significant change detected, refreshing UI...');
            const result = await fetchAndRenderHistory(lastKnownHistoryLength);
            return result.newLength;
        }
        
        return lastKnownHistoryLength;
    } catch (error) { 
        // Fail silently on background refresh
        console.log("Auto-refresh failed silently:", error.message);
        return lastKnownHistoryLength;
    }
};