import React, { useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { DB_TABLES } from '../../../constants/db_schema';
import { getTrueISOString, getSyncMetadata } from '../../../lib/time';

export function useDeviceLogging(branchId: string) {
  const didLogSync = React.useRef(false);
  useEffect(() => {
    const ua = navigator.userAgent;

    // Browser
    let browser = 'Unknown', browserVersion = '';
    if (/Edg\//.test(ua)) { browser = 'Edge'; browserVersion = (ua.match(/Edg\/([\d.]+)/) || [])[1] || ''; }
    else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) { browser = 'Chrome'; browserVersion = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || ''; }
    else if (/Firefox\//.test(ua)) { browser = 'Firefox'; browserVersion = (ua.match(/Firefox\/([\d.]+)/) || [])[1] || ''; }
    else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) { browser = 'Safari'; browserVersion = (ua.match(/Version\/([\d.]+)/) || [])[1] || ''; }
    else if (/OPR\/|Opera\//.test(ua)) { browser = 'Opera'; browserVersion = (ua.match(/(?:OPR|Opera)\/([\d.]+)/) || [])[1] || ''; }

    // OS
    let os = 'Unknown';
    if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
    else if (/Windows NT/.test(ua)) os = 'Windows';
    else if (/iPhone|iPad|iPod/.test(ua)) os = /iPhone/.test(ua) ? 'iOS (iPhone)' : /iPad/.test(ua) ? 'iOS (iPad)' : 'iOS';
    else if (/Android/.test(ua)) os = `Android ${(ua.match(/Android ([\d.]+)/) || [])[1] || ''}`.trim();
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    // Device type
    let deviceType = 'Desktop';
    if (/iPhone|Android.*Mobile|Windows Phone/.test(ua)) deviceType = 'Mobile';
    else if (/iPad|Android(?!.*Mobile)/.test(ua)) deviceType = 'Tablet';

    // Device model
    let deviceModel = 'Unknown';
    if (/iPhone/.test(ua)) deviceModel = 'iPhone';
    else if (/iPad/.test(ua)) deviceModel = 'iPad';
    else if (/Android/.test(ua)) {
      const m = ua.match(/Android[\s\d.]+;\s*([^)]+)\)/);
      if (m) deviceModel = m[1].trim();
    } else if (/Macintosh/.test(ua)) deviceModel = 'Mac';
    else if (/Windows NT/.test(ua)) deviceModel = 'Windows PC';

    const screen = `${window.screen.width}x${window.screen.height}`;

    const FP_KEY = 'hilot_pos_fp';
    let fingerprintId = localStorage.getItem(FP_KEY);
    if (!fingerprintId) {
      fingerprintId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(FP_KEY, fingerprintId);
    }

    const deviceId = `${branchId}_${browser}_${os}_${screen}`.replace(/\s+/g, '_');
    const now = getTrueISOString();

    const doUpsert = (location: string | null) => {
      supabase.from(DB_TABLES.DEVICE_LOGS)
        .select('first_seen, session_count')
        .eq('device_id', deviceId)
        .maybeSingle()
        .then(({ data: existing }) => {
          const payload: Record<string, any> = {
            device_id: deviceId,
            branch_id: branchId,
            user_agent: ua,
            browser,
            browser_version: browserVersion,
            os,
            device_type: deviceType,
            device_model: deviceModel,
            screen_resolution: screen,
            fingerprint_id: fingerprintId,
            last_seen: now,
            first_seen: existing?.first_seen ?? now,
            session_count: (existing?.session_count ?? 0) + 1,
          };
          if (location) payload.location = location;
          supabase.from(DB_TABLES.DEVICE_LOGS).upsert(payload, { onConflict: 'device_id' }).then(() => {});
        });
    };

    // Log time sync result once per session (ref guard prevents StrictMode double-fire)
    const syncMeta = getSyncMetadata();
    if (syncMeta && !didLogSync.current) {
      didLogSync.current = true;
      supabase.from(DB_TABLES.TIME_SYNC_LOGS).insert({
        branch_id: branchId,
        sync_source: syncMeta.source,
        manila_time: new Date(syncMeta.serverTime).toISOString(),
        device_time: new Date(syncMeta.deviceTime).toISOString(),
        drift_seconds: syncMeta.driftSeconds,
        user_agent: ua,
      }).then(() => {});
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`)
            .then(r => r.json())
            .then(geo => {
              const addr = geo?.address || {};
              const location = [addr.city || addr.town || addr.village || addr.municipality, addr.state, addr.country_code?.toUpperCase()]
                .filter(Boolean).join(', ');
              doUpsert(location || `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
            })
            .catch(() => doUpsert(`${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`));
        },
        () => doUpsert(null),
        { timeout: 8000, maximumAge: 60 * 60 * 1000 }
      );
    } else {
      doUpsert(null);
    }
  }, [branchId]);
}
