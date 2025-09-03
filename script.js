console.log('JavaScript starting to load...');


// ===== FEATURE FLAGS =====
var FEATURES = {
    ADVANCED_BOOTH_MANAGEMENT: false,  // Complex booth roles, check-in/out, hours tracking
    
    BOOTH_SALES_TRACKING: false,       // Track sales during booths
    DETAILED_REPORTING: false,         // Advanced analytics and reports
    ROLE_BASED_BOOTH_SIGNUP: false,   // Money handler, setup, inventory roles
    AUTOMATIC_DISTRIBUTION: false      // Auto-distribute booth earnings
};

// ===== GLOBAL VARIABLES =====
var cookieTypes = {
    'TM': { name: 'Thin Mints', price: 6.00 },
    'ADV': { name: 'Adventurefuls', price: 6.00 },
    'LEM': { name: 'Lemonades', price: 6.00 },
    'TRE': { name: 'Trefoils', price: 6.00 },
    'CDL': { name: 'Caramel Delites', price: 6.00 },
    'CCC': { name: 'Caramel Chocolate Chip', price: 6.00 },
    'PBP': { name: 'Peanut Butter Patties', price: 6.00 },
    'PBS': { name: 'Peanut Butter Sandwiches', price: 6.00 }
};

var troopInventory = {};
var reservedInventory = {};
var girls = [];
var orders = [];
var transfers = [];
var payments = [];
var parentOrders = [];
var personalSales = [];
var currentUser = null;
var booths = [];
var boothSignups = [];



// Demo user accounts
var users = [
    {
        id: 1,
        email: 'mom@troop167.com',
        password: 'cookies2025',
        name: 'Cookie Mom Leader',
        role: 'cookie-mom',
        girls: []
    },
    {
        id: 2,
        email: 'parent@example.com', 
        password: 'parent123',
        name: 'Sarah Johnson',
        role: 'parent',
        girls: []
    }
];

// Initialize inventory
Object.keys(cookieTypes).forEach(type => {
    troopInventory[type] = 0;
});
Object.keys(cookieTypes).forEach(type => {
    reservedInventory[type] = {};
});

// ===== GOOGLE SHEETS INTEGRATION =====
var CLIENT_ID = '985139482684-0p8oe3hoplarh12l4ghefmu9op6gjh2b.apps.googleusercontent.com';
var SHEET_ID = '1bxBOqy4zY6hqy0-_DnparpkGshap6apDIuNcueiA4B4';
var DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
var SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient;
let gapiInited = false;
let gisInited = false;

window.gapiLoaded = function() {
    gapi.load('client', initializeGapiClient);
};

window.gisLoaded = function() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableButtons();
};

async function initializeGapiClient() {
    await gapi.client.init({
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        const authButton = document.getElementById('authorize_button');
        if (authButton) {
            authButton.disabled = false;
            authButton.style.background = '#4285f4';
            authButton.textContent = 'Connect Google Sheets';
            if (!authButton.dataset.bound) {
                authButton.addEventListener('click', handleAuthClick);
                authButton.dataset.bound = 'true';
            }
        }
    }
}

function handleAuthClick() {
    if (!gapiInited || !gisInited) {
        showMessage('loginMessages', 'Google APIs still loading. Please wait.', true);
        return;
    }

    tokenClient.callback = async (resp) => {
        try {
            if (resp && resp.error) {
                console.error('OAuth error:', resp.error);
                showMessage('loginMessages', 'Google authorization failed. Please try again.', true);
                return;
            }
            await loadAllDataFromSheets();
            showMessage('loginMessages', 'Connected to Google Sheets successfully!');
        } catch (e) {
            console.error('Post-auth load error:', e);
            showMessage('loginMessages', 'Error loading from Google Sheets: ' + (e.message || e), true);
        }
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

async function readSheet(sheetName) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: sheetName,
        });
        return response.result.values || [];
    } catch (error) {
        console.error('Error reading sheet:', error);
        return [];
    }
}

async function appendToSheet(sheetName, values) {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: sheetName,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [values]
            }
        });
        return response;
    } catch (error) {
        console.error('Error appending to sheet:', error);
        return null;
    }
}

async function loadAllDataFromSheets() {
    showLoading('Loading data from Google Sheets...');
    try {
        // Load users from sheets (replaces demo users)
        const sheetUsers = await loadUsersFromSheets();
        if (sheetUsers && sheetUsers.length > 0) {
            users = sheetUsers;
            console.log('Loaded users from sheets:', users.map(u => u.email));
        }

        await loadBoothsFromSheets();
        await loadBoothSignupsFromSheets();
        await loadReservationsFromSheets();

        // Load troop inventory
        const inventoryData = await readSheet('Troop_Inventory');
        if (inventoryData.length > 1) {
            inventoryData.slice(1).forEach(row => {
                if (row[0] && row[1] !== undefined) {
                    troopInventory[row[0]] = parseInt(row[1]) || 0;
                }
            });
        }
        
        // Load girls (existing code...)
        const girlsData = await readSheet('Girls');
        if (Array.isArray(girlsData) && girlsData.length > 0) {
            let gRows = girlsData;
            const firstG = gRows[0] || [];
            const looksLikeGirlsHeader =
                (String(firstG[0] || '').toLowerCase() === 'id') ||
                (String(firstG[1] || '').toLowerCase() === 'girlname') ||
                (String(firstG[2] || '').toLowerCase() === 'parentname');
            if (looksLikeGirlsHeader) gRows = gRows.slice(1);

            gRows = gRows.filter(r => r && (r[0] || r[1] || r[2]));

            girls = gRows.map(row => {
                const girl = {
                    id: parseInt(row[0]) || Date.now(),
                    girlName: row[1] || '',
                    parentName: row[2] || '',
                    parentEmail: row[3] || '',
                    participationType: row[4] || 'cookies-on-hand',
                    contactInfo: row[5] || '',
                    balance: parseFloat(row[6]) || 0,
                    totalSold: parseInt(row[7]) || 0,
                    inventory: {}
                };
                Object.keys(cookieTypes).forEach((type, index) => {
                    girl.inventory[type] = parseInt(row[8 + index]) || 0;
                });
                return girl;
            });
        } else {
            girls = [];
        }
        
        // Load rest of data...
        const ordersData = await readSheet('Orders');
        let dataRows = ordersData || [];
        if (dataRows.length === 0) {
            orders = [];
        } else {
            const firstRow = dataRows[0] || [];
            const looksLikeHeader = (String(firstRow[0] || '').toLowerCase() === 'id') ||
                                    (String(firstRow[1] || '').toLowerCase() === 'type');
            if (looksLikeHeader) {
                dataRows = dataRows.slice(1);
            }

            dataRows = dataRows.filter(r => (r && (r[0] || r[2])));

            orders = dataRows.map(row => {
                const order = {
                    id: (row[0] && !isNaN(parseInt(row[0]))) ? parseInt(row[0]) : Date.now(),
                    type: row[1] || 'initial',
                    orderDate: row[2] || '',
                    deliveryDate: row[3] || '',
                    pickupLocation: row[4] || '',
                    totalCases: (row[5] ? parseInt(row[5]) : 0) || 0,
                    totalBoxes: (row[6] ? parseInt(row[6]) : 0) || 0,
                    totalCost: (row[7] ? parseFloat(row[7]) : 0) || 0,
                    status: row[8] || 'received',
                    timestamp: row[9] || '',
                    cookies: {}
                };

                Object.keys(cookieTypes).forEach((type, index) => {
                    const cell = row[10 + index];
                    order.cookies[type] = cell ? parseInt(cell) || 0 : 0;
                });

                return order;
            });
        }
        if (!Array.isArray(orders)) orders = [];

        // Load transfers
        const transfersData = await readSheet('Transfers');
        if (Array.isArray(transfersData) && transfersData.length > 0) {
            let tRows = transfersData;
            const t0 = tRows[0] || [];
            const hasHeader = String(t0[0]||'').toLowerCase() === 'id' || String(t0[2]||'').toLowerCase() === 'from';
            if (hasHeader) tRows = tRows.slice(1);
            transfers = tRows.filter(r => r && (r[0] || r[2] || r[3])).map(r => ({
                id: parseInt(r[0]) || Date.now(),
                transferDate: r[1] || '',
                date: r[1] || '',
                from: r[2] || '',
                to: r[3] || '',
                totalBoxes: parseInt(r[4]) || 0,
                cookies: (() => { try { return JSON.parse(r[5] || '{}'); } catch { return {}; } })(),
                notes: r[6] || '',
                recordedAt: r[7] || '',
                recordedBy: r[8] || ''
            }));
        } else {
            transfers = [];
        }

        await loadPaymentsFromSheets();
        await loadParentRequestsFromSheets();

        // Update UI only if a user is logged in
        if (currentUser) {
            updateDashboard();
            updateGirlsList();
            updateOrderHistory();
            updateTransferHistory();
            updatePaymentHistory();
            updateParentOrderDropdowns();
            updatePaymentDropdowns();
            updateTransferDropdowns();
        }

        showMessage('loginMessages', 'Data loaded from Google Sheets successfully!');
        
    } catch (error) {
        console.error('Error loading from sheets:', error);
        showMessage('loginMessages', 'Error loading from Google Sheets: ' + error.message, true);
    }
    hideLoading();
}
async function loadUsersFromSheets() {
    try {
        const rows = await readSheet('Users');
        if (!Array.isArray(rows) || rows.length === 0) return [];
        
        let data = rows;
        const first = data[0] || [];
        const hasHeader = String(first[1]||'').toLowerCase() === 'email' || String(first[4]||'').toLowerCase() === 'role';
        if (hasHeader) data = data.slice(1);
        
        const loaded = data
            .filter(r => r && (r[1] || r[3] || r[4]))
            .map(r => {
                // Use existing ID from sheet, or assign a consistent ID based on email
                let userId;
                if (r[0] && !isNaN(parseInt(r[0]))) {
                    userId = parseInt(r[0]);
                } else {
                    // Create consistent ID based on email hash (won't change between sessions)
                    const email = (r[1] || '').trim().toLowerCase();
                    userId = email ? Math.abs(hashString(email)) : Date.now();
                }
                
                return {
                    id: userId,
                    email: (r[1] || '').trim(),
                    password: r[2] || '',
                    name: r[3] || '',
                    role: (r[4] || 'parent').toLowerCase(),
                    girls: []
                };
            });
        return loaded;
    } catch (e) {
        console.error('Error loading Users from sheets:', e);
        return [];
    }
}

// Helper function to create consistent hash from string
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
}

async function loadBoothsFromSheets() {
    try {
        const rows = await readSheet('Booths');
        if (!Array.isArray(rows) || rows.length === 0) { 
            console.log('No booth data found in sheets');
            booths = []; 
            return; 
        }

        let data = rows;
        const first = data[0] || [];
        const hasHeader =
            String(first[0] || '').toLowerCase() === 'id' ||
            String(first[1] || '').toLowerCase() === 'name' ||
            String(first[3] || '').toLowerCase() === 'date';
        
        if (hasHeader) {
            console.log('Booth sheet has header row, skipping it');
            data = data.slice(1);
        }

        booths = data
            .filter(r => r && (r[0] || r[1] || r[3])) // Must have id, name, or date
            .map(r => ({
                id: parseInt(r[0]) || Date.now(),
                name: r[1] || '',
                type: r[2] || '',
                date: r[3] || '',
                startTime: r[4] || '',
                endTime: r[5] || '',
                startingCash: parseFloat(r[6]) || 0,
                endingCash: parseFloat(r[7]) || 0,
                digitalPayments: parseFloat(r[8]) || 0,
                notes: r[9] || '',
                status: r[10] || 'scheduled',
                totalSales: parseFloat(r[11]) || 0,
                createdAt: r[16] || '',
                createdBy: r[17] || ''
            }));
            
        console.log(`Loaded ${booths.length} booths from sheets`);
    } catch (e) {
        console.error('Error loading booths from sheets:', e);
        booths = [];
    }
}

async function loadBoothSignupsFromSheets() {
    try {
        const rows = await readSheet('Booth_Signups');
        if (!Array.isArray(rows) || rows.length === 0) { boothSignups = []; return; }

        let data = rows;
        const first = data[0] || [];
        const hasHeader =
            String(first[0] || '').toLowerCase() === 'id' ||
            String(first[1] || '').toLowerCase() === 'boothid' ||
            String(first[3] || '').toLowerCase() === 'girlname';

        if (hasHeader) data = data.slice(1);

        boothSignups = data
            .filter(r => r && (r[0] || r[1] || r[3]))
            .map(r => ({
                id: parseInt(r[0]) || Date.now(),
                boothId: r[1],
                girlId: r[2],
                girlName: r[3] || '',
                parentName: r[4] || '',
                status: r[5] || 'confirmed',
                notes: r[6] || '',
                signedAt: r[7] || '',
                roles: ['general'] // Simple role system
            }));
    } catch (e) {
        console.error('Error loading Booth_Signups from sheets:', e);
        boothSignups = [];
    }
}

