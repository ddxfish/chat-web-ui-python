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

export const fetchHistory = () => fetchWithHandling('/api/history');

export const postChatMessage = (prompt) => fetchWithHandling('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt })
});

export const postChatMessageStream = async (prompt, onChunk, onComplete, onError) => {
    try {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: prompt })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.error) {
                            onError(new Error(data.error));
                            return;
                        }
                        
                        if (data.chunk) {
                            onChunk(data.chunk);
                        }
                        
                        if (data.done) {
                            onComplete();
                            return;
                        }
                    } catch (e) {
                        // Skip invalid JSON
                    }
                }
            }
        }
    } catch (error) {
        onError(error);
    }
};

export const postReset = () => fetchWithHandling('/api/reset', { method: 'POST' });

export const fetchApiHealth = () => fetchWithHandling('/api/health');

export const removeLastMessages = async (count) => {
    return await fetchWithHandling('/api/history/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
    });
};