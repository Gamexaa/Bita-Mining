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
  .document("users/{newUserId}") // Trigger when a new document is created in 'users'
  .onCreate(async (snap, context) => {
    const newUserDoc = snap.data();
    const newUserId = context.params.newUserId;

    // 1. Check if the new user has a 'referredBy' field
    const referrerId = newUserDoc.referredBy;

    // 2. Exit if no referrer ID or if it's a self-referral
    if (!referrerId || referrerId === newUserId) {
      console.log(`User ${newUserId} not referred or self-referred.`);
      return null;
    }

    console.log(`Processing referral: New User ${newUserId} referred by ${referrerId}`);

    const db = admin.firestore();
    // 3. Get a reference to the referrer's document
    const referrerRef = db.collection("users").doc(String(referrerId));

    try {
      // 4. Use a transaction for safe update
      await db.runTransaction(async (transaction) => {
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`Referrer user ${referrerId} not found! Cannot update.`);
          return; // Stop transaction if referrer doesn't exist
        }

        // 5. Prepare the update: Increment totalReferrals
        const increment = admin.firestore.FieldValue.increment(1);
        const updateData = {
            totalReferrals: increment
            // Add logic here later for activeReferrals or referralSpeed if needed
            // activeReferrals: admin.firestore.FieldValue.increment(1),
            // referralSpeed: admin.firestore.FieldValue.increment(0.005)
        };

        console.log(`Updating referrer ${referrerId} with:`, { totalReferrals: "+1" });

        // 6. Update the referrer's document within the transaction
        transaction.update(referrerRef, updateData);
      });

      console.log(`Successfully processed referral for ${newUserId} by ${referrerId}.`);
      return null;

    } catch (error) {
      console.error(`Error processing referral transaction for ${newUserId} by ${referrerId}:`, error);
      return null; // Exit on error
    }
  });

// --- END OF FILE index.js ---