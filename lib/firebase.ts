import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Web config is public by design; firestore.rules is what protects the data.
const app = initializeApp({
  apiKey: 'AIzaSyD8YI6aljtveVy6NX-rCSqpGx_n4eP_AXc',
  authDomain: 'kia-danmu.firebaseapp.com',
  projectId: 'kia-danmu',
  storageBucket: 'kia-danmu.firebasestorage.app',
  messagingSenderId: '955312431317',
  appId: '1:955312431317:web:9deafab79c8a28106c025c',
});

export const db = getFirestore(app);
