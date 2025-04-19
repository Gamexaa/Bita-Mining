const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (only once)
try {
  admin.initializeApp();
} catch (e) {
  console.log("Admin SDK already initialized?");
}


exports.processReferral = functions.firestore
  .document("users/{newUserId}")
  .onCreate(async (snap, context) => {
    const newUserDoc = snap.data();
    const newUserId = context.params.newUserId;

    // Check if the new user has a 'referredBy' field
    const referrerId = newUserDoc.referredBy;

    if (!referrerId || referrerId === newUserId) {
      console.log(`User ${newUserId} was not referred or referred themselves.`);
      return null; // Exit if no valid referrer ID
    }

    console.log(`Processing referral: User ${newUserId} referred by ${referrerId}`);

    const db = admin.firestore();
    const referrerRef = db.collection("users").doc(String(referrerId)); // Ensure ID is string

    try {
      // Use a transaction to safely update the referrer's count and speed
      await db.runTransaction(async (transaction) => {
        const referrerDoc = await transaction.get(referrerRef);

        if (!referrerDoc.exists) {
          console.error(`Referrer user document ${referrerId} not found!`);
          return; // Exit transaction if referrer doesn't exist
        }

        // Increment the total referral count
        const newTotalReferrals = (referrerDoc.data().totalReferrals || 0) + 1;

        // --- Logic for Active Referrals and Referral Speed ---
        // This part needs careful consideration based on your rules.
        // Option 1: Simple increment (assuming all referrals give speed boost initially)
        const baseReferralBoost = 0.005; // Boost per referral
        const newReferralSpeed = (referrerDoc.data().referralSpeed || 0) + baseReferralBoost;
        // You might need more complex logic later to check if the *new* user is active
        // and only then update activeReferrals count and referralSpeed.
        // For now, let's increment total and assume speed boost.
        const newActiveReferrals = (referrerDoc.data().activeReferrals || 0) + 1; // Simple increment for now


        console.log(`Updating referrer ${referrerId}: TotalRefs=${newTotalReferrals}, ActiveRefs=${newActiveReferrals}, RefSpeed=${newReferralSpeed}`);

        // Update the referrer's document within the transaction
        transaction.update(referrerRef, {
          totalReferrals: admin.firestore.FieldValue.increment(1), // Use increment for atomicity
          // Update active referrals and speed based on your chosen logic
          activeReferrals: newActiveReferrals, // Update based on logic
          referralSpeed: newReferralSpeed, // Update based on logic
        });

         // Optional: Update the new user doc to mark referral processed?
         // transaction.update(snap.ref, { referralProcessed: true });
      });

      console.log(`Successfully processed referral for ${newUserId} by ${referrerId}.`);
      return null;

    } catch (error) {
      console.error(`Error processing referral for ${newUserId} by ${referrerId}:`, error);
      // Optional: You could write an error log somewhere or retry logic
      return null;
    }
  });