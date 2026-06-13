import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function AdPlacement({ placement, type, code, onAdLoaded, onAdFailed }) {
  const [adCode, setAdCode] = useState(code || null);

  useEffect(() => {
    if (code !== undefined) {
      setAdCode(code);
      return;
    }
    const fetchAds = async () => {
      try {
        const response = await api.get('/ads');
        const activeAds = response.data;
        if (activeAds && activeAds[placement]) {
          setAdCode(activeAds[placement]);
        } else {
          setAdCode(null);
        }
      } catch (err) {
        console.error(`Error loading ad placement [${placement}]:`, err);
      }
    };
    fetchAds();
  }, [placement, code]);

  const handleRef = (el) => {
    if (!el || !adCode) return;
    if (el._lastInjectedCode === adCode) return;
    el._lastInjectedCode = adCode;

    el.innerHTML = '';
    
    // Set up tracking
    let scriptsToLoad = [];
    let scriptsLoadedCount = 0;
    let scriptsFailedCount = 0;
    let resolved = false;

    // Fail-safe timeout (3 seconds)
    const loadTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(`Ad placement [${placement}] load timed out.`);
        if (onAdLoaded) onAdLoaded();
      }
    }, 3000);

    const checkCompletion = () => {
      if (resolved) return;
      
      const totalScripts = scriptsToLoad.length;
      if (scriptsLoadedCount + scriptsFailedCount >= totalScripts) {
        resolved = true;
        clearTimeout(loadTimeout);
        
        if (scriptsFailedCount === totalScripts && totalScripts > 0) {
          // If all scripts failed (e.g. ad blocked)
          console.error(`Ad placement [${placement}] all scripts failed to load.`);
          if (onAdFailed) onAdFailed();
        } else {
          // If at least some scripts loaded successfully, or there were no scripts
          if (onAdLoaded) onAdLoaded();
        }
      }
    };

    try {
      // Parse adCode into DOM nodes using a temporary container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = adCode;

      // Extract script elements
      const scriptTags = tempDiv.getElementsByTagName('script');
      const scriptsToInject = [];

      while (scriptTags.length > 0) {
        scriptsToInject.push(scriptTags[0]);
        scriptTags[0].parentNode.removeChild(scriptTags[0]);
      }

      // Append container markup first so it exists in DOM when script executes
      while (tempDiv.firstChild) {
        el.appendChild(tempDiv.firstChild);
      }

      // Filter external scripts that need loading
      scriptsToInject.forEach((script) => {
        if (script.getAttribute('src')) {
          scriptsToLoad.push(script);
        }
      });

      if (scriptsToInject.length === 0) {
        // No scripts to run at all
        resolved = true;
        clearTimeout(loadTimeout);
        if (onAdLoaded) onAdLoaded();
        return;
      }

      // Programmatically create and load each script
      scriptsToInject.forEach((oldScript) => {
        const newScript = document.createElement('script');

        // Copy attributes & apply cache buster to the src attribute
        Array.from(oldScript.attributes).forEach((attr) => {
          let val = attr.value;
          if (attr.name.toLowerCase() === 'src' && val) {
            // Force reload script by adding a cache-busting timestamp
            val = val + (val.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now();
          }
          newScript.setAttribute(attr.name, val);
        });

        // Copy inline script content
        newScript.textContent = oldScript.textContent;

        const srcAttr = oldScript.getAttribute('src');
        if (srcAttr) {
          // External script
          newScript.onload = () => {
            scriptsLoadedCount++;
            checkCompletion();
          };
          newScript.onerror = () => {
            scriptsFailedCount++;
            checkCompletion();
          };

          // Clear any global window states set by this ad key (e.g. Adsterra keys)
          const match = srcAttr.match(/\/([a-f0-9]{32})\//i);
          if (match && match[1]) {
            const key = match[1];
            delete window[key];
            delete window['_' + key];
            if (window.atOptions) {
              window.atOptions = null;
            }
          }
        }

        // Append script to run it
        el.appendChild(newScript);

        if (!srcAttr) {
          // Inline scripts execute synchronously upon insertion
          checkCompletion();
        }
      });
    } catch (err) {
      console.error(`Failed executing scripts for ad placement [${placement}]:`, err);
      resolved = true;
      clearTimeout(loadTimeout);
      if (onAdFailed) onAdFailed();
    }
  };

  if (!adCode) {
    return null;
  }

  return (
    <div className="ad-container-filled" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div ref={handleRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
}
