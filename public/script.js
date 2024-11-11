(function () {
    const mod = (n, m) => ((n % m) + m) % m;
    const baseDictionary = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~-';
    const shuffledIndicator = '_rhs';

    const generateDictionary = () => {
        let str = '';
        const split = baseDictionary.split('');
        while (split.length > 0) {
            str += split.splice(Math.floor(Math.random() * split.length), 1)[0];
        }
        return str;
    };

    class StrShuffler {
        constructor(dictionary = generateDictionary()) {
            this.dictionary = dictionary;
        }

        shuffle(str) {
            if (str.startsWith(shuffledIndicator)) {
                return str;
            }
            let shuffledStr = '';
            for (let i = 0; i < str.length; i++) {
                const char = str.charAt(i);
                const idx = baseDictionary.indexOf(char);
                if (char === '%' && str.length - i >= 3) {
                    shuffledStr += char + str.charAt(++i) + str.charAt(++i);
                } else if (idx === -1) {
                    shuffledStr += char;
                } else {
                    shuffledStr += this.dictionary.charAt(mod(idx + i, baseDictionary.length));
                }
            }
            return shuffledIndicator + shuffledStr;
        }

        unshuffle(str) {
            if (!str.startsWith(shuffledIndicator)) {
                return str;
            }

            str = str.slice(shuffledIndicator.length);
            let unshuffledStr = '';
            for (let i = 0; i < str.length; i++) {
                const char = str.charAt(i);
                const idx = this.dictionary.indexOf(char);
                if (char === '%' && str.length - i >= 3) {
                    unshuffledStr += char + str.charAt(++i) + str.charAt(++i);
                } else if (idx === -1) {
                    unshuffledStr += char;
                } else {
                    unshuffledStr += baseDictionary.charAt(mod(idx - i, baseDictionary.length));
                }
            }
            return unshuffledStr;
        }
    }

    function setError(err) {
        const element = document.getElementById('error-text');
        if (element) {
            element.style.display = err ? 'block' : 'none';
            element.textContent = err ? 'An error occurred: ' + err : '';
        }
    }

    function getPassword() {
        const element = document.getElementById('session-password');
        return element ? element.value : '';
    }

    async function get(url, callback, shush = false) {
        try {
            const pwd = getPassword();
            const response = await fetch(url + (pwd ? (url.includes('?') ? '&' : '?') + 'pwd=' + pwd : ''));
            if (!response.ok) throw new Error('Unexpected server response');
            const text = await response.text();
            callback(text);
        } catch (error) {
            if (!shush) setError(error.message);
        }
    }

    const api = {
        async needpassword(callback) {
            await get('/needpassword', value => callback(value === 'true'));
        },
        async newsession(callback) {
            await get('/newsession', callback);
        },
        async editsession(id, httpProxy, enableShuffling, callback) {
            await get(
                `/editsession?id=${encodeURIComponent(id)}${httpProxy ? '&httpProxy=' + encodeURIComponent(httpProxy) : ''}&enableShuffling=${enableShuffling ? '1' : '0'}`,
                res => {
                    if (res !== 'Success') return setError('Unexpected server response: ' + res);
                    callback();
                }
            );
        },
        async sessionexists(id, callback) {
            await get(`/sessionexists?id=${encodeURIComponent(id)}`, res => {
                if (res === 'exists') callback(true);
                else if (res === 'not found') callback(false);
                else setError('Unexpected server response: ' + res);
            });
        },
        async deletesession(id, callback) {
            await api.sessionexists(id, async exists => {
                if (exists) {
                    await get(`/deletesession?id=${id}`, res => {
                        if (res !== 'Success' && res !== 'not found') return setError('Unexpected server response: ' + res);
                        callback();
                    });
                } else {
                    callback();
                }
            });
        },
        async shuffleDict(id, callback) {
            await get(`/api/shuffleDict?id=${encodeURIComponent(id)}`, res => {
                callback(JSON.parse(res));
            });
        }
    };

    const localStorageKey = 'rammerhead_sessionids';
    const localStorageKeyDefault = 'rammerhead_default_sessionid';

    const sessionIdsStore = {
        get() {
            try {
                return JSON.parse(localStorage.getItem(localStorageKey)) || [];
            } catch {
                return [];
            }
        },
        set(data) {
            if (Array.isArray(data)) localStorage.setItem(localStorageKey, JSON.stringify(data));
        },
        getDefault() {
            const sessionId = localStorage.getItem(localStorageKeyDefault);
            return sessionIdsStore.get().find(e => e.id === sessionId) || null;
        },
        setDefault(id) {
            localStorage.setItem(localStorageKeyDefault, id);
        }
    };

    function renderSessionTable(data) {
        const tbody = document.querySelector('tbody');
        tbody.innerHTML = '';
        data.forEach((session, i) => {
            const tr = document.createElement('tr');
            appendIntoTr(session.id);
            appendIntoTr(session.createdOn);

            const fillInBtn = document.createElement('button');
            fillInBtn.textContent = 'Fill in existing session ID';
            fillInBtn.className = 'btn btn-outline-primary';
            fillInBtn.onclick = () => {
                setError();
                sessionIdsStore.setDefault(session.id);
                loadSettings(session);
            };
            appendIntoTr(fillInBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'btn btn-outline-danger';
            deleteBtn.onclick = () => {
                setError();
                api.deletesession(session.id, () => {
                    data.splice(i, 1);
                    sessionIdsStore.set(data);
                    renderSessionTable(data);
                });
            };
            appendIntoTr(deleteBtn);

            tbody.appendChild(tr);
        });

        function appendIntoTr(content) {
            const td = document.createElement('td');
            if (content instanceof HTMLElement) td.appendChild(content);
            else td.textContent = content;
            tr.appendChild(td);
        }
    }

    function loadSettings(session) {
        document.getElementById('session-id').value = session.id;
        document.getElementById('session-httpproxy').value = session.httpproxy || '';
        document.getElementById('session-shuffling').checked = session.enableShuffling ?? true;
    }

    function loadSessions() {
        const sessions = sessionIdsStore.get();
        const defaultSession = sessionIdsStore.getDefault();
        if (defaultSession) loadSettings(defaultSession);
        renderSessionTable(sessions);
    }

    async function addSession(id) {
        const data = sessionIdsStore.get();
        data.unshift({ id, createdOn: new Date().toLocaleString() });
        sessionIdsStore.set(data);
        renderSessionTable(data);
    }

    async function editSession(id, httpproxy, enableShuffling) {
        const data = sessionIdsStore.get();
        const session = data.find(session => session.id === id);
        if (session) {
            session.httpproxy = httpproxy;
            session.enableShuffling = enableShuffling;
            sessionIdsStore.set(data);
        } else {
            setError('Session not found');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadSessions();

        document.getElementById('session-advanced-toggle').onclick = function () {
            const advancedContainer = document.getElementById('session-advanced-container');
            advancedContainer.style.display = advancedContainer.style.display === 'none' ? 'block' : 'none';
        };

        document.getElementById('session-create-btn').onclick = async function () {
            setError();
            api.newsession(async id => {
                await addSession(id);
                document.getElementById('session-id').value = id;
                document.getElementById('session-httpproxy').value = '';
            });
        };

        const go = async function () {
            setError();
            const id = document.getElementById('session-id').value;
            const httpproxy = document.getElementById('session-httpproxy').value;
            const enableShuffling = document.getElementById('session-shuffling').checked;
            const url = document.getElementById('session-url').value || 'https://www.google.com/';
            if (!id) return setError('ID cannot be empty');
            await api.editsession(id, httpproxy, enableShuffling, () => {
                addSession(id);
                window.open(new StrShuffler().shuffle(`/session/${id}/${url}`), '_blank');
            });
        };

        document.getElementById('session-goto-btn').onclick = go;
        document.getElementById('session-goto-btn').onsubmit = e => {
            e.preventDefault();
            go();
        };
    });
})();
