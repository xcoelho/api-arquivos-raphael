const API = '/arquivos';

let state = {
    folders: [],
    currentFolder: null,
    currentFile: null,
    files: []
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(message, type = 'info') {
    const container = $('#toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

function showModal(title, description, fields, onSubmit) {
    const overlay = $('#modal-overlay');
    const modal = $('#modal');
    modal.innerHTML = `
        <h2>${title}</h2>
        <p>${description}</p>
        ${fields.map(f => `
            <div style="margin-bottom: 12px">
                <label for="modal-${f.key}">${f.label}</label>
                <input type="text" id="modal-${f.key}" placeholder="${f.placeholder || ''}" ${f.autofocus ? 'autofocus' : ''}>
            </div>
        `).join('')}
        <div class="modal-actions">
            <button class="btn" id="modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="modal-confirm">${fields.length > 0 ? 'Criar' : 'Confirmar'}</button>
        </div>
    `;
    overlay.classList.add('visible');

    $('#modal-cancel').onclick = () => {
        overlay.classList.remove('visible');
    };

    $('#modal-confirm').onclick = () => {
        const values = {};
        fields.forEach(f => {
            values[f.key] = $(`#modal-${f.key}`)?.value || '';
        });
        overlay.classList.remove('visible');
        onSubmit(values);
    };

    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.classList.remove('visible');
    };

    const firstInput = modal.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

async function apiCall(method, endpoint, body) {
    const opts = {
        method,
        headers: { 'Accept': 'application/json' }
    };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}${endpoint}`, opts);
    const text = await res.text();
    if (!res.ok) throw new Error(text || 'Erro na requisição');
    try { return JSON.parse(text); } catch { return text; }
}

async function loadFolders() {
    $('#folder-list-loading').style.display = 'block';
    try {
        state.folders = await apiCall('GET', '/list-folders');
        renderFolders();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        $('#folder-list-loading').style.display = 'none';
    }
}

function renderFolders() {
    const list = $('#folder-list');
    const items = list.querySelectorAll('.folder-item:not(.hidden)');
    items.forEach(el => el.remove());

    state.folders.forEach(name => {
        const div = document.createElement('div');
        div.className = 'folder-item';
        if (name === state.currentFolder) div.classList.add('active');
        div.innerHTML = `<span class="icon">📂</span><span class="name">${escapeHtml(name)}</span>`;
        div.onclick = () => selectFolder(name);
        list.appendChild(div);
    });

    if (state.folders.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '16px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--text-muted)';
        empty.style.fontSize = '13px';
        empty.textContent = 'Nenhuma pasta';
        empty.id = 'folder-empty';
        list.appendChild(empty);
    } else {
        const existing = $('#folder-empty');
        if (existing) existing.remove();
    }
}

async function selectFolder(name) {
    state.currentFolder = name;
    state.currentFile = null;
    state.files = [];

    $$('.folder-item').forEach(el => {
        el.classList.toggle('active', el.querySelector('.name')?.textContent === name);
    });

    $('#file-list').classList.add('visible');
    $('#folder-name-title').textContent = name;
    $('#editor-panel').classList.remove('visible');
    $('#empty-state').style.display = 'none';

    $('#file-grid-loading').style.display = 'flex';
    try {
        state.files = await apiCall('GET', `/list-files?folder=${encodeURIComponent(name)}`);
        renderFiles();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        $('#file-grid-loading').style.display = 'none';
    }
}

function renderFiles() {
    const grid = $('#file-grid');
    const items = grid.querySelectorAll('.file-card');
    items.forEach(el => el.remove());

    if (state.files.length === 0) {
        $('#file-grid-empty').style.display = 'block';
    } else {
        $('#file-grid-empty').style.display = 'none';
    }

    state.files.forEach(name => {
        const card = document.createElement('div');
        card.className = 'file-card';
        if (name === state.currentFile) card.classList.add('active');
        const fileName = name.replace(/\.txt$/i, '');
        card.innerHTML = `
            <span class="icon">📄</span>
            <div class="info">
                <div class="file-name">${escapeHtml(fileName)}</div>
                <div class="file-size">.txt</div>
            </div>
        `;
        card.onclick = () => selectFile(fileName);
        grid.appendChild(card);
    });
}

async function selectFile(name) {
    state.currentFile = name;

    $$('.file-card').forEach(el => {
        const fn = el.querySelector('.file-name')?.textContent;
        el.classList.toggle('active', fn === name);
    });

    $('#editor-panel').classList.add('visible');
    $('#editor-filename').textContent = `${name}.txt`;

    try {
        $('#editor-textarea').value = 'Carregando...';
        const content = await apiCall('GET', `/read-file?folder=${encodeURIComponent(state.currentFolder)}&file=${encodeURIComponent(name)}`);
        $('#editor-textarea').value = content;
    } catch (err) {
        $('#editor-textarea').value = '';
        toast(err.message, 'error');
    }
}

async function createFolderAction() {
    showModal(
        'Nova Pasta',
        'Digite o nome da pasta que deseja criar.',
        [{ key: 'folder', label: 'Nome da pasta', placeholder: 'ex: minha-pasta', autofocus: true }],
        async (values) => {
            if (!values.folder.trim()) { toast('Nome da pasta é obrigatório', 'error'); return; }
            try {
                await apiCall('POST', '/create-folder', { folder: values.folder.trim() });
                toast(`Pasta "${values.folder.trim()}" criada!`, 'success');
                await loadFolders();
                await selectFolder(values.folder.trim());
            } catch (err) {
                toast(err.message, 'error');
            }
        }
    );
}

async function createFileAction() {
    if (!state.currentFolder) { toast('Selecione uma pasta primeiro', 'error'); return; }
    showModal(
        'Novo Arquivo',
        `Digite o nome do arquivo em <strong>${escapeHtml(state.currentFolder)}</strong>.`,
        [{ key: 'file', label: 'Nome do arquivo', placeholder: 'ex: meu-arquivo', autofocus: true }],
        async (values) => {
            if (!values.file.trim()) { toast('Nome do arquivo é obrigatório', 'error'); return; }
            try {
                await apiCall('POST', '/create-file', { folder: state.currentFolder, file: values.file.trim() });
                toast(`Arquivo "${values.file.trim()}.txt" criado!`, 'success');
                await selectFolder(state.currentFolder);
            } catch (err) {
                toast(err.message, 'error');
            }
        }
    );
}

async function saveContentAction() {
    if (!state.currentFolder || !state.currentFile) { toast('Selecione um arquivo para salvar', 'error'); return; }
    const content = $('#editor-textarea').value;
    try {
        await apiCall('POST', '/save-text', {
            folder: state.currentFolder,
            file: state.currentFile,
            content
        });
        toast('Arquivo salvo com sucesso!', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function deleteFileAction() {
    if (!state.currentFolder || !state.currentFile) { toast('Selecione um arquivo', 'error'); return; }
    showModal(
        'Apagar Arquivo',
        `Tem certeza que deseja apagar <strong>${escapeHtml(state.currentFile)}.txt</strong>?`,
        [],
        async () => {
            try {
                await apiCall('GET', `/delete-file?folder=${encodeURIComponent(state.currentFolder)}&file=${encodeURIComponent(state.currentFile)}`);
                toast(`Arquivo "${state.currentFile}.txt" apagado!`, 'success');
                state.currentFile = null;
                $('#editor-panel').classList.remove('visible');
                await selectFolder(state.currentFolder);
            } catch (err) {
                toast(err.message, 'error');
            }
        }
    );
}

async function deleteFolderAction() {
    if (!state.currentFolder) { toast('Selecione uma pasta', 'error'); return; }
    showModal(
        'Apagar Pasta',
        `Tem certeza que deseja apagar a pasta <strong>${escapeHtml(state.currentFolder)}</strong> e todo seu conteúdo?`,
        [],
        async () => {
            try {
                await apiCall('GET', `/delete-folder?folder=${encodeURIComponent(state.currentFolder)}`);
                toast(`Pasta "${state.currentFolder}" apagada!`, 'success');
                state.currentFolder = null;
                state.currentFile = null;
                $('#editor-panel').classList.remove('visible');
                $('#file-list').classList.remove('visible');
                $('#empty-state').style.display = 'flex';
                await loadFolders();
            } catch (err) {
                toast(err.message, 'error');
            }
        }
    );
}

async function exportAction() {
    try {
        const data = await apiCall('GET', '/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('JSON exportado com sucesso!', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function importAction() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            let parsed;
            try {
                parsed = JSON.parse(reader.result);
            } catch {
                toast('Arquivo JSON inválido', 'error');
                return;
            }
            if (!parsed.data || !Array.isArray(parsed.data)) {
                toast('JSON não contém a propriedade "data"', 'error');
                return;
            }
            showModal(
                'Importar Dados',
                `Isso vai <strong>substituir todos os dados atuais</strong> pelos dados do arquivo. Tem certeza?`,
                [],
                async () => {
                    try {
                        await apiCall('POST', '/import', parsed);
                        toast('Dados importados com sucesso!', 'success');
                        state.currentFolder = null;
                        state.currentFile = null;
                        $('#editor-panel').classList.remove('visible');
                        $('#file-list').classList.remove('visible');
                        $('#empty-state').style.display = 'flex';
                        await loadFolders();
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            );
        };
        reader.readAsText(file);
    };
    input.click();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightText(text, query) {
    const escaped = escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escaped.replace(regex, '<em>$1</em>');
}

async function searchAction() {
    const q = $('#search-input').value.trim();
    if (!q) { toast('Digite uma palavra para pesquisar', 'error'); return; }

    try {
        const results = await apiCall('GET', `/search?q=${encodeURIComponent(q)}`);
        showSearchResults(q, results);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function showSearchResults(query, results) {
    state.currentFolder = null;
    state.currentFile = null;
    $('#empty-state').style.display = 'none';
    $('#file-list').classList.remove('visible');
    $('#editor-panel').classList.remove('visible');
    $('#search-results-list').innerHTML = '';
    $('#search-results-empty').style.display = 'none';

    if (results.length === 0) {
        $('#search-results-title').textContent = `🔍 0 resultados para "${query}"`;
        $('#search-results-empty').style.display = 'block';
    } else {
        $('#search-results-title').textContent = `🔍 ${results.length} resultado${results.length > 1 ? 's' : ''} para "${query}"`;
        results.forEach(r => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="result-path">📂 ${escapeHtml(r.folder)} / 📄 ${escapeHtml(r.file)}.txt</div>
                <div class="result-preview">${highlightText(r.preview, query)}</div>
            `;
            item.onclick = () => navigateToResult(r.folder, r.file);
            $('#search-results-list').appendChild(item);
        });
    }

    $('#search-results').classList.add('visible');
}

