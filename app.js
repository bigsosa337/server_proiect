const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const multer = require('multer');
const logger = require('morgan');
const faceapi = require('face-api.js');
const path = require('path');
const canvas = require('canvas');
const db = require("./database");
const checkAuthorization = require('./routes/checkAuthorization');
const auth = require('./routes/auth');
const getters = require('./routes/getters');
const user = require('./routes/user');

const app = express();
const port = 3000;

/**
 * =========================================
 * Middleware
 * =========================================
 */
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(logger('dev'));

// CORS preflight handling
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

/**
 * =========================================
 * Routes
 * =========================================
 */
app.use('/', auth);
app.use('/', getters);
app.use('/', user);

// Initialize the app
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`);
});

/**
 * =========================================
 * Firebase Storage Setup
 * =========================================
 */
const { storage } = require("./database");
const upload = multer({
    storage: multer.memoryStorage()
});

/**
 * =========================================
 * Face API Setup
 * =========================================
 */
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
const loadModels = async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(path.join(__dirname, 'models'));
    await faceapi.nets.faceLandmark68Net.loadFromDisk(path.join(__dirname, 'models'));
    await faceapi.nets.faceRecognitionNet.loadFromDisk(path.join(__dirname, 'models'));
};
loadModels();

/**
 * =========================================
 * Utility Functions
 * =========================================
 */

/**
 * Generates thumbnails for each detected face in the given image buffer.
 * @param {Buffer} imageBuffer - The buffer of the uploaded image file.
 * @returns {Promise<Array>} An array of thumbnail buffers.
 */
const generateFaceThumbnails = async (imageBuffer) => {
    const img = await canvas.loadImage(imageBuffer); // Load the image into a Canvas Image object.
    const canvasImg = canvas.createCanvas(img.width, img.height);
    const ctx = canvasImg.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    // Detect all faces with landmarks and descriptors
    const detections = await faceapi.detectAllFaces(canvasImg)
        .withFaceLandmarks()
        .withFaceDescriptors();

    const thumbnails = [];

    // Create a thumbnail for each detection
    detections.forEach(detection => {
        const { x, y, width, height } = detection.detection.box;
        const faceCanvas = canvas.createCanvas(width, height);
        const faceCtx = faceCanvas.getContext('2d');

        // Draw the face region on the new canvas
        faceCtx.drawImage(canvasImg, x, y, width, height, 0, 0, width, height);

        // Convert the face canvas to a JPEG buffer
        const thumbnailBuffer = faceCanvas.toBuffer('image/jpeg');
        thumbnails.push(thumbnailBuffer);
    });

    return thumbnails.map(thumb => thumb.toString('base64')); // Convert each buffer to a base64 string
};

/**
 * =========================================
 * API Endpoints
 * =========================================
 */

// Endpoint to get face thumbnails
app.post('/getFaceThumbnails', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file uploaded." });
        }

        const thumbnails = await generateFaceThumbnails(req.file.buffer);
        res.json(thumbnails.map((thumb, index) => ({ id: index, thumbnail: thumb })));
    } catch (error) {
        console.error("Error generating face thumbnails:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Endpoint to upload an image
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
            faces: [],  // Initialize faces as an empty array
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
            userId: userId,
            userEmail: userEmail
        };

        try {
            const thumbnails = await generateFaceThumbnails(req.file.buffer);
            await storeFaceThumbnails(thumbnails, userId, filename); // Assuming filename as imageId for simplicity
            imageDetails.faces = thumbnails; // Store thumbnails if found
        } catch (error) {
            console.log("No faces detected in the image.");
        }

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

/**
 * Stores face thumbnails in the Firestore database.
 * @param {Array} thumbnails - The array of face thumbnail buffers.
 * @param {string} userId - The ID of the user uploading the image.
 * @param {string} fileName - The name of the image file.
 */
const storeFaceThumbnails = async (thumbnails, userId, fileName) => {
    const userDocRef = db.db.collection('users').doc(userId);

    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
        throw new Error('User not found.');
    }

    const userData = userDoc.data();
    const existingFaces = userData.faces || [];

    const newFaces = thumbnails.map((thumbnail, index) => ({
        id: `face_${existingFaces.length + index}`,
        thumbnail: thumbnail.toString('base64'),
        filename: fileName
    }));

    await userDocRef.update({
        faces: admin.firestore.FieldValue.arrayUnion(...newFaces)
    });
};

// Endpoint to update image metadata
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

// Endpoint to delete an image
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

        // Fetch the image metadata from the Firestore database
        const imageMetadata = await db.db.collection("users").doc(userId).collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const firestoreDoc = imageMetadata.docs[0];
        const imageData = firestoreDoc.data();
        const imageTags = imageData.tags;

        // Delete the image metadata
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

        // Fetch the user's document to update the faces array
        const userDocRef = db.db.collection('users').doc(userId);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const userData = userDoc.data();
        const existingFaces = userData.faces || [];

        // Remove faces associated with the deleted image
        const updatedFaces = existingFaces.filter(face => face.filename !== `images/${filename}`);

        // Update the user's document with the new faces array
        await userDocRef.update({
            faces: updatedFaces
        });

        res.json({ message: "Image and its faces deleted successfully." });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Endpoint to wipe user data
app.delete('/wipeUserData', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRef = db.db.collection('users').doc(userId);

        // Delete user images
        const imagesSnapshot = await userRef.collection('images').get();
        imagesSnapshot.forEach(async (doc) => {
            await doc.ref.delete();
        });

        // Delete user tags
        const tagsSnapshot = await userRef.collection('tags').get();
        tagsSnapshot.forEach(async (doc) => {
            await doc.ref.delete();
        });

        // Delete user faces
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({ faces: [] });
        }

        // Optionally delete other collections/documents related to the user
        // ...

        res.json({ message: "User data wiped successfully." });
    } catch (error) {
        console.error("Error wiping user data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Endpoint to duplicate an image
app.post('/duplicateImage/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
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
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const originalMetadata = imageMetadata.docs[0].data();

        // create a new document in Firestore with the duplicated filename and original metadata
        const duplicatedImageDetails = {
            filename: duplicatedFilename,
            title: originalMetadata.title,
            description: originalMetadata.description,
            tags: originalMetadata.tags,
        };

        await db.db.collection("images").add(duplicatedImageDetails);

        res.json({ message: "Image duplicated successfully." });
    } catch (error) {
        console.error("Error duplicating image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = app;
module.exports = db;
