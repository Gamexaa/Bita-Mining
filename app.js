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
    // General
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item');

    // Home Screen
    const homeScreen = document.getElementById('home-screen');
    const balanceEl = document.getElementById('balance');
    const usdEquivalentEl = document.getElementById('usd-equivalent');
    const activeReferralsEl = document.getElementById('active-referrals');
    const totalReferralsEl = document.getElementById('total-referrals');
    const miningTimerEl = document.getElementById('mining-timer');
    const miningSpeedEl = document.getElementById('mining-speed');
    const miningButton = document.getElementById('mining-button');
    const homeErrorMessageArea = document.getElementById('error-message-area-home');

    // Friends Screen
    const friendsScreen = document.getElementById('friends-screen');
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const copyLinkButton = document.getElementById('copy-link-button'); // Using ID now
    const friendsErrorMessageArea = document.getElementById('error-message-area-friends');

    // Boost Screen
    const boostScreen = document.getElementById('boost-screen');
    const boostTaskActionContainer = document.getElementById('boost-task-1-action'); // Container for button/check
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
    let referralSpeed = 0;
    let totalReferrals = 0;
    let activeReferrals = 0;
    let friends = [];
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0;
    let firebaseInitialized = false; // Flag to track Firebase status

    // --- Firebase Configuration (Provided by user) ---
    const firebaseConfig = {
      apiKey: "AIzaSyAhUKkVb9RRYzGckeEHaNCR48rOfNS_rXY", // Use your actual key
      authDomain: "bita-mining-app.firebaseapp.com",
      projectId: "bita-mining-app",
      storageBucket: "bita-mining-app.appspot.com", // Corrected domain
      messagingSenderId: "383835477324",
      appId: "1:383835477324:web:608d418b8114fb2d87abe9",
      measurementId: "G-DBRTWRWSEM" // Optional
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
        if (!firebaseInitialized || !currentUserId) return; // Don't update if not ready

        requestAnimationFrame(() => { // Update smoothly
            const totalSpeed = calculateTotalSpeed();
            if (balanceEl) balanceEl.textContent = formatBalance(balance);
            if (usdEquivalentEl) usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
            if (miningSpeedEl) miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;
            if (activeReferralsEl) activeReferralsEl.textContent = activeReferrals;
            if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;

            // Update mining button state
            if (miningButton) {
                if (isMining) {
                    miningButton.textContent = 'Mining...';
                    miningButton.disabled = true;
                } else {
                    miningButton.textContent = 'Start Mining';
                    miningButton.disabled = false;
                }
            }
            // Update timer display (handled by updateTimer interval)

            // Update friend list related counts
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

        if (miningTimerEl) {
            miningTimerEl.textContent = formatTime(timeLeft);
        }

        if (timeLeft <= 0 && isMining) {
            console.log("Timer ended while mining, stopping...");
            stopMining(true); // Save balance when timer ends
        }
    }

    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;
        friendListContainer.innerHTML = ''; // Clear previous list

        // TODO: Replace 'friends' array with actual data fetched from Firebase
        // This requires backend logic to query users where 'referredBy' == currentUserId
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

     function updateBoostTaskUI() {
        if (!boostTaskActionContainer) return;
        boostTaskActionContainer.innerHTML = ''; // Clear previous

        if (boostTask1Completed) {
            const checkMark = document.createElement('span');
            checkMark.className = 'task-complete-check';
            checkMark.textContent = '✓';
            boostTaskActionContainer.appendChild(checkMark);
        } else {
            // Check if task was started (requires better state management, defaulting to 'Start')
            const button = document.createElement('button');
            button.id = 'boost-task-1'; // ID for the handler
            button.className = 'task-button boost-start'; // Default class
            button.textContent = "Start";
            // Add the specific click listener for the boost button
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

     function showErrorMessage(message, screenId = 'home') {
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
    function startBalanceIncrement() {
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

    function saveBalanceToFirebase() {
        if (!currentUserId || !firebaseInitialized || typeof balance !== 'number') return;
        const db = firebase.firestore();
        const roundedBalance = parseFloat(balance.toFixed(4));
        // Avoid unnecessary writes if balance hasn't changed significantly? (Optional optimization)
        console.log(`Saving balance ${roundedBalance} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance (${roundedBalance}) successfully updated.`))
            .catch(error => {
                console.error("Error updating balance:", error);
                // Maybe show a subtle, non-blocking error
                // showErrorMessage("Sync error", "home", true);
            });
    }

     function startMining() {
        if (isMining || !currentUserId || !firebaseInitialized) {
            console.warn("Start mining prevented:", {isMining, currentUserId, firebaseInitialized});
            return;
        }
        const db = firebase.firestore();
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
            // Ensure UI state is correct (button enabled)
            isMining = false;
             miningEndTime = 0;
            if (miningButton) {
                 miningButton.textContent = 'Start Mining';
                 miningButton.disabled = false;
             }
        });
    }

     function stopMining(saveFinalBalance = true) {
        console.log("Attempting to stop mining. Save balance:", saveFinalBalance);
        // Clear intervals immediately
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;

        // Update local state immediately
        const wasMining = isMining; // Capture state before changing
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(4));
        miningEndTime = 0;

        // Update UI immediately
         updateDisplay(); // Reflects button change, etc.
         if (miningTimerEl) miningTimerEl.textContent = "00:00:00"; // Ensure timer reset


        // Update Firestore
        if (currentUserId && firebaseInitialized && wasMining) { // Only update if was actually mining
            const db = firebase.firestore();
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
             console.log("Stop mining: No Firestore update needed (not logged in, wasn't mining, or Firebase issue).");
        }
    }

    // --- Boost Task Click Handler ---
     function handleBoostTaskClick() {
        if (!currentUserId || !firebaseInitialized) return;
        const db = firebase.firestore();
        // Find button inside the container
        const boostButton = boostTaskActionContainer?.querySelector('#boost-task-1');
        if (!boostButton || boostButton.disabled || boostTask1Completed) {
            console.log("Boost action prevented:", { boostButton, disabled: boostButton?.disabled, completed: boostTask1Completed });
            return;
        }

        const currentButtonState = boostButton.textContent;

        if (currentButtonState === "Start") {
            console.log("Boost Task: Start");
            if (tg && tg.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // <<<--- UPDATE WITH YOUR ACTUAL LINK
                 // Change button state visually
                 boostButton.textContent = "Claim";
                 boostButton.classList.remove("boost-start");
                 boostButton.classList.add("boost-claim");
            } else {
                 showErrorMessage("Telegram action not available.", "boost");
            }
        } else if (currentButtonState === "Claim") {
            console.log("Boost Task: Claim");
            boostButton.textContent = "Claiming...";
            boostButton.disabled = true;
            boostButton.classList.add("boost-claiming"); // Optional style for claiming

            // !!! Add server-side validation later !!!
            const newBoostSpeed = (boostSpeed || 0) + 0.005;

            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true,
                boostSpeed: newBoostSpeed
            }).then(() => {
                console.log("Boost claimed successfully.");
                boostTask1Completed = true;
                boostSpeed = newBoostSpeed;
                updateBoostTaskUI(); // Update to checkmark
                updateDisplay(); // Update total speed display
            }).catch(error => {
                console.error("Error claiming boost:", error);
                showErrorMessage("Boost claim failed. Try again.", "boost");
                // Reset button on failure
                boostButton.textContent = "Claim";
                boostButton.disabled = false;
                boostButton.classList.remove("boost-claiming");
                boostButton.classList.add("boost-claim");
            });
        }
    }


    // --- Firebase & Data Handling ---
     function initFirebase() { // <<<--- FIREBASE INITIALIZATION FUNCTION DEFINITION ---<<<
        // This function now contains the actual Firebase initialization code
        if (firebaseInitialized) {
             // console.log("Firebase already initialized."); // Optional: Less verbose log
             return true;
        }
        console.log("Initializing Firebase...");
        try {
            // Initialize Firebase using v8 syntax (since scripts are loaded in HTML)
            if (!firebase.apps.length) { // Check if already initialized
                firebase.initializeApp(firebaseConfig); // Use the config defined above
                console.log("Firebase initialized successfully.");
            } else {
                firebase.app(); // Get default app if already initialized
                console.log("Using existing Firebase app instance.");
            }

            // Optional: Initialize Analytics if needed (using v8 syntax)
            // if (typeof firebase.analytics === 'function') {
            //     firebase.analytics();
            //     console.log("Firebase Analytics initialized.");
            // }

            // Check if Firestore service is available
            firebase.firestore();
            console.log("Firestore service is available.");

            firebaseInitialized = true; // Set the flag indicating success
            return true; // Indicate success

        } catch (e) {
            console.error("Firebase initialization or Firestore check failed:", e);
            firebaseInitialized = false; // Ensure flag is false on failure
            alert("Critical Error: Could not connect to Firebase services. Please restart the app."); // Use alert as fallback here
            return false; // Indicate failure
        }
    } // <<<--- END OF initFirebase FUNCTION DEFINITION ---<<<


     async function loadUserDataFromFirestore() {
    const loader = document.getElementById('loading-indicator'); // <<<--- YEH LINE ADD KARO

    // Baaki ka code jaisa tha waisa hi rahega...
    if (!currentUserId || !firebaseInitialized) {
            console.error("Cannot load user data: User ID or Firebase missing.");
             showErrorMessage("Failed to load user data. Please restart.", "home");
            return;
        }
        console.log("Loading user data from Firestore...");
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
                if (doc.exists) {
        const userData = doc.data();
        console.log("User data loaded:", userData);
        // ... baaki ka data update karne wala code ...

        // <<<--- YEH LINE ADD KARO (Success Case) --->>>
        if (loader) loader.classList.add('hidden');

    } else { ... }
                // Update local state
                balance = userData.balance ?? 0; // Use nullish coalescing
                miningEndTime = userData.miningEndTime?.toMillis() ?? 0;
                baseMiningSpeed = userData.baseMiningSpeed ?? 0.015;
                boostSpeed = userData.boostSpeed ?? 0;
                referralSpeed = userData.referralSpeed ?? 0;
                totalReferrals = userData.totalReferrals ?? 0;
                activeReferrals = userData.activeReferrals ?? 0;
                boostTask1Completed = userData.boostTask1Completed ?? false;
                // TODO: Fetch friend data separately if needed
                // friends = await fetchFriends();

                // Check mining status AFTER loading data
                const now = Date.now();
                if (miningEndTime > now) {
                    isMining = true;
                    console.log("Resuming mining session.");
                } else {
                    isMining = false;
                    if (miningEndTime > 0) { // If it had an end time but it passed
                        console.log("Previous mining session expired.");
                        // Optionally clear the expired time in Firestore if desired (non-critical)
                        // userRef.update({ miningEndTime: null }).catch(e=>console.warn("Couldn't clear expired time", e));
                    }
                }
                 // Update UI based on loaded data
                updateBoostTaskUI();
                updateDisplay();
                startTimer(); // Always start timer to show countdown or 00:00:00

            } else {
                console.error(`Firestore document for user ${currentUserId} not found! Should have been created.`);
                 showErrorMessage("User data not found. Please contact support if this persists.", "home");
                 // Consider creating it again ONLY if absolutely sure handleFirebaseLoginUsingTMA failed silently
                 // handleFirebaseLoginUsingTMA(currentUserData); // Risky!
            }
        } catch (error) {
            console.error("Error loading user data:", error);
            showErrorMessage("Failed to load data. Check connection.", "home");

    // <<<--- YEH LINE ADD KARO (Error Case) --->>>
    if (loader) loader.classList.add('hidden');
        }
    }

    // --- User Login/Registration ---
    async function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId || !firebaseInitialized) {
             console.error("handleFirebaseLoginUsingTMA called without UserID or Firebase init.");
             return;
        }
        console.log("Handling Firebase login/registration...");
        const db = firebase.firestore();
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                // --- EXISTING USER ---
                console.log("User exists. Updating profile & last login.");
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
                await loadUserDataFromFirestore(); // Load data after update

            } else {
                // --- NEW USER ---
                console.log("New user. Creating Firestore entry.");

                // <<< START DEBUGGING BLOCK >>>
                console.log("[DEBUG] Inside NEW USER block. Checking referrerIdFromLink before use:", referrerIdFromLink);
                const referredByUserId = referrerIdFromLink ? String(referrerIdFromLink) : null;
                console.log("[DEBUG] Value being assigned to 'referredBy' field:", referredByUserId);
                // <<< END DEBUGGING BLOCK >>>

                const defaultData = {
                    telegramId: currentUserId,
                    firstName: tmaUserData.first_name || null,
                    username: tmaUserData.username || null,
                    photoUrl: tmaUserData.photo_url || null,
                    isPremium: tmaUserData.is_premium ?? false,
                    languageCode: tmaUserData.language_code || 'en',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    balance: 0.0000,
                    miningEndTime: null,
                    baseMiningSpeed: 0.015,
                    boostSpeed: 0,
                    referralSpeed: 0,
                    totalReferrals: 0,
                    activeReferrals: 0,
                    boostTask1Completed: false,
                    referredBy: referredByUserId // Use the potentially corrected value
                };
                 console.log("[DEBUG] Creating defaultData object:", defaultData); // Optional: Dekho poora object kaisa ban raha hai
                await userRef.set(defaultData);
                console.log("New user document created.");
                await loadUserDataFromFirestore(); // Load data for the new user

                // --- Trigger Backend (Reminder) ---
                if (referredByUserId) {
                    console.log(`User ${currentUserId} referred by ${referredByUserId}.`);
                    console.warn("REMINDER: Backend Cloud Function needed to update referrer's count!");
                    // Example trigger (requires functions SDK):
                    // try {
                    //   const processReferral = firebase.functions().httpsCallable('processReferral');
                    //   await processReferral({ referredUserId: currentUserId, referrerId: referredByUserId });
                    //   console.log("Cloud function for referral triggered.");
                    // } catch(err) { console.error("Error triggering referral cloud function", err); }
                }
            }
        } catch (error) {
            console.error("Error during Firebase login/registration:", error);
            showErrorMessage("Failed to process login. Please restart.", "home");
        }
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");

        // Remove potentially existing listeners before adding new ones
        navItems.forEach(item => item.removeEventListener('click', handleNavClick));
        if (miningButton) miningButton.removeEventListener('click', handleMiningClick);
        if (copyLinkButton) copyLinkButton.removeEventListener('click', handleCopyLinkClick);
        // Boost button listener is added/removed in updateBoostTaskUI

        // Add listeners
        navItems.forEach(item => item.addEventListener('click', handleNavClick));
        if (miningButton) miningButton.addEventListener('click', handleMiningClick);
        if (copyLinkButton) copyLinkButton.addEventListener('click', handleCopyLinkClick);

        console.log("Event listeners attached.");
    }

    // --- Event Handlers ---
    function handleNavClick(event) {
        // Use currentTarget to ensure it's the element the listener was attached to
        const targetId = event.currentTarget.dataset.target;
        if (targetId) {
            switchScreen(targetId);
        }
    }

    function handleMiningClick() {
         if (!isMining) {
             startMining();
         } else {
             console.log("Mining button clicked while mining.");
             tg?.showPopup({ message: 'Mining session already active!' });
         }
     }

    function handleCopyLinkClick() {
         if (!currentUserId || !isTmaEnvironment) {
             showErrorMessage("Cannot create link.", "friends");
             return;
         }
         const miniAppShortName = 'Play'; // <<< CONFIRM FROM BOTFATHER
         const botUsername = "BitaMiningbot"; // <<< CONFIRM USERNAME
         const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;

         console.log("Copying link:", linkToCopy);
         if (tg && tg.clipboardWriteText) {
             tg.clipboardWriteText(linkToCopy, (success) => {
                 if (success) {
                     tg.showPopup({ message: 'Referral link copied!' });
                 } else {
                     navigator.clipboard.writeText(linkToCopy).then(() => {
                         tg?.showPopup({ message: 'Link copied!' });
                     }).catch(err => showErrorMessage('Could not copy link.', 'friends'));
                 }
             });
         } else { // Fallback
             navigator.clipboard.writeText(linkToCopy).then(() => {
                 alert('Referral link copied!');
             }).catch(err => showErrorMessage('Could not copy link.', 'friends'));
         }
     }

    // --- Application Initialization ---
    function initializeApp() {
        console.log("initializeApp called");
        // Check if running in Telegram
        if (tg && tg.initData) {
            console.log("TMA Environment detected.");
            isTmaEnvironment = true;
            tg.ready(); // Inform SDK the app UI is ready

            // <<< START DEBUGGING BLOCK >>>
            console.log("[DEBUG] Checking initData...");
            console.log("[DEBUG] tg.initDataUnsafe:", tg.initDataUnsafe); // Poora object dekho
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            console.log("[DEBUG] Read start_param value:", tg.initDataUnsafe?.start_param); // Specific value dekho
            console.log("[DEBUG] Value assigned to referrerIdFromLink:", referrerIdFromLink); // Variable mein kya gaya?
            // <<< END DEBUGGING BLOCK >>>

             if (referrerIdFromLink) { // Original log
                 console.log(`App launched with referral ID (start_param): ${referrerIdFromLink}`);
             } else {
                 console.log("App launched without referral ID.");
             }


            tg.expand();
            tg.BackButton.onClick(() => { // Back button logic
                 if (!document.getElementById('home-screen')?.classList.contains('active')) {
                      switchScreen('home-screen');
                 }
            });
            tg.BackButton.hide(); // Hide initially

            // Get User Data
            currentUserData = tg.initDataUnsafe?.user;
            if (currentUserData?.id) {
                currentUserId = String(currentUserData.id);
                console.log("User ID obtained:", currentUserId);

                // Initialize Firebase (essential step)
                if (initFirebase()) { // <<<--- CALLING THE INITIALIZATION FUNCTION ---<<<
                     console.log("Firebase initialized successfully.");
                     // Now proceed with user login/data loading and UI setup
                     handleFirebaseLoginUsingTMA(currentUserData) // This now also loads data
                         .then(() => {
                              console.log("Login/Data load sequence complete.");
                              setupEventListeners(); // Setup listeners AFTER data might be loaded
                              switchScreen('home-screen'); // Ensure starting screen is active
                              startTimer(); // Start timer to show 00:00:00 or countdown
                              console.log("App setup complete.");
                         })
                         .catch(err => {
                              console.error("Error during post-login sequence:", err);
                              showErrorMessage("Failed to setup app after login.", "home");
                         });
                } else {
                     console.error("Firebase initialization failed! App cannot run.");
                     showErrorMessage("Critical Error: Cannot connect to services.", "home");
                     // Disable UI elements maybe
                }
            } else {
                console.error("Failed to get User ID from Telegram.");
                showErrorMessage("Cannot verify user. Please restart.", "home");
                // Show blocking error
            }
        } else {
            console.error("Not running in TMA Environment.");
            isTmaEnvironment = false;
             document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Access Error</h1><p>Please open this app inside Telegram.</p></div>';
        }
    }

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded

// --- END OF FILE app.js ---