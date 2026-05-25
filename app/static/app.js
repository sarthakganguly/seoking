// ==========================================================================
// SEO KING APPLICATION ARCHITECTURE (FRONTEND CLIENT)
// ==========================================================================

// Global state variables
let currentUser = null;
let currentSettings = {};
let activeView = "dashboard";
let socket = null;

// Module states
let selectedAuditPages = [];
let currentOpenAuditRunId = null;
let currentRunDetails = {};
let activeOptimizerData = null; // { keyword, competitor_urls, entities }
let trackedKeywords = [];

// Initialize Page Loader
document.addEventListener("DOMContentLoaded", () => {
    checkRegistrationState();
    setupEventListeners();
});

// ----------------- CLIENT ROUTING & INITIALIZATION -----------------

async function checkRegistrationState() {
    try {
        const response = await fetch("/api/init");
        const data = await response.json();
        
        if (!data.registered) {
            // Show registration screen
            showAuthSection("register-form");
        } else {
            // Already registered, check session
            checkAuthentication();
        }
    } catch (e) {
        console.error("Initialization check failed:", e);
        showAuthSection("login-form");
    }
}

async function checkAuthentication() {
    try {
        const res = await fetch("/api/me");
        if (res.status === 401) {
            showAuthSection("login-form");
            return;
        }
        const user = await res.json();
        currentUser = user;
        
        // Hide auth screen and show main application layout
        document.getElementById("auth-container").classList.add("hidden");
        document.getElementById("app-container").classList.remove("hidden");
        
        initApp();
    } catch (e) {
        showAuthSection("login-form");
    }
}

function showAuthSection(formId) {
    document.getElementById("auth-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
    
    // Hide all forms in auth card first
    document.querySelectorAll(".auth-view").forEach(el => el.classList.add("hidden"));
    // Show target form
    document.getElementById(formId).classList.remove("hidden");
}

function initApp() {
    // Set user badge initials
    if (currentUser && currentUser.username) {
        document.getElementById("user-avatar-initials").innerText = currentUser.username.substring(0,2).toUpperCase();
        document.getElementById("user-display-name").innerText = currentUser.username;
    }
    
    // Load configurations and connect WebSockets
    loadSettings();
    connectWebSocket();
    
    // Default initial view fetch
    switchView("dashboard");
}

// ----------------- EVENT LISTENERS SETUP -----------------

function setupEventListeners() {
    // Sidebar menu clicks
    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const target = item.getAttribute("data-target");
            switchView(target);
        });
    });

    // Theme toggle button click
    document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

    // Auth forms
    document.getElementById("login-form").addEventListener("submit", handleLogin);
    document.getElementById("register-form").addEventListener("submit", handleRegister);
    document.getElementById("recover-form").addEventListener("submit", handleRecovery);
    document.getElementById("logout-btn").addEventListener("click", handleLogout);
    
    document.getElementById("go-to-recover").addEventListener("click", (e) => {
        e.preventDefault();
        showAuthSection("recover-form");
    });
    document.getElementById("back-to-login").addEventListener("click", (e) => {
        e.preventDefault();
        showAuthSection("login-form");
    });

    // Module submissions
    document.getElementById("audit-start-form").addEventListener("submit", handleStartAudit);
    document.getElementById("keyword-add-form").addEventListener("submit", handleAddKeyword);
    document.getElementById("optimizer-form").addEventListener("submit", handleOptimizerScan);
    document.getElementById("settings-form").addEventListener("submit", handleSaveSettings);
    document.getElementById("performance-start-form").addEventListener("submit", handleStartPerformanceAudit);
    
    // Audit cancellation button
    document.getElementById("cancel-run-btn").addEventListener("click", handleCancelAudit);
}

// ----------------- WEBSOCKET CONNECTION MANAGER -----------------

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    socket = new WebSocket(`${protocol}//${host}/ws`);
    
    const wsIndicator = document.getElementById("ws-status");

    socket.onopen = () => {
        wsIndicator.className = "status-indicator connected";
        wsIndicator.querySelector(".text").innerText = "Connected";
    };

    socket.onclose = () => {
        wsIndicator.className = "status-indicator disconnected";
        wsIndicator.querySelector(".text").innerText = "Disconnected";
        // Reconnect after 5s
        setTimeout(connectWebSocket, 5000);
    };

    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWSMessage(data);
    };
}

function handleWSMessage(data) {
    if (data.type === "captcha_required") {
        // Intercept block and show the VNC Captcha frame popup
        document.getElementById("vnc-iframe").src = `http://${window.location.hostname}:8888/vnc.html?autoconnect=true&resize=scale`; 
        // fallback to port 8081 (default noVNC container mapping) if hostname is used
        document.getElementById("vnc-iframe").src = `http://${window.location.hostname}:8081/`; 
        
        document.getElementById("captcha-modal").classList.remove("hidden");
    } else if (data.type === "captcha_resolved") {
        // Automatically hide on captcha clearance detection
        document.getElementById("captcha-modal").classList.add("hidden");
        document.getElementById("vnc-iframe").src = "";
        
        // Refresh appropriate tables depending on active module
        if (activeView === "tracker") loadTrackedKeywords();
    }
}

function forceResolveCaptcha() {
    // Manual fallback close button
    document.getElementById("captcha-modal").classList.add("hidden");
    document.getElementById("vnc-iframe").src = "";
    if (activeView === "tracker") loadTrackedKeywords();
}

// ----------------- THEME CONTROLLER -----------------

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    
    // Save to settings db
    currentSettings.theme = newTheme;
    saveSettingsPayload({ theme: newTheme });
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const sunIcon = document.querySelector(".sun-icon");
    const moonIcon = document.querySelector(".moon-icon");
    
    if (theme === "dark") {
        sunIcon.classList.add("hidden");
        moonIcon.classList.remove("hidden");
    } else {
        sunIcon.classList.remove("hidden");
        moonIcon.classList.add("hidden");
    }
}

// ----------------- CORE VIEWS SWAPPER -----------------

function switchView(viewName) {
    activeView = viewName;
    
    // Update breadcrumb
    document.getElementById("breadcrumb-current").innerText = viewName.charAt(0).toUpperCase() + viewName.slice(1);
    
    // Toggle active tab class
    document.querySelectorAll(".menu-item").forEach(item => {
        if (item.getAttribute("data-target") === viewName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Stop performance polling if leaving the performance view
    if (viewName !== "performance") {
        stopPerformancePolling();
    }

    // Hide all view panes and show target
    document.querySelectorAll(".app-view").forEach(view => view.classList.add("hidden"));
    document.getElementById(`view-${viewName}`).classList.remove("hidden");

    // Fetch view specific data
    if (viewName === "dashboard") {
        loadDashboardMetrics();
    } else if (viewName === "audit") {
        loadAuditHistory();
    } else if (viewName === "performance") {
        loadPerformanceHistory();
    } else if (viewName === "tracker") {
        loadTrackedKeywords();
    } else if (viewName === "settings") {
        loadSettingsToForm();
    }
}

// ----------------- AUTHENTICATION FLOW HANDLERS -----------------

async function handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById("login-username").value;
    const p = document.getElementById("login-password").value;
    const errEl = document.getElementById("auth-error");

    errEl.classList.add("hidden");
    
    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Authentication failed");
        }
        
        checkAuthentication();
    } catch (err) {
        errEl.innerText = err.message;
        errEl.classList.remove("hidden");
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const u = document.getElementById("register-username").value;
    const p = document.getElementById("register-password").value;
    const errEl = document.getElementById("auth-error");

    errEl.classList.add("hidden");

    try {
        const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, password: p })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Registration failed");
        }

        const data = await response.json();
        
        // Show recovery code view
        document.getElementById("register-form").classList.add("hidden");
        document.getElementById("recovery-code-view").classList.remove("hidden");
        document.getElementById("recovery-code-display").innerText = data.recovery_code;
        
        // Add completion handler
        document.getElementById("recovery-done-btn").onclick = () => {
            checkAuthentication();
        };
    } catch (err) {
        errEl.innerText = err.message;
        errEl.classList.remove("hidden");
    }
}