function navigateToResult(folder, file) {
    state.currentFolder = folder;
    state.currentFile = file;
    $('#search-results').classList.remove('visible');
    $('#empty-state').style.display = 'none';
    $('#file-list').classList.add('visible');
    $('#editor-panel').classList.add('visible');
    $('#folder-name-title').textContent = folder;
    $('#editor-filename').textContent = `${file}.txt`;

    loadFolders();
    $$('.folder-item').forEach(el => {
        el.classList.toggle('active', el.querySelector('.name')?.textContent === folder);
    });

    apiCall('GET', `/list-files?folder=${encodeURIComponent(folder)}`).then(files => {
        state.files = files;
        const grid = $('#file-grid');
        grid.querySelectorAll('.file-card').forEach(el => el.remove());
        state.files.forEach(name => {
            const card = document.createElement('div');
            card.className = 'file-card';
            const fn = name.replace(/\.txt$/i, '');
            if (fn === file) card.classList.add('active');
            card.innerHTML = `<span class="icon">📄</span><div class="info"><div class="file-name">${escapeHtml(fn)}</div><div class="file-size">.txt</div></div>`;
            card.onclick = () => selectFile(fn);
            grid.appendChild(card);
        });
        $('#file-grid-empty').style.display = state.files.length === 0 ? 'block' : 'none';
    });

    apiCall('GET', `/read-file?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`).then(content => {
        $('#editor-textarea').value = content;
    }).catch(() => {
        $('#editor-textarea').value = '';
    });
}

function clearSearch() {
    $('#search-input').value = '';
    $('#search-results').classList.remove('visible');
    state.currentFolder = null;
    state.currentFile = null;
    $('#empty-state').style.display = 'flex';
    $('#editor-panel').classList.remove('visible');
    $('#file-list').classList.remove('visible');
    loadFolders();
}

function toggleApiTable() {
    const body = $('#api-body');
    const icon = $('#api-toggle-icon');
    body.classList.toggle('collapsed');
    icon.classList.toggle('open');
}

document.addEventListener('DOMContentLoaded', () => {
    loadFolders();
    toggleApiTable();

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveContentAction();
        }
    });
});
