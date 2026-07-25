/**
 * SEO King - Tools Schema Form Builder Engine
 * Manages recursive template rendering, dynamic array insertion, and JSON-LD live preview.
 */

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
    const typeSelect = document.getElementById('s-builder-type');
    if (!typeSelect) return;
    const type = typeSelect.value;
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
