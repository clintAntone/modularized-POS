(function () {
  'use strict';

  const SUPABASE_URL      = window.APP_CONFIG.supabaseUrl;
  const SUPABASE_ANON_KEY = window.APP_CONFIG.supabaseAnonKey;
  const HEADERS = {
    apikey:        SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
  };

  let allBranches    = [];
  let activeRegion   = 'All';
  let searchTerm     = '';
  let filterOpenNow  = false;
  let servicesLoaded = false;
  let contactRendered = false;

  // ── Tab switching ──────────────────────────────────────────────────────────
  function switchTab(tab) {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-section').forEach(function (s) {
      s.classList.remove('active');
    });
    var section = document.getElementById('section-' + tab);
    if (section) section.classList.add('active');

    document.getElementById('mobile-menu').classList.remove('open');
    document.getElementById('hamburger').classList.remove('open');

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tab === 'services' && !servicesLoaded)  loadServices();
    if (tab === 'contact'  && !contactRendered) renderContact();
  }

  document.querySelectorAll('[data-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  // ── Hamburger ──────────────────────────────────────────────────────────────
  document.getElementById('hamburger').addEventListener('click', function () {
    document.getElementById('mobile-menu').classList.toggle('open');
    document.getElementById('hamburger').classList.toggle('open');
  });

  // ── Card click (event delegation — opens Google Maps) ─────────────────────
  document.getElementById('grid').addEventListener('click', function (e) {
    // let links inside the card handle themselves
    if (e.target.closest('a')) return;
    var card = e.target.closest('.card');
    if (!card || !card.dataset.mapsUrl) return;
    window.open(card.dataset.mapsUrl, '_blank', 'noopener,noreferrer');
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  function applyFilters() {
    var result = allBranches;
    if (activeRegion !== 'All') {
      result = result.filter(function (b) { return b.region === activeRegion; });
    }
    if (searchTerm) {
      result = result.filter(function (b) {
        return b.name.toLowerCase().includes(searchTerm) ||
               (b.address || '').toLowerCase().includes(searchTerm);
      });
    }
    if (filterOpenNow) {
      result = result.filter(function (b) {
        var s = getBranchStatus(b);
        return s === 'open' || s === 'closing';
      });
    }
    renderCards(result);
  }

  function buildRegionDropdown() {
    var counts = {};
    allBranches.forEach(function (b) {
      if (b.region) counts[b.region] = (counts[b.region] || 0) + 1;
    });
    var sel = document.getElementById('region-select');
    sel.options[0].textContent = 'All Regions (' + allBranches.length + ')';
    Object.keys(counts).sort().forEach(function (r) {
      var opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r + ' (' + counts[r] + ')';
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () {
      activeRegion = sel.value;
      applyFilters();
    });
  }

  document.getElementById('search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  document.getElementById('open-now-btn').addEventListener('click', function () {
    filterOpenNow = !filterOpenNow;
    this.classList.toggle('active', filterOpenNow);
    this.setAttribute('aria-pressed', filterOpenNow);
    applyFilters();
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function cleanName(name)       { return name.replace(/\s+BRANCH$/i, '').trim().toLowerCase(); }
  function cleanAddress(address) { return address.toLowerCase(); }

  function titleCase(str) {
    return str.replace(/\w+/g, function (word) {
      if (/\d/.test(word)) return word;                                    // keep "30M", "120" as-is
      if (word.length <= 2 && /^[A-Z]+$/.test(word)) return word;         // keep "BF", "SF", "BS", "W" as-is
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
  }

  // Cleans service name for display: "W/" → "with"
  function cleanSvcName(name) {
    return titleCase((name || '').replace(/\bW\//gi, 'with'));
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function formatTime(t) {
    if (!t) return null;
    var parts = t.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12  = h % 12 || 12;
    return m === '00' ? h12 + ' ' + ampm : h12 + ':' + m + ' ' + ampm;
  }

  function fmtPeso(n) {
    return '\u20b1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 });
  }

  // ── Branch open/closed status (Manila time, UTC+8) ─────────────────────────
  function getBranchStatus(b) {
    if (!b.opening_time || !b.closing_time) return null;
    var now = new Date();
    var cur = (now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % (24 * 60);
    function toMins(t) {
      if (!t) return -1;
      var p = t.split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1] || '0', 10);
    }
    var s1o = toMins(b.opening_time), s1c = toMins(b.closing_time);
    var s2o = toMins(b.shift2_opening_time), s2c = toMins(b.shift2_closing_time);
    var inS1 = cur >= s1o && cur < s1c;
    var inS2 = s2o >= 0 && s2c >= 0 && cur >= s2o && cur < s2c;
    if (!inS1 && !inS2) return 'closed';
    var closingSoon = (inS1 && (s1c - cur) <= 30) || (inS2 && (s2c - cur) <= 30);
    return closingSoon ? 'closing' : 'open';
  }

  // ── Render cards ───────────────────────────────────────────────────────────
  function renderCards(branches) {
    var grid  = document.getElementById('grid');
    var count = document.getElementById('count');

    if (branches.length === 0) {
      grid.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📍</div>' +
          '<h3>No branches found</h3>' +
          '<p>Try a different search or region.</p>' +
          '<button class="empty-clear-btn" id="clear-btn">Clear search</button>' +
        '</div>';
      count.textContent = '';
      document.getElementById('clear-btn').addEventListener('click', function () {
        document.getElementById('search').value = '';
        document.getElementById('region-select').value = 'All';
        searchTerm = '';
        activeRegion = 'All';
        applyFilters();
      });
      return;
    }

    count.textContent = branches.length + ' branch' + (branches.length !== 1 ? 'es' : '');

    var clockSvg = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>';
    var phoneSvg = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.45-.45a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>';
    var mapPinSvg = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';
    var houseSvg = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 22V12h6v10"/></svg>';

    grid.innerHTML = branches.map(function (b) {
      var status = getBranchStatus(b);
      var statusBadge = '';
      if (status === 'open')    statusBadge = '<span class="card-status card-status-open">Open</span>';
      if (status === 'closing') statusBadge = '<span class="card-status card-status-closing">Closing Soon</span>';
      if (status === 'closed')  statusBadge = '<span class="card-status card-status-closed">Closed</span>';
      var pinClass = 'card-pin-icon' + (status === 'open' ? ' card-pin-open' : status === 'closing' ? ' card-pin-closing' : '');

      var s1Open  = formatTime(b.opening_time);
      var s1Close = formatTime(b.closing_time);
      var s2Open  = formatTime(b.shift2_opening_time);
      var s2Close = formatTime(b.shift2_closing_time);
      var hasShift2    = s2Open && s2Close;
      var displayOpen  = s1Open;
      var displayClose = hasShift2 ? s2Close : s1Close;
      var hoursHtml = (displayOpen && displayClose)
        ? '<div class="card-hours"><div class="card-shift">' + clockSvg + escHtml(displayOpen) + ' \u2013 ' + escHtml(displayClose) + statusBadge + '</div></div>'
        : (statusBadge ? '<div class="card-hours"><div class="card-shift">' + statusBadge + '</div></div>' : '');
      var contactHtml = b.contact_number
        ? '<a class="card-contact" href="tel:' + escHtml(b.contact_number) + '">' + phoneSvg + escHtml(b.contact_number) + '</a>'
        : '';
      var mapsUrl = b.pin_location || 'https://maps.google.com/maps?q=' + encodeURIComponent(b.address || b.name);

      return '<div class="card" data-maps-url="' + escHtml(mapsUrl) + '">' +
        '<div class="card-body">' +
          '<div class="card-top">' +
            '<div class="' + pinClass + '">' + houseSvg + '</div>' +
            '<div class="card-info">' +
              '<span class="card-name">' + escHtml(cleanName(b.name)) + '</span>' +
              (b.address ? '<div class="card-address">' + escHtml(cleanAddress(b.address)) + '</div>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        hoursHtml +
        '<div class="card-cta">' +
          contactHtml +
          '<div class="card-cta-bottom">' +
            '<a class="card-cta-left" href="' + escHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' +
              mapPinSvg + ' Get Directions' +
            '</a>' +
            (b.region ? '<span class="card-region-text">' + escHtml(b.region) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ── Services ───────────────────────────────────────────────────────────────
  // 8 soft palette backgrounds (cycled by catalog index, via data-color attr)
  var SVC_COLORS = ['sky','mint','amber','purple','rose','indigo','teal','peach'];

  // Returns an SVG icon matched to the service name via keyword
  function svcIconSvg(name) {
    var n = (name || '').toLowerCase();
    var p;
    if (/ear|candle/.test(n)) {
      // Flame — ear candle
      p = '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2z"/>';
    } else if (/hot|stone|heat/.test(n)) {
      // Flame — hot stone
      p = '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2z"/>';
    } else if (/ventosa|cupp/.test(n)) {
      // Droplets — cupping/ventosa
      p = '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0014 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 01-11.91 4.97"/>';
    } else if (/bone|bonesetter|chiro|ortho/.test(n)) {
      // Wrench — bone setting
      p = '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>';
    } else if (/head|scalp|cranial|neck|nape|facial|face/.test(n)) {
      // Person — head/scalp/neck
      p = '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>';
    } else if (/signature|premium|vip/.test(n)) {
      // Star — signature treatments
      p = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    } else {
      // Leaf — default (massage, foot, reflexology, body, etc.)
      p = '<path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>';
    }
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }

  async function loadServices() {
    servicesLoaded = true;
    try {
      var res = await fetch(
        SUPABASE_URL + '/rest/v1/service_templates?select=id,name,duration,catalog_name&order=catalog_name.asc,name.asc',
        { headers: HEADERS }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var data = await res.json();

      var groups = {};
      data.forEach(function (s) {
        var cat = s.catalog_name || 'Other';
        if (/^ber seasons$/i.test(cat)) return;   // exclude Ber Seasons catalog
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(s);
      });

      // Priority order: 1. Hilot Services, 2. Bonesetting & Hilot, 3. Add-Ons, 4. rest alphabetically
      var CAT_PRIORITY = [
        function (n) { return /hilot/i.test(n) && !/bonesett?ing/i.test(n); },
        function (n) { return /bonesett?ing/i.test(n); },
        function (n) { return /add?\s*[- ]?on/i.test(n); },
      ];
      function catRank(name) {
        for (var i = 0; i < CAT_PRIORITY.length; i++) {
          if (CAT_PRIORITY[i](name)) return i;
        }
        return CAT_PRIORITY.length;
      }
      var sorted = Object.entries(groups).sort(function (a, b) {
        var ra = catRank(a[0]), rb = catRank(b[0]);
        if (ra !== rb) return ra - rb;
        return a[0].localeCompare(b[0]);
      });
      var el = document.getElementById('services-content');

      if (sorted.length === 0) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">\u2702\ufe0f</div><h3>No services listed yet</h3></div>';
        return;
      }

      el.innerHTML = sorted.map(function (entry, groupIdx) {
        var cat   = entry[0];
        var items = entry[1];
        var color = SVC_COLORS[groupIdx % SVC_COLORS.length];
        return '<div class="svc-group">' +
          '<div class="svc-group-header">' +
            '<span class="svc-group-name">' + escHtml(titleCase(cat)) + '</span>' +
            '<div class="svc-divider"></div>' +
          '</div>' +
          '<div class="svc-card-grid">' +
            items.map(function (s) {
              var meta = s.duration > 0 ? s.duration + ' min' : '';
              return '<div class="svc-card" data-action="book-now">' +
                '<div class="svc-icon svc-color-' + color + '">' + svcIconSvg(s.name) + '</div>' +
                '<div class="svc-card-body">' +
                  '<h3 class="svc-card-name">' + escHtml(cleanSvcName(s.name)) + '</h3>' +
                  (meta ? '<p class="svc-card-meta">' + escHtml(meta) + '</p>' : '') +
                '</div>' +
                '<svg class="svc-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('');
    } catch (err) {
      document.getElementById('services-content').innerHTML =
        '<div class="empty"><div class="empty-icon">\u26a0\ufe0f</div><h3>Failed to load services</h3><p>' + escHtml(err.message) + '</p></div>';
    }
  }

  // "Find a Branch" buttons inside services → switch to nearby tab
  document.getElementById('services-content').addEventListener('click', function (e) {
    if (e.target.closest('[data-action="book-now"]')) switchTab('nearby');
  });

  // ── Contact ────────────────────────────────────────────────────────────────
  function renderContact() {
    contactRendered = true;
    var el           = document.getElementById('contact-content');
    var withContact    = allBranches.filter(function (b) { return b.contact_number; });
    var withoutContact = allBranches.filter(function (b) { return !b.contact_number; });

    if (withContact.length === 0) {
      el.innerHTML =
        '<div class="empty">' +
          '<div class="empty-icon">📞</div>' +
          '<h3>No contact numbers on file</h3>' +
          '<p>Contact info will appear here once branches update their details.</p>' +
        '</div>';
      return;
    }

    var phoneSvgFill = '<svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

    el.innerHTML =
      '<p class="contact-count">' + withContact.length + ' branch' + (withContact.length !== 1 ? 'es' : '') + ' with contact info</p>' +
      '<div class="contact-list">' +
        withContact.map(function (b) {
          return '<div class="contact-row">' +
            '<div class="contact-info">' +
              '<span class="contact-name">' + escHtml(cleanName(b.name)) + '</span>' +
              '<span class="contact-num">' + escHtml(b.contact_number) + '</span>' +
            '</div>' +
            '<a class="contact-call-btn" href="tel:' + escHtml(b.contact_number) + '">' +
              phoneSvgFill + ' Call' +
            '</a>' +
          '</div>';
        }).join('') +
      '</div>' +
      (withoutContact.length > 0
        ? '<details class="contact-no-num">' +
            '<summary>' + withoutContact.length + ' branch' + (withoutContact.length !== 1 ? 'es' : '') + ' without contact info</summary>' +
            '<div class="contact-no-num-list">' +
              withoutContact.map(function (b) {
                return '<div class="contact-no-num-item">' + escHtml(cleanName(b.name)) + '</div>';
              }).join('') +
            '</div>' +
          '</details>'
        : '');
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  async function fetchBranches() {
    var res = await fetch(
      SUPABASE_URL + '/rest/v1/branches?select=id,name,address,pin_location,region,opening_time,closing_time,shift2_opening_time,shift2_closing_time,contact_number&is_enabled=eq.true&name=not.ilike.*TEST*&order=name.asc',
      { headers: HEADERS }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    return data.filter(function (b) { return b.pin_location || b.address; });
  }

  async function fetchConfig() {
    try {
      var res = await fetch(
        SUPABASE_URL + '/rest/v1/system_config?select=key,value&key=in.(logo,hero_image)',
        { headers: HEADERS }
      );
      var data = await res.json();
      var map = {};
      data.forEach(function (r) { map[r.key] = r.value; });
      return map;
    } catch (e) { return {}; }
  }

  Promise.all([fetchBranches(), fetchConfig()]).then(function (results) {
    var data        = results[0];
    var config      = results[1];
    allBranches = data;

    var logoUrl      = config.logo;
    var heroImageUrl = config.hero_image;

    var brandSkel = document.getElementById('brand-logo-skel');
    if (brandSkel) brandSkel.style.display = 'none';

    if (logoUrl) {
      var brandLogo = document.getElementById('brand-logo');
      brandLogo.src = logoUrl;
      brandLogo.style.display = 'block';
      var footerLogo = document.getElementById('footer-logo');
      footerLogo.src = logoUrl;
      footerLogo.style.display = 'block';
      var favicon = document.getElementById('favicon');
      if (favicon) favicon.href = logoUrl;
    }

    if (heroImageUrl) {
      var heroSection = document.getElementById('hero-section');
      if (heroSection) heroSection.style.backgroundImage = "url('" + heroImageUrl.replace(/'/g, "\\'") + "')";
    }

    buildRegionDropdown();
    renderCards(data);

    // Hero stats
    var statEl = document.getElementById('stat-branches');
    if (statEl) statEl.textContent = data.length + '+';
    var heroStats = document.getElementById('hero-stats');
    if (heroStats) heroStats.style.display = 'flex';
  }).catch(function (err) {
    document.getElementById('grid').innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">\u26a0\ufe0f</div>' +
        '<h3>Failed to load branches</h3>' +
        '<p>' + escHtml(err.message) + '</p>' +
      '</div>';
  });

})();
