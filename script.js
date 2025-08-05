// Supabase configuration with your actual credentials
const SUPABASE_URL = 'https://ocwdwgttgtfvugxgxxao.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jd2R3Z3R0Z3RmdnVneGd4eGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODg4NjMsImV4cCI6MjA2OTk2NDg2M30.PryMxAvzZ7Rr4WYgPmkVBO17iqbfaEPM3sasREXSACg';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Page management
const pages = {
    home: document.getElementById('homePage'),
    login: document.getElementById('loginPage'),
    signup: document.getElementById('signupPage'),
    dashboard: document.getElementById('dashboardPage')
};

// Navigation elements
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const logoutBtn = document.getElementById('logoutBtn');
const heroLoginBtn = document.getElementById('heroLoginBtn');

// Form elements
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const switchToSignup = document.getElementById('switchToSignup');
const switchToLogin = document.getElementById('switchToLogin');

// Upload elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const filesList = document.getElementById('filesList');
const uploadBtn = document.getElementById('uploadBtn');
const uploadedFilesDiv = document.getElementById('uploadedFiles');
const uploadedFilesList = document.getElementById('uploadedFilesList');
const browseLink = document.querySelector('.browse-link');

// User state
let currentUser = null;
let selectedFiles = [];
let uploadedFiles = [];

// Rate limiting state
let lastSignupAttempt = 0;
let lastLoginAttempt = 0;
const RATE_LIMIT_DELAY = 8000; // 8 seconds to be safe

// Upload configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
const BUCKET_NAME = 'uploads'; // Your Supabase bucket name

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 App initializing...');
    console.log('🔧 Supabase URL:', SUPABASE_URL);
    console.log('🔑 Supabase Key (first 20 chars):', SUPABASE_ANON_KEY.substring(0, 20) + '...');
    
    try {
        // Check if user is already logged in
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            console.log('✅ User already logged in:', session.user.email);
            currentUser = session.user;
            showDashboard();
            await loadUserFiles();
        } else {
            console.log('👤 No active session, showing home page');
            showPage('home');
        }
        
        // Initialize upload functionality
        initializeUpload();
        
        // Listen for auth changes
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('🔄 Auth state changed:', event, session?.user?.email);
            if (event === 'SIGNED_IN') {
                currentUser = session.user;
                showDashboard();
                loadUserFiles();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                showLoggedOutState();
            }
        });
        
    } catch (error) {
        console.error('❌ App initialization error:', error);
        showNotification('Failed to initialize app: ' + error.message, 'error');
    }
});

// Rate limiting helper
function canMakeRequest(type) {
    const now = Date.now();
    const lastAttempt = type === 'signup' ? lastSignupAttempt : lastLoginAttempt;
    const timeSinceLastAttempt = now - lastAttempt;
    
    if (timeSinceLastAttempt < RATE_LIMIT_DELAY) {
        const remainingTime = Math.ceil((RATE_LIMIT_DELAY - timeSinceLastAttempt) / 1000);
        showNotification(`Please wait ${remainingTime} more seconds before trying again.`, 'error');
        return false;
    }
    
    if (type === 'signup') {
        lastSignupAttempt = now;
    } else {
        lastLoginAttempt = now;
    }
    
    return true;
}

// Initialize upload functionality
function initializeUpload() {
    if (!uploadArea || !fileInput) return;
    
    uploadArea.addEventListener('click', () => fileInput.click());
    if (browseLink) {
        browseLink.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }

    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    if (uploadBtn) {
        uploadBtn.addEventListener('click', performSupabaseUpload);
    }
}

// Handle file selection
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFilesToSelection(files);
}

// Handle drag over
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('dragover');
}

// Handle drag leave
function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
}

// Handle file drop
function handleFileDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = Array.from(e.dataTransfer.files);
    addFilesToSelection(files);
}

// Add files to selection
function addFilesToSelection(files) {
    const validFiles = files.filter(file => {
        if (file.size > MAX_FILE_SIZE) {
            showNotification(`File "${file.name}" is too large. Maximum size is 50MB.`, 'error');
            return false;
        }
        return true;
    });

    selectedFiles = [...selectedFiles, ...validFiles];
    displaySelectedFiles();
    
    if (validFiles.length > 0) {
        showNotification(`${validFiles.length} file(s) selected for upload.`, 'success');
    }
}

// Display selected files
function displaySelectedFiles() {
    if (!selectedFilesDiv || !filesList) return;
    
    if (selectedFiles.length === 0) {
        selectedFilesDiv.classList.add('hidden');
        return;
    }

    selectedFilesDiv.classList.remove('hidden');
    filesList.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileItem = createFileItem(file, index, true);
        filesList.appendChild(fileItem);
    });
}

