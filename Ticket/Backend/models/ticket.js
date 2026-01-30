const mongoose = require('mongoose');
const crypto = require('crypto'); 

const ticketSchema = new mongoose.Schema({
    id: {
        type: String,
        unique: true,
        required: true,
        default: ()=> crypto.randomBytes(5).toString('hex')
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 5000,
        default: "",
    },
    status: {
        type: String,
        enum: ['open', 'in progress', 'closed'],
        default: 'open'
    }
}, {
    timestamps: true,
});

module.exports = mongoose.model('Ticket', ticketSchema);