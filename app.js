// --- START OF FILE app.js ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing App...");

    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null;
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp;
    let referrerIdFromLink = null;

    // --- DOM Elements (Cache elements after DOM loaded) ---
    const loadingIndicator = document.getElementById('loading-indicator'); // Cache loader
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item');
    const balanceEl = document.getElementById('balance');
    const usdEquivalentEl = document.getElementById('usd-equivalent');
    const activeReferralsEl = document.getElementById('active-referrals');
    const totalReferralsEl = document.getElementById('total-referrals');
    const miningTimerEl = document.getElementById('mining-timer');
    const miningSpeedEl = document.getElementById('mining-speed');
    const miningButton = document.getElementById('mining-button');
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const copyLinkButton = document.getElementById('copy-link-button');
    const boostTaskActionContainer = document.getElementById('boost-task-1-action');
    const homeErrorMessageArea = document.getElementById('error-message-area-home');
    const friendsErrorMessageArea = document.getElementById('error-message-area-friends');
    const boostErrorMessageArea = document.getElementById('error-message-area-boost');
    const debugReferrerDisplay = document.getElementById('debug-referrer-display'); // Cache debug area

    // --- State Variables ---
    let balance = 0.0000;
    let isMining = false;
    let miningInterval = null;
    let timerInterval = null;
    let miningEndTime = 0;
    const MINING_DURATION_MS = 24 * 60 * 60 * 1000;
    let baseMiningSpeed = 0.015;
    let boostSpeed = 0;
    let referralSpeed = 0;
    let totalReferrals = 0;
    let activeReferrals = 0;
    let friends = [];
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0;
    let firebaseInitialized = false;
    let db = null; // Firestore instance

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

    // --- Core Functions ---
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
        // Removed firebaseInitialized/currentUserId check here, assuming it's called only when ready
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
            updateBoostTaskUI(); // Ensure boost UI is also updated
        });
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimer(); // Initial call
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now();
        const timeLeft = miningEndTime > 0 ? miningEndTime - now : 0;
        if (miningTimerEl) miningTimerEl.textContent = formatTime(timeLeft);
        // Stop mining automatically if timer runs out and it was mining
        if (timeLeft <= 0 && isMining) {
            console.log("Timer ended, calling stopMining.");
            stopMining(true); // Save balance
        }
    }

    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;
        friendListContainer.innerHTML = '';
        const friendsToDisplay = friends; // Use state variable
        if (!friendsToDisplay || friendsToDisplay.length === 0) {
            noFriendsMessage.style.display = 'block';
            friendListContainer.style.display = 'none';
        } else {
            noFriendsMessage.style.display = 'none';
            friendListContainer.style.display = 'block';
            friendsToDisplay.forEach(friend => {
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';
                const avatarHTML = friend.photoUrl ? `<img src="${friend.photoUrl}" alt="P" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">` : '<i class="fas fa-user"></i>';
                let joinedText = 'N/A';
                if (friend.joined) { // Assuming friend.joined is a timestamp or Date object
                     try {
                         const joinDate = new Date(friend.joined.toDate ? friend.joined.toDate() : friend.joined); // Handle Firestore Timestamp or JS Date
                         joinedText = `${joinDate.toLocaleString('en-US', { month: 'long', day: 'numeric' })} at ${String(joinDate.getHours()).padStart(2, '0')}:${String(joinDate.getMinutes()).padStart(2, '0')}`;
                     } catch (e) { console.warn("Could not parse friend joined date", friend.joined); }
                }
                const boostGiven = (friend.boostGiven || 0.005).toFixed(3);

                friendEl.innerHTML = `
                    <div class="friend-info"> <div class="friend-avatar">${avatarHTML}</div> <div class="friend-details"> <span class="friend-name">${friend.name || `User...${friend.id?.slice(-4)}`}</span> <span class="friend-joined">${joinedText}</span> </div> </div>
                    <div class="friend-status"> <span class="friend-boost" style="visibility: ${friend.active ? 'visible' : 'hidden'};">+${boostGiven}/h</span> <span class="friend-activity ${friend.active ? 'active' : 'inactive'}">${friend.active ? 'Active' : 'Not active !'}</span> </div>
                `;
                friendListContainer.appendChild(friendEl);
            });
        }
    }

     function updateBoostTaskUI() {
        if (!boostTaskActionContainer) return;
        boostTaskActionContainer.innerHTML = '';
        if (boostTask1Completed) {
            const checkMark = document.createElement('span');
            checkMark.className = 'task-complete-check';
            checkMark.textContent = '✓';
            boostTaskActionContainer.appendChild(checkMark);
        } else {
            const button = document.createElement('button');
            button.id = 'boost-task-1';
            button.className = 'task-button boost-start';
            button.textContent = "Start";
            button.removeEventListener('click', handleBoostTaskClick); // Prevent duplicates
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
        navItems.forEach(item => item.classList.toggle('active', item.dataset.target === targetId));
        if (targetId === 'home-screen') tg?.BackButton.hide(); else tg?.BackButton.show();
        // Update display if needed for the new screen (e.g., if switching to home)
        if(targetId === 'home-screen' && firebaseInitialized && currentUserId) updateDisplay();
    }

     function showErrorMessage(message, screenId = 'home') {
        console.error("UI Error:", message);
        let errorDiv;
        switch(screenId) {
            case 'friends': errorDiv = friendsErrorMessageArea; break;
            case 'boost': errorDiv = boostErrorMessageArea; break;
            case 'home': default: errorDiv = homeErrorMessageArea; break;
        }
        if (errorDiv) {
          errorDiv.textContent = message; errorDiv.style.display = 'block';
          setTimeout(() => { if(errorDiv) errorDiv.style.display = 'none'; }, 5000);
        } else { alert(message); }
    }

    // --- Core Logic Functions ---
    function startBalanceIncrement() {
        if (miningInterval) clearInterval(miningInterval);
        if (!isMining || !currentUserId) return;
        console.log("Starting balance increment...");
        const incrementPerSecond = calculateTotalSpeed() / 3600;
        miningInterval = setInterval(() => {
            if (!isMining) { clearInterval(miningInterval); miningInterval = null; return; }
            balance += incrementPerSecond;
            updateDisplay();
            const now = Date.now();
            if (now - lastBalanceUpdateTime >= 60000) { saveBalanceToFirebase(); lastBalanceUpdateTime = now; }
        }, 1000);
    }

    function saveBalanceToFirebase() {
        if (!currentUserId || !firebaseInitialized || !db || typeof balance !== 'number') return;
        const roundedBalance = parseFloat(balance.toFixed(4));
        console.log(`Saving balance ${roundedBalance}...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance updated.`))
            .catch(error => console.error("Error saving balance:", error));
    }

     function startMining() {
        if (isMining || !currentUserId || !firebaseInitialized || !db) {
            console.warn("Start mining prevented."); return;
        }
        console.log("Attempting to start mining...");
        const newMiningEndTime = Date.now() + MINING_DURATION_MS;
        miningButton.disabled = true; // Disable button immediately
        miningButton.textContent = 'Starting...';

        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(newMiningEndTime)
        }).then(() => {
            console.log("Mining session started in Firestore.");
            isMining = true; miningEndTime = newMiningEndTime; lastBalanceUpdateTime = Date.now();
            updateDisplay(); startTimer(); startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining session:", error);
            showErrorMessage("Mining start failed.", "home");
            isMining = false; miningEndTime = 0; updateDisplay(); // Update UI back
        });
    }

     function stopMining(saveFinalBalance = true) {
        console.log("Stopping mining. Save:", saveFinalBalance);
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null; timerInterval = null;

        const wasMining = isMining;
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(4));
        miningEndTime = 0;
        updateDisplay(); // Update UI state
        if (miningTimerEl) miningTimerEl.textContent = "00:00:00";

        if (currentUserId && firebaseInitialized && db && wasMining) {
            const updateData = { miningEndTime: null };
            if (saveFinalBalance) updateData.balance = finalBalanceToSave;
            console.log("Updating Firestore on stop:", updateData);
            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Firestore updated on stop."))
                .catch(error => console.error("Error updating Firestore on stop:", error));
        }
    }

     function handleBoostTaskClick() {
        if (!currentUserId || !firebaseInitialized || !db) return;
        const boostButton = boostTaskActionContainer?.querySelector('#boost-task-1');
        if (!boostButton || boostButton.disabled || boostTask1Completed) return;
        const currentButtonState = boostButton.textContent;

        if (currentButtonState === "Start") {
            console.log("Boost Task: Start");
            if (tg && tg.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // <<<--- YOUR CHANNEL LINK
                 boostButton.textContent = "Claim";
                 boostButton.classList.replace("boost-start", "boost-claim");
            } else { showErrorMessage("Telegram action not available.", "boost"); }
        } else if (currentButtonState === "Claim") {
            console.log("Boost Task: Claim");
            boostButton.textContent = "Claiming..."; boostButton.disabled = true;
            boostButton.classList.add("boost-claiming");

            const newBoostSpeed = (boostSpeed || 0) + 0.005;
            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true, boostSpeed: newBoostSpeed
            }).then(() => {
                console.log("Boost claimed.");
                boostTask1Completed = true; boostSpeed = newBoostSpeed;
                updateBoostTaskUI(); updateDisplay();
            }).catch(error => {
                console.error("Error claiming boost:", error);
                showErrorMessage("Boost claim failed.", "boost");
                boostButton.textContent = "Claim"; boostButton.disabled = false; // Reset button
                boostButton.classList.remove("boost-claiming"); boostButton.classList.add("boost-claim");
            });
        }
    }

    // --- Firebase & Data Handling ---
     function initFirebase() {
        if (firebaseInitialized) return true;
        console.log("Initializing Firebase...");
        try {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            else firebase.app();
            db = firebase.firestore(); // Initialize db instance
            console.log("Firestore service available.");
            firebaseInitialized = true; return true;
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            firebaseInitialized = false; alert("Critical Error: Could not connect to Firebase."); return false;
        }
    }

    // <<<--- loadUserDataFromFirestore with Robust Loader Hiding ---<<<
     async function loadUserDataFromFirestore() {
        console.log("[LOAD_DATA] Starting function...");

        // Check pre-conditions
        if (!currentUserId || !firebaseInitialized || !db) {
            console.error("[LOAD_DATA] Pre-conditions failed (userId/firebase/db).");
            showErrorMessage("Failed to load data. Restart required.", "home");
             if (loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loader on failure
            return;
        }

        const userRef = db.collection('users').doc(currentUserId);
        console.log(`[LOAD_DATA] Attempting to get: users/${currentUserId}`);

        try {
            console.log("[LOAD_DATA] Before Firestore get()");
            const doc = await userRef.get();
            console.log(`[LOAD_DATA] After Firestore get(). Doc exists: ${doc.exists}`);

            if (doc.exists) {
                const userData = doc.data();
                console.log("[LOAD_DATA] SUCCESS: Processing user data...");
                // Update state... (same as before)
                balance = userData.balance ?? 0;
                miningEndTime = userData.miningEndTime?.toMillis() ?? 0;
                baseMiningSpeed = userData.baseMiningSpeed ?? 0.015;
                boostSpeed = userData.boostSpeed ?? 0;
                referralSpeed = userData.referralSpeed ?? 0;
                totalReferrals = userData.totalReferrals ?? 0;
                activeReferrals = userData.activeReferrals ?? 0;
                boostTask1Completed = userData.boostTask1Completed ?? false;
                // friends = await fetchFriends(); // Fetch friends if needed

                const now = Date.now();
                isMining = (miningEndTime > now);
                console.log("[LOAD_DATA] State updated. Mining:", isMining);

                updateBoostTaskUI(); // Update UI elements
                updateDisplay();
                startTimer(); // Start/update timer
                console.log("[LOAD_DATA] Data processing and UI update complete.");

            } else {
                console.error(`[LOAD_DATA] User document NOT FOUND!`);
                showErrorMessage("User data missing. If new, it should be created shortly.", "home");
                // If the user *should* exist (was just created), this indicates a potential issue.
            }
        } catch (error) {
            console.error("[LOAD_DATA] CATCH ERROR during Firestore get() or processing:", error);
            if (error.code === 'permission-denied') {
                 showErrorMessage("Access Error. Check Firestore Rules.", "home");
            } else {
                 showErrorMessage("Network Error. Could not load data.", "home");
            }
        } finally {
            // --- Ensure loader is ALWAYS hidden ---
            if (loadingIndicator) {
                console.log("[LOAD_DATA] FINALLY: Hiding loading indicator.");
                loadingIndicator.classList.add('hidden');
            } else {
                console.warn("[LOAD_DATA] FINALLY: loadingIndicator element not found!");
            }
            console.log("[LOAD_DATA] Function finished.");
        }
     } // <<<--- END OF loadUserDataFromFirestore ---<<<


    // --- User Login/Registration ---
    async function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId || !firebaseInitialized || !db) {
            console.error("handleFirebaseLoginUsingTMA pre-condition failed."); return Promise.reject("Pre-conditions failed");
        }
        console.log("Handling Firebase login/registration...");
        const userRef = db.collection('users').doc(currentUserId);
        try {
            const doc = await userRef.get();
            if (doc.exists) {
                console.log("User exists. Updating...");
                const updatePayload = { /* ... Same as before ... */
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
                console.log("New user. Creating...");
                console.log("[DEBUG] Checking referrerIdFromLink before creating new user:", referrerIdFromLink);
                const referredByUserId = referrerIdFromLink ? String(referrerIdFromLink) : null;
                console.log("[DEBUG] 'referredBy' field will be set to:", referredByUserId);
                const defaultData = { /* ... Same as before, includes referredBy: referredByUserId ... */
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
                    referredBy: referredByUserId
                };
                await userRef.set(defaultData);
                console.log("New user document created.");
                 if (referredByUserId) { console.warn("REMINDER: Cloud Function needed to update referrer!"); }
            }
            return Promise.resolve(); // Success
        } catch (error) {
            console.error("Error during Firebase login/registration:", error);
            showErrorMessage("Failed to process login.", "home");
            return Promise.reject(error); // Failure
        }
    }


    // --- Event Listeners Setup ---
    function setupEventListeners() { /* ... (Same as previous version) ... */
        console.log("Setting up event listeners...");
        // Clear previous listeners first to prevent duplicates
        navItems.forEach(item => item.removeEventListener('click', handleNavClick));
        if (miningButton) miningButton.removeEventListener('click', handleMiningClick);
        if (copyLinkButton) copyLinkButton.removeEventListener('click', handleCopyLinkClick);
        // Add new listeners
        navItems.forEach(item => item.addEventListener('click', handleNavClick));
        if (miningButton) miningButton.addEventListener('click', handleMiningClick);
        if (copyLinkButton) copyLinkButton.addEventListener('click', handleCopyLinkClick);
        // Boost button listener is managed by updateBoostTaskUI
        console.log("Event listeners attached.");
    }

    // --- Event Handlers ---
    function handleNavClick(event) { /* ... (Same logic) ... */
        const targetId = event.currentTarget.dataset.target; if (targetId) switchScreen(targetId); }
    function handleMiningClick() { /* ... (Same logic) ... */
         if (!isMining) startMining(); else tg?.showPopup({ message: 'Mining session already active!' }); }
     function handleCopyLinkClick() { /* ... (Same logic) ... */
         if (!currentUserId || !isTmaEnvironment) { showErrorMessage("Cannot create link.", "friends"); return; }
         const miniAppShortName = 'Play'; const botUsername = "BitaMiningbot";
         const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;
         console.log("Copying link:", linkToCopy);
         if (tg && tg.clipboardWriteText) { tg.clipboardWriteText(linkToCopy, (ok) => ok ? tg.showPopup({ message: 'Referral link copied!' }) : copyFallback(linkToCopy)); }
         else { copyFallback(linkToCopy); } }
     function copyFallback(text) { /* ... (Same logic) ... */
        navigator.clipboard.writeText(text).then(() => { tg?.showPopup({ message: 'Link copied!' }); alert('Referral link copied!'); })
        .catch(err => showErrorMessage('Could not copy link.', 'friends')); }


    // --- Application Initialization ---
    async function initializeApp() {
        console.log("initializeApp sequence started...");
        if (tg && tg.initData) {
            console.log("TMA Environment detected."); isTmaEnvironment = true; tg.ready();

            // --- Read Referral ID ---
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            console.log(`[DEBUG] Read start_param value: ${referrerIdFromLink || 'None'}`);
            // --- Display for Debug ---
            if (debugReferrerDisplay) { // Check if element exists
                 debugReferrerDisplay.textContent = `Ref ID: ${referrerIdFromLink || 'NONE'}`;
                 debugReferrerDisplay.style.display = 'block'; // Show debug area
            }

            tg.expand(); tg.BackButton.onClick(() => { if (!homeScreen?.classList.contains('active')) switchScreen('home-screen'); }); tg.BackButton.hide();

            currentUserData = tg.initDataUnsafe?.user;
            if (currentUserData?.id) {
                currentUserId = String(currentUserData.id);
                console.log("User ID obtained:", currentUserId);

                if (initFirebase()) { // Initialize Firebase and Firestore instance (db)
                    console.log("Firebase is initialized.");
                    try {
                        await handleFirebaseLoginUsingTMA(currentUserData);
                        console.log("Login/Reg complete. Loading data...");
                        await loadUserDataFromFirestore(); // This will hide loader in 'finally'
                        console.log("Data load complete. Final setup...");
                        setupEventListeners();
                        switchScreen('home-screen');
                        console.log("App setup complete.");
                    } catch (err) {
                        console.error("Error during app setup sequence:", err);
                        showErrorMessage("App initialization failed.", "home");
                         if (loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loader on error
                    }
                } else { // Firebase init failed
                    console.error("Firebase init failed!"); showErrorMessage("Critical Error: Cannot connect.", "home");
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                }
            } else { // No user ID
                console.error("Failed to get User ID."); showErrorMessage("Cannot verify user.", "home");
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
            }
        } else { // Not TMA
            console.error("Not in TMA Environment."); isTmaEnvironment = false;
            document.body.innerHTML = '<div style="padding:20px;text-align:center;"><h1>Access Error</h1><p>Please use Telegram.</p></div>';
            if (loadingIndicator) loadingIndicator.classList.add('hidden');
        }
    } // End initializeApp

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded

// --- END OF FILE app.js ---