// --- START OF FILE app.js ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing App...");

    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null;
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp;
    let referrerIdFromLink = null; // Will hold the ID from ?start= parameter

    // --- DOM Elements Cache ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const appContainer = document.querySelector('.app-container'); // Main container
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item');
    const copyLinkButton = document.getElementById('copy-link-button'); // Button for friends screen

    // Home Screen Elements
    const balanceEl = document.getElementById('balance');
    const usdEquivalentEl = document.getElementById('usd-equivalent');
    const activeReferralsEl = document.getElementById('active-referrals');
    const totalReferralsEl = document.getElementById('total-referrals');
    const miningTimerEl = document.getElementById('mining-timer');
    const miningSpeedEl = document.getElementById('mining-speed');
    const miningButton = document.getElementById('mining-button');
    const homeErrorMessageArea = document.getElementById('error-message-area-home');

    // Friends Screen Elements
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const friendsErrorMessageArea = document.getElementById('error-message-area-friends');

    // Boost Screen Elements
    const boostTaskActionContainer = document.getElementById('boost-task-1-action');
    const boostErrorMessageArea = document.getElementById('error-message-area-boost');

    // --- State Variables ---
    let balance = 0.0000;
    let isMining = false;
    let miningInterval = null;
    let timerInterval = null;
    let miningEndTime = 0;
    const MINING_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    let baseMiningSpeed = 0.015;
    let boostSpeed = 0;
    let referralSpeed = 0; // Updated by backend based on active referrals
    let totalReferrals = 0; // Updated by backend Cloud Function
    let activeReferrals = 0; // Needs logic based on friend activity
    let friends = []; // Populated by fetching data
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0;
    let firebaseInitialized = false;

    // --- Firebase Configuration ---
    const firebaseConfig = {
      apiKey: "AIzaSyAhUKkVb9RRYzGckeEHaNCR48rOfNS_rXY",
      authDomain: "bita-mining-app.firebaseapp.com",
      projectId: "bita-mining-app",
      storageBucket: "bita-mining-app.appspot.com",
      messagingSenderId: "383835477324",
      appId: "1:383835477324:web:608d418b8114fb2d87abe9",
      measurementId: "G-DBRTWRWSEM"
    };

    // --- Helper Functions ---
    function formatBalance(num) { return (typeof num === 'number' ? num.toFixed(4) : '0.0000'); }
    function calculateUsdEquivalent(betaBalance) { const rate = 4.00; return (typeof betaBalance === 'number' ? (betaBalance * rate).toFixed(2) : '0.00'); }
    function calculateTotalSpeed() { return (baseMiningSpeed || 0) + (boostSpeed || 0) + (referralSpeed || 0); }
    function formatTime(ms) {
        if (ms <= 0) return "00:00:00";
        let totalSeconds = Math.floor(ms / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // --- UI Update Functions ---
    function updateDisplay() {
        if (!firebaseInitialized || !currentUserId) return;
        requestAnimationFrame(() => {
            const totalSpeed = calculateTotalSpeed();
            if (balanceEl) balanceEl.textContent = formatBalance(balance);
            if (usdEquivalentEl) usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
            if (miningSpeedEl) miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;
            if (activeReferralsEl) activeReferralsEl.textContent = activeReferrals;
            if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;
            if (miningButton) {
                miningButton.textContent = isMining ? 'Mining...' : 'Start Mining';
                miningButton.disabled = isMining;
            }
            if (friendsTotalCountEl) friendsTotalCountEl.textContent = `${totalReferrals} users`;
            renderFriendList();
        });
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimer(); // Immediate update
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now();
        const timeLeft = miningEndTime > 0 ? Math.max(0, miningEndTime - now) : 0; // Ensure non-negative
        if (miningTimerEl) miningTimerEl.textContent = formatTime(timeLeft);
        if (timeLeft <= 0 && isMining) {
            console.log("Timer ended. Stopping mining.");
            stopMining(true); // Auto-stop and save
        }
    }

    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;
        friendListContainer.innerHTML = ''; // Clear
        // TODO: Fetch friends data from Firestore where 'referredBy' == currentUserId
        const friendsToDisplay = friends; // Using placeholder for now
        if (!friendsToDisplay || friendsToDisplay.length === 0) {
            noFriendsMessage.style.display = 'block';
            friendListContainer.style.display = 'none';
        } else {
            noFriendsMessage.style.display = 'none';
            friendListContainer.style.display = 'block';
            friendsToDisplay.forEach(friend => { /* ... (friend item creation logic from previous CSS) ... */ });
        }
    }

    function updateBoostTaskUI() {
        if (!boostTaskActionContainer) return;
        boostTaskActionContainer.innerHTML = ''; // Clear previous
        if (boostTask1Completed) {
            const checkMark = document.createElement('span');
            checkMark.className = 'task-complete-check';
            checkMark.textContent = '✓';
            boostTaskActionContainer.appendChild(checkMark);
        } else {
            const button = document.createElement('button');
            button.id = 'boost-task-1';
            button.className = 'task-button boost-start'; // Default to Start
            button.textContent = "Start";
            button.removeEventListener('click', handleBoostTaskClick); // Ensure no duplicates
            button.addEventListener('click', handleBoostTaskClick);
            boostTaskActionContainer.appendChild(button);
        }
    }

    function switchScreen(targetId) {
        console.log("Switching screen to:", targetId);
        let foundScreen = false;
        screens.forEach(screen => {
            const isActive = screen.id === targetId;
            screen.classList.toggle('active', isActive);
            if(isActive) foundScreen = true;
        });

        if (!foundScreen) {
            console.warn(`Target screen "${targetId}" not found! Defaulting to home.`);
            document.getElementById('home-screen')?.classList.add('active');
            targetId = 'home-screen';
        }

        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });

        // Toggle visibility of the fixed copy button based on screen
        if (copyLinkButton) {
            copyLinkButton.style.display = (targetId === 'friends-screen') ? 'block' : 'none';
        }

        if (targetId === 'home-screen') {
            tg?.BackButton.hide();
            updateDisplay(); // Refresh home data
        } else {
            tg?.BackButton.show();
        }
    }

    function showErrorMessage(message, screenId = 'home', isNonBlocking = false) {
        console.error("UI Error:", message);
        let errorDiv;
        // Find the error area for the currently active screen or default to home
        const activeScreen = document.querySelector('.screen.active');
        if (activeScreen) {
            errorDiv = activeScreen.querySelector('.error-message');
        }
        errorDiv = errorDiv || homeErrorMessageArea; // Fallback to home error area

        if (errorDiv) {
          errorDiv.textContent = message;
          errorDiv.style.display = 'block';
          if (!isNonBlocking) { // Hide automatically only if non-blocking
             setTimeout(() => { if(errorDiv) errorDiv.style.display = 'none'; }, 5000);
          }
        } else {
            alert(message); // Ultimate fallback
        }
    }

    // --- Core Logic: Mining, Balance ---
    function startBalanceIncrement() {
        if (miningInterval) clearInterval(miningInterval);
        if (!isMining || !currentUserId) return;
        console.log("Starting balance increment...");
        const incrementPerSecond = calculateTotalSpeed() / 3600;
        miningInterval = setInterval(() => {
            if (!isMining) { clearInterval(miningInterval); miningInterval = null; return; }
            balance += incrementPerSecond;
            updateDisplay(); // Update UI frequently
            const now = Date.now();
            if (now - lastBalanceUpdateTime >= 60000) { // Save approx every 60s
                saveBalanceToFirebase();
                lastBalanceUpdateTime = now;
            }
        }, 1000);
    }

    function saveBalanceToFirebase() {
        if (!currentUserId || !firebaseInitialized || typeof balance !== 'number') return;
        const db = firebase.firestore();
        const roundedBalance = parseFloat(balance.toFixed(4));
        console.log(`Saving balance ${roundedBalance} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance updated.`))
            .catch(error => console.error("Error updating balance:", error));
    }

    function startMining() {
        if (isMining || !currentUserId || !firebaseInitialized) { console.warn("Start mining prevented."); return; }
        const db = firebase.firestore();
        console.log("Attempting to start mining...");
        const newMiningEndTime = Date.now() + MINING_DURATION_MS;
        miningButton.disabled = true; // Disable button immediately
        miningButton.textContent = 'Starting...';

        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(newMiningEndTime)
        }).then(() => {
            console.log("Mining session started in Firestore.");
            isMining = true;
            miningEndTime = newMiningEndTime;
            lastBalanceUpdateTime = Date.now(); // Reset save timer
            updateDisplay(); // Update button text to 'Mining...'
            startTimer();
            startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining in Firestore:", error);
            showErrorMessage("Mining start failed. Try again.", "home");
            isMining = false; // Rollback state
             miningEndTime = 0;
            updateDisplay(); // Reset button text/state
        });
    }

    function stopMining(saveFinalBalance = true) {
        console.log("Stopping mining. Save:", saveFinalBalance);
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;
        const wasMining = isMining;
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(4));
        miningEndTime = 0;
        updateDisplay(); // Update UI (button text, etc.)
        if (miningTimerEl) miningTimerEl.textContent = "00:00:00";

        if (currentUserId && firebaseInitialized && wasMining) {
            const db = firebase.firestore();
            const updateData = { miningEndTime: null };
            if (saveFinalBalance) {
                updateData.balance = finalBalanceToSave;
                console.log(`Saving final balance ${finalBalanceToSave}`);
            }
            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Mining session stopped in Firestore."))
                .catch(error => console.error("Error stopping mining in Firestore:", error));
        }
    }

    // --- Boost Task Logic ---
    function handleBoostTaskClick() {
        if (!currentUserId || !firebaseInitialized) return;
        const db = firebase.firestore();
        const boostButton = boostTaskActionContainer?.querySelector('#boost-task-1');
        if (!boostButton || boostButton.disabled || boostTask1Completed) return;
        const currentButtonState = boostButton.textContent;

        if (currentButtonState === "Start") {
            console.log("Boost Task: Start");
            if (tg?.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // <<<--- UPDATE YOUR LINK
                 boostButton.textContent = "Claim";
                 boostButton.className = 'task-button boost-claim';
            } else { showErrorMessage("Telegram action not available.", "boost"); }
        } else if (currentButtonState === "Claim") {
            console.log("Boost Task: Claim");
            boostButton.textContent = "Claiming...";
            boostButton.disabled = true;
            boostButton.className = 'task-button boost-claiming'; // Use specific class

            // !!! Server-side validation recommended !!!
            const newBoostSpeed = (boostSpeed || 0) + 0.005;
            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true,
                boostSpeed: newBoostSpeed
            }).then(() => {
                console.log("Boost claimed successfully.");
                boostTask1Completed = true; boostSpeed = newBoostSpeed;
                updateBoostTaskUI(); updateDisplay();
            }).catch(error => {
                console.error("Error claiming boost:", error);
                showErrorMessage("Boost claim failed.", "boost");
                // Reset button carefully
                 updateBoostTaskUI(); // Re-render UI based on state (will show Start/Claim again)
                 const btn = boostTaskActionContainer?.querySelector('#boost-task-1');
                 if(btn) {
                    btn.disabled = false; // Re-enable
                    btn.textContent = "Claim"; // Ensure it says Claim if not completed
                    btn.className = 'task-button boost-claim';
                 }
            });
        }
    }

    // --- Firebase Initialization ---
    function initFirebase() {
        if (firebaseInitialized) return true;
        console.log("Initializing Firebase...");
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
                console.log("Firebase initialized successfully.");
            } else {
                firebase.app(); console.log("Using existing Firebase app instance.");
            }
            firebase.firestore(); // Check Firestore
            console.log("Firestore service is available.");
            firebaseInitialized = true; return true;
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            firebaseInitialized = false;
            alert("Critical Error: Could not connect to services."); return false;
        }
    }

    // --- Data Loading ---
    async function loadUserDataFromFirestore() {
        const loader = document.getElementById('loading-indicator');
        console.log("[LOAD_DATA] Function started. Loader found:", !!loader);
        if (!currentUserId || !firebaseInitialized) {
            console.error("[LOAD_DATA] Cannot load: No user ID or Firebase init failed.");
            showErrorMessage("Failed to load user data. Restart app.", "home");
            if (loader) { console.log("[LOAD_DATA] Hiding loader (early exit)."); loader.classList.add('hidden'); }
            return;
        }
        console.log("[LOAD_DATA] Attempting DB connection...");
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);
        console.log(`[LOAD_DATA] Attempting to get userRef: users/${currentUserId}`);

        try {
            console.log("[LOAD_DATA] BEFORE userRef.get()");
            const doc = await userRef.get();
            console.log("[LOAD_DATA] AFTER userRef.get(). Doc exists:", doc.exists);

            if (doc.exists) {
                const userData = doc.data();
                console.log("[LOAD_DATA] SUCCESS: User doc exists. Processing data...");
                balance = userData.balance ?? 0;
                miningEndTime = userData.miningEndTime?.toMillis() ?? 0;
                baseMiningSpeed = userData.baseMiningSpeed ?? 0.015;
                boostSpeed = userData.boostSpeed ?? 0;
                referralSpeed = userData.referralSpeed ?? 0;
                totalReferrals = userData.totalReferrals ?? 0;
                activeReferrals = userData.activeReferrals ?? 0;
                boostTask1Completed = userData.boostTask1Completed ?? false;
                // friends = await fetchFriends(); // Placeholder

                const now = Date.now();
                isMining = (miningEndTime > now);
                console.log("[LOAD_DATA] State updated. Mining:", isMining);

                updateBoostTaskUI(); updateDisplay(); startTimer();
                console.log("[LOAD_DATA] Initial UI updated.");
            } else {
                console.error(`[LOAD_DATA] User document ${currentUserId} NOT FOUND!`);
                showErrorMessage("User data error. Contact support.", "home");
            }
        } catch (error) {
            console.error("[LOAD_DATA] CATCH ERROR loading user data:", error);
            if (error.code === 'permission-denied') { showErrorMessage("Data access error.", "home"); }
            else { showErrorMessage("Failed to load data.", "home"); }
        } finally {
            if (loader) { console.log("[LOAD_DATA] FINALLY: Hiding loader."); loader.classList.add('hidden'); }
            else { console.warn("[LOAD_DATA] FINALLY: Loader not found!"); }
            console.log("[LOAD_DATA] Function finished.");
        }
    }

    // --- User Login/Registration ---
    async function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId || !firebaseInitialized) { console.error("Login check failed."); return Promise.reject("Prerequisites failed"); }
        console.log("Handling Firebase login/registration...");
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                console.log("Existing user found.");
                const updatePayload = {
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    firstName: tmaUserData.first_name || doc.data().firstName || null,
                    username: tmaUserData.username || doc.data().username || null,
                    photoUrl: tmaUserData.photo_url || doc.data().photoUrl || null,
                    isPremium: tmaUserData.is_premium ?? false,
                    languageCode: tmaUserData.language_code || 'en',
                };
                await userRef.update(updatePayload);
                console.log("Existing user updated.");
            } else {
                console.log("New user detected.");
                // Re-check start_param *just before* creating user data for robustness
                const currentStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
                console.log("[DEBUG] Re-checking start_param before creating user:", currentStartParam);
                const referredByUserId = currentStartParam ? String(currentStartParam) : null; // Use re-checked value
                console.log("[DEBUG] Final referredBy value for new user:", referredByUserId);

                const defaultData = {
                    telegramId: currentUserId,
                    firstName: tmaUserData.first_name || null,
                    username: tmaUserData.username || null,
                    photoUrl: tmaUserData.photo_url || null,
                    isPremium: tmaUserData.is_premium ?? false,
                    languageCode: tmaUserData.language_code || 'en',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    balance: 0.0000, miningEndTime: null, baseMiningSpeed: 0.015,
                    boostSpeed: 0, referralSpeed: 0, totalReferrals: 0,
                    activeReferrals: 0, boostTask1Completed: false,
                    referredBy: referredByUserId // Save the possibly re-checked ID
                };
                await userRef.set(defaultData);
                console.log("New user document created.");
                if (referredByUserId) {
                    console.log(`User ${currentUserId} referred by ${referredByUserId}.`);
                    console.warn("REMINDER: Deploy Cloud Function to update referrer's count!");
                }
            }
            // Indicate success (important for initializeApp's .then())
            return Promise.resolve();
        } catch (error) {
            console.error("Error during Firebase login/registration:", error);
            showErrorMessage("Login failed. Please restart.", "home");
            return Promise.reject(error); // Propagate error
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");
        navItems.forEach(item => { // Use named function for clarity and removal
            item.removeEventListener('click', handleNavClick);
            item.addEventListener('click', handleNavClick);
        });
        if (miningButton) {
            miningButton.removeEventListener('click', handleMiningClick);
            miningButton.addEventListener('click', handleMiningClick);
        }
        if (copyLinkButton) {
            copyLinkButton.removeEventListener('click', handleCopyLinkClick);
            copyLinkButton.addEventListener('click', handleCopyLinkClick);
        }
        // Boost button listener is added/removed in updateBoostTaskUI
        console.log("Event listeners attached.");
    }

    // --- Event Handlers ---
    function handleNavClick(event) { const targetId = event.currentTarget.dataset.target; if (targetId) switchScreen(targetId); }
    function handleMiningClick() { if (!isMining) startMining(); else tg?.showPopup({ message: 'Mining session already active!' }); }
    function handleCopyLinkClick() {
        if (!currentUserId || !isTmaEnvironment) { showErrorMessage("Cannot create link.", "friends"); return; }
        const miniAppShortName = 'Play'; // <<< CONFIRM
        const botUsername = "BitaMiningbot"; // <<< CONFIRM
        const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;
        console.log("Copying link:", linkToCopy);
        if (tg?.clipboardWriteText) {
            tg.clipboardWriteText(linkToCopy, (ok) => ok ? tg.showPopup({ message: 'Referral link copied!' }) : copyFallback(linkToCopy));
        } else { copyFallback(linkToCopy); }
    }
    function copyFallback(text) {
        navigator.clipboard.writeText(text).then(() => {
            tg?.showPopup({ message: 'Link copied!' }); alert('Referral link copied!');
        }).catch(err => showErrorMessage('Could not copy link.', 'friends'));
    }

    // --- Application Initialization ---
    function initializeApp() {
        console.log("initializeApp called...");
        const loader = document.getElementById('loading-indicator'); // Get loader early

        // Hide loader function to be called in error paths or finally
        const hideLoader = () => {
            if (loader && !loader.classList.contains('hidden')) {
                 console.log("Hiding loader.");
                 loader.classList.add('hidden');
            }
        };

        if (tg?.initData) {
            console.log("TMA Environment detected.");
            isTmaEnvironment = true;
            tg.ready();

            // Read start_param right after ready
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            console.log(`[INIT] Read start_param: ${referrerIdFromLink || 'NONE'}`);

            tg.expand();
            tg.BackButton.onClick(() => { if (!document.getElementById('home-screen')?.classList.contains('active')) switchScreen('home-screen'); });
            tg.BackButton.hide();

            currentUserData = tg.initDataUnsafe?.user;
            if (currentUserData?.id) {
                currentUserId = String(currentUserData.id);
                console.log("User ID obtained:", currentUserId);

                if (initFirebase()) {
                     console.log("Firebase initialized. Starting login/data load...");
                     handleFirebaseLoginUsingTMA(currentUserData)
                         .then(() => {
                              console.log("Login/registration successful. Loading user data...");
                              return loadUserDataFromFirestore(); // Load data after successful login/creation
                         })
                         .then(() => {
                              console.log("Data loaded. Setting up UI and listeners.");
                              setupEventListeners();
                              switchScreen('home-screen'); // Show home screen first
                              // Timer is started within loadUserDataFromFirestore
                              console.log("App setup complete.");
                              // Loader is hidden inside loadUserDataFromFirestore's finally block
                         })
                         .catch(err => {
                              console.error("Error during app setup sequence:", err);
                              showErrorMessage("App setup failed. Please restart.", "home");
                              hideLoader(); // Ensure loader hides on setup error
                         });
                } else {
                     console.error("Firebase initialization failed!");
                     showErrorMessage("Critical Error: Service connection failed.", "home");
                     hideLoader(); // Hide loader if Firebase fails to init
                }
            } else {
                console.error("Failed to get User ID from Telegram.");
                showErrorMessage("Cannot verify user. Please restart.", "home");
                hideLoader(); // Hide loader if no user ID
            }
        } else {
            console.error("Not in TMA Environment or SDK failed.");
            isTmaEnvironment = false;
            document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Access Error</h1><p>Please open this app inside Telegram.</p></div>';
            hideLoader(); // Hide loader if not TMA
        }
    }

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded

// --- END OF FILE app.js ---