// --- START OF FILE app.js ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded. Initializing App...");

    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null;
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp;
    let referrerIdFromLink = null;

    // --- DOM Elements ---
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
    const loadingIndicator = document.getElementById('loading-indicator'); // Cache loader

    // --- State Variables ---
    let balance = 0.000000; // 6 decimal places
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
    let friends = []; // Friend data will be fetched later
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

    // --- Core Functions ---
    function formatBalance(num) { return (typeof num === 'number' ? num.toFixed(6) : '0.000000'); } // 6 decimals
    function calculateUsdEquivalent(betaBalance) { const rate = 4.00; return (typeof betaBalance === 'number' ? (betaBalance * rate).toFixed(2) : '0.00'); }
    function calculateTotalSpeed() { return (baseMiningSpeed || 0) + (boostSpeed || 0) + (referralSpeed || 0); }
    function formatTime(ms) {
        if (ms <= 0) return "00:00:00";
        let totalSeconds = Math.max(0, Math.floor(ms / 1000)); // Ensure non-negative
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
            renderFriendList(); // Update friend list UI
        });
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimer(); // Update immediately
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now();
        const timeLeft = miningEndTime > 0 ? miningEndTime - now : 0;
        if (miningTimerEl) miningTimerEl.textContent = formatTime(timeLeft);
        if (timeLeft <= 0 && isMining) {
            console.log("Timer ended, stopping mining session.");
            stopMining(true); // Save balance
        }
    }

    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;
        friendListContainer.innerHTML = ''; // Clear

        // TODO: Fetch actual friend data here using Firestore query
        const friendsToDisplay = friends; // Using state variable for now

        if (!friendsToDisplay || friendsToDisplay.length === 0) {
            noFriendsMessage.textContent = "No friends..."; // Set text here
            noFriendsMessage.style.display = 'block';
            friendListContainer.style.display = 'none';
        } else {
            noFriendsMessage.style.display = 'none';
            friendListContainer.style.display = 'block';
            friendsToDisplay.forEach(friend => {
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';
                const avatarHTML = friend.photoUrl ? `<img src="${friend.photoUrl}" alt="P" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'; this.remove();">` : '<i class="fas fa-user"></i>';
                let joinedText = 'N/A';
                 if (friend.joined?.toDate) { // Check if it's a Firestore Timestamp
                    const joinDate = friend.joined.toDate();
                    joinedText = `${joinDate.toLocaleString('en-US', { month: 'long', day: 'numeric' })} at ${String(joinDate.getHours()).padStart(2, '0')}:${String(joinDate.getMinutes()).padStart(2, '0')}`;
                } else if (typeof friend.joined === 'number') { // Handle potential number timestamp
                     const joinDate = new Date(friend.joined);
                     joinedText = `${joinDate.toLocaleString('en-US', { month: 'long', day: 'numeric' })} at ${String(joinDate.getHours()).padStart(2, '0')}:${String(joinDate.getMinutes()).padStart(2, '0')}`;
                 }

                const boostGiven = (friend.boostGiven || 0.005).toFixed(3);
                friendEl.innerHTML = `
                    <div class="friend-info">
                        <div class="friend-avatar">${avatarHTML}</div>
                        <div class="friend-details">
                            <span class="friend-name">${friend.name || `User...${friend.id?.slice(-4)}`}</span>
                            <span class="friend-joined">${joinedText}</span>
                        </div>
                    </div>
                    <div class="friend-status">
                        <span class="friend-boost" style="visibility: ${friend.active ? 'visible' : 'hidden'};">+${boostGiven}/h</span>
                        <span class="friend-activity ${friend.active ? 'active' : 'inactive'}">
                            ${friend.active ? 'Active' : 'Not active !'}
                        </span>
                    </div>
                `;
                friendListContainer.appendChild(friendEl);
            });
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
            button.className = 'task-button boost-start';
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
            console.warn(`Screen "${targetId}" not found! Defaulting home.`);
            screens[0]?.classList.add('active'); // Fallback to first screen (home)
            targetId = screens[0]?.id || 'home-screen';
        }

        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });

        if (targetId === 'home-screen') {
            tg?.BackButton.hide();
            updateDisplay(); // Refresh home data
        } else {
            tg?.BackButton.show();
        }
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
          errorDiv.textContent = message;
          errorDiv.style.display = 'block';
          setTimeout(() => { if(errorDiv) errorDiv.style.display = 'none'; }, 5000);
        } else { alert(message); }
    }


    // --- Core Logic ---
    function startBalanceIncrement() {
        if (miningInterval) clearInterval(miningInterval);
        if (!isMining || !currentUserId) return;

        console.log("Starting balance increment...");
        const incrementPerSecond = calculateTotalSpeed() / 3600;

        miningInterval = setInterval(() => {
            if (!isMining) { clearInterval(miningInterval); miningInterval = null; return; }
            balance += incrementPerSecond;
            updateDisplay(); // Update UI every second

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
        const roundedBalance = parseFloat(balance.toFixed(6)); // Save 6 decimals
        console.log(`Saving balance ${roundedBalance} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance (${roundedBalance}) updated.`))
            .catch(error => console.error("Error updating balance:", error));
    }

     function startMining() {
        if (isMining || !currentUserId || !firebaseInitialized) {
            console.warn("Start mining prevented."); return;
        }
        const db = firebase.firestore();
        console.log("Attempting to start mining...");
        const newMiningEndTime = Date.now() + MINING_DURATION_MS;

        miningButton.disabled = true; // Disable button immediately
        miningButton.textContent = "Starting...";

        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(newMiningEndTime)
        }).then(() => {
            console.log("Mining session started in Firestore.");
            isMining = true;
            miningEndTime = newMiningEndTime;
            lastBalanceUpdateTime = Date.now();
            updateDisplay(); // Update UI (button text etc.)
            startTimer();
            startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining session:", error);
            showErrorMessage("Mining start failed. Try again.", "home");
            isMining = false; // Rollback state
            miningEndTime = 0;
            if (miningButton) { // Re-enable button
                miningButton.textContent = 'Start Mining';
                miningButton.disabled = false;
            }
        });
    }

     function stopMining(saveFinalBalance = true) {
        console.log("Attempting to stop mining. Save:", saveFinalBalance);
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null; timerInterval = null;

        const wasMining = isMining;
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(6)); // 6 decimals
        miningEndTime = 0;

        updateDisplay(); // Update UI immediately
        if (miningTimerEl) miningTimerEl.textContent = "00:00:00";

        if (currentUserId && firebaseInitialized && wasMining) {
            const db = firebase.firestore();
            const updateData = { miningEndTime: null };
            if (saveFinalBalance) updateData.balance = finalBalanceToSave;
            console.log("Updating Firestore on stop:", updateData);
            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Firestore updated on stop."))
                .catch(error => console.error("Error updating Firestore on stop:", error));
        }
    }

    // --- Boost Task Handler ---
     function handleBoostTaskClick() {
        if (!currentUserId || !firebaseInitialized) return;
        const db = firebase.firestore();
        const boostButton = boostTaskActionContainer?.querySelector('#boost-task-1');
        if (!boostButton || boostButton.disabled || boostTask1Completed) return;

        const currentButtonState = boostButton.textContent;

        if (currentButtonState === "Start") {
            console.log("Boost Task: Start");
            if (tg && tg.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // <<<--- UPDATE LINK IF NEEDED
                 boostButton.textContent = "Claim";
                 boostButton.classList.replace("boost-start", "boost-claim");
            } else { showErrorMessage("Telegram action not available.", "boost"); }
        } else if (currentButtonState === "Claim") {
            console.log("Boost Task: Claim");
            boostButton.textContent = "Claiming...";
            boostButton.disabled = true;
            boostButton.classList.add("boost-claiming");

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
                showErrorMessage("Boost claim failed. Try again.", "boost");
                if(boostButton){ // Re-enable button if still exists
                    boostButton.textContent = "Claim";
                    boostButton.disabled = false;
                    boostButton.classList.remove("boost-claiming");
                    boostButton.classList.add("boost-claim");
                }
            });
        }
    }

    // --- Firebase & Data ---
     function initFirebase() {
        if (firebaseInitialized) return true;
        console.log("Initializing Firebase...");
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            } else { firebase.app(); }
            firebase.firestore(); // Check availability
            console.log("Firebase initialized successfully.");
            firebaseInitialized = true;
            return true;
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            firebaseInitialized = false;
            alert("Critical Error: Could not connect to services."); // Blocking alert
            return false;
        }
    }

     async function loadUserDataFromFirestore() { // Final refined version
        console.log("[LOAD_DATA] Function started.");
        if (!currentUserId || !firebaseInitialized) {
            console.error("[LOAD_DATA] Cannot load: User ID or Firebase missing.");
            showErrorMessage("Failed to load data. Please restart.", "home");
            return; // Exit
        }
        console.log("[LOAD_DATA] Attempting DB connection for user:", currentUserId);
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);
        let success = false; // Flag to track if data processing was successful

        try {
            console.log("[LOAD_DATA] BEFORE userRef.get()");
            const doc = await userRef.get();
            console.log("[LOAD_DATA] AFTER userRef.get(). Doc exists:", doc.exists);

            if (doc.exists) {
                const userData = doc.data();
                console.log("[LOAD_DATA] SUCCESS: Processing data...");
                // Update state
                balance = userData.balance ?? 0;
                miningEndTime = userData.miningEndTime?.toMillis() ?? 0;
                baseMiningSpeed = userData.baseMiningSpeed ?? 0.015;
                boostSpeed = userData.boostSpeed ?? 0;
                referralSpeed = userData.referralSpeed ?? 0;
                totalReferrals = userData.totalReferrals ?? 0;
                activeReferrals = userData.activeReferrals ?? 0;
                boostTask1Completed = userData.boostTask1Completed ?? false;
                // friends = await fetchFriends(); // TODO: Fetch friends

                // Check mining status
                const now = Date.now();
                isMining = (miningEndTime > now);
                console.log("[LOAD_DATA] State updated. Mining:", isMining);

                // Update UI
                updateBoostTaskUI(); updateDisplay(); startTimer();
                console.log("[LOAD_DATA] UI updated successfully.");
                success = true; // Mark as success
            } else {
                console.error(`[LOAD_DATA] User doc ${currentUserId} NOT FOUND!`);
                showErrorMessage("User data not found. Restart app.", "home");
            }
        } catch (error) {
            console.error("[LOAD_DATA] CATCH ERROR loading data:", error);
            showErrorMessage(`Load failed: ${error.code || error.message}`, "home");
        } finally {
            // ALWAYS hide loader, regardless of success or error
            if (loadingIndicator) {
                console.log("[LOAD_DATA] FINALLY: Hiding loader.");
                loadingIndicator.classList.add('hidden');
            } else { console.warn("[LOAD_DATA] Loader not found in finally block."); }
            console.log("[LOAD_DATA] Function finished. Success:", success);
        }
     } // End loadUserDataFromFirestore

    // --- User Login/Registration ---
    async function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId || !firebaseInitialized) return Promise.reject("Prerequisites failed"); // Return a rejected promise
        console.log("Handling Firebase login/registration...");
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                console.log("User exists. Updating...");
                const updatePayload = { /* ... payload from previous version ... */
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
                console.log("[DEBUG] NEW_USER: referrerIdFromLink:", referrerIdFromLink); // Log ID just before use
                const referredByUserId = referrerIdFromLink ? String(referrerIdFromLink) : null;
                console.log("[DEBUG] NEW_USER: referredBy field value:", referredByUserId);
                const defaultData = { /* ... payload from previous version ... */
                    telegramId: currentUserId,
                    firstName: tmaUserData.first_name || null,
                    username: tmaUserData.username || null,
                    photoUrl: tmaUserData.photo_url || null,
                    isPremium: tmaUserData.is_premium ?? false,
                    languageCode: tmaUserData.language_code || 'en',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    balance: 0.000000, // 6 decimals
                    miningEndTime: null,
                    baseMiningSpeed: 0.015,
                    boostSpeed: 0,
                    referralSpeed: 0,
                    totalReferrals: 0,
                    activeReferrals: 0,
                    boostTask1Completed: false,
                    referredBy: referredByUserId // Save referrer ID
                };
                await userRef.set(defaultData);
                console.log("New user created.");
                if (referredByUserId) {
                    console.log(`User ${currentUserId} referred by ${referredByUserId}.`);
                    console.warn("REMINDER: Deploy Cloud Function to update referrer's count!");
                    // Trigger function logic if needed
                }
            }
            return Promise.resolve(); // Indicate success
        } catch (error) {
            console.error("Error during Firebase login/registration:", error);
            showErrorMessage("Login process failed.", "home");
            return Promise.reject(error); // Indicate failure
        }
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");
        navItems.forEach(item => { item.removeEventListener('click', handleNavClick); item.addEventListener('click', handleNavClick); });
        if (miningButton) { miningButton.removeEventListener('click', handleMiningClick); miningButton.addEventListener('click', handleMiningClick); }
        if (copyLinkButton) { copyLinkButton.removeEventListener('click', handleCopyLinkClick); copyLinkButton.addEventListener('click', handleCopyLinkClick); }
        // Boost button listener is managed by updateBoostTaskUI
        console.log("Event listeners setup complete.");
    }

    // --- Event Handlers ---
    function handleNavClick(event) { const targetId = event.currentTarget.dataset.target; if (targetId) switchScreen(targetId); }
    function handleMiningClick() { if (!isMining) startMining(); else tg?.showPopup({ message: 'Mining session already active!' }); }
     function handleCopyLinkClick() {
         if (!currentUserId || !isTmaEnvironment) { showErrorMessage("Cannot create link.", "friends"); return; }
         const miniAppShortName = 'Play'; const botUsername = "BitaMiningbot";
         const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;
         console.log("Copying link:", linkToCopy);
         if (tg && tg.clipboardWriteText) { tg.clipboardWriteText(linkToCopy, (ok) => ok ? tg.showPopup({ message: 'Referral link copied!' }) : copyFallback(linkToCopy)); }
         else { copyFallback(linkToCopy); }
     }
     function copyFallback(text) { navigator.clipboard.writeText(text).then(() => { tg?.showPopup({ message: 'Link copied!' }); alert('Link copied!');}).catch(err => showErrorMessage('Could not copy link.', 'friends')); }


    // --- Application Initialization ---
    async function initializeApp() {
        console.log("initializeApp starting...");
        if (tg && tg.initData) {
            isTmaEnvironment = true; tg.ready();
            console.log("TMA Env detected. SDK Ready.");

            // Get Referral ID early
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            console.log(`[DEBUG] Start Param Read: ${referrerIdFromLink || 'None'}`);
            // --- Optional: Display ID on screen for testing ---
            try {
                 const display = document.createElement('div');
                 display.id = 'ref-debug';
                 display.textContent = `Ref: ${referrerIdFromLink || 'N/A'}`;
                 display.style.cssText = 'position:fixed;top:0;left:0;background:black;color:lime;padding:2px;font-size:10px;z-index:10001;';
                 document.body.appendChild(display);
            } catch(e) {console.warn("Could not add ref debug display", e)}
            // --- End Optional Display ---

            tg.expand(); tg.BackButton.onClick(() => { if (!document.getElementById('home-screen')?.classList.contains('active')) switchScreen('home-screen'); }); tg.BackButton.hide();

            currentUserData = tg.initDataUnsafe?.user;
            if (currentUserData?.id) {
                currentUserId = String(currentUserData.id);
                console.log("User ID found:", currentUserId);

                if (initFirebase()) { // Init Firebase first
                     console.log("Firebase is ready.");
                     try {
                         // Attempt login/registration, then load data
                         await handleFirebaseLoginUsingTMA(currentUserData);
                         await loadUserDataFromFirestore(); // Load data *after* login/reg attempt
                         console.log("Login & Data Load sequence complete.");
                         setupEventListeners();
                         switchScreen('home-screen'); // Show home screen
                         // Timer is started inside loadUserDataFromFirestore
                         console.log("App setup complete.");
                     } catch (error) {
                         console.error("Error during critical setup (login/load):", error);
                         showErrorMessage("App setup failed. Please restart.", "home");
                          if (loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loader on error
                     }
                } else { // Firebase init failed
                    console.error("Firebase initialization failed! Halting setup.");
                    showErrorMessage("Critical Error: Cannot connect.", "home");
                    if (loadingIndicator) loadingIndicator.classList.add('hidden');
                }
            } else { // No User ID
                console.error("Failed to get User ID.");
                showErrorMessage("Cannot verify user. Restart.", "home");
                 if (loadingIndicator) loadingIndicator.classList.add('hidden');
            }
        } else { // Not in TMA
            console.error("Not running in TMA Environment.");
            isTmaEnvironment = false;
            document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Access Error</h1><p>Please open inside Telegram.</p></div>';
             if (loadingIndicator) loadingIndicator.classList.add('hidden');
        }
    } // End initializeApp

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded

// --- END OF FILE app.js ---