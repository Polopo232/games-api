require('dotenv').config({override: true})
const mongoose = require('mongoose')
const Game = require('./models/Game')
const User = require('./models/User')
const Session = require('./models/Session')

function getUrl() {
    let url = process.env.MONGODB_URI || process.env.MONGODB_URL
    if (!url) {
        const found = Object.keys(process.env).filter(name => name.startsWith('MONGO')).join(', ') || 'нет'
        console.warn('ВНИМАНИЕ: MONGODB_URI не найден в .env, используется localhost. Найденные переменные MONGO*: ' + found)
        url = 'mongodb://localhost:27017'
    }
    url = url.trim().replace(/^["']|["']$/g, '')
    const user = process.env.MONGODB_USERNAME
    const password = process.env.MONGODB_PASSWORD

    if (!url.includes('://')) {
        url = (url.endsWith('.mongodb.net') ? 'mongodb+srv://' : 'mongodb://') + url
    }
    if (/<(db_)?(username|password)>/.test(url)) {
        return url
            .replace(/<(db_)?username>/, encodeURIComponent(user || ''))
            .replace(/<(db_)?password>/, encodeURIComponent(password || ''))
    }
    if (user && password && !url.includes('@')) {
        return url.replace('://', `://${encodeURIComponent(user)}:${encodeURIComponent(password)}@`)
    }
    return url
}

const url = getUrl()

const SESSION_SECONDS = 8 * 60 * 60
const ignoreCase = {locale: 'en', strength: 2}

const startingGames = [
    {name: "Witcher 3", price: 29.99},
    {name: "Cyberpunk 2077", price: 59.99},
    {name: "Minecraft", price: 26.99},
    {name: "Counter-Strike: Global Offensive", price: 0},
    {name: "Roblox", price: 0},
    {name: "Grand Theft Auto V", price: 29.99},
    {name: "Valorant", price: 0},
    {name: "Forza Horizon 5", price: 59.99}
]

async function dropForeignIndexes(collection, keep) {
    let indexes
    try {
        indexes = await collection.indexes()
    } catch (err) {
        if (err.code === 26) return
        throw err
    }
    for (const index of indexes) {
        if (!keep.includes(index.name)) {
            await collection.dropIndex(index.name)
        }
    }
}

async function ensureIndex(collection, keys, options) {
    try {
        await collection.createIndex(keys, options)
    } catch (err) {
        if (err.code === 85 || err.code === 86) {
            const name = Object.entries(keys).map(([key, dir]) => key + '_' + dir).join('_')
            await collection.dropIndex(name)
            await collection.createIndex(keys, options)
        } else {
            throw err
        }
    }
}

async function connect() {
    console.log('Connecting to:', url.replace(/\/\/[^@/]*@/, '//***:***@'))
    await mongoose.connect(url, {dbName: 'gamesdb'})
    console.log('MongoDB connected')

    await dropForeignIndexes(Game.collection, ['_id_', 'id_1', 'name_1'])
    await dropForeignIndexes(User.collection, ['_id_', 'username_1'])
    await dropForeignIndexes(Session.collection, ['_id_', 'tokenHash_1', 'createdAt_1'])
    await Session.deleteMany({tokenHash: null})

    await ensureIndex(Game.collection, {id: 1}, {unique: true})
    await ensureIndex(Game.collection, {name: 1}, {unique: true, collation: ignoreCase})
    await ensureIndex(User.collection, {username: 1}, {unique: true, collation: ignoreCase})
    await ensureIndex(Session.collection, {tokenHash: 1}, {unique: true})
    await ensureIndex(Session.collection, {createdAt: 1}, {expireAfterSeconds: SESSION_SECONDS})

    if (await Game.countDocuments() === 0) {
        for (const game of startingGames) {
            await addGame(game.name, game.price)
        }
    }
}

async function getGames() {
    return await Game.find().sort({id: 1})
}

async function getGame(id) {
    const number = Number(id)
    if (!Number.isInteger(number)) return null
    return await Game.findOne({id: number})
}

async function nameExists(name, exceptId) {
    const filter = {name: name.trim()}
    if (exceptId !== undefined) filter.id = {$ne: Number(exceptId)}
    return (await Game.findOne(filter).collation(ignoreCase)) !== null
}

async function addGame(name, price) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const lastGame = await Game.findOne().sort({id: -1})
        const newId = lastGame ? lastGame.id + 1 : 1
        try {
            return await Game.create({id: newId, name: name.trim(), price})
        } catch (err) {
            if (err.code === 11000 && err.keyPattern && err.keyPattern.id) continue
            throw err
        }
    }
    throw new Error('Could not generate a game id')
}

async function updateGame(id, name, price) {
    return await Game.findOneAndUpdate(
        {id: Number(id)},
        {name: name.trim(), price},
        {returnDocument: 'after', runValidators: true}
    )
}

async function deleteGame(id) {
    const result = await Game.deleteOne({id: Number(id)})
    return result.deletedCount > 0
}

async function getUser(username) {
    return await User.findOne({username: String(username).trim()}).collation(ignoreCase)
}

async function addUser(username, role, passwordHash) {
    await User.create({username, role, passwordHash})
}

async function saveUser(username, role, passwordHash) {
    await User.updateOne(
        {username},
        {$set: {username, role, passwordHash}},
        {upsert: true, collation: ignoreCase}
    )
}

async function addSession(tokenHash, username, role) {
    await Session.create({tokenHash, username, role, createdAt: new Date()})
}

async function getSession(tokenHash) {
    const session = await Session.findOne({tokenHash})
    if (!session) return null
    if (Date.now() - session.createdAt.getTime() > SESSION_SECONDS * 1000) {
        await Session.deleteOne({tokenHash})
        return null
    }
    return session
}

async function deleteSession(tokenHash) {
    await Session.deleteOne({tokenHash})
}

module.exports = {
    connect, getGames, getGame, nameExists, addGame, deleteGame, updateGame,
    getUser, addUser, saveUser, addSession, getSession, deleteSession
}