import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCctnoSbW0UH3-V7-92h3JWnJ9yu_2RE2g",
  authDomain:        "vision-jeans.firebaseapp.com",
  projectId:         "vision-jeans",
  storageBucket:     "vision-jeans.firebasestorage.app",
  messagingSenderId: "203064420647",
  appId:             "1:203064420647:web:f1b724ef75155341bb2102"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
