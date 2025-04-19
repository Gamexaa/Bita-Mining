document.addEventListener('DOMContentLoaded', () => {
    // --- Telegram Mini App Integration ---
    let currentUserData = null;
    let currentUserId = null; // Sabse important: User ki unique Telegram ID
    let isTmaEnvironment = false;
    const tg = window.Telegram?.WebApp; // Optional chaining use karo safety ke liye

    // --- DOM Elements ---
    // (Ye waise hi rahenge jaise aapke code mein the)
    const balanceEl = document.getElementById('balance');
    const usdEquivalentEl = document.getElementById('usd-equivalent');
    const activeReferralsEl = document.getElementById('active-referrals');
    const totalReferralsEl = document.getElementById('total-referrals');
    const miningTimerEl = document.getElementById('mining-timer');
    const miningSpeedEl = document.getElementById('mining-speed');
    const miningButton = document.getElementById('mining-button');
    const screens = document.querySelectorAll('.screen');
    const navItems = document.querySelectorAll('.nav-item');
    const boostTaskButton = document.getElementById('boost-task-1');
    const friendsTotalCountEl = document.getElementById('friends-total-count');
    const friendListContainer = document.getElementById('friend-list-container');
    const noFriendsMessage = document.getElementById('no-friends-message');
    const copyLinkButton = document.querySelector('.copy-link-button');

    // --- Firebase Reference (Assume firebase is initialized in HTML) ---
    // NOTE: Make sure firebase.initializeApp is called BEFORE this script runs in your HTML
    const db = firebase.firestore(); // Make sure this line runs after Firebase is initialized

    // --- State Variables (Ab ye Firebase se load honge) ---
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
    let friends = []; // Isko bhi Firebase se load karna padega future mein
    let boostTask1Completed = false;
    let lastBalanceUpdateTime = 0; // Track time for batch balance update

    // --- Core Functions (Mostly same, but persistence changes) ---

    function formatBalance(num) { return num.toFixed(4); }
    function calculateUsdEquivalent(betaBalance) { const rate = 4.00; return (betaBalance * rate).toFixed(2); }
    function calculateTotalSpeed() { return baseMiningSpeed + boostSpeed + referralSpeed; }
    function formatTime(ms) { /* ... (same as before) ... */
        if (ms <= 0) return "00:00:00";
        let totalSeconds = Math.floor(ms / 1000);
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds % 3600) / 60);
        let seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function updateDisplay() { /* ... (same as before, just uses current state variables) ... */
        if (!balanceEl) return; // Make sure elements exist before updating

        const totalSpeed = calculateTotalSpeed();
        balanceEl.textContent = formatBalance(balance);
        usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
        activeReferralsEl.textContent = activeReferrals;
        totalReferralsEl.textContent = totalReferrals;
        miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;

        friendsTotalCountEl.textContent = `${totalReferrals} users`;
        renderFriendList(); // Friend list display (uses local 'friends' array for now)
    }

    function startTimer() { /* ... (same as before) ... */
        if (timerInterval) clearInterval(timerInterval);
        updateTimer();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimer() { /* ... (same as before) ... */
        const now = Date.now();
        const timeLeft = miningEndTime - now;

        if (timeLeft <= 0) {
            stopMining(); // Automatically stop if timer runs out
        } else {
            miningTimerEl.textContent = formatTime(timeLeft);
        }
    }

    // MODIFIED: Save balance periodically to Firebase
    function startBalanceIncrement() {
        if (miningInterval) clearInterval(miningInterval);
        console.log("Starting balance increment...");

        const incrementPerSecond = calculateTotalSpeed() / 3600;
        let secondsElapsed = 0;

        miningInterval = setInterval(() => {
            if (!isMining || !currentUserId) {
                clearInterval(miningInterval);
                miningInterval = null;
                console.log("Balance increment stopped (not mining or no user ID).");
                return;
            }

            balance += incrementPerSecond;
            secondsElapsed++;
            updateDisplay(); // Update UI every second

            // --- Firebase Update (Batched) ---
            // Save approx every 60 seconds OR when mining stops
            const now = Date.now();
            if (now - lastBalanceUpdateTime > 60000) { // Check if 60 seconds passed
                 saveBalanceToFirebase(); // Call helper function to save
                 lastBalanceUpdateTime = now; // Reset timer
            }
            // --- End Firebase Update ---

        }, 1000);
    }

    // Helper function to save balance
    function saveBalanceToFirebase() {
        if (!currentUserId) return;
        console.log(`Saving balance ${balance.toFixed(4)} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: balance })
            .then(() => {
                console.log(`Balance (${balance.toFixed(4)}) successfully updated in Firestore.`);
            })
            .catch(error => {
                console.error("Error updating balance to Firestore:", error);
            });
    }


    // MODIFIED: Update Firebase on Start
    function startMining() {
        if (isMining || !currentUserId) return; // Already mining or no user

        console.log("Attempting to start mining...");
        isMining = true;
        miningEndTime = Date.now() + MINING_DURATION_MS;
        lastBalanceUpdateTime = Date.now(); // Reset balance save timer

        // Update UI immediately
        miningButton.textContent = 'Mining...';
        miningButton.disabled = true;

        // --- Firebase Update ---
        db.collection('users').doc(currentUserId).update({
            miningEndTime: firebase.firestore.Timestamp.fromMillis(miningEndTime),
            // Optionally save current balance when starting
            // balance: balance
        }).then(() => {
            console.log("Mining session started in Firestore. Ends at:", new Date(miningEndTime));
            // Start local timers ONLY after successful Firebase update
            startTimer();
            startBalanceIncrement();
        }).catch(error => {
            console.error("Error starting mining session in Firestore:", error);
            // Rollback UI changes if Firebase update fails
            isMining = false;
            miningEndTime = 0;
            miningButton.textContent = 'Start Mining';
            miningButton.disabled = false;
            showErrorMessage("Mining start nahi ho paya. Dobara try karein.");
        });
        // --- End Firebase Update ---
    }

    // MODIFIED: Update Firebase on Stop
    function stopMining(saveFinalBalance = true) {
        if (!isMining && miningTimerEl.textContent === "00:00:00") return; // Already stopped

        console.log("Stopping mining...");
        isMining = false;
        const wasMining = !!miningInterval; // Check if interval was running

        // Clear local timers
        if (miningInterval) clearInterval(miningInterval);
        if (timerInterval) clearInterval(timerInterval);
        miningInterval = null;
        timerInterval = null;

        // Update UI
        miningTimerEl.textContent = "00:00:00";
        miningButton.textContent = 'Start Mining';
        miningButton.disabled = false;

        // --- Firebase Update ---
        if (currentUserId) {
            const updateData = { miningEndTime: null };
            // Save the final balance when stopping
            if (saveFinalBalance && wasMining) {
                updateData.balance = balance; // Save the final calculated balance
                console.log(`Saving final balance ${balance.toFixed(4)} on stop.`);
            }

            db.collection('users').doc(currentUserId).update(updateData)
                .then(() => {
                    console.log("Mining session stopped in Firestore.");
                })
                .catch(error => {
                    console.error("Error stopping mining session in Firestore:", error);
                });
        }
        // --- End Firebase Update ---

        miningEndTime = 0; // Reset local end time
    }


    function switchScreen(targetId) { /* ... (same as before) ... */
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
         // Optional: Show/Hide Telegram Back button based on screen
         if (targetId === 'home-screen') {
             tg?.BackButton.hide();
         } else {
             tg?.BackButton.show();
         }
    }

    // MODIFIED: Update Firebase on Claim
    function handleBoostTaskClick() {
        if (!currentUserId || !boostTaskButton) return; // No user or button doesn't exist

        const currentButtonState = boostTaskButton.textContent;

        if (boostTask1Completed) {
            console.log("Boost task already completed.");
            return;
        }

        // Logic for "Start" state (e.g., open channel)
        if (currentButtonState === "Start") {
            console.log("Starting boost task: Join channel");
            // Add code here to open the Telegram channel link using tg.openTelegramLink()
            tg.openTelegramLink("https://t.me/Bita_Community"); // <<<<<< Apna Channel Link Daalo

            // Change button to "Claim" state (maybe after a delay or verification)
            // For now, change immediately for testing
            boostTaskButton.textContent = "Claim";
            boostTaskButton.classList.add("claim");
            return; // Wait for user to click Claim
        }

        // Logic for "Claim" state
        if (currentButtonState === "Claim") {
            console.log("Claiming boost reward...");
            const newBoostSpeed = boostSpeed + 0.005;

            // --- Firebase Update ---
            db.collection('users').doc(currentUserId).update({
                boostTask1Completed: true,
                boostSpeed: newBoostSpeed
            }).then(() => {
                console.log("Boost task status and speed updated in Firestore.");
                // Update local state ONLY after successful save
                boostTask1Completed = true;
                boostSpeed = newBoostSpeed;
                updateBoostTaskUI(); // Update the button to checkmark
                updateDisplay(); // Update total speed display

                // Restart balance increment if mining is active to reflect new speed
                if (isMining) {
                    startBalanceIncrement();
                }
            }).catch(error => {
                console.error("Error updating boost task status:", error);
                showErrorMessage("Boost claim fail hua. Dobara try karein.");
            });
            // --- End Firebase Update ---
        }
    }

    // Helper function to update boost task UI element
    function updateBoostTaskUI() {
        const boostButton = document.getElementById('boost-task-1'); // Find button again
        const taskItem = boostButton ? boostButton.closest('.task-item') : document.querySelector('.task-item'); // Find parent or first task item

        if (!taskItem) return;

        const existingCheckmark = taskItem.querySelector('.task-complete-check');
        if (existingCheckmark) existingCheckmark.remove(); // Remove old checkmark

        let buttonInDom = taskItem.querySelector('#boost-task-1'); // Check if button exists now

        if (boostTask1Completed) {
            if (buttonInDom) {
                const checkMark = document.createElement('span');
                checkMark.className = 'task-complete-check';
                checkMark.textContent = '✓';
                buttonInDom.parentNode.replaceChild(checkMark, buttonInDom);
            } else if (!taskItem.querySelector('.task-complete-check')) {
                 // If button was already replaced but state says complete, add checkmark
                 const checkMark = document.createElement('span');
                 checkMark.className = 'task-complete-check';
                 checkMark.textContent = '✓';
                 // Find a place to append it, e.g., after task-info
                 const taskInfo = taskItem.querySelector('.task-info');
                 if (taskInfo) taskInfo.parentNode.appendChild(checkMark);
            }
        } else {
            if (!buttonInDom) {
                // If checkmark exists or button is missing, recreate button
                 const newButton = document.createElement('button');
                 newButton.className = 'task-button';
                 newButton.id = 'boost-task-1';
                 newButton.addEventListener('click', handleBoostTaskClick);
                 taskItem.appendChild(newButton); // Append to task item
                 buttonInDom = newButton; // Reference the new button
            }
             // Set button text based on logic (needs improvement if there's a delay)
            buttonInDom.textContent = "Start";
            buttonInDom.classList.remove("claim");
        }
    }


    // --- Friends Logic (Placeholder - Needs Firebase Integration) ---
    function addFriend(name, joinDateStr, isActive) { /* ... (Keep for now, but remove localStorage) ... */
         console.warn("addFriend function is using local data, needs Firebase integration.");
         const newFriend = { id: Date.now() + Math.random(), name, joined: joinDateStr, active: isActive };
         friends.push(newFriend);
         totalReferrals = friends.length; // This should come from Firebase
         if (isActive) activeReferrals++; // This should come from Firebase
         referralSpeed = activeReferrals * 0.005; // This should come from Firebase

         // REMOVED LocalStorage persistence
         updateDisplay();
    }
    function renderFriendList() { /* ... (same as before, uses local 'friends' array) ... */
        if (!friendListContainer || !noFriendsMessage) return;

        friendListContainer.innerHTML = '';
        if (friends.length === 0) {
            noFriendsMessage.style.display = 'block';
        } else {
            noFriendsMessage.style.display = 'none';
            friends.forEach(friend => {
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';
                // ... (inner HTML same as before) ...
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

    // --- Firebase Data Loading ---
    async function loadUserDataFromFirestore() {
        if (!currentUserId) {
            console.error("Cannot load data: User ID not available.");
            showErrorMessage("User data load nahi ho paya.");
            return;
        }
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
                referralSpeed = userData.referralSpeed || 0;
                totalReferrals = userData.totalReferrals || 0; // Load referral counts
                activeReferrals = userData.activeReferrals || 0;
                boostTask1Completed = userData.boostTask1Completed || false;
                // friends = load friends based on referral data if needed (future enhancement)


                // Check mining status based on loaded end time
                const now = Date.now();
                if (miningEndTime && now < miningEndTime) {
                    isMining = true;
                    startTimer();
                    startBalanceIncrement();
                    miningButton.textContent = 'Mining...';
                    miningButton.disabled = true;
                    console.log("Resuming previous mining session.");
                } else {
                    isMining = false;
                     // If mining time has expired but wasn't cleared in DB, clear it now
                    if (miningEndTime && now >= miningEndTime) {
                         await userRef.update({ miningEndTime: null });
                         miningEndTime = 0;
                     }
                    stopMining(false); // Stop without saving balance again
                }

                updateBoostTaskUI(); // Update boost button state
                updateDisplay(); // Update all UI elements

            } else {
                console.error("User document not found in Firestore!");
                 // This case should ideally not happen if handleFirebaseLoginUsingTMA worked
                 showErrorMessage("User data nahi mila. App dobara kholein.");
            }
        } catch (error) {
            console.error("Error loading user data from Firestore:", error);
            showErrorMessage("Data load karne mein error hua.");
        }
    }

     // --- TMA Login Handling ---
    function handleFirebaseLoginUsingTMA(tmaUserData) {
        // (This function is exactly the same as the one provided in the previous answer)
        if (!currentUserId) {
            console.error("TMA Login Error: User ID nahi mila.");
            showErrorMessage("Login fail hua. User ID nahi mila.");
            return;
        }
        console.log("Handling Firebase login for TMA user ID:", currentUserId);
        const userRef = db.collection('users').doc(currentUserId);

        userRef.get().then(doc => {
            if (doc.exists) {
                console.log("TMA User exists