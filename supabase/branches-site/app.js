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
      var s1Open  = formatTime(b.opening_time);
      var s1Close = formatTime(b.closing_time);
      var s2Open  = formatTime(b.shift2_opening_time);
      var s2Close = formatTime(b.shift2_closing_time);
      var hasShift2    = s2Open && s2Close;
      var displayOpen  = s1Open;
      var displayClose = hasShift2 ? s2Close : s1Close;
      var hoursHtml = (displayOpen && displayClose)
        ? '<div class="card-hours"><div class="card-shift">' + clockSvg + escHtml(displayOpen) + ' \u2013 ' + escHtml(displayClose) + '</div></div>'
        : '';
      var contactHtml = b.contact_number
        ? '<a class="card-contact" href="tel:' + escHtml(b.contact_number) + '">' + phoneSvg + escHtml(b.contact_number) + '</a>'
        : '';
      var mapsUrl = b.pin_location || 'https://maps.google.com/maps?q=' + encodeURIComponent(b.address || b.name);

      return '<div class="card" data-maps-url="' + escHtml(mapsUrl) + '">' +
        '<div class="card-body">' +
          '<div class="card-top">' +
            '<div class="card-pin-icon">' + houseSvg + '</div>' +
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

      var sorted = Object.entries(groups).sort(function (a, b) { return a[0].localeCompare(b[0]); });
      var el = document.getElementById('services-content');

      if (sorted.length === 0) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">\u2702\ufe0f</div><h3>No services listed yet</h3></div>';
        return;
      }

      var placeholderSvg =
        '<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" opacity="0.3">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/>' +
        '</svg>';

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
                '<div class="svc-card-img svc-color-' + color + '">' + placeholderSvg + '</div>' +
                '<div class="svc-card-body">' +
                  '<h3 class="svc-card-name">' + escHtml(titleCase(s.name)) + '</h3>' +
                  (meta ? '<p class="svc-card-meta">' + escHtml(meta) + '</p>' : '') +
                  '<button class="svc-card-book" data-action="book-now"><span>Find a Branch</span><span>\u2192</span></button>' +
                '</div>' +
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
  }).catch(function (err) {
    document.getElementById('grid').innerHTML =
      '<div class="empty">' +
        '<div class="empty-icon">\u26a0\ufe0f</div>' +
        '<h3>Failed to load branches</h3>' +
        '<p>' + escHtml(err.message) + '</p>' +
      '</div>';
  });

})();
