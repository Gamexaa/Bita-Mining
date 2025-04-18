// style.jss

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAhUKkVb9RRYzGckeEHaNCR48rOfNS_rXY",
  authDomain: "bita-mining-app.firebaseapp.com",
  projectId: "bita-mining-app",
  storageBucket: "bita-mining-app.firebasestorage.app",
  messagingSenderId: "383835477324",
  appId: "1:383835477324:web:608d418b8114fb2d87abe9",
  measurementId: "G-DBRTWRWSEM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Ye ensure karta hai ki HTML poora load ho jaye fir hi JavaScript chale
document.addEventListener('DOMContentLoaded', () => {

    // --- Element References ---
    // Sabhi screens ko select karte hain
    const screens = document.querySelectorAll('.screen');
    // Sabhi navigation buttons ko select karte hain
    const navButtons = document.querySelectorAll('.nav-button');
    // Mining button ko select karte hain
    const miningButton = document.getElementById('mining-button');
    // Mining button ke neeche wale info text ko select karte hain
    const miningInfoText = document.querySelector('.mining-info'); // Agar isse bhi badalna ho

    // Home screen ke dynamic data elements (Abhi sirf reference, update baad mein)
    const bitaBalanceElement = document.getElementById('bita-balance');
    const usdValueElement = document.getElementById('usd-value');
    const activeReferralsElement = document.getElementById('active-referrals');
    const totalReferralsElement = document.getElementById('total-referrals');
    const miningTimerElement = document.getElementById('mining-timer');
    const miningSpeedElement = document.getElementById('mining-speed');

    // Friends screen ke elements
    const referralCodeElement = document.getElementById('referral-code');
    const friendsCountElement = document.getElementById('friends-count');
    const friendsListElement = document.getElementById('friends-list');
    const copyInviteButton = document.getElementById('copy-invite-button');

    // Boost screen ke elements
    const boostTasksListElement = document.getElementById('boost-tasks-list');

    // --- Telegram Web App Initialization ---
    // Telegram se interaction ke liye WebApp object
    const WebApp = window.Telegram.WebApp;

    // Telegram ko batate hain ki app ready hai (design customizations ke liye)
    WebApp.ready();

    // --- Initial State & Data (Dummy Data) ---
    let isMining = false; // Track karta hai ki mining chal rahi hai ya nahi
    let currentBitaBalance = 0.0000;
    let baseMiningSpeed = 0.015;
    let activeReferrals = 0;
    let totalReferrals = 0;
    // TODO: Add more dummy data or fetch real data later

    // --- Navigation Logic ---
    function setActiveScreen(targetScreenId) {
        // Sabhi screens se 'active' class hatao
        screens.forEach(screen => {
            screen.classList.remove('active');
        });
        // Sabhi nav buttons se 'active' class hatao
        navButtons.forEach(button => {
            button.classList.remove('active');
        });

        // Target screen ko dhundho aur 'active' class lagao
        const targetScreen = document.getElementById(targetScreenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        // Corresponding nav button ko dhundho aur 'active' class lagao
        const targetButton = document.querySelector(`.nav-button[data-target="${targetScreenId}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
    }

    // Har navigation button par click listener lagao
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetScreenId = button.getAttribute('data-target');
            setActiveScreen(targetScreenId);
        });
    });

    // --- Mining Button Logic ---
    miningButton.addEventListener('click', () => {
        if (!isMining) {
            // --- Start Mining ---
            isMining = true;
            miningButton.textContent = 'Mining...';
            miningButton.classList.add('mining-active'); // CSS se style badlega (greyed out)
            miningInfoText.textContent = "Mining session active for 24 hours!"; // Example text change
            // TODO:
            // 1. Start a 24-hour countdown timer display
            // 2. Call Firebase/Backend to record mining start time
            // 3. Start updating balance periodically (or let backend handle it)
            console.log("Mining Started (Simulated)");
        } else {
            // --- Stop Mining (Normally backend karega after 24h, yeh sirf UI simulation) ---
            // Shayad user ko manually stop nahi karne dena hai?
            // Agar 24 ghante baad stop karna hai, toh yeh logic backend/timer se trigger hoga.
            // isMining = false;
            // miningButton.textContent = 'Start Mining';
            // miningButton.classList.remove('mining-active');
            // miningInfoText.textContent = "Start mining every 24 hours!";
            // console.log("Mining Stopped (Simulated)");

            // Abhi ke liye, active state mein click karne par kuch nahi karte
             console.log("Mining is already active.");
             WebApp.showAlert("Mining session is already active!"); // Telegram alert
        }
    });

    // --- Other Button Logic (Example) ---
    if (copyInviteButton) {
        copyInviteButton.addEventListener('click', () => {
            const referralCode = referralCodeElement.textContent; // Get the code from display
            if (navigator.clipboard && referralCode && referralCode !== 'Loading...') {
                navigator.clipboard.writeText(referralCode)
                    .then(() => {
                        WebApp.showAlert(`Referral code "${referralCode}" copied!`); // Telegram alert
                    })
                    .catch(err => {
                        console.error('Failed to copy: ', err);
                        WebApp.showAlert('Could not copy code.');
                    });
            } else {
                 WebApp.showAlert('Referral code not available yet.');
            }
        });
    }

    // --- Initial Setup ---
    // Ensure the home screen is active on load (CSS should handle this, but JS confirms)
    setActiveScreen('home-screen');

    // Display initial dummy data (ya fetch from Telegram/Firebase later)
    bitaBalanceElement.textContent = currentBitaBalance.toFixed(4);
    usdValueElement.textContent = `$${(currentBitaBalance * 4).toFixed(2)}`; // Using your 1 ß = $4 rate
    miningSpeedElement.textContent = baseMiningSpeed.toFixed(3);
    activeReferralsElement.textContent = activeReferrals;
    totalReferralsElement.textContent = totalReferrals;
    referralCodeElement.textContent = "YOUR_CODE"; // Placeholder
    friendsCountElement.textContent = totalReferrals;

    // Example: Get user data from Telegram (if available)
    if (WebApp.initDataUnsafe.user) {
        const user = WebApp.initDataUnsafe.user;
        const greeting = document.getElementById('user-greeting');
        if (greeting) {
            greeting.textContent = `Welcome, ${user.first_name}!`;
        }
        console.log("Telegram User Data:", user);
        // TODO: Send user.id to backend to fetch/create user profile in Firestore
    }

    console.log("Bita Mining App Initialized!");

}); // End DOMContentLoaded
