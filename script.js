import { 
    auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, 
    collection, addDoc, getDoc, getDocs, doc, onSnapshot, query, where, 
    serverTimestamp, updateDoc 
} from './firebase-config.js';

// ==================== UTILITY FUNCTIONS ====================
// Helper function to get DOM elements by ID
const $ = (id) => document.getElementById(id);

// Global variables
let currentUser = null;     // Stores the currently authenticated user
let currentRole = null;     // Stores the user's role (doctor, receptionist, etc.)
let myChart = null;         // Chart.js instance for revenue visualization

// ==================== AUTHENTICATION ====================
// Monitor authentication state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            // User document exists, set role and update UI
            currentRole = userDoc.data().role;
            setupUI(userDoc.data());
        } else {
            // User document doesn't exist, show error and sign out
            Swal.fire("Error", "No user record found.", "error");
            signOut(auth);
        }
    } else {
        // No user is signed in, show landing page
        showLanding();
    }
});

// ==================== UI SETUP ====================
/**
 * Sets up the user interface based on user role and data
 * @param {Object} data - User data from Firestore
 */
function setupUI(data) {
    // Update user display information
    $('user-name-display').innerText = data.name;
    $('welcome-name').innerText = data.name;
    $('user-role-badge').innerText = data.role.toUpperCase();
    
    // Hide all sidebar menu items initially
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.add('hidden'));
    
    // Show the Home menu item for all users
    $('nav-home').classList.remove('hidden');
    
    // Role-based menu visibility
    if (data.role === 'receptionist') {
        // Receptionist specific menu items
        $('nav-generate').classList.remove('hidden');
        $('nav-billing').classList.remove('hidden');
        populateDoctors(); // Populate doctor dropdown for new patient registration
    } else {
        // Doctor specific menu items
        $('nav-queue').classList.remove('hidden');
    }
    
    // Switch to dashboard view
    $('auth-section').classList.add('hidden');
    $('landing-section').classList.add('hidden');
    $('dashboard-section').classList.remove('hidden');
    
    // Initialize data listeners and visual components
    initDataListeners();
    initChart();
    initClock();
}

/**
 * Initializes and updates the live clock in the sidebar
 */
function initClock() {
    setInterval(() => {
        const now = new Date();
        $('live-clock').innerText = now.toLocaleTimeString();
    }, 1000); // Update every second
}

// ==================== REAL-TIME DATA LISTENERS ====================
/**
 * Sets up Firestore real-time listeners for various data collections
 */
function initDataListeners() {
    // Listen for changes in the tokens collection (patient queue)
    onSnapshot(collection(db, "tokens"), (snap) => {
        const tbody = $('queue-table-body');
        if (!tbody) return; // Exit if table body doesn't exist
        tbody.innerHTML = ''; // Clear existing rows
        
        let total = 0;    // Total patient count
        let waiting = 0;  // Patients waiting count
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            total++;
            
            if (d.status === 'waiting') waiting++;
            
            // Determine if current user should see this patient
            const isDoctorForPatient = (currentRole === 'doctor' && d.doctorId === currentUser.uid);
            
            // Display patient in queue if:
            // 1. They're waiting AND
            // 2. Current user is their assigned doctor OR a receptionist
            if ((isDoctorForPatient || currentRole === 'receptionist') && d.status === 'waiting') {
                tbody.innerHTML += `<tr>
                    <td>#${d.tokenNumber}</td>
                    <td>${d.patientName}</td>
                    <td><span class="status-badge">Waiting</span></td>
                    <td>
                        ${currentRole === 'doctor' 
                            ? `<button class="btn-primary" style="padding: 8px 16px; width: auto;" 
                                 onclick="startDiagnosis('${docSnap.id}', '${d.patientName}')">
                                 Diagnose
                               </button>`
                            : '-'
                        }
                    </td>
                </tr>`;
            }
        });
        
        // Update dashboard statistics
        $('home-stat-patients').innerText = total;
        $('home-stat-queue').innerText = waiting;
    });
    
    // Listen for completed consultations (for billing view)
    onSnapshot(query(collection(db, "tokens"), where("status", "==", "completed")), (snap) => {
        const tbody = $('billing-table-body');
        if (!tbody) return; // Exit if table body doesn't exist
        tbody.innerHTML = ''; // Clear existing rows
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            tbody.innerHTML += `<tr>
                <td>${d.patientName}</td>
                <td>${d.diagnosis || 'N/A'}</td>
                <td>
                    <button class="btn-primary" style="padding: 10px 20px; width: auto;" 
                            onclick="generateBill('${docSnap.id}', '${d.patientName}')">
                        Bill Now
                    </button>
                </td>
            </tr>`;
        });
    });
    
    // Listen for invoices (for revenue tracking)
    onSnapshot(collection(db, "invoices"), (snap) => {
        let revenue = 0;
        
        // Calculate total revenue from all invoices
        snap.forEach(d => revenue += parseFloat(d.data().amount || 0));
        
        // Update dashboard revenue display
        $('home-stat-revenue').innerText = "$" + revenue;
        
        // Update chart with new data
        updateChartData();
    });
}

