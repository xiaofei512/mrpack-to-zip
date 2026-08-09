(() => {
  const currentScript = document.currentScript;
  const configScript =
    currentScript instanceof HTMLScriptElement
      ? currentScript
      : document.querySelector('script[data-analytics-consent]');

  if (!(configScript instanceof HTMLScriptElement)) {
    return;
  }

  const enabled = configScript.dataset.analyticsEnabled === 'true';
  const analyticsEnvironment = configScript.dataset.analyticsEnv ?? '';
  const measurementId = configScript.dataset.gaMeasurementId ?? '';
  const clarityProjectId = configScript.dataset.clarityProjectId ?? '';
  const validMeasurementId = /^G-[A-Z0-9]+$/i.test(measurementId) ? measurementId : '';
  const validClarityProjectId = /^[A-Za-z0-9_-]{6,64}$/.test(clarityProjectId)
    ? clarityProjectId
    : '';

  if (analyticsEnvironment !== 'production' || !enabled || (!validMeasurementId && !validClarityProjectId)) {
    return;
  }

  const consentKey = 'mrpack_analytics_consent_v1';
  const consent = () => {
    try {
      return window.localStorage.getItem(consentKey);
    } catch {
      return null;
    }
  };

  const remember = (value) => {
    try {
      window.localStorage.setItem(consentKey, value);
    } catch {
      // Analytics remains opt-in even when browser storage is unavailable.
    }
  };

  const removeCookie = (name) => {
    const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `${name}=; ${expires}; path=/`;
    if (window.location.hostname) {
      document.cookie = `${name}=; ${expires}; path=/; domain=${window.location.hostname}`;
    }
  };

  const clearAnalyticsCookies = () => {
    ['_ga', '_ga_' + validMeasurementId.slice(2).replace(/[^A-Z0-9]/gi, '_'), '_clck', '_clsk']
      .filter(Boolean)
      .forEach(removeCookie);
  };

  const setGoogleAnalyticsDisabled = (disabled) => {
    if (validMeasurementId) {
      window[`ga-disable-${validMeasurementId}`] = disabled;
    }
  };

  const loadExternalScript = (src, id) => {
    if (document.querySelector(`script[data-analytics-loader="${id}"]`)) {
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.dataset.analyticsLoader = id;
    document.head.append(script);
  };

  const loadGoogleAnalytics = () => {
    if (!validMeasurementId || window.gtag) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args) => window.dataLayer.push(args);
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'granted',
      security_storage: 'granted',
      wait_for_update: 500,
    });
    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    window.gtag('js', new Date());
    window.gtag('config', validMeasurementId);
    loadExternalScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validMeasurementId)}`,
      'google-analytics',
    );
  };

  const loadClarity = () => {
    if (!validClarityProjectId || window.clarity) {
      return;
    }

    window.clarity = (...args) => {
      window.clarity.q = window.clarity.q || [];
      window.clarity.q.push(args);
    };
    window.clarity('consentv2', {
      ad_Storage: 'denied',
      analytics_Storage: 'granted',
    });
    loadExternalScript(
      `https://www.clarity.ms/tag/${encodeURIComponent(validClarityProjectId)}`,
      'microsoft-clarity',
    );
  };

  const banner = document.createElement('aside');
  banner.className = 'analytics-consent';
  banner.setAttribute('aria-labelledby', 'analytics-consent-title');
  banner.innerHTML = `
    <div class="analytics-consent__copy">
      <strong id="analytics-consent-title">Optional analytics</strong>
      <p>Allow optional Google Analytics and Microsoft Clarity measurements to help improve this tool. GA4 events omit conversion files and filenames; Clarity may observe visible page content after consent.</p>
    </div>
    <div class="analytics-consent__actions">
      <button type="button" data-analytics-allow>Allow analytics</button>
      <button type="button" class="analytics-consent__secondary" data-analytics-decline>Decline</button>
      <button type="button" class="analytics-consent__text" data-analytics-close hidden>Close</button>
    </div>
  `;

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'analytics-settings';
  settings.textContent = 'Analytics settings';
  settings.hidden = true;
  settings.setAttribute('aria-expanded', 'false');

  document.body.append(banner, settings);

  const allowButton = banner.querySelector('[data-analytics-allow]');
  const declineButton = banner.querySelector('[data-analytics-decline]');
  const closeButton = banner.querySelector('[data-analytics-close]');

  const hideBanner = () => {
    banner.hidden = true;
    settings.hidden = false;
    settings.setAttribute('aria-expanded', 'false');
  };

  const showBanner = (settingsMode = false) => {
    banner.hidden = false;
    settings.hidden = true;
    banner.dataset.settingsMode = settingsMode ? 'true' : 'false';
    if (closeButton) {
      closeButton.hidden = !settingsMode;
    }
  };

  const grantConsent = () => {
    remember('granted');
    setGoogleAnalyticsDisabled(false);
    loadGoogleAnalytics();
    loadClarity();
    hideBanner();
  };

  const declineConsent = (reload = false) => {
    remember('denied');
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied',
      });
    }
    if (typeof window.clarity === 'function') {
      window.clarity('consentv2', {
        ad_Storage: 'denied',
        analytics_Storage: 'denied',
      });
    }
    setGoogleAnalyticsDisabled(true);
    clearAnalyticsCookies();
    hideBanner();
    if (reload) {
      window.location.reload();
    }
  };

  allowButton?.addEventListener('click', grantConsent);
  declineButton?.addEventListener('click', () => declineConsent(Boolean(window.gtag || window.clarity)));
  closeButton?.addEventListener('click', hideBanner);
  settings.addEventListener('click', () => showBanner(true));

  if (consent() === 'granted') {
    grantConsent();
  } else if (consent() === 'denied') {
    declineConsent();
  } else {
    showBanner();
  }
})();
