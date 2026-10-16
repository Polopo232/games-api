const express = require('express')
const cors = require('cors')
const path = require('path')
const mongoose = require('mongoose')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')

const connectDB = require('./db')
const Game = require('./models/Game')

const app = express()
const port = 8080

app.use(cors())
app.use(express.json())

// Swagger UI: http://localhost:8080/docs
const swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

const collation = {locale: 'en', strength: 2} // сравнение без учёта регистра

function isValidGame(body) {
    return body
        && typeof body.name === 'string' && body.name.trim() !== ''
        && typeof body.price === 'number' && body.price >= 0
}


// Ищет игру с таким же именем (кроме игры с id = exceptId)
function findByName(name, exceptId) {
    const filter = {name: name.trim()}
    if (exceptId) filter._id = {$ne: exceptId}
    return Game.findOne(filter).collation(collation)
}

app.get('/games', async (req, res) => {
    try {
        const games = await Game.find().sort({_id: 1})
        res.send(games)
    } catch (err) {
        res.status(500).send({error: "Server error"})
    }
})

app.get('/games/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).send({error: "Game not found"})
        }
        const game = await Game.findById(req.params.id)
        if (!game) {
            return res.status(404).send({error: "Game not found"})
        }
        res.send(game)
    } catch (err) {
        res.status(500).send({error: "Server error"})
    }
})

app.post('/games', async (req, res) => {
    try {
        if (!isValidGame(req.body)) {
            return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
        }
        if (await findByName(req.body.name)) {
            return res.status(409).send({error: "Game with this name already exists"})
        }
        const game = await Game.create({name: req.body.name.trim(), price: req.body.price})
        res.status(201)
            .location(`${getBaseUrl(req)}/games/${game.id}`)
            .send(game)
    } catch (err) {
        if (err.code === 11000) { // сработал уникальный индекс (гонка запросов)
            return res.status(409).send({error: "Game with this name already exists"})
        }
        res.status(500).send({error: "Server error"})
    }
})

// UPDATE: полная замена игры по id
app.put('/games/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).send({error: "Game not found"})
        }
        const game = await Game.findById(req.params.id)
        if (!game) {
            return res.status(404).send({error: "Game not found"})
        }
        if (!isValidGame(req.body)) {
            return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
        }
        if (await findByName(req.body.name, game._id)) {
            return res.status(409).send({error: "Game with this name already exists"})
        }
        game.name = req.body.name.trim()
        game.price = req.body.price
        await game.save()
        res.send(game)
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).send({error: "Game with this name already exists"})
        }
        res.status(500).send({error: "Server error"})
    }
})

app.delete('/games/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).send({error: "Game not found"})
        }
        const game = await Game.findByIdAndDelete(req.params.id)
        if (!game) {
            return res.status(404).send({error: "Game not found"})
        }
        res.status(204).send()
    } catch (err) {
        res.status(500).send({error: "Server error"})
    }
})

function getBaseUrl(req) {
    return `${req.protocol}://${req.headers.host}`
}

connectDB()
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