// Create file item element
function createFileItem(file, index, isSelected = false) {
    const fileItem = document.createElement('div');
    fileItem.className = isSelected ? 'file-item' : 'file-item uploaded-file-item';
    
    const fileIcon = getFileIcon(file.name);
    const fileSize = formatFileSize(file.size || file.metadata?.size);
    const uploadDate = isSelected ? '' : new Date(file.created_at || file.uploadDate).toLocaleDateString();
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-icon">${fileIcon}</div>
            <div class="file-details">
                <h5>${file.name}</h5>
                <span>${fileSize}${uploadDate ? ` • Uploaded: ${uploadDate}` : ''}</span>
            </div>
        </div>
        <div class="file-actions">
            ${isSelected ? 
                `<button class="remove-file" onclick="removeSelectedFile(${index})">Remove</button>` :
                `<button class="download-btn" onclick="downloadSupabaseFile('${file.name}')">Download</button>`
            }
        </div>
    `;
    
    return fileItem;
}

// Upload files to Supabase
async function performSupabaseUpload() {
    if (!currentUser) {
        showNotification('Please login first to upload files!', 'error');
        showPage('login');
        return;
    }
    
    if (selectedFiles.length === 0) {
        showNotification('Please select files to upload first.', 'error');
        return;
    }
    
    if (!uploadBtn) return;
    
    showNotification('Starting upload to Supabase...', 'info');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of selectedFiles) {
        try {
            // Create unique filename with timestamp
            const timestamp = Date.now();
            const fileName = `${currentUser.id}/${timestamp}_${file.name}`;
            
            // Upload file to Supabase Storage
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error('Upload error:', error);
                errorCount++;
                showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
            } else {
                successCount++;
                showNotification(`✅ Uploaded: ${file.name}`, 'success');
            }
        } catch (error) {
            console.error('Upload error:', error);
            errorCount++;
            showNotification(`Failed to upload ${file.name}`, 'error');
        }
        
        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Reset UI
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload to Supabase';
    selectedFiles = [];
    fileInput.value = '';
    displaySelectedFiles();
    
    // Reload user files
    await loadUserFiles();
    
    // Final notification
    if (successCount > 0) {
        showNotification(`Successfully uploaded ${successCount} file(s) to Supabase!`, 'success');
    }
    if (errorCount > 0) {
        showNotification(`Failed to upload ${errorCount} file(s). Check console for details.`, 'error');
    }
}

// Load user's uploaded files from Supabase
async function loadUserFiles() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list(currentUser.id, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) {
            console.error('Error loading files:', error);
            showNotification('Failed to load your files', 'error');
            return;
        }

        uploadedFiles = data || [];
        displayUploadedFiles();
        
        // Update file count in dashboard
        const fileCountElement = document.getElementById('fileCount');
        if (fileCountElement) {
            fileCountElement.textContent = `You have ${uploadedFiles.length} file(s) stored`;
        }
        
    } catch (error) {
        console.error('Error loading files:', error);
        showNotification('Failed to load your files', 'error');
    }
}

// Display uploaded files
function displayUploadedFiles() {
    if (!uploadedFilesList) return;
    
    if (uploadedFiles.length === 0) {
        uploadedFilesList.innerHTML = '<p style="color: #666; text-align: center; padding: 1rem;">No files uploaded yet. Upload your first file above!</p>';
        return;
    }
    
    uploadedFilesList.innerHTML = '';
    
    uploadedFiles.forEach((file, index) => {
        if (file.name && file.name !== '.emptyFolderPlaceholder') {
            const fileItem = createFileItem(file, index, false);
            uploadedFilesList.appendChild(fileItem);
        }
    });
}

// Download file from Supabase
async function downloadSupabaseFile(fileName) {
    if (!currentUser) return;
    
    try {
        const filePath = `${currentUser.id}/${fileName}`;
        
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(filePath);

        if (error) {
            console.error('Download error:', error);
            showNotification(`Failed to download ${fileName}`, 'error');
            return;
        }

        // Create download link
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.split('_').slice(1).join('_'); // Remove timestamp prefix
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification(`Downloaded: ${fileName}`, 'success');
        
    } catch (error) {
        console.error('Download error:', error);
        showNotification(`Failed to download ${fileName}`, 'error');
    }
}

// Remove selected file
function removeSelectedFile(index) {
    selectedFiles.splice(index, 1);
    displaySelectedFiles();
    showNotification('File removed from selection.', 'info');
}

// Get file icon based on file extension
function getFileIcon(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    
    const iconMap = {
        'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️',
        'mp4': '🎥', 'avi': '🎥', 'mov': '🎥',
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵',
        'zip': '📦', 'rar': '📦', '7z': '📦',
        'html': '💻', 'css': '🎨', 'js': '⚡',
        'xls': '📊', 'xlsx': '📊', 'csv': '📊'
    };
    
    return iconMap[extension] || '📄';
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Page navigation functions
function showPage(pageName) {
    Object.values(pages).forEach(page => {
        if (page) page.classList.remove('active');
    });
    
    if (pages[pageName]) {
        pages[pageName].classList.add('active');
    }
}

function showDashboard() {
    showPage('dashboard');
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    
    if (userNameDisplay) {
        userNameDisplay.textContent = `Welcome, ${currentUser.email}!`;
    }
    if (userEmailDisplay) {
        userEmailDisplay.textContent = currentUser.email;
    }
    
    if (loginBtn) loginBtn.classList.add('hidden');
    if (signupBtn) signupBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
}

function showLoggedOutState() {
    showPage('home');
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (welcomeMessage) {
        welcomeMessage.textContent = 'Please login or sign up to get started';
    }
    
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (signupBtn) signupBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    
    uploadedFiles = [];
    displayUploadedFiles();
}

// Event listeners for navigation
if (loginBtn) loginBtn.addEventListener('click', () => showPage('login'));
if (signupBtn) signupBtn.addEventListener('click', () => showPage('signup'));
if (heroLoginBtn) heroLoginBtn.addEventListener('click', () => showPage('login'));
if (switchToSignup) switchToSignup.addEventListener('click', () => showPage('signup'));
if (switchToLogin) switchToLogin.addEventListener('click', () => showPage('login'));
if (logoutBtn) logoutBtn.addEventListener('click', logout);

// Form submissions
if (loginForm) loginForm.addEventListener('submit', handleLogin);
if (signupForm) signupForm.addEventListener('submit', handleSignup);

// Login handler with Supabase and rate limiting
async function handleLogin(e) {
    e.preventDefault();
    
    if (!canMakeRequest('login')) {
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    console.log('🔍 Login attempt:', { email, hasPassword: !!password });
    
    try {
        showNotification('Signing in...', 'info');
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        console.log('🔍 Login response:', { data, error });

        if (error) {
            console.error('❌ Login error:', error);
            
            // Specific error messages
            if (error.message === 'Invalid login credentials') {
                showNotification('Invalid email or password. Please check your credentials.', 'error');
            } else if (error.message.includes('Email not confirmed')) {
                showNotification('Please check your email and confirm your account first.', 'error');
            } else if (error.message.includes('security purposes')) {
                showNotification('Rate limited. Please wait a moment before trying again.', 'error');
            } else {
                showNotification('Login failed: ' + error.message, 'error');
            }
        } else if (data.user) {
            console.log('✅ Login successful:', data.user.email);
            showNotification('Login successful!', 'success');
            if (loginForm) loginForm.reset();
        } else {
            console.log('⚠️ No user returned');
            showNotification('Login failed - no user data returned', 'error');
        }
    } catch (error) {
        console.error('❌ Login exception:', error);
        showNotification('Login failed: Network or configuration error', 'error');
    }
}

// Signup handler with Supabase and rate limiting
async function handleSignup(e) {
    e.preventDefault();
    
    if (!canMakeRequest('signup')) {
        return;
    }
    
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showNotification('Passwords do not match!', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long!', 'error');
        return;
    }
    
    console.log('🔍 Signup attempt:', { email, hasPassword: !!password });
    
    try {
        showNotification('Creating account...', 'info');
        
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        console.log('🔍 Signup response:', { data, error });

        if (error) {
            console.error('❌ Signup error:', error);
            
            if (error.message.includes('security purposes')) {
                showNotification('Rate limited. Please wait 8 seconds before trying again.', 'error');
            } else if (error.message.includes('already registered')) {
                showNotification('This email is already registered. Try logging in instead.', 'error');
            } else {
                showNotification('Signup failed: ' + error.message, 'error');
            }
        } else {
            console.log('✅ Signup successful:', data);
            showNotification('Account created successfully! You can now login.', 'success');
            if (signupForm) signupForm.reset();
            showPage('login');
        }
    } catch (error) {
        console.error('❌ Signup exception:', error);
        if (error.message.includes('JSON')) {
            showNotification('❌ Configuration error: Invalid Supabase credentials.', 'error');
        } else {
            showNotification('Signup failed: ' + error.message, 'error');
        }
    }
}

// Logout handler
async function logout() {
    try {
        showNotification('Signing out...', 'info');
        const { error } = await supabase.auth.signOut();
        if (error) {
            showNotification('Logout failed: ' + error.message, 'error');
        } else {
            showNotification('Logged out successfully!', 'success');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showNotification('Logout failed. Please try again.', 'error');
    }
}

// Notification system
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 1rem 2rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 1001;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = '#4CAF50';
            break;
        case 'error':
            notification.style.background = '#f44336';
            break;
        default:
            notification.style.background = '#2196F3';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}

// Test function for development
async function testSupabaseConnection() {
    console.log('🧪 Testing Supabase connection...');
    console.log('URL:', SUPABASE_URL);
    console.log('Key (first 20 chars):', SUPABASE_ANON_KEY.substring(0, 20) + '...');
    
    try {
        const { data, error } = await supabase.auth.getSession();
        console.log('✅ Supabase connection successful:', { data, error });
        showNotification('✅ Supabase connection working!', 'success');
        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error);
        showNotification('❌ Supabase connection failed: ' + error.message, 'error');
        return false;
    }
}

// Make test function available globally for debugging
window.testSupabaseConnection = testSupabaseConnection;

console.log('✅ Script loaded successfully');
