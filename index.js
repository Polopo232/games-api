const express = require('express')
const cors = require('cors')
const path = require('path')
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')


const app = express()
const port = 8080

app.use(cors())
app.use(express.json())

const swaggerDocument = YAML.load(path.join(__dirname, 'docs', 'swagger.yaml'))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

const games = [
    {id: 1, name: "Witcher 3", price: 29.99},
    {id: 2, name: "Cyberpunk 2077", price: 59.99},
    {id: 3, name: "Minecraft", price: 26.99},
    {id: 4, name: "Counter-Strike: Global Offensive", price: 0},
    {id: 5, name: "Roblox", price: 0},
    {id: 6, name: "Grand Theft Auto V", price: 29.99},
    {id: 7, name: "Valorant", price: 0},
    {id: 8, name: "Forza Horizon 5", price: 59.99}
]

function isValidGame(body) {
    return body
        && typeof body.name === 'string' && body.name.trim() !== ''
        && typeof body.price === 'number' && body.price >= 0
}

app.get('/games', (req, res) => {
    res.send(games)
})

app.get('/games/:id', (req, res) => {
    const game = games.find(g => g.id === Number(req.params.id))
    if (!game) {
        return res.status(404).send({error: "Game not found"})
    }
    res.send(game)
})

app.post('/games', (req, res) => {
    if (!isValidGame(req.body)) {
        return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
    }
    const game = {
        id: games.reduce((max, g) => Math.max(max, g.id), 0) + 1,
        name: req.body.name,
        price: req.body.price
    }
    games.push(game)
    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send(game)
})

app.put('/games/:id', (req, res) => {
    const game = games.find(g => g.id === Number(req.params.id))
    if (!game) {
        return res.status(404).send({error: "Game not found"})
    }
    if (!isValidGame(req.body)) {
        return res.status(400).send({error: "name (string) and price (number >= 0) are required"})
    }
    game.name = req.body.name
    game.price = req.body.price
    res.send(game)
})

app.delete('/games/:id', (req, res) => {
    const index = games.findIndex(g => g.id === Number(req.params.id))
    if (index === -1) {
        return res.status(404).send({error: "Game not found"})
    }
    games.splice(index, 1)
    res.status(204).send()
})

app.listen(port, () => {
    console.log(`API up at: http://localhost:${port}`)
    console.log(`Docs at:   http://localhost:${port}/docs`)
})

function getBaseUrl(req) {
    return `${req.protocol}://${req.headers.host}`
}