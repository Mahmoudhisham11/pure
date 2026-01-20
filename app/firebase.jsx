// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAKiAjYEkQdgkdK31-5oeQ97TTQo5Bo-Iw",
  authDomain: "smartcoffe-b2c5e.firebaseapp.com",
  projectId: "smartcoffe-b2c5e",
  storageBucket: "smartcoffe-b2c5e.firebasestorage.app",
  messagingSenderId: "1014648266797",
  appId: "1:1014648266797:web:374e025080819bf9c958a4"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ✅ قمع تحذيرات Firebase المتعلقة بعدم الاتصال (Offline Mode)
if (typeof window !== "undefined") {
  // حفظ الـ console.error الأصلي
  const originalError = console.error;
  
  // استبدال console.error لتصفية تحذيرات Firebase المتعلقة بعدم الاتصال
  console.error = (...args) => {
    const message = args.join(" ");
    
    // تجاهل تحذيرات Firebase المتعلقة بعدم الاتصال
    if (
      message.includes("Could not reach Cloud Firestore backend") ||
      message.includes("Connection failed") ||
      message.includes("The operation could not be completed") ||
      message.includes("unavailable") ||
      message.includes("Failed to get document because the client is offline") ||
      message.includes("Failed to get") && message.includes("offline") ||
      (message.includes("Firestore") && message.includes("offline mode")) ||
      (message.includes("FirebaseError") && message.includes("offline")) ||
      (message.includes("client is offline"))
    ) {
      // لا نطبع هذا التحذير - النظام يعمل بشكل طبيعي في وضع Offline
      return;
    }
    
    // طباعة باقي الأخطاء بشكل طبيعي
    originalError.apply(console, args);
  };
}

// تفعيل IndexedDB Persistence للعمل Offline
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("✅ Firebase IndexedDB persistence enabled - النظام يعمل الآن Offline");
    })
    .catch((err) => {
      if (err.code === "failed-precondition") {
        // Multiple tabs open, persistence can only be enabled in one tab
        console.info("ℹ️ Multiple tabs detected. Persistence enabled in another tab.");
      } else if (err.code === "unimplemented") {
        // Browser doesn't support all features required
        console.warn("⚠️ Browser doesn't support persistence");
      } else {
        console.error("❌ Error enabling persistence:", err);
      }
    });
}