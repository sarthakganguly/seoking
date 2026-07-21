const TOOLS_REGISTRY = [
    { id: "robots", name: "Robots.txt Creator", desc: "Generate valid robots rules.", action: "Create", endpoint: "/api/tools/robots-txt-creator", fields: [{id: "r-crawlers", label: "Target Crawlers", type: "list", placeholder: "e.g., Googlebot"}, {id: "r-allow", label: "Allow Paths", type: "list", placeholder: "e.g., /public/"}, {id: "r-disallow", label: "Disallow Paths", type: "list", placeholder: "e.g., /admin/"}] },
    { id: "schema", name: "Schema Markup Generator", desc: "Create JSON-LD schemas.", action: "Generate", endpoint: "/api/tools/schema-generator", fields: [{id: "s-builder", type: "schema_builder"}] },
    { id: "sitemap", name: "XML Sitemap Builder", desc: "Build XML sitemap from URLs.", action: "Build", endpoint: "/api/tools/sitemap-builder", fields: [{id: "sm-urls", label: "URLs to Include", type: "list", placeholder: "https://example.com/page"}] },
    { id: "hreflang", name: "Hreflang Tag Checker", desc: "Generate hreflang link tags.", action: "Check", endpoint: "/api/tools/hreflang-mapper", fields: [{id: "h-map", label: "URL to Lang Mappings", type: "keyvalue", keyPlaceholder: "URL", valPlaceholder: "Lang (e.g. en-US)"}] },
    { id: "redirect", name: "Redirect Tracer", desc: "Trace 301/302 redirect hops.", action: "Trace", endpoint: "/api/tools/redirect-tracer", fields: [{id: "rd-url", label: "Target URL", type: "text"}] },
    { id: "eeat", name: "E-E-A-T Assessor", desc: "Score content quality based on inputs.", action: "Assess", endpoint: "/api/tools/eeat-assessment", fields: [{id: "e-answers", label: "Quality Checklist", type: "checkboxes", questions: ["Does the content provide original information, reporting, research, or analysis?", "Does the content provide a substantial, complete, or comprehensive description of the topic?", "Does the content provide insightful analysis or interesting information that is beyond the obvious?", "Does the content avoid simply copying or rewriting other sources?", "Does the main heading or page title provide a descriptive, helpful summary of the content?", "Does the main heading or page title avoid exaggerating or being shocking in nature?", "Is this the sort of page you'd want to bookmark, share with a friend, or recommend?", "Would you expect to see this content in or referenced by a printed magazine, encyclopedia, or book?", "Does the content provide substantial value when compared to other pages in search results?", "Is the content free of spelling or stylistic issues?", "Is the content produced well, and doesn't appear sloppy or hastily produced?", "Does the content present information in a way that makes you want to trust it?", "Is this content written or reviewed by an expert or enthusiast who demonstrably knows the topic well?"]}] },
    { id: "discover", name: "Google Discover Validator", desc: "Check Discover image & meta tags.", action: "Validate", endpoint: "/api/tools/discover-validator", fields: [{id: "d-url", label: "Target URL", type: "text"}] },
    { id: "safesearch", name: "SafeSearch Classifier", desc: "Generate SafeSearch adult tags.", action: "Classify", endpoint: "/api/tools/safesearch-classifier", fields: [{id: "ss-dirs", label: "Adult Directories", type: "list", placeholder: "e.g., /adult/"}] },
    { id: "urlauditor", name: "URL Path Auditor", desc: "Audit URL path cleanliness.", action: "Audit", endpoint: "/api/tools/url-auditor", fields: [{id: "ua-domain", label: "Domain to audit", type: "text"}] },
    { id: "gsc", name: "GSC Drop Diagnoser", desc: "Diagnose traffic drop reasons.", action: "Diagnose", endpoint: "/api/tools/gsc-diagnoser", fields: [{id: "gsc-prop", label: "GSC Property", type: "text", placeholder: "https://example.com"}, {id: "gsc-dates", label: "Date Range", type: "text", placeholder: "YYYY-MM-DD to YYYY-MM-DD"}] },
    { id: "datecheck", name: "Date Consistency Checker", desc: "Compare URL date vs Meta date.", action: "Check", endpoint: "/api/tools/date-consistency", fields: [{id: "dc-url", label: "Target URL", type: "text"}] },
    { id: "spadiff", name: "SPA DOM Diffing", desc: "Compare Raw HTML vs JS render.", action: "Analyze", endpoint: "/api/tools/spa-lazy-load", fields: [{id: "spa-url", label: "Target URL", type: "text"}] },
    { id: "pdfaccess", name: "PDF Accessibility", desc: "Check X-Robots-Tag for PDFs.", action: "Check", endpoint: "/api/tools/non-html-accessibility", fields: [{id: "pdf-url", label: "PDF URL", type: "text"}] },
    { id: "review", name: "Product Review Grader", desc: "Grade affiliate review pages.", action: "Grade", endpoint: "/api/tools/product-review-grader", fields: [{id: "pr-url", label: "Target URL", type: "text"}] },
    { id: "paywall", name: "Paywall Auditor", desc: "Verify isAccessibleForFree schema.", action: "Verify", endpoint: "/api/tools/paywall-auditor", fields: [{id: "pw-url", label: "Target URL", type: "text"}] },
    { id: "snippet", name: "Snippet Scanner", desc: "Scan max-snippet robot tags.", action: "Scan", endpoint: "/api/tools/snippet-scanner", fields: [{id: "sn-url", label: "Target URL", type: "text"}] },
    { id: "server", name: "Server Maintenance", desc: "Validate 503 Retry-After headers.", action: "Validate", endpoint: "/api/tools/server-maintenance", fields: [{id: "sm-domain", label: "Target Domain", type: "text"}] },
    { id: "indexing", name: "Indexing API Advisor", desc: "Validate GCP service account JSON.", action: "Validate", endpoint: "/api/tools/indexing-api-advisor", fields: [{id: "ia-json", label: "Credentials JSON", type: "textarea", placeholder: "{...}"}] },
    { id: "localseo", name: "Local SEO Auditor", desc: "Check NAP alignment in HTML.", action: "Audit", endpoint: "/api/tools/local-seo-auditor", fields: [{id: "ls-url", label: "URL", type: "text"}, {id: "ls-name", label: "Business Name", type: "text"}, {id: "ls-address", label: "Address", type: "text"}, {id: "ls-phone", label: "Phone", type: "text"}] }
];

