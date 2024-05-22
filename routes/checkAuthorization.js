const jwt = require('jsonwebtoken');
const db = require('../database');
const secret = 'secretdiscret'; // Ideally, use environment variables to store secrets

const checkAuthorization = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, secret);
        const snapshot = await db.db.collection('users').where('email', '==', decoded.email).get();

        if (snapshot.empty) {
            return res.status(401).json({ error: 'Invalid token or user not found' });
        }

        let userDoc;
        snapshot.forEach(doc => {
            userDoc = doc;
        });

        req.user = { id: userDoc.id, email: decoded.email };
        next();
    } catch (error) {
        console.error('Authorization error:', error);
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

module.exports = checkAuthorization;
