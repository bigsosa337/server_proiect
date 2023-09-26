const {storage} = require("../database");
const db = require('../database');
const express = require("express");
const router = express.Router(); // Create an Express router instance



router.get('/listImages', async (req, res) => {
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


router.get('/getImageData/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const file = storage.bucket().file(`images/${filename}`);

        const [fileExists] = await file.exists();

        if (!fileExists) {
            return res.status(404).json({error: "Image not found."});
        }

        const fileStream = file.createReadStream();

        res.setHeader('Content-Type', 'image/jpeg'); // Adjust the content type as needed

        fileStream.pipe(res);
    } catch (error) {
        console.error("Error retrieving image data:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});
router.get('/getImageInfo/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;

        const querySnapshot = await db.db.collection("images")
            .where("filename", "==", `images/${filename}`)
            .get();
        console.log(querySnapshot, `images/${filename}`)
        if (querySnapshot.empty) {
            // If no matching documents found, send a 404 response
            return res.status(404).json({error: "Image not found."});
        }

        const imageInfo = querySnapshot.docs[0].data();

        const imageInfoResponse = {
            filename: imageInfo.filename,
            title: imageInfo.title,
            description: imageInfo.description,
            tags: imageInfo.tags,
            // Add other fields as needed
        };

        res.json({imageInfo: imageInfoResponse});
    } catch (error) {
        console.error("Error fetching image information:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});



router.get('/searchImages', async (req, res) => {
    try {
        const {query, option} = req.query;

        if (!query) {
            return res.status(400).json({error: 'Search query is required.'});
        }

        const [files] = await storage.bucket().getFiles({prefix: 'images/'});

        const filenames = files.map((file) => file.name.split('/').pop());

        // fetch image details for all filenames concurrently
        const imageDetailPromises = filenames.map(async (filename) => {
            const imageDetails = await db.db.collection("images")
                .where("filename", "==", `images/${filename}`)
                .get();
            return {filename, imageDetails};
        });

        const imageDetailsArray = await Promise.all(imageDetailPromises);

        // filter the results based on the selected option and query
        const filteredFilenames = imageDetailsArray
            .filter(({imageDetails}) => {
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
            .map(({filename}) => filename);

        res.json({images: filteredFilenames});
    } catch (error) {
        console.error('Error searching images:', error);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

router.get('/getByTags', async (req, res) => {
    try {
        const {tags} = req.query;

        if (!tags) {
            return res.status(400).json({error: 'Tags are required.'});
        }

        const tagsArray = tags.split(',');

        const [files] = await storage.bucket().getFiles({prefix: 'images/'});

        const filenames = files.map((file) => file.name.split('/').pop());

        // fetch image details for all filenames concurrently
        const imageDetailPromises = filenames.map(async (filename) => {
            const imageDetails = await db.db.collection("images")
                .where("filename", "==", `images/${filename}`)
                .get();
            return {filename, imageDetails};
        });

        const imageDetailsArray = await Promise.all(imageDetailPromises);

        // filter the results based on the selected option and query
        const filteredFilenames = imageDetailsArray
            .filter(({imageDetails}) => {
                if (!imageDetails.empty) {
                    const metadata = imageDetails.docs[0].data();

                    // Determine which field to search based on the selected option
                    if (metadata.tags.some((tag) => tagsArray.includes(tag))) {
                        return true;
                    }
                }

                return false;
            })
            .map(({filename}) => filename);

        res.json({images: filteredFilenames});
    } catch (error) {
        console.error('Error searching images:', error);
        res.status(500).json({error: 'Internal Server Error'});
    }
})

// Add this route to your Express.js app
router.get('/getTags', async (req, res) => {
    try {
        const tagsSnapshot = await db.db.collection("tags").get();
        const tags = tagsSnapshot.docs.map(doc => doc.data().tag);
        res.json({tags});
    } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});

module.exports = router
