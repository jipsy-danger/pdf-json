import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCNE8-tpvZiEVz9FQ0nxAWF1sGBymPKAyY",
  authDomain: "pdf-json-4999.firebaseapp.com",
  projectId: "pdf-json-4999",
  storageBucket: "pdf-json-4999.firebasestorage.app",
  messagingSenderId: "1024985804205",
  appId: "1:1024985804205:web:2d4ebbe40dd0ba4cce0524",
  measurementId: "G-MZX5D48H8S"
};


const app =
  initializeApp(firebaseConfig);

export const db =
  getFirestore(app);