const {
    initializeApp,
    cert,
} = require("firebase-admin/app");
const {
    getFirestore,
} = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage"); // Import Firebase Storage

const serviceAccount = require("./firebase_config/firebase_key.json");

const firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: "gs://test-f14f1.appspot.com" // Replace with your actual Storage bucket name
});

const db = getFirestore(); // This is the reference to the Firestore database
const storage = getStorage(firebaseApp); // Initialize Firebase Storage with the app instance

module.exports = { db, storage }; // Export both Firestore and Storage
