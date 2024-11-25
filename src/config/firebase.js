const firebaseApp = require ('firebase/app')
const ENV = process.env

const firebaseConfig = {
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MEASSAGING_SENDER_ID,
  appId:ENV.FIREBASE_APP_ID,
  measurementId:ENV.FIREBASE_MEASUREMENT_ID
};
const firebase = firebaseApp.initializeApp(firebaseConfig)
module.exports = firebase;