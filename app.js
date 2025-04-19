document.addEventListener('DOMContentLoaded', () => {
    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null; // Sabse important: User ki unique Telegram ID
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp; // Optional chaining for safety

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
    const boostTaskButton = document.getElementById('boost-task-1'); // Will be assigned later if exists
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const copyLinkButton = document.querySelector('.copy-link-button');

    // --- State Variables (Will be loaded from Firebase) ---
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
    let friends = []; // Placeholder, needs Firebase integration
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0;

    // --- Core Functions ---

    function formatBalance(num) { return (typeof num === 'number' ? num.toFixed(4) : '0.0000'); }
    function calculateUsdEquivalent(betaBalance) { const rate = 4.00; return (typeof betaBalance === 'number' ? (betaBalance * rate).toFixed(2) : '0.00'); }
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
        if (!document.getElementById('home-screen').classList.contains('active')) return; // Update only if home is active

        const totalSpeed = calculateTotalSpeed();
        if (balanceEl) balanceEl.textContent = formatBalance(balance);
        if (usdEquivalentEl) usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
        if (activeReferralsEl) activeReferralsEl.textContent = activeReferrals;
        if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;
        if (miningSpeedEl) miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;
        // Friend list update can be separated if needed
        if (friendsTotalCountEl) friendsTotalCountEl.textContent = `${totalReferrals} users`;
        renderFriendList();
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
                 stopMining(); // Automatically stop if timer runs out
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
            updateDisplay(); // Update UI every second

            const now = Date.now();
            if (now - lastBalanceUpdateTime > 60000) { // Check if 60 seconds passed
                saveBalanceToFirebase();
                lastBalanceUpdateTime = now;
            }
        }, 1000);
    }

    function saveBalanceToFirebase() {
        if (!currentUserId || typeof balance !== 'number') return;
        const db = firebase.firestore(); // Get Firestore instance
        console.log(`Saving balance ${balance.toFixed(4)} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: balance })
            .then(() => console.log(`Balance (${balance.toFixed(4)}) successfully updated.`))
            .catch(error => console.error("Error updating balance:", error));
    }

    function startMining() {
        if (isMining || !currentUserId) return;
        const db = firebase.firestore();

        console.log("Attempting to start mining...");
        isMining = true;
        miningEndTime = Date.now() + MINING_DURATION_MS;
        lastBalanceUpdateTime = Date.now(); // Reset balance save timer

        if (miningButton) {
            miningButton.textContent = 'Mining...';
            miningButton.disabled = true;
        }

        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(miningEndTime)
        }).then(() => {
            console.log("Mining session started. Ends at:", new Date(miningEndTime));
            startTimer();
            startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining session:", error);
            // Rollback state and UI
            isMining = false;
            miningEndTime = 0;
            if (miningButton) {
                 miningButton.textContent = 'Start Mining';
                 miningButton.disabled = false;
            }
            showErrorMessage("Mining start nahi ho paya. Dobara try karein.");
        });
    }

    function stopMining(saveFinalBalance = true) {
        if (!isMining && miningTimerEl && miningTimerEl.textContent === "00:00:00") return; // Already stopped

        console.log("Stopping mining...");
        const wasMining = !!miningInterval; // Check if interval was running before clearing

        isMining = false; // Set state first
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;
        miningEndTime = 0; // Reset local end time

        if (miningTimerEl) miningTimerEl.textContent = "00:00:00";
        if (miningButton) {
            miningButton.textContent = 'Start Mining';
            miningButton.disabled = false;
        }

        if (currentUserId) {
            const db = firebase.firestore();
            const updateData = { miningEndTime: null };

            if (saveFinalBalance && wasMining) {
                updateData.balance = balance;
                console.log(`Saving final balance ${balance.toFixed(4)} on stop.`);
            } else {
                 console.log("Not saving final balance on this stop.");
            }

            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => console.log("Mining session stopped in Firestore."))
                .catch(error => console.error("Error stopping mining session:", error));
        }
    }

    function switchScreen(targetId) {
        screens.forEach(screen => {
            screen.classList.remove('active');
            if (screen.id === targetId) {
                screen.classList.add('active');
            }
        });
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.target === targetId) {
                item.classList.add('active');
            }
        });

        // Update display specifically for home screen if switching to it
        if (targetId === 'home-screen') {
             updateDisplay(); // Ensure home screen data is fresh
             tg?.BackButton.hide();
        } else {
             tg?.BackButton.show();
        }
    }

    function handleBoostTaskClick() {
        if (!currentUserId) return; // Check user ID
        const db = firebase.firestore();
        const boostButton = document.getElementById('boost-task-1'); // Find the button inside the function
        if (!boostButton) return; // Check if button exists

        const currentButtonState = boostButton.textContent;

        if (boostTask1Completed) {
            console.log("Boost task already completed.");
            return;
        }

        if (currentButtonState === "Start") {
            console.log("Starting boost task: Join channel");
            if (tg) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // Correct Channel Link
                 // Assume user joined, change state to Claim
                 boostButton.textContent = "Claim";
                 boostButton.classList.add("claim");
            } else {
                 showErrorMessage("Telegram action not available.");
            }
            return; // Wait for user to click Claim
        }

        if (currentButtonState === "Claim") {
            console.log("Claiming boost reward...");
            // Show loading state maybe?
            boostButton.textContent = "Claiming...";
            boostButton.disabled = true;

            const newBoostSpeed = boostSpeed + 0.005;

            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true,
                boostSpeed: newBoostSpeed
            }).then(() => {
                console.log("Boost task status and speed updated.");
                boostTask1Completed = true; // Update local state
                boostSpeed = newBoostSpeed;
                updateBoostTaskUI(); // Update UI to checkmark
                updateDisplay(); // Update total speed display

                if (isMining) { // Restart increment if mining
                    startBalanceIncrement();
                }
            }).catch(error => {
                console.error("Error updating boost task status:", error);
                showErrorMessage("Boost claim fail hua. Dobara try karein.");
                // Reset button state on failure
                boostButton.textContent = "Claim";
                boostButton.disabled = false;
            });
        }
    }

    function updateBoostTaskUI() {
        const taskItem = document.querySelector('#boost-screen .task-item'); // Be more specific finding the task item
        if (!taskItem) return;

        const existingButton = taskItem.querySelector('#boost-task-1');
        const existingCheckmark = taskItem.querySelector('.task-complete-check');

        if (boostTask1Completed) {
            if (existingButton) { // If button exists, replace with checkmark
                const checkMark = document.createElement('span');
                checkMark.className = 'task-complete-check';
                checkMark.textContent = '✓';
                existingButton.parentNode.replaceChild(checkMark, existingButton);
            } else if (!existingCheckmark) { // If neither exists, add checkmark
                const checkMark = document.createElement('span');
                checkMark.className = 'task-complete-check';
                checkMark.textContent = '✓';
                taskItem.appendChild(checkMark);
            }
        } else { // Task not completed
            if (existingCheckmark) { // If checkmark exists, replace with button
                const newButton = document.createElement('button');
                newButton.className = 'task-button';
                newButton.id = 'boost-task-1';
                newButton.textContent = "Start"; // Default state
                newButton.addEventListener('click', handleBoostTaskClick);
                existingCheckmark.parentNode.replaceChild(newButton, existingCheckmark);
            } else if (!existingButton) { // If neither exists, add button
                 const newButton = document.createElement('button');
                 newButton.className = 'task-button';
                 newButton.id = 'boost-task-1';
                 newButton.textContent = "Start"; // Default state
                 newButton.addEventListener('click', handleBoostTaskClick);
                 taskItem.appendChild(newButton);
            } else {
                 // Ensure button is in correct state if it already exists
                 existingButton.textContent = "Start";
                 existingButton.classList.remove("claim");
                 existingButton.disabled = false;
            }
        }
    }

    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;
        // Placeholder - Needs real data from Firebase
        friendListContainer.innerHTML = '';
        if (friends.length === 0) {
            noFriendsMessage.style.display = 'block';
        } else {
            noFriendsMessage.style.display = 'none';
            friends.forEach(friend => {
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';
                 friendEl.innerHTML = `
                    <div class="friend-info">
                        <div class="friend-avatar"><i class="fas fa-user"></i></div>
                        <div class="friend-details">
                            <span class="friend-name">${friend.name}</span>
                            <span class="friend-joined">${friend.joined}</span>
                        </div>
                    </div>
                    <div class="friend-status">
                        <span class="friend-boost">+ 0.005/h</span>
                        <span class="friend-activity ${friend.active ? 'active' : 'inactive'}">
                            ${friend.active ? 'Active' : 'Not active !'}
                        </span>
                    </div>
                `;
                if (!friend.active) {
                     friendEl.querySelector('.friend-boost').style.visibility = 'hidden';
                 }
                friendListContainer.appendChild(friendEl);
            });
        }
     }

    async function loadUserDataFromFirestore() {
        if (!currentUserId) return; // Should not happen if init worked
        const db = firebase.firestore();
        console.log("Loading user data from Firestore for user:", currentUserId);
        const userRef = db.collection('users').doc(currentUserId);

        try {
            const doc = await userRef.get();
            if (doc.exists) {
                const userData = doc.data();
                console.log("User data loaded:", userData);

                balance = userData.balance || 0;
                miningEndTime = userData.miningEndTime ? userData.miningEndTime.toMillis() : 0;
                baseMiningSpeed = userData.baseMiningSpeed || 0.015;
                boostSpeed = userData.boostSpeed || 0;
                referralSpeed = userData.referralSpeed || 0;
                totalReferrals = userData.totalReferrals || 0;
                activeReferrals = userData.activeReferrals || 0;
                boostTask1Completed = userData.boostTask1Completed || false;
                // friends = userData.friends || []; // Load friends if stored directly

                const now = Date.now();
                if (miningEndTime && now < miningEndTime) {
                    isMining = true; // Set state BEFORE starting timers/intervals
                    startTimer();
                    startBalanceIncrement();
                    if(miningButton){
                         miningButton.textContent = 'Mining...';
                         miningButton.disabled = true;
                    }
                    console.log("Resuming previous mining session.");
                } else {
                    isMining = false;
                    if (miningEndTime && now >= miningEndTime) {
                        // Don't await here, just let stopMining handle UI/local state
                        userRef.update({ miningEndTime: null }).catch(e => console.error("Error clearing expired mining time", e));
                        miningEndTime = 0; // Clear local time too
                    }
                    stopMining(false); // Stop without saving balance again, just update UI
                }

                updateBoostTaskUI(); // Update boost button state based on loaded data
                updateDisplay(); // Update all UI elements AFTER loading state

            } else { // User document doesn't exist (should not happen after login logic)
                console.error("User document not found in Firestore during load!");
                 showErrorMessage("User data nahi mila. App dobara kholein.");
                 // Maybe try to re-run login logic?
                 handleFirebaseLoginUsingTMA(currentUserData); // Try creating the user again
            }
        } catch (error) {
            console.error("Error loading user data from Firestore:", error);
            showErrorMessage("Data load karne mein error hua.");
        }
    }

    function handleFirebaseLoginUsingTMA(tmaUserData) {
        if (!currentUserId) return; // Already checked in initializeApp
        const db = firebase.firestore();
        console.log("Handling Firebase login for TMA user ID:", currentUserId);
        const userRef = db.collection('users').doc(currentUserId);

        userRef.get().then(doc => {
            if (doc.exists) {
                console.log("TMA User exists. Updating last login.");
                userRef.update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                    firstName: tmaUserData.first_name || doc.data().firstName || null,
                    username: tmaUserData.username || doc.data().username || null,
                    photoUrl: tmaUserData.photo_url || doc.data().photoUrl || null,
                }).then(loadUserDataFromFirestore) // Load data after update
                  .catch(error => console.error("Error updating existing TMA user:", error));
            } else {
                console.log("New TMA user. Creating Firestore entry.");
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
                    baseMiningSpeed: 0.015,
                    boostSpeed: 0,
                    referralSpeed: 0,
                    totalReferrals: 0,
                    activeReferrals: 0,
                    boostTask1Completed: false,
                    referrals: [] // Stores IDs of users referred BY this user
                    // invitedBy: null // Optionally store who invited this user
                 };
                userRef.set(defaultData).then(loadUserDataFromFirestore) // Load data after creating
                  .catch(error => console.error("Error creating new TMA user:", error));
            }
        }).catch(error => {
            console.error("Firebase get user error (TMA):", error);
            showErrorMessage("Database se connect nahi ho pa raha.");
        });
    }

    function showErrorMessage(message) { alert(message); }
    function showFallbackMessage(message) {
        // Don't replace body, show an overlay message
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'fallback-message-container'; // Use CSS class for styling
        fallbackDiv.textContent = message;
        document.body.appendChild(fallbackDiv);
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        if (miningButton) miningButton.addEventListener('click', startMining);

        navItems.forEach(item => {
            item?.addEventListener('click', () => {
                // Ensure targetId is valid before switching
                 const targetId = item.dataset.target;
                 if (document.getElementById(targetId)) {
                     switchScreen(targetId);
                 } else {
                     console.warn(`Screen with ID "${targetId}" not found.`);
                 }
            });
        });

        // Find boost button *after* DOM is potentially ready
        const boostBtn = document.getElementById('boost-task-1');
        if (boostBtn) {
            boostBtn.addEventListener('click', handleBoostTaskClick);
        } else {
             // If boost screen isn't active initially, listener might need to be added
             // when the screen becomes active, or use event delegation.
             // For now, log if not found initially.
             console.log("Boost task button not found on initial load (may be on inactive screen).");
             // We might need to re-run updateBoostTaskUI or add listener when boost screen is shown.
        }


        if (copyLinkButton) copyLinkButton.addEventListener('click', () => {
            if (!currentUserId) {
                showErrorMessage("Please wait for login to complete.");
                return;
            }
            // Updated referral link with correct bot username
            const linkToCopy = `https://t.me/Bita_Mining_Bot?start=${currentUserId}`; // Correct Bot Username
            navigator.clipboard.writeText(linkToCopy)
                .then(() => { alert('Invite link copied!'); })
                .catch(err => { console.error('Failed to copy link: ', err); alert('Could not copy link.'); });
        });

         // Re-check boost button and update its UI/listener when boost screen becomes active
        const boostScreenObserver = new MutationObserver((mutationsList, observer) => {
            for(const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const boostScreen = document.getElementById('boost-screen');
                    if (boostScreen && boostScreen.classList.contains('active')) {
                        console.log("Boost screen activated, ensuring button listener and UI.");
                        const boostBtn = document.getElementById('boost-task-1');
                        if (boostBtn && !boostBtn.hasAttribute('data-listener-attached')) {
                            boostBtn.addEventListener('click', handleBoostTaskClick);
                            boostBtn.setAttribute('data-listener-attached', 'true'); // Mark as attached
                        }
                        updateBoostTaskUI(); // Ensure UI is correct
                    }
                }
            }
        });
        const boostScreenNode = document.getElementById('boost-screen');
        if(boostScreenNode) {
             boostScreenObserver.observe(boostScreenNode, { attributes: true });
        }

    }


    // --- Initialization ---
    function initializeApp() {
        console.log("Initializing App...");

        // Make sure Firebase is initialized (check added in HTML already)
        if (typeof firebase === 'undefined' || firebase.apps.length === 0) {
             console.error("Firebase is not available or not initialized!");
             showErrorMessage("Database connection error. Please reload.");
             return; // Stop initialization if Firebase is not ready
        }


        if (tg) {
            isTmaEnvironment = true;
            tg.ready(); // Let Telegram know the app is ready
            console.log("Telegram WebApp is ready.");

            currentUserData = tg.initDataUnsafe?.user;

            if (currentUserData && currentUserData.id) {
                currentUserId = String(currentUserData.id);
                console.log("TMA User ID:", currentUserId, "Data:", currentUserData);

                // Start Firebase login -> load data -> update UI
                handleFirebaseLoginUsingTMA(currentUserData);

                // Setup event listeners after we know the user context might be loading
                setupEventListeners();

                 // Configure Back Button
                 tg.BackButton.onClick(() => {
                     const homeScreen = document.getElementById('home-screen');
                     if (homeScreen && !homeScreen.classList.contains('active')) {
                         switchScreen('home-screen'); // Go back to home
                     } else {
                          tg.close(); // Close app if on home screen
                     }
                 });
                 // Back button is hidden by default, show it when navigating away from home

            } else { // Could not get user data from TMA
                console.error("TMA Environment: Could not get user data from initDataUnsafe.");
                showErrorMessage("User data load nahi ho pa raha hai. App ko bot se dobara kholein.");
                // Maybe hide the app container and just show the error?
            }
            tg.expand(); // Expand the app window
        } else { // Not running in TMA
            console.warn("Not running in Telegram Mini App environment.");
            showFallbackMessage("Please open this app from your Telegram bot.");
            // Don't setup listeners or try to load data if not in TMA
        }
    }

    // --- Start the App ---
    initializeApp();

}); // End of DOMContentLoaded