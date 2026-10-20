require('dotenv').config({override: true})
const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const swaggerUi = require('swagger-ui-express')
const yaml = require('js-yaml')
const db = require('./db')

const app = express()
const port = 8080

app.use(cors())
app.use(express.json())

function findSwaggerFile(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isFile() && /^swagger\.ya?ml$/i.test(entry.name)) {
            return path.join(dir, entry.name)
        }
    }
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            const found = findSwaggerFile(path.join(dir, entry.name))
            if (found) return found
        }
    }
    return null
}

const swaggerFile = findSwaggerFile(__dirname)
if (swaggerFile) {
    console.log('Swagger file:', swaggerFile)
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(yaml.load(fs.readFileSync(swaggerFile, 'utf8'))))
} else {
    console.warn('swagger.yaml не найден в ' + __dirname + ' - /docs отключён. Положи swagger.yaml рядом с index.js')
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex')
    return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password, stored) {
    const [salt, hash] = String(stored).split(':')
    if (!salt || !hash) return false
    const expected = Buffer.from(hash, 'hex')
    const actual = crypto.scryptSync(password, salt, 64)
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected)
}

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex')

async function startSession(username, role) {
    const token = crypto.randomBytes(32).toString('hex')
    await db.addSession(hashToken(token), username, role)
    return {token, user: {username, role}}
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123'
if (!process.env.ADMIN_PASSWORD) {
    console.warn('ADMIN_PASSWORD не задан в .env - используется пароль по умолчанию (admin / 123)')
}

async function seedUsers() {
    await db.saveUser(ADMIN_USERNAME, 'admin', hashPassword(ADMIN_PASSWORD))
    const user = await db.getUser('user')
    if (!user || !user.passwordHash) {
        await db.saveUser('user', 'user', hashPassword('user123'))
    }
}

async function requireAuth(req, res, next) {
    try {
        const token = (req.headers.authorization || '').trim().replace(/^Bearer\s+/i, '')
        if (!token) {
            return res.status(401).send({error: "Login required"})
        }
        const session = await db.getSession(hashToken(token))
        if (!session) {
            return res.status(401).send({error: "Invalid or expired token"})
        }
        req.token = token
        req.user = {username: session.username, role: session.role}
        next()
    } catch (err) {
        console.error(err)
        res.status(500).send({error: "Server error"})
    }
}

const requireAdmin = [requireAuth, (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).send({error: "Only admin can do this"})
    }
    next()
}]

function isValidGame(body) {
    return body
        && typeof body.name === 'string' && body.name.trim() !== ''
        && typeof body.price === 'number' && body.price >= 0
}

const handle = fn => (req, res) => fn(req, res).catch(err => {
    if (err.code === 11000 && err.keyPattern && err.keyPattern.username) {
        return res.status(409).send({error: "Username is already taken"})
    }
    if (err.code === 11000 && err.keyPattern && err.keyPattern.name) {
        return res.status(409).send({error: "Game with this name already exists"})
    }
    console.error(err)
    res.status(500).send({error: "Server error"})
})

app.post('/register', handle(async (req, res) => {
    const {username, password} = req.body || {}
    if (typeof username !== 'string' || typeof password !== 'string' || username.trim() === '' || password === '') {
        return res.status(400).send({error: "username and password are required"})
    }
    const name = username.trim()
    if (name.length < 3 || password.length < 4) {
        return res.status(400).send({error: "username must be at least 3 characters and password at least 4"})
    }
    if (name.length > 30 || password.length > 100) {
        return res.status(400).send({error: "username or password is too long"})
    }
    if (await db.getUser(name)) {
        return res.status(409).send({error: "Username is already taken"})
    }
    await db.addUser(name, 'user', hashPassword(password))
    res.status(201).send(await startSession(name, 'user'))
}))

app.post('/login', handle(async (req, res) => {
    const {username, password} = req.body || {}
    if (typeof username !== 'string' || typeof password !== 'string' || username.trim() === '' || password === '') {
        return res.status(400).send({error: "username and password are required"})
    }
    const user = await db.getUser(username)
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).send({error: "Wrong username or password"})
    }
    res.send(await startSession(user.username, user.role))
}))

app.post('/logout', requireAuth, handle(async (req, res) => {
    await db.deleteSession(hashToken(req.token))
    res.status(204).send()
}))

app.get('/me', requireAuth, (req, res) => {
    res.send(req.user)
})

app.get('/games', handle(async (req, res) => {
    res.send(await db.getGames())
}))

app.get('/games/:id', handle(async (req, res) => {
    const game = await db.getGame(req.params.id)
    if (!game) {
        return res.status(404).send({error: "Game not found"})
    }
    res.send(game)
}))

app.post('/games', requireAdmin, handle(async (req, res) => {
    if (!isValidGame(req.body)) {
        return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
    }
    if (await db.nameExists(req.body.name)) {
        return res.status(409).send({error: "Game with this name already exists"})
    }
    const game = await db.addGame(req.body.name, req.body.price)
    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send(game)
}))

app.put('/games/:id', requireAdmin, handle(async (req, res) => {
    if (!await db.getGame(req.params.id)) {
        return res.status(404).send({error: "Game not found"})
    }
    if (!isValidGame(req.body)) {
        return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
    }
    if (await db.nameExists(req.body.name, req.params.id)) {
        return res.status(409).send({error: "Game with this name already exists"})
    }
    res.send(await db.updateGame(req.params.id, req.body.name, req.body.price))
}))

app.delete('/games/:id', requireAdmin, handle(async (req, res) => {
    if (!await db.deleteGame(req.params.id)) {
        return res.status(404).send({error: "Game not found"})
    }
    res.status(204).send()
}))

function getBaseUrl(req) {
    return `${req.protocol}://${req.headers.host}`
}

db.connect()
    .then(seedUsers)
    .then(() => {
        app.listen(port, () => {
            console.log(`API up at: http://localhost:${port}`)
            console.log(`Docs at:   http://localhost:${port}/docs`)
        })
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err.message)
        process.exit(1)
    })