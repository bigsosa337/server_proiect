const express = require('express');
const router = express.Router();
const db = require('../database');
const checkAuthorization = require('./checkAuthorization');

router.post('/createAlbum', checkAuthorization, async (req, res) => {
    const { name } = req.body;
    const userId = req.user.id;

    try {
        const album = {
            name: name || 'Untitled Album',
            createdAt: new Date(),
            userId: userId
        };
        await db.db.collection('users').doc(userId).collection('albums').add(album);
        res.json({ message: "Album created successfully." });
    } catch (error) {
        console.error("Error creating album:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
