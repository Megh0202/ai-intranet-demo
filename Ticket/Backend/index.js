const express = require("express");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");
const ticket = require("./models/ticket");
require("dotenv").config();

app.use(express.json({ limit: "1mb" }));
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
    const { title, description } = req.body ?? {};
    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const normalizedDescription = typeof description === "string" ? description.trim() : "";

    if (!normalizedTitle) {
        return res.status(400).json({ error: "title is required" });
    }

    try {
        const newTicket = await ticket.create({
            title: normalizedTitle,
            description: normalizedDescription,
        });

        return res.status(201).json({ message: "Ticket created successfully", ticket: newTicket });
    } catch (err) {
        return res.status(500).json({ error: "Error creating ticket", details: err });
    }
})

// View tickets (recommended endpoints)
// - GET /ticket/view => list tickets
//   Optional query params: status, q, limit, offset
// - GET /ticket/view/:id => single ticket by ticket.id
app.get("/ticket/view", async (req, res) => {
    try {
        const { status, q } = req.query;
        const limitRaw = Number.parseInt(req.query.limit, 10);
        const offsetRaw = Number.parseInt(req.query.offset, 10);

        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
        const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

        const filter = {};
        if (typeof status === "string" && status.trim()) {
            filter.status = status.trim();
        }

        if (typeof q === "string" && q.trim()) {
            const term = q.trim();
            filter.$or = [
                { title: { $regex: term, $options: "i" } },
                { description: { $regex: term, $options: "i" } },
            ];
        }

        const tickets = await ticket
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit);

        return res.json(tickets);
    } catch (err) {
        return res.status(500).json({ error: "Error fetching tickets", details: err });
    }
});

app.get("/ticket/view/:id", async (req, res) => {
    const ticketId = req.params.id;
    try {
        const foundTicket = await ticket.findOne({ id: ticketId });
        if (!foundTicket) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        return res.json(foundTicket);
    } catch (err) {
        return res.status(500).json({ error: "Error fetching ticket", details: err });
    }
});

// Delete ticket (required)
app.delete("/ticket/delete/:id", async (req, res) => {
    const ticketId = req.params.id;
    try {
        const result = await ticket.deleteOne({ id: ticketId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        return res.json({ message: "Ticket deleted" });
    } catch (err) {
        return res.status(500).json({ error: "Error deleting ticket", details: err });
    }
});

// Optional convenience: allow delete via JSON body { id }
app.delete("/ticket/delete", async (req, res) => {
    const ticketId = req.body?.id;
    if (typeof ticketId !== "string" || !ticketId.trim()) {
        return res.status(400).json({ error: "id is required" });
    }
    try {
        const result = await ticket.deleteOne({ id: ticketId.trim() });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Ticket not found" });
        }
        return res.json({ message: "Ticket deleted" });
    } catch (err) {
        return res.status(500).json({ error: "Error deleting ticket", details: err });
    }
});

// Backward-compatible routes (kept so existing clients don't break)
app.get("/ticket/all", async (req, res) => {
    try {
        const tickets = await ticket.find().sort({ createdAt: -1 });
        return res.json(tickets);
    } catch (err) {
        return res.status(500).json({ error: "Error fetching tickets", details: err });
    }
});

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