async function loadPaymentsFromSheets() {
    try {
        const paymentsData = await readSheet('Payments');
        if (!Array.isArray(paymentsData) || paymentsData.length === 0) {
            payments = [];
            return;
        }
        let rows = paymentsData;
        const first = rows[0] || [];
        const hasHeader =
            String(first[0] || '').toLowerCase() === 'id' ||
            String(first[2] || '').toLowerCase() === 'girlname' ||
            String(first[5] || '').toLowerCase() === 'paymentmethod';

        if (hasHeader) rows = rows.slice(1);

        rows = rows.filter(r => r && (r[0] || r[2] || r[6]));

        payments = rows.map(r => ({
            id: parseInt(r[0]) || Date.now(),
            girlId: r[1] ? parseInt(r[1]) : undefined,
            girlName: r[2] || '',
            parentName: r[3] || '',
            paymentDate: r[4] || '',
            paymentMethod: r[5] || '',
            amount: parseFloat(r[6]) || 0,
            reference: r[7] || '',
            balanceBefore: parseFloat(r[8]) || 0,
            balanceAfter: parseFloat(r[9]) || 0,
            recordedAt: r[10] || '',
            recordedBy: r[11] || ''
        }));
    } catch (e) {
        console.error('Error loading payments from sheets:', e);
    }
}

async function loadParentRequestsFromSheets() {
    try {
        const rows = await readSheet('Parent_Requests');
        if (!Array.isArray(rows) || rows.length === 0) { parentOrders = []; return; }

        let data = rows;
        const first = data[0] || [];
        const hasHeader =
            String(first[0] || '').toLowerCase() === 'id' ||
            String(first[2] || '').toLowerCase() === 'parentname';
        if (hasHeader) data = data.slice(1);

        parentOrders = data
            .filter(r => r && (r[0] || r[2] || r[4]))
            .map(r => ({
                id: parseInt(r[0]) || Date.now(),
                parentId: parseInt(r[1]) || 0,
                parentName: r[2] || '',
                girlId: parseInt(r[3]) || 0,
                girlName: r[4] || '',
                reason: r[5] || '',
                totalBoxes: parseInt(r[6]) || 0,
                totalValue: parseFloat(r[7]) || 0,
                status: r[8] || 'pending',
                requestedAt: r[9] || '',
                approvedBoxes: parseInt(r[10]) || 0,
                approvedValue: parseFloat(r[11]) || 0,
                approvedAt: r[12] || '',
                deliveredAt: r[13] || '',
                notes: r[14] || '',
                cookies: (() => { try { return JSON.parse(r[15] || '{}'); } catch { return {}; } })(),
                approvedCookies: (() => { try { return JSON.parse(r[16] || '{}'); } catch { return {}; } })()
            }));
    } catch (e) {
        console.error('Error loading parent requests from sheets:', e);
        parentOrders = [];
    }
}

function getAvailableTroopInventory(cookieType) {
    const totalInventory = troopInventory[cookieType] || 0;
    const totalReserved = Object.values(reservedInventory[cookieType] || {})
        .reduce((sum, qty) => sum + qty, 0);
    return totalInventory - totalReserved;
}

// Helper function to get total reserved inventory for display
function getTotalReservedInventory() {
    let totalReserved = 0;
    Object.keys(cookieTypes).forEach(type => {
        const typeReserved = Object.values(reservedInventory[type] || {})
            .reduce((sum, qty) => sum + qty, 0);
        totalReserved += typeReserved;
    });
    return totalReserved;
}

// Helper function to get reserved inventory for a specific girl
function getGirlReservedInventory(girlId) {
    const reserved = {};
    Object.keys(cookieTypes).forEach(type => {
        reserved[type] = (reservedInventory[type] && reservedInventory[type][girlId]) || 0;
    });
    return reserved;
}

async function saveReservationToSheets() {
    try {
        // Convert reservedInventory to rows for saving
        const reservationRows = [];
        Object.keys(cookieTypes).forEach(type => {
            if (reservedInventory[type]) {
                Object.keys(reservedInventory[type]).forEach(girlId => {
                    const qty = reservedInventory[type][girlId];
                    if (qty > 0) {
                        const girl = girls.find(g => g.id == girlId);
                        reservationRows.push([
                            type,
                            girlId,
                            girl ? girl.girlName : 'Unknown',
                            qty,
                            new Date().toLocaleString()
                        ]);
                    }
                });
            }
        });
        
        // Clear existing reservations and update with current state
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Reserved_Inventory!A2:E1000'
        });
        
        if (reservationRows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: 'Reserved_Inventory!A2',
                valueInputOption: 'USER_ENTERED',
                resource: { values: reservationRows }
            });
        }
    } catch (error) {
        console.error('Error saving reservations to sheets:', error);
    }
}

async function loadReservationsFromSheets() {
    try {
        const rows = await readSheet('Reserved_Inventory');
        if (!Array.isArray(rows) || rows.length === 0) return;
        
        // Reset reservations
        Object.keys(cookieTypes).forEach(type => {
            reservedInventory[type] = {};
        });
        
        // Skip header row if present
        let data = rows;
        if (data[0] && String(data[0][0]).toLowerCase() === 'cookietype') {
            data = data.slice(1);
        }
        
        // Load reservations
        data.forEach(row => {
            const [cookieType, girlId, girlName, qty] = row;
            if (cookieType && girlId && qty) {
                if (!reservedInventory[cookieType]) reservedInventory[cookieType] = {};
                reservedInventory[cookieType][girlId] = parseInt(qty) || 0;
            }
        });
    } catch (error) {
        console.error('Error loading reservations from sheets:', error);
    }
}


// ===== UTILITY FUNCTIONS =====
function showLoading(text) {
    try {
        const ov = document.getElementById('loadingOverlay');
        const tx = document.getElementById('loadingText');
        if (tx && typeof text === 'string') tx.textContent = text;
        if (ov) ov.style.display = 'flex';
    } catch (e) { console.warn('showLoading error', e); }
}

function hideLoading() {
    try {
        const ov = document.getElementById('loadingOverlay');
        if (ov) ov.style.display = 'none';
    } catch (e) { console.warn('hideLoading error', e); }
}

function debugLog(message) {
    console.log(message);
}

