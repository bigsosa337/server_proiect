const express = require('express');
const router = express.Router(); // Create an Express router instance

const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const db = require('../database');
const secret = 'secretDiscret';

// Define the registration route within the router
router.post('/register', async (req, res) => {
    console.log('YOU ARE USING -POST- METHOD WITH:', req.body);

    let data = req.body;
    console.log(data);
    let emailExist = false;
    const userRef = db.db.collection('users');
    console.log(userRef);

    const snapshot = await userRef.where('email', '==', data.email).get();
    if (!snapshot.empty) {
        emailExist = true;
    }

    if (emailExist) {
        console.log('Email already linked to an account!');
        res.send('Email already linked to an account!');
    } else {
        bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(data.password, salt, async function (err, hash) {
                data.password = hash;
                console.log(data);
                const user = await db.db.collection('users').add(data);
                console.log(`You have successfully registered with id ${user.id}`);
                res.send('Successful registration!');
            });
        });
    }
});

//LOG IN
router.post("/login", async (req, res) => {
    let data = req.body
    let existingUser = false

    const userDb = db.db.collection("users")
    const user = await userDb.where("email", "==", data.email).get()

    if ( user.empty) {
        let response = {}
        response.user = false
        response.message = "No user found"
        res.json(response)
        console.log('utilizatorul nu exista')
    } else {
        existingUser = true
        user.forEach((doc) => {
            bcrypt
                .compare(data.password, doc.data().password, async function(err, result) {
                    console.log(doc.data().password)
                    console.log(data.password + "========================")
                    if (result) {
                        let token = jwt.sign(
                            {
                                email: doc.data().email,
                            },
                            secret,
                            { expiresIn: '1h' }
                        );

                        console.log('tokenul tau este: ', token)
                        let response = {}
                        res.send({token})
                        response.message = "You have access to edit resources for 1 hour"
                    } else {
                        let response = {}
                        response.message = "Wrong password or email"
                        res.json(response)
                        console.log('Wrong password or email address')
                    }
                })
        });
    }


    // res.send(response)

})


// Export the router for use   as m i  d dlewa re
module.exports = router;
