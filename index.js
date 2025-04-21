// --- START OF FILE index.js (in functions folder) ---

const functions = require("firebase-functions");
const admin = require("firebase-admin");

try { if (admin.apps.length === 0) { admin.initializeApp(); } } catch (e) { console.error("Admin SDK init error:", e); }

exports.processReferral = functions.firestore
  .document("users/{newUserId}")
  .onCreate(async (snap, context) => {
    const newUserDoc = snap.data();
    const newUserId = context.params.newUserId;
    const referrerId = newUserDoc.referredBy;

    if (!referrerId || referrerId === newUserId) { console.log(`User ${newUserId} not referred.`); return null; }
    console.log(`Processing referral: New User ${newUserId} referred by ${referrerId}`);

    const db = admin.firestore();
    const referrerRef = db.collection("users").doc(String(referrerId));

    try {
      await db.runTransaction(async (transaction) => {
        const referrerDoc = await transaction.get(referrerRef);
        if (!referrerDoc.exists) { console.error(`Referrer ${referrerId} not found!`); return; }

        const increment = admin.firestore.FieldValue.increment(1);
        // TODO: Add logic for activeReferrals and referralSpeed if needed
        const updateData = { totalReferrals: increment };
        console.log(`Updating referrer ${referrerId} with:`, { totalReferrals: "+1" });
        transaction.update(referrerRef, updateData);
      });
      console.log(`Success: Processed referral for ${newUserId} by ${referrerId}.`);
      return null;
    } catch (error) { console.error(`Error processing referral for ${newUserId} by ${referrerId}:`, error); return null; }
  });
// --- END OF FILE index.js ---