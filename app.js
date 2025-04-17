// Firebase config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "bita-mining.firebaseapp.com",
  projectId: "bita-mining",
  storageBucket: "bita-mining.appspot.com",
  messagingSenderId: "XXXX",
  appId: "XXXX"
};

// Init
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).then((result) => {
    const user = result.user;
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('user-info').style.display = 'block';
    document.getElementById('home-page').style.display = 'block';
    document.getElementById('welcome-text').innerText = `Welcome, ${user.displayName}`;

    // Simulate active referrals and mining logic
    const activeReferrals = 7; // Later this will come from database
    const baseRate = 0.015;
    const boostPerReferral = 0.005;
    const miningRate = baseRate + (activeReferrals * boostPerReferral);
    
    document.getElementById('active-referrals').innerText = activeReferrals;
    document.getElementById('mining-rate').innerText = miningRate.toFixed(3) + ' ß/h';
  });
}

function signOut() {
  auth.signOut().then(() => {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('home-page').style.display = 'none';
  });
}

