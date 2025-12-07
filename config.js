// Auto-detect backend URL based on current hostname and available backend

// Define global variable
var BACKEND_URL;

function detectBackendUrl() {
  const hostname = window.location.hostname;
  // Try local ports if on localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const ports = [8000, 3000];
    let checked = 0;
    return new Promise((resolve) => {
      function tryNext() {
        if (checked >= ports.length) {
          // Fallback to production if none work
          console.log('Local backend not found, falling back to production');
          resolve('https://pythonplaidbackend-production.up.railway.app');
          return;
        }
        const url = `http://${hostname}:${ports[checked]}`;
        console.log(`Checking backend at ${url}...`);
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        fetch(`${url}/health`, { signal: controller.signal }).then(r => {
          clearTimeout(timeoutId);
          if (r.ok) {
            console.log(`Backend found at ${url}`);
            resolve(url);
          } else {
            checked++;
            tryNext();
          }
        }).catch((e) => {
          clearTimeout(timeoutId);
          // console.log(`Failed to connect to ${url}:`, e);
          checked++;
          tryNext();
        });
      }
      tryNext();
    });
  } else {
    // Production
    return Promise.resolve('https://pythonplaidbackend-production.up.railway.app');
  }
}

// Usage: All scripts should wait for this promise to resolve before making API calls
window.BACKEND_URL_PROMISE = detectBackendUrl().then(url => {
  BACKEND_URL = url;
  window.BACKEND_URL = url;
  console.log(`Backend URL detected: ${url}`);
  return url;
});
