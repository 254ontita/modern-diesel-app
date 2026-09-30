import { getApp, getApps, initializeApp } from "firebase/app";
// @ts-ignore - Bypasses Firebase's outdated TypeScript definitions for this specific export
import AsyncStorage from "@react-native-async-storage/async-storage";
// @ts-ignore
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

// ⚠️ IMPORTANT: Put your actual real Firebase keys back in here!
const firebaseConfig = {
  apiKey: "AIzaSyD8veFEaoZ_euLq2fSfs63htY0xVlCXuUk",
  authDomain: "modern-diesel-operations.firebaseapp.com",
  projectId: "modern-diesel-operations",
  storageBucket: "modern-diesel-operations.firebasestorage.app",
  messagingSenderId: "74772179697",
  appId: "1:74772179697:web:2954e8e042f7dc3ec75750"
};

const apps = getApps();
let app: any;
let auth: any;
let secondaryApp: any;
let secondaryAuth: any;

// 2. Initialize Default App safely
if (!apps.find(a => a.name === "[DEFAULT]")) {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  app = getApp();
  auth = getAuth(app);
}

// 3. Initialize Secondary App safely
if (!apps.find(a => a.name === "Secondary")) {
  secondaryApp = initializeApp(firebaseConfig, "Secondary");
  secondaryAuth = initializeAuth(secondaryApp, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  secondaryApp = getApp("Secondary");
  secondaryAuth = getAuth(secondaryApp);
}

const db: Firestore = getFirestore(app);

export { auth, db, secondaryAuth };

