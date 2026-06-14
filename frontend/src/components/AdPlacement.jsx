import React, { useEffect, useState } from 'react';
import api from '../utils/api';

// Memory cache for active ads to optimize client load times and prevent API waterfalls
let clientAdsCache = null;
let clientAdsPromise = null;

// Allow clearing cache from external actions (e.g. admin settings page)
window.clearAdCache = () => {
  clientAdsCache = null;
  clientAdsPromise = null;
};

// Export pre-fetch / cache resolver
export async function getCachedAds() {
  if (clientAdsCache) return clientAdsCache;
  if (!clientAdsPromise) {
    clientAdsPromise = api.get('/ads').then((response) => {
      clientAdsCache = response.data || {};
      return clientAdsCache;
    }).catch((err) => {
      clientAdsPromise = null; // Clear on error to allow retries
      throw err;
    });
  }
  return clientAdsPromise;
}

// Validate that the ad code contains actual executable content and is not a placeholder or comment
export function isValidAdCode(code) {
  if (!code) return false;
  const trimmed = code.trim();
  if (trimmed === '') return false;
  
  // If it's only an HTML comment (e.g. placeholder comments), it's not a running ad
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
    const withoutComments = trimmed.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (withoutComments === '') return false;
  }
  return true;
}

export default function AdPlacement({ placement, type, code, style, className, onAdLoaded, onAdFailed, ...props }) {
  const [adCode, setAdCode] = useState(code || null);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 960);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 960);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (code !== undefined) {
      setAdCode(code);
      return;
    }

    const fetchAds = async () => {
      try {
        const activeAds = await getCachedAds();
        if (activeAds && activeAds[placement]) {
          setAdCode(activeAds[placement]);
        } else {
          setAdCode(null);
        }
      } catch (err) {
        console.error(`Error loading ad placement [${placement}]:`, err);
        setAdCode(null);
      }
    };
    fetchAds();
  }, [placement, code]);

  const handleRef = (el) => {
    if (!el || !adCode) return;
    if (el._lastInjectedCode === adCode) return;
    el._lastInjectedCode = adCode;

    let retryCount = 0;
    const maxRetries = 2;

    const runAdLoadProcess = () => {
      el.innerHTML = '';
      
      let scriptsToLoad = [];
      let scriptsLoadedCount = 0;
      let scriptsFailedCount = 0;
      let resolved = false;

      // Visibility validator
      const verifyAdVisibility = () => {
        if (!el) return false;
        
        // Exclude script tags
        const nonScriptChildren = Array.from(el.querySelectorAll('*')).filter(
          child => child.tagName !== 'SCRIPT'
        );

        if (nonScriptChildren.length === 0 && el.innerText.trim() === '') {
          return false;
        }

        // Verify that at least one DOM element has width/height
        const hasVisibleContent = nonScriptChildren.some(child => {
          const rect = child.getBoundingClientRect();
          return rect.width > 10 && rect.height > 10;
        }) || (el.innerText.trim().length > 10 && el.getBoundingClientRect().width > 10);

        return hasVisibleContent;
      };

      // Periodic check for ad visibility
      let visibilityInterval = setInterval(() => {
        if (verifyAdVisibility()) {
          clearInterval(visibilityInterval);
          clearTimeout(loadTimeout);
          resolved = true;
          if (onAdLoaded) onAdLoaded();
        }
      }, 150);

      // Timeout for attempt
      const loadTimeout = setTimeout(() => {
        clearInterval(visibilityInterval);
        if (resolved) return;

        if (retryCount < maxRetries) {
          retryCount++;
          console.warn(`Ad placement [${placement}] failed visibility check. Retrying attempt ${retryCount}/${maxRetries}...`);
          runAdLoadProcess();
        } else {
          console.error(`Ad placement [${placement}] load failed after maximum retries.`);
          if (onAdFailed) onAdFailed();
        }
      }, 4000); // 4 seconds per attempt

      const checkCompletion = () => {
        if (resolved) return;
        
        const totalScripts = scriptsToLoad.length;
        if (scriptsLoadedCount + scriptsFailedCount >= totalScripts) {
          // Once scripts finish loading, let visibilityInterval verify actual content rendering
        }
      };

      try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = adCode;

        const scriptTags = tempDiv.getElementsByTagName('script');
        const scriptsToInject = [];

        while (scriptTags.length > 0) {
          scriptsToInject.push(scriptTags[0]);
          scriptTags[0].parentNode.removeChild(scriptTags[0]);
        }

        while (tempDiv.firstChild) {
          el.appendChild(tempDiv.firstChild);
        }

        scriptsToInject.forEach((script) => {
          if (script.getAttribute('src')) {
            scriptsToLoad.push(script);
          }
        });

        if (scriptsToInject.length === 0) {
          // If no scripts, verify visibility directly (static ad code)
          return;
        }

        scriptsToInject.forEach((oldScript) => {
          const newScript = document.createElement('script');

          Array.from(oldScript.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
          });

          newScript.textContent = oldScript.textContent;

          const srcAttr = oldScript.getAttribute('src');
          if (srcAttr) {
            newScript.onload = () => {
              scriptsLoadedCount++;
              checkCompletion();
            };
            newScript.onerror = () => {
              scriptsFailedCount++;
              checkCompletion();
            };
          }

          el.appendChild(newScript);

          if (!srcAttr) {
            checkCompletion();
          }
        });
      } catch (err) {
        console.error(`Failed executing scripts for ad placement [${placement}]:`, err);
        clearInterval(visibilityInterval);
        clearTimeout(loadTimeout);
        if (retryCount < maxRetries) {
          retryCount++;
          runAdLoadProcess();
        } else {
          if (onAdFailed) onAdFailed();
        }
      }
    };

    runAdLoadProcess();
  };

  if (!isValidAdCode(adCode)) {
    return null;
  }

  if (placement.includes('desktop') && isMobileScreen) {
    return null;
  }
  if (placement.includes('mobile') && !isMobileScreen) {
    return null;
  }

  return (
    <div className={className || "ad-container-filled"} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', ...style }} {...props}>
      <div ref={handleRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
}
