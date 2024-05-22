const express = require('express');
const router = express.Router(); // Create an Express router instance

const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const db = require('../database');
const secret = 'secretdiscret';

// Define the registration route within the router
router.post('/register', async (req, res) => {
    console.log('YOU ARE USING -POST- METHOD WITH:', req.body);

    const data = req.body;
    console.log(data);
    const userRef = db.db.collection('users');

    try {
        // Check if the email already exists
        const snapshot = await userRef.where('email', '==', data.email).get();
        if (!snapshot.empty) {
            console.log('Email already linked to an account!');
            return res.status(400).send('Email already linked to an account!');
        }

        // Hash the password
        const salt = await bcrypt.genSalt(saltRounds);
        const hash = await bcrypt.hash(data.password, salt);
        data.password = hash;

        // Add the user to the database
        const user = await userRef.add(data);
        console.log(`You have successfully registered with id ${user.id}`);
        res.send('Successful registration!');
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal server error');
    }
});

// Define the login route within the router
router.post('/login', async (req, res) => {
    const data = req.body;
    const userRef = db.db.collection('users');

    try {
        // Check if the user exists
        const snapshot = await userRef.where('email', '==', data.email).get();
        if (snapshot.empty) {
            console.log('No user found');
            return res.status(400).json({ user: false, message: 'No user found' });
        }

        // Get the user document
        let userDoc;
        snapshot.forEach(doc => {
            userDoc = doc;
        });

        // Compare the provided password with the stored hash
        const isPasswordValid = await bcrypt.compare(data.password, userDoc.data().password);
        if (!isPasswordValid) {
            console.log('Wrong password or email');
            return res.status(400).json({ message: 'Wrong password or email' });
        }

        // Generate a JWT token
        const token = jwt.sign(
            { email: userDoc.data().email },
            secret,
            { expiresIn: '1h' }
        );

        console.log('Your token is:', token);
        res.json({ token, message: 'You have access to edit resources for 1 hour' });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).send('Internal server error');
    }
});

// Export the router for use as middleware
module.exports = router;