function copyRecoveryCode() {
    const code = document.getElementById("recovery-code-display").innerText;
    navigator.clipboard.writeText(code);
    alert("Recovery code copied to clipboard!");
}

async function handleRecovery(e) {
    e.preventDefault();
    const u = document.getElementById("recover-username").value;
    const c = document.getElementById("recover-code").value;
    const p = document.getElementById("recover-new-password").value;
    const errEl = document.getElementById("auth-error");

    errEl.classList.add("hidden");

    try {
        const response = await fetch("/api/recover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: u, recovery_code: c, new_password: p })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Account recovery failed");
        }
        
        alert("Password reset successful. You can now login with your new credentials.");
        showAuthSection("login-form");
    } catch (err) {
        errEl.innerText = err.message;
        errEl.classList.remove("hidden");
    }
}

async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    currentUser = null;
    showAuthSection("login-form");
}

// ----------------- SETTINGS & PREFERENCES -----------------

async function loadSettings() {
    try {
        const res = await fetch("/api/settings");
        currentSettings = await res.json();
        setTheme(currentSettings.theme || "dark");
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}

async function loadSettingsToForm() {
    await loadSettings();
    document.getElementById("pref-theme").value = currentSettings.theme || "dark";
    document.getElementById("pref-max-browser").value = currentSettings.max_concurrent_browser_tabs || "3";
    document.getElementById("pref-max-crawler").value = currentSettings.max_concurrent_crawler_tabs || "3";
    document.getElementById("pref-jitter-min").value = currentSettings.jitter_min_ms || "3000";
    document.getElementById("pref-jitter-max").value = currentSettings.jitter_max_ms || "8000";
    document.getElementById("pref-geo-lat").value = currentSettings.geolocation_latitude || "37.7749";
    document.getElementById("pref-geo-lon").value = currentSettings.geolocation_longitude || "-122.4194";
    document.getElementById("pref-locale").value = currentSettings.locale || "en-US";
    document.getElementById("pref-timezone").value = currentSettings.timezone || "America/Los_Angeles";
    document.getElementById("pref-audit-limit").value = currentSettings.audit_pagination_limit || "100";
}

async function handleSaveSettings(e) {
    e.preventDefault();
    const payload = {
        theme: document.getElementById("pref-theme").value,
        max_concurrent_browser_tabs: document.getElementById("pref-max-browser").value,
        max_concurrent_crawler_tabs: document.getElementById("pref-max-crawler").value,
        jitter_min_ms: document.getElementById("pref-jitter-min").value,
        jitter_max_ms: document.getElementById("pref-jitter-max").value,
        geolocation_latitude: document.getElementById("pref-geo-lat").value,
        geolocation_longitude: document.getElementById("pref-geo-lon").value,
        locale: document.getElementById("pref-locale").value,
        timezone: document.getElementById("pref-timezone").value,
        audit_pagination_limit: document.getElementById("pref-audit-limit").value,
    };

    const success = await saveSettingsPayload(payload);
    if (success) {
        setTheme(payload.theme);
        const msg = document.getElementById("settings-status-msg");
        msg.classList.remove("hidden");
        setTimeout(() => msg.classList.add("hidden"), 3000);
    }
}

async function saveSettingsPayload(settings) {
    try {
        const response = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ settings })
        });
        return response.ok;
    } catch (e) {
        console.error("Failed to save settings:", e);
        return false;
    }
}

// ----------------- DASHBOARD PANEL RENDERING -----------------

