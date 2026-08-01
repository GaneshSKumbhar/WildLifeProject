/* ==========================================================================
   EcoSentinel SYSTEM - CONTROLLER ENGINE
   Shared platform logic, UI shell renderer, API gateway, and Firestore logging.
   ========================================================================== */

(function() {
    // Scientific name → Common name map (covers all 35 audio model classes)
    const COMMON_NAMES = {
        'Anthus rubescens':           'American Pipit',
        'Anura':                      'Frog / Toad',
        'Bos Taurus':                 'Domestic Cow',
        'Canis Lupus':                'Wolf / Dog',
        'Cardinalis cardinalis':      'Northern Cardinal',
        'Carduelis carduelis':        'European Goldfinch',
        'Cercopithecidae':            'Old World Monkey',
        'Coccyzus erythropthalmus':   'Black-billed Cuckoo',
        'Contopus sordidulus':        'Western Wood-Pewee',
        'Corvus ossifragus':          'Fish Crow',
        'Dolichonyx oryzivorus':      'Bobolink',
        'Dumetella carolinensis':     'Gray Catbird',
        'Elephas Maximus':            'Asian Elephant',
        'Equus Asinus':               'Donkey',
        'Equus Caballus':             'Horse',
        'Euphagus carolinus':         'Rusty Blackbird',
        'Euphagus cyanocephalus':     'Brewer\'s Blackbird',
        'Felis Catus':                'Domestic Cat',
        'Gallus Gallus Domesticus':   'Chicken / Rooster',
        'Haemorhous purpureus':       'Purple Finch',
        'Icteria virens':             'Yellow-breasted Chat',
        'Icterus spurius':            'Orchard Oriole',
        'Larus californicus':         'California Gull',
        'Leucosticte tephrocotis':    'Gray-crowned Rosy-Finch',
        'Myiarchus crinitus':         'Great Crested Flycatcher',
        'Ovis Aries':                 'Domestic Sheep',
        'Panthera Leo':               'Lion',
        'Passer domesticus':          'House Sparrow',
        'Passerina ciris':            'Painted Bunting',
        'Passerina cyanea':           'Indigo Bunting',
        'Pipilo erythrophthalmus':    'Eastern Towhee',
        'Riparia riparia':            'Bank Swallow',
        'Seiurus aurocapilla':        'Ovenbird',
        'Selasphorus rufus':          'Rufous Hummingbird',
        'Ursidae':                    'Bear'
    };

    const WI = {
        // Retrieve the backend API server base URL
        base: function() {
            return localStorage.getItem('wi_server_url') ||
                   (window.location.origin.startsWith('http') ? window.location.origin : 'http://127.0.0.1:8000');
        },

        // Look up common name for a scientific label; returns the original if not found
        commonName: function(scientific) {
            if (!scientific) return scientific;
            // Try exact match first
            if (COMMON_NAMES[scientific]) return COMMON_NAMES[scientific];
            // Try case-insensitive match
            var key = Object.keys(COMMON_NAMES).find(function(k) {
                return k.toLowerCase() === scientific.toLowerCase();
            });
            return key ? COMMON_NAMES[key] : scientific;
        },

        // Returns "Common Name" if known, else original label
        displayLabel: function(scientific) {
            var common = this.commonName(scientific);
            return common !== scientific ? common : scientific;
        },

        // Returns "Common Name (Scientific name)" for full display
        fullLabel: function(scientific) {
            var common = this.commonName(scientific);
            return common !== scientific ? common + ' (' + scientific + ')' : scientific;
        },

        // Set a new backend API server base URL
        setBase: function(url) {
            url = url.trim().replace(/\/+$/, '');
            localStorage.setItem('wi_server_url', url);
            window.dispatchEvent(new CustomEvent('wi:server-changed'));
            this.toast('Server endpoint updated to ' + url);
            this.checkServerStatus();
        },

        // Helper to check server connectivity
        checkServerStatus: async function() {
            const statusDot = document.getElementById('api-status-dot');
            const statusText = document.getElementById('api-status-text');
            if (!statusDot) return;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(function() { controller.abort(); }, 3000);
                const res = await fetch(this.base() + '/audio_classes/', { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    statusDot.className = 'status-dot online';
                    statusText.textContent = 'ONLINE';
                } else { throw new Error(); }
            } catch (e) {
                statusDot.className = 'status-dot offline';
                statusText.textContent = 'OFFLINE';
            }
        },

        // UI Shell Layout — waits for Firebase auth, then renders
        renderShell: async function(activeTabId, pageTitle) {
            const root = document.getElementById('shell-root');
            if (!root) return;

            // Render virtual page loading state (Skeleton UI)
            root.innerHTML = `
                <div class="yt-loader"></div>
                <div class="sidebar">
                    <a href="index.html" class="sidebar-brand" style="text-decoration:none;">
                        <img src="logo.svg" alt="Logo" class="logo-img">
                        <span>EcoSentinel</span>
                    </a>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${activeTabId === 'detection' ? 'active' : ''}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Object Detection</div>
                        <div class="nav-item ${activeTabId === 'species' ? 'active' : ''}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>Species Detection</div>
                        <div class="nav-item ${activeTabId === 'audio' ? 'active' : ''}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="20" r="3"/><circle cx="16" cy="18" r="3"/></svg>Bioacoustic</div>
                        <div class="nav-item ${activeTabId === 'logs' ? 'active' : ''}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>Session Logs</div>
                    </nav>
                    <div class="sidebar-footer">
                        <div class="user-profile">
                            <div class="profile-avatar" style="background:var(--canopy-800);"></div>
                            <div class="profile-info">
                                <div style="width:70px;height:12px;background:rgba(255,255,255,0.05);border-radius:2px;margin-bottom:4px;"></div>
                                <div style="width:40px;height:10px;background:rgba(255,255,255,0.03);border-radius:2px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="main-wrapper">
                    <header class="top-header">
                        <div class="top-header-title">${pageTitle}</div>
                    </header>
                    <div id="page-slot"></div>
                </div>
            `;

            // Wait for Firebase auth guard
            const firebaseUser = await FireAuth.requireAuth();

            // Load user profile from Firestore
            let userProfile = null;
            try {
                userProfile = await FireDB.getUser(firebaseUser.uid);
            } catch (e) {
                console.error("Firestore error loading user profile:", e);
                // Fallback if Firestore fails (e.g. permission denied)
            }
            
            let username = (userProfile && userProfile.name) || firebaseUser.displayName || firebaseUser.email || 'User';
            let role = (userProfile && userProfile.role) || 'Researcher';

            // Render sidebar and main wrapper
            root.innerHTML = `
                <div class="sidebar">
                    <a href="index.html" class="sidebar-brand" style="text-decoration:none;">
                        <img src="logo.svg" alt="Logo" class="logo-img">
                        <span>EcoSentinel</span>
                    </a>
                    <nav class="sidebar-nav">
                        <div class="nav-item ${activeTabId === 'detection' ? 'active' : ''}" onclick="location.href='detection.html'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            Object Detection
                        </div>
                        <div class="nav-item ${activeTabId === 'species' ? 'active' : ''}" onclick="location.href='species.html'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                            Species Detection
                        </div>
                        <div class="nav-item ${activeTabId === 'audio' ? 'active' : ''}" onclick="location.href='audio.html'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="20" r="3"/><circle cx="16" cy="18" r="3"/></svg>
                            Bioacoustic
                        </div>
                        <div class="nav-item ${activeTabId === 'logs' ? 'active' : ''}" onclick="location.href='log.html'">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            Session Logs
                        </div>

                        <div style="margin-top: 30px;">
                            <div class="server-badge">
                                <div><span class="status-dot online" id="api-status-dot"></span>API: <span id="api-status-text">CHECKING</span></div>
                                <span class="mono" style="opacity: 0.6; cursor: pointer;" onclick="document.getElementById('server-edit').style.display='block'">edit</span>
                            </div>
                            <div class="server-config-pop" id="server-edit" style="display: none;">
                                <label class="mono" style="font-size:9px; color:var(--text-faint);">API ENDPOINT BASE</label>
                                <input type="text" id="server-url-field" value="${this.base()}" onchange="WI.setBase(this.value)">
                            </div>
                        </div>
                    </nav>
                    <div class="sidebar-footer">
                        <div class="user-profile">
                            <div class="profile-avatar">${username.split(' ').map(function(n){return n[0];}).join('').toUpperCase().substring(0,2)}</div>
                            <div class="profile-info">
                                <span style="font-weight: 500;">${username}</span>
                                <span class="profile-role">${role}</span>
                            </div>
                            <span style="margin-left: auto; opacity: 0.5; cursor: pointer;" onclick="WI.logout()" title="Logout">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            </span>
                        </div>
                    </div>
                </div>
                <div class="main-wrapper">
                    <header class="top-header">
                        <div class="top-header-title">${pageTitle}</div>
                        <div class="top-header-actions">
                            <div class="mono" style="font-size: 11px; color: var(--text-faint)">LOCAL TIME: ${new Date().toLocaleTimeString()}</div>
                        </div>
                    </header>
                    <div id="page-slot"></div>
                </div>
            `;

            // Start connectivity checks
            this.checkServerStatus();
            setInterval(function() { WI.checkServerStatus(); }, 15000);

            // Seed species collection on first load (no-op if already seeded)
            FireDB.seedSpecies();

            return { user: firebaseUser, profile: userProfile };
        },

        // Logout via Firebase
        logout: function() {
            this.toast('Session terminated');
            setTimeout(function() {
                FireAuth.signOut();
            }, 800);
        },

        // Error banners
        showError: function(element, message) {
            if (!element) return;
            element.textContent = message;
            element.style.display = 'block';
        },
        hideError: function(element) {
            if (!element) return;
            element.style.display = 'none';
        },

        // In-app notifications
        toast: function(message) {
            var container = document.getElementById('wi-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'wi-toast-container';
                container.className = 'toast-container';
                document.body.appendChild(container);
            }

            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-gold)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>' + message + '</span>';
            container.appendChild(toast);

            setTimeout(function() {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        },

        // Card rendering logic for predictions
        renderObjectCard: function(obj) {
            var card = document.createElement('div');
            card.className = 'object-card';

            var name = obj.class || obj.label || obj.species || obj.predicted_class || 'Unknown Species';

            // Extract confidence percentage
            var confKey = Object.keys(obj).find(function(k) { return /confidence|probability|score/i.test(k); });
            var confidence = '—';
            if (confKey != null) {
                var val = obj[confKey];
                if (val <= 1.0) val = val * 100;
                confidence = val.toFixed(1) + '%';
            }

            var subtitle = 'Bioacoustic sound signature detected';
            var iconSvg = '<svg class="object-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="20" r="3"/><circle cx="16" cy="18" r="3"/></svg>';

            if (obj.box) {
                iconSvg = '<svg class="object-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
                var box = obj.box;
                subtitle = 'Box: [' + box.x1.toFixed(0) + ', ' + box.y1.toFixed(0) + ', ' + box.x2.toFixed(0) + ', ' + box.y2.toFixed(0) + ']';
            }

            card.innerHTML = iconSvg +
                '<div class="object-details"><h5>' + name + '</h5><p>' + subtitle + '</p></div>' +
                '<div class="object-score">' + confidence + '</div>';
            return card;
        }
    };

    // Attach to global window
    window.WI = WI;
})();
