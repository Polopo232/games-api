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
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(swaggerFile)))
} else {
    console.warn('swagger.yaml не найден в ' + __dirname + ' - /docs отключён. Положи swagger.yaml рядом с index.js')
}

function isValidGame(body) {
    return body
        && typeof body.name === 'string' && body.name.trim() !== ''
        && typeof body.price === 'number' && body.price >= 0
}

const handle = fn => (req, res) => fn(req, res).catch(err => {
    if (err.code === 11000) {
        return res.status(409).send({error: "Game with this name already exists"})
    }
    console.error(err)
    res.status(500).send({error: "Server error"})
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

app.post('/games', handle(async (req, res) => {
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

app.put('/games/:id', handle(async (req, res) => {
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

app.delete('/games/:id', handle(async (req, res) => {
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
            console.log(`API up at: http://localhost:${port}`)
            console.log(`Docs at:   http://localhost:${port}/docs`)
        })
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err.message)
        process.exit(1)
    })