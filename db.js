const mongoose = require('mongoose')
const Game = require('./models/Game')

// Своя строка подключения: set MONGO_URI=... (Atlas или другой сервер)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/games-api'

const initialGames = [
    {name: "Witcher 3", price: 29.99},
    {name: "Cyberpunk 2077", price: 59.99},
    {name: "Minecraft", price: 26.99},
    {name: "Counter-Strike: Global Offensive", price: 0},
    {name: "Roblox", price: 0},
    {name: "Grand Theft Auto V", price: 29.99},
    {name: "Valorant", price: 0},
    {name: "Forza Horizon 5", price: 59.99}
]

async function connectDB() {
    await mongoose.connect(MONGO_URI)
    console.log('MongoDB connected')

    // создаём уникальный индекс по имени (без учёта регистра)
    await Game.init()

    // если коллекция пустая, заполняем начальными играми
    if (await Game.countDocuments() === 0) {
        await Game.insertMany(initialGames)
        console.log('Database seeded with initial games')
    }
}

module.exports = connectDB