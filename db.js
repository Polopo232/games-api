require('dotenv').config({override: true})
const {MongoClient} = require('mongodb')


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
const client = new MongoClient(url)

let games
let counters
let users
let sessions

const noMongoId = {projection: {_id: 0}}
const SESSION_SECONDS = 8 * 60 * 60
const ignoreCase = {collation: {locale: 'en', strength: 2}}

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

async function connect() {
    console.log('Connecting to:', url.replace(/\/\/[^@/]*@/, '//***:***@'))
    await client.connect()
    console.log('MongoDB connected')
    const database = client.db('gamesdb')
    games = database.collection('games')
    counters = database.collection('counters')
    users = database.collection('users')
    sessions = database.collection('sessions')

    await games.createIndex({name: 1}, {unique: true, ...ignoreCase})

    await sessions.deleteMany({tokenHash: null})
    await ensureIndex(users, {username: 1}, {unique: true, ...ignoreCase})
    await ensureIndex(sessions, {tokenHash: 1}, {unique: true})
    await ensureIndex(sessions, {createdAt: 1}, {expireAfterSeconds: SESSION_SECONDS})

    if (await games.countDocuments() === 0) {
        for (const game of startingGames) {
            await addGame(game.name, game.price)
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

async function getNextId() {
    const counter = await counters.findOneAndUpdate(
        {_id: 'games'},
        {$inc: {seq: 1}},
        {upsert: true, returnDocument: 'after'}
    )
    return counter.seq
}

async function getGames() {
    return await games.find({}, noMongoId).sort({id: 1}).toArray()
}

async function getGame(id) {
    return await games.findOne({id: Number(id)}, noMongoId)
}

async function nameExists(name, exceptId) {
    const filter = {name: name.trim()}
    if (exceptId !== undefined) filter.id = {$ne: Number(exceptId)}
    return (await games.findOne(filter, ignoreCase)) !== null
}

async function addGame(name, price) {
    const game = {id: await getNextId(), name: name.trim(), price}
    await games.insertOne({...game})
    return game
}

async function updateGame(id, name, price) {
    return await games.findOneAndUpdate(
        {id: Number(id)},
        {$set: {name: name.trim(), price}},
        {returnDocument: 'after', ...noMongoId}
    )
}

async function deleteGame(id) {
    const result = await games.deleteOne({id: Number(id)})
    return result.deletedCount > 0
}

async function getUser(username) {
    return await users.findOne({username: String(username).trim()}, ignoreCase)
}

async function addUser(username, role, passwordHash) {
    await users.insertOne({username, role, passwordHash})
}

async function saveUser(username, role, passwordHash) {
    await users.updateOne(
        {username},
        {$set: {username, role, passwordHash}},
        {upsert: true, ...ignoreCase}
    )
}

async function addSession(tokenHash, username, role) {
    await sessions.insertOne({tokenHash, username, role, createdAt: new Date()})
}

async function getSession(tokenHash) {
    const session = await sessions.findOne({tokenHash})
    if (!session) return null
    if (Date.now() - session.createdAt.getTime() > SESSION_SECONDS * 1000) {
        await sessions.deleteOne({tokenHash})
        return null
    }
    return session
}

async function deleteSession(tokenHash) {
    await sessions.deleteOne({tokenHash})
}

module.exports = {
    connect, getGames, getGame, nameExists, addGame, deleteGame, updateGame,
    getUser, addUser, saveUser, addSession, getSession, deleteSession
}