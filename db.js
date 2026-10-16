require('dotenv').config({override: true})

const mongoose = require('mongoose')
const Game = require('./models/Game')

function env(...names) {
    for (const name of names) {
        if (process.env[name]) return process.env[name]
    }
    return undefined
}

function buildMongoUri() {
    const user = env('MONGODB_USERNAME')
    const password = env('MONGODB_PASSWORD')
    let url = env('MONGODB_URI')

    if (!url) {
        throw new Error('In .env not found (MONGO_URI / MONGODB_URI / DB_URL / URL)')
    }
    url = url.trim().replace(/^["']|["']$/g, '')

    const encUser = user ? encodeURIComponent(user) : ''
    const encPass = password ? encodeURIComponent(password) : ''

    if (/^mongodb(\+srv)?:\/\//.test(url)) {
        if (url.includes('<password>')) {
            return url.replace('<password>', encPass).replace('<db_password>', encPass)
        }
        if (url.includes('<db_password>')) {
            return url.replace('<db_password>', encPass)
        }
        const hasCredentials = /^mongodb(\+srv)?:\/\/[^/]*@/.test(url)
        if (!hasCredentials && user && password) {
            return url.replace(/^(mongodb(\+srv)?:\/\/)/, `$1${encUser}:${encPass}@`)
        }
        return url
    }

    const scheme = url.endsWith('.mongodb.net') ? 'mongodb+srv' : 'mongodb'
    const auth = user && password ? `${encUser}:${encPass}@` : ''
    return `${scheme}://${auth}${url}`
}

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
    const uri = buildMongoUri()

    const hasDbName = /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri)
    const options = hasDbName ? {} : {dbName: env('DB_NAME', 'MONGO_DB_NAME', 'DATABASE_NAME') || 'games-api'}

    console.log('Connecting to:', uri.replace(/\/\/[^@/]*@/, '//***:***@'))

    await mongoose.connect(uri, options)
    console.log('MongoDB connected')

    await Game.init()

    if (await Game.countDocuments() === 0) {
        await Game.insertMany(initialGames)
        console.log('Database seeded with initial games')
    }
}

module.exports = connectDB
module.exports.buildMongoUri = buildMongoUri