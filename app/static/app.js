// ==========================================================================
// SEO KING APPLICATION ARCHITECTURE (FRONTEND CLIENT)
// ==========================================================================

// Global state variables
let currentUser = null;
let currentSettings = {};
let activeView = "dashboard";
let socket = null;
let currentAudienceLens = "non-technical";

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
    handleHashRouting();
}

// ----------------- EVENT LISTENERS SETUP -----------------

function setupEventListeners() {
    // Sidebar menu clicks
    document.querySelectorAll(".menu-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const target = item.getAttribute("data-target");
            window.location.hash = '#/' + target;
        });
    });

    // Hash routing
    window.addEventListener("hashchange", handleHashRouting);

    // Theme toggle button click
    document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);

    // Global Audience Lens
    const lensSelect = document.getElementById("global-lens-select");
    if (lensSelect) {
        lensSelect.addEventListener("change", (e) => {
            currentAudienceLens = e.target.value;
            // Update document attribute for CSS targeting
            document.documentElement.setAttribute("data-lens", currentAudienceLens);
            // Refresh audit list if open
            if (activeView === "audit" && currentOpenAuditRunId) {
                renderIssuesTabList();
            }
        });
    }

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
    document.getElementById("go-to-register").addEventListener("click", (e) => {
        e.preventDefault();
        showAuthSection("register-form");
    });
    document.getElementById("register-to-login").addEventListener("click", (e) => {
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

// ----------------- CLIENT ROUTER -----------------
function handleHashRouting() {
    let hash = window.location.hash.substring(2); // remove '#/'
    if (!hash) {
        hash = "dashboard";
    }
    
    if (hash.startsWith("tools/")) {
        let toolId = hash.split("/")[1];
        let queryString = "";
        if (toolId && toolId.includes("?")) {
            const parts = toolId.split("?");
            toolId = parts[0];
            queryString = "?" + parts[1];
        }
        switchView("single-tool"); 
        
        // Highlight tools hub in sidebar
        document.querySelectorAll(".menu-item").forEach(item => {
            if (item.getAttribute("data-target") === "tools-hub") {
                item.classList.add("active");
            }
        });
        document.getElementById("breadcrumb-current").innerText = "Tools";

        if (typeof renderSingleTool === 'function') {
            renderSingleTool(toolId, queryString);
        }
    } else {
        switchView(hash);
    }
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
    } else if (viewName === "tools-hub") {
        if(typeof initToolsHub === 'function') initToolsHub();
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
        setTheme(currentSettings.theme || "light");
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}

async function loadSettingsToForm() {
    await loadSettings();
    document.getElementById("pref-theme").value = currentSettings.theme || "light";
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
        
        // Find the latest completed run to calculate site health
        const latestCompleted = runs.find(r => r.status === "completed");
        if (latestCompleted) {
            try {
                const limit = parseInt(currentSettings.audit_pagination_limit || "100");
                const detailRes = await fetch(`/api/audit/run/${latestCompleted.id}?page=1&limit=${limit}&filter_type=all`);
                const detailData = await detailRes.json();
                document.getElementById("ledger-last-run").innerText = "Last Audit: " + formatDate(latestCompleted.completed_at || latestCompleted.started_at);
                renderRiskLedger(detailData.issues);
            } catch (e) {
                console.error("Failed to load latest audit health for dashboard:", e);
                document.getElementById("dash-site-health").innerText = "--";
            }
        } else {
            document.getElementById("ledger-last-run").innerText = "No recent audits";
            document.getElementById("risk-ledger-content").innerHTML = `<div class="empty-state">Run a Site Audit to populate the Risk Ledger.</div>`;
        }
        
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

function renderRiskLedger(issuesList) {
    if (!issuesList || issuesList.length === 0) {
        document.getElementById("risk-ledger-content").innerHTML = `<div class="empty-state">No issues found in the latest audit!</div>`;
        return;
    }
    
    // Group issues by category logic similar to getCategoryFromIssueName
    const categoryCounts = {
        "Indexability": { errors: 0, warnings: 0, notices: 0 },
        "Content": { errors: 0, warnings: 0, notices: 0 },
        "Links": { errors: 0, warnings: 0, notices: 0 },
        "Performance": { errors: 0, warnings: 0, notices: 0 },
        "Other": { errors: 0, warnings: 0, notices: 0 }
    };
    
    issuesList.forEach(iss => {
        const cat = getCategoryFromIssueName(iss.name);
        const mappedCat = categoryCounts[cat] ? cat : "Other";
        if (iss.severity === "error" || iss.severity === "errors") categoryCounts[mappedCat].errors++;
        else if (iss.severity === "warning" || iss.severity === "warnings") categoryCounts[mappedCat].warnings++;
        else categoryCounts[mappedCat].notices++;
    });
    
    let html = `<div class="risk-ledger-grid" style="display:flex; flex-direction:column; gap: 12px;">`;
    
    for (const [cat, counts] of Object.entries(categoryCounts)) {
        const total = counts.errors + counts.warnings + counts.notices;
        if (total === 0) continue; // Skip empty categories
        
        const errPct = (counts.errors / total) * 100;
        const warnPct = (counts.warnings / total) * 100;
        const notPct = (counts.notices / total) * 100;
        
        html += `
            <div class="ledger-row" style="display:flex; align-items:center; gap: 15px;">
                <div style="width: 120px; font-weight: 600; font-size: 0.9em; text-align: right;">${cat}</div>
                <div style="flex:1; height: 24px; background: #222; border-radius: 4px; overflow: hidden; display: flex;">
                    ${counts.errors > 0 ? `<div style="width: ${errPct}%; background: var(--danger-color);" title="${counts.errors} Errors"></div>` : ''}
                    ${counts.warnings > 0 ? `<div style="width: ${warnPct}%; background: var(--warning-color);" title="${counts.warnings} Warnings"></div>` : ''}
                    ${counts.notices > 0 ? `<div style="width: ${notPct}%; background: var(--success-color);" title="${counts.notices} Notices"></div>` : ''}
                </div>
                <div style="width: 60px; font-size: 0.85em; color: var(--text-muted);">${total} issues</div>
            </div>
        `;
    }
    
    html += `</div>`;
    document.getElementById("risk-ledger-content").innerHTML = html;
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

let allPagesCached = [];
let groupedIssues = { errors: {}, warnings: {}, notices: {} };
let activeIssuesSeverityFilter = "all";
let activeIssuesCategoryFilter = "all";
let activeAuditTab = "overview";
let activePagesSubtab = "pages";
let activeStatsMode = "tile";

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
        
        console.log(`[SEO King] Fetching audit details for run ${runId}: url=${url}`);
        const response = await fetch(url);
        const data = await response.json();
        console.log("[SEO King] Fetched audit details data:", data);
        
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
        normalizePagesIssues(data.pages);
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
        
        // Render gauges and bar charts for Overview panel
        const overallTotal = data.metrics.total;
        const overallHealthy = data.metrics.healthy;
        const healthScore = overallTotal > 0 ? Math.round((overallHealthy / overallTotal) * 100) : 100;
        
        // Update Overview Site Health Gauge
        const healthPath = document.getElementById("gauge-health-path");
        if (healthPath) {
            const offset = 125.6 - (healthScore / 100) * 125.6;
            healthPath.style.strokeDashoffset = offset;
            document.getElementById("gauge-health-val").innerText = healthScore + "%";
        }
        
        // Update Overview Crawled Pages Breakdown bar
        const barEl = document.getElementById("crawled-pages-bar");
        const legendEl = document.getElementById("crawled-pages-legend-list");
        if (barEl && legendEl) {
            const pHealthy = overallTotal > 0 ? (data.metrics.healthy / overallTotal) * 100 : 0;
            const pRedirects = overallTotal > 0 ? (data.metrics.redirects / overallTotal) * 100 : 0;
            const pBroken = overallTotal > 0 ? (data.metrics.broken / overallTotal) * 100 : 0;
            
            barEl.innerHTML = `
                <div style="width: ${pHealthy}%; background-color: var(--success-color);" title="Healthy: ${data.metrics.healthy}"></div>
                <div style="width: ${pRedirects}%; background-color: var(--warning-color);" title="Redirects: ${data.metrics.redirects}"></div>
                <div style="width: ${pBroken}%; background-color: var(--danger-color);" title="Broken: ${data.metrics.broken}"></div>
            `;
            legendEl.innerHTML = `
                <div class="legend-row">
                    <div class="legend-label-wrapper">
                        <span class="legend-dot" style="background-color: var(--success-color);"></span>
                        <span>Healthy (2xx)</span>
                    </div>
                    <strong>${data.metrics.healthy}</strong>
                </div>
                <div class="legend-row">
                    <div class="legend-label-wrapper">
                        <span class="legend-dot" style="background-color: var(--warning-color);"></span>
                        <span>Redirects (3xx)</span>
                    </div>
                    <strong>${data.metrics.redirects}</strong>
                </div>
                <div class="legend-row">
                    <div class="legend-label-wrapper">
                        <span class="legend-dot" style="background-color: var(--danger-color);"></span>
                        <span>Broken (4xx/5xx)</span>
                    </div>
                    <strong>${data.metrics.broken}</strong>
                </div>
            `;
        }
        
        // Update Overview AI Search Health Gauge
        const aiScore = runDetails.ai_search_health !== undefined ? runDetails.ai_search_health : 100;
        const aiPath = document.getElementById("gauge-ai-path");
        if (aiPath) {
            const offset = 125.6 - (aiScore / 100) * 125.6;
            aiPath.style.strokeDashoffset = offset;
            document.getElementById("gauge-ai-val").innerText = aiScore + "%";
            const descEl = document.getElementById("gauge-ai-desc");
            if (descEl) {
                descEl.innerText = aiScore < 80 
                    ? "Warning: Important search pages are blocked from AI agents in robots.txt." 
                    : "Good: robots.txt allows key pages to be crawled by AI search agents.";
            }
        }
        
        // Update Overview Blocked from AI Search Agents List
        const blockedCounts = runDetails.ai_blocked_counts || { "ChatGPT-User": 0, "OAI-SearchBot": 0, "Google-Extended": 0 };
        const agentsListEl = document.getElementById("ai-blocked-agents-list");
        if (agentsListEl) {
            agentsListEl.innerHTML = Object.entries(blockedCounts).map(([agent, count]) => `
                <li>
                    <span>${escapeHtml(agent)}</span>
                    <strong>${count} pages blocked</strong>
                </li>
            `).join("");
        }

        // Fetch ALL pages for the run to process issues categories and stats
        const allPagesRes = await fetch(`/api/audit/run/${runId}/pages/all`);
        const allPagesData = await allPagesRes.json();
        
        normalizePagesIssues(allPagesData.pages);
        processAllPagesData(allPagesData.pages, data.run);
        
        // Initialize chips inside issues tab panel
        renderIssuesCategoryChips();
        
        // Reset/sync tab contents
        switchAuditTab(activeAuditTab);
        
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
        console.error("[SEO King] Failed to load audit details:", e);
    }
}

function normalizePagesIssues(pages) {
    if (!pages) return;
    pages.forEach(p => {
        if (p.issues) {
            p.issues = p.issues.map(iss => {
                if (iss.toLowerCase().includes("missing alt tags")) {
                    return "Missing Alt Tags";
                }
                return iss;
            });
            p.issues = [...new Set(p.issues)];
        }
    });
}

function processAllPagesData(pages, run) {
    allPagesCached = pages;
    
    // Group issues
    groupedIssues = { errors: {}, warnings: {}, notices: {} };
    let errorsCount = 0;
    let warningsCount = 0;
    
    pages.forEach(p => {
        const issues = p.issues || [];
        issues.forEach(issue => {
            const issueLower = issue.toLowerCase();
            let cat = "notices";
            if (issueLower.includes("broken") || issueLower.includes("error") || issueLower.includes("failure")) {
                cat = "errors";
                errorsCount++;
            } else if (
                issueLower.includes("missing") || 
                issueLower.includes("too short") || 
                issueLower.includes("too long") || 
                issueLower.includes("thin") || 
                issueLower.includes("reliance") || 
                issueLower.includes("alt tags") ||
                issueLower.includes("blocked")
            ) {
                cat = "warnings";
                warningsCount++;
            } else {
                cat = "notices";
            }
            
            if (!groupedIssues[cat][issue]) {
                groupedIssues[cat][issue] = {
                    name: issue,
                    category: cat,
                    pages: []
                };
            }
            groupedIssues[cat][issue].pages.push(p);
        });
    });
    
    // Render Overview Spark Cards
    const errEl = document.getElementById("overview-errors-count");
    if (errEl) errEl.innerText = errorsCount;
    const warnEl = document.getElementById("overview-warnings-count");
    if (warnEl) warnEl.innerText = warningsCount;
    
    // Render Top Issues on Overview
    renderOverviewTopIssues();
    
    // Render Thematic card scores (rings)
    renderThematicRings(pages, run);
    
    // Render Statistics Tab
    renderStatisticsTab(pages, run);
}

function renderOverviewTopIssues() {
    const listEl = document.getElementById("overview-top-issues-list");
    if (!listEl) return;
    
    let list = [];
    Object.values(groupedIssues.errors).forEach(iss => list.push({ ...iss, type: "error", sev: "errors" }));
    Object.values(groupedIssues.warnings).forEach(iss => list.push({ ...iss, type: "warning", sev: "warnings" }));
    Object.values(groupedIssues.notices).forEach(iss => list.push({ ...iss, type: "notice", sev: "notices" }));
    
    list.sort((a, b) => b.pages.length - a.pages.length);
    
    if (list.length === 0) {
        listEl.innerHTML = `<li class="empty-text">No issues found.</li>`;
        return;
    }
    
    listEl.innerHTML = list.slice(0, 5).map(iss => `
        <li class="top-issue-item ${iss.type}" onclick="switchAuditTab('issues'); showSingleIssueDetails('${iss.sev}', '${escapeHtml(iss.name)}')">
            <span class="issue-name">${escapeHtml(iss.name)}</span>
            <span class="issue-count">${iss.pages.length} pages</span>
        </li>
    `).join("");
}

function drawRing(id, score) {
    const ringEl = document.getElementById(id);
    const textEl = document.getElementById(id + "-text");
    if (ringEl && textEl) {
        ringEl.setAttribute("stroke-dasharray", `${score}, 100`);
        textEl.innerText = `${score}%`;
        
        if (score >= 90) {
            ringEl.style.stroke = "var(--success-color)";
        } else if (score >= 50) {
            ringEl.style.stroke = "var(--warning-color)";
        } else {
            ringEl.style.stroke = "var(--danger-color)";
        }
    }
}

function renderThematicRings(pages, run) {
    const themeRobotsVal = document.querySelector("#tab-panel-overview .theme-card:nth-child(1) .theme-card-val");
    if (themeRobotsVal) {
        themeRobotsVal.innerText = run.details && run.details.has_robots_txt ? "Configured" : "Missing";
    }
    
    const nonBroken = pages.filter(p => !p.is_broken).length;
    const crawlScore = pages.length > 0 ? Math.round((nonBroken / pages.length) * 100) : 100;
    drawRing("ring-crawlability", crawlScore);
    
    let httpsScore = 100;
    if (run.details && run.details.ssl_details) {
        httpsScore = run.details.ssl_details.valid ? 100 : 0;
    } else {
        const httpsPages = pages.filter(p => p.url.startsWith("https")).length;
        httpsScore = pages.length > 0 ? Math.round((httpsPages / pages.length) * 100) : 100;
    }
    drawRing("ring-https", httpsScore);
    
    const loadTimes = pages.map(p => p.details && p.details.load_time !== undefined ? p.details.load_time : 0.5);
    const avgLoad = loadTimes.reduce((a, b) => a + b, 0) / (loadTimes.length || 1);
    let perfScore = Math.max(10, Math.min(100, Math.round(100 - (avgLoad * 25))));
    drawRing("ring-performance", perfScore);
    
    const orphansCount = run.details && run.details.orphan_pages ? run.details.orphan_pages.length : 0;
    const linkingScore = pages.length > 0 ? Math.round((Math.max(0, pages.length - orphansCount) / pages.length) * 100) : 100;
    drawRing("ring-linking", linkingScore);
    
    const schemaCount = pages.filter(p => p.details && (p.details.has_schema || (p.details.schemas && p.details.schemas.length > 0))).length;
    const markupScore = pages.length > 0 ? Math.round((schemaCount / pages.length) * 100) : 100;
    drawRing("ring-markup", markupScore);
}

function openThemeReport(theme) {
    const overlay = document.getElementById("thematic-report-overlay");
    const titleEl = document.getElementById("thematic-report-title");
    const bodyEl = document.getElementById("thematic-report-body-content");
    if (!overlay || !titleEl || !bodyEl) return;
    
    overlay.classList.remove("hidden");
    
    let title = "";
    let body = "";
    
    if (theme === "robots") {
        title = "Robots.txt Analysis";
        const content = currentRunDetails.robots_txt_content || "No robots.txt file found on domain.";
        body = `
            <div class="card">
                <h3>robots.txt Content</h3>
                <pre style="background: var(--input-bg); padding: 1rem; border-radius: var(--border-radius-sm); overflow-x: auto; font-family: monospace; font-size: 0.85rem; color: var(--text-primary); margin-top: 1rem; border: 1px solid var(--border-color);">${escapeHtml(content)}</pre>
            </div>
            <div class="card" style="margin-top: 1.5rem;">
                <h3>AI Agents Directives Compliance</h3>
                <p class="text-secondary text-sm" style="margin: 0.5rem 0 1rem 0;">Review how major AI search crawlers are treated by your robots.txt files.</p>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>AI Bot Agent Name</th>
                                <th>Status in Robots.txt</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>ChatGPT-User</strong></td>
                                <td>${(currentRunDetails.ai_blocked_counts && currentRunDetails.ai_blocked_counts["ChatGPT-User"] > 0) ? '<span class="badge badge-danger">Blocked on some paths</span>' : '<span class="badge badge-success">Allowed / Unblocked</span>'}</td>
                            </tr>
                            <tr>
                                <td><strong>OAI-SearchBot</strong></td>
                                <td>${(currentRunDetails.ai_blocked_counts && currentRunDetails.ai_blocked_counts["OAI-SearchBot"] > 0) ? '<span class="badge badge-danger">Blocked on some paths</span>' : '<span class="badge badge-success">Allowed / Unblocked</span>'}</td>
                            </tr>
                            <tr>
                                <td><strong>Google-Extended</strong></td>
                                <td>${(currentRunDetails.ai_blocked_counts && currentRunDetails.ai_blocked_counts["Google-Extended"] > 0) ? '<span class="badge badge-danger">Blocked on some paths</span>' : '<span class="badge badge-success">Allowed / Unblocked</span>'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } 
    else if (theme === "crawlability") {
        title = "Crawlability Report";
        const sitemapCount = currentRunDetails.sitemap_urls_count || 0;
        const orphanCount = currentRunDetails.orphan_pages ? currentRunDetails.orphan_pages.length : 0;
        const overlap = Math.max(0, sitemapCount - orphanCount);
        
        body = `
            <div class="overview-widgets-grid">
                <div class="widget-card">
                    <h3>Sitemap overlap Venn diagram</h3>
                    ${generateVennSVG(sitemapCount, allPagesCached.length, overlap)}
                </div>
                <div class="widget-card">
                    <h3>Crawlability Stats</h3>
                    <ul class="ai-blocked-list">
                        <li><span>Total Pages Crawled:</span><strong>${allPagesCached.length}</strong></li>
                        <li><span>Broken Pages:</span><strong class="text-danger">${allPagesCached.filter(p => p.is_broken).length}</strong></li>
                        <li><span>Redirect Pages:</span><strong class="text-warning">${allPagesCached.filter(p => p.has_redirect).length}</strong></li>
                        <li><span>Healthy Pages:</span><strong class="text-success">${allPagesCached.filter(p => p.status_code === 200 && !p.is_broken).length}</strong></li>
                    </ul>
                </div>
            </div>
            <div class="card" style="margin-top: 1.5rem;">
                <h3>Status Codes list</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>URL Path</th>
                                <th>HTTP Status</th>
                                <th>Depth</th>
                                <th>Load Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allPagesCached.map(p => `
                                <tr>
                                    <td><strong class="word-break">${escapeHtml(p.url)}</strong></td>
                                    <td><span class="badge ${p.status_code === 200 ? 'badge-success' : p.status_code >= 400 ? 'badge-danger' : 'badge-warning'}">${p.status_code || "ERR"}</span></td>
                                    <td>${p.details.depth || 0}</td>
                                    <td>${p.details.load_time || 0}s</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    else if (theme === "https") {
        title = "HTTPS / SSL Report";
        const ssl = currentRunDetails.ssl_details || { valid: false, error: "No details" };
        
        body = `
            <div class="card">
                <h3>SSL Certificate Verification</h3>
                <div class="widget-card" style="margin-top: 1rem; border-left: 5px solid ${ssl.valid ? 'var(--success-color)' : 'var(--danger-color)'}">
                    <h3 class="${ssl.valid ? 'text-success' : 'text-danger'}" style="font-size: 1.1rem;">
                        ${ssl.valid ? '✅ SSL Certificate is Valid' : '❌ SSL Certificate is Invalid / Expired'}
                    </h3>
                    <p style="margin-top:0.5rem; font-size:0.85rem; color:var(--text-secondary);">${ssl.error || "Domain verified successfully."}</p>
                </div>
                
                <div class="table-container" style="margin-top: 1.5rem;">
                    <table>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>Issuer</strong></td>
                                <td>${escapeHtml(ssl.issuer || "Unknown")}</td>
                            </tr>
                            <tr>
                                <td><strong>Subject</strong></td>
                                <td>${escapeHtml(ssl.subject || "Unknown")}</td>
                            </tr>
                            <tr>
                                <td><strong>Expiry Date</strong></td>
                                <td>${escapeHtml(ssl.expiry || "Unknown")}</td>
                            </tr>
                            <tr>
                                <td><strong>Days Remaining</strong></td>
                                <td>${ssl.days_remaining !== undefined ? ssl.days_remaining : "N/A"}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    else if (theme === "performance") {
        title = "Site Performance Analysis";
        const loadTimes = allPagesCached.map(p => p.details && p.details.load_time !== undefined ? p.details.load_time : 0.5);
        const avgLoad = (loadTimes.reduce((a, b) => a + b, 0) / (loadTimes.length || 1)).toFixed(3);
        
        body = `
            <div class="overview-widgets-grid">
                <div class="widget-card">
                    <h3>Average Page load time</h3>
                    <div style="font-family:var(--font-tech); font-size:3rem; font-weight:700; color:var(--primary-color); text-align:center; padding:1.5rem 0;">
                        ${avgLoad}s
                    </div>
                </div>
                <div class="widget-card">
                    <h3>Resource distribution</h3>
                    <ul class="ai-blocked-list">
                        <li><span>JS scripts total:</span><strong>${allPagesCached.reduce((sum, p) => sum + (p.details.js_count || 0), 0)}</strong></li>
                        <li><span>CSS stylesheets total:</span><strong>${allPagesCached.reduce((sum, p) => sum + (p.details.css_count || 0), 0)}</strong></li>
                    </ul>
                </div>
            </div>
            
            <div class="card" style="margin-top:1.5rem;">
                <h3>Slowest Pages list</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>URL</th>
                                <th>Load Time</th>
                                <th>JS files</th>
                                <th>CSS files</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${allPagesCached.map(p => `
                                <tr>
                                    <td><strong class="word-break">${escapeHtml(p.url)}</strong></td>
                                    <td><span class="${(p.details.load_time || 0.5) > 1.5 ? 'text-danger font-semibold' : ''}">${p.details.load_time || 0.5}s</span></td>
                                    <td>${p.details.js_count || 0}</td>
                                    <td>${p.details.css_count || 0}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    else if (theme === "linking") {
        title = "Internal Linking Audit";
        const orphans = currentRunDetails.orphan_pages || [];
        
        body = `
            <div class="overview-widgets-grid">
                <div class="widget-card">
                    <h3>Orphan Pages count</h3>
                    <div style="font-family:var(--font-tech); font-size:3rem; font-weight:700; color:${orphans.length > 0 ? 'var(--warning-color)' : 'var(--success-color)'}; text-align:center; padding:1.5rem 0;">
                        ${orphans.length}
                    </div>
                </div>
                <div class="widget-card">
                    <h3>Linkgraph metrics</h3>
                    <ul class="ai-blocked-list">
                        <li><span>Total Crawl links:</span><strong>${allPagesCached.reduce((sum, p) => sum + (p.details.links ? p.details.links.total || 0 : 0), 0)}</strong></li>
                        <li><span>Orphan Pages in Sitemap:</span><strong class="${orphans.length > 0 ? 'text-warning' : ''}">${orphans.length}</strong></li>
                    </ul>
                </div>
            </div>
            
            <div class="card" style="margin-top:1.5rem;">
                <h3>Orphan Pages URL Details</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Orphan URL</th>
                                <th>In Sitemap</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orphans.length === 0 ? '<tr><td colspan="2" class="empty-state">No orphan pages discovered.</td></tr>' : 
                            orphans.map(u => `
                                <tr>
                                    <td><strong class="word-break">${escapeHtml(u)}</strong></td>
                                    <td><span class="badge badge-success">Yes</span></td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    else if (theme === "markup") {
        title = "Structured Data & Markups";
        const schemasFound = {};
        allPagesCached.forEach(p => {
            const schemas = p.details.schemas || [];
            schemas.forEach(s => {
                schemasFound[s] = (schemasFound[s] || 0) + 1;
            });
        });
        
        body = `
            <div class="card">
                <h3>Schema type distribution</h3>
                <div class="table-container" style="margin-top:1rem;">
                    <table>
                        <thead>
                            <tr>
                                <th>Schema Type / Markup format</th>
                                <th>Pages matching</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.keys(schemasFound).length === 0 ? '<tr><td colspan="2" class="empty-state">No structured schema types identified.</td></tr>' :
                            Object.entries(schemasFound).map(([s, count]) => `
                                <tr>
                                    <td><strong>${escapeHtml(s)}</strong></td>
                                    <td>${count} pages</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    titleEl.innerText = title;
    bodyEl.innerHTML = body;
}

function closeThematicReport() {
    const overlay = document.getElementById("thematic-report-overlay");
    if (overlay) {
        overlay.classList.add("hidden");
    }
}

function switchAuditTab(tabName) {
    activeAuditTab = tabName;
    
    // Update active state of buttons
    document.querySelectorAll(".audit-tabs-nav .audit-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    // Show/hide panels
    const panels = [
        { name: "overview", id: "tab-panel-overview" },
        { name: "issues", id: "tab-panel-issues" },
        { name: "pages", id: "tab-panel-pages" },
        { name: "statistics", id: "tab-panel-statistics" },
        { name: "compare", id: "tab-panel-compare" }
    ];
    
    panels.forEach(p => {
        const el = document.getElementById(p.id);
        if (el) {
            if (p.name === tabName) {
                el.classList.remove("hidden");
            } else {
                el.classList.add("hidden");
            }
        }
    });
    
    // Perform actions when tab is selected
    if (tabName === "issues") {
        goBackToIssuesList();
        renderIssuesTabList();
    } else if (tabName === "compare") {
        populateCompareRuns();
    } else if (tabName === "statistics") {
        switchStatsMode(activeStatsMode);
    }
}

function switchPagesSubtab(subtabName) {
    activePagesSubtab = subtabName;
    document.querySelectorAll(".crawled-pages-subtabs .pages-subtab-btn").forEach(btn => {
        if (btn.getAttribute("data-subtab") === subtabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    const viewList = document.getElementById("pages-subview-list");
    const viewStructure = document.getElementById("pages-subview-structure");
    
    if (subtabName === "pages") {
        if (viewList) viewList.classList.remove("hidden");
        if (viewStructure) viewStructure.classList.add("hidden");
    } else {
        if (viewList) viewList.classList.add("hidden");
        if (viewStructure) viewStructure.classList.remove("hidden");
        renderSitemapsStructureTable();
    }
}

function switchStatsMode(mode) {
    activeStatsMode = mode;
    document.querySelectorAll(".stats-toggle-bar .stats-toggle-btn").forEach(btn => {
        if (btn.getAttribute("data-mode") === mode) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
    
    const tileView = document.getElementById("stats-tiles-view");
    const graphView = document.getElementById("stats-graph-view-panel");
    
    if (mode === "tile") {
        if (tileView) tileView.classList.remove("hidden");
        if (graphView) graphView.classList.add("hidden");
    } else {
        if (tileView) tileView.classList.add("hidden");
        if (graphView) graphView.classList.remove("hidden");
        drawStatsComparativeGraph(allPagesCached);
    }
}

function renderSitemapsStructureTable() {
    const tbody = document.querySelector("#sitemaps-structure-table tbody");
    if (!tbody) return;
    
    const sitemaps = currentRunDetails.sitemaps_found || [];
    if (sitemaps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No XML sitemaps crawled.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = sitemaps.map(u => `
        <tr>
            <td><strong class="word-break">${escapeHtml(u)}</strong></td>
            <td><span class="badge badge-success">Live (Status 200)</span></td>
            <td>XML Sitemap Index / List</td>
        </tr>
    `).join("");
}

function renderIssuesCategoryChips() {
    const container = document.getElementById("issues-cats-chips");
    if (!container) return;
    
    if (container.children.length > 0) return;
    
    const categories = [
        { id: "all", label: "All" },
        { id: "ai", label: "AI Search" },
        { id: "crawl", label: "Crawlability" },
        { id: "content", label: "Content" },
        { id: "meta", label: "Meta tags" }
    ];
    
    container.innerHTML = categories.map(cat => `
        <span class="category-chip ${cat.id === activeIssuesCategoryFilter ? 'active' : ''}" 
              data-category="${cat.id}" 
              onclick="setIssuesCategoryFilter('${cat.id}', this)">
            ${cat.label}
        </span>
    `).join("");
}

function setIssuesCategoryFilter(catId, chipEl) {
    activeIssuesCategoryFilter = catId;
    document.querySelectorAll("#issues-cats-chips .category-chip").forEach(chip => {
        chip.classList.remove("active");
    });
    if (chipEl) chipEl.classList.add("active");
    renderIssuesTabList();
}

function setIssuesSeverityFilter(sevId, btnEl) {
    activeIssuesSeverityFilter = sevId;
    document.querySelectorAll(".issues-severity-filters .severity-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    if (btnEl) btnEl.classList.add("active");
    renderIssuesTabList();
}

function filterIssuesList() {
    const q = document.getElementById("issues-search").value.toLowerCase();
    const container = document.getElementById("issues-accordion-container");
    if (!container) return;
    
    const items = container.querySelectorAll(".issue-accordion-item");
    items.forEach(item => {
        const title = item.querySelector(".issue-header-title").innerText.toLowerCase();
        if (title.includes(q)) {
            item.classList.remove("hidden");
        } else {
            item.classList.add("hidden");
        }
    });
}


function getLensExplanation(issueName, lens) {
    const lower = issueName.toLowerCase();
    
    // Developer Lens
    if (lens === "developer") {
        if (lower.includes("broken")) return "4xx/5xx status codes returned from target endpoints.";
        if (lower.includes("redirect")) return "301/302 redirect chains or loops detected.";
        if (lower.includes("title tag") || lower.includes("meta description")) return "Metadata length validation failed or tags missing in the <head>.";
        if (lower.includes("robots") || lower.includes("blocked")) return "Disallow directives found in robots.txt blocking User-Agent access.";
        if (lower.includes("schema")) return "JSON-LD structured data validation failed.";
        if (lower.includes("sitemap")) return "Orphan pages found or sitemap XML malformed.";
        if (lower.includes("h1") || lower.includes("hierarchy")) return "DOM hierarchy violates semantic HTML5 outline (e.g. skipped heading levels).";
        if (lower.includes("thin content")) return "DOM parsing indicates low word count (<300 words).";
        if (lower.includes("js rendering")) return "High variance between raw HTML and post-render DOM.";
        return "System flagged " + issueName + " during DOM and header inspection.";
    } 
    
    // SEO Manager Lens
    else if (lens === "seo-manager") {
        if (lower.includes("broken")) return "Broken links waste crawl budget and create poor user experience.";
        if (lower.includes("redirect")) return "Redirect chains dilute link equity (PageRank) and slow down crawling.";
        if (lower.includes("title tag") || lower.includes("meta description")) return "Suboptimal metadata negatively impacts CTR in the SERPs.";
        if (lower.includes("robots") || lower.includes("blocked")) return "These pages are actively blocked from indexation via robots.txt.";
        if (lower.includes("schema")) return "Malformed schema prevents rich snippets from appearing in SERPs.";
        if (lower.includes("sitemap")) return "Sitemap issues prevent efficient discovery of new content.";
        if (lower.includes("h1") || lower.includes("hierarchy")) return "Heading issues dilute keyword relevance and page structure signals.";
        if (lower.includes("thin content")) return "Pages with thin content are at risk of Panda penalties or algorithmic devaluation.";
        if (lower.includes("js rendering")) return "Reliance on Client-Side Rendering may delay indexation.";
        return "SEO Risk: " + issueName + " which may negatively impact rankings.";
    } 
    
    // Non-Technical Lens (Default)
    else {
        if (lower.includes("broken")) return "When visitors click these links, they get an error page. We need to fix them.";
        if (lower.includes("redirect")) return "These links forward visitors multiple times before loading the page. It makes the site feel slow.";
        if (lower.includes("title tag") || lower.includes("meta description")) return "The text that shows up in Google search results is either missing or the wrong length.";
        if (lower.includes("robots") || lower.includes("blocked")) return "We've told Google not to look at these pages, so they won't show up in search results.";
        if (lower.includes("schema")) return "The special code that gives Google extra details (like star ratings) is broken.";
        if (lower.includes("sitemap")) return "Google is having a hard time finding all your pages.";
        if (lower.includes("h1") || lower.includes("hierarchy")) return "The page headers are out of order, making it hard for readers and Google to skim.";
        if (lower.includes("thin content")) return "These pages don't have enough text. Google prefers in-depth articles.";
        if (lower.includes("js rendering")) return "The page requires a lot of processing to load, which Google might skip.";
        return "We found an issue: " + issueName + ". This can make it harder for customers to find your site.";
    }
}

function getIssueToolRecommendation(issueName) {
    const lower = issueName.toLowerCase();
    if (lower.includes("broken") || lower.includes("redirect")) return { id: "redirect", name: "Redirect Tracer" };
    if (lower.includes("robots") || lower.includes("blocked")) return { id: "robotstester", name: "Robots.txt Tester" };
    if (lower.includes("schema markup")) return { id: "schema", name: "JSON-LD Generator" };
    if (lower.includes("sitemap") || lower.includes("orphan")) return { id: "sitemap", name: "Sitemap Builder" };
    if (lower.includes("hreflang")) return { id: "hreflang", name: "Hreflang Mapper" };
    if (lower.includes("e-e-a-t") || lower.includes("thin content")) return { id: "eeat", name: "E-E-A-T Wizard" };
    if (lower.includes("discover")) return { id: "discover", name: "Discover Tag Builder" };
    if (lower.includes("safesearch") || lower.includes("adult")) return { id: "safesearch", name: "SafeSearch Classifier" };
    if (lower.includes("js rendering reliance")) return { id: "spadiff", name: "SPA Lazy-Load Tester" };
    if (lower.includes("traffic drop")) return { id: "gsc", name: "GSC Diagnoser" };
    if (lower.includes("local seo") || lower.includes("nap")) return { id: "localseo", name: "NAP Auditor" };
    return null;
}

function generateIssueTableHtml(issueName, pages) {
    const lower = issueName.toLowerCase();
    let headerHtml = `
        <table class="finding-card-table">
            <thead>
                <tr>
                    <th>Page URL</th>
                    <th>Status Code</th>
    `;
    
    let hasDetailsCol = true;
    let detailsColName = "Issue Details";
    
    if (lower.includes("title tag too short") || lower.includes("title tag too long")) {
        detailsColName = "Title Tag (Length)";
    } else if (lower.includes("missing title tag")) {
        detailsColName = "Title Tag Status";
    } else if (lower.includes("meta description too short") || lower.includes("meta description too long")) {
        detailsColName = "Meta Description (Length)";
    } else if (lower.includes("missing meta description")) {
        detailsColName = "Meta Description Status";
    } else if (lower.includes("thin content")) {
        detailsColName = "Word Count";
    } else if (lower.includes("missing alt tags")) {
        detailsColName = "Missing Alt Tags (Images)";
    } else if (lower.includes("missing canonical tag")) {
        detailsColName = "Canonical Tag Status";
    } else if (lower.includes("canonical mismatch")) {
        detailsColName = "Canonical URL vs Page URL";
    } else if (lower.includes("missing h1 header")) {
        detailsColName = "H1 Header Status";
    } else if (lower.includes("multiple h1 headers")) {
        detailsColName = "H1 Headers Found";
    } else if (lower.includes("hierarchy jump")) {
        detailsColName = "Header Jumps / Heading Hierarchy";
    } else if (lower.includes("high js rendering reliance")) {
        detailsColName = "JS Dependency";
    } else if (lower.includes("malformed schema markup")) {
        detailsColName = "Schema Status";
    } else if (lower.includes("redundant taxonomy page")) {
        detailsColName = "Redundant Page Details";
    } else if (lower.includes("broken")) {
        detailsColName = "Referring Page(s)";
    } else if (lower.includes("http error") || lower.includes("network") || lower.includes("failure")) {
        detailsColName = "Error / Status Code";
    }
    
    if (hasDetailsCol) {
        headerHtml += `<th>${detailsColName}</th>`;
    }
    
    headerHtml += `
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    const bodyHtml = pages.map(p => {
        let rowHtml = `
            <tr>
                <td><strong class="word-break">${escapeHtml(p.url)}</strong></td>
                <td><span class="badge ${p.status_code === 200 ? 'badge-success' : p.status_code >= 400 ? 'badge-danger' : 'badge-warning'}">${p.status_code || "ERR"}</span></td>
        `;
        
        if (hasDetailsCol) {
            let cellValue = "";
            if (lower.includes("title tag too short") || lower.includes("title tag too long")) {
                const titleText = p.title_tag || "None";
                const titleLen = p.title_tag ? p.title_tag.length : 0;
                cellValue = `<code>"${escapeHtml(titleText)}"</code> (${titleLen} chars)`;
            } else if (lower.includes("missing title tag")) {
                cellValue = `<span class="badge badge-danger">Missing</span>`;
            } else if (lower.includes("thin content")) {
                cellValue = `<strong>${p.word_count || 0}</strong> words`;
            } else if (lower.includes("meta description too short") || lower.includes("meta description too long")) {
                const metaText = p.meta_description || "None";
                const metaLen = p.meta_description ? p.meta_description.length : 0;
                cellValue = `<code>"${escapeHtml(metaText)}"</code> (${metaLen} chars)`;
            } else if (lower.includes("missing meta description")) {
                cellValue = `<span class="badge badge-danger">Missing</span>`;
            } else if (lower.includes("missing alt tags")) {
                const imgs = p.details?.images || { total: 0, missing_alts_count: 0, missing_alts: [] };
                const listItems = (imgs.missing_alts || []).map(src => `<li style="margin-top:4px;" class="word-break"><code>${escapeHtml(src)}</code></li>`).join("");
                cellValue = `
                    <strong>${imgs.missing_alts_count}</strong> images missing alt
                    ${listItems ? `<ul class="bullet-list" style="margin-left: 15px; margin-top: 5px; font-size: 11px; list-style-type: disc;">${listItems}</ul>` : ""}
                `;
            } else if (lower.includes("missing canonical tag")) {
                cellValue = `<span class="badge badge-danger">Missing</span>`;
            } else if (lower.includes("canonical mismatch")) {
                cellValue = `Expected canonical: <code class="word-break">${escapeHtml(p.canonical_url || "None")}</code>`;
            } else if (lower.includes("missing h1 header")) {
                cellValue = `<span class="badge badge-danger">Missing</span>`;
            } else if (lower.includes("multiple h1 headers")) {
                const h1s = (p.details?.header_hierarchy || [])
                    .filter(h => Array.isArray(h) && (h[0] === 'h1' || h[0]?.toLowerCase() === 'h1'))
                    .map(h => `<li><code>"${escapeHtml(h[1])}"</code></li>`)
                    .join("");
                cellValue = h1s 
                    ? `<ul class="bullet-list" style="margin-left: 15px; font-size: 11px; list-style-type: disc;">${h1s}</ul>`
                    : `<code>First: "${escapeHtml(p.h1_tag || "None")}"</code>`;
            } else if (lower.includes("hierarchy jump")) {
                const violations = (p.issues || []).filter(iss => iss.toLowerCase().includes("hierarchy jump"));
                cellValue = violations.length > 0 
                    ? `<ul class="bullet-list" style="margin-left: 15px; font-size: 11px; list-style-type: disc;">${violations.map(v => `<li><code>${escapeHtml(v)}</code></li>`).join("")}</ul>`
                    : `<span class="badge badge-warning">Heading hierarchy jump detected</span>`;
            } else if (lower.includes("high js rendering reliance")) {
                cellValue = `<span class="badge badge-warning">High JS reliance</span>`;
            } else if (lower.includes("malformed schema markup")) {
                cellValue = `<span class="badge badge-danger">Malformed JSON-LD</span>`;
            } else if (lower.includes("redundant taxonomy page")) {
                cellValue = `<span class="badge badge-warning">Category/Archive page</span>`;
            } else if (lower.includes("broken")) {
                const refs = p.details?.incoming_links || [];
                const listItems = refs.map(ref => `<li style="margin-top:4px;" class="word-break"><a href="${escapeHtml(ref)}" target="_blank" class="link-primary" onclick="event.stopPropagation();">${escapeHtml(ref)}</a></li>`).join("");
                cellValue = listItems 
                    ? `<ul class="bullet-list" style="margin-left: 15px; font-size: 11px; list-style-type: disc;">${listItems}</ul>`
                    : `<span class="text-muted">None (Direct / Seed URL)</span>`;
            } else if (lower.includes("http error") || lower.includes("network") || lower.includes("failure")) {
                cellValue = `<span class="badge badge-danger">${escapeHtml(p.status_code ? 'HTTP ' + p.status_code : 'Connection Failed')}</span>`;
            } else {
                cellValue = `<span class="badge badge-info">Warning details</span>`;
            }
            rowHtml += `<td>${cellValue}</td>`;
        }
        
        rowHtml += `
                <td><button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); triggerReaudit(${p.id})">Reaudit</button></td>
            </tr>
        `;
        return rowHtml;
    }).join("");

    return headerHtml + bodyHtml + `</tbody></table>`;
}

function exportIssueToCSV(issueName, severity) {
    const issue = groupedIssues[severity][issueName];
    if (!issue) return;
    
    let csv = "URL,Status Code\n";
    issue.pages.forEach(p => {
        csv += `"${p.url}",${p.status_code}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${issueName.replace(/\s+/g, '_')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function renderIssuesTabList() {
    const container = document.getElementById("issues-accordion-container");
    if (!container) return;
    
    let html = "";
    
    const severities = activeIssuesSeverityFilter === "all" 
        ? ["errors", "warnings", "notices"] 
        : [activeIssuesSeverityFilter];
        
    let matchesFound = false;
    
    severities.forEach(sev => {
        const issues = Object.values(groupedIssues[sev] || {});
        issues.forEach(iss => {
            if (!matchCategoryFilter(iss.name, activeIssuesCategoryFilter)) return;
            
            matchesFound = true;
            const label = sev === "errors" ? "Error" : sev === "warnings" ? "Warning" : "Notice";
            const badgeClass = sev === 'errors' ? 'badge-danger' : sev === 'warnings' ? 'badge-warning' : 'badge-success';
            
            const lensExpl = getLensExplanation(iss.name, currentAudienceLens);
            const toolRec = getIssueToolRecommendation(iss.name);
            const tableHtml = generateIssueTableHtml(iss.name, iss.pages);
            
            let toolBtnHtml = "";
            if (toolRec) {
                const encodedUrl = encodeURIComponent(iss.pages[0]?.url || "");
                toolBtnHtml = `<a href="#/tools/${toolRec.id}?url=${encodedUrl}" class="btn btn-sm btn-primary">Fix with ${toolRec.name}</a>`;
            }

            html += `
                <div class="finding-card card">
                    <div class="finding-card-header" onclick="this.parentElement.classList.toggle('expanded')">
                        <div class="finding-card-title-row">
                            <span class="badge ${badgeClass}">${label}</span>
                            <h3 class="finding-card-title">${escapeHtml(iss.name)}</h3>
                        </div>
                        <div class="finding-card-meta">
                            <span class="affected-count">${iss.pages.length} pages affected</span>
                            <span class="expand-icon" style="margin-left: 10px;">▼</span>
                        </div>
                    </div>
                    <div class="finding-card-body">
                        <div class="lens-explanation" style="margin-bottom: 15px; font-size: 0.95em; color: var(--text-secondary);">${escapeHtml(lensExpl)}</div>
                        <div class="finding-card-actions" style="margin-bottom: 15px; display: flex; gap: 10px;">
                            ${toolBtnHtml}
                            <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); exportIssueToCSV('${escapeHtml(iss.name).replace(/'/g, "\'")}', '${sev}')">Export CSV</button>
                        </div>
                        <div class="finding-card-details table-container" onclick="event.stopPropagation();">
                            ${tableHtml}
                        </div>
                    </div>
                </div>
            `;
        });
    });
    
    if (!matchesFound) {
        container.innerHTML = `<div class="empty-state">No matching issues found.</div>`;
    } else {
        container.innerHTML = html;
    }
}

function goBackToIssuesList() {
    const sv = document.getElementById("single-issue-detail-view");
    if (sv) sv.classList.add("hidden");
    const lv = document.getElementById("issues-list-view");
    if (lv) lv.classList.remove("hidden");
}

async function populateCompareRuns() {
    const select1 = document.getElementById("compare-run-1");
    const select2 = document.getElementById("compare-run-2");
    if (!select1 || !select2) return;
    
    if (select1.getAttribute("data-populated-for") === String(currentOpenAuditRunId)) {
        return;
    }
    
    try {
        const res = await fetch("/api/audit/runs");
        const runs = await res.json();
        
        const relevantRuns = runs.filter(r => r.domain === currentRunDetails.domain || r.id === currentOpenAuditRunId);
        
        const optionsHtml = relevantRuns.map(r => `
            <option value="${r.id}" ${r.id === currentOpenAuditRunId ? 'selected' : ''}>
                Run #${r.id} (${new Date(r.started_at).toLocaleDateString()} - ${r.status})
            </option>
        `).join("");
        
        select1.innerHTML = optionsHtml;
        select2.innerHTML = optionsHtml;
        
        if (relevantRuns.length > 1) {
            const currentIdx = relevantRuns.findIndex(r => r.id === currentOpenAuditRunId);
            const otherIdx = currentIdx === 0 ? 1 : 0;
            select2.value = relevantRuns[otherIdx].id;
        }
        
        select1.setAttribute("data-populated-for", currentOpenAuditRunId);
        
        runComparisonChecks();
    } catch (e) {
        console.error("Failed to populate compare dropdowns:", e);
    }
}

async function runComparisonChecks() {
    const select1 = document.getElementById("compare-run-1");
    const select2 = document.getElementById("compare-run-2");
    const tbody = document.querySelector("#comparison-metrics-table tbody");
    if (!select1 || !select2 || !tbody) return;
    
    const id1 = select1.value;
    const id2 = select2.value;
    if (!id1 || !id2) return;
    
    try {
        const res = await fetch(`/api/audit/compare?run_id_1=${id1}&run_id_2=${id2}`);
        if (!res.ok) throw new Error("Comparison failed");
        const data = await res.json();
        
        const r1 = data.run1.stats;
        const r2 = data.run2.stats;
        
        const metrics = [
            { label: "Total Pages Crawled", key: "total", isCount: true },
            { label: "Site Health Score", key: "health_score", isPercent: true },
            { label: "Healthy Pages (200)", key: "healthy", isCount: true },
            { label: "Broken Pages (4xx/5xx)", key: "broken", isCount: true, isIssue: true },
            { label: "Redirects (3xx)", key: "redirects", isCount: true, isIssue: true },
            { label: "Total Errors", key: "errors", isCount: true, isIssue: true },
            { label: "Total Warnings", key: "warnings", isCount: true, isIssue: true },
            { label: "Total Notices", key: "notices", isCount: true, isIssue: true }
        ];
        
        tbody.innerHTML = metrics.map(m => {
            const v1 = r1[m.key] || 0;
            const v2 = r2[m.key] || 0;
            const diff = v2 - v1;
            
            let fixed = "--";
            let newDiff = "--";
            
            if (m.key === "health_score") {
                if (diff > 0) fixed = `+${diff}%`;
                else if (diff < 0) newDiff = `${diff}%`;
            } else if (m.key === "healthy") {
                if (diff > 0) fixed = `+${diff}`;
                else if (diff < 0) newDiff = `${diff}`;
            } else {
                if (diff < 0) fixed = `${Math.abs(diff)} fixed`;
                else if (diff > 0) newDiff = `+${diff} new`;
            }
            
            const v1Str = m.isPercent ? `${v1}%` : v1;
            const v2Str = m.isPercent ? `${v2}%` : v2;
            
            return `
                <tr>
                    <td><strong>${m.label}</strong></td>
                    <td>${v1Str}</td>
                    <td>${v2Str}</td>
                    <td class="text-success">${fixed}</td>
                    <td class="text-danger">${newDiff}</td>
                </tr>
            `;
        }).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state text-danger">Failed to calculate comparison metrics.</td></tr>`;
    }
}

function renderStatisticsTab(pages, run) {
    // 1. Status Codes
    const brokenPages = pages.filter(p => p.is_broken).length;
    const brokenPct = pages.length > 0 ? Math.round((brokenPages / pages.length) * 100) : 0;
    const statusNum = document.getElementById("stat-tile-status-num");
    if (statusNum) statusNum.innerText = brokenPct + "%";
    
    const statusCounts = {};
    pages.forEach(p => {
        const code = p.status_code || "ERR";
        statusCounts[code] = (statusCounts[code] || 0) + 1;
    });
    
    const statusList = document.getElementById("stat-tile-status-list");
    if (statusList) {
        statusList.innerHTML = Object.entries(statusCounts).map(([code, count]) => {
            const pct = pages.length > 0 ? (count / pages.length) * 100 : 0;
            const colorClass = code === 200 ? "bg-success" : code >= 400 ? "bg-danger" : "bg-warning";
            return `
                <div class="stat-row-progress-container">
                    <div class="stat-row"><span>Status ${code}:</span><strong>${count} (${Math.round(pct)}%)</strong></div>
                    <div class="stat-row-progress-bar"><div class="stat-row-progress-fill ${colorClass}" style="width: ${pct}%"></div></div>
                </div>
            `;
        }).join("");
    }
    
    // 2. Sitemap vs Crawled
    const sitemapCount = run.details && run.details.sitemap_urls_count !== undefined ? run.details.sitemap_urls_count : 0;
    const sitemapsFound = run.details && run.details.sitemaps_found ? run.details.sitemaps_found.length : 0;
    const orphanCount = run.details && run.details.orphan_pages ? run.details.orphan_pages.length : 0;
    const overlap = Math.max(0, sitemapCount - orphanCount);
    
    const sitemapNum = document.getElementById("stat-tile-sitemap-num");
    if (sitemapNum) sitemapNum.innerText = sitemapCount;
    const sitemapList = document.getElementById("stat-tile-sitemap-list");
    if (sitemapList) {
        sitemapList.innerHTML = `
            <div class="stat-row"><span>XML Sitemaps:</span><strong>${sitemapsFound} found</strong></div>
            <div class="stat-row"><span>Orphan Sitemap Pages:</span><strong>${orphanCount}</strong></div>
            <div class="stat-row"><span>Crawled & Sitemap overlap:</span><strong>${overlap}</strong></div>
        `;
    }
    
    // 3. Crawl Depth
    const deepPages = pages.filter(p => p.details && p.details.depth > 3).length;
    const deepPct = pages.length > 0 ? Math.round((deepPages / pages.length) * 100) : 0;
    const depthNum = document.getElementById("stat-tile-depth-num");
    if (depthNum) depthNum.innerText = deepPct + "%";
    
    const depthCounts = {};
    pages.forEach(p => {
        const d = p.details && p.details.depth !== undefined ? p.details.depth : 0;
        depthCounts[d] = (depthCounts[d] || 0) + 1;
    });
    
    const depthList = document.getElementById("stat-tile-depth-list");
    if (depthList) {
        depthList.innerHTML = Object.entries(depthCounts).map(([depth, count]) => {
            const pct = pages.length > 0 ? (count / pages.length) * 100 : 0;
            return `
                <div class="stat-row-progress-container">
                    <div class="stat-row"><span>Click Depth ${depth}:</span><strong>${count} pages (${Math.round(pct)}%)</strong></div>
                    <div class="stat-row-progress-bar"><div class="stat-row-progress-fill bg-info" style="width: ${pct}%"></div></div>
                </div>
            `;
        }).join("");
    }
    
    // 4. Inbound Link counts
    const oneLinkPages = pages.filter(p => p.details && p.details.incoming_links_count === 1).length;
    const oneLinkPct = pages.length > 0 ? Math.round((oneLinkPages / pages.length) * 100) : 0;
    const linksNum = document.getElementById("stat-tile-links-num");
    if (linksNum) linksNum.innerText = oneLinkPct + "%";
    
    const zeroLinks = pages.filter(p => !p.details || !p.details.incoming_links_count).length;
    const multiLinks = pages.filter(p => p.details && p.details.incoming_links_count > 1).length;
    const linksList = document.getElementById("stat-tile-links-list");
    if (linksList) {
        linksList.innerHTML = `
            <div class="stat-row"><span>0 incoming links:</span><strong>${zeroLinks} pages</strong></div>
            <div class="stat-row"><span>1 incoming link:</span><strong>${oneLinkPages} pages</strong></div>
            <div class="stat-row"><span>2+ incoming links:</span><strong>${multiLinks} pages</strong></div>
        `;
    }
    
    // 5. Markup Types
    const noMarkupPages = pages.filter(p => p.details && !p.details.has_schema && !p.details.has_og && !p.details.has_twitter).length;
    const noMarkupPct = pages.length > 0 ? Math.round((noMarkupPages / pages.length) * 100) : 0;
    const markupNum = document.getElementById("stat-tile-markup-num");
    if (markupNum) markupNum.innerText = noMarkupPct + "%";
    
    const schemaCount = pages.filter(p => p.details && p.details.has_schema).length;
    const ogCount = pages.filter(p => p.details && p.details.has_og).length;
    const twitterCount = pages.filter(p => p.details && p.details.has_twitter).length;
    const markupList = document.getElementById("stat-tile-markup-list");
    if (markupList) {
        markupList.innerHTML = `
            <div class="stat-row"><span>Schema (JSON-LD/Microdata):</span><strong>${schemaCount} pages</strong></div>
            <div class="stat-row"><span>Open Graph:</span><strong>${ogCount} pages</strong></div>
            <div class="stat-row"><span>Twitter Card:</span><strong>${twitterCount} pages</strong></div>
        `;
    }
    
    // 6. Canonicalization
    const noCanonicalPages = pages.filter(p => p.details && !p.details.canonical_url).length;
    const noCanonicalPct = pages.length > 0 ? Math.round((noCanonicalPages / pages.length) * 100) : 0;
    const canonicalNum = document.getElementById("stat-tile-canonical-num");
    if (canonicalNum) canonicalNum.innerText = noCanonicalPct + "%";
    
    const canonicalSelf = pages.filter(p => p.details && p.details.canonical_url === p.url).length;
    const canonicalOther = pages.filter(p => p.details && p.details.canonical_url && p.details.canonical_url !== p.url).length;
    const canonicalList = document.getElementById("stat-tile-canonical-list");
    if (canonicalList) {
        canonicalList.innerHTML = `
            <div class="stat-row"><span>Self-referencing:</span><strong>${canonicalSelf} pages</strong></div>
            <div class="stat-row"><span>Pointing to other:</span><strong>${canonicalOther} pages</strong></div>
            <div class="stat-row"><span>Missing canonical:</span><strong>${noCanonicalPages} pages</strong></div>
        `;
    }
}

function drawStatsComparativeGraph(pages) {
    const svg = document.getElementById("stats-comparative-svg");
    if (!svg) return;
    
    const chartPages = pages.slice(0, 10);
    if (chartPages.length === 0) {
        svg.innerHTML = `<text x="400" y="160" text-anchor="middle" fill="var(--text-muted)">No page metrics available to plot.</text>`;
        return;
    }
    
    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const width = 800;
    const height = 320;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    let maxVal = 5;
    chartPages.forEach(p => {
        const js = p.details && p.details.js_count !== undefined ? p.details.js_count : 0;
        const css = p.details && p.details.css_count !== undefined ? p.details.css_count : 0;
        const links = p.details && p.details.incoming_links_count !== undefined ? p.details.incoming_links_count : 0;
        maxVal = Math.max(maxVal, js, css, links);
    });
    maxVal = Math.ceil(maxVal * 1.2);
    
    const barWidth = (chartWidth / chartPages.length) * 0.7;
    const groupGap = (chartWidth / chartPages.length) * 0.3;
    
    let html = "";
    
    for (let i = 0; i <= 4; i++) {
        const val = Math.round((maxVal / 4) * i);
        const y = margin.top + chartHeight - (chartHeight / 4) * i;
        html += `
            <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="4,4" />
            <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10">${val}</text>
        `;
    }
    
    html += `
        <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${width - margin.right}" y2="${margin.top + chartHeight}" stroke="var(--text-muted)" stroke-width="2" />
    `;
    
    chartPages.forEach((p, idx) => {
        const xStart = margin.left + idx * (chartWidth / chartPages.length) + groupGap / 2;
        
        const js = p.details && p.details.js_count !== undefined ? p.details.js_count : 0;
        const css = p.details && p.details.css_count !== undefined ? p.details.css_count : 0;
        const links = p.details && p.details.incoming_links_count !== undefined ? p.details.incoming_links_count : 0;
        
        const jsH = (js / maxVal) * chartHeight;
        const cssH = (css / maxVal) * chartHeight;
        const linksH = (links / maxVal) * chartHeight;
        
        const w = barWidth / 3;
        
        html += `
            <rect x="${xStart}" y="${margin.top + chartHeight - jsH}" width="${w}" height="${jsH}" fill="var(--indigo-color)" rx="2" title="JS: ${js}" />
        `;
        html += `
            <rect x="${xStart + w}" y="${margin.top + chartHeight - cssH}" width="${w}" height="${cssH}" fill="var(--warning-color)" rx="2" title="CSS: ${css}" />
        `;
        html += `
            <rect x="${xStart + w * 2}" y="${margin.top + chartHeight - linksH}" width="${w}" height="${linksH}" fill="var(--success-color)" rx="2" title="Links: ${links}" />
        `;
        
        const labelText = p.url.replace(/^https?:\/\/(www\.)?/, "").substring(0, 15) + "...";
        html += `
            <text x="${xStart + barWidth / 2}" y="${margin.top + chartHeight + 20}" text-anchor="middle" fill="var(--text-secondary)" font-size="9" transform="rotate(15, ${xStart + barWidth / 2}, ${margin.top + chartHeight + 20})">${escapeHtml(labelText)}</text>
        `;
    });
    
    html += `
        <g transform="translate(${width - 450}, 15)" font-size="10">
            <rect x="0" y="0" width="10" height="10" fill="var(--indigo-color)" rx="1"/>
            <text x="15" y="9" fill="var(--text-secondary)">JS scripts</text>
            
            <rect x="120" y="0" width="10" height="10" fill="var(--warning-color)" rx="1"/>
            <text x="135" y="9" fill="var(--text-secondary)">CSS stylesheets</text>
            
            <rect x="240" y="0" width="10" height="10" fill="var(--success-color)" rx="1"/>
            <text x="255" y="9" fill="var(--text-secondary)">Inbound Links</text>
        </g>
    `;
    
    svg.innerHTML = html;
}

function generateVennSVG(sitemapCount, crawledCount, overlap) {
    return `
    <svg viewBox="0 0 360 200" style="width:100%; max-width:400px; margin: 0 auto; display:block;">
        <circle cx="140" cy="100" r="70" fill="rgba(14, 165, 233, 0.4)" stroke="var(--indigo-color)" stroke-width="2" />
        <circle cx="220" cy="100" r="70" fill="rgba(16, 185, 129, 0.4)" stroke="var(--success-color)" stroke-width="2" />
        
        <text x="90" y="100" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">${sitemapCount - overlap}</text>
        <text x="90" y="120" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Sitemap Only</text>
        
        <text x="270" y="100" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">${crawledCount - overlap}</text>
        <text x="270" y="120" text-anchor="middle" fill="var(--text-secondary)" font-size="10">Crawled Only</text>
        
        <text x="180" y="100" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">${overlap}</text>
        <text x="180" y="120" text-anchor="middle" fill="var(--text-secondary)" font-size="10">In Both</text>
    </svg>
    `;
}

function renderBlockedAIBots(p) {
    const bots = (p.details && p.details.blocked_ai_bots) || [];
    if (bots.length === 0) {
        return `<span class="badge badge-success">None</span>`;
    }
    return bots.map(b => `<span class="badge badge-danger" style="margin-right:2px; font-size:10px;">${escapeHtml(b)}</span>`).join("");
}

async function triggerReaudit(pageId) {
    try {
        const response = await fetch(`/api/audit/page/${pageId}/reaudit`, { method: "POST" });
        if (response.ok) {
            alert("Reaudit complete.");
            if (currentOpenAuditRunId) {
                await loadAuditDetails(currentOpenAuditRunId, currentAuditPage);
            }
        } else {
            const data = await response.json();
            alert("Reaudit failed: " + (data.detail || "Unknown error"));
        }
    } catch (e) {
        alert("Error requesting page reaudit.");
    }
}

async function changeAuditPage(direction) {
    if (!currentOpenAuditRunId) return;
    await loadAuditDetails(currentOpenAuditRunId, currentAuditPage + direction);
}

function renderAuditPageMetrics(metrics) {
    if (!metrics) return;
    const totalEl = document.getElementById("audit-metric-total");
    if (totalEl) totalEl.innerText = metrics.total;
    const brokenEl = document.getElementById("audit-metric-broken");
    if (brokenEl) brokenEl.innerText = metrics.broken;
    const redirectsEl = document.getElementById("audit-metric-redirects");
    if (redirectsEl) redirectsEl.innerText = metrics.redirects;
    const healthyEl = document.getElementById("audit-metric-healthy");
    if (healthyEl) healthyEl.innerText = metrics.healthy;
}

function renderAuditPagesTable(pages) {
    const tbody = document.querySelector("#audit-pages-table tbody");
    if (!tbody) return;
    if (pages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No crawled pages found in this audit.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = pages.map(p => {
        const issuesCount = p.issues ? p.issues.length : 0;
        const issuesHtml = p.issues && p.issues.length > 0
            ? p.issues.slice(0, 2).map(i => {
                const isErr = i.toLowerCase().includes("broken") || i.toLowerCase().includes("error") || i.toLowerCase().includes("failure");
                const catClass = isErr ? "danger" : "warning";
                return `<span class="pill-issue ${catClass}">${escapeHtml(i)}</span>`;
              }).join("") + (p.issues.length > 2 ? `<span class="pill-issue more">+${p.issues.length - 2} more</span>` : "")
            : `<span class="pill-issue success">No Issues</span>`;
            
        const ilr = p.details && p.details.ilr !== undefined ? p.details.ilr : 10;
        const depth = p.details && p.details.depth !== undefined ? p.details.depth : 0;
            
        return `
            <tr class="audit-page-row" data-page-id="${p.id}" onclick="toggleAuditPageDetails(${p.id})">
                <td><span class="badge badge-info">${ilr}</span></td>
                <td class="word-break">
                    <div class="url-cell-wrapper">
                        <span class="chevron-icon" id="chevron-${p.id}">▶</span>
                        <div style="display:inline-block; vertical-align:top; margin-left: 5px;">
                            <strong>${escapeHtml(p.url)}</strong>
                            <div class="text-muted text-xs" style="margin-top:2px; font-size:10px;">${escapeHtml(p.title_tag || "No Title")}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${p.status_code === 200 ? 'badge-success' : p.status_code >= 400 ? 'badge-danger' : 'badge-warning'}">${p.status_code || "ERR"}</span></td>
                <td><div class="issues-pill-container">${issuesHtml}</div></td>
                <td>${renderBlockedAIBots(p)}</td>
                <td>${depth}</td>
                <td><button class="btn btn-xs btn-primary" onclick="event.stopPropagation(); triggerReaudit(${p.id})">Reaudit</button></td>
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
    document.getElementById("keyword-add-form").reset();
    document.getElementById("modal-keyword").classList.remove("hidden");
}

async function handleAddKeyword(e) {
    e.preventDefault();
    const keyword = document.getElementById("track-keyword").value;
    const domain = document.getElementById("track-domain").value;
    const geo = document.getElementById("track-geo").value;
    const lang = document.getElementById("track-lang").value;
    
    const competitors = [
        document.getElementById("track-competitor1").value.trim(),
        document.getElementById("track-competitor2").value.trim(),
        document.getElementById("track-competitor3").value.trim()
    ].filter(c => c !== "");
    
    closeModal("modal-keyword");
    
    try {
        const response = await fetch("/api/keywords", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                keyword, 
                target_domain: domain, 
                target_geolocation: geo, 
                target_locale: lang,
                competitors: competitors
            })
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
        const triggerBtn = document.getElementById("trigger-ranks-btn");
        if (trackedKeywords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No tracked keywords. Add one to start monitoring rankings.</td></tr>`;
            if (triggerBtn) triggerBtn.disabled = true;
            return;
        }
        
        if (triggerBtn) triggerBtn.disabled = false;
        
        tbody.innerHTML = trackedKeywords.map(k => `
            <tr>
                <td><strong>${k.keyword}</strong></td>
                <td>
                    <strong>${k.target_domain}</strong>
                    ${k.competitors && k.competitors.length > 0 ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">vs: ${k.competitors.join(", ")}</div>` : ""}
                </td>
                <td><span class="badge badge-secondary">${k.target_geolocation}</span></td>
                <td>
                    ${k.rank_position !== null ? `<span class="badge badge-success">#${k.rank_position}</span>` : `<span class="badge badge-danger">Not in Top 100</span>`}
                    ${k.competitor_ranks && Object.keys(k.competitor_ranks).length > 0 ? `
                        <div style="font-size: 11px; margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
                            ${Object.entries(k.competitor_ranks).map(([comp, data]) => `
                                <span class="text-muted" style="display: flex; justify-content: space-between; gap: 8px;">
                                    <span style="max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left;">${comp}:</span>
                                    <strong>${data.rank !== null && data.rank !== undefined ? `#${data.rank}` : "--"}</strong>
                                </span>
                            `).join("")}
                        </div>
                    ` : ""}
                </td>
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
    const padding = { top: 30, right: 35, bottom: 40, left: 50 };
    
    // Add linear gradient for chart line
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <linearGradient id="chart-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#10b981" />
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
    
    // Draw horizontal grid lines (Rank 1, Rank 10, Rank 25, Rank 50, Rank 75, Rank 100)
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

    // Draw dates along X-axis
    history.forEach((point, index) => {
        const xCoord = padding.left + index * xStep;
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
    });

    // Detect all competitors present in history
    const competitorsSet = new Set();
    history.forEach(point => {
        if (point.competitor_ranks) {
            Object.keys(point.competitor_ranks).forEach(comp => {
                competitorsSet.add(comp);
            });
        }
    });
    const competitorsList = Array.from(competitorsSet);
    const compColors = ["#8b5cf6", "#3b82f6", "#f97316"]; // Colors for up to 3 competitors

    // 1. Draw Target Domain rank path
    let targetPoints = [];
    history.forEach((point, index) => {
        const rank = point.rank_position !== null ? point.rank_position : 100;
        const xCoord = padding.left + index * xStep;
        const yPct = (rank - minRank) / (maxRank - minRank);
        const yCoord = padding.top + yPct * (height - padding.top - padding.bottom);
        targetPoints.push(`${xCoord},${yCoord}`);
        
        // Interactive Circle for Target Domain
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", xCoord);
        dot.setAttribute("cy", yCoord);
        dot.setAttribute("r", "5");
        dot.setAttribute("class", "chart-dot");
        
        const tooltipText = `Target: ${point.rank_position !== null ? `#${point.rank_position}` : 'N/A'} checked ${point.checked_at.split(" ")[0]}`;
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = tooltipText;
        dot.appendChild(title);
        svg.appendChild(dot);
    });

    if (count > 1) {
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", targetPoints.join(" "));
        polyline.setAttribute("class", "chart-line");
        svg.insertBefore(polyline, svg.firstChild.nextSibling);
    }

    // 2. Draw Competitors paths
    competitorsList.forEach((comp, compIdx) => {
        const compColor = compColors[compIdx % compColors.length];
        let compPoints = [];
        
        history.forEach((point, index) => {
            const compData = point.competitor_ranks && point.competitor_ranks[comp];
            const rank = (compData && compData.rank !== null && compData.rank !== undefined) ? compData.rank : 100;
            
            const xCoord = padding.left + index * xStep;
            const yPct = (rank - minRank) / (maxRank - minRank);
            const yCoord = padding.top + yPct * (height - padding.top - padding.bottom);
            compPoints.push(`${xCoord},${yCoord}`);
            
            // Dot for competitor
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", xCoord);
            dot.setAttribute("cy", yCoord);
            dot.setAttribute("r", "4");
            dot.setAttribute("fill", compColor);
            dot.setAttribute("stroke", "var(--bg-card)");
            dot.setAttribute("stroke-width", "1");
            
            const tooltipText = `${comp}: ${compData && compData.rank !== null && compData.rank !== undefined ? `#${compData.rank}` : 'N/A'} checked ${point.checked_at.split(" ")[0]}`;
            const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
            title.textContent = tooltipText;
            dot.appendChild(title);
            svg.appendChild(dot);
        });

        if (count > 1) {
            const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            polyline.setAttribute("points", compPoints.join(" "));
            polyline.setAttribute("stroke", compColor);
            polyline.setAttribute("stroke-width", "2");
            polyline.setAttribute("stroke-dasharray", "4,4"); // Dashed for competitor lines
            polyline.setAttribute("fill", "none");
            svg.insertBefore(polyline, svg.firstChild.nextSibling);
        }
    });

    // 3. Draw Legend at Top-Right
    const legend = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legend.setAttribute("transform", `translate(${width - padding.right - 180}, ${padding.top - 15})`);
    
    let offset = 0;
    
    // Main domain legend item
    const targetItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
    targetItem.setAttribute("transform", `translate(0, ${offset})`);
    
    const targetLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    targetLine.setAttribute("x1", 0); targetLine.setAttribute("y1", 0); targetLine.setAttribute("x2", 15); targetLine.setAttribute("y2", 0);
    targetLine.setAttribute("stroke", "#10b981"); targetLine.setAttribute("stroke-width", "3");
    targetItem.appendChild(targetLine);
    
    const targetText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    targetText.setAttribute("x", 20); targetText.setAttribute("y", 4); targetText.setAttribute("class", "chart-text");
    targetText.setAttribute("font-size", "11");
    targetText.textContent = "Target Domain";
    targetItem.appendChild(targetText);
    legend.appendChild(targetItem);
    offset += 16;

    // Competitor legend items
    competitorsList.forEach((comp, compIdx) => {
        const compColor = compColors[compIdx % compColors.length];
        
        const compItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
        compItem.setAttribute("transform", `translate(0, ${offset})`);
        
        const compLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        compLine.setAttribute("x1", 0); compLine.setAttribute("y1", 0); compLine.setAttribute("x2", 15); compLine.setAttribute("y2", 0);
        compLine.setAttribute("stroke", compColor); compLine.setAttribute("stroke-width", "2"); compLine.setAttribute("stroke-dasharray", "3,3");
        compItem.appendChild(compLine);
        
        const compText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        compText.setAttribute("x", 20); compText.setAttribute("y", 4); compText.setAttribute("class", "chart-text");
        compText.setAttribute("font-size", "11");
        compText.textContent = comp.length > 20 ? comp.slice(0, 17) + "..." : comp;
        compItem.appendChild(compText);
        
        legend.appendChild(compItem);
        offset += 16;
    });

    svg.appendChild(legend);
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
