
// ===================================
// RIKON EXAM CENTER - FIREBASE CONFIG
// ===================================

const firebaseConfig = {
    apiKey: "AIzaSyB1pJew4fuLUVHs831pqOQ2lufPgYqrfgM",
    authDomain: "rikon-exam-center.firebaseapp.com",
    projectId: "rikon-exam-center",
    storageBucket: "rikon-exam-center.firebasestorage.app",
    messagingSenderId: "236041859245",
    appId: "1:236041859245:web:788d629ed1baa911f99624",
    measurementId: "G-Q49P9TKC9E"
};


// STUDENT FIREBASE APP (DEFAULT)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();

// ADMIN FIREBASE APP (SEPARATE AUTH SESSION)
const adminApp = firebase.initializeApp(firebaseConfig, "admin");

const adminAuth = adminApp.auth();
const adminDb = adminApp.firestore();
// SHARED FIRESTORE DATABASE
const db = firebase.firestore();
