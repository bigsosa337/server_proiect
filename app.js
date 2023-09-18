//imports
const cors = require('cors');
const express = require('express');
const app = express();
const port = 3000;
const multer = require('multer');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken')
const serverSecret = 'secretdiscret'
const logger = require('morgan'); //importing a HTTP logger
let db = require("./database")
// const firebase = require("firebase/compat");

app.use(express.urlencoded({extended: false}))
app.use(express.json()) //we expect JSON data to be sent as payloads
app.use(cors())
app.use(logger('dev')); //using the HTTP logger library

//initializing app
app.listen(port, () => {
    console.log(`Example app listening on port ${port}!`)
});

const {storage} = require("./database"); // import the Firebase Storage instance
const storageRef = storage;

const upload = multer({
    storage: multer.memoryStorage(), // Uue in-memory storage for handling file uploads
});


//this function handles the upload of the image
app.post('/uploadImage', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file selected." });
        }

        let filename = `images/${Date.now()}-${req.file.originalname}`;
        filename = filename.split('.')
        filename.pop();
        console.log('-------------------------')
        console.log(filename, typeof filename)
        console.log('-------------------------')
        filename = filename.join(".");

        const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
        const description = req.body.description || '';
        const title = req.body.title || '';

        const file = storage.bucket().file(filename);
        await file.save(req.file.buffer);

        const imageDetails = {
            filename: filename,
            title: title,
            description: description,
            tags: tags,
            // Add other image-related details as needed
        };

        const result = await db.db.collection("images").add(imageDetails);

        res.json({ message: "Image uploaded successfully." });
    } catch (error) {
        console.error("Error uploading image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


//this function gets all the images from the database
app.get('/listImages', async (req, res) => {
    try {
        const [files] = await storage.bucket().getFiles({prefix: 'images/'});

        const filenames = files.map((file) => file.name.split('/').pop());

        res.json({images: filenames});
    } catch (error) {
        console.error("Error listing images:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});


//this function gets a single image images from the database
app.get('/getImage/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const [metadata] = await file.getMetadata();

        res.setHeader('Content-Type', 'image/jpeg'); // Adjust the content type as needed

        const response = {
            metadata,
            imageStream: file.createReadStream(),
        };

        res.json(response);
    } catch (error) {
        console.error("Error retrieving image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/getImageDetails/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const imageMetadata = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const metadata = imageMetadata.docs[0].data();

        // Include the URL to the image in the metadata
        metadata.imageUrl = file.publicUrl();

        res.json(metadata);
    } catch (error) {
        console.error("Error retrieving image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/getImageWithDetails/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const [metadata] = await file.getMetadata();

        const imageMetadata = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const firestoreMetadata = imageMetadata.docs[0].data();

        const combinedMetadata = {
            ...metadata,
            ...firestoreMetadata,
        };

        combinedMetadata.imageUrl = file.publicUrl();

        res.json(combinedMetadata);
    } catch (error) {
        console.error("Error retrieving image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/getImageData/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const fileStream = file.createReadStream();

        res.setHeader('Content-Type', 'image/jpeg'); // Adjust the content type as needed

        fileStream.pipe(res);
    } catch (error) {
        console.error("Error retrieving image data:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/getImage1/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        const fileStream = file.createReadStream();

        res.setHeader('Content-Type', 'image/jpeg'); // Adjust the content type as needed

        fileStream.pipe(res);
    } catch (error) {
        console.error("Error retrieving image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/getImageInfo/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        const querySnapshot = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();
        console.log(querySnapshot, `images/${filename}`)
        if (querySnapshot.empty) {
            // If no matching documents found, send a 404 response
            return res.status(404).json({ error: "Image not found." });
        }

        const imageInfo = querySnapshot.docs[0].data();

        const imageInfoResponse = {
            filename: imageInfo.filename,
            title: imageInfo.title,
            description: imageInfo.description,
            tags: imageInfo.tags,
            // Add other fields as needed
        };

        res.json({ imageInfo: imageInfoResponse });
    } catch (error) {
        console.error("Error fetching image information:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Delete an image
app.delete('/deleteImage/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        // Delete the image file from Firebase Storage
        await file.delete();

        // Delete the image metadata from the Firestore database
        const imageMetadata = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const firestoreDoc = imageMetadata.docs[0];
        await firestoreDoc.ref.delete();

        res.json({ message: "Image deleted successfully." });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Duplicate an image
app.post('/duplicateImage/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        // Create a new unique filename for the duplicate
        const duplicatedFilename = `images/${Date.now()}-${filename}`;

        // Copy the image file to the new filename in Firebase Storage
        await file.copy(duplicatedFilename);

        // Fetch the metadata of the original image from Firestore
        const imageMetadata = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();

        if (imageMetadata.empty) {
            return res.status(404).json({ error: "Image metadata not found." });
        }

        const originalMetadata = imageMetadata.docs[0].data();

        // Create a new document in Firestore with the duplicated filename and original metadata
        const duplicatedImageDetails = {
            filename: duplicatedFilename,
            title: originalMetadata.title,
            description: originalMetadata.description,
            tags: originalMetadata.tags,
        };

        const result = await db.db.collection("images").add(duplicatedImageDetails);

        res.json({ message: "Image duplicated successfully." });
    } catch (error) {
        console.error("Error duplicating image:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// Modify your server code to handle search
app.get('/searchImages', async (req, res) => {
    try {
        const { query, option } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const [files] = await storage.bucket().getFiles({ prefix: 'images/' });

        const filenames = files.map((file) => file.name.split('/').pop());

        // Fetch image details for all filenames concurrently
        const imageDetailPromises = filenames.map(async (filename) => {
            const imageDetails = await db.db.collection("images")
                .where("filename", "==", `images/${filename}`)
                .get();
            return { filename, imageDetails };
        });

        const imageDetailsArray = await Promise.all(imageDetailPromises);

        // Filter the results based on the selected option and query
        const filteredFilenames = imageDetailsArray
            .filter(({ imageDetails }) => {
                if (!imageDetails.empty) {
                    const metadata = imageDetails.docs[0].data();

                    // Determine which field to search based on the selected option
                    if (option === 'title' && metadata.title.includes(query)) {
                        return true;
                    }
                    if (option === 'description' && metadata.description.includes(query)) {
                        return true;
                    }
                    // Add more conditions for other options as needed
                }

                return false;
            })
            .map(({ filename }) => filename);

        res.json({ images: filteredFilenames });
    } catch (error) {
        console.error('Error searching images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


//routes
app.post('/testCollection', async (req, res) => {
    let testScript = {}
    testScript.title = req.body.title;
    testScript.description = req.body.description;
    const result = await db.db.collection("test").add(testScript);
    setTimeout(function () {
        res.json({message: result.id});
    }, 1500)
});


module.exports = app;
module.exports = db;