function showMessage(containerId, message, isError = false) {
    const container = document.getElementById(containerId);
    if (container) {
        const alertClass = isError ? 'alert-danger' : 'alert-success';
        container.innerHTML = `<div class="alert ${alertClass}">${message}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

function testFunction() {
    console.log('Test function called');
    var testResult = document.getElementById('testResult');
    if (testResult) {
        testResult.textContent = 'JavaScript is working!';
        testResult.style.color = 'green';
    }
}

// ===== AUTHENTICATION =====
function attemptLogin() {
    console.log('Login attempt started');
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const selectedRole = document.getElementById('loginRole').value;
    
    if (!email || !password) {
        showMessage('loginMessages', 'Please enter email and password', true);
        return;
    }
    
    const user = (users || []).find(u =>
        (
            (u.email && u.email.toLowerCase() === email.toLowerCase()) ||
            (u.name && u.name.toLowerCase() === email.toLowerCase())
        ) &&
        u.password === password
    );
    
    if (!user) {
        showMessage('loginMessages', 'Invalid email or password', true);
        return;
    }
    
    if (user.role !== selectedRole) {
        showMessage('loginMessages', `This account is registered as ${user.role}, not ${selectedRole}`, true);
        return;
    }
    
    currentUser = user;
    console.log('Login successful, setting up interface');
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    setupUserInterface();
    debugLog(`User logged in: ${user.name} (${user.role})`);
}

function logout() {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'block';
    document.getElementById('mainApp').style.display = 'none';
    
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginRole').value = 'parent';
    
    debugLog('User logged out');
}

function setupUserInterface() {
    if (!currentUser) return;
    console.log('Setting up interface for:', currentUser.role);
    
    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserRole').textContent = currentUser.role.replace('-', ' ').toUpperCase();
    
    const mobileUserInfo = document.getElementById('mobileUserInfo');
    const mobileUserName = document.getElementById('mobileUserName');
    const mobileUserRole = document.getElementById('mobileUserRole');
    
    if (mobileUserInfo) mobileUserInfo.style.display = 'block';
    if (mobileUserName) mobileUserName.textContent = currentUser.name;
    if (mobileUserRole) mobileUserRole.textContent = currentUser.role.replace('-', ' ').toUpperCase();
    
    if (currentUser.role === 'cookie-mom') {
        setupCookieMomInterface();
    } else if (currentUser.role === 'parent') {
        setupParentInterface();
    }
}

function setupCookieMomInterface() {
    // Show Cookie Mom tabs
    document.getElementById('dashboardTab').style.display = 'block';
    document.getElementById('ordersTab').style.display = 'block';
    document.getElementById('girlsTab').style.display = 'block';
    document.getElementById('transfersTab').style.display = 'block';
    document.getElementById('moneyTab').style.display = 'block';
    document.getElementById('boothsTab').style.display = 'block';
    document.getElementById('requestApprovalTab').style.display = 'block';
    
    
    // Hide parent tabs
    document.getElementById('parentOrdersTab').style.display = 'none';
    document.getElementById('mySalesTab').style.display = 'none';
    document.getElementById('myBalanceTab').style.display = 'none';
    document.getElementById('parentBoothsTab').style.display = 'none';
    
    
    showTab('dashboard');
    updateDashboard();
    updateGirlsList();
    
    setTimeout(() => createCookieGrid('cookieOrderGrid', 'troopOrder'), 100);
    setTimeout(async () => {
        updatePaymentDropdowns();
        updateOutstandingBalances();
        updatePaymentHistory();
    }, 200);
    setTimeout(() => {
        updateTransferDropdowns();
        updateTransferHistory();
    }, 300);
    setTimeout(() => updateBoothManagement(), 400);
   

    setupMobileNavigation([
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'orders', label: 'Troop Orders' },
    { id: 'girls', label: 'Girl Management' },
    { id: 'request-approval', label: 'Parent Requests' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'money', label: 'Money Collection' },
    { id: 'booths', label: 'Booth Management' },
]);
}

function setupParentInterface() {
    // Hide Cookie Mom tabs
    document.getElementById('dashboardTab').style.display = 'none';
    document.getElementById('ordersTab').style.display = 'none';
    document.getElementById('girlsTab').style.display = 'none';
    document.getElementById('transfersTab').style.display = 'none';
    document.getElementById('moneyTab').style.display = 'none';
    document.getElementById('boothsTab').style.display = 'none';
    document.getElementById('requestApprovalTab').style.display = 'none';
   
    
    // Show parent tabs
    document.getElementById('parentOrdersTab').style.display = 'block';
    document.getElementById('mySalesTab').style.display = 'block';
    document.getElementById('myBalanceTab').style.display = 'block';
    document.getElementById('parentBoothsTab').style.display = 'block';
    
    showTab('parent-orders');
    
    createCookieGrid('parentOrderGrid', 'parentOrder');
    createCookieGrid('mySalesGrid', 'mySale');
    
    setTimeout(() => {
        updateMyBalanceDisplay();
        updateParentOrderHistory();
        updateParentOrderDropdowns();
        setupParentBoothSignups();
    }, 100);

    setupMobileNavigation([
    { id: 'parent-orders', label: 'My Orders' },
    { id: 'my-balance', label: 'My Balance' },
    { id: 'my-sales', label: 'My Sales' },
    { id: 'parent-booths', label: 'Booth Signups' },
]);
}


// ===== TAB MANAGEMENT =====
function showTab(tabName) {
    if (!currentUser) return;
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-tab').forEach(nav => {
        nav.classList.remove('active');
    });
    
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-tab') === tabName) {
            link.classList.add('active');
        }
    });

    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    const navButton = document.getElementById(tabName + 'Tab');
    if (navButton) {
        navButton.classList.add('active');
    }

    // Handle specific tab initialization
    
    if (tabName === 'parent-booths' && currentUser && currentUser.role === 'parent') {
        setupParentBoothSignups();
    }
    
    if (tabName === 'parent-orders' && currentUser.role === 'parent') {
        updateParentOrderTotals();
        updateParentOrderHistory();
    } else if (tabName === 'my-sales' && currentUser.role === 'parent') {
        updatePersonalSalesTotals();
    }
    
    if (tabName === 'money' && currentUser.role === 'cookie-mom') {
        (async () => {
            updatePaymentDropdowns();
            updateOutstandingBalances();
            updatePaymentHistory();
        })();
        const today = new Date().toISOString().split('T')[0];
        const paymentDate = document.getElementById('paymentDate');
        if (paymentDate && !paymentDate.value) {
            paymentDate.value = today;
        }
    } 
    
    if (tabName === 'transfers' && currentUser.role === 'cookie-mom') {
        updateTransferDropdowns();
        updateTransferHistory();
        const today = new Date().toISOString().split('T')[0];
        const transferDate = document.getElementById('transferDate');
        if (transferDate && !transferDate.value) {
            transferDate.value = today;
        }
    }
}


// ===== COOKIE GRID FUNCTIONS =====
function createCookieGrid(containerId, inputPrefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(cookieTypes).forEach(type => {
        const div = document.createElement('div');
        div.className = 'cookie-item';
        
        const label = type + ' - ' + cookieTypes[type].name;
        let onchangeFunction = '';
        
        if (inputPrefix === 'parentOrder') onchangeFunction = 'updateParentOrderTotals()';
        if (inputPrefix === 'mySale') onchangeFunction = 'updatePersonalSalesTotals()';
        if (inputPrefix === 'troopOrder') onchangeFunction = 'updateTroopOrderTotals()';
        
        div.innerHTML = `
            <label>${label}</label>
            <input type="number" id="${inputPrefix}${type}" min="0" value="0" onchange="${onchangeFunction}">
            <div class="calculation" id="${inputPrefix}${type}Calc">0 boxes = $0</div>
        `;
        
        container.appendChild(div);
    });
}

// ===== PARENT ORDER FUNCTIONS =====
function updateParentOrderTotals() {
    let totalBoxes = 0;
    let totalValue = 0;
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('parentOrder' + type);
        if (input) {
            const boxes = parseInt(input.value) || 0;
            totalBoxes += boxes;
            totalValue += boxes * cookieTypes[type].price;
            
            const calc = document.getElementById('parentOrder' + type + 'Calc');
            if (calc) {
                calc.textContent = `${boxes} boxes = $${boxes * cookieTypes[type].price}`;
            }
        }
    });
    
    const totalBoxesEl = document.getElementById('parentOrderTotalBoxes');
    const totalValueEl = document.getElementById('parentOrderTotalValue');
    if (totalBoxesEl) totalBoxesEl.textContent = totalBoxes;
    if (totalValueEl) totalValueEl.textContent = '$' + totalValue;
}

async function submitParentOrder() {
    if (currentUser.role !== 'parent') return;
    
    const girlId = document.getElementById('parentOrderGirl').value;
    const reason = document.getElementById('parentOrderReason').value;
    
    if (!girlId) {
        showMessage('parentOrderMessages', 'Please select a girl', true);
        return;
    }
    
    let totalBoxes = 0;
    let totalValue = 0;
    let cookies = {};
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('parentOrder' + type);
        if (input) {
            const boxes = parseInt(input.value) || 0;
            if (boxes > 0) {
                cookies[type] = boxes;
                totalBoxes += boxes;
                totalValue += boxes * cookieTypes[type].price;
            }
            input.value = '0';
        }
    });
    
    if (totalBoxes === 0) {
        showMessage('parentOrderMessages', 'Please request at least one box', true);
        return;
    }
    
    const selectedGirl = girls.find(g => g.id == girlId);
    const order = {
        id: Date.now(),
        parentId: currentUser.id,
        parentName: currentUser.name,
        girlId: girlId,
        girlName: selectedGirl ? selectedGirl.girlName : '',
        reason: reason,
        cookies: cookies,
        totalBoxes: totalBoxes,
        totalValue: totalValue,
        status: 'pending',
        requestedAt: new Date().toLocaleString()
    };
    
    parentOrders.push(order);
    await saveParentRequestToSheets(order);

    updateParentOrderTotals();
    updateParentOrderHistory();
    
    showMessage('parentOrderMessages', `Request submitted for ${totalBoxes} boxes ($${totalValue}). Awaiting Cookie Mom approval.`);
}

function updateParentOrderHistory() {
    const container = document.getElementById('parentOrderHistoryDisplay');
    if (!container || currentUser.role !== 'parent') return;
    
    const userOrders = parentOrders.filter(order => order.parentId === currentUser.id);
    
    if (userOrders.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No requests submitted yet</p>';
        return;
    }
    
    container.innerHTML = userOrders.map(order => {
        const statusColor = order.status === 'approved' ? '#28a745' : 
                          order.status === 'partial' ? '#ffc107' : 
                          order.status === 'delivered' ? '#17a2b8' :
                          order.status === 'declined' ? '#dc3545' : '#6c757d';
        
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>Cookie Request #${order.id}</strong><br>
                        <small>Requested: ${order.requestedAt}</small><br>
                        <small>Reason: ${order.reason}</small><br>
                        <small>Total: ${order.totalBoxes} boxes ($${order.totalValue.toFixed(2)})</small>
                        ${order.notes ? `<br><small style="color: #666;">Notes: ${order.notes}</small>` : ''}
                        ${order.status === 'approved' || order.status === 'partial' ? 
                            `<br><small style="color: #28a745;">Approved: ${order.approvedBoxes || 0} boxes ($${(order.approvedValue || 0).toFixed(2)})</small>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; text-transform: uppercase;">
                            ${order.status}
                        </span>
                        ${order.status === 'pending' ? `<br><button class="btn" style="padding: 3px 8px; font-size: 0.7rem; margin-top: 5px; background: #007bff;" onclick="editParentOrder(${order.id})">Edit</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


function updateParentOrderDropdowns() {
    const parentOrderGirl = document.getElementById('parentOrderGirl');
    if (!parentOrderGirl || !currentUser || currentUser.role !== 'parent') return;
    
    parentOrderGirl.innerHTML = '<option value="">Select girl...</option>';
    
    const myGirls = girls.filter(girl => girl.parentName === currentUser.name);
    
    myGirls.forEach(girl => {
        const option = document.createElement('option');
        option.value = girl.id;
        option.textContent = girl.girlName;
        parentOrderGirl.appendChild(option);
    });
    
    if (myGirls.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No girls found - contact Cookie Mom";
        option.disabled = true;
        parentOrderGirl.appendChild(option);
    }
}

// Add edit button to parent order history display
function updateParentOrderHistory() {
    const container = document.getElementById('parentOrderHistoryDisplay');
    if (!container || currentUser.role !== 'parent') return;
    
    const userOrders = parentOrders.filter(order => order.parentId === currentUser.id);
    
    if (userOrders.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No requests submitted yet</p>';
        return;
    }
    
    container.innerHTML = userOrders.map(order => {
        const statusColor = order.status === 'approved' ? '#28a745' : 
                          order.status === 'partial' ? '#ffc107' : 
                          order.status === 'delivered' ? '#17a2b8' :
                          order.status === 'declined' ? '#dc3545' : '#6c757d';
        
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>Cookie Request #${order.id}</strong><br>
                        <small>Requested: ${order.requestedAt}</small><br>
                        <small>Reason: ${order.reason}</small><br>
                        <small>Total: ${order.totalBoxes} boxes ($${order.totalValue.toFixed(2)})</small>
                        ${order.notes ? `<br><small style="color: #666;">Notes: ${order.notes}</small>` : ''}
                        ${order.status === 'approved' || order.status === 'partial' ? 
                            `<br><small style="color: #28a745;">Approved: ${order.approvedBoxes || 0} boxes ($${(order.approvedValue || 0).toFixed(2)})</small>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; text-transform: uppercase;">
                            ${order.status}
                        </span>
                        ${order.status === 'pending' ? `<br><button class="btn" style="padding: 3px 8px; font-size: 0.7rem; margin-top: 5px; background: #007bff;" onclick="editParentOrder(${order.id})">Edit</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Function to edit pending parent orders
function editParentOrder(orderId) {
    const order = parentOrders.find(o => o.id == orderId);
    if (!order || order.status !== 'pending') {
        alert('This order cannot be edited.');
        return;
    }
    
    // Pre-fill the form with current order data
    const girlSelect = document.getElementById('parentOrderGirl');
    const reasonSelect = document.getElementById('parentOrderReason');
    
    if (girlSelect) girlSelect.value = order.girlId;
    if (reasonSelect) reasonSelect.value = order.reason;
    
    // Pre-fill cookie quantities
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('parentOrder' + type);
        if (input) {
            input.value = order.cookies[type] || 0;
        }
    });
    
    // Update totals display
    updateParentOrderTotals();
    
    // Switch to the order tab
    showTab('parent-orders');
    
    // Show edit mode message and change button
    const container = document.getElementById('parentOrderMessages');
    if (container) {
        container.innerHTML = `
            <div class="alert" style="background: #fff3cd; color: #856404; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Editing Request #${order.id}</strong><br>
                Make your changes below and click "Update Cookie Request" to save.
                <button onclick="cancelEdit()" style="float: right; background: #6c757d; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 0.8rem;">Cancel</button>
            </div>
        `;
    }
    
    // Change submit button to update mode
    const submitBtn = document.querySelector('button[onclick="submitParentOrder()"]');
    if (submitBtn) {
        submitBtn.textContent = 'Update Cookie Request';
        submitBtn.onclick = () => updateParentOrder(orderId);
    }
}

// Function to update existing parent order
async function updateParentOrder(orderId) {
    const order = parentOrders.find(o => o.id == orderId);
    if (!order) {
        alert('Order not found.');
        return;
    }
    
    const girlId = document.getElementById('parentOrderGirl').value;
    const reason = document.getElementById('parentOrderReason').value;
    
    if (!girlId) {
        showMessage('parentOrderMessages', 'Please select a girl', true);
        return;
    }
    
    let totalBoxes = 0;
    let totalValue = 0;
    let cookies = {};
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('parentOrder' + type);
        if (input) {
            const boxes = parseInt(input.value) || 0;
            if (boxes > 0) {
                cookies[type] = boxes;
                totalBoxes += boxes;
                totalValue += boxes * cookieTypes[type].price;
            }
        }
    });
    
    if (totalBoxes === 0) {
        showMessage('parentOrderMessages', 'Please request at least one box', true);
        return;
    }
    
    // Update the order
    order.girlId = girlId;
    order.reason = reason;
    order.cookies = cookies;
    order.totalBoxes = totalBoxes;
    order.totalValue = totalValue;
    order.lastModifiedAt = new Date().toLocaleString();
    
    try {
        await updateParentRequestInSheets(order);
        
        // Reset form
        cancelEdit();
        
        showMessage('parentOrderMessages', 
            `Request #${order.id} updated! ${totalBoxes} boxes ($${totalValue.toFixed(2)}) - awaiting Cookie Mom review.`);
        
        updateParentOrderHistory();
        
    } catch (error) {
        console.error('Error updating order:', error);
        showMessage('parentOrderMessages', 'Error updating request. Please try again.', true);
    }
}

// Function to cancel editing
function cancelEdit() {
    // Clear the form
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('parentOrder' + type);
        if (input) input.value = '0';
    });
    
    const girlSelect = document.getElementById('parentOrderGirl');
    const reasonSelect = document.getElementById('parentOrderReason');
    if (girlSelect) girlSelect.value = '';
    if (reasonSelect) reasonSelect.value = 'weekly-order';
    
    // Clear messages
    const container = document.getElementById('parentOrderMessages');
    if (container) container.innerHTML = '';
    
    // Reset submit button
    const submitBtn = document.querySelector('button[onclick^="updateParentOrder"]');
    if (submitBtn) {
        submitBtn.textContent = 'Submit Cookie Request';
        submitBtn.onclick = submitParentOrder;
    }
    
    updateParentOrderTotals();
}


// ===== PERSONAL SALES FUNCTIONS =====
function updatePersonalSalesTotals() {
    let totalBoxes = 0;
    let totalValue = 0;
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('mySale' + type);
        if (input) {
            const boxes = parseInt(input.value) || 0;
            totalBoxes += boxes;
            totalValue += boxes * cookieTypes[type].price;
            
            const calc = document.getElementById('mySale' + type + 'Calc');
            if (calc) {
                calc.textContent = `${boxes} boxes = $${boxes * cookieTypes[type].price}`;
            }
        }
    });
    
    const totalBoxesEl = document.getElementById('mySaleTotalBoxes');
    const totalValueEl = document.getElementById('mySaleTotalValue');
    if (totalBoxesEl) totalBoxesEl.textContent = totalBoxes;
    if (totalValueEl) totalValueEl.textContent = '$' + totalValue;
}

function recordPersonalSale() {
    if (currentUser.role !== 'parent') return;
    
    const saleDate = document.getElementById('saleDate').value;
    const customer = document.getElementById('saleCustomer').value.trim();
    const paymentMethod = document.getElementById('salePaymentMethod').value;
    
    if (!saleDate || !customer) {
        showMessage('mySalesMessages', 'Please enter sale date and customer', true);
        return;
    }
    
    let totalBoxes = 0;
    let totalValue = 0;
    let cookies = {};
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('mySale' + type);
        if (input) {
            const boxes = parseInt(input.value) || 0;
            if (boxes > 0) {
                cookies[type] = boxes;
                totalBoxes += boxes;
                totalValue += boxes * cookieTypes[type].price;
            }
            input.value = '0';
        }
    });
    
    if (totalBoxes === 0) {
        showMessage('mySalesMessages', 'Please enter at least one box sold', true);
        return;
    }
    
    const sale = {
        id: Date.now(),
        parentId: currentUser.id,
        parentName: currentUser.name,
        saleDate: saleDate,
        customer: customer,
        paymentMethod: paymentMethod,
        cookies: cookies,
        totalBoxes: totalBoxes,
        totalValue: totalValue,
        recordedAt: new Date().toLocaleString()
    };
    
    personalSales.push(sale);
    
    document.getElementById('saleCustomer').value = '';
    updatePersonalSalesTotals();
    updatePersonalSalesDisplay();
    
    showMessage('mySalesMessages', `Sale recorded: ${totalBoxes} boxes ($${totalValue}) to ${customer}`);
}

