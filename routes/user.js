const express = require('express');
const router = express.Router();
const db = require('../database');
const checkAuthorization = require('./checkAuthorization');

// Get user details
router.get('/getUserDetails', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRef = db.db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        console.log(userDoc)
        console.log("asdasdasdasdasd")
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ user: userDoc.data() });
    } catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Share gallery with another user
router.post('/shareGallery', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const { shareEmail } = req.body;

        const userRef = db.db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }

        // Find the user with whom to share the gallery
        const snapshot = await db.db.collection('users').where('email', '==', shareEmail).get();
        if (snapshot.empty) {
            return res.status(404).json({ error: "User to share with not found" });
        }

        const shareWithUserId = snapshot.docs[0].id;

        // Add shareWithUserId to the sharedWith array of the current user
        const sharedWith = userDoc.data().sharedWith || [];
        if (!sharedWith.includes(shareWithUserId)) {
            sharedWith.push(shareWithUserId);
            await userRef.update({ sharedWith });
        }

        // Add the current user's ID to the sharedWith array of the user to share with
        const shareWithUserRef = db.db.collection('users').doc(shareWithUserId);
        const shareWithUserDoc = await shareWithUserRef.get();
        const sharedWithBy = shareWithUserDoc.data().sharedWithBy || [];
        if (!sharedWithBy.includes(userId)) {
            sharedWithBy.push(userId);
            await shareWithUserRef.update({ sharedWithBy });
        }

        res.json({ message: "Gallery shared successfully." });
    } catch (error) {
        console.error("Error sharing gallery:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Get shared albums
router.get('/getSharedAlbums', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRef = db.db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        const sharedWithMe = userData.sharedWith || [];
        const sharedAlbums = [];

        for (const sharedUserId of sharedWithMe) {
            const sharedUserRef = db.db.collection('users').doc(sharedUserId);
            const sharedUserDoc = await sharedUserRef.get();
            if (sharedUserDoc.exists) {
                sharedAlbums.push({ userId: sharedUserId, email: sharedUserDoc.data().email });
            }
        }

        res.json({ sharedAlbums });
    } catch (error) {
        console.error('Error fetching shared albums:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// List shared images endpoint
// Add a route to fetch shared image filenames
router.get('/listSharedImages', checkAuthorization, async (req, res) => {
    try {
        const sharedWithRef = db.db.collection('sharedAlbums').where('sharedWith', '==', req.user.email);
        const sharedWithSnapshot = await sharedWithRef.get();

        let sharedImages = [];
        sharedWithSnapshot.forEach(doc => {
            const sharedImagesRef = db.db.collection('users').doc(doc.data().owner).collection('images');
            const sharedImagesSnapshot = sharedImagesRef.get();
            sharedImagesSnapshot.forEach(imageDoc => {
                sharedImages.push(imageDoc.data().filename);
            });
        });

        res.json({ images: sharedImages });
    } catch (error) {
        console.error("Error listing shared images:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Add a route to fetch shared albums
router.get('/listSharedAlbums', checkAuthorization, async (req, res) => {
    try {
        const sharedWithRef = db.db.collection('sharedAlbums').where('sharedWith', '==', req.user.email);
        const sharedWithSnapshot = await sharedWithRef.get();

        let sharedAlbums = [];
        sharedWithSnapshot.forEach(doc => {
            sharedAlbums.push({
                owner: doc.data().owner,
                ownerEmail: doc.data().ownerEmail,
            });
        });

        res.json({ sharedAlbums });
    } catch (error) {
        console.error("Error listing shared albums:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/listSharedImages/:userId', checkAuthorization, async (req, res) => {
    try {
        const userId = req.params.userId;
        const snapshot = await db.db.collection('users').doc(userId).collection('images').get();
        const images = snapshot.docs.map(doc => doc.data().filename);
        res.json({ images });
        console.log(images);
    } catch (error) {
        console.error('Error listing shared images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/searchSharedImages/:userId', checkAuthorization, async (req, res) => {
    try {
        const { query, option } = req.query;
        const userId = req.params.userId;
        const snapshot = await db.db.collection('users').doc(userId).collection('images')
            .where(option, '>=', query)
            .where(option, '<=', query + '\uf8ff')
            .get();
        const images = snapshot.docs.map(doc => doc.data().filename);
        res.json({ images });
    } catch (error) {
        console.error('Error searching shared images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/getSharedByTags/:userId', checkAuthorization, async (req, res) => {
    try {
        const { tags } = req.query;
        const userId = req.params.userId;
        const tagsArray = tags.split(',');
        const snapshot = await db.db.collection('users').doc(userId).collection('images')
            .where('tags', 'array-contains-any', tagsArray)
            .get();
        const images = snapshot.docs.map(doc => doc.data().filename);
        res.json({ images });
    } catch (error) {
        console.error('Error getting shared images by tags:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
// Get album images
router.get('/getAlbumImages/:albumId', checkAuthorization, async (req, res) => {
    try {
        const userId = req.user.id;
        const albumId = req.params.albumId;

        // Determine if the album is the user's own or shared
        const isOwnAlbum = (albumId === 'my');
        const targetUserId = isOwnAlbum ? userId : albumId;

        const userRef = db.db.collection('users').doc(targetUserId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }

        const userImagesRef = userRef.collection('images');
        const snapshot = await userImagesRef.get();

        const filenames = snapshot.docs.map(doc => doc.data().filename.split('/').pop());

        res.json({ images: filenames, name: isOwnAlbum ? 'My' : userDoc.data().name });
    } catch (error) {
        console.error("Error fetching album images:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/listSharedImages/:sharedUserId', checkAuthorization, async (req, res) => {
    try {
        const sharedUserId = req.params.sharedUserId;
        const sharedUserImagesRef = db.db.collection('users').doc(sharedUserId).collection('images');
        const snapshot = await sharedUserImagesRef.get();

        const sharedImages = snapshot.docs.map(doc => doc.data().filename);

        res.json({ images: sharedImages });
    } catch (error) {
        console.error('Error listing shared images:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



module.exports = router;
