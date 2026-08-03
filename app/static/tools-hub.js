/**
 * SEO King - Standalone Tools Hub Orchestrator Controller
 * Coordinates page view rendering, dynamic form generation, and API dispatching.
 */

function initToolsHub() {
    const toolsGrid = document.querySelector('.tools-grid');
    if (!toolsGrid || toolsGrid.children.length > 0) return; // Already initialized

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

function renderSingleTool(id, queryString = "") {
    const tool = TOOLS_REGISTRY.find(t => t.id === id);
    if (!tool) return;
    
    let prefillUrl = "";
    if (queryString) {
        const params = new URLSearchParams(queryString);
        prefillUrl = params.get("url") || "";
    }
    
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
        
        let prefillValue = "";
        if (prefillUrl && (f.type === 'url' || f.type === 'text') && (f.name.includes('url') || f.name.includes('domain') || f.id.includes('url') || f.id.includes('target'))) {
            prefillValue = prefillUrl;
        }

        if (f.type === 'textarea') {
            group.innerHTML += `<textarea id="${f.id}" class="tool-input" rows="4" placeholder="${f.placeholder || ''}">${escapeHtml(prefillValue)}</textarea>`;
        } else if (f.type === 'select') {
            const options = f.options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
            group.innerHTML += `<select id="${f.id}" class="tool-input">${options}</select>`;
        } else if (f.type === 'list') {
            const defaultList = f.defaultItems ? [...f.defaultItems] : [];
            let presetsHTML = '';
            if (f.presets && f.presets.length > 0) {
                presetsHTML = `
                    <div style="margin-top:6px; font-size:0.82em; color:var(--text-muted);">
                        Quick Presets: 
                        ${f.presets.map(p => `<span class="badge badge-secondary" style="cursor:pointer; margin:2px;" onclick="addPresetItem('${f.id}', '${p}')">+ ${p}</span>`).join('')}
                    </div>
                `;
            }
            group.innerHTML += `
                <div class="dynamic-list" id="${f.id}-list" style="margin-bottom:8px;"></div>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="${f.id}-input" placeholder="${f.placeholder || ''}" class="tool-input" style="flex:1;" onkeydown="if(event.key==='Enter'){event.preventDefault(); addListItem('${f.id}');}">
                    <button type="button" class="btn btn-sm btn-secondary" onclick="addListItem('${f.id}')">Add</button>
                </div>
                ${presetsHTML}
                <input type="hidden" id="${f.id}" value='${JSON.stringify(defaultList)}'>
            `;
            setTimeout(() => renderDynamicList(f.id, defaultList), 0);
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
        } else if (f.type === 'url') {
            let protocol = "https://";
            let val = prefillValue;
            if (val.startsWith("http://")) { protocol = "http://"; val = val.substring(7); }
            else if (val.startsWith("https://")) { protocol = "https://"; val = val.substring(8); }
            
            group.innerHTML += `
                <div style="display:flex; border: 1px solid #333; border-radius: 6px; overflow: hidden;">
                    <select id="${f.id}-protocol" style="background: #111; color: #fff; border: none; padding: 0 10px; outline: none; border-right: 1px solid #333; width: auto; font-family: inherit;">
                        <option value="https://" ${protocol === "https://" ? "selected" : ""}>https://</option>
                        <option value="http://" ${protocol === "http://" ? "selected" : ""}>http://</option>
                        <option value="">(none)</option>
                    </select>
                    <input type="text" id="${f.id}" placeholder="${(f.placeholder || 'example.com').replace(/^https?:\/\//, '')}" value="${escapeHtml(val)}" class="tool-input" style="flex:1; border: none; border-radius: 0; outline: none; box-shadow: none;">
                </div>
            `;
        } else {
            group.innerHTML += `<input type="${f.type}" id="${f.id}" placeholder="${f.placeholder || ''}" value="${escapeHtml(prefillValue)}" class="tool-input">`;
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

function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.triggerEphemeralDownload = function(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
};

async function submitTool(id, endpoint) {
    const resBox = document.getElementById(`res-${id}`);
    if (!resBox) return;
    resBox.classList.remove('hidden');
    resBox.innerHTML = '<span class="text-muted">Processing request...</span>';
    
    try {
        const tool = TOOLS_REGISTRY.find(t => t.id === id);
        if (!tool) throw new Error("Tool definition not found");

        const payload = serializeToolForm(tool);

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Tool execution failed');

        let html = '';
        
        if (data.what_this_tool_does) {
            html += `
                <div style="margin-bottom:12px; padding:12px 14px; background:#161b22; border-left:4px solid #38d9a9; border:1px solid #30363d; border-left-color:#38d9a9; border-radius:6px; font-size:0.88em; color:#c9d1d9; line-height:1.5;">
                    <strong style="color:#38d9a9; display:block; margin-bottom:4px;">ℹ️ Operational Purpose:</strong>
                    ${escapeHTML(data.what_this_tool_does)}
                </div>
            `;
        }

        if (data.audit_checks && Array.isArray(data.audit_checks)) {
            html += `
                <div style="margin-bottom:12px; border:1px solid #30363d; border-radius:6px; overflow:hidden;">
                    <div style="background:#161b22; padding:8px 12px; border-bottom:1px solid #30363d; font-size:0.85em; font-weight:600; color:#8b949e;">Technical Compliance Checks</div>
                    <table class="table" style="margin:0; font-size:0.85em;">
                        <tbody>
                            ${data.audit_checks.map(c => `
                                <tr>
                                    <td style="width:30px; text-align:center;">${c.passed ? '<span style="color:#38d9a9;">✓</span>' : '<span style="color:#f85149;">✗</span>'}</td>
                                    <td><strong>${escapeHTML(c.requirement)}</strong></td>
                                    <td style="color:var(--text-muted);">${escapeHTML(c.details)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const rawContent = data.xml || data.content;
        const filename = data.filename || (data.xml ? 'sitemap.xml' : 'discover_meta_tags.html');
        const mimeType = data.xml ? 'application/xml' : 'text/html';

        if (rawContent) {
            window[`_ephemeral_content_${id}`] = rawContent;
            window[`_ephemeral_filename_${id}`] = filename;
            window[`_ephemeral_mime_${id}`] = mimeType;

            html += `
                <div style="margin-bottom:12px; padding:12px; background:#161b22; border:1px solid #30363d; border-radius:6px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                    <div>
                        <strong style="color:${data.is_eligible === false ? '#f85149' : '#38d9a9'};">✓ ${escapeHTML(data.status || data.message || 'Output Generated')}</strong>
                        <div style="font-size:0.85em; color:var(--text-muted); margin-top:2px;">Ephemeral in-memory build ${data.total_urls !== undefined ? '(' + data.total_urls + ' URLs discovered)' : ''}</div>
                    </div>
                    <button type="button" class="btn btn-sm btn-primary" onclick="triggerEphemeralDownload(window['_ephemeral_content_${id}'], window['_ephemeral_filename_${id}'], window['_ephemeral_mime_${id}'])">Download ${escapeHTML(filename)}</button>
                </div>
            `;
        }

        const textToDisplay = rawContent ? rawContent : JSON.stringify(data, null, 2);
        const safeText = escapeHTML(textToDisplay);
        html += `<pre style="background:#0d1117; border:1px solid #333; padding:15px; border-radius:6px; color:#7ee787; font-size:0.9em; white-space:pre-wrap;">${safeText}</pre>`;
        
        resBox.innerHTML = html;
    } catch (err) {
        resBox.innerHTML = `<div class="error-banner">${escapeHTML(err.message)}</div>`;
    }
}
