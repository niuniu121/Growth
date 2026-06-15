import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCckGb0AorauOQOd-EtbYMDDcZIu9zK5f4",
    authDomain: "growth-os-dbf29.firebaseapp.com",
    projectId: "growth-os-dbf29",
    storageBucket: "growth-os-dbf29.firebasestorage.app",
    messagingSenderId: "357840126482",
    appId: "1:357840126482:web:fcaeb03117c3810a2a4ecb",
    measurementId: "G-496BV5P0X",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;