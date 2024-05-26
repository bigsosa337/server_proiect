const express = require('express');
const { storage } = require("../database");
const db = require('../database');
const checkAuthorization = require('../routes/checkAuthorization');
const router = express.Router();

// List images for the authenticated user
router.get('/listImages', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const snapshot = await userImagesRef.get();

        const filenames = snapshot.docs.map(doc => doc.data().filename.split('/').pop());

        res.json({ images: filenames });
    } catch (error) {
        console.error("Error listing images:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// List albums for the authenticated user
router.get('/listAlbums', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userAlbumsRef = db.db.collection('users').doc(userId).collection('albums');
        const snapshot = await userAlbumsRef.get();

        const albums = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json({ albums });
    } catch (error) {
        console.error("Error listing albums:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get image data
router.get('/getImageData/:filename', checkAuthorization, async (req, res) => {
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
router.get('/getImageData/images/:filename', checkAuthorization, async (req, res) => {
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

// Get image info
router.get('/getImageInfo/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = `images/${req.params.filename}`; // Ensure the filename matches the stored format
        const userId = req.user.id;

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const imageSnapshot = await userImagesRef.where('filename', '==', filename).get();

        if (imageSnapshot.empty) {
            return res.status(404).json({ error: "Image not found." });
        }

        const imageData = imageSnapshot.docs[0].data();

        res.json({
            filename: imageData.filename,
            title: imageData.title,
            tags: imageData.tags
        });
    } catch (error) {
        console.error("Error retrieving image information:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Search images by title
router.get('/searchImages', checkAuthorization, async (req, res) => {
    try {
        const { query } = req.query;
        const userId = req.user.id;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const searchTerms = createSearchTerm(query);
        console.log('Search Terms:', searchTerms);

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const querySnapshot = await userImagesRef.get();
        const allImages = querySnapshot.docs.map(doc => doc.data());

        const matchedImages = allImages.filter(image =>
            searchTerms.some(term => image.title.toLowerCase().includes(term))
        );

        const filenames = matchedImages.map(image => image.filename);
        console.log('Final Filenames:', filenames);

        res.json({ images: filenames });
    } catch (error) {
        console.error('Error searching images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Search shared images by title
router.get('/searchSharedImages/:sharedUserId', checkAuthorization, async (req, res) => {
    try {
        const { query } = req.query;
        const sharedUserId = req.params.sharedUserId;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const searchTerms = createSearchTerm(query);
        console.log('Search Terms:', searchTerms);

        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId).collection('images');
        const querySnapshot = await sharedUserImagesRef.get();
        const allImages = querySnapshot.docs.map(doc => doc.data());

        const matchedImages = allImages.filter(image =>
            searchTerms.some(term => image.title.toLowerCase().includes(term))
        );

        const filenames = matchedImages.map(image => image.filename);
        console.log('Final Filenames:', filenames);

        res.json({ images: filenames });
    } catch (error) {
        console.error('Error searching shared images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get images by tags
router.get('/getByTags', checkAuthorization, async (req, res) => {
    try {
        const { tags } = req.query;
        const userId = req.user.id;

        if (!tags) {
            return res.status(400).json({ error: 'Tags are required.' });
        }

        const tagsArray = tags.split(',').map(tag => tag.trim());
        console.log('Tags Array:', tagsArray);

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const imageDetailPromises = tagsArray.map(tag => userImagesRef.where('tags', 'array-contains', tag).get());

        const imageDetailsArray = await Promise.all(imageDetailPromises);

        const filteredFilenames = imageDetailsArray
            .flatMap(querySnapshot => querySnapshot.docs)
            .map(doc => doc.data().filename);

        console.log('Filtered Filenames:', filteredFilenames);
        res.json({ images: filteredFilenames });
    } catch (error) {
        console.error('Error searching images by tags:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get shared images by tags
router.get('/getSharedByTags/:sharedUserId', checkAuthorization, async (req, res) => {
    try {
        const { tags } = req.query;
        const sharedUserId = req.params.sharedUserId;

        if (!tags) {
            return res.status(400).json({ error: 'Tags are required.' });
        }

        const tagsArray = tags.split(',').map(tag => tag.trim());
        console.log('Tags Array:', tagsArray);

        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId).collection('images');
        const imageDetailPromises = tagsArray.map(tag => sharedUserImagesRef.where('tags', 'array-contains', tag).get());

        const imageDetailsArray = await Promise.all(imageDetailPromises);

        const filteredFilenames = imageDetailsArray
            .flatMap(querySnapshot => querySnapshot.docs)
            .map(doc => doc.data().filename);

        console.log('Filtered Filenames:', filteredFilenames);
        res.json({ images: filteredFilenames });
    } catch (error) {
        console.error('Error searching shared images by tags:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get tags
router.get('/getTags', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRef = db.db.collection('users').doc(userId);

        // Fetch the user's tags
        const userTagsSnapshot = await userRef.collection('tags').get();
        const userTags = userTagsSnapshot.docs.map(doc => doc.data().name);

        // Fetch the shared users' tags
        const sharedAlbumsSnapshot = await db.db.collection('users').doc(userId).collection('sharedAlbums').get();
        const sharedUserIds = sharedAlbumsSnapshot.docs.map(doc => doc.data().sharedUserId);

        let sharedTags = [];
        for (const sharedUserId of sharedUserIds) {
            const sharedUserTagsSnapshot = await db.db.collection('users').doc(sharedUserId).collection('tags').get();
            const sharedUserTags = sharedUserTagsSnapshot.docs.map(doc => doc.data().name);
            sharedTags = [...new Set([...sharedTags, ...sharedUserTags])]; // Ensure no duplicates
        }

        const allTags = [...new Set([...userTags, ...sharedTags])]; // Combine and deduplicate

        res.json({ tags: allTags });
    } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Utility functions
function createSearchTerm(query) {
    return query.toLowerCase().split(' ').filter(term => term.trim() !== '');
}

module.exports = router;
