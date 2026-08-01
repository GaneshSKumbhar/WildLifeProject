/* ==========================================================================
   FIREBASE CONFIGURATION & DATABASE HELPERS
   Wildlife Intelligence System — Auth + Firestore
   ========================================================================== */

// Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAD9Rxm49dgc4HqDb3VaUOY_XNxjS6HZ3A",
    authDomain: "wildlifeintelligence-efcd5.firebaseapp.com",
    databaseURL: "https://wildlifeintelligence-efcd5-default-rtdb.firebaseio.com",
    projectId: "wildlifeintelligence-efcd5",
    storageBucket: "wildlifeintelligence-efcd5.firebasestorage.app",
    messagingSenderId: "219751269715",
    appId: "1:219751269715:web:7f6926b4cd0a1243fdcda6",
    measurementId: "G-H5YRYGSM0S"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ============================================================================
   AUTH MODULE
   ============================================================================ */
const FireAuth = {

    // Register a new user and create their Firestore profile
    signUp: async function(email, password, name, role) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const user = cred.user;

        // Set display name on the auth profile
        await user.updateProfile({ displayName: name });

        // Create the users/{uid} document in Firestore
        await db.collection('users').doc(user.uid).set({
            user_id: user.uid,
            name: name,
            email: email,
            role: role,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });

        return user;
    },

    // Sign in an existing user
    signIn: async function(email, password) {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        return cred.user;
    },

    // Sign out and redirect to login
    signOut: async function() {
        await auth.signOut();
        window.location.href = 'login.html';
    },

    // Return currently signed-in user (may be null)
    getCurrentUser: function() {
        return auth.currentUser;
    },

    // Subscribe to auth state changes
    onAuthChange: function(callback) {
        return auth.onAuthStateChanged(callback);
    },

    // Auth guard — waits for auth state and redirects if not logged in
    requireAuth: function() {
        return new Promise(function(resolve) {
            const unsub = auth.onAuthStateChanged(function(user) {
                unsub(); // unsubscribe after first callback
                if (!user) {
                    window.location.href = 'login.html';
                } else {
                    resolve(user);
                }
            });
        });
    },

    // Translate Firebase error codes into human messages
    friendlyError: function(code) {
        const map = {
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/invalid-email': 'The email address is not valid.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
            'auth/network-request-failed': 'Network error. Check your internet connection.',
            'auth/invalid-credential': 'Invalid credentials. Check your email and password.'
        };
        return map[code] || 'Authentication failed. Please try again.';
    },

    // Sign in with Google popup
    signInWithGoogle: async function() {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');

        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // Check if user document already exists in Firestore
        const existingDoc = await db.collection('users').doc(user.uid).get();
        if (!existingDoc.exists) {
            // First-time Google sign-in — create Firestore user profile
            await db.collection('users').doc(user.uid).set({
                user_id: user.uid,
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                role: 'Researcher',
                created_at: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        return user;
    }
};


/* ============================================================================
   FIRESTORE DATABASE MODULE
   ============================================================================ */
const FireDB = {

    /* ------------------------------------------------------------------
       USERS COLLECTION
       ------------------------------------------------------------------ */
    getUser: async function(uid) {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    updateUser: async function(uid, data) {
        await db.collection('users').doc(uid).update(data);
    },

    /* ------------------------------------------------------------------
       SPECIES COLLECTION
       ------------------------------------------------------------------ */
    addSpecies: async function(data) {
        const ref = await db.collection('species').add({
            common_name: data.common_name || '',
            scientific_name: data.scientific_name || '',
            common_name_lower: (data.common_name || '').toLowerCase(),
            scientific_name_lower: (data.scientific_name || '').toLowerCase(),
            species_group: data.species_group || 'Unknown',
            iucn_status: data.iucn_status || 'Not Evaluated',
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
    },

    getAllSpecies: async function() {
        const snap = await db.collection('species').orderBy('common_name').get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    findSpeciesByName: async function(name) {
        const lower = name.toLowerCase().trim();

        // Try common_name first
        let snap = await db.collection('species')
            .where('common_name_lower', '==', lower)
            .limit(1).get();

        if (snap.empty) {
            // Try scientific_name
            snap = await db.collection('species')
                .where('scientific_name_lower', '==', lower)
                .limit(1).get();
        }

        return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
    },

    // Find or auto-create a species record
    findOrCreateSpecies: async function(name) {
        let species = await this.findSpeciesByName(name);
        if (species) return species;

        // Auto-create
        const id = await this.addSpecies({
            common_name: name,
            scientific_name: name,
            species_group: classifyGroup(name),
            iucn_status: 'Not Evaluated'
        });
        return { id: id, common_name: name, scientific_name: name };
    },

    /* ------------------------------------------------------------------
       IMAGES COLLECTION
       ------------------------------------------------------------------ */
    saveImage: async function(data) {
        const ref = await db.collection('images').add({
            user_id:      data.user_id || '',
            image_path:   data.image_path || '',
            uploaded_at:  firebase.firestore.FieldValue.serverTimestamp(),
            species_id:   data.species_id || '',
            species_name: data.species_name || '',
            animal_count: data.animal_count || 0,
            confidence:   data.confidence || 0,
            site:         data.site || ''
        });
        return ref.id;
    },

    getImagesByUser: async function(userId) {
        const snap = await db.collection('images')
            .where('user_id', '==', userId)
            .orderBy('uploaded_at', 'desc')
            .get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    getAllImages: async function(limit) {
        const snap = await db.collection('images')
            .orderBy('uploaded_at', 'desc')
            .limit(limit || 200)
            .get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    /* ------------------------------------------------------------------
       AUDIO COLLECTION
       ------------------------------------------------------------------ */
    saveAudio: async function(data) {
        const ref = await db.collection('audio').add({
            user_id:      data.user_id || '',
            audio_path:   data.audio_path || '',
            uploaded_at:  firebase.firestore.FieldValue.serverTimestamp(),
            species_id:   data.species_id || '',
            species_name: data.species_name || '',
            confidence:   data.confidence || 0,
            duration:     data.duration || 0,
            site:         data.site || ''
        });
        return ref.id;
    },

    getAudioByUser: async function(userId) {
        const snap = await db.collection('audio')
            .where('user_id', '==', userId)
            .orderBy('uploaded_at', 'desc')
            .get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    getAllAudio: async function(limit) {
        const snap = await db.collection('audio')
            .orderBy('uploaded_at', 'desc')
            .limit(limit || 200)
            .get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    /* ------------------------------------------------------------------
       POPULATION COLLECTION
       ------------------------------------------------------------------ */
    savePopulation: async function(data) {
        const ref = await db.collection('population').add({
            species_id:       data.species_id || '',
            species_name:     data.species_name || '',
            image_id:         data.image_id || null,
            audio_id:         data.audio_id || null,
            population_count: data.population_count || 0,
            location:         data.location || '',
            observation_date: firebase.firestore.FieldValue.serverTimestamp()
        });
        return ref.id;
    },

    getPopulation: async function(limit) {
        const snap = await db.collection('population')
            .orderBy('observation_date', 'desc')
            .limit(limit || 200)
            .get();
        return snap.docs.map(function(d) { return { id: d.id, ...d.data() }; });
    },

    /* ------------------------------------------------------------------
       SPECIES SEEDER — populate from backend API
       ------------------------------------------------------------------ */
    seedSpecies: async function() {
        try {
            // Check if already seeded
            const existing = await db.collection('species').limit(1).get();
            if (!existing.empty) {
                console.log('[FireDB] Species collection already populated — skipping seed.');
                return false;
            }

            const baseUrl = (window.WI && WI.base) ? WI.base() : 'http://127.0.0.1:8000';
            const res = await fetch(baseUrl + '/audio_classes/');
            if (!res.ok) throw new Error('API unavailable');
            const data = await res.json();
            const classes = data.classes || [];

            // Use a Firestore batch write (max 500 per batch)
            const batch = db.batch();
            classes.forEach(function(name) {
                const ref = db.collection('species').doc();
                batch.set(ref, {
                    common_name: name,
                    scientific_name: name,
                    common_name_lower: name.toLowerCase(),
                    scientific_name_lower: name.toLowerCase(),
                    species_group: classifyGroup(name),
                    iucn_status: 'Not Evaluated',
                    created_at: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            console.log('[FireDB] Seeded ' + classes.length + ' species to Firestore.');
            return true;
        } catch (e) {
            console.error('[FireDB] Species seed failed:', e);
            return false;
        }
    }
};


/* ============================================================================
   UTILITY — Classify species into taxonomy groups
   ============================================================================ */
function classifyGroup(name) {
    const lower = name.toLowerCase();
    const mammals   = ['bos', 'canis', 'elephas', 'panthera', 'ursus', 'cervus', 'equus', 'felis', 'capra', 'ovis', 'sus', 'lutra', 'vulpes', 'rattus', 'myotis'];
    const birds     = ['anthus', 'cardinalis', 'corvus', 'parus', 'turdus', 'passer', 'aquila', 'strix', 'columba', 'gallus', 'anas', 'ardea', 'buteo', 'falco', 'pica', 'hirundo'];
    const amphibians = ['anura', 'rana', 'bufo', 'hyla'];
    const reptiles  = ['lacerta', 'natrix', 'vipera', 'python', 'crocodylus'];
    const insects   = ['gryllus', 'cicada', 'apis', 'bombus'];

    if (mammals.some(function(m) { return lower.includes(m); })) return 'Mammal';
    if (birds.some(function(b) { return lower.includes(b); }))   return 'Bird';
    if (amphibians.some(function(a) { return lower.includes(a); })) return 'Amphibian';
    if (reptiles.some(function(r) { return lower.includes(r); }))  return 'Reptile';
    if (insects.some(function(i) { return lower.includes(i); }))   return 'Insect';
    return 'Unknown';
}