function initToolsHub() {
    const toolsGrid = document.querySelector('.tools-grid');
    if (toolsGrid.children.length > 0) return; // Already initialized

    TOOLS_REGISTRY.forEach(tool => {
        const card = document.createElement('div');
        card.className = 'tool-card card';
        card.innerHTML = `
            <h3>${tool.name}</h3>
            <p class="tool-desc">${tool.desc}</p>
            <div class="tool-footer" style="margin-top:auto">
                <a href="#/tools/${tool.id}" class="btn btn-primary btn-sm">Open Tool</a>
            </div>
        `;
        toolsGrid.appendChild(card);
    });
}

function renderSingleTool(id) {
    const tool = TOOLS_REGISTRY.find(t => t.id === id);
    if (!tool) return;
    
    document.getElementById('single-tool-name').innerText = tool.name;
    document.getElementById('single-tool-desc').innerText = tool.desc;
    
    const container = document.getElementById('single-tool-form-container');
    container.innerHTML = '';
    
    const formDiv = document.createElement('div');
    formDiv.className = 'tool-form';
    formDiv.id = `form-${tool.id}`;
    
    tool.fields.forEach(f => {
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `<label style="display:block; margin-bottom:5px; font-weight:600;">${f.label || ''}</label>`;
        
        if (f.type === 'textarea') {
            group.innerHTML += `<textarea id="${f.id}" class="tool-input" rows="4" placeholder="${f.placeholder || ''}"></textarea>`;
        } else if (f.type === 'select') {
            const options = f.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
            group.innerHTML += `<select id="${f.id}" class="tool-input">${options}</select>`;
        } else if (f.type === 'list') {
            group.innerHTML += `
                <div class="dynamic-list" id="${f.id}-list" style="margin-bottom:8px;"></div>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="${f.id}-input" placeholder="${f.placeholder || ''}" class="tool-input" style="flex:1;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="addListItem('${f.id}')">Add</button>
                </div>
                <input type="hidden" id="${f.id}" value="[]">
            `;
        } else if (f.type === 'keyvalue') {
            group.innerHTML += `
                <div class="dynamic-list" id="${f.id}-list" style="margin-bottom:8px;"></div>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="${f.id}-key" placeholder="${f.keyPlaceholder || 'Key'}" class="tool-input" style="flex:1;">
                    <input type="text" id="${f.id}-val" placeholder="${f.valPlaceholder || 'Value'}" class="tool-input" style="flex:1;">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="addKeyValueItem('${f.id}')">Add</button>
                </div>
                <input type="hidden" id="${f.id}" value="{}">
            `;
        } else if (f.type === 'checkboxes') {
             const checks = f.questions.map((q, idx) => `
                <div style="margin-bottom:5px;">
                    <input type="checkbox" id="${f.id}-chk-${idx}" class="tool-chk">
                    <label for="${f.id}-chk-${idx}" style="font-weight:normal; margin-left:5px;">${q.replace(/'/g, "&#39;")}</label>
                </div>
             `).join('');
             group.innerHTML += checks;
        } else if (f.type === 'schema_builder') {
             const typeOptions = Object.keys(SCHEMA_TEMPLATES).map(k => `<option value="${k}">${k}</option>`).join('');
             group.innerHTML += `
                <div style="margin-bottom:10px;">
                    <label style="display:block; font-weight:600;">Schema Type</label>
                    <select id="${f.id}-type" class="tool-input" onchange="renderSchemaForm('${f.id}')">${typeOptions}</select>
                </div>
                <div id="${f.id}-form" style="margin-top:15px;"></div>
                <div style="margin-top:20px; border-top:1px solid #444; padding-top:15px;">
                    <label style="display:block; font-weight:600; margin-bottom:8px;">Live JSON-LD Preview</label>
                    <pre id="${f.id}-preview" style="background:#0d1117; border:1px solid #333; border-radius:6px; padding:15px; color:#7ee787; font-size:0.85em; max-height:400px; overflow:auto; white-space:pre-wrap;"></pre>
                </div>
             `;
             setTimeout(() => renderSchemaForm(f.id), 0);
        } else {
            group.innerHTML += `<input type="${f.type}" id="${f.id}" placeholder="${f.placeholder || ''}" class="tool-input">`;
        }
        
        formDiv.appendChild(group);
    });
    
    formDiv.innerHTML += `<div class="tool-result hidden" id="res-${tool.id}"></div>`;
    container.appendChild(formDiv);
    
    const btnDiv = document.createElement('div');
    btnDiv.style.marginTop = '15px';
    btnDiv.innerHTML = `<button class="btn btn-primary" id="btn-submit-${tool.id}" onclick="submitTool('${tool.id}', '${tool.endpoint}')">${tool.action}</button>`;
    container.appendChild(btnDiv);
}

