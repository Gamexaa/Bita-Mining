// --- START OF FILE index.js (in functions folder) ---

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (only once)
try {
  if (admin.apps.length === 0) { // Check if already initialized
       admin.initializeApp();
  }
} catch (e) {
  console.error("Admin SDK initialization error:", e);
}


exports.processReferral = functions.firestore
  .document("users/{newUserId}") // Trigger jab 'users' collection mein naya document bane
  .onCreate(async (snap, context) => {
    const newUserDoc = snap.data();
    const newUserId = context.params.newUserId;

    // Check karo ki naye user ke data mein 'referredBy' field hai ya nahi
    const referrerId = newUserDoc.referredBy;

    // Agar referrer ID nahi hai, ya user ne khud ko refer kiya, toh kuch mat karo
    if (!referrerId || referrerId === newUserId) {
      console.log(`User ${newUserId} not referred or self-referred.`);
      return null;
    }

    console.log(`Processing referral: New User ${newUserId} referred by ${referrerId}`);

    const db = admin.firestore();
    // Referrer user ka document reference banao (ID string honi chahiye)
    const referrerRef = db.collection("users").doc(String(referrerId));

    try {
      // Transaction use karo taaki count update safe ho
      await db.runTransaction(async (transaction) => {
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`Referrer user ${referrerId} not found! Cannot update.`);
          return; // Referrer nahi mila toh transaction se bahar
        }

        // Referrer ka totalReferrals count 1 se badhao
        const increment = admin.firestore.FieldValue.increment(1);

        // Yahan aap future mein active referral aur speed ka logic add kar sakte hain
        const updateData = {
            totalReferrals: increment
            // activeReferrals: admin.firestore.FieldValue.increment(1), // Example: Simple increment for active
            // referralSpeed: admin.firestore.FieldValue.increment(0.005) // Example: Add speed
        };

        console.log(`Updating referrer ${referrerId} with:`, { totalReferrals: "+1" }); // Log the intended update

        // Referrer ke document ko transaction mein update karo
        transaction.update(referrerRef, updateData);
      });

      console.log(`Successfully processed referral for ${newUserId} by ${referrerId}.`);
      return null;

    } catch (error) {
      console.error(`Error processing referral for ${newUserId} by ${referrerId}:`, error);
      return null;
    }
  });

// --- END OF FILE index.js ---