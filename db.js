require('dotenv').config({override: true})
const crypto = require('crypto')
const {MongoClient} = require('mongodb')

function getUrl() {
    let url = (process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://localhost:27017')
        .trim().replace(/^["']|["']$/g, '')
    const user = process.env.MONGODB_USERNAME
    const password = process.env.MONGODB_PASSWORD

    if (!url.includes('://')) {
        url = (url.endsWith('.mongodb.net') ? 'mongodb+srv://' : 'mongodb://') + url
    }
    if (password && /<(db_)?password>/.test(url)) {
        return url.replace(/<(db_)?password>/, encodeURIComponent(password))
    }
    if (user && password && !url.includes('@')) {
        return url.replace('://', `://${encodeURIComponent(user)}:${encodeURIComponent(password)}@`)
    }
    return url
}

const client = new MongoClient(getUrl())

let games
let counters
let users
let sessions

const noMongoId = {projection: {_id: 0}}
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
    await client.connect()
    const database = client.db('gamesdb')
    games = database.collection('games')
    counters = database.collection('counters')
    users = database.collection('users')
    sessions = database.collection('sessions')

    await games.createIndex({name: 1}, {unique: true, ...ignoreCase})
    await users.createIndex({username: 1}, {unique: true, ...ignoreCase})
    await sessions.createIndex({token: 1}, {unique: true})
    await sessions.createIndex({createdAt: 1}, {expireAfterSeconds: 60 * 60 * 24 * 7})

    if (await games.countDocuments() === 0) {
        for (const game of startingGames) {
            await addGame(game.name, game.price)
        }
    }

    if (await users.countDocuments() === 0) {
        for (const u of startingUsers) {
            await addUser(u.username, u.password, u.role)
        }
        console.log('Созданы пользователи: ' + startingUsers.map(u => `${u.username} (${u.role})`).join(', '))
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


function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    return `${salt}:${hash}`
}

function checkPassword(password, stored) {
    const [salt, hash] = stored.split(':')
    const test = crypto.scryptSync(password, salt, 64)
    return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'))
}

const startingUsers = [
    {username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123', role: 'admin'},
    {username: process.env.USER_USERNAME || 'user', password: process.env.USER_PASSWORD || 'user123', role: 'user'}
]

async function addUser(username, password, role = 'user') {
    const user = {username: username.trim(), password: hashPassword(password), role}
    await users.insertOne(user)
    return {username: user.username, role}
}

async function usernameExists(username) {
    return (await users.findOne({username: username.trim()}, ignoreCase)) !== null
}

// Возвращает {username, role} при правильном пароле, иначе null
async function checkLogin(username, password) {
    const user = await users.findOne({username: username.trim()}, ignoreCase)
    if (!user || !checkPassword(password, user.password)) return null
    return {username: user.username, role: user.role}
}

async function createSession(user) {
    const token = crypto.randomBytes(32).toString('hex')
    await sessions.insertOne({token, username: user.username, role: user.role, createdAt: new Date()})
    return token
}

async function getSession(token) {
    return await sessions.findOne({token}, {projection: {_id: 0, token: 0, createdAt: 0}})
}

async function deleteSession(token) {
    await sessions.deleteOne({token})
}

module.exports = {
    connect, getGames, getGame, nameExists, addGame, deleteGame, updateGame,
    addUser, usernameExists, checkLogin, createSession, getSession, deleteSession
}