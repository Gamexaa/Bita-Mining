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
    const debugArea = document.getElementById('debug-area'); // For visible debug

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
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now();
        const timeLeft = miningEndTime > 0 ? miningEndTime - now : 0;
        if (miningTimerEl) miningTimerEl.textContent = formatTime(timeLeft);
        if (timeLeft <= 0 && isMining) {
            console.log("Timer ended, stopping mining automatically.");
            stopMining(true);
        }
    }

    function renderFriendList() { /* ... (Same as previous version) ... */
        if (!friendListContainer || !noFriendsMessage) return;
        friendListContainer.innerHTML = ''; // Clear previous list
        const friendsToDisplay = friends; // Use the state variable
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
                if (friend.joined) {
                    const joinDate = new Date(friend.joined);
                    joinedText = `${joinDate.toLocaleString('en-US', { month: 'long', day: 'numeric' })} at ${String(joinDate.getHours()).padStart(2, '0')}:${String(joinDate.getMinutes()).padStart(2, '0')}`;
                }
                const boostGiven = (friend.boostGiven || 0.005).toFixed(3); // Assuming default boost

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

    function updateBoostTaskUI() { // <<< MODIFIED FOR IMAGE >>>
        if (!boostTaskActionContainer) return;
        boostTaskActionContainer.innerHTML = ''; // Clear previous

        if (boostTask1Completed) {
            // Use the custom tick_logo.png image
            const tickImage = document.createElement('img');
            tickImage.src = 'tick_logo.png'; // Ensure this file is in the same folder
            tickImage.alt = 'Completed';
            tickImage.className = 'task-complete-image'; // Add class for styling
            boostTaskActionContainer.appendChild(tickImage);
        } else {
            // Show the button (Start or Claim)
            const button = document.createElement('button');
            button.id = 'boost-task-1';
            // Logic to determine if it should be 'Claim' needs better state, defaulting to 'Start'
            button.className = 'task-button boost-start'; // Default state
            button.textContent = "Start";
            button.removeEventListener('click', handleBoostTaskClick); // Remove first
            button.addEventListener('click', handleBoostTaskClick); // Add fresh listener
            boostTaskActionContainer.appendChild(button);
        }
    }

    function switchScreen(targetId) { /* ... (Same as previous version) ... */
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
            targetId = 'home-screen'; // Update targetId for nav highlight
        }

        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });

        if (targetId === 'home-screen') {
            tg?.BackButton.hide();
            updateDisplay(); // Refresh home screen data
        } else {
            tg?.BackButton.show();
        }
    }

     function showErrorMessage(message, screenId = 'home') { /* ... (Same as previous version) ... */
        console.error("UI Error:", message);
        let errorDiv;
        switch(screenId) {
            case 'friends': errorDiv = friendsErrorMessageArea; break;
            case 'boost': errorDiv = boostErrorMessageArea; break;
            case 'home':
            default: errorDiv = homeErrorMessageArea; break;
        }

        if (errorDiv) {
          errorDiv.textContent = message;
          errorDiv.style.display = 'block';
          // Hide after 5 seconds
          setTimeout(() => { if(errorDiv) errorDiv.style.display = 'none'; }, 5000);
        } else {
            alert(message); // Fallback
        }
    }


    // --- Core Logic Functions ---
    function startBalanceIncrement() { /* ... (Same robust logic as previous version) ... */
        if (miningInterval) clearInterval(miningInterval);
        if (!isMining || !currentUserId) return; // Don't start if not mining

        console.log("Starting balance increment...");
        const incrementPerSecond = calculateTotalSpeed() / 3600;

        miningInterval = setInterval(() => {
            // Double check mining status inside interval
            if (!isMining) {
                clearInterval(miningInterval);
                miningInterval = null;
                console.log("Stopping increment (isMining became false).");
                return;
            }
            balance += incrementPerSecond;
            updateDisplay(); // Update UI frequently

            // Save balance periodically
            const now = Date.now();
            if (now - lastBalanceUpdateTime >= 60000) { // Approx every 60s
                saveBalanceToFirebase();
                lastBalanceUpdateTime = now;
            }
        }, 1000);
    }

    function saveBalanceToFirebase() { /* ... (Same robust logic as previous version) ... */
        if (!currentUserId || !firebaseInitialized || typeof balance !== 'number') return;
        // const db = firebase.firestore(); // Use global db instance
        const roundedBalance = parseFloat(balance.toFixed(4));
        console.log(`Saving balance ${roundedBalance} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance (${roundedBalance}) successfully updated.`))
            .catch(error => {
                console.error("Error updating balance:", error);
            });
    }

     function startMining() { /* ... (Same robust logic as previous version) ... */
        if (isMining || !currentUserId || !firebaseInitialized) {
            console.warn("Start mining prevented:", {isMining, currentUserId, firebaseInitialized});
            return;
        }
        // const db = firebase.firestore(); // Use global db instance
        console.log("Attempting to start mining...");
        const newMiningEndTime = Date.now() + MINING_DURATION_MS;

        // Update Firestore first
        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(newMiningEndTime)
        }).then(() => {
            console.log("Mining session started in Firestore.");
            // Update local state ONLY after successful Firestore update
            isMining = true;
            miningEndTime = newMiningEndTime;
            lastBalanceUpdateTime = Date.now();
            updateDisplay(); // Update button to 'Mining...'
            startTimer();
            startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining session in Firestore:", error);
            showErrorMessage("Mining start failed. Try again.", "home");
            isMining = false; // Rollback state
             miningEndTime = 0;
            updateDisplay(); // Update button back
        });
    }

     function stopMining(saveFinalBalance = true) { /* ... (Same robust logic as previous version) ... */
        console.log("Attempting to stop mining. Save balance:", saveFinalBalance);
        // Clear intervals immediately
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;

        // Update local state immediately
        const wasMining = isMining;
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(4));
        miningEndTime = 0;

        // Update UI immediately
         updateDisplay();
         if (miningTimerEl) miningTimerEl.textContent = "00:00:00";


        // Update Firestore
        if (currentUserId && firebaseInitialized && wasMining) {
            // const db = firebase.firestore(); // Use global db instance
            const updateData = { miningEndTime: null };
            if (saveFinalBalance) {
                updateData.balance = finalBalanceToSave;
                console.log(`Saving final balance ${finalBalanceToSave} on stop.`);
            } else {
                 console.log("Not saving final balance on this stop.");
            }
            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Mining session stopped/updated in Firestore."))
                .catch(error => console.error("Error updating Firestore on stop mining:", error));
        } else {
             console.log("Stop mining: No Firestore update needed.");
        }
    }

    // --- Boost Task Click Handler ---
     function handleBoostTaskClick() { /* ... (Same robust logic as previous version) ... */
        if (!currentUserId || !firebaseInitialized) return;
        // const db = firebase.firestore(); // Use global db instance
        const boostButton = boostTaskActionContainer?.querySelector('#boost-task-1');
        if (!boostButton || boostButton.disabled || boostTask1Completed) {
             console.log("Boost action prevented."); return;
        }

        const currentButtonState = boostButton.textContent;

        if (currentButtonState === "Start") {
            console.log("Boost Task: Start");
            if (tg && tg.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // <<<--- YOUR CHANNEL LINK
                 boostButton.textContent = "Claim";
                 boostButton.classList.remove("boost-start");
                 boostButton.classList.add("boost-claim");
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
                boostTask1Completed = true;
                boostSpeed = newBoostSpeed;
                updateBoostTaskUI();
                updateDisplay();
            }).catch(error => {
                console.error("Error claiming boost:", error);
                showErrorMessage("Boost claim failed. Try again.", "boost");
                boostButton.textContent = "Claim"; // Reset state
                boostButton.disabled = false;
                boostButton.classList.remove("boost-claiming");
                boostButton.classList.add("boost-claim");
            });
        }
    }


    // --- Firebase & Data Handling ---
     function initFirebase() {
        if (firebaseInitialized) return true;
        console.log("Initializing Firebase...");
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            } else {
                firebase.app();
            }
            db = firebase.firestore(); // <<< Initialize Firestore instance here
            console.log("Firestore service initialized.");
            firebaseInitialized = true;
            return true;
        } catch (e) {
            console.error("Firebase initialization failed:", e);
            firebaseInitialized = false;
            alert("Critical Error: Could not connect to services.");
            return false;
        }
    }

    // <<<--- MODIFIED loadUserDataFromFirestore with finally ---<<<
     async function loadUserDataFromFirestore() {
        console.log("[LOAD_DATA] Function started.");

        if (!currentUserId || !firebaseInitialized) {
            console.error("[LOAD_DATA] Cannot load: No user ID or Firebase init failed.");
            showErrorMessage("Failed to load user data. Please restart.", "home");
            return; // Exit the function
        }

        console.log("[LOAD_DATA] Attempting DB connection check...");
        if (!db) { // Check if db instance is available
             console.error("[LOAD_DATA] Firestore instance (db) is not available!");
             showErrorMessage("Database connection error.", "home");
             return;
        }

        const userRef = db.collection('users').doc(currentUserId);
        console.log(`[LOAD_DATA] Attempting to get userRef: users/${currentUserId}`);

        try {
            console.log("[LOAD_DATA] BEFORE userRef.get()");
            const doc = await userRef.get(); // <<<--- Network request happens here
            console.log("[LOAD_DATA] AFTER userRef.get(). Doc exists:", doc.exists);

            if (doc.exists) {
                const userData = doc.data();
                console.log("[LOAD_DATA] SUCCESS: User doc exists. Processing data...");
                // Update local state variables
                balance = userData.balance ?? 0;
                miningEndTime = userData.miningEndTime?.toMillis() ?? 0;
                baseMiningSpeed = userData.baseMiningSpeed ?? 0.015;
                boostSpeed = userData.boostSpeed ?? 0;
                referralSpeed = userData.referralSpeed ?? 0;
                totalReferrals = userData.totalReferrals ?? 0;
                activeReferrals = userData.activeReferrals ?? 0;
                boostTask1Completed = userData.boostTask1Completed ?? false;
                // friends = await fetchFriends(); // Placeholder

                // Check mining status
                const now = Date.now();
                if (miningEndTime > now) { isMining = true; } else { isMining = false; }
                console.log("[LOAD_DATA] State updated. Mining:", isMining);

                // Update UI
                updateBoostTaskUI();
                updateDisplay();
                startTimer(); // Start visual timer
                console.log("[LOAD_DATA] Initial UI updated.");

            } else {
                console.error(`[LOAD_DATA] User document ${currentUserId} NOT FOUND!`);
                showErrorMessage("User data not found. If new user, wait.", "home");
                 // If user is new, handleFirebaseLoginUsingTMA should have created this.
                 // This points to a potential issue in the user creation flow or Firestore rules.
            }
        } catch (error) {
            console.error("[LOAD_DATA] CATCH ERROR loading user data:", error);
            if (error.code === 'permission-denied') {
                 showErrorMessage("Error: Cannot access data.", "home");
            } else {
                 showErrorMessage("Failed to load data. Check connection.", "home");
            }
        } finally {
            // --- ENSURE LOADER IS ALWAYS HIDDEN ---
            if (loadingIndicator) { // Check if element exists
                console.log("[LOAD_DATA] FINALLY block: Hiding loading indicator.");
                loadingIndicator.classList.add('hidden');
            } else {
                console.warn("[LOAD_DATA] FINALLY block: Loading indicator element not found!");
            }
            console.log("[LOAD_DATA] Function finished.");
        }
     } // <<<--- END OF MODIFIED loadUserDataFromFirestore ---<<<


    // --- User Login/Registration ---
    async function handleFirebaseLoginUsingTMA(tmaUserData) { /* ... (Same robust logic as previous version, uses global db) ... */
        if (!currentUserId || !firebaseInitialized || !db) {
             console.error("handleFirebaseLoginUsingTMA pre-condition failed.");
             return Promise.reject("Pre-conditions failed"); // Return rejected promise
        }
        console.log("Handling Firebase login/registration...");
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                console.log("User exists. Updating...");
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
                // No need to load data here, initializeApp will call it after

            } else {
                console.log("New user. Creating...");
                console.log("[DEBUG] Checking referrerIdFromLink before creating new user:", referrerIdFromLink);
                const referredByUserId = referrerIdFromLink ? String(referrerIdFromLink) : null;
                console.log("[DEBUG] 'referredBy' field will be set to:", referredByUserId);

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
                    referredBy: referredByUserId
                };
                await userRef.set(defaultData);
                console.log("New user document created.");
                 if (referredByUserId) {
                    console.warn("REMINDER: Cloud Function needed to update referrer's count!");
                }
                 // No need to load data here, initializeApp will call it after
            }
            return Promise.resolve(); // Indicate success
        } catch (error) {
            console.error("Error during Firebase login/registration:", error);
            showErrorMessage("Failed to process login.", "home");
            return Promise.reject(error); // Indicate failure
        }
    }


    // --- Event Listeners Setup ---
    function setupEventListeners() { /* ... (Same robust logic as previous version) ... */
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
        const targetId = event.currentTarget.dataset.target;
        if (targetId) switchScreen(targetId);
    }
    function handleMiningClick() { /* ... (Same logic) ... */
         if (!isMining) startMining();
         else tg?.showPopup({ message: 'Mining session already active!' });
    }
     function handleCopyLinkClick() { /* ... (Same logic) ... */
         if (!currentUserId || !isTmaEnvironment) { showErrorMessage("Cannot create link.", "friends"); return; }
         const miniAppShortName = 'Play'; const botUsername = "BitaMiningbot";
         const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;
         console.log("Copying link:", linkToCopy);
         if (tg && tg.clipboardWriteText) {
             tg.clipboardWriteText(linkToCopy, (ok) => ok ? tg.showPopup({ message: 'Referral link copied!' }) : copyFallback(linkToCopy));
         } else { copyFallback(linkToCopy); }
     }
     function copyFallback(text) { /* ... (Same logic) ... */
        navigator.clipboard.writeText(text).then(() => {
             tg?.showPopup({ message: 'Link copied!' });
             alert('Referral link copied!');
        }).catch(err => showErrorMessage('Could not copy link.', 'friends'));
     }


    // --- Application Initialization ---
    async function initializeApp() { // Made async for await
        console.log("initializeApp sequence started...");
        if (tg && tg.initData) {
            console.log("TMA Environment detected.");
            isTmaEnvironment = true;
            tg.ready();

            // --- Read Referral ID ---
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            console.log(`[DEBUG] Read start_param value: ${referrerIdFromLink || 'None'}`);
            // --- Display for Debug (Optional) ---
             if (debugArea) {
                 debugArea.textContent = `Ref ID: ${referrerIdFromLink || 'NONE'}`;
                 debugArea.style.display = 'block'; // Show debug area
             }

            tg.expand();
            tg.BackButton.onClick(() => { if (!homeScreen?.classList.contains('active')) switchScreen('home-screen'); });
            tg.BackButton.hide();

            currentUserData = tg.initDataUnsafe?.user;
            if (currentUserData?.id) {
                currentUserId = String(currentUserData.id);
                console.log("User ID obtained:", currentUserId);

                if (initFirebase()) { // Initialize Firebase and Firestore instance
                    console.log("Firebase is initialized.");
                    try {
                        // Attempt Login/Registration first
                        await handleFirebaseLoginUsingTMA(currentUserData);
                        console.log("Login/Registration attempt finished. Now loading data...");
                        // Then Load Data (which will hide loader in finally)
                        await loadUserDataFromFirestore();
                        console.log("Data loading finished. Setting up listeners...");
                        // Only setup listeners and UI *after* data is potentially loaded
                        setupEventListeners();
                        switchScreen('home-screen'); // Ensure correct start screen
                        console.log("App setup complete.");
                    } catch (err) {
                        console.error("Error during app setup sequence (Login/Load):", err);
                        showErrorMessage("Failed to initialize app data.", "home");
                         if (loadingIndicator) loadingIndicator.classList.add('hidden'); // Ensure loader hidden on error
                    }
                } else {
                    console.error("Firebase init failed!");
                    showErrorMessage("Critical Error: Cannot connect to services.", "home");
                     if (loadingIndicator) loadingIndicator.classList.add('hidden');
                }
            } else {
                console.error("Failed to get User ID.");
                showErrorMessage("Cannot verify user.", "home");
                 if (loadingIndicator) loadingIndicator.classList.add('hidden');
            }
        } else {
            console.error("Not in TMA Environment.");
            isTmaEnvironment = false;
             document.body.innerHTML = '<div style="padding:20px;text-align:center;"><h1>Access Error</h1><p>Please use Telegram.</p></div>';
             if (loadingIndicator) loadingIndicator.classList.add('hidden'); // Hide loader if not TMA
        }
    } // End initializeApp

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded

// --- END OF FILE app.js ---