// Dynamic List Helpers
window.addListItem = function(id) {
    const input = document.getElementById(`${id}-input`);
    const val = input.value.trim();
    if (!val) return;
    const hidden = document.getElementById(id);
    const list = JSON.parse(hidden.value || "[]");
    list.push(val);
    hidden.value = JSON.stringify(list);
    renderDynamicList(id, list);
    input.value = '';
};

window.renderDynamicList = function(id, list) {
    const container = document.getElementById(`${id}-list`);
    container.innerHTML = list.map((item, idx) => `
        <div class="badge badge-secondary" style="margin:2px; display:inline-block;">
            ${item} <span style="cursor:pointer; margin-left:5px;" onclick="removeListItem('${id}', ${idx})">&times;</span>
        </div>
    `).join('');
};

window.removeListItem = function(id, idx) {
    const hidden = document.getElementById(id);
    const list = JSON.parse(hidden.value || "[]");
    list.splice(idx, 1);
    hidden.value = JSON.stringify(list);
    renderDynamicList(id, list);
};

// Dynamic Key-Value Helpers
window.addKeyValueItem = function(id) {
    const key = document.getElementById(`${id}-key`).value.trim();
    const val = document.getElementById(`${id}-val`).value.trim();
    if (!key || !val) return;
    const hidden = document.getElementById(id);
    const obj = JSON.parse(hidden.value || "{}");
    obj[key] = val;
    hidden.value = JSON.stringify(obj);
    renderDynamicKeyValue(id, obj);
    document.getElementById(`${id}-key`).value = '';
    document.getElementById(`${id}-val`).value = '';
};

window.renderDynamicKeyValue = function(id, obj) {
    const container = document.getElementById(`${id}-list`);
    container.innerHTML = Object.keys(obj).map(key => `
        <div class="badge badge-secondary" style="margin:2px; display:inline-block;">
            ${key}: ${obj[key]} <span style="cursor:pointer; margin-left:5px;" onclick="removeKeyValueItem('${id}', '${key}')">&times;</span>
        </div>
    `).join('');
};

