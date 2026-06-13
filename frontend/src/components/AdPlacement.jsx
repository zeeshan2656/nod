import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function AdPlacement({ placement, type, code }) {
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

        // Clear any global window states set by this ad key (e.g. Adsterra keys)
        const srcAttr = oldScript.getAttribute('src');
        if (srcAttr) {
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

        // Copy inline script content
        newScript.textContent = oldScript.textContent;

        // Append script to run it
        el.appendChild(newScript);
      });
    } catch (err) {
      console.error(`Failed executing scripts for ad placement [${placement}]:`, err);
      el.innerHTML = adCode;
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
