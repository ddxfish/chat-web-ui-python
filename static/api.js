// static/api.js

const fetchWithHandling = async (url, options = {}, timeoutMs = 60000) => {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = options.signal || timeoutController.signal;
    
    try {
        const response = await fetch(url, { ...options, signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* ignore */ }
            throw new Error(errorMsg);
        }
        
        const contentType = response.headers.get("content-type");
        
        if (contentType?.includes("application/json")) {
            return await response.json();
        }
        
        return response;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error(options.signal?.aborted ? 'Request cancelled' : `Request timeout after ${timeoutMs/1000}s`);
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network connection failed');
        }
        throw error;
    }
};

// Session Management API
export const fetchSessions = () => fetchWithHandling('/api/sessions');

export const createSession = (systemPrompt = null) => fetchWithHandling('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_prompt: systemPrompt })
});

export const activateSession = (sessionId) => fetchWithHandling(`/api/sessions/${sessionId}/activate`, {
    method: 'POST'
});

export const deleteSession = (sessionId) => fetchWithHandling(`/api/sessions/${sessionId}`, {
    method: 'DELETE'
});

export const updateSessionName = (sessionId, name) => fetchWithHandling(`/api/sessions/${sessionId}/name`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
});

// Chat API (now session-aware)
export const fetchHistory = () => fetchWithHandling('/api/history');

export const postChatMessage = (prompt) => fetchWithHandling('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt })
});

export const postChatMessageStream = async (prompt, onChunk, onComplete, onError) => {
    console.log("=== BROWSER STREAMING START ===");
    console.log("Prompt:", prompt.substring(0, 100));
    
    try {
        console.log("Making fetch request to /api/chat/stream...");
        
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: prompt })
        });
        
        console.log(`=== FETCH RESPONSE ===`);
        console.log(`Status: ${response.status}`);
        console.log(`OK: ${response.ok}`);
        console.log(`Headers:`, Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            console.log("Response not OK, trying to get error details...");
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // If we can't parse JSON, use the status text
            }
            const error = new Error(errorMessage);
            console.log("Calling onError with:", error.message);
            onError(error);
            return;
        }
        
        console.log("Response OK, getting reader...");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkCount = 0;
        let contentCount = 0;
        let hasReceivedData = false;
        let hasReceivedContent = false;
        
        console.log("Starting to read stream...");
        
        while (true) {
            console.log(`Reading chunk ${chunkCount + 1}...`);
            const { done, value } = await reader.read();
            
            if (done) {
                console.log(`=== STREAM COMPLETE ===`);
                console.log(`Total chunks: ${chunkCount}, Content pieces: ${contentCount}`);
                console.log(`Has received any data: ${hasReceivedData}, Has received content: ${hasReceivedContent}`);
                
                if (!hasReceivedData) {
                    console.log("No data received, calling onError");
                    onError(new Error("Stream ended without any data"));
                    return;
                }
                
                if (!hasReceivedContent) {
                    console.log("No content received, calling onError");
                    onError(new Error("Stream ended without any content"));
                    return;
                }
                
                break;
            }
            
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            if (chunkCount < 5) {  // Log first 5 raw chunks
                console.log(`Raw chunk ${chunkCount + 1}:`, JSON.stringify(chunk));
            }
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    chunkCount++;
                    hasReceivedData = true;
                    
                    try {
                        const dataStr = line.slice(6);
                        const data = JSON.parse(dataStr);
                        
                        if (chunkCount <= 5) {  // Log first 5 parsed data
                            console.log(`Parsed data ${chunkCount}:`, data);
                        }
                        
                        if (data.error) {
                            console.error("=== STREAMING ERROR FROM SERVER ===", data.error);
                            onError(new Error(data.error));
                            return;
                        }
                        
                        if (data.chunk) {
                            contentCount++;
                            hasReceivedContent = true;
                            if (contentCount <= 5) {  // Log first 5 content pieces
                                console.log(`Content ${contentCount}: '${data.chunk}'`);
                            }
                            onChunk(data.chunk);
                        }
                        
                        if (data.done) {
                            console.log("=== RECEIVED DONE SIGNAL ===");
                            onComplete();
                            return;
                        }
                    } catch (e) {
                        console.warn("Failed to parse SSE data:", line, e);
                        // Skip invalid JSON but don't fail the stream
                    }
                }
            }
        }
        
        // If we get here without receiving the done signal, it might still be successful
        // if we received content, but let's call onComplete anyway
        if (hasReceivedContent) {
            console.log("Stream ended naturally after receiving content");
            onComplete();
        } else {
            console.log("Stream ended without content or done signal");
            onError(new Error("Stream ended unexpectedly"));
        }
        
    } catch (error) {
        console.error("=== STREAMING FETCH ERROR ===", error);
        onError(error);
    }
};

export const postReset = () => fetchWithHandling('/api/reset', { method: 'POST' });

export const fetchApiHealth = () => fetchWithHandling('/api/health');

export const updateMessage = async (messageIndex, newContent) => {
    return await fetchWithHandling(`/api/history/messages/${messageIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
    });
};

export const removeLastMessages = async (count) => {
    return await fetchWithHandling('/api/history/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
    });
};