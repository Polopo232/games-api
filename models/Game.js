const mongoose = require('mongoose')

const gameSchema = new mongoose.Schema({
    name: {type: String, required: true, trim: true},
    price: {type: Number, required: true, min: 0}
})

gameSchema.index({name: 1}, {unique: true, collation: {locale: 'en', strength: 2}})

gameSchema.set('toJSON', {
    transform: (doc, ret) => {
        ret.id = ret._id.toString()
        delete ret._id
        delete ret.__v
        return ret
    }
})

module.exports = mongoose.model('Game', gameSchema)