async function loadDashboardMetrics() {
    try {
        // Fetch keyword data
        const kwRes = await fetch("/api/keywords");
        const keywords = await kwRes.json();
        document.getElementById("dash-keywords-count").innerText = keywords.length;
        
        // Calculate average rank
        let rankSum = 0;
        let rankCount = 0;
        keywords.forEach(k => {
            if (k.rank_position !== null) {
                rankSum += k.rank_position;
                rankCount++;
            }
        });
        const avgRank = rankCount > 0 ? (rankSum / rankCount).toFixed(1) : "--";
        document.getElementById("dash-avg-position").innerText = avgRank;
        
        // Fetch audit runs
        const auditRes = await fetch("/api/audit/runs");
        const runs = await auditRes.json();
        
        // Calculate total pages crawled and health
        let totalPages = 0;
        runs.forEach(r => totalPages += r.total_urls_crawled);
        document.getElementById("dash-pages-crawled").innerText = totalPages;
        
        // Render recent audit table
        const auditTbody = document.querySelector("#dash-audits-table tbody");
        if (runs.length === 0) {
            auditTbody.innerHTML = `<tr><td colspan="5" class="empty-state">No audits run yet.</td></tr>`;
        } else {
            auditTbody.innerHTML = runs.slice(0, 5).map(r => `
                <tr>
                    <td><strong>${r.domain}</strong></td>
                    <td><span class="badge ${getBadgeClass(r.status)}">${r.status}</span></td>
                    <td>${r.total_urls_crawled}</td>
                    <td>${formatDate(r.started_at)}</td>
                    <td><button class="btn btn-sm btn-secondary" onclick="viewAuditDetailsDirect(${r.id})">View</button></td>
                </tr>
            `).join("");
        }

        // Render recent keyword summary table
        const kwTbody = document.querySelector("#dash-keywords-table tbody");
        if (keywords.length === 0) {
            kwTbody.innerHTML = `<tr><td colspan="4" class="empty-state">No keywords tracked yet.</td></tr>`;
        } else {
            kwTbody.innerHTML = keywords.slice(0, 5).map(k => `
                <tr>
                    <td><strong>${k.keyword}</strong></td>
                    <td>${k.target_domain}</td>
                    <td>${k.rank_position !== null ? `<span class="badge badge-success">#${k.rank_position}</span>` : `<span class="badge badge-danger">Not in Top 100</span>`}</td>
                    <td>${k.checked_at ? formatDate(k.checked_at) : 'Never'}</td>
                </tr>
            `).join("");
        }

    } catch (e) {
        console.error("Failed to load dashboard metrics:", e);
    }
}

function viewAuditDetailsDirect(runId) {
    switchView("audit");
    loadAuditDetails(runId);
}

// ----------------- MODULE 1: SITE CRAWLER AUDIT -----------------

function openNewAuditModal() {
    document.getElementById("modal-audit").classList.remove("hidden");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
}

async function handleStartAudit(e) {
    e.preventDefault();
    const domain = document.getElementById("audit-domain").value;
    const depth = parseInt(document.getElementById("audit-depth").value);
    
    closeModal("modal-audit");
    
    try {
        const response = await fetch("/api/audit/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain, max_depth: depth })
        });
        
        if (response.ok) {
            loadAuditHistory();
            switchView("audit");
        } else {
            const err = await response.json();
            alert("Error: " + err.detail);
        }
    } catch (e) {
        alert("Failed to start site audit.");
    }
}

async function loadAuditHistory() {
    try {
        const response = await fetch("/api/audit/runs");
        const runs = await response.json();
        
        const tbody = document.querySelector("#audit-runs-table tbody");
        if (runs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No audits executed. Click 'New Site Audit' to start.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = runs.map(r => `
            <tr>
                <td><strong>${r.domain}</strong></td>
                <td><span class="badge ${getBadgeClass(r.status)}">${r.status}</span></td>
                <td>${r.total_urls_crawled}</td>
                <td>${formatDate(r.started_at)}</td>
                <td>${r.completed_at ? formatDate(r.completed_at) : "--"}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="loadAuditDetails(${r.id})">Open Details</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAuditRun(${r.id})">Delete</button>
                </td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Failed to load audit history:", e);
    }
}

let currentAuditPage = 1;

async function loadAuditDetails(runId, page = 1) {
    currentOpenAuditRunId = runId;
    currentAuditPage = page;
    
    try {
        // Read search and filter values from DOM
        const q = document.getElementById("audit-page-search").value;
        const filterType = document.getElementById("audit-page-filter").value;
        
        // Load settings limit (default/max is 100)
        const limit = parseInt(currentSettings.audit_pagination_limit || "100");
        
        let url = `/api/audit/run/${runId}?page=${page}&limit=${limit}&filter_type=${filterType}`;
        if (q) {
            url += `&q=${encodeURIComponent(q)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        document.getElementById("audit-detail-container").classList.remove("hidden");
        document.getElementById("audit-detail-domain").innerText = data.run.domain;
        
        const statusEl = document.getElementById("audit-detail-status");
        statusEl.innerText = data.run.status;
        statusEl.className = `badge ${getBadgeClass(data.run.status)}`;

        // Show/hide cancel button depending on active state
        const cancelBtn = document.getElementById("cancel-run-btn");
        if (data.run.status === "running") {
            cancelBtn.classList.remove("hidden");
        } else {
            cancelBtn.classList.add("hidden");
        }
        
        // Save current run details
        currentRunDetails = data.run.details || {};
        selectedAuditPages = data.pages;
        
        renderAuditPageMetrics(data.metrics);
        
        // Render sitemaps / robots / orphans run-wide metrics
        const runDetails = currentRunDetails;
        
        const robotsEl = document.getElementById("audit-metric-robots");
        if (robotsEl) {
            if (runDetails.has_robots_txt) {
                robotsEl.innerHTML = `<span class="badge badge-success" style="cursor:help;" title="${escapeHtml(runDetails.robots_txt_content || '')}">Live (Status ${runDetails.robots_txt_status || 200})</span>`;
            } else {
                robotsEl.innerHTML = `<span class="badge badge-danger">Missing / 404</span>`;
            }
        }
        
        const sitemapsEl = document.getElementById("audit-metric-sitemaps");
        if (sitemapsEl) {
            const sitemapsCount = runDetails.sitemaps_found ? runDetails.sitemaps_found.length : 0;
            sitemapsEl.innerHTML = `<span class="badge badge-info" style="cursor:help;" title="${(runDetails.sitemaps_found || []).join('\n')}">${sitemapsCount} Found</span>`;
        }
        
        const orphansEl = document.getElementById("audit-metric-orphans");
        if (orphansEl) {
            const orphansCount = runDetails.orphan_pages ? runDetails.orphan_pages.length : 0;
            orphansEl.innerHTML = `<span class="badge ${orphansCount > 0 ? 'badge-warning' : 'badge-success'}" style="cursor:help;" title="${(runDetails.orphan_pages || []).join('\n')}">${orphansCount} Discovered</span>`;
        }
        
        // Update active class on metric card buttons based on current filter type
        document.querySelectorAll(".audit-summary-metrics .sub-metric.filter-btn").forEach(btn => {
            btn.classList.remove("active");
        });
        const activeBtnMap = {
            "all": "btn-filter-all",
            "broken": "btn-filter-broken",
            "redirect": "btn-filter-redirect",
            "healthy": "btn-filter-healthy"
        };
        const activeId = activeBtnMap[filterType];
        if (activeId) {
            const activeEl = document.getElementById(activeId);
            if (activeEl) activeEl.classList.add("active");
        }
        
        renderAuditPagesTable(data.pages);
        
        // Update pagination labels and button states
        document.getElementById("audit-pg-info").innerText = `Page ${data.current_page} of ${data.total_pages}`;
        document.getElementById("audit-pg-prev").disabled = (data.current_page === 1);
        document.getElementById("audit-pg-next").disabled = (data.current_page === data.total_pages);
    } catch (e) {
        console.error("Failed to load audit details:", e);
    }
}

async function changeAuditPage(direction) {
    if (!currentOpenAuditRunId) return;
    await loadAuditDetails(currentOpenAuditRunId, currentAuditPage + direction);
}

function renderAuditPageMetrics(metrics) {
    if (!metrics) return;
    document.getElementById("audit-metric-total").innerText = metrics.total;
    document.getElementById("audit-metric-broken").innerText = metrics.broken;
    document.getElementById("audit-metric-redirects").innerText = metrics.redirects;
    document.getElementById("audit-metric-healthy").innerText = metrics.healthy;
}

function renderAuditPagesTable(pages) {
    const tbody = document.querySelector("#audit-pages-table tbody");
    if (pages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No crawled pages found in this audit.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = pages.map(p => {
        const issuesCount = p.issues ? p.issues.length : 0;
        const issuesHtml = p.issues && p.issues.length > 0
            ? p.issues.slice(0, 2).map(i => `<span class="pill-issue warning">${escapeHtml(i)}</span>`).join("") + (p.issues.length > 2 ? `<span class="pill-issue more">+${p.issues.length - 2} more</span>` : "")
            : `<span class="pill-issue success">No Issues</span>`;
            
        return `
            <tr class="audit-page-row" data-page-id="${p.id}" onclick="toggleAuditPageDetails(${p.id})">
                <td class="word-break">
                    <div class="url-cell-wrapper">
                        <span class="chevron-icon" id="chevron-${p.id}">▶</span>
                        <strong>${escapeHtml(p.url)}</strong>
                    </div>
                </td>
                <td><span class="badge ${p.status_code === 200 ? 'badge-success' : p.status_code >= 400 ? 'badge-danger' : 'badge-warning'}">${p.status_code || "ERR"}</span></td>
                <td>${escapeHtml(p.title_tag) || `<span class="text-danger">Missing</span>`}</td>
                <td>${escapeHtml(p.meta_description) || `<span class="text-warning">Missing</span>`}</td>
                <td>${escapeHtml(p.h1_tag) || `<span class="text-muted">None</span>`}</td>
                <td><div class="issues-pill-container">${issuesHtml}</div></td>
                <td>${escapeHtml(p.redirect_url) || "--"}</td>
            </tr>
            <tr class="details-row hidden" id="details-${p.id}">
                <td colspan="7">
                    ${renderDiagnosticPanel(p)}
                </td>
            </tr>
        `;
    }).join("");
}

function toggleAuditPageDetails(pageId) {
    const detailsRow = document.getElementById(`details-${pageId}`);
    if (!detailsRow) return;
    
    const chevron = document.getElementById(`chevron-${pageId}`);
    const isHidden = detailsRow.classList.contains("hidden");
    
    if (isHidden) {
        detailsRow.classList.remove("hidden");
        if (chevron) chevron.classList.add("expanded");
    } else {
        detailsRow.classList.add("hidden");
        if (chevron) chevron.classList.remove("expanded");
    }
}

function renderDiagnosticPanel(p) {
    const isOrphan = (currentRunDetails.orphan_pages || []).includes(p.url);
    
    // Build the 16 checklist items
    const checklistItems = [
        {
            name: "Status Code",
            status: p.status_code === 200 ? "success" : (p.status_code >= 300 && p.status_code < 400) ? "warning" : "danger",
            message: p.status_code ? `Status ${p.status_code}` : "Connection Failed"
        },
        {
            name: "Title Tag",
            status: p.issues.some(i => i.toLowerCase().includes("title tag")) ? "warning" : (p.title_tag ? "success" : "danger"),
            message: p.title_tag ? `"${p.title_tag}" (${p.title_tag.length} chars)` : "Missing title tag"
        },
        {
            name: "Meta Description",
            status: p.issues.some(i => i.toLowerCase().includes("meta description")) ? "warning" : (p.meta_description ? "success" : "danger"),
            message: p.meta_description ? `"${p.meta_description}" (${p.meta_description.length} chars)` : "Missing meta description"
        },
        {
            name: "Canonical Tag",
            status: p.issues.some(i => i.toLowerCase().includes("canonical")) ? "danger" : (p.canonical_url ? "success" : "danger"),
            message: p.canonical_url ? `Canonical: ${p.canonical_url}` : "Missing canonical tag"
        },
        {
            name: "H1 Header",
            status: p.issues.some(i => i.toLowerCase().includes("h1 header")) ? "warning" : (p.h1_tag ? "success" : "danger"),
            message: p.h1_tag ? `H1: "${p.h1_tag}"` : "Missing H1 header"
        },
        {
            name: "Header Hierarchy",
            status: p.issues.some(i => i.toLowerCase().includes("hierarchy jump")) ? "warning" : "success",
            message: p.issues.find(i => i.toLowerCase().includes("hierarchy jump")) || "Hierarchical order is correct"
        },
        {
            name: "Content Length",
            status: p.details.thin_content ? "warning" : "success",
            message: `${p.word_count || 0} words parsed`
        },
        {
            name: "JS Dependency",
            status: p.details.js_dependent ? "warning" : "success",
            message: p.details.js_dependent ? "High client-side rendering dependency" : "HTML content pre-rendered"
        },
        {
            name: "Image Alt Tags",
            status: p.details.images?.missing_alts_count > 0 ? "warning" : "success",
            message: p.details.images ? `${p.details.images.missing_alts_count} of ${p.details.images.total} images missing alt tags` : "No images found"
        },
        {
            name: "Structured Schema",
            status: p.issues.some(i => i.toLowerCase().includes("schema")) ? "danger" : (p.details.has_schema ? "success" : "info"),
            message: p.details.schemas && p.details.schemas.length > 0 ? `Schemas: ${p.details.schemas.join(", ")}` : "No schema tags found"
        },
        {
            name: "Breadcrumbs",
            status: p.details.has_breadcrumbs ? "success" : "info",
            message: p.details.has_breadcrumbs ? "Breadcrumb navigation detected" : "No breadcrumbs detected"
        },
        {
            name: "Taxonomy Page",
            status: p.issues.some(i => i.toLowerCase().includes("redundant taxonomy")) ? "danger" : "success",
            message: p.details.is_taxonomy ? "WordPress category/tag archive path" : "Standard content path"
        },
        {
            name: "Pagination",
            status: p.details.has_pagination ? "success" : "info",
            message: p.details.has_pagination ? "Rel prev/next or page queries found" : "No pagination markup"
        },
        {
            name: "Robots Noindex",
            status: p.is_noindex ? "warning" : "success",
            message: p.is_noindex ? "noindex flag is present" : "Page is indexable"
        },
        {
            name: "Anchor Texts",
            status: (p.details.links?.empty_anchors > 0 || p.details.links?.generic_anchors > 0) ? "warning" : "success",
            message: p.details.links ? `${p.details.links.empty_anchors} empty, ${p.details.links.generic_anchors} generic anchors` : "No links found"
        },
        {
            name: "Orphan Page",
            status: isOrphan ? "warning" : "success",
            message: isOrphan ? "Listed in sitemap but has no inbound internal links" : "Discovered via crawl linkages"
        }
    ];

    const checklistHtml = checklistItems.map(item => `
        <div class="diagnostic-item ${item.status}">
            <div class="diagnostic-item-header">
                <span class="diagnostic-indicator"></span>
                <strong class="diagnostic-name">${item.name}</strong>
            </div>
            <div class="diagnostic-msg">${escapeHtml(item.message)}</div>
        </div>
    `).join("");

    // Build the Header Hierarchy map
    const headers = p.details.header_hierarchy || [];
    let headersHtml = "";
    if (headers.length === 0) {
        headersHtml = `<div class="empty-text">No header tags (H1-H6) found.</div>`;
    } else {
        headersHtml = headers.map(h => {
            const level = parseInt(h[0][1]);
            const indent = (level - 1) * 16; // 16px indentation per level
            return `
                <div class="tree-node" style="padding-left: ${indent}px">
                    <span class="tree-badge level-${level}">${h[0].toUpperCase()}</span>
                    <span class="tree-text">${escapeHtml(h[1])}</span>
                </div>
            `;
        }).join("");
    }

    // Build Schemas List
    const schemas = p.details.schemas || [];
    let schemasHtml = "";
    if (schemas.length === 0) {
        schemasHtml = `<div class="empty-text">No structured data schemas found.</div>`;
    } else {
        schemasHtml = `<div class="schema-badge-container">` + 
            schemas.map(s => `<span class="schema-badge">${escapeHtml(s)}</span>`).join("") + 
            `</div>`;
    }

    // Build Image details
    const images = p.details.images || { total: 0, missing_alts_count: 0, missing_alts: [] };
    let imagesHtml = "";
    if (images.total === 0) {
        imagesHtml = `<div class="empty-text">No images found on this page.</div>`;
    } else {
        imagesHtml = `
            <div class="audit-summary-line"><strong>Total Images:</strong> ${images.total}</div>
            <div class="audit-summary-line"><strong>Missing Alt Tags:</strong> <span class="${images.missing_alts_count > 0 ? 'text-warning font-semibold' : ''}">${images.missing_alts_count}</span></div>
        `;
        if (images.missing_alts && images.missing_alts.length > 0) {
            imagesHtml += `<ul class="audit-list">`;
            images.missing_alts.forEach(src => {
                imagesHtml += `<li class="word-break">${escapeHtml(src)}</li>`;
            });
            imagesHtml += `</ul>`;
            if (images.missing_alts_count > images.missing_alts.length) {
                imagesHtml += `<div class="text-muted text-sm">+ ${images.missing_alts_count - images.missing_alts.length} more images missing alts</div>`;
            }
        }
    }

    // Build Link Anchors
    const links = p.details.links || { total: 0, empty_anchors: 0, generic_anchors: 0 };
    let linksHtml = "";
    if (links.total === 0) {
        linksHtml = `<div class="empty-text">No links found on this page.</div>`;
    } else {
        linksHtml = `
            <div class="audit-summary-line"><strong>Total Links:</strong> ${links.total}</div>
            <div class="audit-summary-line"><strong>Empty Anchor Text:</strong> <span class="${links.empty_anchors > 0 ? 'text-warning font-semibold' : ''}">${links.empty_anchors}</span></div>
            <div class="audit-summary-line"><strong>Generic Anchor Text:</strong> <span class="${links.generic_anchors > 0 ? 'text-warning font-semibold' : ''}">${links.generic_anchors}</span></div>
        `;
    }

    return `
        <div class="diagnostic-panel">
            <div class="diagnostic-grid">
                <div class="diagnostic-section checklist-section">
                    <h3>Technical Checklist (16 Audits)</h3>
                    <div class="checklist-grid">
                        ${checklistHtml}
                    </div>
                </div>
                <div class="diagnostic-section structure-section">
                    <h3>Header Hierarchy Map</h3>
                    <div class="header-tree">
                        ${headersHtml}
                    </div>
                </div>
            </div>
            
            <div class="diagnostic-details-row">
                <div class="detail-block">
                    <h3>Structured Data Schemas</h3>
                    ${schemasHtml}
                </div>
                <div class="detail-block">
                    <h3>Alt Attributes & Images</h3>
                    ${imagesHtml}
                </div>
                <div class="detail-block">
                    <h3>Link Anchor Audit</h3>
                    ${linksHtml}
                </div>
            </div>
        </div>
    `;
}

function escapeHtml(str) {
    if (!str) return "";
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function filterAuditPages() {
    if (!currentOpenAuditRunId) return;
    // Server-side filtering resets back to page 1
    loadAuditDetails(currentOpenAuditRunId, 1);
}

function setAuditMetricFilter(filterValue) {
    const filterSelect = document.getElementById("audit-page-filter");
    if (filterSelect) {
        filterSelect.value = filterValue;
        filterAuditPages();
    }
}

async function handleCancelAudit() {
    if (!currentOpenAuditRunId) return;
    try {
        const response = await fetch(`/api/audit/run/${currentOpenAuditRunId}/cancel`, { method: "POST" });
        if (response.ok) {
            alert("Cancellation request sent.");
            loadAuditDetails(currentOpenAuditRunId);
        }
    } catch (e) {
        alert("Failed to cancel audit run.");
    }
}

async function deleteAuditRun(runId) {
    if (!confirm("Are you sure you want to delete this site audit run?")) return;
    try {
        const response = await fetch(`/api/audit/run/${runId}`, { method: "DELETE" });
        if (response.ok) {
            loadAuditHistory();
            if (currentOpenAuditRunId === runId) {
                closeAuditDetails();
            }
        }
    } catch (e) {
        alert("Failed to delete audit run.");
    }
}

function closeAuditDetails() {
    document.getElementById("audit-detail-container").classList.add("hidden");
    currentOpenAuditRunId = null;
}

// ----------------- MODULE 2: CONTENT OPTIMIZER -----------------

async function handleOptimizerScan(e) {
    e.preventDefault();
    const kw = document.getElementById("opt-keyword").value;
    
    const loadingEl = document.getElementById("opt-loading");
    const formEl = document.getElementById("optimizer-form");
    
    loadingEl.classList.remove("hidden");
    formEl.classList.add("hidden");
    
    try {
        const response = await fetch("/api/optimizer/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword: kw })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Scanning failed");
        }
        
        const result = await response.json();
        activeOptimizerData = result;
        
        // Hide setup panel, show editor workspace
        document.getElementById("optimizer-setup").classList.add("hidden");
        document.getElementById("optimizer-workspace").classList.remove("hidden");
        
        renderOptimizerWorkspace();
    } catch (err) {
        alert("Semantic Optimization Error: " + err.message);
    } finally {
        loadingEl.classList.add("hidden");
        formEl.classList.remove("hidden");
    }
}

function renderOptimizerWorkspace() {
    if (!activeOptimizerData) return;
    
    // Clear text editor
    document.getElementById("opt-text-editor").value = "";
    document.getElementById("editor-word-count").innerText = "0";
    document.getElementById("opt-score").innerText = "0";
    document.getElementById("opt-score-desc").innerText = "Start writing to score your article against competitor entities.";

    // Render Entities List
    const listEl = document.getElementById("recommended-entities-list");
    listEl.innerHTML = activeOptimizerData.entities.map(ent => `
        <span class="entity-chip" id="chip-${ent.phrase.replace(/\s+/g, '-')}" data-phrase="${ent.phrase}">
            ${ent.phrase} <small class="text-muted">(${ent.count}x)</small>
        </span>
    `).join("");

    // Render Competitor URLs
    const compEl = document.getElementById("opt-competitors-list");
    compEl.innerHTML = activeOptimizerData.competitor_urls.map(url => `
        <li><a href="${url}" target="_blank" rel="noopener">${url}</a></li>
    `).join("");
}

function analyzeDraftText() {
    if (!activeOptimizerData) return;
    
    const text = document.getElementById("opt-text-editor").value.toLowerCase();
    
    // Calculate word count
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    document.getElementById("editor-word-count").innerText = words;

    let matchedCount = 0;
    const totalEntities = activeOptimizerData.entities.length;
    
    // Check match for each chip
    document.querySelectorAll(".entity-chip").forEach(chip => {
        const phrase = chip.getAttribute("data-phrase");
        
        // Simple regex matching the phrase inside boundaries
        const regex = new RegExp(`\\b${phrase}\\b`, "i");
        if (regex.test(text)) {
            chip.classList.add("matched");
            matchedCount++;
        } else {
            chip.classList.remove("matched");
        }
    });

    // Score calculation (matched ratio)
    const score = totalEntities > 0 ? Math.round((matchedCount / totalEntities) * 100) : 0;
    document.getElementById("opt-score").innerText = score;
    
    // Update progress feedback description
    const descEl = document.getElementById("opt-score-desc");
    if (score < 20) {
        descEl.innerText = "Focus on introducing basic competitive terms to capture user search intent.";
    } else if (score < 50) {
        descEl.innerText = "Making progress! Build descriptive sentences incorporating more of the highlighted keyphrases.";
    } else if (score < 80) {
        descEl.innerText = "Good keyword density. Ensure terms are integrated naturally without keyword stuffing.";
    } else {
        descEl.innerText = "Excellent semantic compliance! Your article is fully optimized for local search indexes.";
    }
}

function closeOptimizerWorkspace() {
    document.getElementById("optimizer-workspace").classList.add("hidden");
    document.getElementById("optimizer-setup").classList.remove("hidden");
    activeOptimizerData = null;
}

// ----------------- MODULE 3: KEYWORD RANK MONITOR -----------------

function openNewKeywordModal() {
    document.getElementById("modal-keyword").classList.remove("hidden");
}

async function handleAddKeyword(e) {
    e.preventDefault();
    const keyword = document.getElementById("track-keyword").value;
    const domain = document.getElementById("track-domain").value;
    const geo = document.getElementById("track-geo").value;
    const lang = document.getElementById("track-lang").value;
    
    closeModal("modal-keyword");
    
    try {
        const response = await fetch("/api/keywords", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keyword, target_domain: domain, target_geolocation: geo, target_locale: lang })
        });
        
        if (response.ok) {
            loadTrackedKeywords();
        } else {
            const err = await response.json();
            alert("Error: " + err.detail);
        }
    } catch (e) {
        alert("Failed to track keyword.");
    }
}

async function loadTrackedKeywords() {
    try {
        const response = await fetch("/api/keywords");
        trackedKeywords = await response.json();
        
        const tbody = document.querySelector("#tracker-keywords-table tbody");
        if (trackedKeywords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No tracked keywords. Add one to start monitoring rankings.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = trackedKeywords.map(k => `
            <tr>
                <td><strong>${k.keyword}</strong></td>
                <td>${k.target_domain}</td>
                <td><span class="badge badge-secondary">${k.target_geolocation}</span></td>
                <td>${k.rank_position !== null ? `<span class="badge badge-success">#${k.rank_position}</span>` : `<span class="badge badge-danger">Not in Top 100</span>`}</td>
                <td class="word-break">${k.ranking_url ? `<a href="${k.ranking_url}" target="_blank" rel="noopener">${k.ranking_url}</a>` : "--"}</td>
                <td>${k.checked_at ? formatDate(k.checked_at) : "Never"}</td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="viewKeywordHistory(${k.id}, '${k.keyword}', '${k.target_domain}')">History</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTrackedKeyword(${k.id})">Delete</button>
                </td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Failed to load tracked keywords:", e);
    }
}

async function triggerRankChecks() {
    const btn = document.getElementById("trigger-ranks-btn");
    btn.disabled = true;
    btn.innerText = "Triggering...";
    
    try {
        const res = await fetch("/api/keywords/trigger", { method: "POST" });
        if (res.ok) {
            document.getElementById("tracker-running-indicator").classList.remove("hidden");
            setTimeout(() => {
                document.getElementById("tracker-running-indicator").classList.add("hidden");
                loadTrackedKeywords();
            }, 8000);
        }
    } catch (e) {
        alert("Failed to trigger rank check.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Check Ranks Now";
    }
}

async function deleteTrackedKeyword(kwId) {
    if (!confirm("Stop tracking this keyword? Historical rankings will be deleted.")) return;
    try {
        const response = await fetch(`/api/keywords/${kwId}`, { method: "DELETE" });
        if (response.ok) {
            loadTrackedKeywords();
            closeKeywordHistory();
        }
    } catch (e) {
        alert("Failed to delete tracked keyword.");
    }
}

async function viewKeywordHistory(kwId, keyword, domain) {
    try {
        const res = await fetch(`/api/keywords/${kwId}/history`);
        const history = await res.json();
        
        document.getElementById("keyword-history-container").classList.remove("hidden");
        document.getElementById("history-keyword-title").innerText = `Ranking Position History: '${keyword}'`;
        document.getElementById("history-keyword-subtitle").innerText = domain;
        
        renderHistoricalChart(history);
    } catch (e) {
        console.error("Failed to fetch keyword history:", e);
    }
}

function closeKeywordHistory() {
    document.getElementById("keyword-history-container").classList.add("hidden");
}

// ----------------- SVG CUSTOM LINE CHART RENDERER -----------------

function renderHistoricalChart(history) {
    const svg = document.getElementById("history-svg-chart");
    svg.innerHTML = ""; // clear previous draw
    
    if (history.length === 0) {
        svg.innerHTML = `<text x="400" y="150" text-anchor="middle" class="chart-text">No rank tracking history available for this keyword yet.</text>`;
        return;
    }

    const width = 800;
    const height = 300;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };
    
    // Add linear gradient for chart line
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="chart-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
    `;
    svg.appendChild(defs);

    // Compute coordinate scales
    // Rank positions are 1 to 100. Lower values are physically higher up the chart!
    // If not ranked (NULL/None), draw at position 100/lowest.
    const maxRank = 100;
    const minRank = 1;
    
    const count = history.length;
    const xStep = (width - padding.left - padding.right) / (count > 1 ? count - 1 : 1);
    
    let points = [];
    
    // 1. Draw horizontal grid lines (Rank 1, Rank 10, Rank 25, Rank 50, Rank 75, Rank 100)
    const gridYVals = [1, 10, 25, 50, 75, 100];
    gridYVals.forEach(yVal => {
        const yPct = (yVal - minRank) / (maxRank - minRank);
        const yCoord = padding.top + yPct * (height - padding.top - padding.bottom);
        
        // Grid line path
        const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLine.setAttribute("x1", padding.left);
        gridLine.setAttribute("y1", yCoord);
        gridLine.setAttribute("x2", width - padding.right);
        gridLine.setAttribute("y2", yCoord);
        gridLine.setAttribute("class", "chart-grid");
        svg.appendChild(gridLine);
        
        // Label
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", padding.left - 10);
        label.setAttribute("y", yCoord + 4);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("class", "chart-text");
        label.textContent = `#${yVal}`;
        svg.appendChild(label);
    });

    // 2. Draw dates / plot points
    history.forEach((point, index) => {
        const rank = point.rank_position !== null ? point.rank_position : 100;
        
        const xCoord = padding.left + index * xStep;
        const yPct = (rank - minRank) / (maxRank - minRank);
        const yCoord = padding.top + yPct * (height - padding.top - padding.bottom);
        
        points.push(`${xCoord},${yCoord}`);
        
        // Horizontal Date text labeling (Skip to avoid overlaps if count > 10)
        if (count < 10 || index % Math.ceil(count / 10) === 0 || index === count - 1) {
            const dtText = point.checked_at.split(" ")[0].slice(5); // MM-DD format
            const dateLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
            dateLabel.setAttribute("x", xCoord);
            dateLabel.setAttribute("y", height - padding.bottom + 20);
            dateLabel.setAttribute("text-anchor", "middle");
            dateLabel.setAttribute("class", "chart-text");
            dateLabel.textContent = dtText;
            svg.appendChild(dateLabel);
        }
        
        // Interactive Circles
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", xCoord);
        dot.setAttribute("cy", yCoord);
        dot.setAttribute("r", "5");
        dot.setAttribute("class", "chart-dot");
        
        // Tooltip description
        const tooltipText = `Rank: ${point.rank_position !== null ? `#${point.rank_position}` : 'N/A'} checked ${point.checked_at.split(" ")[0]}`;
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = tooltipText;
        dot.appendChild(title);
        
        svg.appendChild(dot);
    });

    // 3. Draw chart lines joining coordinate points
    if (count > 1) {
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", points.join(" "));
        polyline.setAttribute("class", "chart-line");
        svg.insertBefore(polyline, svg.firstChild.nextSibling); // insert below dots
    }
}

// ----------------- CLIENT-SIDE CSV EXPORT SYSTEM -----------------

async function exportAuditCSV() {
    if (!currentOpenAuditRunId) return;
    
    try {
        const response = await fetch(`/api/audit/run/${currentOpenAuditRunId}/pages/all`);
        const data = await response.json();
        const pages = data.pages;
        
        if (!pages || pages.length === 0) return;
        
        // Header
        let csvContent = "URL,Status Code,Title Tag,Meta Description,H1 Tag,Is Broken,Has Redirect,Redirect URL,Crawled At\r\n";
        
        // Row mapping
        pages.forEach(p => {
            const row = [
                escapeCSV(p.url),
                p.status_code || "",
                escapeCSV(p.title_tag || ""),
                escapeCSV(p.meta_description || ""),
                escapeCSV(p.h1_tag || ""),
                p.is_broken ? "Yes" : "No",
                p.has_redirect ? "Yes" : "No",
                escapeCSV(p.redirect_url || ""),
                p.crawled_at
            ];
            csvContent += row.join(",") + "\r\n";
        });
        
        downloadCSVBlob(csvContent, `site_audit_${document.getElementById("audit-detail-domain").innerText}.csv`);
    } catch (e) {
        console.error("Failed to export audit CSV:", e);
        alert("Failed to generate CSV export.");
    }
}

function exportKeywordsCSV() {
    if (trackedKeywords.length === 0) return;
    
    // Header
    let csvContent = "Keyword,Target Domain,Geo,Locale,Current Rank,Ranking URL,Last Checked\r\n";
    
    // Row mapping
    trackedKeywords.forEach(k => {
        const row = [
            escapeCSV(k.keyword),
            escapeCSV(k.target_domain),
            escapeCSV(k.target_geolocation),
            escapeCSV(k.target_locale),
            k.rank_position !== null ? k.rank_position : "Not in Top 100",
            escapeCSV(k.ranking_url || ""),
            k.checked_at || "Never"
        ];
        csvContent += row.join(",") + "\r\n";
    });
    
    downloadCSVBlob(csvContent, "tracked_keywords_ranking.csv");
}

function escapeCSV(val) {
    if (val === null) return '""';
    let text = val.toString().replace(/"/g, '""');
    return `"${text}"`;
}

function downloadCSVBlob(csvString, filename) {
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// ----------------- MODULE 4: PERFORMANCE AUDIT -----------------

let performanceInterval = null;
let currentOpenPerformanceRunId = null;

function openNewPerformanceModal() {
    document.getElementById("perf-url").value = "https://";
    document.getElementById("perf-strategy").value = "mobile";
    document.getElementById("modal-performance").classList.remove("hidden");
}

async function handleStartPerformanceAudit(e) {
    e.preventDefault();
    const url = document.getElementById("perf-url").value;
    const strategy = document.getElementById("perf-strategy").value;
    
    closeModal("modal-performance");
    
    try {
        const response = await fetch("/api/performance/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, strategy })
        });
        
        if (response.ok) {
            loadPerformanceHistory();
            switchView("performance");
            startPerformancePolling();
        } else {
            const err = await response.json();
            alert("Error: " + err.detail);
        }
    } catch (e) {
        alert("Failed to start performance audit.");
    }
}

async function loadPerformanceHistory() {
    try {
        const response = await fetch("/api/performance/runs");
        const runs = await response.json();
        
        const tbody = document.querySelector("#performance-runs-table tbody");
        if (runs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No audits executed. Click 'New Performance Scan' to start.</td></tr>`;
            stopPerformancePolling();
            return;
        }
        
        let hasActiveRuns = false;
        
        tbody.innerHTML = runs.map(r => {
            const isActive = r.status === "pending" || r.status === "running";
            if (isActive) hasActiveRuns = true;
            
            const lcp = r.lcp !== null ? `${r.lcp}s` : "--";
            const inp = r.inp !== null ? `${r.inp}ms` : "--";
            const cls = r.cls !== null ? r.cls : "--";
            const ttfb = r.ttfb !== null ? `${r.ttfb}ms` : "--";
            
            const strategyLabel = r.strategy === "desktop" ? "Desktop" : "Mobile";
            
            return `
                <tr>
                    <td class="word-break"><strong>${r.url}</strong></td>
                    <td><span class="badge badge-secondary">${strategyLabel}</span></td>
                    <td><span class="badge ${getBadgeClass(r.status)}">${r.status}</span></td>
                    <td>${lcp}</td>
                    <td>${inp}</td>
                    <td>${cls}</td>
                    <td>${ttfb}</td>
                    <td>${formatDate(r.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-secondary" onclick="loadPerformanceDetails(${r.id})">Open Details</button>
                        <button class="btn btn-sm btn-danger" onclick="deletePerformanceRun(${r.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join("");
        
        if (hasActiveRuns) {
            startPerformancePolling();
        } else {
            stopPerformancePolling();
        }
        
        // If details panel is open and running, refresh it
        if (currentOpenPerformanceRunId !== null) {
            const currentRun = runs.find(r => r.id === currentOpenPerformanceRunId);
            if (currentRun && (currentRun.status === "completed" || currentRun.status === "failed")) {
                loadPerformanceDetails(currentOpenPerformanceRunId);
            }
        }
    } catch (e) {
        console.error("Failed to load performance history:", e);
    }
}

function startPerformancePolling() {
    if (performanceInterval === null) {
        performanceInterval = setInterval(loadPerformanceHistory, 3000);
    }
}

function stopPerformancePolling() {
    if (performanceInterval !== null) {
        clearInterval(performanceInterval);
        performanceInterval = null;
    }
}

async function deletePerformanceRun(runId) {
    if (!confirm("Delete this performance audit run?")) return;
    try {
        const response = await fetch(`/api/performance/run/${runId}`, { method: "DELETE" });
        if (response.ok) {
            if (currentOpenPerformanceRunId === runId) {
                closePerformanceDetails();
            }
            loadPerformanceHistory();
        }
    } catch (e) {
        alert("Failed to delete performance run.");
    }
}

async function loadPerformanceDetails(runId) {
    currentOpenPerformanceRunId = runId;
    
    try {
        const response = await fetch(`/api/performance/run/${runId}`);
        const run = await response.json();
        
        document.getElementById("performance-history-container").classList.add("hidden");
        document.getElementById("performance-detail-container").classList.remove("hidden");
        
        document.getElementById("perf-detail-url").innerText = run.url;
        document.getElementById("perf-detail-strategy-badge").innerText = run.strategy === "desktop" ? "Desktop Strategy" : "Mobile Strategy";
        
        const statusBadge = document.getElementById("perf-detail-status-badge");
        statusBadge.innerText = run.status;
        statusBadge.className = `badge ${getBadgeClass(run.status)}`;
        
        if (run.status === "pending" || run.status === "running") {
            // Show loading placeholder in details
            setGaugesLoading();
            setSecondaryMetricsLoading();
            return;
        }
        
        if (run.status === "failed") {
            setGaugesFailed();
            setSecondaryMetricsFailed();
            return;
        }
        
        // Populate completed details
        // Gauges
        renderGaugeMetrics(run);
        
        // DOM Metrics
        const details = run.details || {};
        const domSize = run.dom_size || 0;
        const domDepth = details.dom_depth || 0;
        
        document.getElementById("perf-dom-size").innerText = domSize;
        const domSizePct = Math.min(100, (domSize / 1500) * 100);
        const domSizeBar = document.getElementById("perf-dom-size-bar");
        domSizeBar.style.width = `${domSizePct}%`;
        domSizeBar.className = `dom-bar-fill ${domSize < 1500 ? 'bg-success' : 'bg-danger'}`;
        document.getElementById("perf-dom-size-status").innerText = domSize < 1500 ? "Good: Under 1,500 target" : "Warning: Over 1,500 target nodes";
        
        document.getElementById("perf-dom-depth").innerText = domDepth;
        const domDepthPct = Math.min(100, (domDepth / 32) * 100);
        const domDepthBar = document.getElementById("perf-dom-depth-bar");
        domDepthBar.style.width = `${domDepthPct}%`;
        domDepthBar.className = `dom-bar-fill ${domDepth < 32 ? 'bg-success' : 'bg-danger'}`;
        document.getElementById("perf-dom-depth-status").innerText = domDepth < 32 ? "Good: Under 32 levels target" : "Warning: Deep DOM nodes detected";
        
        // Image Optimization Metrics
        const images = details.images || [];
        const totalImgs = images.length;
        const webpCount = images.filter(i => i.isNextGen).length;
        const lazyCount = images.filter(i => i.hasLazy).length;
        const dimsCount = images.filter(i => i.hasDims).length;
        
        const webpPct = totalImgs > 0 ? Math.round((webpCount / totalImgs) * 100) : 100;
        const lazyPct = totalImgs > 0 ? Math.round((lazyCount / totalImgs) * 100) : 100;
        const dimsPct = totalImgs > 0 ? Math.round((dimsCount / totalImgs) * 100) : 100;
        
        document.getElementById("img-total-checked").innerText = totalImgs;
        
        const pctWebpEl = document.getElementById("img-pct-webp");
        pctWebpEl.innerText = `${webpPct}%`;
        pctWebpEl.className = webpPct >= 80 ? "text-success" : (webpPct >= 50 ? "text-warning" : "text-danger");
        
        const pctLazyEl = document.getElementById("img-pct-lazy");
        pctLazyEl.innerText = `${lazyPct}%`;
        pctLazyEl.className = lazyPct >= 80 ? "text-success" : (lazyPct >= 50 ? "text-warning" : "text-danger");
        
        const pctDimsEl = document.getElementById("img-pct-dimensions");
        pctDimsEl.innerText = `${dimsPct}%`;
        pctDimsEl.className = dimsPct >= 80 ? "text-success" : (dimsPct >= 50 ? "text-warning" : "text-danger");
        
        // Image warnings list
        const warningsList = document.getElementById("img-warnings-list");
        const warningImages = [];
        
        images.forEach(img => {
            let issues = [];
            if (!img.isNextGen) issues.push("Non-nextgen format");
            if (!img.hasLazy) issues.push("Missing lazy-loading");
            if (!img.hasDims) issues.push("Missing explicit dimensions");
            
            if (issues.length > 0) {
                warningImages.push(`<li><strong>${img.src}</strong>: ${issues.join(", ")}</li>`);
            }
        });
        
        if (warningImages.length === 0) {
            warningsList.innerHTML = `<li style="border-left-color: var(--success-color)">No optimization issues found. All images follow best practices!</li>`;
        } else {
            warningsList.innerHTML = warningImages.join("");
        }
        
        // Caching & CDN Summary
        const cdnVendor = details.cdn_detection || "None";
        const cacheSummary = details.caching_summary || {};
        const cacheRatio = cacheSummary.cached_percentage !== undefined ? `${cacheSummary.cached_percentage}%` : "0%";
        
        const cdnVendorEl = document.getElementById("caching-cdn-vendor");
        cdnVendorEl.innerText = cdnVendor;
        cdnVendorEl.className = `badge ${cdnVendor !== "None" && cdnVendor !== "No CDN detected" ? 'badge-success' : 'badge-secondary'}`;
        
        const cachingRatioEl = document.getElementById("caching-ratio");
        cachingRatioEl.innerText = cacheRatio;
        const cacheRatioVal = cacheSummary.cached_percentage || 0;
        cachingRatioEl.className = `val ${cacheRatioVal >= 60 ? 'text-success' : (cacheRatioVal >= 30 ? 'text-warning' : 'text-danger')}`;
        
        // Asset headers table
        const assets = details.assets_details || [];
        const cachingTableBody = document.querySelector("#caching-assets-table tbody");
        if (assets.length === 0) {
            cachingTableBody.innerHTML = `<tr><td colspan="4" class="empty-state">No static assets detected during run.</td></tr>`;
        } else {
            cachingTableBody.innerHTML = assets.map(a => `
                <tr>
                    <td class="word-break">${a.url}</td>
                    <td><span class="badge badge-secondary">${a.type.toUpperCase()}</span></td>
                    <td><code>${a.cache_control || "N/A"}</code></td>
                    <td>
                        <span class="badge ${a.is_cdn ? 'badge-success' : 'badge-secondary'}">${a.is_cdn ? 'CDN Served' : 'Direct Server'}</span>
                        <span class="badge ${a.is_cached ? 'badge-success' : 'badge-danger'}">${a.is_cached ? 'Cached' : 'Uncached'}</span>
                    </td>
                </tr>
            `).join("");
        }
    } catch (e) {
        console.error("Failed to load performance details:", e);
    }
}

function renderGaugeMetrics(run) {
    // LCP
    let lcpVal = run.lcp;
    let lcpColor = "success";
    let lcpStatus = "Good";
    let lcpPct = Math.max(0, Math.min(1, (10 - lcpVal) / 10));
    if (lcpVal > 4.0) { lcpColor = "danger"; lcpStatus = "Poor"; }
    else if (lcpVal > 2.5) { lcpColor = "warning"; lcpStatus = "Needs Improvement"; }
    updateGauge("lcp", `${lcpVal}s`, lcpStatus, lcpColor, lcpPct);
    
    // INP
    let inpVal = run.inp;
    let inpColor = "success";
    let inpStatus = "Good";
    let inpPct = Math.max(0, Math.min(1, (1000 - inpVal) / 1000));
    if (inpVal > 500) { inpColor = "danger"; inpStatus = "Poor"; }
    else if (inpVal > 200) { inpColor = "warning"; inpStatus = "Needs Improvement"; }
    updateGauge("inp", `${inpVal}ms`, inpStatus, inpColor, inpPct);
    
    // CLS
    let clsVal = run.cls;
    let clsColor = "success";
    let clsStatus = "Good";
    let clsPct = Math.max(0, Math.min(1, (1.0 - clsVal) / 1.0));
    if (clsVal > 0.25) { clsColor = "danger"; clsStatus = "Poor"; }
    else if (clsVal > 0.1) { clsColor = "warning"; clsStatus = "Needs Improvement"; }
    updateGauge("cls", `${clsVal}`, clsStatus, clsColor, clsPct);
    
    // TTFB
    let ttfbVal = run.ttfb;
    let ttfbColor = "success";
    let ttfbStatus = "Good";
    let ttfbPct = Math.max(0, Math.min(1, (3000 - ttfbVal) / 3000));
    if (ttfbVal > 1500) { ttfbColor = "danger"; ttfbStatus = "Poor"; }
    else if (ttfbVal > 600) { ttfbColor = "warning"; ttfbStatus = "Needs Improvement"; }
    updateGauge("ttfb", `${ttfbVal}ms`, ttfbStatus, ttfbColor, ttfbPct);
}

function updateGauge(metric, val, status, colorClass, pct) {
    const circle = document.getElementById(`gauge-${metric}-circle`);
    const valText = document.getElementById(`gauge-${metric}-value`);
    const statusText = document.getElementById(`gauge-${metric}-status`);
    const card = document.getElementById(`gauge-${metric}-card`);
    
    valText.innerText = val;
    statusText.innerText = status;
    
    statusText.className = `gauge-badge badge badge-${colorClass}`;
    card.className = `gauge-card border-${colorClass}`;
    
    const circum = 251.2;
    const offset = circum - (pct * circum);
    circle.setAttribute("stroke-dashoffset", offset);
    circle.className.baseVal = `gauge-value-circle stroke-${colorClass}`;
}

function setGaugesLoading() {
    const metrics = ["lcp", "inp", "cls", "ttfb"];
    metrics.forEach(m => {
        updateGauge(m, "Testing...", "Running", "warning", 0.5);
    });
}

function setGaugesFailed() {
    const metrics = ["lcp", "inp", "cls", "ttfb"];
    metrics.forEach(m => {
        updateGauge(m, "Error", "Failed", "danger", 0);
    });
}

function setSecondaryMetricsLoading() {
    document.getElementById("perf-dom-size").innerText = "Analyzing...";
    document.getElementById("perf-dom-depth").innerText = "Analyzing...";
    document.getElementById("img-total-checked").innerText = "0";
    document.getElementById("img-pct-webp").innerText = "--";
    document.getElementById("img-pct-lazy").innerText = "--";
    document.getElementById("img-pct-dimensions").innerText = "--";
    document.getElementById("img-warnings-list").innerHTML = "<li>Audit in progress... Please wait.</li>";
    document.getElementById("caching-cdn-vendor").innerText = "Checking...";
    document.getElementById("caching-ratio").innerText = "--";
    document.querySelector("#caching-assets-table tbody").innerHTML = `<tr><td colspan="4" class="empty-state">Audit running. Waiting for assets data...</td></tr>`;
}

function setSecondaryMetricsFailed() {
    document.getElementById("perf-dom-size").innerText = "Failed";
    document.getElementById("perf-dom-depth").innerText = "Failed";
    document.getElementById("img-warnings-list").innerHTML = "<li style='border-left-color: var(--danger-color)'>Audit failed. Could not scrape image parameters.</li>";
    document.querySelector("#caching-assets-table tbody").innerHTML = `<tr><td colspan="4" class="empty-state text-danger">Audit failed.</td></tr>`;
}

function closePerformanceDetails() {
    currentOpenPerformanceRunId = null;
    document.getElementById("performance-detail-container").classList.add("hidden");
    document.getElementById("performance-history-container").classList.remove("hidden");
}

// ----------------- CORE UTILITY FORMATTERS -----------------

function getBadgeClass(status) {
    if (status === "completed" || status === "success") return "badge-success";
    if (status === "running" || status === "pending") return "badge-warning";
    return "badge-danger";
}

function formatDate(dateStr) {
    if (!dateStr) return "--";
    // standard date formatting (SQLite timestamp is YYYY-MM-DD HH:MM:SS)
    const date = new Date(dateStr.replace(" ", "T") + "Z");
    return date.toLocaleString();
}