window.removeKeyValueItem = function(id, key) {
    const hidden = document.getElementById(id);
    const obj = JSON.parse(hidden.value || "{}");
    delete obj[key];
    hidden.value = JSON.stringify(obj);
    renderDynamicKeyValue(id, obj);
};

// ========== Recursive Schema Form Builder ==========
let _schemaCounter = 0;

window.renderSchemaForm = function(builderId) {
    const typeSelect = document.getElementById(`${builderId}-type`);
    const container = document.getElementById(`${builderId}-form`);
    if (!typeSelect || !container) return;

    const type = typeSelect.value;
    const template = SCHEMA_TEMPLATES[type];
    if (!template) { container.innerHTML = ''; return; }

    _schemaCounter = 0;
    container.innerHTML = buildFieldsHTML(template, builderId, 0);

    container.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => updateSchemaPreview(builderId));
    });
    updateSchemaPreview(builderId);
};

function buildFieldsHTML(obj, prefix, depth) {
    let html = '';
    const indent = depth * 16;
    for (const key in obj) {
        if (key === '@type' || key === '@context') continue;
        const val = obj[key];
        const fieldId = `${prefix}__${key}`;
        const labelStyle = `font-weight:600; color:${depth === 0 ? '#58a6ff' : '#d2a8ff'}; font-size:${depth === 0 ? '0.95em' : '0.88em'};`;

        if (Array.isArray(val)) {
            if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                html += `
                <div class="schema-field" style="margin-left:${indent}px; margin-bottom:14px; border-left:3px solid #238636; padding-left:12px;">
                    <div style="display:flex; align-items:center; margin-bottom:8px;">
                        <label style="${labelStyle}">${key}</label>
                        <span style="color:#8b949e; font-size:0.78em; margin-left:8px; background:#21262d; padding:1px 6px; border-radius:3px;">array</span>
                        <button type="button" class="btn btn-sm" style="margin-left:auto; font-size:0.75em; padding:2px 10px; background:#238636; color:#fff; border:none; border-radius:4px;" onclick="addArrayItem('${prefix}', '${key}', ${depth})">+ Add ${key}</button>
                    </div>
                    <div id="${fieldId}-items">
                        ${buildArrayItemHTML(fieldId, val[0], 0, depth + 1)}
                    </div>
                </div>`;
            } else {
                html += `
                <div class="schema-field" style="margin-left:${indent}px; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; margin-bottom:6px;">
                        <label style="${labelStyle}">${key}</label>
                        <span style="color:#8b949e; font-size:0.78em; margin-left:8px; background:#21262d; padding:1px 6px; border-radius:3px;">list</span>
                        <button type="button" class="btn btn-sm" style="margin-left:auto; font-size:0.75em; padding:2px 10px; background:#1f6feb; color:#fff; border:none; border-radius:4px;" onclick="addStringArrayItem('${fieldId}')">+ Add</button>
                    </div>
                    <div id="${fieldId}-items">
                        <div class="string-array-row" style="display:flex; gap:6px; margin-bottom:4px; align-items:center;">
                            <input type="text" class="tool-input schema-str-arr" data-field="${fieldId}" placeholder="${key}" style="flex:1;">
                            <button type="button" style="background:none; border:none; color:#f85149; cursor:pointer; font-size:1.1em;" onclick="this.parentElement.remove(); updateSchemaPreview('s-builder')">&times;</button>
                        </div>
                    </div>
                </div>`;
            }
        } else if (typeof val === 'object' && val !== null) {
            html += `
            <div class="schema-field" style="margin-left:${indent}px; margin-bottom:14px; border-left:3px solid #1f6feb; padding-left:12px;">
                <label style="${labelStyle} display:block; margin-bottom:8px;">${key} <span style="color:#8b949e; font-size:0.78em; background:#21262d; padding:1px 6px; border-radius:3px;">object</span></label>
                ${buildFieldsHTML(val, fieldId, depth + 1)}
            </div>`;
        } else {
            const inputType = typeof val === 'number' ? 'number' : 'text';
            const placeholder = val !== '' && val !== 0 ? String(val) : key;
            const defaultVal = (typeof val === 'string' && (val.startsWith('https://schema.org/') || val.startsWith('https://example.com/'))) ? val : (typeof val === 'number' && val !== 0 ? val : '');
            html += `
            <div class="schema-field" style="margin-left:${indent}px; margin-bottom:8px; display:flex; align-items:center; gap:10px;">
                <label style="${labelStyle} min-width:140px; flex-shrink:0;">${key}</label>
                <input type="${inputType}" class="tool-input schema-val" data-field="${fieldId}" placeholder="${placeholder}" value="${defaultVal}" style="flex:1;">
            </div>`;
        }
    }
    return html;
}

