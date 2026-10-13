const express = require('express')
const app = express()
const port = 8080
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const swaggerDocument = YAML.load('./docs/swagger.yaml')

app.use(express.json())

const games = [
    { id: 1, name: "Witcher 3", price: 29.99 },
    { id: 2, name: "Cyberpunk 2077", price: 59.99 },
    { id: 3, name: "GTA V", price: 14.99 },
    { id: 4, name: "Minecraft", price: 26.95 },
    { id: 5, name: "Red Dead Redemption 2", price: 59.99 },
    { id: 6, name: "Elden Ring", price: 59.99 },
    { id: 7, name: "God of War", price: 49.99 },
    { id: 8, name: "CS:GO", price: 0.00 }
]

app.get('/games', (req, res) => {
    res.send(games)
})

app.get('/games/:id', (req, res) => {
    const game = games[req.params.id - 1]

    if (typeof game === 'undefined') {
        return res.status(404).send({ error: "Game not found" })
    }

    res.send(game)
})

function getBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`
}

app.post('/games', (req, res) => {
    // 1. Проверяем, переданы ли name и price
    if (!req.body.name || typeof req.body.price !== 'number') {
        return res.status(400).send({ error: "Bad input parameters or invalid request" })
    }

    const game = {
        id: games.length + 1,
        name: req.body.name,
        price: req.body.price
    }

    games.push(game)

    res.status(201)
        .location(`${getBaseUrl(req)}/games/${game.id}`)
        .send(game)
})

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.listen(port, () => {
    console.log(`API available on http://localhost:${port}`)
})