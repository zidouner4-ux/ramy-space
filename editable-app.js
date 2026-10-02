(() => {
    const STORAGE_KEY = 'ramy-space-custom-data-v3';
    const DB_NAME = 'ramy-space-files-v1';
    const fileTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    const pomodoroToday = () => new Date().toISOString().slice(0, 10);
    const pomodoroState = {
        workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cycleLength: 4,
        stage: 'focus', remainingSeconds: 25 * 60, isRunning: false, endsAt: null,
        completedToday: 0, totalSessions: 0, date: pomodoroToday(), mission: ''
    };
    const dailyTracker = {};
    const trackerGoals = { noMasturbation: 'Pas de masturbation ce jour-là', noPorn: 'Pas de contenu X ce jour-là' };
    const budgetState = { balanceCents: 0, transactions: [] };
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let trackerViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let selectedTrackerDate = dateKey(new Date());
    let trackerObservedDate = selectedTrackerDate;
    let deferredInstallPrompt = null;
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const safeUrl = (value) => /^(https?:\/\/)/i.test(value) ? value : '#';

    function saveData() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                subjects, schedule, todos, journalEntries, streakCount, pomodoroState, dailyTracker, trackerGoals, budgetState,
                title: document.querySelector('header h1')?.textContent,
                goal: document.querySelector('main section .text-lg.font-black.text-sky-700')?.textContent,
                welcome: document.querySelector('main section p.text-xs.font-bold.uppercase.tracking-\\[0\\.2em\\].text-sky-600')?.textContent,
                headline: document.querySelector('main section h2')?.textContent,
                subjectsTitle: document.querySelector('#hub h3')?.textContent
            }));
            const saveStatus = document.getElementById('saveStatus');
            if (saveStatus) saveStatus.textContent = `✓ Sauvegardé dans ce navigateur · ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        } catch (error) {
            const saveStatus = document.getElementById('saveStatus');
            if (saveStatus) saveStatus.textContent = '⚠ Sauvegarde impossible sur cet appareil';
            alert('Impossible de sauvegarder ces données sur cet appareil. Vérifie l’espace disponible dans le navigateur.');
        }
    }

    function loadData() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (!saved) {
                subjects.splice(0, subjects.length);
                ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'].forEach((day) => {
                    schedule[day] = [];
                    todos[day] = [];
                });
                journalEntries.splice(0, journalEntries.length);
                streakCount = 0;
                return;
            }
            if (Array.isArray(saved.subjects)) subjects.splice(0, subjects.length, ...saved.subjects);
            if (saved.schedule && typeof saved.schedule === 'object') {
                Object.keys(schedule).forEach((day) => delete schedule[day]);
                Object.assign(schedule, saved.schedule);
            }
            if (saved.todos && typeof saved.todos === 'object') {
                Object.keys(todos).forEach((day) => delete todos[day]);
                Object.assign(todos, saved.todos);
            }
            if (Array.isArray(saved.journalEntries)) {
                const demoJournalNotes = [
                    'J’ai réussi à rester concentré 2h sans aller sur les réseaux sociaux. Je suis fier de moi.',
                    'J’ai terminé mon plan de révision. Discipline = résultats.'
                ];
                journalEntries.splice(0, journalEntries.length, ...saved.journalEntries.filter((entry) => !demoJournalNotes.includes(entry.text)));
            }
            if (Number.isFinite(saved.streakCount)) streakCount = saved.streakCount;
            if (saved.pomodoroState && typeof saved.pomodoroState === 'object') Object.assign(pomodoroState, saved.pomodoroState);
            if (saved.dailyTracker && typeof saved.dailyTracker === 'object') Object.assign(dailyTracker, saved.dailyTracker);
            if (saved.trackerGoals && typeof saved.trackerGoals === 'object') Object.assign(trackerGoals, saved.trackerGoals);
            if (saved.budgetState && typeof saved.budgetState === 'object') {
                if (Number.isSafeInteger(saved.budgetState.balanceCents) && saved.budgetState.balanceCents >= 0) budgetState.balanceCents = saved.budgetState.balanceCents;
                if (Array.isArray(saved.budgetState.transactions)) {
                    budgetState.transactions = saved.budgetState.transactions.filter((transaction) =>
                        transaction && typeof transaction.id === 'string' &&
                        ['income', 'expense'].includes(transaction.type) &&
                        Number.isSafeInteger(transaction.amountCents) && transaction.amountCents > 0 &&
                        typeof transaction.description === 'string' && typeof transaction.date === 'string'
                    );
                }
            }
            if (pomodoroState.date !== pomodoroToday()) {
                pomodoroState.completedToday = 0;
                pomodoroState.date = pomodoroToday();
            }
            if (saved.title) document.querySelector('header h1').textContent = saved.title;
            if (saved.goal) document.querySelector('main section .text-lg.font-black.text-sky-700').textContent = /major de promo/i.test(saved.goal) ? 'À mon rythme' : saved.goal;
            if (saved.welcome) document.querySelector('main section p.text-xs.font-bold.uppercase.tracking-\\[0\\.2em\\].text-sky-600').textContent = saved.welcome;
            if (saved.headline) document.querySelector('main section h2').textContent = saved.headline;
            if (saved.subjectsTitle) document.querySelector('#hub h3').textContent = saved.subjectsTitle;
        } catch (error) {
            console.warn('Saved app data could not be loaded:', error);
        }
    }

    function openFileDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function storeFile(file) {
        const db = await openFileDb();
        const record = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name: file.name, type: file.type, blob: file };
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('files', 'readwrite');
            transaction.objectStore('files').put(record);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
        return { id: record.id, name: record.name, type: record.type };
    }

    async function getStoredFile(id) {
        const db = await openFileDb();
        const record = await new Promise((resolve, reject) => {
            const request = db.transaction('files').objectStore('files').get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return record;
    }

    async function deleteStoredFile(id) {
        const db = await openFileDb();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('files', 'readwrite');
            transaction.objectStore('files').delete(id);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    const cardObjectUrls = [];

    async function storeCardScan(file, category) {
        const db = await openFileDb();
        const record = {
            id: `card-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            kind: 'card-scan', category, name: file.name, type: file.type,
            blob: file, savedAt: new Date().toISOString()
        };
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('files', 'readwrite');
            transaction.objectStore('files').put(record);
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    async function renderCards() {
        const grid = document.getElementById('cardsGrid');
        const empty = document.getElementById('cardsEmpty');
        const status = document.getElementById('cardStatus');
        cardObjectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
        grid.replaceChildren();

        try {
            const db = await openFileDb();
            const records = await new Promise((resolve, reject) => {
                const request = db.transaction('files').objectStore('files').getAll();
                request.onsuccess = () => resolve(request.result.filter((record) => record.kind === 'card-scan'));
                request.onerror = () => reject(request.error);
            });
            db.close();
            records.sort((first, second) => second.savedAt.localeCompare(first.savedAt));
            empty.hidden = records.length > 0;

            records.forEach((record) => {
                const url = URL.createObjectURL(record.blob);
                cardObjectUrls.push(url);
                const article = document.createElement('article');
                article.className = 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm';
                const openLink = document.createElement('a');
                openLink.href = url;
                openLink.target = '_blank';
                openLink.rel = 'noopener noreferrer';
                openLink.setAttribute('aria-label', `Ouvrir le scan : ${record.category}`);
                if (record.type === 'application/pdf') {
                    const preview = document.createElement('div');
                    preview.className = 'grid aspect-[1.58/1] place-items-center bg-sky-50 text-4xl';
                    preview.textContent = '📄';
                    openLink.appendChild(preview);
                } else {
                    const image = document.createElement('img');
                    image.src = url;
                    image.alt = `Scan : ${record.category}`;
                    image.className = 'aspect-[1.58/1] w-full bg-slate-100 object-cover';
                    openLink.appendChild(image);
                }
                const details = document.createElement('div');
                details.className = 'flex items-center justify-between gap-3 p-3';
                const label = document.createElement('div');
                const title = document.createElement('p');
                title.className = 'font-bold text-slate-800';
                title.textContent = record.category;
                const date = document.createElement('p');
                date.className = 'mt-1 text-xs text-slate-500';
                date.textContent = new Date(record.savedAt).toLocaleDateString('fr-FR');
                label.append(title, date);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'edit-action shrink-0 px-3 py-2 text-xs';
                remove.textContent = 'Supprimer';
                remove.addEventListener('click', async () => {
                    if (!confirm(`Supprimer le scan « ${record.category} » ?`)) return;
                    await deleteStoredFile(record.id);
                    status.textContent = 'Scan supprimé de cet appareil.';
                    renderCards();
                });
                details.append(label, remove);
                article.append(openLink, details);
                grid.appendChild(article);
            });
            if (!records.length && !status.textContent) status.textContent = 'Les scans ajoutés apparaîtront ici.';
        } catch (error) {
            console.warn('Card scans could not be loaded:', error);
            empty.hidden = true;
            status.textContent = 'Impossible d’accéder au stockage de cet appareil.';
        }
    }

    function amountToDzdCents(value) {
        const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
        const match = normalized.match(/^(\d+)(?:\.(\d{0,2}))?$/);
        if (!match) return null;
        const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
        return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
    }

    function formatDzd(cents) {
        return new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
    }

    function renderBudget() {
        document.getElementById('walletBalance').textContent = formatDzd(budgetState.balanceCents);
        const history = document.getElementById('walletHistory');
        const empty = document.getElementById('walletEmpty');
        history.replaceChildren();
        empty.hidden = budgetState.transactions.length > 0;

        budgetState.transactions.slice(0, 8).forEach((transaction) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 rounded-xl border border-emerald-100 bg-white/80 px-3 py-2';
            const details = document.createElement('div');
            details.className = 'min-w-0 flex-1';
            const description = document.createElement('p');
            description.className = 'truncate text-sm font-bold text-slate-700';
            description.textContent = transaction.description;
            const date = document.createElement('p');
            date.className = 'mt-0.5 text-xs text-slate-500';
            date.textContent = new Date(transaction.date).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' });
            details.append(description, date);

            const amount = document.createElement('span');
            const isExpense = transaction.type === 'expense';
            amount.className = `shrink-0 text-sm font-black ${isExpense ? 'text-rose-700' : 'text-emerald-700'}`;
            amount.textContent = `${isExpense ? '−' : '+'}${formatDzd(transaction.amountCents)}`;

            const undo = document.createElement('button');
            undo.type = 'button';
            undo.className = 'edit-action shrink-0 px-2 py-1 text-xs';
            undo.textContent = 'Annuler';
            undo.setAttribute('aria-label', `Annuler l’opération : ${transaction.description}`);
            undo.addEventListener('click', () => undoBudgetTransaction(transaction.id));
            row.append(details, amount, undo);
            history.appendChild(row);
        });
    }

    function addBudgetTransaction(type) {
        const isExpense = type === 'expense';
        showEditor(isExpense ? 'Enregistrer un achat' : 'Ajouter de l’argent', [
            { name: 'amount', label: 'Montant en dinars algériens (DZD)', type: 'number', min: 0.01, step: 0.01, required: true, placeholder: '0,00' },
            { name: 'description', label: isExpense ? 'Qu’as-tu acheté ?' : 'D’où vient cet argent ?', required: true, placeholder: isExpense ? 'Ex. déjeuner' : 'Ex. argent de poche' }
        ], (values) => {
            const amountCents = amountToDzdCents(values.amount);
            if (amountCents === null) {
                alert('Entre un montant positif avec au maximum deux chiffres après la virgule.');
                return false;
            }
            if (isExpense && amountCents > budgetState.balanceCents) {
                alert(`Solde insuffisant. Tu as ${formatDzd(budgetState.balanceCents)}.`);
                return false;
            }
            if (!isExpense && amountCents > Number.MAX_SAFE_INTEGER - budgetState.balanceCents) {
                alert('Ce montant dépasse la limite autorisée.');
                return false;
            }

            budgetState.balanceCents += isExpense ? -amountCents : amountCents;
            budgetState.transactions.unshift({
                id: `wallet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                type,
                amountCents,
                description: values.description.trim(),
                date: new Date().toISOString()
            });
            saveData();
            renderBudget();
            document.getElementById('walletStatus').textContent = isExpense ? 'Achat enregistré et déduit du solde.' : 'Argent ajouté au solde.';
        });
    }

    function undoBudgetTransaction(id) {
        const index = budgetState.transactions.findIndex((transaction) => transaction.id === id);
        if (index < 0) return;
        const transaction = budgetState.transactions[index];
        if (!confirm(`Annuler « ${transaction.description} » (${formatDzd(transaction.amountCents)}) ?`)) return;
        if (transaction.type === 'income' && transaction.amountCents > budgetState.balanceCents) {
            alert('Impossible d’annuler cet ajout : une partie de ce solde a déjà été dépensée.');
            return;
        }
        budgetState.balanceCents += transaction.type === 'expense' ? transaction.amountCents : -transaction.amountCents;
        budgetState.transactions.splice(index, 1);
        saveData();
        renderBudget();
        document.getElementById('walletStatus').textContent = 'Opération annulée.';
    }

    function addButton(parent, label, callback, className = 'edit-action') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', callback);
        parent.appendChild(button);
        return button;
    }

    function showEditor(title, fields, onSave) {
        document.getElementById('appEditorDialog')?.remove();
        const overlay = document.createElement('div');
        overlay.id = 'appEditorDialog';
        overlay.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm';
        const form = document.createElement('form');
        form.className = 'cute-card max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl';
        const heading = document.createElement('h2');
        heading.className = 'mb-4 text-xl font-black text-slate-800';
        heading.textContent = title;
        form.appendChild(heading);
        fields.forEach((field) => {
            const wrapper = document.createElement('label');
            wrapper.className = 'mb-3 block text-sm font-bold text-slate-700';
            wrapper.textContent = field.label;
            const input = field.multiline ? document.createElement('textarea') : field.type === 'select' ? document.createElement('select') : document.createElement('input');
            input.name = field.name;
            input.className = 'mt-1 w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';
            if (field.type === 'select') {
                (field.options || []).forEach((option) => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    input.appendChild(optionElement);
                });
                input.value = field.value || field.options?.[0]?.value || '';
            } else {
                input.value = field.value || '';
            }
            input.placeholder = field.placeholder || '';
            if (field.type === 'select') {
                // Native select options are populated above.
            } else if (field.multiline) {
                input.rows = field.rows || 3;
                input.style.resize = 'vertical';
            } else {
                input.type = field.type || 'text';
                if (field.min !== undefined) input.min = field.min;
                if (field.max !== undefined) input.max = field.max;
                if (field.step !== undefined) input.step = field.step;
            }
            input.required = Boolean(field.required);
            wrapper.appendChild(input);
            if (field.help) {
                const help = document.createElement('span');
                help.className = 'mt-1 block text-xs font-normal text-slate-500';
                help.textContent = field.help;
                wrapper.appendChild(help);
            }
            form.appendChild(wrapper);
        });
        const actions = document.createElement('div');
        actions.className = 'mt-5 flex justify-end gap-2';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'edit-action';
        cancel.textContent = 'Annuler';
        cancel.addEventListener('click', () => overlay.remove());
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'edit-action';
        save.textContent = 'Enregistrer';
        actions.append(cancel, save);
        form.appendChild(actions);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(form).entries());
            if (onSave(values) === false) return;
            overlay.remove();
        });
        overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
        overlay.appendChild(form);
        document.body.appendChild(overlay);
        form.querySelector('input, textarea')?.focus();
    }

    function showInstallHelp(title, steps, note) {
        document.getElementById('installHelpTitle').textContent = title;
        const list = document.getElementById('installHelpSteps');
        list.replaceChildren(...steps.map((text) => {
            const item = document.createElement('li');
            item.textContent = text;
            return item;
        }));
        document.getElementById('installHelpNote').textContent = note;
        const modal = document.getElementById('installHelpModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('installHelpDone').focus();
    }

    function closeInstallHelp() {
        const modal = document.getElementById('installHelpModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    function isAppInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    }

    function installAvailabilityNote() {
        if (location.protocol === 'https:') return 'Cette adresse HTTPS convient à l’installation. Ouvre l’app une fois en ligne pour remplir le cache; ses fonctions principales seront ensuite disponibles hors ligne. Les données restent sur cet appareil.';
        return 'Cette adresse est locale ou en HTTP. Elle fonctionne ici, mais pour que des utilisateurs puissent installer l’app sur iPhone et PC depuis n’importe où, il faudra publier le site sur une adresse HTTPS publique.';
    }

    async function handleInstallClick() {
        if (isAppInstalled()) {
            showInstallHelp('Ramy’s Space est déjà installée', ['Tu peux ouvrir l’app depuis l’écran d’accueil ou le menu des applications.'], installAvailabilityNote());
            return;
        }

        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            if (choice?.outcome === 'accepted') return;
        }

        const userAgent = navigator.userAgent || '';
        const isIos = /iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/i.test(userAgent);
        const isSafari = /Safari/i.test(userAgent) && !/Chrome|CriOS|Edg/i.test(userAgent);

        if (isIos) {
            showInstallHelp('Installer sur iPhone ou iPad', [
                'Ouvre cette adresse dans Safari. Si tu es dans Chrome, copie l’adresse puis colle-la dans Safari.',
                'Appuie sur Partager (le carré avec la flèche vers le haut).',
                'Fais défiler les actions puis choisis « Sur l’écran d’accueil ».',
                'Appuie sur Ajouter. L’icône Ramy’s Space apparaîtra sur ton écran d’accueil.'
            ], installAvailabilityNote());
            return;
        }

        if (isAndroid) {
            showInstallHelp('Installer sur Android', [
                'Ouvre la page dans Chrome.',
                'Appuie sur le menu ⋮ en haut à droite.',
                'Choisis « Installer l’application » ou « Ajouter à l’écran d’accueil », puis confirme.'
            ], installAvailabilityNote());
            return;
        }

        if (isSafari) {
            showInstallHelp('Installer sur Mac', [
                'Dans Safari, ouvre le menu Fichier.',
                'Choisis « Ajouter au Dock » pour créer une app accessible depuis le Dock.'
            ], installAvailabilityNote());
            return;
        }

        showInstallHelp('Installer sur PC', [
            'Dans Chrome ou Edge, regarde l’icône Installer à droite de la barre d’adresse et sélectionne-la.',
            'Si elle n’apparaît pas, ouvre le menu ⋮ puis choisis « Installer Ramy’s Space » ou « Applications > Installer ce site comme application ».',
            'Confirme l’installation. L’app sera accessible depuis le Bureau ou le menu Démarrer.'
        ], installAvailabilityNote());
    }

    function initializeInstallButton() {
        const button = document.getElementById('installAppButton');
        button.addEventListener('click', handleInstallClick);
        document.getElementById('closeInstallHelp').addEventListener('click', closeInstallHelp);
        document.getElementById('installHelpDone').addEventListener('click', closeInstallHelp);
        document.getElementById('installHelpModal').addEventListener('click', (event) => {
            if (event.target.id === 'installHelpModal') closeInstallHelp();
        });
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;
            button.textContent = '📲 Installer l’app';
        });
        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            button.textContent = '✓ App installée';
        });
    }

    function injectControls() {
        const style = document.createElement('style');
        style.textContent = `.edit-action{border:1px solid #bae6fd;background:#f0f9ff;color:#0369a1;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:800;cursor:pointer}.edit-action:hover{background:#e0f2fe}.edit-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.item-actions{display:flex;gap:6px}.item-actions button{border:0;background:#fff;color:#0369a1;border-radius:8px;padding:4px 7px;cursor:pointer;font-weight:700}.file-preview{max-width:100%;max-height:220px;border-radius:12px;object-fit:contain;margin-top:8px}.tracker-day{min-height:3.8rem;border:1px solid #e0f2fe;border-radius:14px;background:#fff;padding:6px 3px;color:#334155;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer}.tracker-day:hover{background:#f0f9ff}.tracker-day-selected{outline:2px solid #38bdf8;background:#e0f2fe}.tracker-day-today .tracker-day-number{color:#0369a1;font-weight:900}.tracker-day-finalized .tracker-day-score{color:#0284c7}.tracker-day-score{font-size:10px;font-weight:800;color:#64748b}.tracker-day:disabled{opacity:.35;cursor:not-allowed}`;
        document.head.appendChild(style);

        const settings = document.createElement('button');
        settings.type = 'button';
        settings.className = 'edit-action';
        settings.textContent = '⚙️ Personnaliser';
        settings.addEventListener('click', () => {
            const goalEl = document.querySelector('main section .text-lg.font-black.text-sky-700');
            const welcomeEl = document.querySelector('main section p.text-xs.font-bold.uppercase.tracking-\\[0\\.2em\\].text-sky-600');
            const headlineEl = document.querySelector('main section h2');
            const subjectsTitleEl = document.querySelector('#hub h3');
            showEditor('Personnaliser mon espace', [
                { name: 'title', label: 'Nom de l’application', value: document.querySelector('header h1').textContent, required: true },
                { name: 'welcome', label: 'Petit message', value: welcomeEl.textContent },
                { name: 'headline', label: 'Phrase principale', value: headlineEl.textContent, multiline: true, required: true },
                { name: 'goal', label: 'Mon objectif', value: goalEl.textContent, required: true },
                { name: 'subjectsTitle', label: 'Titre des matières', value: subjectsTitleEl.textContent, required: true }
            ], (values) => {
                document.querySelector('header h1').textContent = values.title.trim() || 'Mon espace';
                goalEl.textContent = values.goal.trim() || 'Mon objectif';
                welcomeEl.textContent = values.welcome.trim();
                headlineEl.textContent = values.headline.trim();
                subjectsTitleEl.textContent = values.subjectsTitle.trim();
                saveData();
            });
        });
        document.querySelector('header .flex.items-center.gap-2\\.5')?.appendChild(settings);

        const hubHeading = document.querySelector('#hub > div');
        if (hubHeading) {
            const actions = document.createElement('div');
            actions.className = 'edit-actions';
            addButton(actions, '+ Ajouter une matière', addSubject);
            hubHeading.appendChild(actions);
        }

        const schedulePanel = document.querySelector('#calendar .grid > div:first-child .cute-card');
        if (schedulePanel) {
            const actions = document.createElement('div');
            actions.className = 'edit-actions';
            addButton(actions, '+ Ajouter un cours / événement', addScheduleItem);
            addButton(actions, '📋 Copier cette journée…', copyScheduleDay);
            schedulePanel.appendChild(actions);
        }
        const todoPanel = document.querySelector('#calendar .grid > div:last-child .cute-card');
        if (todoPanel) {
            const actions = document.createElement('div');
            actions.className = 'edit-actions';
            addButton(actions, '+ Ajouter une tâche', addTodo);
            todoPanel.appendChild(actions);
        }

        const modalBody = document.querySelector('#subjectModal .max-h-\\[70vh\\]');
        if (modalBody) {
            const controls = document.createElement('div');
            controls.className = 'edit-actions';
            addButton(controls, '✏️ Modifier cette matière', editSubject);
            addButton(controls, '🗑️ Supprimer cette matière', removeSubject);
            addButton(controls, '＋ Ajouter mon lien', addSubjectLink);
            const upload = document.createElement('label');
            upload.className = 'edit-action';
            upload.textContent = '＋ Ajouter PDF / photo';
            upload.style.display = 'inline-block';
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
            input.multiple = true;
            input.hidden = true;
            input.addEventListener('change', async () => {
                const subject = subjects.find((item) => item.id === window.activeSubjectId);
                if (!subject) return;
                subject.files ||= [];
                for (const file of input.files) {
                    const extension = file.name.split('.').pop().toLowerCase();
                    const supportedExtension = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(extension);
                    if (!fileTypes.includes(file.type.toLowerCase()) && !supportedExtension) { alert(`Format non pris en charge : ${file.name}`); continue; }
                    if (file.size > 20 * 1024 * 1024) { alert(`${file.name} dépasse 20 Mo.`); continue; }
                    try { subject.files.push(await storeFile(file)); }
                    catch (error) { alert('Le fichier n’a pas pu être sauvegardé dans le navigateur.'); }
                }
                saveData();
                renderSubjectFiles(subject);
                input.value = '';
            });
            upload.appendChild(input);
            controls.appendChild(upload);
            modalBody.prepend(controls);
        }
    }

    function renderSubjectsEditable() {
        const grid = document.getElementById('subjectsGrid');
        grid.innerHTML = '';
        subjects.forEach((subject) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cute-card border-l-4 border-pink-200 bg-slate-50 p-4 text-left transition hover:-translate-y-1 hover:shadow-cute';
            card.innerHTML = `<div class="mb-3 flex items-start justify-between gap-2"><span class="text-2xl">${escapeHtml(subject.emoji || '📘')}</span><span class="rounded-full bg-white px-2 py-1 text-[10px] font-bold">${escapeHtml(subject.code || '')}</span></div><h4 class="text-xl font-black text-slate-800">${escapeHtml(subject.name)}</h4><p class="mt-2 text-sm text-slate-600">${escapeHtml(subject.description || '')}</p><p class="mt-3 text-xs font-bold text-pink-600">Ouvrir et modifier →</p>`;
            card.addEventListener('click', () => openModal(subject.id));
            grid.appendChild(card);
        });
        const count = document.querySelector('#hub > div p');
        if (count) count.textContent = `${subjects.length} matière${subjects.length > 1 ? 's' : ''}`;
        const subjectsTab = document.querySelector('.tab-btn[data-tab="hub"]');
        if (subjectsTab) subjectsTab.textContent = `📚 Mes ${subjects.length} Matières`;
    }

    function openModalEditable(id) {
        window.activeSubjectId = id;
        const subject = subjects.find((item) => item.id === id);
        if (!subject) return;
        document.getElementById('modalEmoji').textContent = subject.emoji || '📘';
        document.getElementById('modalCode').textContent = subject.code || '';
        document.getElementById('modalTitle').textContent = subject.name;
        document.getElementById('modalDescription').textContent = subject.description || '';
        document.getElementById('modalTodos').innerHTML = (subject.todos || []).map((todo) => `<li class="rounded-xl border border-pink-100 bg-pink-50/60 p-2 text-sm">${escapeHtml(todo)}</li>`).join('') || '<li class="text-sm text-slate-500">Ajoute tes notes et ressources à cette matière.</li>';
        document.getElementById('modalDocs').innerHTML = (subject.docs || []).map((doc) => `<div class="rounded-2xl border border-slate-200 bg-slate-50 p-3"><p class="text-[10px] font-bold uppercase text-slate-500">${escapeHtml(doc.type)}</p><p class="mt-1 text-sm font-bold text-slate-800">${escapeHtml(doc.title)}</p></div>`).join('');
        renderSubjectLinks(subject);
        renderSubjectFiles(subject);
        document.getElementById('subjectModal').classList.remove('hidden');
        document.getElementById('subjectModal').classList.add('flex');
    }

    function renderSubjectLinks(subject) {
        const container = document.getElementById('modalLinks');
        container.innerHTML = '';
        if (!(subject.links || []).length) {
            container.innerHTML = '<p class="text-sm text-slate-500">Ajoute ici les liens utiles à cette matière.</p>';
            return;
        }
        subject.links.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2';
            const link = document.createElement('a');
            link.href = safeUrl(item.url);
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'min-w-0 flex-1 break-all text-sm font-bold text-cyan-700 hover:underline';
            link.textContent = `🔗 ${item.label}`;
            const actions = document.createElement('span');
            actions.className = 'item-actions';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = '✏️';
            edit.setAttribute('aria-label', 'Modifier le lien');
            edit.addEventListener('click', () => addSubjectLink(index));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '✕';
            remove.setAttribute('aria-label', 'Supprimer le lien');
            remove.addEventListener('click', () => {
                subject.links.splice(index, 1);
                saveData();
                renderSubjectLinks(subject);
            });
            actions.append(edit, remove);
            row.append(link, actions);
            container.appendChild(row);
        });
    }

    function addSubjectLink(existingIndex = -1) {
        const subject = subjects.find((item) => item.id === window.activeSubjectId);
        if (!subject) return;
        const current = existingIndex >= 0 ? subject.links[existingIndex] : {};
        showEditor(existingIndex >= 0 ? 'Modifier le lien' : 'Ajouter un lien à cette matière', [
            { name: 'label', label: 'Nom du lien', value: current.label || '', required: true, placeholder: 'Ex. Cours en ligne' },
            { name: 'url', label: 'Adresse du site', value: current.url || '', type: 'url', required: true, placeholder: 'https://…' }
        ], (values) => {
            const url = values.url.trim();
            if (!/^https?:\/\//i.test(url)) {
                alert('Entre une adresse qui commence par http:// ou https://');
                return false;
            }
            const item = { label: values.label.trim(), url };
            subject.links ||= [];
            if (existingIndex >= 0) subject.links[existingIndex] = item; else subject.links.push(item);
            saveData();
            renderSubjectLinks(subject);
        });
    }

    async function renderSubjectFiles(subject) {
        const docs = document.getElementById('modalDocs');
        docs.querySelectorAll('[data-uploaded-file]').forEach((item) => item.remove());
        for (const file of subject.files || []) {
            const block = document.createElement('div');
            block.dataset.uploadedFile = file.id;
            block.className = 'rounded-2xl border border-pink-200 bg-white p-3';
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'text-sm font-bold text-pink-700';
            link.textContent = `📎 ${file.name}`;
            link.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    const stored = await getStoredFile(file.id);
                    if (!stored) throw new Error('Fichier absent');
                    const url = URL.createObjectURL(stored.blob);
                    window.location.assign(url);
                } catch (error) { alert('Fichier introuvable sur cet appareil. Ajoute-le à nouveau.'); }
            });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'ml-2 text-xs font-bold text-rose-600';
            remove.textContent = 'Supprimer';
            remove.addEventListener('click', async () => {
                await deleteStoredFile(file.id);
                subject.files = subject.files.filter((item) => item.id !== file.id);
                saveData();
                renderSubjectFiles(subject);
            });
            block.append(link, remove);
            if (file.type.startsWith('image/')) {
                try {
                    const stored = await getStoredFile(file.id);
                    if (stored) {
                        const image = document.createElement('img');
                        image.className = 'file-preview';
                        image.alt = file.name;
                        image.src = URL.createObjectURL(stored.blob);
                        block.appendChild(image);
                    }
                } catch (error) { console.warn('Image preview unavailable:', error); }
            }
            docs.appendChild(block);
        }
    }

    function editSubject() {
        const subject = subjects.find((item) => item.id === window.activeSubjectId);
        if (!subject) return;
        showEditor('Modifier la matière', [
            { name: 'name', label: 'Nom de la matière', value: subject.name, required: true },
            { name: 'code', label: 'Code (facultatif)', value: subject.code || '' },
            { name: 'emoji', label: 'Emoji', value: subject.emoji || '📘' },
            { name: 'description', label: 'Description', value: subject.description || '', multiline: true },
            { name: 'todos', label: 'Notes / tâches (une par ligne)', value: (subject.todos || []).join('\n'), multiline: true },
            { name: 'links', label: 'Liens (nom|URL, un par ligne)', value: (subject.links || []).map((link) => `${link.label}|${link.url}`).join('\n'), multiline: true, help: 'Exemple : Mon cours|https://exemple.com' }
        ], (values) => {
            subject.name = values.name.trim() || 'Nouvelle matière';
            subject.code = values.code.trim();
            subject.emoji = values.emoji.trim() || '📘';
            subject.description = values.description.trim();
            subject.todos = values.todos.split('\n').map((item) => item.trim()).filter(Boolean);
            subject.links = values.links.split('\n').map((line) => line.split('|')).filter((parts) => parts.length >= 2 && parts[0].trim() && safeUrl(parts.slice(1).join('|').trim()) !== '#').map((parts) => ({ label: parts[0].trim(), url: parts.slice(1).join('|').trim() }));
            saveData();
            renderSubjectsEditable();
            openModalEditable(subject.id);
        });
    }

    function addSubject() {
        showEditor('Ajouter une matière', [
            { name: 'name', label: 'Nom de la matière', required: true, placeholder: 'Ex. Biologie' },
            { name: 'code', label: 'Code (facultatif)' }
        ], (values) => {
            if (!values.name.trim()) return;
            const subject = { id: `subject-${Date.now()}`, name: values.name.trim(), code: values.code.trim(), emoji: '📘', theme: 'pink', description: '', todos: [], docs: [], links: [], files: [] };
            subjects.push(subject);
            saveData();
            renderSubjectsEditable();
            openModalEditable(subject.id);
        });
    }

    function removeSubject() {
        const index = subjects.findIndex((item) => item.id === window.activeSubjectId);
        if (index < 0 || !confirm(`Supprimer « ${subjects[index].name} » ?`)) return;
        (subjects[index].files || []).forEach((file) => deleteStoredFile(file.id).catch(() => { }));
        subjects.splice(index, 1);
        saveData();
        renderSubjectsEditable();
        closeModal();
    }

    function renderScheduleEditable() {
        const list = document.getElementById('scheduleList');
        document.getElementById('scheduleDay').textContent = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);
        const items = schedule[currentDay] || [];
        list.innerHTML = items.length ? items.map((item, index) => `<div class="rounded-2xl border border-sky-100 bg-sky-50/50 p-3"><div class="flex items-start justify-between gap-2"><div><p class="text-xs font-bold uppercase text-sky-600">${escapeHtml(item.type)}</p><h4 class="mt-1 text-lg font-black text-slate-800">${escapeHtml(item.title)}</h4><p class="mt-1 text-xs text-slate-500">${escapeHtml(item.room)}</p></div><div class="item-actions"><button data-edit-event="${index}" aria-label="Modifier">✏️</button><button data-delete-event="${index}" aria-label="Supprimer">✕</button></div></div><p class="mt-3 font-mono text-sm font-bold text-slate-700">${escapeHtml(item.time)}</p></div>`).join('') : '<p class="text-sm text-slate-500">Aucun événement. Ajoute tes cours, rendez-vous ou révisions avec le bouton ci-dessous.</p>';
        list.querySelectorAll('[data-edit-event]').forEach((button) => button.addEventListener('click', () => addScheduleItem(Number(button.dataset.editEvent))));
        list.querySelectorAll('[data-delete-event]').forEach((button) => button.addEventListener('click', () => {
            schedule[currentDay].splice(Number(button.dataset.deleteEvent), 1);
            saveData(); renderScheduleEditable();
        }));
    }

    function addScheduleItem(existingIndex = -1) {
        const items = schedule[currentDay] ||= [];
        const old = existingIndex >= 0 ? items[existingIndex] : {};
        showEditor(existingIndex >= 0 ? 'Modifier l’événement' : 'Ajouter un événement', [
            { name: 'title', label: 'Cours / événement', value: old.title || '', required: true },
            { name: 'time', label: 'Horaire', value: old.time || '', placeholder: '09:00 - 10:30', required: true },
            { name: 'type', label: 'Type', value: old.type || 'Cours', placeholder: 'Cours, TD, rendez-vous…' },
            { name: 'room', label: 'Salle / lieu (facultatif)', value: old.room || '' }
        ], (values) => {
            const event = { title: values.title.trim(), time: values.time.trim(), type: values.type.trim(), room: values.room.trim() };
            if (existingIndex >= 0) items[existingIndex] = event; else items.push(event);
            saveData(); renderScheduleEditable();
        });
    }

    function copyScheduleDay() {
        const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        const targetOptions = days.filter((day) => day !== currentDay).map((day) => ({ value: day, label: day.charAt(0).toUpperCase() + day.slice(1) }));
        showEditor(`Copier ${currentDay} dans…`, [
            { name: 'targetDay', label: 'Journée de destination', type: 'select', options: targetOptions, required: true },
            {
                name: 'copyMode', label: 'Que faire du planning existant ?', type: 'select', options: [
                    { value: 'replace', label: 'Remplacer le planning de destination' },
                    { value: 'append', label: 'Ajouter à la suite du planning existant' }
                ], required: true
            }
        ], (values) => {
            const copiedItems = (schedule[currentDay] || []).map((item) => ({ ...item }));
            schedule[values.targetDay] ||= [];
            schedule[values.targetDay] = values.copyMode === 'append'
                ? [...schedule[values.targetDay], ...copiedItems]
                : copiedItems;
            saveData();
            renderScheduleEditable();
        });
    }

    function renderTodosEditable() {
        const list = document.getElementById('todoList');
        document.getElementById('todoDay').textContent = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);
        const items = todos[currentDay] || [];
        const completed = items.filter((task) => task.done).length;
        document.getElementById('todoProgressCount').textContent = `${completed} / ${items.length}`;
        const progressBar = document.getElementById('todoProgressBar');
        progressBar.setAttribute('aria-valuemax', String(Math.max(items.length, 1)));
        progressBar.setAttribute('aria-valuenow', String(completed));
        progressBar.setAttribute('aria-valuetext', `${completed} tâche${completed === 1 ? '' : 's'} terminée${completed === 1 ? '' : 's'} sur ${items.length}`);
        document.getElementById('todoProgress').style.width = items.length ? `${Math.round((completed / items.length) * 100)}%` : '0%';
        list.innerHTML = items.length ? items.map((task, index) => `
            <div class="flex items-center gap-3 rounded-2xl border border-rose-100 bg-gradient-to-r from-white to-rose-50/70 p-3 shadow-sm transition hover:border-rose-200">
                <input type="checkbox" data-todo-check="${index}" aria-label="Terminer : ${escapeHtml(task.text)}" ${task.done ? 'checked' : ''} class="h-5 w-5 shrink-0 cursor-pointer accent-rose-500">
                <span class="min-w-0 flex-1 break-words text-sm leading-5 ${task.done ? 'text-slate-400 line-through' : 'text-slate-700'}">${escapeHtml(task.text)}</span>
                <span class="item-actions shrink-0"><button type="button" data-edit-todo="${index}" aria-label="Modifier la tâche" title="Modifier">✏️</button><button type="button" data-delete-todo="${index}" aria-label="Supprimer la tâche" title="Supprimer">✕</button></span>
            </div>`).join('') : '<div class="rounded-2xl border border-dashed border-rose-200 bg-white/80 px-4 py-6 text-center"><span class="text-2xl text-rose-300">🌷</span><p class="mt-2 text-sm font-semibold text-slate-500">Aucune tâche prévue pour cette journée.</p></div>';
        list.querySelectorAll('[data-todo-check]').forEach((input) => input.addEventListener('change', () => {
            todos[currentDay][Number(input.dataset.todoCheck)].done = input.checked;
            saveData(); renderTodosEditable();
        }));
        list.querySelectorAll('[data-edit-todo]').forEach((button) => button.addEventListener('click', (event) => {
            event.preventDefault(); event.stopPropagation();
            const index = Number(button.dataset.editTodo);
            showEditor('Modifier la tâche', [{ name: 'text', label: 'Texte de la tâche', value: todos[currentDay][index].text, required: true }], (values) => {
                if (!values.text.trim()) return;
                todos[currentDay][index].text = values.text.trim(); saveData(); renderTodosEditable();
            });
        }));
        list.querySelectorAll('[data-delete-todo]').forEach((button) => button.addEventListener('click', (event) => {
            event.preventDefault(); event.stopPropagation();
            todos[currentDay].splice(Number(button.dataset.deleteTodo), 1); saveData(); renderTodosEditable();
        }));
    }

    function addTodo() {
        showEditor(`Ajouter une tâche · ${currentDay}`, [{ name: 'text', label: 'Que veux-tu faire ?', required: true }], (values) => {
            if (!values.text.trim()) return;
            (todos[currentDay] ||= []).push({ text: values.text.trim(), done: false });
            saveData(); renderTodosEditable();
        });
    }

    function trackerScore(record = {}) {
        return Number(Boolean(record.noMasturbation)) + Number(Boolean(record.noPorn));
    }

    function closeElapsedTrackerDays() {
        const now = new Date();
        const today = dateKey(now);
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        let changed = false;
        for (let date = firstOfMonth; date <= yesterday; date.setDate(date.getDate() + 1)) {
            const key = dateKey(date);
            const record = dailyTracker[key] ||= { noMasturbation: false, noPorn: false };
            if (!record.finalized) {
                record.finalized = true;
                changed = true;
            }
        }
        if (trackerObservedDate !== today) {
            if (selectedTrackerDate === trackerObservedDate) {
                selectedTrackerDate = today;
                trackerViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            trackerObservedDate = today;
        }
        if (changed) saveData();
    }

    function renderTrackerCalendar() {
        const calendar = document.getElementById('trackerCalendar');
        const weekdays = document.getElementById('trackerWeekdays');
        const year = trackerViewDate.getFullYear();
        const month = trackerViewDate.getMonth();
        const todayKey = dateKey(new Date());
        const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
        const totalDays = new Date(year, month + 1, 0).getDate();
        document.getElementById('trackerMonthLabel').textContent = trackerViewDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        weekdays.innerHTML = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => `<div class="py-2">${day}</div>`).join('');
        calendar.innerHTML = '';

        for (let blank = 0; blank < firstOffset; blank += 1) {
            const spacer = document.createElement('div');
            spacer.setAttribute('aria-hidden', 'true');
            calendar.appendChild(spacer);
        }

        for (let day = 1; day <= totalDays; day += 1) {
            const key = dateKey(new Date(year, month, day));
            const record = dailyTracker[key];
            const score = trackerScore(record);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `tracker-day${key === selectedTrackerDate ? ' tracker-day-selected' : ''}${key === todayKey ? ' tracker-day-today' : ''}${record?.finalized ? ' tracker-day-finalized' : ''}`;
            button.disabled = key > todayKey;
            button.setAttribute('aria-label', `${day}, ${score} sur 2 objectifs${record?.finalized ? ', journée clôturée' : ''}`);
            button.innerHTML = `<span class="tracker-day-number">${day}</span><span class="tracker-day-score">${score}/2</span>`;
            button.addEventListener('click', () => {
                selectedTrackerDate = key;
                renderTracker();
            });
            calendar.appendChild(button);
        }
        const next = document.getElementById('trackerNextMonth');
        const currentMonth = new Date();
        next.disabled = year > currentMonth.getFullYear() || (year === currentMonth.getFullYear() && month >= currentMonth.getMonth());
        next.style.opacity = next.disabled ? '0.45' : '1';
    }

    function renderTrackerSelectedDay() {
        const [year, month, day] = selectedTrackerDate.split('-').map(Number);
        const record = dailyTracker[selectedTrackerDate] || {};
        const isFuture = selectedTrackerDate > dateKey(new Date());
        document.getElementById('trackerSelectedDate').textContent = new Date(year, month - 1, day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('trackerSelectedScore').textContent = `${trackerScore(record)} / 2 points`;
        const dayStatus = document.getElementById('trackerDayStatus');
        if (dayStatus) {
            dayStatus.textContent = record.finalized
                ? 'Journée clôturée automatiquement · score calculé à partir de tes coches (modifiable).'
                : isFuture ? 'Cette journée n’a pas encore commencé.' : 'Journée en cours · le score se met à jour à chaque coche.';
        }
        const noMasturbation = document.getElementById('trackerNoMasturbation');
        const noPorn = document.getElementById('trackerNoPorn');
        document.getElementById('trackerGoalOneLabel').textContent = trackerGoals.noMasturbation;
        document.getElementById('trackerGoalTwoLabel').textContent = trackerGoals.noPorn;
        noMasturbation.setAttribute('aria-label', trackerGoals.noMasturbation);
        noPorn.setAttribute('aria-label', trackerGoals.noPorn);
        noMasturbation.checked = Boolean(record.noMasturbation);
        noPorn.checked = Boolean(record.noPorn);
        noMasturbation.disabled = isFuture;
        noPorn.disabled = isFuture;
    }

    function editTrackerGoals() {
        showEditor('Personnaliser mes objectifs quotidiens', [
            { name: 'noMasturbation', label: 'Objectif 1', value: trackerGoals.noMasturbation, required: true },
            { name: 'noPorn', label: 'Objectif 2', value: trackerGoals.noPorn, required: true }
        ], (values) => {
            trackerGoals.noMasturbation = values.noMasturbation.trim();
            trackerGoals.noPorn = values.noPorn.trim();
            saveData();
            renderTracker();
        });
    }

    function renderTrackerStats() {
        const year = trackerViewDate.getFullYear();
        const month = trackerViewDate.getMonth();
        const now = new Date();
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
        const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
        const daysToCount = isPastMonth ? new Date(year, month + 1, 0).getDate() : isCurrentMonth ? now.getDate() : 0;
        let monthPoints = 0;
        let fullDays = 0;
        for (let day = 1; day <= daysToCount; day += 1) {
            const score = trackerScore(dailyTracker[dateKey(new Date(year, month, day))]);
            monthPoints += score;
            if (score === 2) fullDays += 1;
        }
        document.getElementById('trackerMonthScore').textContent = `${monthPoints} / ${daysToCount * 2}`;
        document.getElementById('trackerFullDays').textContent = fullDays;

        let streak = 0;
        const cursor = new Date();
        const todayRecord = dailyTracker[dateKey(cursor)];
        if (trackerScore(todayRecord) !== 2) cursor.setDate(cursor.getDate() - 1);
        for (let i = 0; i < 3660 && trackerScore(dailyTracker[dateKey(cursor)]) === 2; i += 1) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }
        document.getElementById('trackerStreak').textContent = `${streak} ${streak === 1 ? 'jour' : 'jours'}`;
        const headerCount = document.getElementById('headerStreak');
        if (headerCount) headerCount.textContent = streak;
    }

    function renderTracker() {
        closeElapsedTrackerDays();
        renderTrackerCalendar();
        renderTrackerSelectedDay();
        renderTrackerStats();
    }

    function saveTrackerCheck(event) {
        const record = dailyTracker[selectedTrackerDate] ||= { noMasturbation: false, noPorn: false };
        if (event.target.id === 'trackerNoMasturbation') record.noMasturbation = event.target.checked;
        if (event.target.id === 'trackerNoPorn') record.noPorn = event.target.checked;
        saveData();
        renderTracker();
    }

    function setTrackerMonth(monthDelta) {
        trackerViewDate = new Date(trackerViewDate.getFullYear(), trackerViewDate.getMonth() + monthDelta, 1);
        const lastDay = new Date(trackerViewDate.getFullYear(), trackerViewDate.getMonth() + 1, 0).getDate();
        const selectedDay = Math.min(Number(selectedTrackerDate.split('-')[2]), lastDay);
        selectedTrackerDate = dateKey(new Date(trackerViewDate.getFullYear(), trackerViewDate.getMonth(), selectedDay));
        renderTracker();
    }

    function durationForPomodoroStage(stage = pomodoroState.stage) {
        if (stage === 'shortBreak') return pomodoroState.shortBreakMinutes * 60;
        if (stage === 'longBreak') return pomodoroState.longBreakMinutes * 60;
        return pomodoroState.workMinutes * 60;
    }

    let pomodoroAudioContext = null;

    function ensurePomodoroAudio() {
        if (!('AudioContext' in window || 'webkitAudioContext' in window)) return null;
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!pomodoroAudioContext) pomodoroAudioContext = new AudioCtor();
        if (pomodoroAudioContext.state === 'suspended') pomodoroAudioContext.resume();
        return pomodoroAudioContext;
    }

    function playPomodoroTone() {
        const ctx = ensurePomodoroAudio();
        if (!ctx) return;
        [880, 660, 880, 660, 880].forEach((frequency, index) => {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            const startAt = ctx.currentTime + index * 0.32;
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.value = 0.0001;
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24);
            oscillator.start(startAt);
            oscillator.stop(startAt + 0.26);
        });
    }

    function updateMediaSession() {
        if (!('mediaSession' in navigator)) return;
        const title = pomodoroState.stage === 'focus' ? 'Session de focus' : 'Pause Pomodoro';
        const artist = pomodoroState.mission || 'Ramy Space';
        if ('MediaMetadata' in window) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title,
                artist,
                album: 'Ramy Space',
                artwork: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
            });
        }
        navigator.mediaSession.setActionHandler('play', startPomodoro);
        navigator.mediaSession.setActionHandler('pause', pausePomodoro);
        navigator.mediaSession.setActionHandler('stop', pausePomodoro);
        navigator.mediaSession.playbackState = pomodoroState.isRunning ? 'playing' : 'paused';
    }

    function requestPomodoroNotifications() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'default') Notification.requestPermission().catch(() => { });
        return Notification.permission === 'granted';
    }

    function triggerPomodoroAlert(message) {
        playPomodoroTone();
        let toast = document.getElementById('pomodoroAlert');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pomodoroAlert';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'assertive');
            toast.style.cssText = 'position:fixed;top:max(1rem,env(safe-area-inset-top));left:50%;transform:translate(-50%,-8px);opacity:0;z-index:10000;width:min(90vw,32rem);padding:14px 18px;border-radius:14px;background:#173f63;color:#fff;box-shadow:0 12px 32px rgba(23,63,99,.28);font:700 15px/1.45 sans-serif;text-align:center;pointer-events:none;transition:opacity .2s ease,transform .2s ease;';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%,0)';
        clearTimeout(toast.hideTimeout);
        toast.hideTimeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%,-8px)';
        }, 7000);

        if ('Notification' in window && Notification.permission === 'granted') {
            const options = { body: message, icon: 'icon-192.png', tag: 'ramy-space-pomodoro', renotify: true };
            if (window.isSecureContext && 'serviceWorker' in navigator) {
                navigator.serviceWorker.ready
                    .then((registration) => registration.showNotification('Ramy Space', options))
                    .catch(() => { });
            } else if (window.isSecureContext) {
                try {
                    new Notification('Ramy Space', options);
                } catch (error) {
                    console.warn('Pomodoro notification could not be shown:', error);
                }
            }
        }
        updateMediaSession();
    }

    const spotifyTracks = [
        { title: 'Calm Wave', artist: 'Musique générée par l’app', emoji: '🌤️', root: 220, scale: [0, 3, 7, 10, 7, 3, 2, 5] },
        { title: 'Blue Notes', artist: 'Musique générée par l’app', emoji: '🎶', root: 196, scale: [0, 2, 5, 9, 7, 5, 2, 4] },
        { title: 'Cloud Study', artist: 'Musique générée par l’app', emoji: '☁️', root: 261.63, scale: [0, 4, 7, 11, 9, 7, 4, 2] },
        { title: 'Night Flow', artist: 'Musique générée par l’app', emoji: '🌙', root: 174.61, scale: [0, 3, 7, 10, 12, 10, 7, 5] }
    ];
    const spotifyState = { currentIndex: 0, isPlaying: false };
    const musicStatus = document.getElementById('musicStatus');
    let musicMasterGain = null;
    let musicScheduler = null;
    let musicStep = 0;
    let musicNextBeatAt = 0;

    function scheduleMusicNote(context, frequency, startAt, duration, volume) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startAt);
        envelope.gain.setValueAtTime(0.0001, startAt);
        envelope.gain.exponentialRampToValueAtTime(volume, startAt + 0.08);
        envelope.gain.setValueAtTime(volume * 0.7, startAt + duration * 0.65);
        envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(envelope);
        envelope.connect(musicMasterGain);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.03);
    }

    function scheduleMusicLoop() {
        const context = ensurePomodoroAudio();
        if (!context || !musicMasterGain) return;
        const track = spotifyTracks[spotifyState.currentIndex];
        const beatLength = 0.85;
        while (musicNextBeatAt < context.currentTime + 1.2) {
            const step = musicStep % track.scale.length;
            const beatAt = musicNextBeatAt;
            const melodyNote = track.root * 2 ** ((12 + track.scale[step]) / 12);
            scheduleMusicNote(context, melodyNote, beatAt, 0.72, 0.1);
            if (step % 4 === 0) {
                const chordRoot = track.root * 2 ** ([0, 5, 3, 7][Math.floor(step / 4)] / 12);
                scheduleMusicNote(context, chordRoot / 2, beatAt, 3.25, 0.045);
                [1, 1.25, 1.5].forEach((ratio, index) => {
                    scheduleMusicNote(context, chordRoot * ratio, beatAt, 3.1, index === 0 ? 0.02 : 0.015);
                });
            }
            musicNextBeatAt += beatLength;
            musicStep += 1;
        }
    }

    function stopMusicLoop() {
        clearInterval(musicScheduler);
        musicScheduler = null;
        spotifyState.isPlaying = false;
        if (musicMasterGain && pomodoroAudioContext) {
            musicMasterGain.gain.cancelScheduledValues(pomodoroAudioContext.currentTime);
            musicMasterGain.gain.setTargetAtTime(0.0001, pomodoroAudioContext.currentTime, 0.08);
        }
    }

    function playSelectedTrack() {
        const context = ensurePomodoroAudio();
        if (!context) {
            if (musicStatus) musicStatus.textContent = 'La lecture audio n’est pas prise en charge par ce navigateur.';
            return;
        }
        if (!musicMasterGain) {
            musicMasterGain = context.createGain();
            musicMasterGain.gain.value = 0.0001;
            musicMasterGain.connect(context.destination);
        }
        context.resume().then(() => {
            if (!spotifyState.isPlaying) return;
            musicMasterGain.gain.cancelScheduledValues(context.currentTime);
            musicMasterGain.gain.setTargetAtTime(0.8, context.currentTime, 0.12);
            musicStep = 0;
            musicNextBeatAt = context.currentTime + 0.1;
            clearInterval(musicScheduler);
            scheduleMusicLoop();
            musicScheduler = setInterval(scheduleMusicLoop, 200);
            if (musicStatus) musicStatus.textContent = 'Lecture en cours · ambiance instrumentale générée par l’app.';
            renderSpotifyPlayer();
        }).catch(() => {
            spotifyState.isPlaying = false;
            if (musicStatus) musicStatus.textContent = 'Impossible de démarrer le son. Vérifie le volume de ton appareil.';
            renderSpotifyPlayer();
        });
    }

    function renderSpotifyPlayer() {
        const track = spotifyTracks[spotifyState.currentIndex] || spotifyTracks[0];
        const titleEl = document.getElementById('spotifyTitle');
        const artistEl = document.getElementById('spotifyArtist');
        const albumEl = document.querySelector('.spotify-album');
        const toggleBtn = document.getElementById('toggleTrack');
        if (titleEl) titleEl.textContent = track.title;
        if (artistEl) artistEl.textContent = track.artist;
        if (albumEl) albumEl.textContent = track.emoji;
        if (toggleBtn) {
            toggleBtn.textContent = spotifyState.isPlaying ? '❚❚' : '▶';
            toggleBtn.setAttribute('aria-label', spotifyState.isPlaying ? 'Pause' : 'Lecture');
        }
        document.querySelectorAll('.song-chip').forEach((chip, index) => {
            chip.classList.toggle('active', index === spotifyState.currentIndex);
        });
    }

    function setSpotifyTrack(index) {
        const shouldResume = spotifyState.isPlaying;
        if (shouldResume) stopMusicLoop();
        spotifyState.currentIndex = (index + spotifyTracks.length) % spotifyTracks.length;
        if (musicStatus) musicStatus.textContent = 'Ambiance sélectionnée · appuie sur lecture pour écouter.';
        renderSpotifyPlayer();
        if (shouldResume) playSelectedTrack();
    }

    function toggleSpotifyPlayback() {
        if (spotifyState.isPlaying) {
            stopMusicLoop();
            if (musicStatus) musicStatus.textContent = 'Musique en pause.';
            renderSpotifyPlayer();
            return;
        }
        spotifyState.isPlaying = true;
        playSelectedTrack();
    }

    function renderPomodoro() {
        const stageNames = { focus: 'Travail concentré', shortBreak: 'Petite pause', longBreak: 'Pause longue' };
        const totalDuration = durationForPomodoroStage();
        const remaining = Math.max(0, pomodoroState.remainingSeconds);
        const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
        const seconds = (remaining % 60).toString().padStart(2, '0');
        document.getElementById('pomodoroStage').textContent = stageNames[pomodoroState.stage] || stageNames.focus;
        document.getElementById('pomodoroClock').textContent = `${minutes}:${seconds}`;
        const progressValue = Math.min(100, Math.max(0, (1 - remaining / totalDuration) * 100));
        document.getElementById('pomodoroProgress').style.width = `${progressValue}%`;
        const ring = document.getElementById('pomodoroRing');
        if (ring) ring.style.setProperty('--progress', String(progressValue));
        document.getElementById('pomodoroToday').textContent = pomodoroState.completedToday;
        document.getElementById('pomodoroTotal').textContent = pomodoroState.totalSessions;
        const cycleProgress = pomodoroState.completedToday % pomodoroState.cycleLength || (pomodoroState.completedToday ? pomodoroState.cycleLength : 0);
        document.getElementById('pomodoroCycle').textContent = `Cycle ${cycleProgress} / ${pomodoroState.cycleLength} · ${pomodoroState.workMinutes} min travail`;
        document.getElementById('pomodoroSkip').disabled = pomodoroState.stage === 'focus';
        document.getElementById('pomodoroSkip').style.opacity = pomodoroState.stage === 'focus' ? '0.5' : '1';
        const missionInput = document.getElementById('pomodoroMission');
        if (missionInput && document.activeElement !== missionInput) missionInput.value = pomodoroState.mission || '';
        updateMediaSession();
    }

    function startPomodoro() {
        if (pomodoroState.isRunning) return;
        if (!pomodoroState.remainingSeconds) pomodoroState.remainingSeconds = durationForPomodoroStage();
        requestPomodoroNotifications();
        ensurePomodoroAudio();
        pomodoroState.isRunning = true;
        pomodoroState.endsAt = Date.now() + pomodoroState.remainingSeconds * 1000;
        document.getElementById('pomodoroMessage').textContent = pomodoroState.stage === 'focus' ? 'Tu es en session. Une chose à la fois.' : 'Profite de ta pause, éloigne-toi de l’écran.';
        saveData();
        renderPomodoro();
    }

    function pausePomodoro() {
        if (!pomodoroState.isRunning) return;
        pomodoroState.remainingSeconds = Math.max(0, Math.ceil((pomodoroState.endsAt - Date.now()) / 1000));
        pomodoroState.isRunning = false;
        pomodoroState.endsAt = null;
        document.getElementById('pomodoroMessage').textContent = 'Minuteur en pause. Reprends quand tu es prêt.';
        saveData();
        renderPomodoro();
    }

    function completePomodoroStage() {
        pomodoroState.isRunning = false;
        pomodoroState.endsAt = null;
        let alertMessage;
        if (pomodoroState.stage === 'focus') {
            pomodoroState.totalSessions += 1;
            pomodoroState.completedToday += 1;
            const mission = pomodoroState.mission ? ` · ${pomodoroState.mission}` : '';
            journalEntries.unshift({ date: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), text: `Session Pomodoro terminée${mission}.` });
            pomodoroState.stage = pomodoroState.completedToday % pomodoroState.cycleLength === 0 ? 'longBreak' : 'shortBreak';
            document.getElementById('pomodoroMessage').textContent = pomodoroState.stage === 'longBreak' ? 'Bravo ! Cycle complet : prends une vraie pause.' : 'Bien joué ! La session est terminée : prends une petite pause.';
            alertMessage = 'Session de concentration terminée. C’est l’heure de faire une pause.';
        } else {
            pomodoroState.stage = 'focus';
            document.getElementById('pomodoroMessage').textContent = 'Pause terminée. Prêt pour une nouvelle mission ?';
            alertMessage = 'Pause terminée. Ta prochaine session de concentration est prête.';
        }
        pomodoroState.remainingSeconds = durationForPomodoroStage();
        if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
        triggerPomodoroAlert(alertMessage);
        renderJournal();
        renderPomodoro();
        saveData();
    }

    function tickPomodoro() {
        if (pomodoroState.date !== pomodoroToday()) {
            pomodoroState.date = pomodoroToday();
            pomodoroState.completedToday = 0;
            saveData();
        }
        if (pomodoroState.isRunning) {
            pomodoroState.remainingSeconds = Math.max(0, Math.ceil((pomodoroState.endsAt - Date.now()) / 1000));
            if (pomodoroState.remainingSeconds === 0) completePomodoroStage();
        }
        renderPomodoro();
    }

    function setPomodoroSettings() {
        showEditor('Réglages Pomodoro', [
            { name: 'workMinutes', label: 'Durée de concentration (minutes)', value: pomodoroState.workMinutes, type: 'number', min: 1, max: 120, required: true },
            { name: 'shortBreakMinutes', label: 'Petite pause (minutes)', value: pomodoroState.shortBreakMinutes, type: 'number', min: 1, max: 60, required: true },
            { name: 'longBreakMinutes', label: 'Pause longue (minutes)', value: pomodoroState.longBreakMinutes, type: 'number', min: 1, max: 90, required: true },
            { name: 'cycleLength', label: 'Sessions avant la pause longue', value: pomodoroState.cycleLength, type: 'number', min: 2, max: 8, required: true }
        ], (values) => {
            pomodoroState.workMinutes = Math.min(120, Math.max(1, Number(values.workMinutes) || 25));
            pomodoroState.shortBreakMinutes = Math.min(60, Math.max(1, Number(values.shortBreakMinutes) || 5));
            pomodoroState.longBreakMinutes = Math.min(90, Math.max(1, Number(values.longBreakMinutes) || 15));
            pomodoroState.cycleLength = Math.min(8, Math.max(2, Number(values.cycleLength) || 4));
            if (!pomodoroState.isRunning) pomodoroState.remainingSeconds = durationForPomodoroStage();
            saveData();
            renderPomodoro();
        });
    }

    function switchTabEnhanced(tab) {
        const sections = { hub: 'hub', calendar: 'calendar', pomodoro: 'pomodoro', discipline: 'discipline', cards: 'cards' };
        Object.entries(sections).forEach(([key, id]) => document.getElementById(id).classList.toggle('hidden', key !== tab));
        document.querySelectorAll('.tab-btn').forEach((button) => {
            const active = button.dataset.tab === tab;
            button.classList.toggle('active', active);
            button.classList.toggle('text-sky-600', active);
            button.classList.toggle('text-slate-500', !active);
        });
        if (tab === 'calendar') { renderScheduleEditable(); renderTodosEditable(); }
        if (tab === 'pomodoro') renderPomodoro();
        if (tab === 'discipline') renderTracker();
        if (tab === 'cards') renderCards();
    }

    loadData();
    switchTab = switchTabEnhanced;
    updateStreak = renderTrackerStats;
    injectControls();
    initializeInstallButton();
    renderSubjects = renderSubjectsEditable;
    renderSchedule = renderScheduleEditable;
    renderTodos = renderTodosEditable;
    openModal = openModalEditable;
    renderSubjectsEditable();
    renderScheduleEditable();
    renderTodosEditable();
    renderJournal();
    renderTracker();
    renderPomodoro();
    renderBudget();
    document.getElementById('pomodoroStart').addEventListener('click', startPomodoro);
    document.getElementById('pomodoroPause').addEventListener('click', pausePomodoro);
    document.getElementById('pomodoroReset').addEventListener('click', () => {
        pomodoroState.isRunning = false;
        pomodoroState.endsAt = null;
        pomodoroState.remainingSeconds = durationForPomodoroStage();
        document.getElementById('pomodoroMessage').textContent = 'Minuteur remis au début de cette session.';
        saveData(); renderPomodoro();
    });
    document.getElementById('pomodoroSkip').addEventListener('click', () => {
        if (pomodoroState.stage === 'focus') return;
        pomodoroState.stage = 'focus';
        pomodoroState.isRunning = false;
        pomodoroState.endsAt = null;
        pomodoroState.remainingSeconds = durationForPomodoroStage();
        document.getElementById('pomodoroMessage').textContent = 'Pause passée. Tu peux lancer une nouvelle session.';
        saveData(); renderPomodoro();
    });
    document.getElementById('toggleTrack').addEventListener('click', toggleSpotifyPlayback);
    document.getElementById('prevTrack').addEventListener('click', () => setSpotifyTrack(spotifyState.currentIndex - 1));
    document.getElementById('nextTrack').addEventListener('click', () => setSpotifyTrack(spotifyState.currentIndex + 1));
    document.querySelectorAll('.song-chip').forEach((chip) => {
        chip.addEventListener('click', () => setSpotifyTrack(Number(chip.dataset.index)));
    });
    document.getElementById('pomodoroSettings').addEventListener('click', setPomodoroSettings);
    document.getElementById('walletAddMoney').addEventListener('click', () => addBudgetTransaction('income'));
    document.getElementById('walletAddExpense').addEventListener('click', () => addBudgetTransaction('expense'));
    document.getElementById('addCardScan').addEventListener('click', () => document.getElementById('cardScanInput').click());
    document.getElementById('cardScanInput').addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []);
        const category = document.getElementById('cardCategory').value;
        const status = document.getElementById('cardStatus');
        let savedCount = 0;
        const errors = [];
        for (const file of files) {
            const supported = (file.type.startsWith('image/') && file.type !== 'image/svg+xml') || file.type === 'application/pdf';
            if (!supported) { errors.push(`${file.name} : format non pris en charge`); continue; }
            if (file.size > 15 * 1024 * 1024) { errors.push(`${file.name} : fichier supérieur à 15 Mo`); continue; }
            try {
                await storeCardScan(file, category);
                savedCount += 1;
            } catch (error) {
                console.warn('Card scan could not be saved:', error);
                errors.push(`${file.name} : enregistrement impossible`);
            }
        }
        status.textContent = [savedCount ? `${savedCount} scan${savedCount > 1 ? 's' : ''} enregistré${savedCount > 1 ? 's' : ''} sur cet appareil.` : '', ...errors].filter(Boolean).join(' ');
        event.target.value = '';
        await renderCards();
    });
    document.getElementById('pomodoroMission').addEventListener('input', (event) => {
        pomodoroState.mission = event.target.value;
        saveData();
    });
    renderSpotifyPlayer();
    setInterval(tickPomodoro, 1000);
    setInterval(() => {
        if (trackerObservedDate !== dateKey(new Date())) renderTracker();
    }, 60000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && trackerObservedDate !== dateKey(new Date())) renderTracker();
    });

    document.getElementById('trackerPrevMonth').addEventListener('click', () => setTrackerMonth(-1));
    document.getElementById('trackerNextMonth').addEventListener('click', () => setTrackerMonth(1));
    document.getElementById('trackerEditGoals').addEventListener('click', editTrackerGoals);
    document.getElementById('trackerToday').addEventListener('click', () => {
        const now = new Date();
        trackerViewDate = new Date(now.getFullYear(), now.getMonth(), 1);
        selectedTrackerDate = dateKey(now);
        renderTracker();
    });
    document.getElementById('trackerNoMasturbation').addEventListener('change', saveTrackerCheck);
    document.getElementById('trackerNoPorn').addEventListener('change', saveTrackerCheck);
    document.getElementById('streakButton').addEventListener('click', saveData);
    document.querySelectorAll('.day-btn').forEach((button) => button.addEventListener('click', () => {
        currentDay = button.dataset.day;
        document.querySelectorAll('.day-btn').forEach((dayButton) => {
            const active = dayButton.dataset.day === currentDay;
            dayButton.classList.toggle('bg-sky-500', active);
            dayButton.classList.toggle('text-white', active);
            dayButton.classList.toggle('bg-sky-50', !active);
            dayButton.classList.toggle('text-slate-600', !active);
        });
        renderScheduleEditable(); renderTodosEditable();
    }));
    document.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', () => {
        if (button.dataset.tab === 'calendar') { renderScheduleEditable(); renderTodosEditable(); }
    }));
    window.addEventListener('beforeunload', saveData);
})();
