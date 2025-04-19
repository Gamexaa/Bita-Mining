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
        // Update only if home screen is active or related elements are visible elsewhere
        const totalSpeed = calculateTotalSpeed();
        if (balanceEl) balanceEl.textContent = formatBalance(balance);
        if (usdEquivalentEl) usdEquivalentEl.textContent = `( $${calculateUsdEquivalent(balance)} )`;
        if (miningSpeedEl) miningSpeedEl.textContent = `${totalSpeed.toFixed(3)}/h`;

        // Update referral counts if elements exist
        if (activeReferralsEl) activeReferralsEl.textContent = activeReferrals;
        if (totalReferralsEl) totalReferralsEl.textContent = totalReferrals;

        // Update friend list display
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
                 stopMining(true); // <<< MODIFIED: Ensure final balance is saved when timer ends
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

            // Limit UI updates slightly for performance if needed
            // requestAnimationFrame(updateDisplay); // Smoother UI update
            updateDisplay(); // Or update directly

            const now = Date.now();
            if (now - lastBalanceUpdateTime >= 60000) { // Use >= for safety
                saveBalanceToFirebase();
                lastBalanceUpdateTime = now;
            }
        }, 1000);
    }

    // Function to save balance (ensure it's called appropriately)
    function saveBalanceToFirebase() {
        if (!currentUserId || typeof balance !== 'number' || !isTmaEnvironment) return;
        const db = firebase.firestore();
        const roundedBalance = parseFloat(balance.toFixed(4)); // Ensure saving correct precision
        console.log(`Saving balance ${roundedBalance} to Firebase...`);
        db.collection('users').doc(currentUserId).update({ balance: roundedBalance })
            .then(() => console.log(`Balance (${roundedBalance}) successfully updated.`))
            .catch(error => console.error("Error updating balance:", error));
    }


    function startMining() {
        if (isMining || !currentUserId || !isTmaEnvironment) return;
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
            showErrorMessage("Mining start nahi ho paya. Dobara try karein.");
        });
    }

    function stopMining(saveFinalBalance = true) {
        // Check if already stopped or was never mining
        if (!isMining && (!miningEndTime || Date.now() >= miningEndTime)) {
            // Ensure UI is in stopped state if necessary
            if (miningTimerEl) miningTimerEl.textContent = "00:00:00";
             if (miningButton) {
                miningButton.textContent = 'Start Mining';
                miningButton.disabled = false;
            }
            return;
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

        // Update Firestore if user ID exists
        if (currentUserId && isTmaEnvironment) {
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

    // --- Boost Task Logic ---
    function handleBoostTaskClick() {
        if (!currentUserId || !isTmaEnvironment) return;
        const db = firebase.firestore();
        const boostButton = document.getElementById('boost-task-1');
        if (!boostButton) return;

        const currentButtonState = boostButton.textContent;

        if (boostTask1Completed) {
            console.log("Boost task already completed.");
            return;
        }

        if (currentButtonState === "Start") {
            console.log("Starting boost task: Join channel");
            if (tg) {
                 tg.openTelegramLink("https://t.me/Bita_Community"); // Correct Channel Link
                 // UI Changes to "Claim" state (User needs to come back and click claim)
                 boostButton.textContent = "Claim";
                 boostButton.classList.add("claim"); // Optional: for styling
            } else {
                 showErrorMessage("Telegram action not available outside Telegram.");
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

                if (isMining) { // If user was mining, restart increment calculation
                    startBalanceIncrement();
                }
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
        const taskItem = document.querySelector('#boost-screen .task-item'); // Find the specific task item
        if (!taskItem) return;

        let actionElement = taskItem.querySelector('.task-action-container');
        if (!actionElement) { // If container doesn't exist, find button/check directly
            actionElement = taskItem;
        }

        // Clear previous button/checkmark inside the container
        actionElement.innerHTML = '';

        if (boostTask1Completed) {
            const checkMark = document.createElement('span');
            checkMark.className = 'task-complete-check';
            checkMark.textContent = '✓';
            actionElement.appendChild(checkMark);
        } else {
            const button = document.createElement('button');
            button.className = 'task-button'; // Add appropriate classes
            button.id = 'boost-task-1'; // Keep the ID for the handler
            button.textContent = "Start"; // Initial state
            button.addEventListener('click', handleBoostTaskClick);
            actionElement.appendChild(button);
        }
    }


    // --- Friend List Rendering ---
    function renderFriendList() {
        if (!friendListContainer || !noFriendsMessage) return;

        // Clear previous list
        friendListContainer.innerHTML = '';

        // --- Placeholder Logic ---
        // You need to fetch actual friend data (users who were referred by currentUserId)
        // This usually involves a backend query. For now, using the placeholder `friends` array.
        // Example: friends = await fetchFriendsFromBackend(currentUserId);

        if (friends.length === 0) {
            noFriendsMessage.style.display = 'block';
            friendListContainer.style.display = 'none'; // Hide container too
        } else {
            noFriendsMessage.style.display = 'none';
            friendListContainer.style.display = 'block'; // Show container

            friends.forEach(friend => {
                // Friend object structure needs definition (e.g., { name: '...', joined: '...', active: true/false, id: '...' })
                const friendEl = document.createElement('div');
                friendEl.className = 'friend-item';

                // Basic structure - Adapt based on actual friend data available
                friendEl.innerHTML = `
                    <div class="friend-info">
                        <div class="friend-avatar">
                           <i class="fas fa-user"></i> <!-- Placeholder Icon -->
                           ${friend.photoUrl ? `<img src="${friend.photoUrl}" alt="pic">` : '<i class="fas fa-user"></i>'}
                        </div>
                        <div class="friend-details">
                            <span class="friend-name">${friend.name || 'Friend'}</span>
                            <span class="friend-joined">Joined: ${friend.joined ? new Date(friend.joined).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <div class="friend-status">
                        <span class="friend-boost">+${(friend.boostGiven || 0.000).toFixed(3)}/h</span> <!-- Boost this friend provides -->
                        <span class="friend-activity ${friend.active ? 'active' : 'inactive'}">
                            ${friend.active ? 'Active' : 'Not active !'}
                        </span>
                    </div>
                `;
                // Hide boost if friend is inactive or boost is 0
                if (!friend.active || !friend.boostGiven) {
                    const boostSpan = friendEl.querySelector('.friend-boost');
                    if(boostSpan) boostSpan.style.visibility = 'hidden';
                }
                friendListContainer.appendChild(friendEl);
            });
        }
     }

    // --- Data Loading ---
    async function loadUserDataFromFirestore() {
        if (!currentUserId || !isTmaEnvironment) {
            console.log("Cannot load data: No user ID or not in TMA environment.");
            return;
        }
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
                referralSpeed = userData.referralSpeed || 0; // Load speed (might be calculated later)
                totalReferrals = userData.totalReferrals || 0;
                activeReferrals = userData.activeReferrals || 0; // Needs logic to determine active ones
                boostTask1Completed = userData.boostTask1Completed || false;
                // friends = userData.friends || []; // Avoid loading large arrays directly if possible

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
                    stopMining(false); // 