function buildArrayItemHTML(fieldId, templateObj, index, depth) {
    const itemId = `${fieldId}-${_schemaCounter++}`;
    return `
    <div class="schema-array-item" id="${itemId}" style="position:relative; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:12px 12px 4px 12px; margin-bottom:8px;">
        <button type="button" style="position:absolute; top:6px; right:8px; background:none; border:none; color:#f85149; cursor:pointer; font-size:1.2em; line-height:1;" onclick="removeArrayItem('${itemId}')" title="Remove">&times;</button>
        ${buildFieldsHTML(templateObj, itemId, depth)}
    </div>`;
}

window.addArrayItem = function(prefix, key, depth) {
    const type = document.getElementById('s-builder-type').value;
    const template = SCHEMA_TEMPLATES[type];
    let arrTemplate = findTemplateArray(template, prefix, key);
    if (!arrTemplate || !Array.isArray(arrTemplate) || arrTemplate.length === 0) return;

    const fieldId = `${prefix}__${key}`;
    const container = document.getElementById(`${fieldId}-items`);
    if (!container) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = buildArrayItemHTML(fieldId, arrTemplate[0], container.children.length, depth + 1);
    const newItem = tempDiv.firstElementChild;
    container.appendChild(newItem);

    newItem.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => updateSchemaPreview('s-builder'));
    });
    updateSchemaPreview('s-builder');
};

function findTemplateArray(rootTemplate, prefix, key) {
    const parts = prefix.split('__').slice(1);
    let current = rootTemplate;
    for (const p of parts) {
        if (!current) return null;
        if (Array.isArray(current[p])) {
            current = current[p][0];
        } else if (typeof current[p] === 'object') {
            current = current[p];
        }
    }
    return current ? current[key] : null;
}

window.addStringArrayItem = function(fieldId) {
    const container = document.getElementById(`${fieldId}-items`);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'string-array-row';
    row.style.cssText = 'display:flex; gap:6px; margin-bottom:4px; align-items:center;';
    row.innerHTML = `
        <input type="text" class="tool-input schema-str-arr" data-field="${fieldId}" placeholder="" style="flex:1;">
        <button type="button" style="background:none; border:none; color:#f85149; cursor:pointer; font-size:1.1em;" onclick="this.parentElement.remove(); updateSchemaPreview('s-builder')">&times;</button>
    `;
    container.appendChild(row);
    row.querySelector('input').addEventListener('input', () => updateSchemaPreview('s-builder'));
};

window.removeArrayItem = function(itemId) {
    const el = document.getElementById(itemId);
    if (el) el.remove();
    updateSchemaPreview('s-builder');
};

window.updateSchemaPreview = function(builderId) {
    const preview = document.getElementById(`${builderId}-preview`);
    if (!preview) return;
    const data = collectSchemaData(builderId);
    preview.textContent = JSON.stringify(data, null, 2);
};

window.collectSchemaData = function(builderId) {
    const typeSelect = document.getElementById(`${builderId}-type`);
    if (!typeSelect) return {};
    const type = typeSelect.value;
    const template = SCHEMA_TEMPLATES[type];
    const formContainer = document.getElementById(`${builderId}-form`);
    if (!template || !formContainer) return {};

    const result = {
        "@context": "https://schema.org",
        "@type": type
    };

    collectFromTemplate(template, builderId, formContainer, result);
    return cleanEmpty(result);
};

function collectFromTemplate(template, prefix, container, result) {
    for (const key in template) {
        if (key === '@context' || key === '@type') continue;
        const val = template[key];
        const fieldId = `${prefix}__${key}`;

        if (Array.isArray(val)) {
            if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                const itemsContainer = document.getElementById(`${fieldId}-items`);
                if (!itemsContainer) continue;
                const items = itemsContainer.querySelectorAll(':scope > .schema-array-item');
                const arr = [];
                items.forEach(item => {
                    const obj = { "@type": val[0]["@type"] || key };
                    collectFromTemplate(val[0], item.id, item, obj);
                    arr.push(obj);
                });
                if (arr.length > 0) result[key] = arr;
            } else {
                const inputs = container.querySelectorAll(`input.schema-str-arr[data-field="${fieldId}"]`);
                const arr = [];
                inputs.forEach(inp => { if (inp.value.trim()) arr.push(inp.value.trim()); });
                if (arr.length > 0) result[key] = arr;
            }
        } else if (typeof val === 'object' && val !== null) {
            const obj = { "@type": val["@type"] || key };
            collectFromTemplate(val, fieldId, container, obj);
            if (Object.keys(obj).length > (val["@type"] ? 1 : 0)) result[key] = obj;
        } else {
            const input = container.querySelector(`input.schema-val[data-field="${fieldId}"]`);
            if (input && input.value.trim()) {
                result[key] = input.type === 'number' ? Number(input.value) : input.value.trim();
            }
        }
    }
}

