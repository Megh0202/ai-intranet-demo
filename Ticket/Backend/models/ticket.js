const mongoose = require('mongoose');
const crypto = require('crypto'); 

const ticketSchema = new mongoose.Schema({
    id: {
        type: String,
        unique: true,
        required: true,
        default: ()=> crypto.randomBytes(5).toString('hex')
    },
    title: String,
    description: String,
    status: {
        type: String,
        enum: ['open', 'in progress', 'closed'],
        default: 'open'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Ticket', ticketSchema);