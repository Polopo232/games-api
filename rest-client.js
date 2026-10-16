const API = location.protocol === 'file:' ? 'http://localhost:8080' : '';

function showModal(id) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).show();
}

function hideModal(id) {
    bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).hide();
}

Vue.createApp({
    data() {
        return {
            games: [],
            gameInModal: {
                id: null,
                name: null,
                price: null
            },

            token: localStorage.getItem('token'),
            user: null,
            loginMode: 'login',
            loginForm: {username: '', password: ''},
            loginError: '',

            gameForm: {id: null, name: '', price: 0},
            formError: '',

            gameToDelete: null,
            deleteError: '',

            message: ''
        }
    },
    computed: {
        isAdmin() {
            return this.user !== null && this.user.role === 'admin';
        },
        isEditing() {
            return this.gameForm.id !== null;
        }
    },
    async created() {
        await this.loadUser();
        await this.loadGames();
    },
    methods: {
        async api(url, options = {}) {
            const headers = {'Content-Type': 'application/json'};
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }
            const response = await fetch(API + url, {...options, headers});
            if (response.status === 401 && this.token && url !== '/login') {
                this.clearLogin();
            }
            return response;
        },

        async errorText(response) {
            try {
                const body = await response.json();
                return body.error || `Error ${response.status}`;
            } catch {
                return `Error ${response.status}`;
            }
        },

        flash(text) {
            this.message = text;
            setTimeout(() => this.message = '', 3000);
        },

        // ---------- Игры ----------

        async loadGames() {
            const response = await this.api('/games');
            this.games = await response.json();
        },

        async getGame(id) {
            const response = await this.api(`/games/${id}`);
            this.gameInModal = await response.json();
            showModal('gameInfoModal');
        },

        openAddForm() {
            this.gameForm = {id: null, name: '', price: 0};
            this.formError = '';
            showModal('gameFormModal');
        },

        openEditForm(game) {
            this.gameForm = {id: game.id, name: game.name, price: game.price};
            this.formError = '';
            hideModal('gameInfoModal');
            showModal('gameFormModal');
        },

        async saveGame() {
            const body = JSON.stringify({
                name: this.gameForm.name,
                price: Number(this.gameForm.price)
            });
            const response = this.isEditing
                ? await this.api(`/games/${this.gameForm.id}`, {method: 'PUT', body})
                : await this.api('/games', {method: 'POST', body});

            if (!response.ok) {
                this.formError = await this.errorText(response);
                return;
            }
            hideModal('gameFormModal');
            this.flash(this.isEditing ? 'Game updated' : 'Game added');
            await this.loadGames();
        },

        askDelete(game) {
            this.gameToDelete = game;
            this.deleteError = '';
            hideModal('gameInfoModal');
            showModal('deleteModal');
        },

        async deleteGame() {
            const response = await this.api(`/games/${this.gameToDelete.id}`, {method: 'DELETE'});
            if (!response.ok) {
                this.deleteError = await this.errorText(response);
                return;
            }
            hideModal('deleteModal');
            this.flash(`"${this.gameToDelete.name}" deleted`);
            await this.loadGames();
        },

        // ---------- Вход / выход ----------

        async loadUser() {
            if (!this.token) return;
            const response = await this.api('/me');
            this.user = response.ok ? await response.json() : null;
        },

        openLogin(mode = 'login') {
            this.loginMode = mode;
            this.loginForm = {username: '', password: ''};
            this.loginError = '';
            showModal('loginModal');
        },

        async submitLogin() {
            const url = this.loginMode === 'login' ? '/login' : '/register';
            const response = await this.api(url, {
                method: 'POST',
                body: JSON.stringify(this.loginForm)
            });
            if (!response.ok) {
                this.loginError = await this.errorText(response);
                return;
            }
            const data = await response.json();
            this.token = data.token;
            this.user = data.user;
            localStorage.setItem('token', data.token);
            hideModal('loginModal');
        },

        async logout() {
            await this.api('/logout', {method: 'POST'});
            this.clearLogin();
        },

        clearLogin() {
            this.token = null;
            this.user = null;
            localStorage.removeItem('token');
        }
    }
}).mount('#app')