function cleanEmpty(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) {
        return obj.map(cleanEmpty).filter(v => {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                const keys = Object.keys(v).filter(k => k !== '@type');
                return keys.length > 0;
            }
            return v !== '' && v !== null && v !== undefined;
        });
    }
    const cleaned = {};
    for (const k in obj) {
        const v = cleanEmpty(obj[k]);
        if (v === '' || v === null || v === undefined) continue;
        if (typeof v === 'object' && !Array.isArray(v)) {
            const keys = Object.keys(v).filter(key => key !== '@type');
            if (keys.length === 0) continue;
        }
        if (Array.isArray(v) && v.length === 0) continue;
        cleaned[k] = v;
    }
    return cleaned;
}

async function submitTool(id, endpoint) {
    const resBox = document.getElementById(`res-${id}`);
    resBox.classList.remove('hidden');
    resBox.innerHTML = 'Running...';
    
    const payload = {};
    try {
        if (id === 'robots') {
            payload.target_crawlers = JSON.parse(document.getElementById('r-crawlers').value || "[]");
            payload.allow_paths = JSON.parse(document.getElementById('r-allow').value || "[]");
            payload.urls_to_disallow = JSON.parse(document.getElementById('r-disallow').value || "[]");
            payload.allowed_directories = payload.allow_paths;
        } else if (id === 'schema') {
            payload.schema_type = document.getElementById('s-builder-type').value;
            payload.parameters = collectSchemaData('s-builder');
            delete payload.parameters['@context'];
            delete payload.parameters['@type'];
        } else if (id === 'sitemap') {
            payload.urls = JSON.parse(document.getElementById('sm-urls').value || "[]");
        } else if (id === 'hreflang') {
            const mappingsObj = JSON.parse(document.getElementById('h-map').value || '{}');
            payload.mappings = Object.keys(mappingsObj).map(k => ({url: k, lang: mappingsObj[k]}));
        } else if (id === 'eeat') {
            const toolDef = TOOLS_REGISTRY.find(t => t.id === 'eeat');
            const questions = toolDef.fields.find(f => f.id === 'e-answers').questions;
            const answers = {};
            questions.forEach((q, idx) => {
                answers[q] = document.getElementById(`e-answers-chk-${idx}`).checked;
            });
            payload.answers = answers;
        } else if (id === 'redirect') {
            payload.url = document.getElementById('rd-url').value;
        } else if (id === 'discover') {
            payload.url = document.getElementById('d-url').value;
        } else if (id === 'safesearch') {
            payload.directories = JSON.parse(document.getElementById('ss-dirs').value || "[]");
        } else if (id === 'urlauditor') {
            payload.domain = document.getElementById('ua-domain').value;
        } else if (id === 'gsc') {
            payload.property = document.getElementById('gsc-prop').value;
            payload.dates = document.getElementById('gsc-dates').value;
        } else if (id === 'datecheck' || id === 'spadiff' || id === 'pdfaccess' || id === 'review' || id === 'paywall' || id === 'snippet') {
            const val = document.getElementById(document.querySelector(`#form-${id} .tool-input`).id).value;
            payload.url = val;
        } else if (id === 'server') {
            payload.domain = document.getElementById('sm-domain').value;
        } else if (id === 'indexing') {
            payload.credentials_json = document.getElementById('ia-json').value;
        } else if (id === 'localseo') {
            payload.url = document.getElementById('ls-url').value;
            payload.name = document.getElementById('ls-name').value;
            payload.address = document.getElementById('ls-address').value;
            payload.phone = document.getElementById('ls-phone').value;
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('seoking_token')
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if(!response.ok) throw new Error(data.detail || 'Error running tool');
        
        resBox.innerHTML = `<pre style="white-space:pre-wrap; word-wrap:break-word; color:#7ee787;">${JSON.stringify(data, null, 2)}</pre>`;
    } catch(err) {
        resBox.innerHTML = `<span class="text-danger">${err.message}</span>`;
    }
}
