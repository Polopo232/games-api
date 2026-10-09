const app = require('express')()
const port = 8080
const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('./docs/swagger.json')

app.get('/games', (req, res) => {
    res.send([
        { id: 1, name: "Witcher 3" },
        { id: 2, name: "Cyberpunk 2077" },
        { id: 3, name: "GTA V" }
    ])
})

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.listen(port, () => {
    console.log(`API available on http://localhost:${port}`)
})