// LM Chat - Native HTTP Bridge
// Uses Android NativeHttpBridge when available, falls back to fetch()
;(function() {
  const hasBridge = typeof NativeHttpBridge !== 'undefined';

  window.api = {
    // Test if a server is reachable
    testServer: async function(serverUrl) {
      try {
        const r = await fetch(serverUrl + '/api/sessions', { signal: AbortSignal.timeout(3000) });
        return r.ok;
      } catch {
        return false;
      }
    },

    // Generic API fetch
    getJSON: async function(url, timeoutMs) {
      timeoutMs = timeoutMs || 30000;
      if (hasBridge) {
        try {
          const text = NativeHttpBridge.get(url);
          return JSON.parse(text);
        } catch(e) {
          console.warn('Bridge GET failed, falling back:', e);
        }
      }
      const controller = new AbortController();
      const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
      try {
        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return await r.json();
      } catch(e) {
        clearTimeout(timer);
        throw e;
      }
    },

    postJSON: async function(url, data, timeoutMs) {
      timeoutMs = timeoutMs || 30000;
      const body = JSON.stringify(data);
      if (hasBridge) {
        try {
          const text = NativeHttpBridge.post(url, body);
          return JSON.parse(text);
        } catch(e) {
          console.warn('Bridge POST failed, falling back:', e);
        }
      }
      const controller = new AbortController();
      const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        });
        clearTimeout(timer);
        return await r.json();
      } catch(e) {
        clearTimeout(timer);
        throw e;
      }
    },

    deleteReq: async function(url) {
      if (hasBridge) {
        try {
          const text = NativeHttpBridge.delete(url);
          return JSON.parse(text);
        } catch(e) {
          console.warn('Bridge DELETE failed, falling back:', e);
        }
      }
      await fetch(url, { method: 'DELETE' });
    },

    // For file uploads (FormData), must use fetch
    uploadFormData: async function(url, formData) {
      const r = await fetch(url, { method: 'POST', body: formData });
      return r;
    }
  };
})();