function updatePersonalSalesDisplay() {
    const container = document.getElementById('mySalesSummaryDisplay');
    if (!container || currentUser.role !== 'parent') return;
    
    const userSales = personalSales.filter(sale => sale.parentId === currentUser.id);
    
    if (userSales.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No sales recorded yet</p>';
        return;
    }
    
    const totalBoxes = userSales.reduce((sum, sale) => sum + sale.totalBoxes, 0);
    const totalValue = userSales.reduce((sum, sale) => sum + sale.totalValue, 0);
    
    container.innerHTML = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: center;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;">${totalBoxes}</div>
                    <div>Total Boxes Sold</div>
                </div>
                <div>
                    <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;">$${totalValue}</div>
                    <div>Total Sales Value</div>
                </div>
            </div>
        </div>
        
        <h4>Recent Sales:</h4>
        ${userSales.slice(-3).reverse().map(sale => `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${sale.customer}</strong> - ${sale.saleDate}<br>
                        <small>${sale.paymentMethod} | ${sale.totalBoxes} boxes</small>
                    </div>
                    <div style="font-weight: bold; color: #28a745;">
                        $${sale.totalValue}
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

// ===== BALANCE DISPLAY =====
function updateMyBalanceDisplay() {
    const container = document.getElementById('myBalanceDisplay');
    if (!container || currentUser.role !== 'parent') return;
    
    const userGirls = girls.filter(girl => girl.parentName === currentUser.name);
    const totalBalance = userGirls.reduce((sum, girl) => sum + girl.balance, 0);
    
    const userPayments = payments.filter(payment => payment.parentName === currentUser.name);
    const totalPaid = userPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">
            <div style="text-align: center; padding: 20px; background: ${totalBalance > 0 ? '#f8d7da' : '#d4edda'}; border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: bold; color: ${totalBalance > 0 ? '#721c24' : '#155724'};">
                    $${totalBalance.toFixed(2)}
                </div>
                <div>${totalBalance > 0 ? 'Amount Owed' : 'Account Current'}</div>
            </div>
            <div style="text-align: center; padding: 20px; background: #d1ecf1; border-radius: 8px;">
                <div style="font-size: 2rem; font-weight: bold; color: #0c5460;">
                    $${totalPaid.toFixed(2)}
                </div>
                <div>Total Paid</div>
            </div>
        </div>
        
        <h4>My Girls' Accounts:</h4>
        ${userGirls.length === 0 ? '<p style="color: #666;">No girls found for your account. Make sure girls are added with your exact name.</p>' : 
        userGirls.map(girl => {
            const totalInventory = Object.values(girl.inventory).reduce((sum, qty) => sum + qty, 0);
            const inventoryDetails = Object.keys(girl.inventory)
                .filter(type => girl.inventory[type] > 0)
                .map(type => `${type}: ${girl.inventory[type]}`)
                .join(', ') || 'No inventory';
            
            return `
                <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${girl.girlName}</strong><br>
                            <small>Participation: ${girl.participationType}</small><br>
                            <small>Inventory: ${totalInventory} boxes</small><br>
                            <small style="color: #666;">${inventoryDetails}</small>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: bold; color: ${girl.balance > 0 ? '#dc3545' : '#28a745'};">
                                ${girl.balance > 0 ? `Owes: $${girl.balance.toFixed(2)}` : 'Current'}
                            </div>
                            <small>Sold: ${girl.totalSold} boxes</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
    
    updateMyPaymentHistoryDisplay();
}

function updateMyPaymentHistoryDisplay() {
    const container = document.getElementById('myPaymentHistoryDisplay');
    if (!container || currentUser.role !== 'parent') return;
    
    const userPayments = payments.filter(payment => payment.parentName === currentUser.name);
    
    if (userPayments.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No payments recorded yet</p>';
        return;
    }
    
    const sortedPayments = [...userPayments].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    
    container.innerHTML = `
        <div style="max-height: 300px; overflow-y: auto;">
            ${sortedPayments.map(payment => `
                <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>${payment.girlName}</strong><br>
                            <small>Date: ${payment.paymentDate}</small><br>
                            <small>Method: ${payment.paymentMethod}</small><br>
                            ${payment.reference ? `<small>Ref: ${payment.reference}</small><br>` : ''}
                            <small style="color: #666;">Recorded: ${payment.recordedAt}</small>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: bold; color: #28a745;">
                                $${payment.amount.toFixed(2)}
                            </div>
                            <small style="color: #666;">
                                Balance: $${payment.balanceBefore.toFixed(2)} → $${payment.balanceAfter.toFixed(2)}
                            </small>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ===== BOOTH SIGNUP FUNCTIONS =====
function setupParentBoothSignups() {
    const parentBoothsTab = document.getElementById('parent-booths');
    if (!parentBoothsTab || !currentUser || currentUser.role !== 'parent') return;
    
    const myGirls = girls.filter(g => g.parentName === currentUser.name);
    
    parentBoothsTab.innerHTML = `
        <div class="section">
            <h2>Booth Signups</h2>
            <div id="parentBoothsMessages"></div>
            
            ${myGirls.length === 0 ? 
                '<p style="color: #666;">No girls found. Contact Cookie Mom to add your girls.</p>' :
                '<div id="availableBooths"></div>'
            }
            
            <div class="section">
                <h3>My Booth Signups</h3>
                <div id="myBoothSignups">
                    <p style="color: #666;">No signups yet</p>
                </div>
            </div>
        </div>
    `;
    
    if (myGirls.length > 0) {
        displayAvailableBooths();
        displayMyBoothSignups();
    }
}

function displayAvailableBooths() {
    const container = document.getElementById('availableBooths');
    if (!container) return;
    
    const myGirls = girls.filter(g => g.parentName === currentUser.name);
    const availableBooths = booths.filter(b => b.status === 'scheduled');
    
    if (availableBooths.length === 0) {
        container.innerHTML = '<p style="color: #666;">No booths available for signup.</p>';
        return;
    }
    
    container.innerHTML = `
        <h3>Available Booths</h3>
        ${availableBooths.map(booth => `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${booth.name}</strong><br>
                        <small>${booth.date} • ${booth.startTime}-${booth.endTime}</small><br>
                        <small>Type: ${booth.type}</small>
                    </div>
                    <div>
                        <select id="girl-${booth.id}" style="margin-bottom: 10px;">
                            <option value="">Select girl...</option>
                            ${myGirls.map(girl => 
                                `<option value="${girl.id}">${girl.girlName}</option>`
                            ).join('')}
                        </select><br>
                        <button class="btn" onclick="signupForBooth('${booth.id}')" style="padding: 8px 15px;">
                            Sign Up
                        </button>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

function displayMyBoothSignups() {
    const container = document.getElementById('myBoothSignups');
    if (!container) return;
    
    const mySignups = boothSignups.filter(s => s.parentName === currentUser.name);
    
    if (mySignups.length === 0) {
        container.innerHTML = '<p style="color: #666;">No signups yet</p>';
        return;
    }
    
    container.innerHTML = mySignups.map(signup => `
        <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <strong>${signup.girlName} → ${signup.boothName}</strong><br>
                    <small>${signup.boothDate || 'Date TBD'}</small><br>
                    <small>Status: ${signup.status}</small>
                </div>
                <button class="btn" style="background: #dc3545; padding: 5px 10px;" 
                        onclick="cancelBoothSignup('${signup.id}')">
                    Cancel
                </button>
            </div>
        </div>
    `).join('');
}

async function signupForBooth(boothId) {
    const girlSelect = document.getElementById(`girl-${boothId}`);
    const girlId = girlSelect ? girlSelect.value : '';
    
    if (!girlId) {
        showMessage('parentBoothsMessages', 'Please select a girl first.', true);
        return;
    }
    
    const booth = booths.find(b => b.id == boothId);
    const girl = girls.find(g => g.id == girlId);
    
    if (!booth || !girl) {
        showMessage('parentBoothsMessages', 'Invalid selection.', true);
        return;
    }
    
    const existingSignup = boothSignups.find(s => 
        s.boothId == boothId && s.girlId == girlId
    );
    
    if (existingSignup) {
        showMessage('parentBoothsMessages', 'Already signed up for this booth.', true);
        return;
    }
    
    const signup = {
        id: Date.now(),
        boothId: booth.id,
        boothName: booth.name,
        boothDate: booth.date,
        girlId: girl.id,
        girlName: girl.girlName,
        parentName: currentUser.name,
        status: 'confirmed',
        signedAt: new Date().toLocaleString(),
        roles: ['general']
    };
    
    boothSignups.push(signup);
    
    try {
        await saveBoothSignupToSheets(signup);
        showMessage('parentBoothsMessages', `${girl.girlName} signed up for ${booth.name}!`);
        displayMyBoothSignups();
        girlSelect.value = '';
    } catch (error) {
        showMessage('parentBoothsMessages', 'Error saving signup. Please try again.', true);
    }
}

async function cancelBoothSignup(signupId) {
    if (!confirm('Cancel this booth signup?')) return;
    
    const index = boothSignups.findIndex(s => s.id == signupId);
    if (index > -1) {
        boothSignups.splice(index, 1);
        displayMyBoothSignups();
        showMessage('parentBoothsMessages', 'Signup cancelled.');
    }
}


// ===== COOKIE MOM DASHBOARD FUNCTIONS =====

function updateDashboard() {
    if (!currentUser || currentUser.role !== 'cookie-mom') return;
    
    const totalCases = orders.reduce((sum, order) => sum + (order.totalCases || 0), 0);
    const troopInventoryTotal = Object.values(troopInventory).reduce((sum, qty) => sum + qty, 0);
    const reservedInventoryTotal = getTotalReservedInventory();
    const girlsInventoryTotal = girls.reduce((sum, girl) => {
        return sum + Object.values(girl.inventory).reduce((gSum, qty) => gSum + qty, 0);
    }, 0);
    const totalValue = orders.reduce((sum, order) => sum + (order.totalCost || 0), 0);
    
    document.getElementById('totalCasesDisplay').textContent = totalCases;
    document.getElementById('troopInventoryDisplay').textContent = `${troopInventoryTotal} (${reservedInventoryTotal} reserved)`;
    document.getElementById('girlsInventoryDisplay').textContent = girlsInventoryTotal;
    document.getElementById('totalValueDisplay').textContent = '$' + totalValue;
    
    updateInventoryDisplay();
    updatePendingRequests();
}


function updateInventoryDisplay() {
    const container = document.getElementById('inventoryDisplay');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(cookieTypes).forEach(type => {
        const total = troopInventory[type] || 0;
        const reserved = Object.values(reservedInventory[type] || {})
            .reduce((sum, qty) => sum + qty, 0);
        const available = total - reserved;
        const cases = Math.floor(total / 12);
        const extraBoxes = total % 12;
        
        const div = document.createElement('div');
        div.className = 'inventory-item';
        
        div.innerHTML = `
            <h4>${type}</h4>
            <div class="stock">${total}</div>
            <div class="details">${cases} cases, ${extraBoxes} boxes</div>
            ${reserved > 0 ? `<div class="details" style="color: #ffc107; font-weight: bold;">Reserved: ${reserved}</div>` : ''}
            <div class="details" style="color: #28a745; font-weight: bold;">Available: ${available}</div>
        `;
        
        // Add visual indicator if most inventory is reserved
        if (reserved > 0 && available < total * 0.3) {
            div.style.borderColor = '#ffc107';
            div.style.backgroundColor = '#fff8e1';
        }
        
        container.appendChild(div);
    });
}


// ===== GIRL MANAGEMENT FUNCTIONS =====

async function addGirl() {
    if (currentUser.role !== 'cookie-mom') return;
    
    const girlName = document.getElementById('girlName').value.trim();
    const parentName = document.getElementById('parentName').value.trim();
    const participationType = document.getElementById('participationType').value;
    const contactInfo = document.getElementById('contactInfo').value.trim();
    
    if (!girlName || !parentName) {
        showMessage('girlMessages', 'Please enter both girl and parent names', true);
        return;
    }
    
    const girl = {
        id: Date.now(),
        girlName: girlName,
        parentName: parentName,
        participationType: participationType,
        contactInfo: contactInfo,
        balance: 0,
        inventory: {},
        totalSold: 0,
        addedAt: new Date().toLocaleString()
    };
    
    Object.keys(cookieTypes).forEach(type => {
        girl.inventory[type] = 0;
    });
    
    girls.push(girl);
    await saveGirlToSheets(girl);
    
    document.getElementById('girlName').value = '';
    document.getElementById('parentName').value = '';
    document.getElementById('contactInfo').value = '';
    
    updateGirlsList();
    updateParentOrderDropdowns();
    updateDashboard();
    
    showMessage('girlMessages', `Added ${girlName} (${participationType})`);
}

function updateGirlsList() {
    const container = document.getElementById('girlListDisplay');
    if (!container) return;
    
    if (girls.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No girls added yet</p>';
        return;
    }
    
    container.innerHTML = girls.map(girl => {
        const totalInventory = Object.values(girl.inventory).reduce((sum, qty) => sum + qty, 0);
        const balanceText = girl.balance > 0 ? `Owes: $${girl.balance.toFixed(2)}` : 
                          girl.balance < 0 ? `Credit: $${Math.abs(girl.balance).toFixed(2)}` : 
                          'Balance: $0.00';
        const balanceColor = girl.balance > 0 ? '#dc3545' : girl.balance < 0 ? '#28a745' : '#666';
        
        const inventoryDetails = Object.keys(girl.inventory)
            .filter(type => girl.inventory[type] > 0)
            .map(type => `${type}: ${girl.inventory[type]}`)
            .join(', ') || 'No inventory';
        
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${girl.girlName}</strong> (${girl.participationType})<br>
                        <small>Parent: ${girl.parentName}</small><br>
                        ${girl.contactInfo ? `<small>Contact: ${girl.contactInfo}</small><br>` : ''}
                        <small>Inventory: ${totalInventory} boxes</small><br>
                        <small style="color: #666;">${inventoryDetails}</small><br>
                        <small style="color: #999;">Added: ${girl.addedAt}</small>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; color: ${balanceColor};">
                            ${balanceText}
                        </div>
                        <small>Sold: ${girl.totalSold} boxes</small><br>
                        <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; margin-top: 5px; background: #dc3545;" 
                                onclick="deleteGirl(${girl.id})">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    updatePaymentDropdowns();
    updateTransferDropdowns();
}

async function deleteGirl(girlId) {
    if (currentUser.role !== 'cookie-mom') return;
    
    const girl = girls.find(g => g.id == girlId);
    if (!girl) return;
    
    if (confirm(`Are you sure you want to delete ${girl.girlName}? This cannot be undone.`)) {
        girls = girls.filter(g => g.id != girlId);
        await updateAllGirlsInSheets();
        updateGirlsList();
        updateParentOrderDropdowns();
        updateDashboard();
        showMessage('girlMessages', `${girl.girlName} has been removed`);
    }
}

// ===== TROOP ORDER FUNCTIONS =====

function updateTroopOrderTotals() {
    let totalCases = 0;
    let totalBoxes = 0;
    let totalCost = 0;
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('troopOrder' + type);
        if (input) {
            const cases = parseInt(input.value) || 0;
            const boxes = cases * 12;
            const cost = boxes * cookieTypes[type].price;
            
            totalCases += cases;
            totalBoxes += boxes;
            totalCost += cost;
            
            const calc = document.getElementById('troopOrder' + type + 'Calc');
            if (calc) {
                calc.textContent = `${cases} cases (${boxes} boxes) = $${cost}`;
            }
        }
    });
    
    document.getElementById('orderTotalCases').textContent = totalCases;
    document.getElementById('orderTotalBoxes').textContent = totalBoxes;
    document.getElementById('orderTotalCost').textContent = '$' + totalCost;
}

async function submitTroopOrder() {
    if (currentUser.role !== 'cookie-mom') return;
    
    const orderType = document.getElementById('orderType').value;
    const orderDate = document.getElementById('orderDate').value;
    const deliveryDate = document.getElementById('deliveryDate').value;
    const pickupLocation = document.getElementById('pickupLocation').value;
    
    if (!orderDate || !deliveryDate || !pickupLocation) {
        showMessage('orderMessages', 'Please fill in all order details', true);
        return;
    }
    
    let totalCases = 0;
    let totalBoxes = 0;
    let totalCost = 0;
    let cookies = {};
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('troopOrder' + type);
        if (input) {
            const cases = parseInt(input.value) || 0;
            if (cases > 0) {
                cookies[type] = cases;
                totalCases += cases;
                const boxes = cases * 12;
                totalBoxes += boxes;
                totalCost += boxes * cookieTypes[type].price;
                
                // Add to troop inventory
                troopInventory[type] += boxes;
            }
            input.value = '0';
        }
    });
    
    if (totalCases === 0) {
        showMessage('orderMessages', 'Please order at least one case', true);
        return;
    }
    
    const order = {
        id: Date.now(),
        type: orderType,
        orderDate: orderDate,
        deliveryDate: deliveryDate,
        pickupLocation: pickupLocation,
        cookies: cookies,
        totalCases: totalCases,
        totalBoxes: totalBoxes,
        totalCost: totalCost,
        status: 'received',
        timestamp: new Date().toLocaleString()
    };
    
    orders.push(order);
    await saveOrderToSheets(order);
    await updateTroopInventoryInSheets();

    // Clear form
    document.getElementById('orderDate').value = '';
    document.getElementById('deliveryDate').value = '';
    document.getElementById('pickupLocation').value = '';
    
    updateTroopOrderTotals();
    updateOrderHistory();
    updateDashboard();
    
    showMessage('orderMessages', `Order submitted! ${totalCases} cases (${totalBoxes} boxes) for $${totalCost} added to troop inventory.`);
}

function updateOrderHistory() {
    const container = document.getElementById('orderHistoryDisplay');
    if (!container) return;
    
    if (orders.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No orders placed yet</p>';
        return;
    }
    
    container.innerHTML = orders.map(order => {
        const cookieDetails = Object.keys(order.cookies).map(type => 
            `${type}: ${order.cookies[type]} cases`
        ).join(', ');
        
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${order.type.charAt(0).toUpperCase() + order.type.slice(1)} Order</strong> - ${order.orderDate}<br>
                        <small>Delivery: ${order.deliveryDate} | Pickup: ${order.pickupLocation}</small><br>
                        <small>Cookies: ${cookieDetails}</small><br>
                        <small>Placed: ${order.timestamp}</small>
                    </div>
                    <div style="text-align: right; font-weight: bold;">
                        ${order.totalCases} cases<br>
                        ${order.totalBoxes} boxes<br>
                        $${order.totalCost}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===== PARENT REQUEST APPROVAL FUNCTIONS =====

function updatePendingRequests() {
    if (!currentUser || currentUser.role !== 'cookie-mom') return;
    
    const pendingRequests = parentOrders.filter(order => order.status === 'pending');
    const dashboardSection = document.getElementById('pendingRequestsSection');
    const dashboardDisplay = document.getElementById('pendingRequestsDisplay');
    
    if (pendingRequests.length === 0) {
        if (dashboardSection) dashboardSection.style.display = 'none';
        return;
    }
    
    if (dashboardSection) dashboardSection.style.display = 'block';
    if (dashboardDisplay) {
        dashboardDisplay.innerHTML = pendingRequests.map(order => `
            <div style="border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: #fff3cd;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${order.parentName}</strong> requests cookies for ${order.girlName}<br>
                        <small>Requested: ${order.requestedAt}</small><br>
                        <small>Reason: ${order.reason}</small><br>
                        <small>Total: ${order.totalBoxes} boxes ($${order.totalValue})</small>
                    </div>
                    <div>
                        <button class="btn" style="padding: 5px 10px; font-size: 0.8rem;" 
                                onclick="reviewRequest(${order.id})">
                            Review
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    updateParentRequestsList();
}

function updateParentRequestsList() {
    const container = document.getElementById('parentRequestsList');
    if (!container || !currentUser || currentUser.role !== 'cookie-mom') return;
    
    if (parentOrders.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No parent requests to review</p>';
        return;
    }
    
    const sortedOrders = [...parentOrders].sort((a, b) => {
        const statusOrder = { 'pending': 1, 'approved': 2, 'partial': 2, 'delivered': 3, 'declined': 4 };
        const aOrder = statusOrder[a.status] || 5;
        const bOrder = statusOrder[b.status] || 5;
        
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(b.requestedAt) - new Date(a.requestedAt);
    });
    
    container.innerHTML = sortedOrders.map(order => {
        const statusColor = order.status === 'approved' ? '#28a745' : 
                          order.status === 'partial' ? '#28a745' : 
                          order.status === 'delivered' ? '#17a2b8' :
                          order.status === 'declined' ? '#dc3545' : '#6c757d';
        
        const statusText = order.status === 'partial' ? 
            `Partial Approved (${order.approvedBoxes || 0}/${order.totalBoxes} boxes)` :
            order.status === 'approved' ? 'Approved - Ready for Delivery' :
            order.status === 'delivered' ? 'Delivered' :
            order.status;
        
        const girl = girls.find(g => g.id == order.girlId);
        const girlName = girl ? girl.girlName : order.girlName;
            
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                        <strong>${order.parentName}</strong> → ${girlName}<br>
                        <small>Requested: ${order.requestedAt}</small><br>
                        <small>Reason: ${order.reason}</small>
                        ${order.approvedAt ? `<br><small>Approved: ${order.approvedAt}</small>` : ''}
                        ${order.deliveredAt ? `<br><small>Delivered: ${order.deliveredAt}</small>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <span style="background: ${statusColor}; color: white; padding: 4px 8px; border-radius: 10px; font-size: 0.8rem; text-transform: uppercase;">
                            ${statusText}
                        </span>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
                    <strong>Requested Cookies:</strong><br>
                    ${Object.keys(order.cookies).map(type => 
                        `${type}: ${order.cookies[type]} boxes ($${(order.cookies[type] * cookieTypes[type].price).toFixed(2)})`
                    ).join(', ')}
                    <br><strong>Total Requested: ${order.totalBoxes} boxes = $${order.totalValue.toFixed(2)}</strong>
                    
                    ${(order.status === 'approved' || order.status === 'partial' || order.status === 'delivered') && order.approvedCookies ? `
                        <br><br><strong>Approved Cookies:</strong><br>
                        ${Object.keys(order.approvedCookies || {}).map(type => 
                            `${type}: ${order.approvedCookies[type]} boxes ($${(order.approvedCookies[type] * cookieTypes[type].price).toFixed(2)})`
                        ).join(', ')}
                        <br><strong>Total Approved: ${order.approvedBoxes || 0} boxes = $${(order.approvedValue || 0).toFixed(2)}</strong>
                    ` : ''}
                </div>
                
                ${order.status === 'pending' ? `
                    <div style="text-align: center; margin-top: 10px;">
                        <button class="btn" style="background: #28a745;" onclick="reviewRequest(${order.id})">
                            Review & Approve
                        </button>
                        <button class="btn" style="background: #dc3545;" onclick="declineRequest(${order.id})">
                            Decline
                        </button>
                    </div>
                ` : (order.status === 'approved' || order.status === 'partial') ? `
                    <div style="text-align: center; margin-top: 10px;">
                        <button class="btn" style="background: #007bff;" onclick="deliverApprovedOrder(${order.id})">
                            Deliver Cookies
                        </button>
                    </div>
                ` : order.notes ? `
                    <div style="background: #e9ecef; padding: 10px; border-radius: 5px; margin-top: 10px;">
                        <strong>Notes:</strong> ${order.notes}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function reviewRequest(orderId) {
    if (!currentUser || currentUser.role !== 'cookie-mom') {
        alert('Access denied. Cookie Mom only.');
        return;
    }
    
    const order = parentOrders.find(o => o.id == orderId);
    if (!order) return;
    
    const girl = girls.find(g => g.id == order.girlId);
    if (!girl) {
        alert('Girl not found. Please add the girl first.');
        return;
    }
    
    let approvalHtml = `
        <div style="max-width: 600px;">
            <h3>Review Request from ${order.parentName}</h3>
            <p><strong>Girl:</strong> ${girl.girlName}</p>
            <p><strong>Reason:</strong> ${order.reason}</p>
            <p><strong>Requested:</strong> ${order.requestedAt}</p>
            <br>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: #f8f9fa; font-weight: bold;">
                    <td style="padding: 8px; border: 1px solid #ddd;">Cookie</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">Requested</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">Available</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">Approve</td>
                </tr>`;
    
    Object.keys(order.cookies).forEach(type => {
        const requested = order.cookies[type];
        const available = troopInventory[type] || 0;
        const maxApprove = Math.min(requested, available);
        
        approvalHtml += `
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${type} - ${cookieTypes[type].name}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${requested}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"><strong>${available}</strong></td>
            <td style="padding: 8px; border: 1px solid #ddd;">
                <input type="number" id="approve${type}" min="0" max="${maxApprove}" value="${maxApprove}" 
                       style="width: 60px; text-align: center;">
            </td>
        </tr>`;
    });
    
    approvalHtml += `
            </table>
            <br>
            <label><strong>Notes (optional):</strong></label><br>
            <textarea id="approvalNotes" style="width: 100%; height: 60px; margin: 5px 0;" 
                      placeholder="Add any notes about this approval..."></textarea>
            <br><br>
            <button onclick="executeApproval(${orderId})" style="background: #28a745; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;">
                Approve Request
            </button>
            <button onclick="closeApprovalModal()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">
                Cancel
            </button>
        </div>
    `;
    
    showModal('Review Cookie Request', approvalHtml);
}

async function executeApproval(orderId) {
    if (!currentUser || currentUser.role !== 'cookie-mom') {
        alert('Access denied. Cookie Mom only.');
        return;
    }
    
    const order = parentOrders.find(o => o.id == orderId);
    if (!order) return;
    
    const girl = girls.find(g => g.id == order.girlId);
    if (!girl) return;
    
    let approvedCookies = {};
    let approvedBoxes = 0;
    let approvedValue = 0;
    
    // Validate and collect approved quantities
    Object.keys(order.cookies).forEach(type => {
        const approveInput = document.getElementById('approve' + type);
        if (approveInput) {
            const approveQty = parseInt(approveInput.value) || 0;
            if (approveQty > 0) {
                // Check AVAILABLE inventory (not total - reserved)
                const available = getAvailableTroopInventory(type);
                if (approveQty > available) {
                    alert(`Only ${available} ${type} cookies are available (${troopInventory[type] || 0} total, ${(troopInventory[type] || 0) - available} reserved)`);
                    return;
                }
                
                approvedCookies[type] = approveQty;
                approvedBoxes += approveQty;
                approvedValue += approveQty * cookieTypes[type].price;
            }
        }
    });
    
    if (approvedBoxes === 0) {
        alert('Please approve at least some cookies.');
        return;
    }
    
    showLoading('Processing approval...');
    
    try {
        // Reserve the approved cookies
        Object.keys(approvedCookies).forEach(type => {
            if (!reservedInventory[type]) reservedInventory[type] = {};
            if (!reservedInventory[type][girl.id]) reservedInventory[type][girl.id] = 0;
            
            reservedInventory[type][girl.id] += approvedCookies[type];
        });
        
        // Update order status
        order.approvedCookies = approvedCookies;
        order.approvedBoxes = approvedBoxes;
        order.approvedValue = approvedValue;
        order.status = (approvedBoxes === order.totalBoxes) ? 'approved' : 
                       (approvedBoxes > 0) ? 'partial' : 'declined';
        order.notes = document.getElementById('approvalNotes').value;
        order.approvedAt = new Date().toLocaleString();
        
        // Save to sheets
        await updateParentRequestInSheets(order);
        await saveReservationToSheets();
        
        closeApprovalModal();
        updateDashboard();
        updateParentRequestsList();
        
        showMessage('requestApprovalMessages', 
            `Request ${order.status}! ${approvedBoxes} boxes reserved for ${girl.girlName}. Use "Deliver Cookies" to complete transfer.`);
    } catch (error) {
        console.error('Approval error:', error);
        showMessage('requestApprovalMessages', 'Error processing approval: ' + error.message, true);
    } finally {
        hideLoading();
    }
}

async function deliverApprovedOrder(orderId) {
    if (!currentUser || currentUser.role !== 'cookie-mom') {
        alert('Access denied. Cookie Mom only.');
        return;
    }

    const order = parentOrders.find(o => o.id == orderId);
    if (!order || (order.status !== 'approved' && order.status !== 'partial')) {
        alert('Order not ready for delivery');
        return;
    }
    
    const girl = girls.find(g => g.id == order.girlId);
    if (!girl) {
        alert('Girl not found');
        return;
    }
    
    showLoading('Delivering cookies...');
    
    try {
        // Transfer reserved cookies to girl's inventory
        Object.keys(order.approvedCookies || {}).forEach(type => {
            const qty = order.approvedCookies[type];
            
            // Remove from reserved inventory
            if (reservedInventory[type] && reservedInventory[type][girl.id]) {
                reservedInventory[type][girl.id] -= qty;
                if (reservedInventory[type][girl.id] <= 0) {
                    delete reservedInventory[type][girl.id];
                }
            }
            
            // Remove from troop inventory (now actually leaving troop)
            troopInventory[type] = Math.max(0, (troopInventory[type] || 0) - qty);
            
            // Add to girl's inventory 
            girl.inventory[type] = (girl.inventory[type] || 0) + qty;
            
            // Girl now owes more money
            girl.balance += qty * cookieTypes[type].price;
        });

        // Create delivery transfer record for audit trail
        const deliveryTransfer = {
            id: Date.now(),
            transferDate: new Date().toISOString().split('T')[0],
            date: new Date().toISOString().split('T')[0],
            from: 'Troop (Reserved)',
            to: girl.girlName,
            cookies: { ...(order.approvedCookies || {}) },
            totalBoxes: order.approvedBoxes || 0,
            totalValue: order.approvedValue || 0,
            notes: `Delivery for parent request ${order.id}`,
            recordedAt: new Date().toLocaleString(),
            recordedBy: currentUser.name
        };
        transfers.push(deliveryTransfer);

        order.status = 'delivered';
        order.deliveredAt = new Date().toLocaleString();
        
        // Update sheets with all changes
        await updateParentRequestInSheets(order);
        await updateAllGirlsInSheets();
        await updateTroopInventoryInSheets();
        await saveReservationToSheets();
        await saveTransferToSheets(deliveryTransfer);
        
        updateDashboard();
        updateGirlsList();
        updateParentRequestsList();
        updateTransferHistory();
        
        showMessage('requestApprovalMessages', 
            `Delivered ${order.approvedBoxes} boxes to ${girl.girlName}! Cookies moved from troop to girl's inventory.`);
        
    } catch (error) {
        console.error('Delivery error:', error);
        showMessage('requestApprovalMessages', 'Error during delivery: ' + error.message, true);
    } finally {
        hideLoading();
    }
}


function declineRequest(orderId) {
    if (!currentUser || currentUser.role !== 'cookie-mom') {
        alert('Access denied. Cookie Mom only.');
        return;
    }
    
    const order = parentOrders.find(o => o.id == orderId);
    if (!order) return;
    
    const reason = prompt('Reason for declining (optional):');
    
    order.status = 'declined';
    order.notes = reason || 'Declined by Cookie Mom';
    order.declinedAt = new Date().toLocaleString();
    
    updatePendingRequests();
    updateParentRequestsList();
    
    showMessage('requestApprovalMessages', `Request from ${order.parentName} has been declined.`);
}

function showModal(title, content) {
    const modal = document.createElement('div');
    modal.id = 'approvalModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); z-index: 1000; display: flex; 
        justify-content: center; align-items: center;
    `;
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 10px; padding: 20px; max-height: 90vh; overflow-y: auto;">
            <h2 style="margin-bottom: 15px;">${title}</h2>
            ${content}
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeApprovalModal() {
    const modal = document.getElementById('approvalModal');
    if (modal) {
        modal.remove();
    }
}

// ===== PAYMENT FUNCTIONS =====

function updatePaymentDropdowns() {
    const paymentGirl = document.getElementById('paymentGirl');
    if (!paymentGirl) return;
    
    paymentGirl.innerHTML = '<option value="">Select girl...</option>';
    
    girls.filter(girl => girl.balance > 0).forEach(girl => {
        const option = document.createElement('option');
        option.value = girl.id;
        option.textContent = `${girl.girlName} (${girl.parentName}) - Owes $${girl.balance.toFixed(2)}`;
        paymentGirl.appendChild(option);
    });
}

function updatePaymentBalance() {
    const girlId = document.getElementById('paymentGirl').value;
    const balanceInfo = document.getElementById('paymentBalanceInfo');
    const paymentAmountInput = document.getElementById('paymentAmount');
    
    if (!girlId) {
        if (balanceInfo) balanceInfo.style.display = 'none';
        if (paymentAmountInput) paymentAmountInput.value = '';
        return;
    }
    
    const girl = girls.find(g => g.id == girlId);
    if (!girl) return;
    
    if (balanceInfo) balanceInfo.style.display = 'block';
    const currentBalance = document.getElementById('currentBalance');
    if (currentBalance) currentBalance.textContent = girl.balance.toFixed(2);
    
    if (paymentAmountInput) paymentAmountInput.value = girl.balance.toFixed(2);
    validatePaymentAmount();
}

function validatePaymentAmount() {
    const girlId = document.getElementById('paymentGirl').value;
    const paymentAmount = parseFloat(document.getElementById('paymentAmount').value) || 0;
    
    if (!girlId) return;
    
    const girl = girls.find(g => g.id == girlId);
    if (!girl) return;
    
    const balanceAfter = girl.balance - paymentAmount;
    const balanceAfterEl = document.getElementById('balanceAfterPayment');
    
    if (balanceAfterEl) {
        balanceAfterEl.textContent = balanceAfter.toFixed(2);
        balanceAfterEl.style.color = balanceAfter > 0 ? '#dc3545' : balanceAfter < 0 ? '#28a745' : '#666';
    }
}

async function recordPayment() {
    const girlId = document.getElementById('paymentGirl').value;
    const girl = girls.find(g => g.id == girlId);
    
    if (!girl) {
        showMessage('moneyMessages', 'Select a girl to record a payment.', true);
        return;
    }

    const amountEl = document.getElementById('paymentAmount');
    const methodEl = document.getElementById('paymentMethod');
    const dateEl = document.getElementById('paymentDate');
    const refEl = document.getElementById('paymentReference');

    const amount = parseFloat(amountEl?.value || '0') || 0;
    if (amount <= 0) {
        showMessage('moneyMessages', 'Enter a payment amount greater than 0.', true);
        return;
    }

    const owed = Number(girl.balance || 0);
    if (amount > Math.max(owed, 0)) {
        showMessage('moneyMessages', `Payment exceeds amount owed ($${owed.toFixed(2)}).`, true);
        return;
    }

    showLoading('Recording payment...');
    try {
        const when = (dateEl?.value) || new Date().toISOString().split('T')[0];
        const method = (methodEl?.value) || 'cash';
        const reference = (refEl?.value || '').trim();

        const payment = {
            id: Date.now(),
            girlId: girl.id,
            girlName: girl.girlName,
            parentName: girl.parentName,
            paymentDate: when,
            paymentMethod: method,
            amount: amount,
            reference: reference,
            balanceBefore: owed,
            balanceAfter: owed - amount,
            recordedAt: new Date().toLocaleString(),
            recordedBy: currentUser ? currentUser.name : ''
        };

        payments.push(payment);
        girl.balance = payment.balanceAfter;

        await savePaymentToSheets(payment);
        await updateAllGirlsInSheets();

        if (amountEl) amountEl.value = '';
        if (refEl) refEl.value = '';

        updateOutstandingBalances();
        updatePaymentHistory();
        updateMyBalanceDisplay();

        showMessage('moneyMessages', `Recorded $${amount.toFixed(2)} for ${girl.girlName}.`);
    } catch (e) {
        console.error('recordPayment failed:', e);
        showMessage('moneyMessages', 'Failed to record payment: ' + (e.message || e), true);
    } finally {
        hideLoading();
    }
}

function updateOutstandingBalances() {
    const container = document.getElementById('outstandingBalancesDisplay');
    if (!container || !currentUser || currentUser.role !== 'cookie-mom') return;
    
    const girlsWithBalance = girls.filter(girl => girl.balance > 0);
    
    if (girlsWithBalance.length === 0) {
        container.innerHTML = '<p style="color: #28a745; text-align: center; padding: 20px; font-weight: bold;">All balances are current!</p>';
        return;
    }
    
    const totalOwed = girlsWithBalance.reduce((sum, girl) => sum + girl.balance, 0);
    
    container.innerHTML = `
        <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #721c24;">$${totalOwed.toFixed(2)}</div>
            <div>Total Outstanding</div>
        </div>
        
        ${girlsWithBalance.map(girl => {
            const totalInventory = Object.values(girl.inventory).reduce((sum, qty) => sum + qty, 0);
            return `
                <div style="border: 1px solid #dc3545; border-radius: 8px; padding: 15px; margin-bottom: 10px; background: #fff5f5;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${girl.girlName}</strong> (${girl.parentName})<br>
                            <small>Contact: ${girl.contactInfo || 'No contact info'}</small><br>
                            <small>Current Inventory: ${totalInventory} boxes</small><br>
                            <small>Total Sold: ${girl.totalSold} boxes</small>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.2rem; font-weight: bold; color: #dc3545;">
                                $${girl.balance.toFixed(2)}
                            </div>
                            <button class="btn" style="padding: 5px 10px; font-size: 0.8rem; margin-top: 5px;" 
                                    onclick="quickPayment(${girl.id})">
                                Quick Pay
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

function quickPayment(girlId) {
    const paymentGirl = document.getElementById('paymentGirl');
    if (paymentGirl) paymentGirl.value = girlId;
    updatePaymentBalance();
    
    const today = new Date().toISOString().split('T')[0];
    const paymentDate = document.getElementById('paymentDate');
    if (paymentDate && !paymentDate.value) {
        paymentDate.value = today;
    }
    
    if (paymentGirl) paymentGirl.scrollIntoView({ behavior: 'smooth' });
    
    showMessage('moneyMessages', 'Payment form pre-filled. Review and submit.');
}

function updatePaymentHistory() {
    const container = document.getElementById('paymentHistoryDisplay');
    if (!container || !currentUser || currentUser.role !== 'cookie-mom') return;
    
    if (payments.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No payments recorded yet</p>';
        return;
    }
    
    const sortedPayments = [...payments].sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
    const totalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0);
    
    container.innerHTML = `
        <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #155724;">$${totalPayments.toFixed(2)}</div>
            <div>Total Payments Received</div>
        </div>
        
        <div style="max-height: 400px; overflow-y: auto;">
            ${sortedPayments.map(payment => `
                <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>${payment.girlName}</strong> (${payment.parentName})<br>
                            <small>Date: ${payment.paymentDate}</small><br>
                            <small>Method: ${payment.paymentMethod}</small><br>
                            ${payment.reference ? `<small>Ref: ${payment.reference}</small><br>` : ''}
                            <small style="color: #666;">Recorded: ${payment.recordedAt}</small>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 1.1rem; font-weight: bold; color: #28a745;">
                                $${payment.amount.toFixed(2)}
                            </div>
                            <small style="color: #666;">
                                Balance: $${payment.balanceBefore.toFixed(2)} → $${payment.balanceAfter.toFixed(2)}
                            </small>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ===== TRANSFER FUNCTIONS =====
function updateTransferDropdowns() {
    const transferFrom = document.getElementById('transferFrom');
    const transferTo = document.getElementById('transferTo');
    
    if (!transferFrom || !transferTo) return;
    
    transferFrom.innerHTML = '<option value="">Select source...</option><option value="troop">Troop Inventory</option>';
    transferTo.innerHTML = '<option value="">Select destination...</option><option value="troop">Troop Inventory</option>';
    
    girls.forEach(girl => {
        const totalInventory = Object.values(girl.inventory).reduce((sum, qty) => sum + qty, 0);
        
        const fromOption = document.createElement('option');
        fromOption.value = `girl-${girl.id}`;
        fromOption.textContent = `${girl.girlName} (${totalInventory} boxes)`;
        transferFrom.appendChild(fromOption);
        
        const toOption = document.createElement('option');
        toOption.value = `girl-${girl.id}`;
        toOption.textContent = `${girl.girlName}`;
        transferTo.appendChild(toOption);
    });
}

function updateTransferFromInventory() {
    const fromValue = document.getElementById('transferFrom').value;
    const inventoryInfo = document.getElementById('transferInventoryInfo');
    const sourceDisplay = document.getElementById('sourceInventoryDisplay');
    
    if (!fromValue) {
        if (inventoryInfo) inventoryInfo.style.display = 'none';
        return;
    }
    
    if (inventoryInfo) inventoryInfo.style.display = 'block';
    
    let sourceInventory = {};
    
    if (fromValue === 'troop') {
        sourceInventory = troopInventory;
        if (sourceDisplay) {
            sourceDisplay.innerHTML = Object.keys(cookieTypes).map(type => 
                `${type}: ${troopInventory[type]} boxes`
            ).join('<br>');
        }
    } else if (fromValue.startsWith('girl-')) {
        const girlId = fromValue.replace('girl-', '');
        const girl = girls.find(g => g.id == girlId);
        if (girl) {
            sourceInventory = girl.inventory;
            if (sourceDisplay) {
                sourceDisplay.innerHTML = Object.keys(cookieTypes).map(type => 
                    `${type}: ${girl.inventory[type] || 0} boxes`
                ).join('<br>');
            }
        }
    }
    
    createTransferGrid(sourceInventory);
    validateTransferSelection();
}

function validateTransferSelection() {
    const fromValue = document.getElementById('transferFrom').value;
    const toValue = document.getElementById('transferTo').value;
    const destDisplay = document.getElementById('destInventoryDisplay');
    
    if (!toValue) {
        if (destDisplay) destDisplay.textContent = 'Select destination first';
        return;
    }
    
    if (fromValue === toValue) {
        showMessage('transferMessages', 'Cannot transfer to the same location', true);
        const transferTo = document.getElementById('transferTo');
        if (transferTo) transferTo.value = '';
        return;
    }
    
    if (toValue === 'troop') {
        if (destDisplay) {
            destDisplay.innerHTML = Object.keys(cookieTypes).map(type => 
                `${type}: ${troopInventory[type]} boxes`
            ).join('<br>');
        }
    } else if (toValue.startsWith('girl-')) {
        const girlId = toValue.replace('girl-', '');
        const girl = girls.find(g => g.id == girlId);
        if (girl && destDisplay) {
            destDisplay.innerHTML = Object.keys(cookieTypes).map(type => 
                `${type}: ${girl.inventory[type] || 0} boxes`
            ).join('<br>');
        }
    }
}

function createTransferGrid(sourceInventory) {
    const container = document.getElementById('transferGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.keys(cookieTypes).forEach(type => {
        const fromValue = document.getElementById('transferFrom').value;
        let available, displayText;
        
        if (fromValue === 'troop') {
            const total = troopInventory[type] || 0;
            const reserved = Object.values(reservedInventory[type] || {})
                .reduce((sum, qty) => sum + qty, 0);
            available = total - reserved;
            displayText = `Available: ${available} (${total} total, ${reserved} reserved)`;
        } else {
            available = sourceInventory[type] || 0;
            displayText = `Available: ${available}`;
        }
        
        const div = document.createElement('div');
        div.className = 'cookie-item';
        
        div.innerHTML = `
            <label>${type} - ${cookieTypes[type].name}</label>
            <input type="number" id="transfer${type}" min="0" max="${available}" value="0" 
                   onchange="updateTransferTotals()" 
                   ${available === 0 ? 'disabled' : ''}>
            <div class="calculation" style="font-size: 0.8rem; color: ${available === 0 ? '#dc3545' : '#666'}">${displayText}</div>
        `;
        
        container.appendChild(div);
    });
    
    updateTransferTotals();
}

function updateTransferTotals() {
    let totalBoxes = 0;
    let totalValue = 0;
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('transfer' + type);
        if (input && !input.disabled) {
            const boxes = parseInt(input.value) || 0;
            totalBoxes += boxes;
            totalValue += boxes * cookieTypes[type].price;
        }
    });
    
    const totalBoxesEl = document.getElementById('transferTotalBoxes');
    const totalValueEl = document.getElementById('transferTotalValue');
    if (totalBoxesEl) totalBoxesEl.textContent = totalBoxes;
    if (totalValueEl) totalValueEl.textContent = totalValue;
}

async function executeTransfer() {
    if (currentUser.role !== 'cookie-mom') return;
    
    const fromValue = document.getElementById('transferFrom').value;
    const toValue = document.getElementById('transferTo').value;
    const transferDate = document.getElementById('transferDate').value;
    const transferReason = document.getElementById('transferReason').value;
    const transferNotes = document.getElementById('transferNotes').value.trim();
    
    if (!fromValue || !toValue || !transferDate) {
        showMessage('transferMessages', 'Please fill in all required fields', true);
        return;
    }
    
    let transferCookies = {};
    let totalBoxes = 0;
    let totalValue = 0;
    let hasTransfer = false;
    
    Object.keys(cookieTypes).forEach(type => {
        const input = document.getElementById('transfer' + type);
        if (input && !input.disabled) {
            const boxes = parseInt(input.value) || 0;
            if (boxes > 0) {
                transferCookies[type] = boxes;
                totalBoxes += boxes;
                totalValue += boxes * cookieTypes[type].price;
                hasTransfer = true;
            }
        }
    });
    
    if (!hasTransfer) {
        showMessage('transferMessages', 'Please enter at least one box to transfer', true);
        return;
    }
    
    // Get source and destination objects
    let sourceObj, destObj, sourceName, destName, sourceGirl, destGirl;
    
    if (fromValue === 'troop') {
        sourceObj = troopInventory;
        sourceName = 'Troop Inventory';
        
        // For troop transfers, validate against AVAILABLE (unreserved) inventory
        for (const type of Object.keys(transferCookies)) {
            const available = getAvailableTroopInventory(type);
            if (transferCookies[type] > available) {
                const reserved = (troopInventory[type] || 0) - available;
                showMessage('transferMessages', 
                    `Not enough ${type} cookies available. Have ${troopInventory[type] || 0} total, but ${reserved} are reserved. Only ${available} available.`, 
                    true);
                return;
            }
        }
    } else {
        const girlId = fromValue.replace('girl-', '');
        sourceGirl = girls.find(g => g.id == girlId);
        sourceObj = sourceGirl ? sourceGirl.inventory : null;
        sourceName = sourceGirl ? sourceGirl.girlName : 'Unknown';
    }
    
    if (toValue === 'troop') {
        destObj = troopInventory;
        destName = 'Troop Inventory';
    } else {
        const girlId = toValue.replace('girl-', '');
        destGirl = girls.find(g => g.id == girlId);
        destName = destGirl ? destGirl.girlName : 'Unknown';
    }
    
    if (!sourceObj || (!destObj && !destGirl)) {
        showMessage('transferMessages', 'Invalid source or destination', true);
        return;
    }
    
    // Final validation for girl-to-girl or girl-to-troop transfers
    if (fromValue !== 'troop') {
        for (const type of Object.keys(transferCookies)) {
            if ((sourceObj[type] || 0) < transferCookies[type]) {
                showMessage('transferMessages', 
                    `${sourceName} doesn't have enough ${type} cookies (need ${transferCookies[type]}, have ${sourceObj[type] || 0})`, 
                    true);
                return;
            }
        }
    }
    
    showLoading('Executing transfer...');
    
    try {
        // Execute the transfer with correct balance logic
        Object.keys(transferCookies).forEach(type => {
            const qty = transferCookies[type];
            const value = qty * cookieTypes[type].price;
            
            // Remove from source
            if (fromValue === 'troop') {
                troopInventory[type] -= qty;
            } else if (sourceGirl) {
                sourceGirl.inventory[type] -= qty;
                // When girl returns cookies to troop, reduce her debt
                if (toValue === 'troop') {
                    sourceGirl.balance -= value;
                }
            }
            
            // Add to destination
            if (toValue === 'troop') {
                troopInventory[type] = (troopInventory[type] || 0) + qty;
            } else if (destGirl) {
                destGirl.inventory[type] = (destGirl.inventory[type] || 0) + qty;
                // When girl receives cookies from troop, increase her debt
                if (fromValue === 'troop') {
                    destGirl.balance += value;
                }
                // Girl-to-girl transfers: debt moves with the cookies
                if (fromValue.startsWith('girl-')) {
                    destGirl.balance += value;
                    // Reduce source girl's debt
                    if (sourceGirl) {
                        sourceGirl.balance -= value;
                    }
                }
            }
            
            // Clear input
            const input = document.getElementById('transfer' + type);
            if (input) input.value = '0';
        });
        
        // Record the transfer
        const transfer = {
            id: Date.now(),
            transferDate,
            date: transferDate,
            from: sourceName,
            to: destName,
            cookies: transferCookies,
            totalBoxes: totalBoxes,
            totalValue: totalValue,
            notes: `${transferReason} - ${transferNotes}`,
            recordedAt: new Date().toLocaleString(),
            recordedBy: currentUser.name
        };
        
        transfers.push(transfer);
        await saveTransferToSheets(transfer);
        await updateTroopInventoryInSheets();
        await updateAllGirlsInSheets();
        
        // Clear form and update displays
        document.getElementById('transferFrom').value = '';
        document.getElementById('transferTo').value = '';
        document.getElementById('transferNotes').value = '';
        const transferInventoryInfo = document.getElementById('transferInventoryInfo');
        if (transferInventoryInfo) transferInventoryInfo.style.display = 'none';
        
        updateTransferTotals();
        updateTransferHistory();
        updateDashboard();
        updateGirlsList();
        updateTransferDropdowns();
        
        showMessage('transferMessages', `Transfer completed! ${totalBoxes} boxes moved from ${sourceName} to ${destName}`);
    } catch (error) {
        console.error('Transfer error:', error);
        showMessage('transferMessages', 'Error executing transfer: ' + error.message, true);
    } finally {
        hideLoading();
    }
}


function updateTransferHistory() {
    const container = document.getElementById('transferHistoryDisplay');
    if (!container || !currentUser || currentUser.role !== 'cookie-mom') return;

    if (!Array.isArray(transfers) || transfers.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No transfers recorded yet</p>';
        return;
    }

    const sorted = [...transfers].sort((a, b) => {
        const ad = new Date(a.recordedAt || a.date || a.transferDate);
        const bd = new Date(b.recordedAt || b.date || b.transferDate);
        return bd - ad;
    });

    container.innerHTML = `
        <div style="max-height: 400px; overflow-y: auto;">
            ${sorted.map(t => {
                const cookieDetails = Object.keys(t.cookies || {})
                    .map(k => `${k}: ${t.cookies[k]} boxes`)
                    .join(', ');
                const showDate = t.transferDate || t.date || '';
                const whoWhen = (t.recordedAt || '') + ((t.recordedBy) ? ` by ${t.recordedBy}` : '');
                const totalVal = (typeof t.totalValue === 'number') ? t.totalValue : 0;
                return `
                    <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div>
                                <strong>${t.from} → ${t.to}</strong><br>
                                <small>Date: ${showDate}</small><br>
                                <small>Cookies: ${cookieDetails}</small><br>
                                ${t.notes ? `<small>Notes: ${t.notes}</small><br>` : ''}
                                <small style="color: #666;">Recorded: ${whoWhen}</small>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold;">
                                    ${t.totalBoxes || 0} boxes
                                </div>
                                <small>${Number(totalVal).toFixed(2)}</small>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ===== BOOTH MANAGEMENT =====
function updateBoothManagement() {
    if (!currentUser || currentUser.role !== 'cookie-mom') return;
    
    const boothTab = document.getElementById('booths');
    if (!boothTab) return;
    
    boothTab.innerHTML = `
        <div class="section">
            <h2>Create New Booth</h2>
            <div id="boothMessages"></div>
            
            <div class="form-grid">
                <div class="form-group">
                    <label>Booth Name/Location:</label>
                    <input type="text" id="boothName" class="form-control" placeholder="Walmart - Main Street">
                </div>
                <div class="form-group">
                    <label>Date:</label>
                    <input type="date" id="boothDate" class="form-control">
                </div>
                <div class="form-group">
                    <label>Start Time:</label>
                    <input type="time" id="boothStartTime" class="form-control">
                </div>
                <div class="form-group">
                    <label>End Time:</label>
                    <input type="time" id="boothEndTime" class="form-control">
                </div>
            </div>
            
            <button class="btn" onclick="createBooth()">Schedule Booth</button>
        </div>
        
        <div class="section">
            <h2>Scheduled Booths</h2>
            <div id="boothListDisplay">
                <p style="color: #666; text-align: center; padding: 20px;">No booths scheduled</p>
            </div>
        </div>
    `;
    
    updateBoothDisplay();
}

async function createBooth() {
    if (currentUser.role !== 'cookie-mom') return;
    
    const name = document.getElementById('boothName').value.trim();
    const date = document.getElementById('boothDate').value;
    const startTime = document.getElementById('boothStartTime').value;
    const endTime = document.getElementById('boothEndTime').value;
    
    if (!name || !date || !startTime || !endTime) {
        showMessage('boothMessages', 'Please fill in all fields', true);
        return;
    }
    
    showLoading('Creating booth...');
    
    try {
        const booth = {
            id: Date.now(),
            name: name,
            date: date,
            startTime: startTime,
            endTime: endTime,
            status: 'scheduled',
            createdAt: new Date().toLocaleString(),
            createdBy: currentUser.name
        };
        
        booths.push(booth);
        
        // Save to Google Sheets
        await saveBoothToSheets(booth);
        
        // Clear form
        document.getElementById('boothName').value = '';
        document.getElementById('boothDate').value = '';
        document.getElementById('boothStartTime').value = '';
        document.getElementById('boothEndTime').value = '';
        
        updateBoothDisplay();
        showMessage('boothMessages', `Booth "${name}" scheduled for ${date} and saved to Google Sheets`);
        
    } catch (error) {
        console.error('Error creating booth:', error);
        showMessage('boothMessages', 'Error creating booth: ' + error.message, true);
    } finally {
        hideLoading();
    }
}


function updateBoothDisplay() {
    const container = document.getElementById('boothListDisplay');
    if (!container) return;
    
    const activeBooths = booths.filter(booth => booth.status === 'scheduled')
        .sort((a, b) => new Date(a.date + ' ' + a.startTime) - new Date(b.date + ' ' + b.startTime));
    
    if (activeBooths.length === 0) {
        container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No booths scheduled</p>';
        return;
    }
    
    container.innerHTML = activeBooths.map(booth => {
        const signupCount = boothSignups.filter(s => s.boothId == booth.id).length;
        
        return `
            <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>${booth.name}</strong>
                        <span style="background: #28a745; color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; margin-left: 10px;">✓ SAVED</span>
                        <br>
                        <small>${booth.date} | ${booth.startTime} - ${booth.endTime}</small><br>
                        <small>Signups: ${signupCount}</small><br>
                        <small>Created: ${booth.createdAt}</small>
                    </div>
                    <div>
                        <button class="btn" style="background: #007bff; padding: 5px 10px; font-size: 0.8rem; margin-right: 5px;" 
                                onclick="editBooth(${booth.id})">
                            Edit
                        </button>
                        <button class="btn" style="background: #dc3545; padding: 5px 10px; font-size: 0.8rem;" 
                                onclick="deleteBooth(${booth.id})">
                            Delete
                        </button>
                    </div>
                </div>
                
                ${signupCount > 0 ? `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px;">
                        <strong>Signups:</strong><br>
                        ${boothSignups.filter(s => s.boothId == booth.id)
                            .map(s => `• ${s.girlName} (${s.parentName})`)
                            .join('<br>')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function editBooth(boothId) {
    const booth = booths.find(b => b.id == boothId);
    if (!booth || currentUser.role !== 'cookie-mom') return;
    
    // Pre-fill form with booth data
    document.getElementById('boothName').value = booth.name;
    document.getElementById('boothDate').value = booth.date;
    document.getElementById('boothStartTime').value = booth.startTime;
    document.getElementById('boothEndTime').value = booth.endTime;
    
    // Change create button to update mode
    const createBtn = document.querySelector('button[onclick="createBooth()"]');
    if (createBtn) {
        createBtn.textContent = 'Update Booth';
        createBtn.onclick = () => updateBooth(boothId);
    }
    
    showMessage('boothMessages', `Editing "${booth.name}" - modify details above and click Update Booth`);
}

async function updateBooth(boothId) {
    if (currentUser.role !== 'cookie-mom') return;
    
    const name = document.getElementById('boothName').value.trim();
    const date = document.getElementById('boothDate').value;
    const startTime = document.getElementById('boothStartTime').value;
    const endTime = document.getElementById('boothEndTime').value;
    
    if (!name || !date || !startTime || !endTime) {
        showMessage('boothMessages', 'Please fill in all fields', true);
        return;
    }
    
    showLoading('Updating booth...');
    
    try {
        const booth = booths.find(b => b.id == boothId);
        if (!booth) {
            showMessage('boothMessages', 'Booth not found', true);
            return;
        }
        
        // Update booth data
        booth.name = name;
        booth.date = date;
        booth.startTime = startTime;
        booth.endTime = endTime;
        
        // Update in Google Sheets
        await updateAllBoothsInSheets();
        
        // Reset form and button
        document.getElementById('boothName').value = '';
        document.getElementById('boothDate').value = '';
        document.getElementById('boothStartTime').value = '';
        document.getElementById('boothEndTime').value = '';
        
        const updateBtn = document.querySelector('button[onclick^="updateBooth"]');
        if (updateBtn) {
            updateBtn.textContent = 'Schedule Booth';
            updateBtn.onclick = createBooth;
        }
        
        updateBoothDisplay();
        showMessage('boothMessages', `Booth "${name}" updated successfully`);
        
    } catch (error) {
        console.error('Error updating booth:', error);
        showMessage('boothMessages', 'Error updating booth: ' + error.message, true);
    } finally {
        hideLoading();
    }
}

async function deleteBooth(boothId) {
    if (currentUser.role !== 'cookie-mom') return;
    
    const booth = booths.find(b => b.id == boothId);
    if (!booth) return;
    
    if (confirm(`Are you sure you want to delete "${booth.name}"? This cannot be undone.`)) {
        showLoading('Deleting booth...');
        
        try {
            // Remove from local array
            booths = booths.filter(b => b.id != boothId);
            
            // Update Google Sheets by rewriting all booths
            await updateAllBoothsInSheets();
            
            updateBoothDisplay();
            showMessage('boothMessages', `Booth "${booth.name}" has been deleted`);
            
        } catch (error) {
            console.error('Error deleting booth:', error);
            showMessage('boothMessages', 'Error deleting booth: ' + error.message, true);
        } finally {
            hideLoading();
        }
    }
}

// ===== SAVE FUNCTIONS =====
async function saveGirlToSheets(girl) {
    try {
        const row = [
            girl.id,
            girl.girlName,
            girl.parentName,
            girl.parentEmail || '',
            girl.participationType,
            girl.contactInfo,
            girl.balance,
            girl.totalSold,
            ...Object.keys(cookieTypes).map(type => girl.inventory[type] || 0)
        ];
        await appendToSheet('Girls', row);
    } catch (error) {
        console.error('Error saving girl to sheets:', error);
    }
}

async function saveOrderToSheets(order) {
    try {
        const row = [
            order.id,
            order.type,
            order.orderDate,
            order.deliveryDate,
            order.pickupLocation,
            order.totalCases,
            order.totalBoxes,
            order.totalCost,
            order.status,
            order.timestamp,
            ...Object.keys(cookieTypes).map(type => order.cookies[type] || 0)
        ];
        await appendToSheet('Orders', row);
    } catch (error) {
        console.error('Error saving order to sheets:', error);
    }
}

async function saveParentRequestToSheets(order) {
    try {
        const row = [
            order.id,
            order.parentId,
            order.parentName,
            order.girlId,
            order.girlName || '',
            order.reason || '',
            order.totalBoxes || 0,
            order.totalValue || 0,
            order.status || 'pending',
            order.requestedAt || new Date().toLocaleString(),
            order.approvedBoxes || 0,
            order.approvedValue || 0,
            order.approvedAt || '',
            order.deliveredAt || '',
            order.notes || '',
            JSON.stringify(order.cookies || {}),
            JSON.stringify(order.approvedCookies || {})
        ];
        await appendToSheet('Parent_Requests', row);
    } catch (error) {
        console.error('Error saving parent request to sheets:', error);
    }
}

async function updateParentRequestInSheets(order) {
    try {
        const values = await readSheet('Parent_Requests');
        if (!values || values.length === 0) return;

        let looksLikeHeader = false;
        if (values[0] && (
            String(values[0][0]).toLowerCase() === 'id' ||
            String(values[0][2]).toLowerCase() === 'parentname'
        )) {
            looksLikeHeader = true;
        }
        const dataRows = looksLikeHeader ? values.slice(1) : values;
        const foundIndex = dataRows.findIndex(r => String(r[0]) === String(order.id));

        if (foundIndex === -1) {
            return saveParentRequestToSheets(order);
        }

        const rowNumber = (looksLikeHeader ? 2 : 1) + foundIndex;

        const updatedRow = [
            order.id,
            order.parentId,
            order.parentName,
            order.girlId,
            order.girlName || '',
            order.reason || '',
            order.totalBoxes || 0,
            order.totalValue || 0,
            order.status || '',
            order.requestedAt || '',
            order.approvedBoxes || 0,
            order.approvedValue || 0,
            order.approvedAt || '',
            order.deliveredAt || '',
            order.notes || '',
            JSON.stringify(order.cookies || {}),
            JSON.stringify(order.approvedCookies || {})
        ];

        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `Parent_Requests!A${rowNumber}:Q${rowNumber}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updatedRow] }
        });
    } catch (error) {
        console.error('Error updating parent request in sheets:', error);
    }
}

async function savePaymentToSheets(payment) {
    try {
        const row = [
            payment.id,
            payment.girlId,
            payment.girlName,
            payment.parentName,
            payment.paymentDate,
            payment.paymentMethod,
            payment.amount,
            payment.reference || '',
            payment.balanceBefore,
            payment.balanceAfter,
            payment.recordedAt,
            payment.recordedBy
        ];
        await appendToSheet('Payments', row);
    } catch (error) {
        console.error('Error saving payment to sheets:', error);
    }
}

async function saveTransferToSheets(transfer) {
    try {
        const row = [
            transfer.id,
            transfer.transferDate || transfer.date || new Date().toISOString().split('T')[0],
            transfer.from || '',
            transfer.to || '',
            transfer.totalBoxes || 0,
            JSON.stringify(transfer.cookies || {}),
            transfer.notes || '',
            transfer.recordedAt || new Date().toLocaleString(),
            transfer.recordedBy || (currentUser ? currentUser.name : '')
        ];
        
        await appendToSheet('Transfers', row);
    } catch (error) {
        console.error('Error saving transfer to sheets:', error);
    }
}

async function saveBoothToSheets(booth) {
    try {
        const row = [
            booth.id,
            booth.name,
            booth.type || '',
            booth.date,
            booth.startTime,
            booth.endTime,
            booth.startingCash || 0,
            booth.endingCash || 0,
            booth.digitalPayments || 0,
            booth.notes || '',
            booth.status || 'scheduled',
            booth.totalSales || 0,
            '', // Reserved for future use
            '', // Reserved for future use
            '', // Reserved for future use
            '', // Reserved for future use
            booth.createdAt || new Date().toLocaleString(),
            booth.createdBy || (currentUser ? currentUser.name : '')
        ];
        await appendToSheet('Booths', row);
    } catch (error) {
        console.error('Error saving booth to sheets:', error);
    }
}


async function saveBoothSignupToSheets(signup) {
    try {
        const row = [
            signup.id,
            signup.boothId,
            signup.girlId,
            signup.girlName || '',
            signup.parentName || '',
            signup.status || 'confirmed',
            signup.notes || '',
            signup.signedAt || '',
            JSON.stringify(signup.roles || ['general'])
        ];
        await appendToSheet('Booth_Signups', row);
    } catch (error) {
        console.error('Error saving booth signup to sheets:', error);
    }
}

async function updateAllBoothsInSheets() {
    try {
        const rows = booths.map(booth => [
            booth.id,
            booth.name,
            booth.type || '',
            booth.date,
            booth.startTime,
            booth.endTime,
            booth.startingCash || 0,
            booth.endingCash || 0,
            booth.digitalPayments || 0,
            booth.notes || '',
            booth.status || 'scheduled',
            booth.totalSales || 0,
            '', // Reserved
            '', // Reserved
            '', // Reserved
            '', // Reserved
            booth.createdAt || '',
            booth.createdBy || ''
        ]);

        // Clear existing data and update with current booths
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Booths!A2:R1000'
        });
        
        if (rows.length > 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: 'Booths!A2',
                valueInputOption: 'USER_ENTERED',
                resource: { values: rows }
            });
        }
    } catch (error) {
        console.error('Error updating all booths in sheets:', error);
    }
}


async function updateTroopInventoryInSheets() {
    try {
        const inventoryRows = Object.keys(cookieTypes).map(type => [type, troopInventory[type]]);
        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Troop_Inventory!A2:B9'
        });
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Troop_Inventory!A2:B9',
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: inventoryRows
            }
        });
    } catch (error) {
        console.error('Error updating troop inventory in sheets:', error);
    }
}

async function updateAllGirlsInSheets() {
    try {
        const rows = girls.map(girl => [
            girl.id,
            girl.girlName,
            girl.parentName,
            girl.parentEmail || '',
            girl.participationType || 'cookies-on-hand',
            girl.contactInfo || '',
            Number(girl.balance || 0),
            parseInt(girl.totalSold) || 0,
            ...Object.keys(cookieTypes).map(type => parseInt(girl.inventory[type]) || 0)
        ]);

        await gapi.client.sheets.spreadsheets.values.clear({
            spreadsheetId: SHEET_ID,
            range: 'Girls!A2:Z1000'
        });
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: 'Girls!A2',
            valueInputOption: 'USER_ENTERED',
            resource: { values: rows }
        });
    } catch (error) {
        console.error('Error updating all girls in sheets:', error);
    }
}

// ===== MOBILE MENU FUNCTIONALITY (FIXED) =====
var mobileMenuOpen = false; // Changed to var

// Our working mobile menu fix from HTML
function initializeMobileMenu() {
    console.log('🧪 Initializing fixed mobile menu');
    
    var overlay = document.getElementById('mobileNavOverlay');
    var mobileNav = document.getElementById('mobileNav');
    var hamburger = document.getElementById('mobileMenuToggle');
    
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        console.log('🧪 Fixed mobile nav overlay');
    }
    
    if (mobileNav) {
        mobileNav.classList.remove('active');
        mobileNav.style.overflowY = 'auto';
        mobileNav.style.webkitOverflowScrolling = 'touch';
        mobileNav.style.height = '100vh';
        mobileNav.style.maxHeight = '100vh';
        console.log('🧪 Fixed mobile nav menu with scrolling');
    }
    
    if (hamburger) {
        hamburger.classList.remove('active');
        
        hamburger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            var isOpen = mobileNav.classList.contains('active');
            
            if (isOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeMobileMenu();
        });
    }
}

function openMobileMenu() {
    var overlay = document.getElementById('mobileNavOverlay');
    var mobileNav = document.getElementById('mobileNav');
    var hamburger = document.getElementById('mobileMenuToggle');
    
    mobileNav.classList.add('active');
    hamburger.classList.add('active');
    mobileNav.style.overflowY = 'auto';
    mobileNav.style.webkitOverflowScrolling = 'touch';
    
    if (overlay) {
        overlay.style.display = 'block';
        overlay.style.pointerEvents = 'auto';
    }
    document.body.style.overflow = 'hidden';
    mobileMenuOpen = true;
    console.log('🧪 Mobile menu opened with scrolling');
}

function closeMobileMenu() {
    var overlay = document.getElementById('mobileNavOverlay');
    var mobileNav = document.getElementById('mobileNav');
    var hamburger = document.getElementById('mobileMenuToggle');
    
    if (mobileNav) mobileNav.classList.remove('active');
    if (hamburger) hamburger.classList.remove('active');
    if (overlay) {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
    }
    document.body.style.overflow = 'auto';
    console.log('Mobile menu closed');
}



// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    
    try {
        // Set today's date as default for date inputs
        const today = new Date().toISOString().split('T')[0];
        const saleDate = document.getElementById('saleDate');
        if (saleDate) {
            saleDate.value = today;
        }
        
        console.log('App initialized successfully - ready for login');
        
    } catch (error) {
        console.error('Initialization error:', error);
        alert('App initialization error: ' + error.message);
    }
});

console.log('JavaScript loaded successfully!');function closeApprovalModal() {
    const modal = document.getElementById('approvalModal');
    if (modal) {
        modal.remove();
    }
}



