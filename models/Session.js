const mongoose = require('mongoose')

const sessionSchema = new mongoose.Schema({
    tokenHash: {type: String, required: true},
    username: {type: String, required: true},
    role: {type: String, required: true},
    createdAt: {type: Date, default: Date.now}
}, {collection: 'sessions', autoIndex: false, autoCreate: false})

module.exports = mongoose.model('Session', sessionSchema)