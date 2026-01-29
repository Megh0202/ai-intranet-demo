const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const ticket = require("./models/ticket");
require("dotenv").config();

app.use(bodyParser.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected to", process.env.MONGODB_URI))
  .catch((err) => console.log(err));

app.get("/", (req, res)=>{
    res.send("API is running")
})

app.get("/tickets", async (req, res) => {
    // const newTicket = new ticket({
    //     title: "Sample Ticket",
    //     description: "This is a sample ticket description."
    // });
    // await newTicket.save().then(()=>{
    //     res.json({ message: "Sample ticket created", ticket: newTicket });
    // }).catch((err)=>{
    //     res.status(500).json({ error: "Error creating ticket", details: err });
    // });
    res.send("this is tickets endpoint working for craeting of random tickets!!!!");
});

app.post("/ticket/create", async (req, res) =>{
    const { title, description } = req.body;
    console.log("Creating ticket with title:", title);

    const newTicket = new ticket({
        title,
        description
    });
    newTicket.save().then(()=>{
        res.json({ message: "Ticket created successfully", ticket: newTicket });
    }).catch((err)=>{
        res.status(500).json({ error: "Error creating ticket", details: err });
    });
})

app.get("/ticket/all", async (req, res)=>{
    try {
        const tickets = await ticket.find();
        res.json(tickets);
    }
    catch{(err)=>{
        res.status(500).json({ error: "Error fetching tickets", details: err });
    }}
})

app.get("/ticket/:id", async (req, res)=>{
    console.log("Fetching ticket with ID:", req.params.id);
    const ticketId = req.params.id;
    try {
        const foundTicket = await ticket.findOne({ id: ticketId });
        if(foundTicket){
            res.json(foundTicket);
        } else {
            res.status(404).json({ error: "Ticket not found" });
        }
    } catch (err) {
        res.status(500).json({ error: "Error fetching ticket", details: err });
    }
})

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});