// ==================== CONSULTATION LOGIC ====================
/**
 * Starts a diagnosis session for a specific patient
 * @param {string} id - Token document ID
 * @param {string} name - Patient name
 */
window.startDiagnosis = (id, name) => {
    // Reset form, show diagnosis view, and populate patient info
    $('diagnosis-form').reset();
    showView('diagnosis');
    $('diag-patient-name').innerText = name;
    $('diag-token-id').value = id;
};

// Handle diagnosis form submission
$('diagnosis-form').onsubmit = async (e) => {
    e.preventDefault();
    const tokenId = $('diag-token-id').value;
    
    // Validate token ID
    if (!tokenId || tokenId === "") {
        return Swal.fire("Error", "Missing Patient ID.", "error");
    }
    
    try {
        // Update token with diagnosis and prescription
        await updateDoc(doc(db, "tokens", tokenId), {
            status: "completed", 
            diagnosis: $('diag-text').value, 
            prescription: $('diag-prescription').value
        });
        
        Swal.fire("Success", "Consultation Finished!", "success");
        e.target.reset(); // Clear form
        showView('queue'); // Return to queue view
    } catch (err) {
        Swal.fire("Error", err.message, "error");
    }
};

// ==================== BILLING & PDF GENERATION ====================
/**
 * Generates a bill and PDF for a completed consultation
 * @param {string} tokenId - Token document ID
 * @param {string} name - Patient name
 */
window.generateBill = async (tokenId, name) => {
    // Prompt for billing amount using SweetAlert
    const { value: amount } = await Swal.fire({
        title: `Generate Bill for ${name}`,
        input: 'number',
        inputLabel: 'Enter Total Amount ($)',
        inputValue: '50',
        showCancelButton: true,
        confirmButtonText: 'Generate PDF & Bill',
        confirmButtonColor: '#3b82f6'
    });
    
    if (!amount) return; // User cancelled
    
    try {
        // 1. Get patient's diagnosis details for the PDF
        const tokenDoc = await getDoc(doc(db, "tokens", tokenId));
        const tokenData = tokenDoc.data();
        
        // 2. Save Invoice to Database
        await addDoc(collection(db, "invoices"), { 
            patientName: name, 
            amount: parseFloat(amount), 
            date: serverTimestamp() 
        });
        
        // 3. Update Token Status to "billed"
        await updateDoc(doc(db, "tokens", tokenId), { status: "billed" });
        
        // 4. GENERATE PDF
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        
        // PDF Styling
        docPDF.setFontSize(22);
        docPDF.setTextColor(59, 130, 246); // Blue color
        docPDF.text("CLINIC MEDICAL RECEIPT", 105, 20, { align: "center" });
        
        docPDF.setDrawColor(200, 200, 200);
        docPDF.line(20, 25, 190, 25); // Line under header
        
        docPDF.setFontSize(12);
        docPDF.setTextColor(0, 0, 0);
        docPDF.text(`Patient Name: ${name}`, 20, 40);
        docPDF.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
        docPDF.text(`Status: PAID`, 20, 60);
        
        docPDF.setFontSize(14);
        docPDF.text("Clinical Notes:", 20, 75);
        docPDF.setFontSize(11);
        docPDF.text(`Diagnosis: ${tokenData.diagnosis || "N/A"}`, 20, 85);
        docPDF.text(`Prescription: ${tokenData.prescription || "N/A"}`, 20, 95);
        
        docPDF.setFontSize(16);
        docPDF.setTextColor(16, 185, 129); // Green color for amount
        docPDF.text(`TOTAL AMOUNT PAID: $${amount}`, 20, 120);
        
        docPDF.setFontSize(10);
        docPDF.setTextColor(150, 150, 150);
        docPDF.text("Thank you for choosing Clinic MS.", 105, 150, { align: "center" });
        
        // Save PDF with patient name in filename
        docPDF.save(`Bill_${name.replace(/\s+/g, '_')}.pdf`);
        
        Swal.fire("Success", "Invoice generated and PDF downloaded!", "success");
    } catch (err) {
        Swal.fire("Error", "Could not generate bill: " + err.message, "error");
    }
};

