const API_URL = 'http://localhost:8080'

const {createApp} = Vue

createApp({
    data() {
        return {
            games: [],
            gameInModal: {},
            form: {id: null, name: '', price: null},
            formError: '',
            loginForm: {username: '', password: ''},
            loginError: '',
            message: '',
            token: localStorage.getItem('token') || '',
            username: localStorage.getItem('username') || '',
            role: localStorage.getItem('role') || ''
        }
    },

    computed: {
        isAdmin() {
            return this.token !== '' && this.role === 'admin'
        }
    },

    async mounted() {
        await this.loadGames()
        if (this.token) await this.checkSession()
    },

    methods: {
        async request(path, options = {}) {
            const sendToken = this.token && path !== '/login' && path !== '/register'
            const headers = {}
            if (options.body) headers['Content-Type'] = 'application/json'
            if (sendToken) headers['Authorization'] = 'Bearer ' + this.token

            let response
            try {
                response = await fetch(API_URL + path, {...options, headers})
            } catch (err) {
                throw new Error('Cannot connect to the server')
            }

            if (response.status === 204) return null

            let body = null
            try {
                body = await response.json()
            } catch (err) {
            }

            if (response.status === 401 && sendToken) {
                this.clearSession()
                throw new Error('Session expired, please log in again')
            }
            if (!response.ok) {
                throw new Error((body && body.error) || 'Request failed (' + response.status + ')')
            }
            return body
        },

        showModal(id) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).show()
        },

        hideModal(id) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById(id)).hide()
        },

        async loadGames() {
            try {
                this.games = await this.request('/games')
            } catch (err) {
                this.message = err.message
            }
        },

        async getGame(id) {
            try {
                this.gameInModal = await this.request('/games/' + id)
                this.showModal('gameInfoModal')
            } catch (err) {
                this.message = err.message
            }
        },

        openAdd() {
            this.form = {id: null, name: '', price: null}
            this.formError = ''
            this.showModal('gameFormModal')
        },

        openEdit(game) {
            this.form = {id: game.id, name: game.name, price: game.price}
            this.formError = ''
            this.showModal('gameFormModal')
        },

        async saveGame() {
            const name = String(this.form.name || '').trim()
            const price = Number(this.form.price)
            if (name === '' || this.form.price === '' || this.form.price === null || Number.isNaN(price) || price < 0) {
                this.formError = 'Enter a name and a price (0 or more)'
                return
            }

            try {
                const body = JSON.stringify({name, price})
                if (this.form.id) {
                    await this.request('/games/' + this.form.id, {method: 'PUT', body})
                } else {
                    await this.request('/games', {method: 'POST', body})
                }
                this.hideModal('gameFormModal')
                await this.loadGames()
            } catch (err) {
                this.formError = err.message
            }
        },

        async deleteGame(game) {
            if (!confirm('Delete "' + game.name + '"?')) return
            try {
                await this.request('/games/' + game.id, {method: 'DELETE'})
                await this.loadGames()
            } catch (err) {
                this.message = err.message
            }
        },

        openLogin() {
            this.loginForm = {username: '', password: ''}
            this.loginError = ''
            this.showModal('loginModal')
        },

        saveSession(data) {
            this.token = data.token
            this.username = data.user.username
            this.role = data.user.role
            localStorage.setItem('token', this.token)
            localStorage.setItem('username', this.username)
            localStorage.setItem('role', this.role)
            this.loginForm.password = ''
            this.message = ''
            this.hideModal('loginModal')
        },

        clearSession() {
            this.token = ''
            this.username = ''
            this.role = ''
            localStorage.removeItem('token')
            localStorage.removeItem('username')
            localStorage.removeItem('role')
        },

        async login() {
            try {
                this.saveSession(await this.request('/login', {
                    method: 'POST',
                    body: JSON.stringify(this.loginForm)
                }))
            } catch (err) {
                this.loginError = err.message
            }
        },

        async register() {
            try {
                this.saveSession(await this.request('/register', {
                    method: 'POST',
                    body: JSON.stringify(this.loginForm)
                }))
            } catch (err) {
                this.loginError = err.message
            }
        },

        async logout() {
            try {
                await this.request('/logout', {method: 'POST'})
            } catch (err) {
            }
            this.clearSession()
        },

        async checkSession() {
            try {
                const me = await this.request('/me')
                this.username = me.username
                this.role = me.role
                localStorage.setItem('username', me.username)
                localStorage.setItem('role', me.role)
            } catch (err) {
            }
        }
    }
}).mount('#app')