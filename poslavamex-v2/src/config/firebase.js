import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyByIvJpBZv32Zd22fxlYWL9etzBa66Q2rE",
    authDomain: "poslavamex.firebaseapp.com",
    projectId: "poslavamex",
    storageBucket: "poslavamex.firebasestorage.app",
    messagingSenderId: "883264129",
    appId: "1:883264129:web:39a352e2ade3888b4f1b80"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
