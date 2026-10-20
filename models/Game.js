const mongoose = require('mongoose')

const gameSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    }
}, {collection: 'games', autoIndex: false, autoCreate: false})

gameSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret._id
        delete ret.__v
        return ret
    }
})

module.exports = mongoose.model('Game', gameSchema)