// ==================== NAVIGATION ====================
/**
 * Switches between different dashboard views
 * @param {string} v - View name (home, queue, billing, generate, diagnosis)
 */
window.showView = (v) => {
    // Hide all view panels
    document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
    
    // Remove active class from all sidebar items
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    
    // Show the requested view
    if ($(`view-${v}`)) $(`view-${v}`).classList.remove('hidden');
    
    // Mark the corresponding sidebar item as active
    if ($(`nav-${v}`)) $(`nav-${v}`).classList.add('active');
    
    // Update view title with capitalized name
    $('view-title').innerText = v.charAt(0).toUpperCase() + v.slice(1);
};

// Navigation functions
window.showAuth = () => {
    $('landing-section').classList.add('hidden');
    $('auth-section').classList.remove('hidden');
};

window.showLanding = () => {
    $('dashboard-section').classList.add('hidden');
    $('auth-section').classList.add('hidden');
    $('landing-section').classList.remove('hidden');
};

// ==================== FORM HANDLERS ====================
// Handle login form submission
$('login-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, $('login-email').value, $('login-pass').value);
    } catch {
        Swal.fire("Login Failed", "Invalid credentials.", "error");
    }
};

// Handle logout button click
$('logout-btn').onclick = () => signOut(auth);

// Handle new patient token generation form
$('token-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await addDoc(collection(db, "tokens"), {
            patientName: $('pat-name').value,
            doctorId: $('pat-doctor').value,
            status: "waiting",
            tokenNumber: Math.floor(1000 + Math.random() * 9000), // Generate random token number
            createdAt: serverTimestamp()
        });
        Swal.fire("Success", "Token Generated!", "success");
        e.target.reset(); // Clear form
    } catch (err) {
        Swal.fire("Error", err.message, "error");
    }
};

// ==================== CHART FUNCTIONS ====================
/**
 * Initializes the revenue/patients chart using Chart.js
 */
function initChart() {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], // Weekdays
            datasets: [{
                label: 'Patients',
                data: [0, 0, 0, 0, 0, 0, 0], // Initial empty data
                borderColor: '#3b82f6', // Blue line
                tension: 0.4, // Line curve tension
                fill: true,
                backgroundColor: 'rgba(59, 130, 246, 0.1)' // Light blue fill
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false // Hide legend
                }
            }
        }
    });
}

/**
 * Updates the chart with recent patient data (last 7 days)
 */
async function updateChartData() {
    // Query for completed or billed tokens
    const q = query(collection(db, "tokens"), where("status", "in", ["completed", "billed"]));
    const snap = await getDocs(q);
    
    // Initialize array for last 7 days (0 = today, 6 = 6 days ago)
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    
    snap.forEach(doc => {
        const date = doc.data().createdAt?.toDate();
        if (date) {
            // Calculate days difference
            const diff = Math.floor((now - date) / 86400000); // 86400000 ms in a day
            if (diff < 7) {
                // Increment count for the corresponding day
                counts[6 - diff]++;
            }
        }
    });
    
    // Update chart if it exists
    if (myChart) {
        myChart.data.datasets[0].data = counts;
        myChart.update();
    }
}

// ==================== DOCTOR POPULATION ====================
/**
 * Populates the doctor dropdown for receptionist when adding new patients
 */
async function populateDoctors() {
    // Query for all users with role "doctor"
    const snap = await getDocs(query(collection(db, "users"), where("role", "==", "doctor")));
    const select = $('pat-doctor');
    
    // Reset dropdown
    select.innerHTML = '<option value="">Select Doctor...</option>';
    
    // Add each doctor as an option
    snap.forEach(d => {
        select.innerHTML += `<option value="${d.id}">${d.data().name}</option>`;
    });
}