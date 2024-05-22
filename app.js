//imports
const cors = require('cors');
const express = require('express');
const app = express();
const port = 3000;
const admin = require('firebase-admin');
const multer = require('multer');
const jwt = require('jsonwebtoken')
const serverSecret = 'secretdiscret'
const logger = require('morgan'); //importing a HTTP logger
let db = require("./database")
const sharp = require('sharp');
const checkAuthorization = require('./routes/checkAuthorization');


app.use(express.urlencoded({extended: false}))
app.use(express.json()) //we expect JSON data to be sent as payloads
app.use(cors())
app.use(logger('dev')); //using the HTTP logger library

//import auth component
const auth = require('./routes/auth');
app.use('/', auth);

//import all the getters
const getters = require('./routes/getters');
app.use('/', getters);

const user = require('./routes/user');
app.use('/', user);

//initializing app
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
});

const {storage} = require("./database"); // import the Firebase Storage instance

const upload = multer({
    storage: multer.memoryStorage(), // Uue in-memory storage for handling file uploads
});



//this function handles the upload of the image
app.post('/uploadImage', checkAuthorization, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file selected." });
        }

        const userId = req.user.id;
        const userEmail = req.user.email;

        let filename = `images/${Date.now()}-${req.file.originalname}`;

        const tags = Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(tag => tag.trim());
        const title = req.body.title || '';

        const file = storage.bucket().file(filename);
        await file.save(req.file.buffer);

        const imageDetails = {
            filename: filename,
            title: title,
            tags: tags,
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: userId,
            userEmail: userEmail
        };

        const userRef = db.db.collection('users').doc(userId);
        const userImagesRef = userRef.collection('images');
        await userImagesRef.add(imageDetails);

        // Add tags to user's tags collection
        const userTagsRef = userRef.collection('tags');
        const batch = db.db.batch();

        for (const tag of tags) {
            const tagDocRef = userTagsRef.doc(tag);
            batch.set(tagDocRef, { name: tag }, { merge: true });
        }

        await batch.commit();

        res.json({ message: "Image uploaded successfully." });
    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.post('/uploadFilteredImage', checkAuthorization, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({error: "No image file selected."});
        }

        // Apply filter to the image
        let image = sharp(req.file.buffer);
        console.log(req.body.filter)
        switch (req.body.filter) {
            case 'evening':
                image = image.modulate({brightness: 0.8});
                break;
            case 'incbrightness':
                image = image.modulate({brightness: 1.3});
                break;
            case 'greyscale':
                image = image.grayscale();
                break;
            case 'invert':
                image = image.linear(-1, 255)
                break;
            default:
                break;
        }
        const filteredImageBuffer = await image.toBuffer();

        let filename = `images/${Date.now()}-${req.file.originalname}`;
        filename = filename.split('.')
        filename.pop();
        filename = filename.join(".");

        const tags = Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',');
        const description = req.body.description || '';
        const title = req.body.title || '';

        const file = storage.bucket().file(filename);
        await file.save(filteredImageBuffer); // Save the filtered image

        const imageDetails = {
            filename: filename,
            title: title,
            description: description,
            tags: tags,
            // Add other image-related details as needed
        };

        const result = await db.db.collection("images").add(imageDetails);

        const tagExists = await db.db.collection("tags").get();
        const existingTags = tagExists.docs.map(doc => doc.data().tag);

        for (const tag of tags) {
            if (!existingTags.includes(tag)) {
                await db.db.collection("tags").add({tag: tag});
            }
        }

        res.json({message: "Image uploaded successfully."});
    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});


app.patch('/updateImage/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = req.params.filename;
        const userId = req.user.id; // Assuming checkAuthorization middleware adds user info to req.user
        const file = storage.bucket().file(`images/${filename}`);
        const query = db.db.collection("users").doc(userId).collection("images").where("filename", "==", `images/${filename}`);
        const snapshot = await query.get();

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const imageInfo = {
            title: req.body.title || '',
            description: req.body.description || '',
            tags: Array.isArray(req.body.tags) ? req.body.tags : [],
        };

        const updatePromises = snapshot.docs.map(async (doc) => {
            // Get the existing tags
            const existingTags = doc.data().tags || [];

            // Compare existing tags with new tags
            const removedTags = existingTags.filter(tag => !imageInfo.tags.includes(tag));
            const addedTags = imageInfo.tags.filter(tag => !existingTags.includes(tag));

            // Update the document with the new data
            await doc.ref.update(imageInfo);

            // Remove tags that were removed from the image
            const removeTagPromises = removedTags.map(async (tag) => {
                const tagQuery = await db.db.collection("tags")
                    .where("tag", "==", tag)
                    .get();

                if (!tagQuery.empty) {
                    const tagDoc = tagQuery.docs[0];
                    await tagDoc.ref.delete();
                }
            });

            // Add new tags to the tag collection
            const addTagPromises = addedTags.map(async (tag) => {
                const tagExistsQuery = await db.db.collection("tags")
                    .where("tag", "==", tag)
                    .get();

                if (tagExistsQuery.empty) {
                    await db.db.collection("tags").add({ tag: tag });
                }
            });

            // Await all remove and add tag promises
            await Promise.all([...removeTagPromises, ...addTagPromises]);
        });

        // Await all update promises
        await Promise.all(updatePromises);

        res.json({ message: "Image updated successfully." });
    } catch (error) {
        console.error("Error updating image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// Delete an image
app.delete('/deleteImage/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = req.params.filename;
        const userId = req.user.id; // Assuming checkAuthorization middleware adds user info to req.user
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        // Delete the image file from Firebase Storage
        await file.delete();

        // Delete the image metadata from the Firestore database
        const imageMetadata = await db.db.collection("users").doc(userId).collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        // Get the tags associated with the image being deleted
        const imageTags = imageMetadata.docs[0].data().tags;

        // Delete the image metadata
        const firestoreDoc = imageMetadata.docs[0];
        await firestoreDoc.ref.delete();

        // Check if there are any other images with the same tags
        const imagesWithTagsQuery = await db.db.collection("users").doc(userId).collection("images")
            .where("tags", "array-contains-any", imageTags)
            .get();

        // If no other images have the same tags, remove the tags from the tag collection
        if (imagesWithTagsQuery.empty) {
            for (const tag of imageTags) {
                const tagQuery = await db.db.collection("tags")
                    .where("tag", "==", tag)
                    .get();

                if (!tagQuery.empty) {
                    const tagDoc = tagQuery.docs[0];
                    await tagDoc.ref.delete();
                }
            }
        }

        res.json({ message: "Image deleted successfully." });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});



// Duplicate an image
app.post('/duplicateImage/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({error: "Image not found."});
        }

        // create a new unique filename for the duplicate
        const duplicatedFilename = `images/${Date.now()}-${filename}`;

        // copy the image file to the new filename in Firebase Storage
        await file.copy(duplicatedFilename);

        // fetch the metadata of the original image from Firestore
        const imageMetadata = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({error: "Image metadata not found."});
        }

        const originalMetadata = imageMetadata.docs[0].data();

        // create a new document in Firestore with the duplicated filename and original metadata
        const duplicatedImageDetails = {
            filename: duplicatedFilename,
            title: originalMetadata.title,
            description: originalMetadata.description,
            tags: originalMetadata.tags,
        };

        const result = await db.db.collection("images").add(duplicatedImageDetails);

        res.json({message: "Image duplicated successfully."});
    } catch (error) {
        console.error("Error duplicating image:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});

module.exports = app;
module.exports = db;
