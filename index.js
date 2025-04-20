const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (only once)
try {
  admin.initializeApp();
} catch (e) {
  // console.log("Admin SDK already initialized?");
}


exports.processReferral = functions.firestore
  .document("users/{newUserId}")
  .onCreate(async (snap, context) => {
    const newUserDoc = snap.data();
    const newUserId = context.params.newUserId;

    // Check if the new user has a 'referredBy' field and it's not self-referral
    const referrerId = newUserDoc.referredBy;

    if (!referrerId || referrerId === newUserId) {
      console.log(`User ${newUserId} was not referred or referred themselves.`);
      return null; // Exit if no valid referrer ID
    }

    console.log(`Processing referral: User ${newUserId} referred by ${referrerId}`);

    const db = admin.firestore();
    // Ensure referrerId is treated as a string for document path consistency
    const referrerRef = db.collection("users").doc(String(referrerId));

    try {
      // Use a transaction to safely update the referrer's count and potentially speed
      await db.runTransaction(async (transaction) => {
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`Referrer user document ${referrerId} not found! Cannot update stats.`);
          return; // Exit transaction if referrer doesn't exist
        }

        // --- Update Referrer Stats ---
        // 1. Increment total referral count using FieldValue.increment for atomicity
        const increment = admin.firestore.FieldValue.increment(1);

        // 2. Logic for Active Referrals & Speed (Needs Your Specific Rules)
        //    For now, let's just increment total count. You'll need to add logic
        //    here later if you want to calculate active referrals or update speed.
        //    Example: Check if the *new* user is considered 'active' based on some criteria.
        //    const isActive = determineIfUserIsActive(newUserDoc);
        //    const activeIncrement = isActive ? increment : admin.firestore.FieldValue.increment(0);
        //    const speedIncrementValue = isActive ? 0.005 : 0; // Example speed boost

        const updateData = {
            totalReferrals: increment
            // activeReferrals: activeIncrement, // Uncomment and adapt if using active logic
            // referralSpeed: admin.firestore.FieldValue.increment(speedIncrementValue) // Uncomment/adapt
        };

        console.log(`Updating referrer ${referrerId} with:`, updateData);

        // Update the referrer's document within the transaction
        transaction.update(referrerRef, updateData);

        // Optional: Mark the new user's document that the referral was processed
        // transaction.update(snap.ref, { referralProcessed: true, processedAt: admin.firestore.FieldValue.serverTimestamp() });
      });

      console.log(`Successfully processed referral for ${newUserId} by ${referrerId}.`);
      return null;

    } catch (error) {
      console.error(`Error processing referral for ${newUserId} by ${referrerId}:`, error);
      // Optional: Log error details for debugging
      // Consider adding retry logic or error reporting
      return null;
    }
  });

// Helper function placeholder (adapt based on your 'active' definition)
// function determineIfUserIsActive(userData) {
//   // Example: User is active if they logged in recently or started mining
//   const lastLogin = userData.lastLogin?.toMillis();
//   const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
//   return !!(lastLogin && lastLogin > oneDayAgo);
// }