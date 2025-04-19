document.addEventListener('DOMContentLoaded', () => {
    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null; // Sabse important: User ki unique Telegram ID
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp; // Optional chaining for safety
    let referrerIdFromLink = null; // <<< ADDED: To store referral ID from link

    // --- DOM Elements ---
    const balanceEl = document.getElementById('balance');
    const usdEquivalentEl = document.getElementById('usd-equivalent');
    const activeReferralsEl = document.getElementById('active-referrals');
    const totalReferralsEl = document.getElementById('total-referrals');
    const miningTimerEl = document.getElementById('mining-timer');
    const miningSpeedEl = document.getElementById('mining-speed');
    const miningButton = document.getElementById('mining-button');
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item');
    // boostTaskButton will be targeted inside its handler/updater
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const copyLinkButton = document.querySelector('.copy-link-button');
    const errorMessageArea = document.getElementById('error-message-area'); // Specific area for errors

    // --- State Variables (Will be loaded from Firebase) ---
    let balance = 0.0000;
    let isMining = false;
    let miningInterval = null;
    let timerInterval = null;
    let miningEndTime = 0;
    const MINING_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    let baseMiningSpeed = 0.015;
    let boostSpeed = 0;
    let referralSpeed = 0; // This should likely be calculated based on active referrals in backend
    let totalReferrals = 0;
    let activeReferrals = 0;
    let friends = []; // Placeholder, needs Firebase integration (potentially loading referred users)
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0;

    // --- Core Functions ---

    function formatBalance(num) { return (typeof num === 'number' ? num.toFixed(4) : '0.0000'); }
    function calculateUsdEquivalent(betaBalance) { const rate = 4.00; return (typeof betaBalance === 'number' ? (betaBalance * rate).toFixed(2) : '0.00'); }
    // Referral speed calculation might need backend logic or loading active friend data
    function calculateTotalSpeed() { return baseMiningSpeed + boostSpeed + referralSpeed; }
    function formatTime(ms) {
        if (ms <= 0) return "00:00:00";
        let totalSeconds = Math.floor(ms / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function updateDisplay() {
        // Update common elements visible across screens or only if specific screen is active
        const totalSpeed = calculateTotalSpeed();
        if (balanceEl) balanceEl.textContent = formatBalance(balance);
        if (usdEquivalentEl) usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
        if (miningSpeedEl) miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;

        // Update referral counts if elements exist
        if (activeReferralsEl) activeReferralsEl.textContent = activeReferrals;
        if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;

        // Update friend list display (can be called separately if needed)
        if (friendsTotalCountEl) friendsTotalCountEl.textContent = `${totalReferrals} users`;
        renderFriendList(); // Call function to update friend list UI
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimer(); // Update immediately
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() {
        const now = Date.now();
        const timeLeft = miningEndTime - now;

        if (timeLeft <= 0) {
            if (isMining) { // Only call stopMining if it was actually mining
                 console.log("Timer ended, stopping mining...");
                 stopMining(true); // Ensure final balance is saved when timer ends
            }
            if (miningTimerEl) miningTimerEl.textContent = "00:00:00"; // Ensure timer shows 0
        } else {
             if (miningTimerEl) miningTimerEl.textContent = formatTime(timeLeft);
        }
    }

    function startBalanceIncrement() {
        if (miningInterval) clearInterval(miningInterval);
        console.log("Starting balance increment...");

        const incrementPerSecond = calculateTotalSpeed() / 3600;

        miningInterval = setInterval(() => {
            if (!isMining || !currentUserId) {
                clearInterval(miningInterval);
                miningInterval = null;
                console.log("Balance increment stopped (not mining or no user ID).");
                return;
            }

            balance += incrementPerSecond;

            // Throttle UI updates slightly if performance becomes an issue
            requestAnimationFrame(updateDisplay); // Use rAF for smoother UI updates

            const now = Date.now();
            // Save balance roughly every minute
            if (now - lastBalanceUpdateTime >= 60000) {
                saveBalanceToFirebase();
                lastBalanceUpdateTime = now;
            }
        }, 1000);
    }

    // Function to save balance (ensure it's called appropriately)
    function saveBalanceToFirebase() {
        if (!currentUserId || typeof balance !== 'number' || !isTmaEnvironment) return;
         // Prevent saving if Firebase isn't ready (add this check if needed)
         /* if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
             console.warn("Attempted to save balance but Firebase not ready.");
             return;
         } */
        const db = firebase.firestore();
        const roundedBalance = parseFloat(balance.toFixed(4)); // Ensure saving correct precision
        console.log(`Saving balance ${roundedBalance} to Firebase for user ${currentUserId}...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance (${roundedBalance}) successfully updated.`))
            .catch(error => console.error("Error updating balance:", error));
    }


    function startMining() {
        if (isMining || !currentUserId || !isTmaEnvironment) return;
         // Prevent starting if Firebase isn't ready (add this check if needed)
         /* if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
             showErrorMessage("Cannot connect to database. Try again later.");
             return;
         } */
        const db = firebase.firestore();

        console.log("Attempting to start mining...");
        isMining = true;
        miningEndTime = Date.now() + MINING_DURATION_MS;
        lastBalanceUpdateTime = Date.now(); // Reset balance save timer

        if (miningButton) {
            miningButton.textContent = 'Mining...';
            miningButton.disabled = true;
        }

        // Update Firestore with the new mining end time
        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(miningEndTime)
        }).then(() => {
            console.log("Mining session started in Firestore. Ends at:", new Date(miningEndTime));
            startTimer(); // Start the visual countdown timer
            startBalanceIncrement(); // Start incrementing balance locally
        }).catch(error => {
            console.error("Error starting mining session in Firestore:", error);
            // Rollback local state and UI if Firestore update fails
            isMining = false;
            miningEndTime = 0;
            if (miningButton) {
                 miningButton.textContent = 'Start Mining';
                 miningButton.disabled = false;
            }
            // Stop intervals if they were somehow started
            if (timerInterval) clearInterval(timerInterval);
            if (miningInterval) clearInterval(miningInterval);
            timerInterval = null;
            miningInterval = null;

            showErrorMessage("Mining start nahi ho paya. Dobara try karein.");
        });
    }

    function stopMining(saveFinalBalance = true) {
         // Check if already stopped or was never mining based on state and timer
        if (!isMining && (!miningEndTime || Date.now() >= miningEndTime)) {
            // Ensure UI is in stopped state if necessary
            if (miningTimerEl) miningTimerEl.textContent = "00:00:00";
             if (miningButton) {
                miningButton.textContent = 'Start Mining';
                miningButton.disabled = false;
            }
            // Clear intervals just in case they are running erroneously
            if (timerInterval) clearInterval(timerInterval);
            if (miningInterval) clearInterval(miningInterval);
            timerInterval = null;
            miningInterval = null;
            return; // Already stopped or finished
        }

        console.log("Stopping mining. Save final balance:", saveFinalBalance);
        const wasIncrementing = !!miningInterval; // Check if balance was being incremented

        // Clear intervals first
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;

        // Update local state
        isMining = false;
        const finalBalanceToSave = parseFloat(balance.toFixed(4)); // Get final balance before resetting anything else
        miningEndTime = 0; // Reset local end time

        // Update UI immediately
        if (miningTimerEl) miningTimerEl.textContent = "00:00:00";
        if (miningButton) {
            miningButton.textContent = 'Start Mining';
            miningButton.disabled = false;
        }

        // Update Firestore if user ID exists and in TMA environment
        if (currentUserId && isTmaEnvironment) {
            // Prevent saving if Firebase isn't ready (add this check if needed)
            /* if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
                console.warn("Cannot update Firestore on stop, Firebase not ready.");
                return;
            } */
            const db = firebase.firestore();
            const updateData = { miningEndTime: null }; // Always clear mining end time

            if (saveFinalBalance && wasIncrementing) {
                updateData.balance = finalBalanceToSave; // Include final balance
                console.log(`Saving final balance ${finalBalanceToSave} on stop.`);
            } else {
                 console.log("Not saving final balance on this stop (saveFinalBalance=false or was not incrementing).");
            }

            // Update Firestore
            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Mining session stopped/updated in Firestore.", updateData))
                .catch(error => console.error("Error stopping mining session in Firestore:", error));
        }
    }


    function switchScreen(targetId) {
        let foundScreen = false;
        screens.forEach(screen => {
            const isActive = screen.id === targetId;
            screen.classList.toggle('active', isActive);
            if(isActive) foundScreen = true;
        });

        if (!foundScreen) {
            console.warn(`Screen with ID "${targetId}" not found.`);
            // Optionally switch to a default screen like home
            // document.getElementById('home-screen')?.classList.add('active');
            return; // Exit if target screen not found
        }


        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.target === targetId);
        });

        // Update display specifically for home screen if switching to it
        if (targetId === 'home-screen') {
             updateDisplay(); // Ensure home screen data is fresh when switching to it
             tg?.BackButton.hide(); // Hide back button on home screen
        } else {
             tg?.BackButton.show(); // Show back button on other screens
        }
    }

    // --- Boost Task Logic ---
    function handleBoostTaskClick() {
        if (!currentUserId || !isTmaEnvironment) return;
        // Prevent action if Firebase isn't ready (add this check if needed)
        /* if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
            showErrorMessage("Cannot connect to database. Try again later.");
            return;
        } */
        const db = firebase.firestore();
        const boostButton = document.getElementById('boost-task-1');
        if (!boostButton || boostButton.disabled) return; // Ignore if no button or already processing

        const currentButtonState = boostButton.textContent;

        if (boostTask1Completed) {
            console.log("Boost task already completed.");
            return;
        }

        if (currentButtonState === "Start") {
            console.log("Starting boost task: Join channel");
            if (tg && tg.openTelegramLink) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // Use your actual community link
                 // UI Changes to "Claim" state (User needs to come back and click claim)
                 boostButton.textContent = "Claim";
                 boostButton.classList.add("claim"); // Optional: for styling
            } else {
                 showErrorMessage("Telegram action not available outside Telegram environment.");
            }
            return; // Don't proceed further until user clicks Claim
        }

        if (currentButtonState === "Claim") {
            console.log("Attempting to claim boost reward...");
            boostButton.textContent = "Claiming...";
            boostButton.disabled = true;

            // !!! IMPORTANT: Server-Side Verification Recommended !!!
            // Ideally, you should verify on your backend that the user *actually* joined the channel.
            // This frontend-only claim is insecure.
            // For now, we proceed assuming frontend is enough for this example.

            const newBoostSpeed = (boostSpeed || 0) + 0.005; // Add to current boostSpeed

            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true,
                boostSpeed: newBoostSpeed // Save the new total boost speed
            }).then(() => {
                console.log("Boost task status and speed updated in Firestore.");
                boostTask1Completed = true; // Update local state
                boostSpeed = newBoostSpeed;  // Update local state
                updateBoostTaskUI(); // Update UI to show checkmark
                updateDisplay(); // Update total speed display on home screen etc.

                // If user was mining, the new speed will be picked up by startBalanceIncrement
                // No need to restart it explicitly unless calculation is complex
                // if (isMining) { startBalanceIncrement(); }

            }).catch(error => {
                console.error("Error updating boost task status:", error);
                showErrorMessage("Boost claim fail hua. Dobara try karein.");
                // Reset button state on failure
                boostButton.textContent = "Claim"; // Back to Claim state
                boostButton.disabled = false;
                boostButton.classList.add("claim");
            });
        }
    }

    function updateBoostTaskUI() {
        // Find the specific container for the task's action button/checkmark
        const taskActionContainer = document.querySelector('#boost-screen .task-item .task-action-container');
        if (!taskActionContainer) {
             console.warn("Boost task action container not found.");
             return;
        }

        // Clear previous content
        taskActionContainer.innerHTML = '';

        if (boostTask1Completed) {
            const checkMark = document.createElement('span');
            checkMark.className = 'task-complete-check';
            checkMark.textContent = '✓';
            taskActionContainer.appendChild(checkMark);
        } else {
            const button = document.createElement('button');
            button.className = 'task-button'; // Add appropriate classes
            button.id = 'boost-task-1'; // Keep the ID for the handler
            // Determine if button should say "Start" or "Claim"
            // This requires more complex state management or checking if the user
            // has clicked "Start" but not yet "Claim". For simplicity, default to "Start".
            // A better approach would involve storing a temporary "started" state.
            button.textContent = "Start";
            button.addEventListener('click', handleBoostTaskClick);
            taskActionContainer.appendChild(button);
        }
    }


    // --- Friend List Rendering ---
    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;

        // Clear previous list
        friendListContainer.innerHTML = '';

        // --- Placeholder Logic ---
        // You need to fetch actual friend data (users who were referred by currentUserId)
        // This usually involves a backend query or listening to a subcollection.
        // Example structure for a friend object (you need to define how you get this):
        // const friends = [
        //   { id: '123', name: 'Friend 1', joined: Date.now() - 86400000, active: true, boostGiven: 0.001, photoUrl: null },
        //   { id: '456', name: 'Friend 2', joined: Date.now() - 172800000, active: false, boostGiven: 0.001, photoUrl: 'some_url' }
        // ]; // Replace with actual data fetching

        if (!friends || friends.length === 0) {
            noFriendsMessage.style.display = 'block';
            friendListContainer.style.display = 'none'; // Hide container too
        } else {
            noFriendsMessage.style.display = 'none';
            friendListContainer.style.display = 'block'; // Show container

            friends.forEach(friend => {
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';

                const avatarHTML = friend.photoUrl
                    ? `<img src="${friend.photoUrl}" alt="pic" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';">` // Basic error handling for image
                    : '<i class="fas fa-user"></i>'; // Placeholder Icon

                const joinedDate = friend.joined ? new Date(friend.joined).toLocaleDateString() : 'N/A';
                const boostGiven = (friend.boostGiven || 0).toFixed(3); // Boost this specific friend provides

                friendEl.innerHTML = `
                    <div class="friend-info">
                        <div class="friend-avatar">${avatarHTML}</div>
                        <div class="friend-details">
                            <span class="friend-name">${friend.name || `User ${friend.id?.slice(-4) || '?'}`}</span>
                            <span class="friend-joined">Joined: ${joinedDate}</span>
                        </div>
                    </div>
                    <div class="friend-status">
                        <span class="friend-boost" style="visibility: ${friend.active && friend.boostGiven ? 'visible' : 'hidden'};">+${boostGiven}/h</span>
                        <span class="friend-activity ${friend.active ? 'active' : 'inactive'}">
                            ${friend.active ? 'Active' : 'Not active !'}
                        </span>
                    </div>
                `;
                friendListContainer.appendChild(friendEl);
            });
        }
     }

    // --- Data Loading ---
    async function loadUserDataFromFirestore() {
        if (!currentUserId || !isTmaEnvironment) {
            console.log("Cannot load data: No user ID or not in TMA environment.");
            return; // Exit if no user ID or not in Telegram
        }
        // Ensure Firebase is ready before trying to load
        /* if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
            showErrorMessage("Database connection not ready. Please wait.");
            return;
        } */
        const db = firebase.firestore();
        console.log("Loading user data from Firestore for user:", currentUserId);
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                const userData = doc.data();
                console.log("User data loaded:", userData);

                // Update local state variables from Firestore data
                balance = userData.balance || 0;
                miningEndTime = userData.miningEndTime ? userData.miningEndTime.toMillis() : 0;
                baseMiningSpeed = userData.baseMiningSpeed || 0.015;
                boostSpeed = userData.boostSpeed || 0;
                referralSpeed = userData.referralSpeed || 0; // Load speed (might be calculated by backend)
                totalReferrals = userData.totalReferrals || 0;
                activeReferrals = userData.activeReferrals || 0; // Needs backend logic to determine active ones
                boostTask1Completed = userData.boostTask1Completed || false;
                // friends = await fetchFriendsFromBackend(currentUserId); // Fetch actual friend data here

                // --- Resume Mining State ---
                const now = Date.now();
                if (miningEndTime && now < miningEndTime) {
                    isMining = true; // Set state BEFORE starting timers/intervals
                    console.log("Resuming previous mining session.");
                    startTimer();
                    startBalanceIncrement();
                    if(miningButton){
                         miningButton.textContent = 'Mining...';
                         miningButton.disabled = true;
                    }
                } else {
                    isMining = false;
                     // If mining time exists but has expired, clear it in Firestore
                    if (miningEndTime && now >= miningEndTime) {
                        console.log("Mining session expired, clearing Firestore time.");
                        userRef.update({ miningEndTime: null }).catch(e => console.error("Error clearing expired mining time", e));
                        miningEndTime = 0; // Clear local time too
                    }
                    // Ensure UI is in stopped state, don't save balance again here
                    stopMining(false);
                }

                updateBoostTaskUI(); // Update boost button state based on loaded data
                updateDisplay(); // Update all UI elements AFTER loading state and checking mining status

            } else {
                // User document NOT found. This implies an issue during the creation process in handleFirebaseLoginUsingTMA
                console.error(`User document for ${currentUserId} not found in Firestore! Should have been created.`);
                showErrorMessage("User data error. Please restart the app.");
                // Avoid automatically trying to create again here to prevent loops.
                // handleFirebaseLoginUsingTMA(currentUserData); // Risky - could loop
            }
        } catch (error) {
            console.error("Error loading user data from Firestore:", error);
            showErrorMessage("Data load karne mein error hua.");
            // Maybe show a retry button or specific error screen
        }
    }

    // --- User Login/Registration ---
    function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId || !isTmaEnvironment) {
             console.error("handleFirebaseLoginUsingTMA called without UserID or not in TMA env.");
             return;
        }
        // Ensure Firebase is ready
       /*  if (!firebase || !firebase.apps.length || typeof firebase.firestore !== 'function') {
            showErrorMessage("Database connection not ready. Login failed.");
            return;
        } */
        const db = firebase.firestore();
        console.log("Handling Firebase login/registration for TMA user ID:", currentUserId);
        const userRef = db.collection('users').doc(currentUserId);

        userRef.get().then(doc => {
            if (doc.exists) {
                // --- EXISTING USER ---
                console.log("TMA User exists in Firestore. Updating last login and potentially profile info.");
                const updatePayload = {
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    // Only update profile fields if they are different or non-null in TMA data
                    firstName: tmaUserData.first_name || doc.data().firstName || null,
                    username: tmaUserData.username || doc.data().username || null, // Be careful with username updates
                    photoUrl: tmaUserData.photo_url || doc.data().photoUrl || null,
                    isPremium: tmaUserData.is_premium || false,
                    languageCode: tmaUserData.language_code || 'en',
                };
                userRef.update(updatePayload)
                    .then(() => {
                        console.log("Existing user login time and profile updated.");
                        loadUserDataFromFirestore(); // Load data after update
                    })
                    .catch(error => {
                         console.error("Error updating existing TMA user:", error);
                         loadUserDataFromFirestore(); // Attempt to load data even if update fails
                     });
            } else {
                // --- NEW USER ---
                console.log("New TMA user. Creating Firestore entry.");
                // Retrieve referral ID captured during initialization
                const referredByUserId = referrerIdFromLink; // Use the stored variable

                 const defaultData = {
                    telegramId: currentUserId,
                    firstName: tmaUserData.first_name || null,
                    username: tmaUserData.username || null,
                    photoUrl: tmaUserData.photo_url || null,
                    isPremium: tmaUserData.is_premium || false,
                    languageCode: tmaUserData.language_code || 'en',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    balance: 0.0000,
                    miningEndTime: null,
                    baseMiningSpeed: 0.015, // Initial base speed
                    boostSpeed: 0,         // Initial boost speed
                    referralSpeed: 0,      // Initial referral speed
                    totalReferrals: 0,     // Initial referral count
                    activeReferrals: 0,    // Initial active count
                    boostTask1Completed: false, // Initial task status
                    // friends: [], // Avoid storing large friend lists directly here

                    // -------->>> Store the referrer ID if available <<<--------
                    referredBy: referredByUserId || null
                };

                console.log("Creating user with data:", defaultData);

                // Set the data for the new user
                userRef.set(defaultData)
                    .then(() => {
                        console.log("New user document created successfully.");
                        // Load the newly created user's data
                        loadUserDataFromFirestore();

                        // -------->>> Log if referred and remind about backend <<<--------
                        if (referredByUserId) {
                            console.log(`User ${currentUserId} was referred by ${referredByUserId}.`);
                            console.warn("REMINDER: A Backend Cloud Function is required to update the referrer's ('${referredByUserId}') totalReferrals count and potentially their referralSpeed.");
                            // Future: Trigger cloud function:
                            // firebase.functions().httpsCallable('processReferral')({ referredUserId: currentUserId, referrerId: referredByUserId });
                        }
                    })
                    .catch(error => {
                        console.error("Error creating new user document:", error);
                        showErrorMessage("User profile banane mein error hua.");
                         // Consider what should happen if user creation fails - retry? Show error screen?
                    });
            }
        }).catch(error => {
            console.error("Error getting user document during login/registration:", error);
            showErrorMessage("User data check karne mein error hua.");
            // Critical error, maybe disable app features
        });
    }

    // --- Function to Display Error Messages ---
    function showErrorMessage(message) {
        console.error("UI Error:", message);
        // Use a dedicated error area if available
        const errorDiv = errorMessageArea || document.getElementById('error-message-area-friends') || document.getElementById('error-message-area-boost');
        if (errorDiv) {
          errorDiv.textContent = message;
          errorDiv.style.display = 'block';
          // Optional: Hide after a few seconds
          setTimeout(() => { if(errorDiv) errorDiv.style.display = 'none'; }, 5000);
        } else {
            // Fallback to alert if no specific area is found
            alert(message);
        }
    }

     // --- Firebase Initialization ---
    function initFirebase() {
        // <<< IMPORTANT >>>
        // PASTE YOUR FIREBASE CONFIGURATION AND INITIALIZATION CODE HERE
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY", // Replace
            authDomain: "YOUR_PROJECT_ID.firebaseapp.com", // Replace
            projectId: "YOUR_PROJECT_ID", // Replace
            storageBucket: "YOUR_PROJECT_ID.appspot.com", // Replace
            messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // Replace
            appId: "YOUR_APP_ID", // Replace
            // databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com" // Add if using Realtime DB
        };

        console.log("Initializing Firebase...");
        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
                console.log("Firebase initialized successfully.");
            } else {
                firebase.app(); // if already initialized, use that app
                console.log("Firebase already initialized.");
            }
            // Test Firestore availability
            firebase.firestore();
            console.log("Firestore service is available.");
            return true; // Indicate success
        } catch (e) {
            console.error("Firebase initialization or Firestore check failed:", e);
            showErrorMessage("Database connection error.");
            return false; // Indicate failure
        }
    }


    // --- Event Listeners Setup ---
    function setupEventListeners() {
        console.log("Setting up event listeners...");

        // Navigation
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetScreenId = item.dataset.target;
                if (targetScreenId) {
                    switchScreen(targetScreenId);
                } else {
                    console.warn("Nav item clicked without data-target:", item);
                }
            });
        });

        // Mining Button
        if (miningButton) {
            miningButton.addEventListener('click', () => {
                if (!isMining) {
                    startMining();
                } else {
                    console.log("Already mining. Button click ignored.");
                    // Optional: Show a message like "Mining session active"
                    // tg?.showPopup({ message: 'Mining session is already active!' });
                }
            });
        } else {
             console.warn("Mining button element not found.");
        }

        // Boost Task Button listener is added dynamically in updateBoostTaskUI

        // Copy Referral Link Button
        if (copyLinkButton) {
            copyLinkButton.addEventListener('click', () => {
                if (!currentUserId || !isTmaEnvironment) {
                    showErrorMessage("Cannot create link. User not identified.");
                    return;
                }
                const miniAppShortName = 'Play'; // <<< CONFIRM THIS is correct from BotFather
                const botUsername = "BitaMiningbot"; // <<< CONFIRM THIS is your bot username without @
                const linkToCopy = `https://t.me/${botUsername}/${miniAppShortName}?start=${currentUserId}`;

                console.log("Attempting to copy link:", linkToCopy);

                // Prefer Telegram's clipboard method
                if (tg && tg.clipboardWriteText) {
                    tg.clipboardWriteText(linkToCopy, (success) => {
                        if (success) {
                            console.log("Link copied via tg.clipboardWriteText");
                            tg.showPopup({ message: 'Referral link copied!' });
                        } else {
                            console.warn("tg.clipboardWriteText failed, trying fallback.");
                            // Fallback to browser's clipboard API
                            navigator.clipboard.writeText(linkToCopy).then(() => {
                                 console.log("Link copied via navigator.clipboard");
                                 // Show popup even on fallback success if possible
                                 tg?.showPopup({ message: 'Link copied!' });
                             }).catch(err => {
                                 console.error('Fallback clipboard write failed:', err);
                                 showErrorMessage('Could not copy link. Please copy manually.');
                                 // Optionally display the link for manual copy
                                 // showErrorMessage(`Copy manually: ${linkToCopy}`);
                             });
                        }
                    });
                } else {
                     // Fallback if tg object or method is unavailable
                     console.warn("tg.clipboardWriteText not available, using navigator.clipboard.");
                     navigator.clipboard.writeText(linkToCopy).then(() => {
                         console.log("Link copied via navigator.clipboard (no TMA)");
                         alert('Referral link copied!'); // Simple alert for non-TMA/fallback
                     }).catch(err => {
                         console.error('Clipboard write failed:', err);
                         showErrorMessage('Could not copy link.');
                     });
                }
            });
        } else {
             console.warn("Copy link button element not found.");
        }
    }


    // --- Application Initialization ---
    function initializeApp() {
        console.log("Initializing Bita Mining App...");
        if (tg && tg.initDataUnsafe?.user?.id) { // Check for SDK and User ID upfront
            console.log("Telegram WebApp SDK found and User ID present.");
            isTmaEnvironment = true;
            tg.ready(); // Inform SDK the app is ready

             // <<< ADDED: Read start_param immediately after confirming TMA env >>>
            referrerIdFromLink = tg.initDataUnsafe?.start_param;
            if (referrerIdFromLink) {
                 console.log(`App launched with referral ID (start_param): ${referrerIdFromLink}`);
            } else {
                 console.log("App launched without referral ID.");
            }
            // <<< END ADDED >>>

            tg.expand(); // Expand the app window

             // Configure Back Button
            tg.BackButton.onClick(() => {
                const homeScreen = document.getElementById('home-screen');
                 if (homeScreen && !homeScreen.classList.contains('active')) {
                      switchScreen('home-screen'); // Go back to home if not there
                 } else {
                      console.log("Back button clicked on home screen or home screen not found.");
                 }
            });
             tg.BackButton.hide(); // Initially hide on home screen

            // Get User Data
            currentUserData = tg.initDataUnsafe.user;
            currentUserId = String(currentUserData.id); // Store User ID as string
            console.log("User ID:", currentUserId);

            // Initialize Firebase
            const firebaseReady = initFirebase(); // <<< Make sure this is called

            if (firebaseReady) {
                 console.log("Firebase seems ready, proceeding with login/registration.");
                 // Login/Register the user in Firebase (this will also load data)
                 handleFirebaseLoginUsingTMA(currentUserData);
                 // Setup event listeners after user context is established
                 setupEventListeners();
                 // Set initial screen (usually home)
                 switchScreen('home-screen'); // Ensure home screen is active initially
            } else {
                 console.error("Firebase initialization failed. App functionality will be severely limited.");
                 showErrorMessage("Cannot connect to services. Please try again later.");
                 // Maybe disable all interactive elements
                 document.querySelectorAll('button').forEach(b => b.disabled = true);
            }

        } else {
            console.error("Initialization failed: Telegram WebApp SDK not found or User ID missing.");
            isTmaEnvironment = false;
            showErrorMessage("App can only be used inside Telegram. Please restart.");
            // Display a clear error message to the user
            document.body.innerHTML = '<div style="padding: 20px; text-align: center;"><h1>Initialization Error</h1><p>Could not verify Telegram User or environment. Please ensure you are opening this within the Telegram app and try again.</p></div>';
        }
    }

    // --- Start the application ---
    initializeApp();

}); // End DOMContentLoaded