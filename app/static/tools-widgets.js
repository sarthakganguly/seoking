/**
 * SEO King - Tools Dynamic UI Widgets Component
 * Manages stateful dynamic lists, key-value maps, tag chips, and preset shortcuts.
 */

// ========== Dynamic List Helpers ==========

window.addListItem = function(id) {
    const input = document.getElementById(`${id}-input`);
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;
    const hidden = document.getElementById(id);
    const list = JSON.parse(hidden.value || "[]");
    list.push(val);
    hidden.value = JSON.stringify(list);
    renderDynamicList(id, list);
    input.value = '';
};

window.addPresetItem = function(id, val) {
    const hidden = document.getElementById(id);
    if (!hidden) return;
    const list = JSON.parse(hidden.value || "[]");
    if (!list.includes(val)) {
        list.push(val);
        hidden.value = JSON.stringify(list);
        renderDynamicList(id, list);
    }
};

window.renderDynamicList = function(id, list) {
    const container = document.getElementById(`${id}-list`);
    if (!container) return;
    container.innerHTML = list.map((item, idx) => `
        <div class="badge badge-secondary" style="margin:2px; display:inline-block;">
            ${item} <span style="cursor:pointer; margin-left:5px;" onclick="removeListItem('${id}', ${idx})">&times;</span>
        </div>
    `).join('');
};

window.removeListItem = function(id, idx) {
    const hidden = document.getElementById(id);
    if (!hidden) return;
    const list = JSON.parse(hidden.value || "[]");
    list.splice(idx, 1);
    hidden.value = JSON.stringify(list);
    renderDynamicList(id, list);
};

// ========== Dynamic Key-Value Helpers ==========

window.addKeyValueItem = function(id) {
    const keyInput = document.getElementById(`${id}-key`);
    const valInput = document.getElementById(`${id}-val`);
    if (!keyInput || !valInput) return;
    const key = keyInput.value.trim();
    const val = valInput.value.trim();
    if (!key || !val) return;
    const hidden = document.getElementById(id);
    const obj = JSON.parse(hidden.value || "{}");
    obj[key] = val;
    hidden.value = JSON.stringify(obj);
    renderDynamicKeyValue(id, obj);
    keyInput.value = '';
    valInput.value = '';
};

window.renderDynamicKeyValue = function(id, obj) {
    const container = document.getElementById(`${id}-list`);
    if (!container) return;
    container.innerHTML = Object.keys(obj).map(key => `
        <div class="badge badge-secondary" style="margin:2px; display:inline-block;">
            ${key}: ${obj[key]} <span style="cursor:pointer; margin-left:5px;" onclick="removeKeyValueItem('${id}', '${key}')">&times;</span>
        </div>
    `).join('');
};

window.removeKeyValueItem = function(id, key) {
    const hidden = document.getElementById(id);
    if (!hidden) return;
    const obj = JSON.parse(hidden.value || "{}");
    delete obj[key];
    hidden.value = JSON.stringify(obj);
    renderDynamicKeyValue(id, obj);
};
