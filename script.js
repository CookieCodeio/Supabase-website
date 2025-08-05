// Supabase configuration
const SUPABASE_URL = 'https://ocwdwgttgtfvugxgxxao.supabase.co';  // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jd2R3Z3R0Z3RmdnVneGd4eGFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzODg4NjMsImV4cCI6MjA2OTk2NDg2M30.PryMxAvzZ7Rr4WYgPmkVBO17iqbfaEPM3sasREXSACg';  // Replace with your anon key

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

// Upload configuration
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
const BUCKET_NAME = 'uploads'; // Your Supabase bucket name

// Initialize app
document.addEventListener('DOMContentLoaded', async function() {
    // Check if user is already logged in
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        showDashboard();
        await loadUserFiles();
    } else {
        showPage('home');
    }
    
    // Initialize upload functionality
    initializeUpload();
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            showDashboard();
            loadUserFiles();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showLoggedOutState();
        }
    });
});

// Initialize upload functionality
function initializeUpload() {
    uploadArea.addEventListener('click', () => fileInput.click());
    browseLink.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    uploadBtn.addEventListener('click', performSupabaseUpload);
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
        page.classList.remove('active');
    });
    
    if (pages[pageName]) {
        pages[pageName].classList.add('active');
    }
}

function showDashboard() {
    showPage('dashboard');
    document.getElementById('userNameDisplay').textContent = `Welcome, ${currentUser.email}!`;
    const emailDisplay = document.getElementById('userEmailDisplay');
    if (emailDisplay) {
        emailDisplay.textContent = currentUser.email;
    }
    
    loginBtn.classList.add('hidden');
    signupBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
}

function showLoggedOutState() {
    showPage('home');
    document.getElementById('welcomeMessage').textContent = 'Please login or sign up to get started';
    
    loginBtn.classList.remove('hidden');
    signupBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    
    uploadedFiles = [];
    displayUploadedFiles();
}

// Event listeners for navigation
loginBtn.addEventListener('click', () => showPage('login'));
signupBtn.addEventListener('click', () => showPage('signup'));
heroLoginBtn.addEventListener('click', () => showPage('login'));
switchToSignup.addEventListener('click', () => showPage('signup'));
switchToLogin.addEventListener('click', () => showPage('login'));
logoutBtn.addEventListener('click', logout);

// Form submissions
loginForm.addEventListener('submit', handleLogin);
signupForm.addEventListener('submit', handleSignup);

// Login handler with Supabase
// Replace your login handler with this debug version
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    console.log('🔍 Login attempt:', { email, password: password ? '***' : 'empty' });
    console.log('🔍 Supabase config:', { url: SUPABASE_URL, hasKey: !!SUPABASE_ANON_KEY });
    
    try {
        showNotification('Attempting login...', 'info');
        
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
            } else {
                showNotification('Login failed: ' + error.message, 'error');
            }
        } else if (data.user) {
            console.log('✅ Login successful:', data.user);
            showNotification('Login successful!', 'success');
            loginForm.reset();
        } else {
            console.log('⚠️ No user returned');
            showNotification('Login failed - no user data returned', 'error');
        }
    } catch (error) {
        console.error('❌ Login exception:', error);
        showNotification('Login failed: Network or configuration error', 'error');
    }
}


// Signup handler with Supabase
async function handleSignup(e) {
    e.preventDefault();
    
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
    
    try {
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            showNotification('Signup failed: ' + error.message, 'error');
        } else {
            showNotification('Account created! Please check your email to verify your account.', 'success');
            signupForm.reset();
            showPage('login');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showNotification('Signup failed. Please try again.', 'error');
    }
}

// Logout handler
async function logout() {
    try {
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
    }, 3000);
}
