const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
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
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(swaggerFile), {
        swaggerOptions: {persistAuthorization: true} // токен не сбрасывается при обновлении страницы
    }))
} else {
    console.warn('swagger.yaml не найден в ' + __dirname + ' - /docs отключён. Положи swagger.yaml рядом с index.js')
}

function isValidGame(body) {
    return body
        && typeof body.name === 'string' && body.name.trim() !== ''
        && typeof body.price === 'number' && body.price >= 0
}

const handle = fn => (req, res, next) => fn(req, res, next).catch(err => {
    if (err.code === 11000) {
        return res.status(409).send({error: "Game with this name already exists"})
    }
    console.error(err)
    res.status(500).send({error: "Server error"})
})

// ---------- Фронтенд (отдаём только эти два файла, чтобы .env и код сервера не были доступны) ----------

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))
app.get('/rest-client.js', (req, res) => res.sendFile(path.join(__dirname, 'rest-client.js')))

// ---------- Авторизация ----------

function getCookie(req, name) {
    for (const part of (req.headers.cookie || '').split(';')) {
        const [key, ...value] = part.trim().split('=')
        if (key === name) return decodeURIComponent(value.join('='))
    }
    return null
}

const auth = handle(async (req, res, next) => {
    const header = req.headers.authorization || ''
    const tokens = [
        header.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim(),
        getCookie(req, 'token')
    ]
    req.user = null
    req.token = null
    for (const token of tokens) {
        if (!token) continue
        const session = await db.getSession(token)
        if (session) {
            req.user = session
            req.token = token
            break
        }
    }
    next()
})

const COOKIE_OPTIONS = {httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000}

function requireLogin(req, res, next) {
    if (!req.user) {
        return res.status(401).send({error: "Login required"})
    }
    next()
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).send({error: "Login required"})
    }
    if (req.user.role !== 'admin') {
        return res.status(403).send({error: "Only admin can do this"})
    }
    next()
}

app.use(auth)

function isValidCredentials(body) {
    return body
        && typeof body.username === 'string' && body.username.trim() !== ''
        && typeof body.password === 'string' && body.password !== ''
}

app.post('/login', handle(async (req, res) => {
    if (!isValidCredentials(req.body)) {
        return res.status(400).send({error: "username and password are required"})
    }
    const user = await db.checkLogin(req.body.username, req.body.password)
    if (!user) {
        return res.status(401).send({error: "Wrong username or password"})
    }
    const token = await db.createSession(user)
    res.cookie('token', token, COOKIE_OPTIONS)
    res.send({token, user})
}))

app.post('/register', handle(async (req, res) => {
    if (!isValidCredentials(req.body)) {
        return res.status(400).send({error: "username and password are required"})
    }
    if (req.body.password.length < 4) {
        return res.status(400).send({error: "Password must be at least 4 characters"})
    }
    if (await db.usernameExists(req.body.username)) {
        return res.status(409).send({error: "Username is already taken"})
    }
    const user = await db.addUser(req.body.username, req.body.password, 'user')
    const token = await db.createSession(user)
    res.cookie('token', token, COOKIE_OPTIONS)
    res.status(201).send({token, user})
}))

app.post('/logout', requireLogin, handle(async (req, res) => {
    await db.deleteSession(req.token)
    res.clearCookie('token', COOKIE_OPTIONS)
    res.status(204).send()
}))

app.get('/me', requireLogin, (req, res) => {
    res.send(req.user)
})

// ---------- Игры ----------

app.get('/games',handle(async (req, res) => {
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
    .then(() => {
        app.listen(port, () => {
            console.log(`Site at:   http://localhost:${port}`)
            console.log(`API up at: http://localhost:${port}/games`)
            console.log(`Docs at:   http://localhost:${port}/docs`)
        })
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err.message)
        process.exit(1)
    })