import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjtZ4aTqvGKhptmaw3UTBujBuzImhov60",
  authDomain: "clinic-doctor-1432f.firebaseapp.com",
  projectId: "clinic-doctor-1432f",
  storageBucket: "clinic-doctor-1432f.firebasestorage.app",
  messagingSenderId: "329209483630",
  appId: "1:329209483630:web:fb8da958fcca2782b9f17f",
  measurementId: "G-HWFTP9S4RG"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  addDoc,
  getDoc,
  getDocs,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp
};
