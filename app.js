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

const {storage} = require("./database"); // Import the Firebase Storage instance
const storageRef = storage;

const upload = multer({
    storage: multer.memoryStorage(), // Use in-memory storage for handling file uploads
});


//this function handles the upload of the image
app.post('/uploadImage', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file selected." });
        }

        // Generate a unique filename for the uploaded file
        const filename = `images/${Date.now()}-${req.file.originalname}`;

        // Extract tags and description from the request body
        const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
        const description = req.body.description || ''; // Set a default empty string if description is not provided
        const title = req.body.title || ''; // Set a default empty string if title is not provided

        // Upload the file to Firebase Storage
        const file = storage.bucket().file(filename);
        await file.save(req.file.buffer);

        // Store image details and metadata in Firestore
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
        // List all files in the 'images' directory
        const [files] = await storage.bucket().getFiles({prefix: 'images/'});

        // Extract the filenames from the list of files
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

        // Check if the file exists in Firebase Storage
        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        // Fetch the metadata associated with the image
        const [metadata] = await file.getMetadata();

        // Set the response content type based on the file type
        res.setHeader('Content-Type', 'image/jpeg'); // Adjust the content type as needed

        // Create a response object that includes both the metadata and the image data
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

        // Check if the file exists in Firebase Storage
        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({ error: "Image not found." });
        }

        // Query Firestore to get the image's metadata
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
