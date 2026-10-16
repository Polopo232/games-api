Vue.createApp({
    data() {
        return {
            games: [],
            gameInModal: {
                id: null,
                name: null,
                price: null
            }
        }
    },
    async created() {
        const response = await fetch('http://localhost:8080/games');
        this.games = await response.json();
    },
    methods: {
        async getGame(id) {
            const response = await fetch(`http://localhost:8080/games/${id}`);
            this.gameInModal = await response.json();

            const modalElement = document.getElementById('gameInfoModal');
            const gameInfoModal = new bootstrap.Modal(modalElement);
            gameInfoModal.show();
        }
    }
}).mount('#app')