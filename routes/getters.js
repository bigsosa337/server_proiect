const express = require('express');
const { storage } = require("../database");
const db = require('../database');
const checkAuthorization = require('../routes/checkAuthorization');
const router = express.Router();

// Utility function to parse query parameters for pagination
const parsePagination = (req) => {
    const limit = parseInt(req.query.limit, 10) || 10;
    const page = parseInt(req.query.page, 10) || 1;
    return { limit, page };
};

// List images for the authenticated user with pagination
// Updated endpoint examples with pagination support

// List images for the authenticated user
router.get('/listImages', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const snapshot = await userImagesRef.orderBy('uploadedAt').offset(offset).limit(Number(limit)).get();

        const filenames = snapshot.docs.map(doc => doc.data().filename.split('/').pop());

        res.json({ images: filenames, hasMore: filenames.length === Number(limit) });
    } catch (error) {
        console.error("Error listing images:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Similar updates should be made to the other endpoints like listSharedImages, searchImages, searchSharedImages, getByTags, and getSharedByTags


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
// Get faces from shared user's images
router.get('/getSharedFaces/:sharedUserId', checkAuthorization, async (req, res) => {
    try {
        const sharedUserId = req.params.sharedUserId;

        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId)
        const doc = await sharedUserImagesRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'User not found'})
        }

        const userData = doc.data();
        const faceThumbnails = userData.faces || [];
        res.status(200).json({ faces: faceThumbnails });
    } catch (error) {
        console.error('Error fetching shared faces:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// Search shared images by face
router.post('/searchSharedByFace/:sharedUserId', checkAuthorization, async (req, res) => {
    try {
        const { face } = req.body; // The face base64 string
        const sharedUserId = req.params.sharedUserId;

        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId).collection('images');
        const snapshot = await sharedUserImagesRef.get();

        const matchingFilenames = [];

        snapshot.forEach(doc => {
            const imageData = doc.data();
            const { faces } = imageData;
            if (faces && faces.includes(face)) {
                matchingFilenames.push(imageData.filename);
            }
        });

        if (matchingFilenames.length === 0) {
            return res.status(404).json({ error: 'No images found for the provided face.' });
        }

        res.json({ images: matchingFilenames });
    } catch (error) {
        console.error('Error searching images by face:', error);
        res.status(500).json({ error: 'Internal Server Error' });
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
// Get image info
router.get('/getImageInfo/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = `images/${req.params.filename}`; // Ensure the filename matches the stored format
        const userId = req.query.sharedUserId || req.user.id; // Use sharedUserId if present, else use the authenticated user's id

        console.log('Filename:', filename, "- User ID:", userId); // Log for debugging

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const imageSnapshot = await userImagesRef.where('filename', '==', filename).get();

        if (imageSnapshot.empty) {
            return res.status(404).json({ error: "Image not found." });
        }

        const imageData = imageSnapshot.docs[0].data();
        console.log('Image data:', imageData)
        res.json({
            filename: imageData.filename,
            title: imageData.title,
            tags: imageData.tags,
            uploadedby: imageData.userEmail,
            uploadedAt: imageData.uploadedAt.toDate()
        });
    } catch (error) {
        console.error("Error retrieving image information:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/getImageInfo/images/:filename', checkAuthorization, async (req, res) => {
    try {
        const filename = `images/${req.params.filename}`; // Ensure the filename matches the stored format
        const userId = req.query.sharedUserId || req.user.id; // Use sharedUserId if present, else use the authenticated user's id

        console.log('Filename:', filename, "- User ID:", userId); // Log for debugging

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



const createSearchTerms = (query) => {
    return query.toLowerCase().split(' ').filter(term => term.trim() !== '');
};

// Search images by title
router.get('/searchImages', checkAuthorization, async (req, res) => {
    try {
        const { query } = req.query;
        const userId = req.user.id;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required.' });
        }

        const searchTerms = createSearchTerms(query);
        console.log('Search Terms:', searchTerms);

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const querySnapshot = await userImagesRef.get();
        const allImages = querySnapshot.docs.map(doc => doc.data());

        const matchedImages = allImages.filter(image =>
            searchTerms.every(term => image.title.toLowerCase().includes(term))
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

        const searchTerms = createSearchTerms(query);
        console.log('Search Terms:', searchTerms);

        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId).collection('images');
        const querySnapshot = await sharedUserImagesRef.get();
        const allImages = querySnapshot.docs.map(doc => doc.data());

        const matchedImages = allImages.filter(image =>
            searchTerms.every(term => image.title.toLowerCase().includes(term))
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
// Get images from thumbnail filename
router.get('/getImageFromThumbnail/:filename', checkAuthorization, async (req, res) => {
    try {
        console.log('Getting image from thumbnail:', req.params.filename);
        const filename = req.params.filename;
        const userId = req.user.id;

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const imageSnapshot = await userImagesRef.where('faces.filename', '==', filename).get();

        if (imageSnapshot.empty) {
            return res.status(404).json({ error: `Image not found. ${filename}` });
        }

        const imageData = imageSnapshot.docs[0].data();

        res.json({
            filename: imageData.filename,
            title: imageData.title,
            tags: imageData.tags
        });
    } catch (error) {
        console.error("Error retrieving image from thumbnail:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
router.post('/searchByFace', checkAuthorization, async (req, res) => {
    try {
        const { face } = req.body; // The face base64 string
        const userId = req.user.id;

        console.log('Received request to search images by face:', face);
        console.log('User ID:', userId);

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const snapshot = await userImagesRef.get();

        const matchingFilenames = [];

        snapshot.forEach(doc => {
            const imageData = doc.data();
            const { faces } = imageData;
            if (faces && faces.includes(face)) {
                matchingFilenames.push(imageData.filename);
            }
        });

        if (matchingFilenames.length === 0) {
            return res.status(404).json({ error: 'No images found for the provided face.' });
        }

        console.log('Matching filenames:', matchingFilenames);

        res.json({ images: matchingFilenames });
    } catch (error) {
        console.error('Error searching images by face:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/searchByFaceDescriptor', checkAuthorization, async (req, res) => {
    try {
        const { descriptor } = req.body;
        const userId = req.user.id;

        console.log('Received request to search images by face descriptor:', descriptor);
        console.log('User ID:', userId);

        const userImagesRef = db.db.collection('users').doc(userId).collection('images');
        const snapshot = await userImagesRef.get();

        const matchingFilenames = [];

        snapshot.forEach(doc => {
            const imageData = doc.data();
            const { faces } = imageData;
            if (faces) {
                faces.forEach(face => {
                    if (faceapi.euclideanDistance(face.descriptor, descriptor) < 0.6) {
                        matchingFilenames.push(imageData.filename);
                    }
                });
            }
        });

        if (matchingFilenames.length === 0) {
            return res.status(404).json({ error: 'No images found for the provided face.' });
        }

        console.log('Matching filenames:', matchingFilenames);

        res.json({ images: matchingFilenames });
    } catch (error) {
        console.error('Error searching images by face descriptor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
