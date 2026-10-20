const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username: {type: String, required: true, trim: true},
    role: {type: String, required: true},
    passwordHash: {type: String, required: true}
}, {collection: 'users', autoIndex: false, autoCreate: false})

module.exports = mongoose.model('User', userSchema)