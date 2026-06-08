
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, update, push, child, onValue, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ==========================================
// PART 1: GLOBAL STATE & UI HELPER FUNCTIONS
// ==========================================

const GITHUB_BASE_URL = "https://raw.githubusercontent.com/freeearningsonline/Ai-Prompt-/main/images/";
const IMGBB_API_KEY = "54345d70fbd11c8a3ccd7e180c3281e2";

// Smart Media Detection & Local Video Folder Integration
function resolveMediaSrc(mediaVal) {
    if (!mediaVal) {
        return "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe"; 
    }
    // Check if it's a video file
    if (mediaVal.match(/\.(mp4|webm|ogg)$/i)) {
        if (mediaVal.startsWith("http://") || mediaVal.startsWith("https://") || mediaVal.startsWith("data:")) {
            return mediaVal;
        }
        // Load locally from /videos/ folder
        if (mediaVal.startsWith("/videos/")) {
            return mediaVal;
        }
        return "/videos/" + mediaVal;
    }
    // Handle standard images
    if (mediaVal.startsWith("http://") || mediaVal.startsWith("https://") || mediaVal.startsWith("data:")) {
        return mediaVal;
    }
    return GITHUB_BASE_URL + mediaVal;
}
window.resolveImageSrc = resolveMediaSrc;

// Text Highlighter for Advanced Search
function highlightText(text, search) {
    if (!search || !text) return text;
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeSearch})`, 'gi');
    return text.replace(regex, `<mark class="bg-brand-500/20 text-brand-500 rounded px-0.5">$1</mark>`);
}
window.highlightText = highlightText;

function updatePageMetadata(titleSuffix, descriptionSuffix, keywordsSuffix) {
    document.title = titleSuffix ? `PromptKaro - ${titleSuffix}` : "PromptKaro - AI Prompt Sharing Platform";
    
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        metaDesc.setAttribute('content', descriptionSuffix || "Explore, copy, and share free trending AI prompts for Midjourney, Stable Diffusion, ChatGPT.");
    }
    
    const metaKey = document.querySelector('meta[name="keywords"]');
    if (metaKey) {
        metaKey.setAttribute('content', keywordsSuffix || "AI Prompts, Midjourney Prompts, ChatGPT Prompts, Bing 3D Name Art, Stable Diffusion, Free AI Prompts, Copy Paste Prompts, PromptKaro");
    }

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', window.location.href);
}
window.updatePageMetadata = updatePageMetadata;

function clearUrlParameters() {
    window.history.pushState({}, document.title, window.location.pathname);
}
window.clearUrlParameters = clearUrlParameters;

window.appState = {
    currentUser: null,
    currentUserData: null,
    promptsList: [],
    userPromptsList: [], // For Community Prompts
    blogsList: [], 
    categories: [], 
    blogCategories: [],
    chatMessages: [],
    ads: { top: '', center: '', multiplex: '', bottom: '' }, 
    currentFilter: 'All',
    currentBlogFilter: 'All',
    isLoginMode: true,
    currentDetailPrompt: null,
    currentPage: 1,
    currentUserPage: 1, // For Community Prompts Pagination
    currentBlogPage: 1,
    viewMode: 'home', 
    navigationStack: [] 
};

const systemTheme = localStorage.getItem('theme') || 'dark';
if (systemTheme === 'dark') {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcons();
}
window.toggleTheme = toggleTheme;

function updateThemeIcons() {
    const isDark = document.documentElement.classList.contains('dark');
    const deskIcon = document.getElementById('themeIcon');
    const mobIcon = document.getElementById('mobileThemeIcon');
    if (deskIcon && mobIcon) {
        if (isDark) {
            deskIcon.className = "fa-solid fa-sun text-amber-400";
            mobIcon.className = "fa-solid fa-sun text-amber-400";
        } else {
            deskIcon.className = "fa-solid fa-moon text-slate-500";
            mobIcon.className = "fa-solid fa-moon text-slate-500";
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateThemeIcons();

    // ADVANCED SEARCH: Real-time search listeners
    const dSearch = document.getElementById('desktopSearch');
    const mSearch = document.getElementById('mobileSearch');
    if (dSearch) dSearch.addEventListener('input', window.handleSearch);
    if (mSearch) mSearch.addEventListener('input', window.handleSearch);

    // Dynamic file name display for user upload
    const uImageFile = document.getElementById('uImageFile');
    const uImageFileName = document.getElementById('uImageFileName');
    if (uImageFile && uImageFileName) {
        uImageFile.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                uImageFileName.innerText = e.target.files[0].name;
                uImageFileName.classList.add('text-purple-500');
            } else {
                uImageFileName.innerText = "Click to select an image...";
                uImageFileName.classList.remove('text-purple-500');
            }
        });
    }

    window.history.pushState({ type: 'tab', value: 'home' }, "");
    
    if (!localStorage.getItem('cookieAccepted')) {
        const banner = document.getElementById('cookieBanner');
        if (banner) banner.classList.remove('hidden');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const sharedPromptId = urlParams.get('prompt');
    const sharedBlogId = urlParams.get('blog');

    // Deep Linking logic for Both Admin and User Prompts
    if (sharedPromptId) {
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            const adminPrompt = window.appState.promptsList.find(p => p.id === sharedPromptId);
            const userPrompt = window.appState.userPromptsList.find(p => p.id === sharedPromptId);

            if (adminPrompt) {
                clearInterval(checkInterval);
                if (typeof window.openPromptDetail === 'function') {
                    window.openPromptDetail(sharedPromptId);
                }
            } else if (userPrompt) {
                clearInterval(checkInterval);
                if (typeof window.openUserPromptDetail === 'function') {
                    window.openUserPromptDetail(sharedPromptId);
                }
            }
            
            // Stop checking after 10 seconds to prevent infinite loop
            if (attempts > 20) {
                clearInterval(checkInterval);
            }
        }, 500);
    }

    if (sharedBlogId) {
        const checkInterval = setInterval(() => {
            if (window.appState.blogsList && window.appState.blogsList.length > 0) {
                clearInterval(checkInterval);
                if (typeof window.openBlogDetail === 'function') {
                    window.openBlogDetail(sharedBlogId);
                }
            }
        }, 500);
    }
});

function acceptCookies() {
    localStorage.setItem('cookieAccepted', 'true');
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.classList.add('hidden');
}
window.acceptCookies = acceptCookies;

window.addEventListener('popstate', (event) => {
    handleBackAction();
});

document.addEventListener("backbutton", (e) => {
    e.preventDefault();
    handleBackAction();
}, false);

function handleBackAction() {
    if (window.appState.navigationStack.length > 0) {
        const prev = window.appState.navigationStack.pop();
        if (prev.type === 'tab') {
            window.switchTab(prev.value, true);
        } else if (prev.type === 'modal') {
            window.closeModal(prev.value, true);
        }
    } else {
        if (navigator.app && typeof navigator.app.exitApp === 'function') {
            navigator.app.exitApp();
        } else {
            window.history.go(-1);
        }
    }
}
window.handleBackAction = handleBackAction;

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('translate-x-full');
}
window.toggleMobileMenu = toggleMobileMenu;

// UPDATED: Main Tab Switcher (Hides Home Data on Other Pages)
function switchTab(tabId, isBack = false) {
    if (!isBack && window.appState.viewMode !== tabId) {
        window.appState.navigationStack.push({ type: 'tab', value: window.appState.viewMode });
        window.history.pushState({ type: 'tab', value: tabId }, "");
    }

    // Hide all major sections first
    const sections = [
        'homeExclusiveContent', // The new wrapper container
        'categoryFiltersContainer',
        'promptsSection', 
        'userPromptsDisplaySection', 
        'adminView', 
        'walletSection', 
        'blogSection', 
        'userUploadSection'
    ];
    
    sections.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    window.appState.viewMode = tabId; 

    // Show specific sections based on requested tab
    if (tabId === 'home') {
        ['homeExclusiveContent', 'categoryFiltersContainer', 'promptsSection', 'userPromptsDisplaySection'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.remove('hidden');
        });
        window.appState.currentPage = 1;
        window.appState.currentUserPage = 1;
        if (typeof window.filterCategory === 'function') window.filterCategory('All');
        updatePageMetadata("Free AI Prompt Library", "Explore, copy, and share free trending AI prompts.");
    } 
    else if (tabId === 'discover') {
        // Discover strictly shows ONLY prompts and filters (hides banners/stats)
        ['categoryFiltersContainer', 'promptsSection', 'userPromptsDisplaySection'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.remove('hidden');
        });
        window.appState.currentPage = 1;
        window.appState.currentUserPage = 1;
        if (typeof window.filterCategory === 'function') window.filterCategory('All');
        updatePageMetadata("Discover Hot Trends", "Discover best AI Prompts.");
    } 
    else if (tabId === 'blog') {
        const el = document.getElementById('blogSection');
        if(el) el.classList.remove('hidden');
        window.appState.currentBlogPage = 1;
        if (typeof window.renderBlogs === 'function') window.renderBlogs();
        updatePageMetadata("AI Blogs & Guides", "Read high-quality articles, tutorials, and guidelines about AI image generation on PromptKaro.");
    } 
    else if (tabId === 'admin') {
        const el = document.getElementById('adminView');
        if(el) el.classList.remove('hidden');
        updatePageMetadata("Admin Panel");
        if (typeof window.fetchGitHubImages === 'function') window.fetchGitHubImages();
    } 
    else if (tabId === 'wallet') {
        const el = document.getElementById('walletSection');
        if(el) el.classList.remove('hidden');
        updatePageMetadata("Coin Wallet", "Buy coins and unlock premium AI prompts on PromptKaro platform.");
    } 
    else if (tabId === 'userUpload') {
        const el = document.getElementById('userUploadSection');
        if(el) el.classList.remove('hidden');
        updatePageMetadata("Upload Prompt", "Upload your prompt and monetize with Adsterra.");
    }
}
window.switchTab = switchTab;

// UPDATED: Search hides Home banners automatically
window.handleSearch = function() {
    const searchVal = (document.getElementById('desktopSearch')?.value || document.getElementById('mobileSearch')?.value || '').toLowerCase();
    
    if (window.appState.viewMode === 'blog') {
        window.appState.currentBlogPage = 1;
        if(typeof window.renderBlogs === 'function') window.renderBlogs();
    } else {
        window.appState.currentPage = 1;
        window.appState.currentUserPage = 1;
        
        const homeExclusive = document.getElementById('homeExclusiveContent');
        
        if (searchVal) {
            // Hide banners if searching
            if (homeExclusive) homeExclusive.classList.add('hidden');
        } else {
            // Restore banners if clearing search (only if on Home Tab)
            if (window.appState.viewMode === 'home' && homeExclusive) {
                homeExclusive.classList.remove('hidden');
            }
        }
        
        if(typeof window.renderPrompts === 'function') window.renderPrompts();
        if(typeof window.renderUserPrompts === 'function') window.renderUserPrompts();
    }
}

function openModal(id) {
    window.appState.navigationStack.push({ type: 'modal', value: id });
    window.history.pushState({ type: 'modal', value: id }, "");
    document.getElementById(id).classList.remove('hidden');
}
window.openModal = openModal;

function closeModal(id, isBack = false) {
    document.getElementById(id).classList.add('hidden');
    if (!isBack) {
        window.appState.navigationStack = window.appState.navigationStack.filter(item => !(item.type === 'modal' && item.value === id));
    }
}
window.closeModal = closeModal;

function injectHtmlWithScripts(containerId, htmlContent) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = htmlContent || '';
    const scripts = container.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        if (oldScript.innerHTML) {
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}
window.injectHtmlWithScripts = injectHtmlWithScripts;

function toggleAdminTab(tab) {
    const addTab = document.getElementById('adminAddPromptTab');
    const blogTab = document.getElementById('adminBlogsTab');
    const catTab = document.getElementById('adminCategoriesTab');
    const payTab = document.getElementById('adminPaymentsTab');
    const aiTab = document.getElementById('adminAiConfigTab');
    const adsTab = document.getElementById('adminAdsTab'); 
    const commTab = document.getElementById('adminCommunityTab');

    addTab.classList.add('hidden');
    blogTab.classList.add('hidden');
    catTab.classList.add('hidden');
    payTab.classList.add('hidden');
    aiTab.classList.add('hidden');
    if(adsTab) adsTab.classList.add('hidden');
    if(commTab) commTab.classList.add('hidden');

    if (tab === 'addPrompt') {
        addTab.classList.remove('hidden');
    } else if (tab === 'blogs') {
        blogTab.classList.remove('hidden');
        if (typeof window.renderAdminBlogsList === 'function') {
            window.renderAdminBlogsList();
        }
    } else if (tab === 'categories') {
        catTab.classList.remove('hidden');
    } else if (tab === 'aiConfig') {
        aiTab.classList.remove('hidden');
    } else if (tab === 'adsConfig') {
        if(adsTab) adsTab.classList.remove('hidden');
    } else if (tab === 'community') {
        if(commTab) commTab.classList.remove('hidden');
    } else {
        payTab.classList.remove('hidden');
    }
}
window.toggleAdminTab = toggleAdminTab;

function switchHistoryTab(type) {
    const btnCred = document.getElementById('tabCredits');
    const btnDeb = document.getElementById('tabDebits');
    const tblCred = document.getElementById('tableCredits');
    const tblDeb = document.getElementById('tableDebits');

    if (type === 'credits') {
        btnCred.className = "px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold transition";
        btnDeb.className = "px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-955 text-slate-500 dark:text-slate-400 text-xs font-bold transition hover:bg-slate-200 dark:hover:bg-slate-900";
        tblCred.classList.remove('hidden');
        tblDeb.classList.add('hidden');
    } else {
        btnCred.className = "px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-955 text-slate-500 dark:text-slate-400 text-xs font-bold transition hover:bg-slate-200 dark:hover:bg-slate-900";
        btnDeb.className = "px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold transition";
        tblCred.classList.add('hidden');
        tblDeb.classList.remove('hidden');
    }
}
window.switchHistoryTab = switchHistoryTab;

function toggleAiPanel() {
    const panel = document.getElementById('aiPanel');
    panel.classList.toggle('hidden');
}
window.toggleAiPanel = toggleAiPanel;

function openRequestModal() {
    window.openModal('requestPromptModal');
}
window.openRequestModal = openRequestModal;

function closeRequestModal() {
    window.closeModal('requestPromptModal');
}
window.closeRequestModal = closeRequestModal;

function openAuthModal(mode) {
    window.appState.isLoginMode = mode === 'login';
    document.getElementById('authTitle').innerText = window.appState.isLoginMode ? "Login" : "Sign Up / Register";
    document.getElementById('authSubmitBtn').innerText = window.appState.isLoginMode ? "Login" : "Register";
    document.getElementById('authToggleText').innerText = window.appState.isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.getElementById('authToggleBtn').innerText = window.appState.isLoginMode ? "Register" : "Login";
    window.openModal('authModal');
}
window.openAuthModal = openAuthModal;

function closeAuthModal() {
    window.closeModal('authModal');
}
window.closeAuthModal = closeAuthModal;

function toggleAuthMode() {
    window.openAuthModal(window.appState.isLoginMode ? 'signup' : 'login');
}
window.toggleAuthMode = toggleAuthMode;

// Close and clean up Prompt Modal
function closePromptDetailModal() {
    window.closeModal('promptDetailModal');
    document.getElementById('aiOutputContainer').classList.add('hidden');
    document.getElementById('aiPanel').classList.add('hidden');
    
    // Stop modal video playback
    const videoEl = document.getElementById('detailVideoEl');
    const thumbOverlay = document.getElementById('detailThumbOverlay');
    
    if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src'); 
        videoEl.load();
    }
    if (thumbOverlay) {
        thumbOverlay.classList.remove('hidden');
    }
    
    // Clear user ads inside modal when closed
    const modalUserAdTop = document.getElementById('modalUserAdTop');
    const modalUserAdBottom = document.getElementById('modalUserAdBottom');
    if(modalUserAdTop) { modalUserAdTop.innerHTML = ''; modalUserAdTop.classList.add('hidden'); }
    if(modalUserAdBottom) { modalUserAdBottom.innerHTML = ''; modalUserAdBottom.classList.add('hidden'); }

    updatePageMetadata(); 
    clearUrlParameters(); 
}
window.closePromptDetailModal = closePromptDetailModal;

function calculateExchange() {
    const pkr = parseFloat(document.getElementById('pkrAmount').value) || 0;
    document.getElementById('coinsResult').innerText = (pkr * 10000).toLocaleString();
}
window.calculateExchange = calculateExchange;

function togglePriceField() {
    const type = document.getElementById('pType').value;
    if (type === 'paid') {
        document.getElementById('priceFieldContainer').classList.remove('hidden');
    } else {
        document.getElementById('priceFieldContainer').classList.add('hidden');
    }
}
window.togglePriceField = togglePriceField;

function resetForm() {
    document.getElementById('promptForm').reset();
    document.getElementById('editPromptId').value = '';
    document.getElementById('priceFieldContainer').classList.add('hidden');
}
window.resetForm = resetForm;

function resetBlogForm() {
    document.getElementById('blogForm').reset();
    document.getElementById('editBlogId').value = '';
}
window.resetBlogForm = resetBlogForm;

function safeCopy(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
            .then(() => alert("Copied to clipboard!"))
            .catch(err => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}
window.safeCopy = safeCopy;

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert("Copied to clipboard!");
        } else {
            alert("Unable to copy.");
        }
    } catch (err) {
        alert("Unable to copy.");
    }
    document.body.removeChild(textArea);
}

function sharePrompt() {
    if (!window.appState.currentDetailPrompt) return;
    const pId = window.appState.currentDetailPrompt.id;
    const pTitle = window.appState.currentDetailPrompt.title;
    
    const shareLink = `${window.location.origin}/?prompt=${pId}`;

    if (navigator.share) {
        navigator.share({
            title: `PromptKaro - ${pTitle}`,
            text: `Check out this amazing AI prompt: "${pTitle}" on PromptKaro!`,
            url: shareLink
        }).catch(err => console.log(err));
    } else {
        window.safeCopy(shareLink);
        alert("Deep Link copied to clipboard!");
    }
}
window.sharePrompt = sharePrompt;

function shareBlog() {
    const openedTitle = document.getElementById('blogDetailTitle').innerText;
    const currentBlog = window.appState.blogsList.find(b => b.title === openedTitle);
    if (!currentBlog) return;
    
    const shareLink = `${window.location.origin}/?blog=${currentBlog.id}`;

    if (navigator.share) {
        navigator.share({
            title: `PromptKaro Blog - ${currentBlog.title}`,
            text: `Read this helpful AI guide: "${currentBlog.title}" on PromptKaro!`,
            url: shareLink
        }).catch(err => console.log(err));
    } else {
        window.safeCopy(shareLink);
        alert("Article Link copied to clipboard!");
    }
}
window.shareBlog = shareBlog;

function openInfoModal(type) {
    const title = document.getElementById('infoModalTitle');
    const content = document.getElementById('infoModalContent');
    if (type === 'about') {
        title.innerText = "About PromptKaro";
        content.innerHTML = `<p>Welcome to <strong>PromptKaro</strong>, your ultimate platform for exploring, sharing, and unlocking trending AI templates.</p>`;
    } else if (type === 'contact') {
        title.innerText = "Contact Us";
        content.innerHTML = `<p>Have issues or business inquiries? kazimmustafa38@gmail.com</p>`;
    } else if (type === 'dmca') {
        title.innerText = "DMCA Policy";
        content.innerHTML = `<p>At PromptKaro, we respect intellectual property rights.</p>`;
    } else if (type === 'privacy') {
        title.innerText = "Privacy Policy";
        content.innerHTML = `<p>We respect the privacy of our visitors.</p>`;
    } else if (type === 'terms') {
        title.innerText = "Terms of Service";
        content.innerHTML = `<p>These terms and conditions outline the rules and regulations.</p>`;
    }
    window.openModal('infoModal');
}
window.openInfoModal = openInfoModal;

function closeInfoModal() {
    window.closeModal('infoModal');
}
window.closeInfoModal = closeInfoModal;

function openCommunityDialog() {
    if(window.latestAdminTimestamp) {
        localStorage.setItem('lastReadAdminMessage', window.latestAdminTimestamp.toString());
    }
    document.querySelectorAll('.admin-chat-badge').forEach(b => b.classList.add('hidden'));
    window.openModal('communityChatModal');
    
    const area = document.getElementById('chatMessagesArea');
    if(area) {
        setTimeout(() => area.scrollTop = area.scrollHeight, 100);
    }
}
window.openCommunityDialog = openCommunityDialog;

function closeCommunityChat() {
    window.closeModal('communityChatModal');
}
window.closeCommunityChat = closeCommunityChat;

// ==========================================
// PART 2: MODULAR ASYNC BACKEND FIREBASE CODE
// ==========================================

const firebaseConfig = {
    apiKey: "AIzaSyCl5kGKi_9sbeHdlEZyqSuThQTA53bH3Po",
    authDomain: "aiprom-98a50.firebaseapp.com",
    projectId: "aiprom-98a50",
    storageBucket: "aiprom-98a50.firebasestorage.app",
    messagingSenderId: "479575775288",
    appId: "1:479575775288:web:aaeeed041501d1500aeecd",
    measurementId: "G-TYE4LJ2NRY",
    databaseURL: "https://aiprom-98a50-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const authFormEl = document.getElementById('authForm');
if (authFormEl) {
    authFormEl.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const btn = document.getElementById('authSubmitBtn');
        const originalText = btn.innerText;

        btn.disabled = true;
        btn.innerText = "Please wait...";

        try {
            if (window.appState.isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
                alert("Logged in successfully!");
            } else {
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                await set(ref(db, `users/${userCred.user.uid}`), {
                    email: email,
                    coins: 0,
                    createdAt: Date.now()
                });
                alert("Account created successfully!");
            }
            window.closeAuthModal();
            authFormEl.reset();
        } catch (error) {
            alert("Authentication Failed: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
}

const purchaseFormEl = document.getElementById('purchaseCoinsForm');
if (purchaseFormEl) {
    purchaseFormEl.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        if (!window.appState.currentUser) {
            alert("Please log in first!");
            window.openAuthModal('login');
            return;
        }
        const pkrAmount = parseFloat(document.getElementById('pkrAmount').value) || 0;
        const tid = document.getElementById('pTransactionID').value.trim();
        const senderInfo = document.getElementById('pSenderInfo').value.trim();

        if (pkrAmount <= 0 || !tid || !senderInfo) {
            alert("Please fill all fields properly.");
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Submitting...";

        try {
            const txRef = push(ref(db, 'transactions'));
            await set(txRef, {
                userId: window.appState.currentUser.uid,
                userEmail: window.appState.currentUser.email,
                amountPKR: pkrAmount,
                amountCoins: pkrAmount * 10000,
                tid: tid,
                senderInfo: senderInfo,
                paymentStatus: 'pending',
                timestamp: Date.now()
            });
            alert("Deposit request submitted successfully! Waiting for approval.");
            e.target.reset();
            document.getElementById('coinsResult').innerText = "0";
        } catch (err) {
            alert("Submission failed: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
}

const requestFormEl = document.getElementById('requestForm');
if (requestFormEl) {
    requestFormEl.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const email = document.getElementById('reqEmail').value.trim();
        const desc = document.getElementById('reqDesc').value.trim();
        
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Sending...";

        try {
            await push(ref(db, 'promptRequests'), { email, description: desc, timestamp: Date.now() });
            alert("Request sent successfully!");
            e.target.reset();
            window.closeRequestModal();
        } catch (err) {
            alert("Failed: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
}

// ADMIN PROMPT ADD/EDIT FORM
const promptFormEl = document.getElementById('promptForm');
if (promptFormEl) {
    promptFormEl.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const editId = document.getElementById('editPromptId').value;
        
        const rawImageUrl = document.getElementById('pImageURL').value.trim();
        const fallbackMediaType = rawImageUrl.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image';
        const definedMediaType = document.getElementById('pMediaType') ? document.getElementById('pMediaType').value : fallbackMediaType;

        const payload = {
            title: document.getElementById('pTitle').value.trim(),
            tags: document.getElementById('pCategory').value,
            imageURL: rawImageUrl,
            mediaType: definedMediaType,
            thumbnailURL: document.getElementById('pThumbnailURL') ? document.getElementById('pThumbnailURL').value.trim() : "",
            views: parseInt(document.getElementById('pInitialViews').value) || 0,
            description: document.getElementById('pDescription').value.trim(),
            type: document.getElementById('pType').value,
            priceCoins: document.getElementById('pType').value === 'paid' ? (parseInt(document.getElementById('pPrice').value) || 0) : 0,
            isTrending: document.getElementById('pTrending').checked,
            isPinned: document.getElementById('pPinned').checked,
            timestamp: editId ? (window.appState.promptsList.find(p => p.id === editId)?.timestamp || Date.now()) : Date.now()
        };

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Saving...";

        try {
            if (editId) {
                await update(ref(db, `prompts/${editId}`), payload);
                alert("Prompt updated successfully.");
            } else {
                await push(ref(db, 'prompts'), payload);
                alert("New Prompt added successfully!");
            }
            window.resetForm();
            window.switchTab('home');
        } catch (err) {
            alert("Failed to save prompt: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
}

// USER UPLOAD FORM LOGIC (ImgBB API + 50k Coins Deduction)
const userUploadForm = document.getElementById('userUploadForm');
if (userUploadForm) {
    userUploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!window.appState.currentUser) {
            alert("Please log in first!");
            window.openAuthModal('login');
            return;
        }

        const userCoins = window.appState.currentUserData?.coins || 0;
        if (userCoins < 50000) {
            alert("Insufficient Balance! You need 50,000 coins to upload a prompt.");
            window.switchTab('wallet');
            return;
        }

        const fileInput = document.getElementById('uImageFile');
        if (!fileInput.files.length) {
            alert("Please select an image to upload.");
            return;
        }

        const btn = document.getElementById('userUploadSubmitBtn');
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading... Please wait';

        try {
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('image', file);

            const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const imgData = await imgbbRes.json();

            if (!imgData.success) {
                throw new Error("Image upload failed: " + imgData.error.message);
            }

            const imageUrl = imgData.data.url;

            const payload = {
                title: document.getElementById('uTitle').value.trim(),
                tags: document.getElementById('uCategory').value,
                imageURL: imageUrl,
                mediaType: 'image', // Users currently only upload images via this form
                description: document.getElementById('uDescription').value.trim(),
                adsterraBanner: document.getElementById('uAdsterraBanner').value.trim(),
                adsterraNative: document.getElementById('uAdsterraNative').value.trim(),
                socialLink: document.getElementById('uSocialLink').value.trim(),
                uploaderUid: window.appState.currentUser.uid,
                uploaderEmail: window.appState.currentUser.email,
                views: 0,
                timestamp: Date.now()
            };

            await push(ref(db, 'userPrompts'), payload);

            const userCoinsRef = ref(db, `users/${window.appState.currentUser.uid}/coins`);
            await runTransaction(userCoinsRef, (current) => {
                return (current || 0) - 50000;
            });

            await push(ref(db, `purchaseLogs/${window.appState.currentUser.uid}`), {
                promptId: "user-upload",
                promptTitle: "Uploaded Custom Prompt",
                amountCoins: 50000,
                timestamp: Date.now()
            });

            alert("Prompt Successfully Uploaded! 50,000 coins deducted.");
            userUploadForm.reset();
            document.getElementById('uImageFileName').innerText = "Click to select an image...";
            document.getElementById('uImageFileName').classList.remove('text-purple-500');
            window.switchTab('home');

        } catch (err) {
            alert("Upload Error: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    });
}

function formatCoins(num) {
    const val = parseInt(num) || 0;
    if (val >= 10000) {
        const divided = val / 1000;
        if (val % 1000 === 0) {
            return Math.floor(divided) + 'K';
        } else {
            return divided.toFixed(1) + 'K';
        }
    }
    return val.toLocaleString();
}
window.formatCoins = formatCoins;

window.logout = async function() {
    await signOut(auth);
};

const apiKeySettingsRef = ref(db, 'settings/geminiApiKey');
onValue(apiKeySettingsRef, (snapshot) => {
    const input = document.getElementById('adminApiKeyInput');
    if (snapshot.exists() && input) {
        input.value = snapshot.val();
    }
});

window.saveApiKey = async function() {
    const input = document.getElementById('adminApiKeyInput');
    if(!input) return;
    const keyVal = input.value.trim();
    if(!keyVal) {
        alert("Please enter a valid API Key.");
        return;
    }
    await set(ref(db, 'settings/geminiApiKey'), keyVal);
    alert("AI API Key updated securely.");
};

const adsRef = ref(db, 'settings/ads');
onValue(adsRef, (snapshot) => {
    if (snapshot.exists()) {
        window.appState.ads = snapshot.val();
        
        const topAdInput = document.getElementById('adDisplayTop');
        if (topAdInput) topAdInput.value = window.appState.ads.top || '';
        
        const centerAdInput = document.getElementById('adArticleCenter');
        if (centerAdInput) centerAdInput.value = window.appState.ads.center || '';
        
        const multAdInput = document.getElementById('adMultiplexBottom');
        if (multAdInput) multAdInput.value = window.appState.ads.multiplex || '';
        
        const botAdInput = document.getElementById('adDisplayBottom');
        if (botAdInput) botAdInput.value = window.appState.ads.bottom || '';
    }
});

window.saveAdsConfig = async function() {
    const payload = {
        top: document.getElementById('adDisplayTop').value,
        center: document.getElementById('adArticleCenter').value,
        multiplex: document.getElementById('adMultiplexBottom').value,
        bottom: document.getElementById('adDisplayBottom').value,
    };
    try {
        await set(ref(db, 'settings/ads'), payload);
        alert("AdSense Configuration Saved Successfully!");
    } catch (err) {
        alert("Failed to save ads: " + err.message);
    }
};

async function fetchGitHubImages() {
    const datalist = document.getElementById('githubImagesList');
    const statusSpan = document.getElementById('githubApiStatus');
    if (!datalist) return;

    if (statusSpan) {
        statusSpan.innerText = "🔄 Syncing /images/ list from GitHub repo...";
        statusSpan.className = "block text-[10px] text-amber-500 font-semibold mt-1";
    }

    try {
        const response = await fetch("https://api.github.io/repos/freeearningsonline/Ai-Prompt-/contents/images");
        if (response.ok) {
            const data = await response.json();
            datalist.innerHTML = '';
            let count = 0;

            data.forEach(item => {
                if (item.type === 'file' && /\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(item.name)) {
                    const option = document.createElement('option');
                    option.value = item.name;
                    datalist.appendChild(option);
                    count++;
                }
            });

            if (statusSpan) {
                statusSpan.innerText = `✅ Found ${count} media files in GitHub folder.`;
                statusSpan.className = "block text-[10px] text-emerald-500 font-semibold mt-1";
            }
        } else {
            if (statusSpan) {
                statusSpan.innerText = "⚠️ Repo folder empty or offline. Enter filename manually.";
                statusSpan.className = "block text-[10px] text-rose-500 font-semibold mt-1";
            }
        }
    } catch (err) {
        console.warn("GitHub contents API error: ", err);
        if (statusSpan) {
            statusSpan.innerText = "⚠️ GitHub API rate limit reached. Type file name manually.";
            statusSpan.className = "block text-[10px] text-rose-500/80 font-semibold mt-1";
        }
    }
}
window.fetchGitHubImages = fetchGitHubImages;

const communityRef = ref(db, 'communityChat');
window.latestAdminTimestamp = 0;

onValue(communityRef, (snapshot) => {
    window.appState.chatMessages = [];
    window.latestAdminTimestamp = 0;
    if (snapshot.exists()) {
        const data = snapshot.val();
        for (let key in data) {
            const msg = { id: key, ...data[key] };
            window.appState.chatMessages.push(msg);
            if (msg.isAdmin && msg.type === 'announcement') {
                window.latestAdminTimestamp = Math.max(window.latestAdminTimestamp, msg.timestamp || 0);
            }
        }
    }
    window.appState.chatMessages.sort((a, b) => a.timestamp - b.timestamp);
    renderChatMessages();

    const lastRead = parseInt(localStorage.getItem('lastReadAdminMessage') || '0');
    const chatModal = document.getElementById('communityChatModal');
    const isModalHidden = chatModal ? chatModal.classList.contains('hidden') : true;

    if (window.latestAdminTimestamp > lastRead && isModalHidden) {
        document.querySelectorAll('.admin-chat-badge').forEach(b => b.classList.remove('hidden'));
    }
});

function renderChatMessages() {
    const area = document.getElementById('chatMessagesArea');
    if(!area) return;
    
    area.innerHTML = '<div class="text-center my-4"><span class="bg-amber-100 text-amber-800 text-[10px] px-3 py-1 rounded-lg shadow-sm font-bold">Welcome to PromptKaro Global Chat! Note: Be respectful.</span></div>';
    
    const currentUid = window.appState.currentUser ? window.appState.currentUser.uid : null;

    window.appState.chatMessages.forEach(msg => {
        const isSelf = currentUid && msg.userId === currentUid;
        const isAdmin = msg.isAdmin;
        
        const wrapper = document.createElement('div');
        wrapper.className = "flex flex-col w-full";
        
        if (isAdmin && msg.type === 'announcement') {
            wrapper.innerHTML = `
                <div class="self-center bg-amber-100 dark:bg-amber-900/50 border border-amber-400 dark:border-amber-600 rounded-xl p-3 my-2 max-w-[90%] md:max-w-[70%] shadow-sm text-center w-full">
                    <div class="text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase mb-1 flex items-center justify-center gap-1"><i class="fa-solid fa-bullhorn"></i> Admin Announcement</div>
                    <p class="text-xs font-bold text-slate-800 dark:text-slate-200">${msg.text}</p>
                    <span class="text-[9px] text-slate-500 mt-1 block">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        } else if (isSelf) {
            wrapper.innerHTML = `
                <div class="self-end bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-slate-100 rounded-l-xl rounded-tr-xl px-3 py-1.5 max-w-[85%] md:max-w-[75%] shadow-sm relative my-0.5">
                    <p class="text-[13px] font-medium break-words">${msg.text}</p>
                    <span class="text-[9px] text-slate-500 dark:text-slate-400 block text-right mt-0.5">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        } else {
            wrapper.innerHTML = `
                <div class="self-start bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-r-xl rounded-tl-xl px-3 py-1.5 max-w-[85%] md:max-w-[75%] shadow-sm relative my-0.5">
                    <span class="text-[10px] font-bold text-brand-500 mb-0.5 block flex items-center gap-1">
                        ${isAdmin ? '<i class="fa-solid fa-shield-halved text-red-500"></i><span class="text-red-500">Admin</span>' : (msg.userName || 'User')}
                    </span>
                    <p class="text-[13px] font-medium break-words">${msg.text}</p>
                    <span class="text-[9px] text-slate-500 dark:text-slate-400 block text-right mt-0.5">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            `;
        }
        area.appendChild(wrapper);
    });
    
    area.scrollTop = area.scrollHeight;
}

window.sendChatMessage = async function() {
    if (!window.appState.currentUser) {
        alert("Please log in to chat.");
        window.openAuthModal('login');
        return;
    }
    
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    input.style.height = ''; 

    const isAdmin = window.appState.currentUser.email === 'kazimmustafa38@gmail.com';
    const userName = window.appState.currentUser.email.split('@')[0];

    try {
        await push(ref(db, 'communityChat'), {
            userId: window.appState.currentUser.uid,
            userName: userName,
            text: text,
            isAdmin: isAdmin,
            type: 'message',
            timestamp: Date.now()
        });
    } catch(err) {
        console.error("Chat error: ", err);
    }
};

window.sendAdminAnnouncement = async function() {
    const input = document.getElementById('adminAnnouncementInput');
    const text = input.value.trim();
    if(!text) return;
    
    try {
        await push(ref(db, 'communityChat'), {
            userId: window.appState.currentUser.uid,
            userName: 'Admin',
            text: text,
            isAdmin: true,
            type: 'announcement', 
            timestamp: Date.now()
        });
        input.value = '';
        alert("Announcement sent to Global Community!");
    } catch(err) {
        alert("Failed: " + err.message);
    }
};

const dbBlogsRef = ref(db, 'blogs');
onValue(dbBlogsRef, (snapshot) => {
    window.appState.blogsList = [];
    if (snapshot.exists()) {
        const data = snapshot.val();
        for (let key in data) {
            window.appState.blogsList.push({ id: key, ...data[key] });
        }
    }
    renderBlogs();
    if (typeof window.renderAdminBlogsList === 'function') {
        window.renderAdminBlogsList();
    }
    if (typeof window.renderHomeBlogSlider === 'function') {
        window.renderHomeBlogSlider();
    }
});

window.homeBlogScrollInterval = null;
window.startHomeBlogAutoScroll = function() {
    if(window.homeBlogScrollInterval) {
        clearInterval(window.homeBlogScrollInterval);
    }
    window.homeBlogScrollInterval = setInterval(() => {
        const container = document.getElementById('homeBlogSliderContainer');
        if(!container) return;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        if(container.scrollLeft >= maxScrollLeft - 10) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            const scrollAmount = window.innerWidth < 768 ? window.innerWidth * 0.85 : 300; 
            container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    }, 50000); 
};

window.renderHomeBlogSlider = function() {
    const container = document.getElementById('homeBlogSliderContainer');
    if(!container) return;
    container.innerHTML = '';

    const sorted = [...window.appState.blogsList].sort((a,b) => b.createdAt - a.createdAt).slice(0, 4);

    if(sorted.length === 0) {
        container.innerHTML = '<div class="text-slate-500 text-sm py-4 w-full text-center">No latest blogs found.</div>';
        return;
    }

    sorted.forEach(blog => {
        const finalImg = window.resolveImageSrc(blog.imageURL);
        const dateStr = new Date(blog.createdAt).toLocaleDateString();
        const blogCat = blog.category || 'AI Guide';

        const card = document.createElement('article');
        card.className = "snap-start shrink-0 w-[85%] md:w-[45%] lg:w-[30%] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col transition hover:shadow-md cursor-pointer";
        card.onclick = () => window.openBlogDetail(blog.id);

        card.innerHTML = `
            <img src="${finalImg}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';" alt="${blog.title}" class="w-full h-36 object-cover">
            <div class="p-4 flex-grow flex flex-col justify-between space-y-2">
                <div class="space-y-1.5">
                    <span class="text-[9px] bg-brand-500/10 text-brand-500 font-bold px-2 py-0.5 rounded-full uppercase">${blogCat}</span>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">${blog.title}</h3>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
                    <span><i class="fa-regular fa-calendar mr-1"></i>${dateStr}</span>
                    <span class="font-bold text-brand-500">Read ➔</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    window.startHomeBlogAutoScroll();
};

function renderBlogs() {
    const container = document.getElementById('blogsContainer');
    const pagControls = document.getElementById('blogPaginationControls');
    if (!container) return;
    container.innerHTML = '';

    let filtered = window.appState.blogsList;

    if (window.appState.currentBlogFilter !== 'All') {
        filtered = filtered.filter(b => b.category === window.appState.currentBlogFilter);
    }

    const searchVal = (document.getElementById('desktopSearch')?.value || document.getElementById('mobileSearch')?.value || '').toLowerCase();
    if (searchVal) {
        filtered = filtered.filter(b => b.title.toLowerCase().includes(searchVal) || (b.excerpt || '').toLowerCase().includes(searchVal));
    }

    filtered.sort((a, b) => b.createdAt - a.createdAt);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">No blog posts found matching your criteria.</div>`;
        if(pagControls) pagControls.classList.add('hidden');
        return;
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    if(window.appState.currentBlogPage > totalPages) {
        window.appState.currentBlogPage = totalPages || 1;
    }

    const startIndex = (window.appState.currentBlogPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (filtered.length > itemsPerPage) {
        if(pagControls) pagControls.classList.remove('hidden');
        const btnPrev = document.getElementById('btnPrevBlog');
        const btnNext = document.getElementById('btnNextBlog');
        const pageNum = document.getElementById('blogPageNumber');

        if (window.appState.currentBlogPage === 1) {
            if(btnPrev) btnPrev.classList.add('hidden');
        } else {
            if(btnPrev) btnPrev.classList.remove('hidden');
        }

        if (window.appState.currentBlogPage === totalPages) {
            if(btnNext) btnNext.classList.add('hidden');
        } else {
            if(btnNext) btnNext.classList.remove('hidden');
        }

        if(pageNum) pageNum.innerText = `${window.appState.currentBlogPage} / ${totalPages}`;
    } else {
        if(pagControls) pagControls.classList.add('hidden');
    }

    paginatedItems.forEach(blog => {
        const card = document.createElement('article');
        card.className = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between transition hover:shadow-md cursor-pointer";
        card.onclick = () => window.openBlogDetail(blog.id);

        const finalImg = window.resolveImageSrc(blog.imageURL);
        const dateStr = new Date(blog.createdAt).toLocaleDateString();
        const blogCat = blog.category || 'AI Guide';

        card.innerHTML = `
            <img src="${finalImg}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';" alt="${blog.title}" class="w-full h-48 object-cover">
            <div class="p-5 flex-grow flex flex-col justify-between space-y-3">
                <div class="space-y-2">
                    <span class="text-[10px] bg-brand-500/10 text-brand-500 font-bold px-2 py-0.5 rounded-full uppercase">${blogCat}</span>
                    <h3 class="text-sm font-bold text-slate-900 dark:text-white line-clamp-2">${blog.title}</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-3">${(blog.excerpt || blog.content.substring(0, 100)).replace(/<[^>]+>/g, '')}...</p>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <span><i class="fa-regular fa-calendar mr-1"></i>${dateStr}</span>
                    <span class="font-bold text-brand-500">Read More ➔</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}
window.renderBlogs = renderBlogs;

window.changeBlogPage = function(direction) {
    window.appState.currentBlogPage += direction;
    renderBlogs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.filterBlogCategory = function(cat) {
    window.appState.currentBlogFilter = cat;
    window.appState.currentBlogPage = 1; 
    document.querySelectorAll('.blog-category-btn').forEach(btn => {
        if (btn.getAttribute('data-blog-category') === cat) {
            btn.classList.add('bg-brand-500', 'text-white');
            btn.classList.remove('bg-white', 'dark:bg-slate-900', 'border-slate-200', 'dark:border-slate-800');
        } else {
            btn.classList.remove('bg-brand-500', 'text-white');
            btn.classList.add('bg-white', 'dark:bg-slate-900', 'border-slate-200', 'dark:border-slate-800');
        }
    });
    renderBlogs();
}

function parseSEOContent(text) {
    if (!text.trim()) return '';
    if (text.startsWith('### ')) return `<h4 class="text-md font-bold mt-4 mb-2 text-slate-800 dark:text-slate-200">${text.substring(4)}</h4>`;
    if (text.startsWith('## ')) return `<h3 class="text-lg font-bold mt-5 mb-2 text-brand-500">${text.substring(3)}</h3>`;
    if (text.startsWith('# ')) return `<h2 class="text-xl font-extrabold mt-6 mb-3 text-slate-900 dark:text-white">${text.substring(2)}</h2>`;
    if (text.match(/<[^>]+>/)) return `<div class="mb-4 text-slate-700 dark:text-slate-300">${text}</div>`; 
    return `<p class="mb-4 text-slate-700 dark:text-slate-300">${text}</p>`;
}

window.openBlogDetail = function(id) {
    const blog = window.appState.blogsList.find(b => b.id === id);
    if (!blog) return;

    window.openModal('blogDetailModal');

    const blogDetailTitle = document.getElementById('blogDetailTitle');
    if (blogDetailTitle) blogDetailTitle.innerText = blog.title;

    const blogDetailCategoryTag = document.getElementById('blogDetailCategoryTag');
    if (blogDetailCategoryTag) blogDetailCategoryTag.innerText = blog.category || 'AI Guide';
    
    const resolvedImg = window.resolveImageSrc(blog.imageURL);
    const blogImg = document.getElementById('blogDetailImg');
    if (blogImg) {
        blogImg.src = resolvedImg;
        blogImg.onerror = function() {
            this.onerror = null;
            this.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';
        };
    }

    const dateStr = new Date(blog.createdAt).toLocaleDateString();
    const blogDetailMeta = document.getElementById('blogDetailMeta');
    if (blogDetailMeta) {
        blogDetailMeta.innerText = `Published: ${dateStr} | Author: ${blog.author || 'Nazim Mustafa'}`;
    }
    
    const paragraphs = blog.content.split('\n').filter(p => p.trim());
    const midIndex = Math.ceil(paragraphs.length / 2);
    
    const topHtml = paragraphs.slice(0, midIndex).map(p => parseSEOContent(p)).join('');
    const bottomHtml = paragraphs.slice(midIndex).map(p => parseSEOContent(p)).join('');

    const contentTop = document.getElementById('blogDetailContentTop');
    const contentBottom = document.getElementById('blogDetailContentBottom');
    
    if (contentTop) contentTop.innerHTML = topHtml;
    if (contentBottom) contentBottom.innerHTML = bottomHtml;

    const centerImgEl = document.getElementById('blogDetailCenterImg');
    if (centerImgEl) {
        if (blog.centerImageURL && blog.centerImageURL.trim() !== '') {
            centerImgEl.src = window.resolveImageSrc(blog.centerImageURL);
            centerImgEl.classList.remove('hidden');
        } else {
            centerImgEl.classList.add('hidden');
        }
    }

    window.injectHtmlWithScripts('adTopContainer', window.appState.ads.top);
    window.injectHtmlWithScripts('adCenterContainer', window.appState.ads.center);
    window.injectHtmlWithScripts('adMultiplexContainer', window.appState.ads.multiplex);
    window.injectHtmlWithScripts('adBottomContainer', window.appState.ads.bottom);

    window.updatePageMetadata(blog.title, blog.excerpt || blog.content.substring(0, 150).replace(/<[^>]+>/g, ''), blog.keywords || "AI Prompts, Guide, Update");
};

function renderAdminBlogsList() {
    const table = document.getElementById('adminBlogsListTable');
    if (!table) return;
    table.innerHTML = '';

    if (window.appState.blogsList.length === 0) {
        table.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-slate-500">No blog posts found.</td></tr>`;
        return;
    }

    window.appState.blogsList.forEach(blog => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900";
        tr.innerHTML = `
            <td class="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 text-xs">${blog.title}</td>
            <td class="px-4 py-3 text-slate-500 text-xs">${blog.category || 'N/A'}</td>
            <td class="px-4 py-3 text-slate-500 text-xs">${new Date(blog.createdAt).toLocaleDateString()}</td>
            <td class="px-4 py-3 space-x-2 text-xs">
                <button onclick="window.editBlog('${blog.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-2 py-1 rounded">Edit</button>
                <button onclick="window.deleteBlog('${blog.id}')" class="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-1 rounded">Delete</button>
            </td>
        `;
        table.appendChild(tr);
    });
}
window.renderAdminBlogsList = renderAdminBlogsList;

const blogFormEl = document.getElementById('blogForm');
if (blogFormEl) {
    blogFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('editBlogId').value;
        const title = document.getElementById('bTitle').value;
        const category = document.getElementById('bCategory').value;
        const keywords = document.getElementById('bKeywords').value.trim();
        const imageURL = document.getElementById('bImageURL').value.trim();
        const centerImageURL = document.getElementById('bCenterImageURL').value.trim();
        const excerpt = document.getElementById('bExcerpt').value;
        const content = document.getElementById('bContent').value;

        const payload = {
            title: title,
            category: category,
            keywords: keywords,
            imageURL: imageURL,
            centerImageURL: centerImageURL,
            excerpt: excerpt,
            content: content,
            author: "Nazim Mustafa",
            createdAt: editId ? (window.appState.blogsList.find(b => b.id === editId)?.createdAt || Date.now()) : Date.now()
        };

        try {
            if (editId) {
                await update(ref(db, `blogs/${editId}`), payload);
                alert("Blog post updated successfully.");
            } else {
                const newBlogRef = push(ref(db, 'blogs'));
                await set(newBlogRef, payload);
                alert("New Blog post published successfully!");
            }
            window.resetBlogForm();
            window.switchTab('blog');
        } catch (err) {
            alert("Failed to save blog: " + err.message);
        }
    });
}

window.editBlog = function(id) {
    const blog = window.appState.blogsList.find(b => b.id === id);
    if (blog) {
        document.getElementById('editBlogId').value = blog.id;
        document.getElementById('bTitle').value = blog.title;
        document.getElementById('bCategory').value = blog.category || '';
        document.getElementById('bKeywords').value = blog.keywords || '';
        document.getElementById('bImageURL').value = blog.imageURL || '';
        document.getElementById('bCenterImageURL').value = blog.centerImageURL || '';
        document.getElementById('bExcerpt').value = blog.excerpt || '';
        document.getElementById('bContent').value = blog.content || '';

        window.toggleAdminTab('blogs');
    }
};

window.deleteBlog = async function(id) {
    if (confirm("Are you sure you want to delete this blog post?")) {
        try {
            await remove(ref(db, `blogs/${id}`));
            alert("Blog post deleted.");
        } catch(err) {
            alert("Delete failed: " + err.message);
        }
    }
};

function updateAuthUI(isLoggedIn, email = '', coins = 0) {
    const dCoin = document.getElementById('desktopCoinDisplay');
    const mCoin = document.getElementById('mobileMenuCoinDisplay');
    const dEmail = document.getElementById('userEmailDisplay');
    const mEmail = document.getElementById('mobileEmailDisplay');

    const formattedValue = formatCoins(coins);

    if(dCoin) dCoin.innerText = formattedValue;
    if(mCoin) mCoin.innerText = formattedValue;
    
    document.querySelectorAll('.walletCoinTotal').forEach(el => {
        if(el) el.innerText = formattedValue;
    });

    if (isLoggedIn) {
        if(dEmail) dEmail.innerText = email;
        if(mEmail) mEmail.innerText = email;
        
        document.querySelectorAll('.auth-logged-in').forEach(el => {
            if(el) el.classList.remove('hidden');
        });
        document.querySelectorAll('.auth-logged-out').forEach(el => {
            if(el) el.classList.add('hidden');
        });
    } else {
        if(dEmail) dEmail.innerText = '';
        if(mEmail) mEmail.innerText = '';
        
        document.querySelectorAll('.auth-logged-in').forEach(el => {
            if(el) el.classList.add('hidden');
        });
        document.querySelectorAll('.auth-logged-out').forEach(el => {
            if(el) el.classList.remove('hidden');
        });
    }
}
window.updateAuthUI = updateAuthUI; 

onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.appState.currentUser = user;
        const userRef = ref(db, `users/${user.uid}`);
        onValue(userRef, (snapshot) => {
            const data = snapshot.val();
            window.appState.currentUserData = data;
            if (data) {
                window.updateAuthUI(true, user.email, data.coins || 0);
                if (user.email === 'kazimmustafa38@gmail.com') {
                    document.getElementById('adminBtnContainer').classList.remove('hidden');
                    document.getElementById('mobileAdminBtn').classList.remove('hidden');
                } else {
                    document.getElementById('adminBtnContainer').classList.add('hidden');
                    document.getElementById('mobileAdminBtn').classList.add('hidden');
                }
            }
        });
        syncUserTransactionsHistory();
        syncUserPurchaseHistory(); 
        triggerAutoApprovalCheck();
    } else {
        window.appState.currentUser = null;
        window.appState.currentUserData = null;
        window.updateAuthUI(false);
        document.getElementById('adminBtnContainer').classList.add('hidden');
        document.getElementById('mobileAdminBtn').classList.add('hidden');
        document.getElementById('userTransactionsList').innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400">Please login to view history.</td></tr>';
        document.getElementById('userPurchaseList').innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-400">Please login to view history.</td></tr>';
    }
});

const categoriesRef = ref(db, 'categories');
onValue(categoriesRef, (snapshot) => {
    if (snapshot.exists()) {
        window.appState.categories = snapshot.val();
    } else {
        const defaultCats = ["Viral", "ChatGPT", "Midjourney", "Flux", "Runway", "Kling", "Veo", "IG Trend", "Boys", "Girls"];
        set(categoriesRef, defaultCats);
        window.appState.categories = defaultCats;
    }
    renderCategoryPills(window.appState.categories);
    if(typeof window.renderCategoryDropdown === 'function') {
        window.renderCategoryDropdown(window.appState.categories);
    }
    if(typeof window.renderAdminCategoryManager === 'function') {
        window.renderAdminCategoryManager(window.appState.categories);
    }
});

const blogCategoriesRef = ref(db, 'blogCategories');
onValue(blogCategoriesRef, (snapshot) => {
    if (snapshot.exists()) {
        window.appState.blogCategories = snapshot.val();
    } else {
        const defaultBlogCats = ["AI Tips", "Updates", "Guides"];
        set(blogCategoriesRef, defaultBlogCats);
        window.appState.blogCategories = defaultBlogCats;
    }
    renderBlogCategoryPills(window.appState.blogCategories);
    renderBlogCategoryDropdown(window.appState.blogCategories);
    if(typeof window.renderAdminBlogCategoryManager === 'function') {
        window.renderAdminBlogCategoryManager(window.appState.blogCategories);
    }
});

function renderCategoryPills(categories) {
    const container = document.getElementById('categoryFiltersContainer');
    if(!container) return;
    container.innerHTML = '';

    const createBtn = (catName, filterVal) => {
        const btn = document.createElement('button');
        btn.onclick = () => window.filterCategory(filterVal);
        
        const isActive = window.appState.currentFilter === filterVal;
        btn.className = isActive 
            ? "category-btn bg-brand-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shadow-sm"
            : "category-btn bg-white border border-slate-200 hover:border-brand-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-brand-500 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition text-slate-955 dark:text-slate-100";
        
        btn.innerText = catName;
        btn.setAttribute('data-category', filterVal);
        return btn;
    };

    container.appendChild(createBtn('All Prompts', 'All'));
    container.appendChild(createBtn('Video Prompts', 'Video Prompts'));
    container.appendChild(createBtn('Image Prompts', 'Image Prompts'));

    categories.forEach(cat => {
        container.appendChild(createBtn(cat, cat));
    });
}

window.renderCategoryDropdown = function(categories) {
    const select = document.getElementById('pCategory');
    const uSelect = document.getElementById('uCategory');
    
    if(select) select.innerHTML = '';
    if(uSelect) uSelect.innerHTML = '';
    
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        if(select) select.appendChild(opt);

        const uOpt = document.createElement('option');
        uOpt.value = cat;
        uOpt.innerText = cat;
        if(uSelect) uSelect.appendChild(uOpt);
    });
};

function renderBlogCategoryPills(categories) {
    const container = document.getElementById('blogCategoryFiltersContainer');
    if(!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.onclick = () => window.filterBlogCategory('All');
    allBtn.className = "blog-category-btn bg-brand-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition";
    allBtn.innerText = "All Posts";
    allBtn.setAttribute('data-blog-category', 'All');
    container.appendChild(allBtn);

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.onclick = () => window.filterBlogCategory(cat);
        btn.className = "blog-category-btn bg-white border border-slate-200 hover:border-brand-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-brand-500 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition text-slate-955 dark:text-slate-100";
        btn.innerText = cat;
        btn.setAttribute('data-blog-category', cat);
        container.appendChild(btn);
    });
}

function renderBlogCategoryDropdown(categories) {
    const select = document.getElementById('bCategory');
    if(!select) return;
    select.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        select.appendChild(opt);
    });
}

function syncUserTransactionsHistory() {
    if (!window.appState.currentUser) return;
    const txRef = ref(db, 'transactions');
    onValue(txRef, (snapshot) => {
        const list = document.getElementById('userTransactionsList');
        if(!list) return;
        list.innerHTML = '';
        if (snapshot.exists()) {
            const data = snapshot.val();
            let itemsFound = false;
            for (let key in data) {
                const tx = data[key];
                if (tx.userId === window.appState.currentUser.uid) {
                    itemsFound = true;
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900";
                    tr.innerHTML = `
                        <td class="px-4 py-3 font-mono text-[11px] text-brand-500 font-bold">${tx.tid || 'N/A'}</td>
                        <td class="px-4 py-3 text-slate-500 dark:text-slate-400 text-[11px]">${tx.senderInfo || 'N/A'}</td>
                        <td class="px-4 py-3 font-bold text-amber-500">${formatCoins(tx.amountCoins)}</td>
                        <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-500/10 text-brand-500">${tx.paymentStatus}</span></td>
                    `;
                    list.appendChild(tr);
                }
            }
            if (!itemsFound) {
                list.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400">No transactions recorded yet.</td></tr>';
            }
        } else {
            list.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-400">No transactions recorded yet.</td></tr>';
        }
    });
}

function syncUserPurchaseHistory() {
    if (!window.appState.currentUser) return;
    const logRef = ref(db, `purchaseLogs/${window.appState.currentUser.uid}`);
    onValue(logRef, (snapshot) => {
        const list = document.getElementById('userPurchaseList');
        if(!list) return;
        list.innerHTML = '';
        if (snapshot.exists()) {
            const data = snapshot.val();
            let itemsFound = false;
            for (let key in data) {
                const log = data[key];
                itemsFound = true;
                const dateStr = new Date(log.timestamp).toLocaleDateString() + ' ' + new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900";
                tr.innerHTML = `
                    <td class="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">${log.promptTitle}</td>
                    <td class="px-4 py-3 text-red-500 font-bold">-${formatCoins(log.amountCoins)}</td>
                    <td class="px-4 py-3 text-slate-500 dark:text-slate-400 text-[10px]">${dateStr}</td>
                `;
                list.appendChild(tr);
            }
            if (!itemsFound) {
                list.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-400">No premium records yet.</td></tr>';
            }
        } else {
            list.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-slate-400">No premium records yet.</td></tr>';
        }
    });
}

async function triggerAutoApprovalCheck() {
    try {
        const txRef = ref(db, 'transactions');
        const snapshot = await get(txRef);
        if (snapshot.exists()) {
            const transactions = snapshot.val();
            const now = Date.now();
            const tenMinutes = 10 * 60 * 1000;

            for (let key in transactions) {
                const tx = transactions[key];
                if (tx.paymentStatus === 'pending' && (now - tx.timestamp) > tenMinutes) {
                    await update(ref(db, `transactions/${key}`), { paymentStatus: 'auto-approved' });
                    
                    const userRef = ref(db, `users/${tx.userId}/coins`);
                    await runTransaction(userRef, (currentCoins) => {
                        return (currentCoins || 0) + tx.amountCoins;
                    });
                }
            }
        }
    } catch (err) {
        console.warn("Auto approval trace: ", err.message);
    }
}

setInterval(() => {
    if (window.appState.currentUser) {
        triggerAutoApprovalCheck();
    }
}, 60000);

// =====================================
// DATA FETCHERS & RENDERERS
// =====================================

const promptsRef = ref(db, 'prompts');
onValue(promptsRef, (snapshot) => {
    window.appState.promptsList = [];
    if (snapshot.exists()) {
        const data = snapshot.val();
        for (let key in data) {
            window.appState.promptsList.push({ id: key, ...data[key] });
        }
    }
    renderPrompts();
    if(typeof window.renderVideoPrompts === 'function') {
        window.renderVideoPrompts();
    }
    if(typeof window.renderAdminPromptsList === 'function') {
        window.renderAdminPromptsList();
    }
});

const userPromptsRef = ref(db, 'userPrompts');
onValue(userPromptsRef, (snapshot) => {
    window.appState.userPromptsList = [];
    if (snapshot.exists()) {
        const data = snapshot.val();
        for (let key in data) {
            window.appState.userPromptsList.push({ id: key, ...data[key] });
        }
    }
    if (typeof window.renderUserPrompts === 'function') {
        window.renderUserPrompts();
    }
});

function renderPrompts() {
    const grid = document.getElementById('promptsGrid');
    const countText = document.getElementById('promptsCount');
    const pagControls = document.getElementById('paginationControls');
    
    if(!grid) return;
    grid.innerHTML = '';

    let filtered = window.appState.promptsList;

    if (window.appState.viewMode === 'discover') {
        filtered = window.appState.promptsList.filter(p => p.isTrending === true);
    } else if (window.appState.currentFilter === 'Video Prompts') {
        filtered = window.appState.promptsList.filter(p => p.mediaType === 'video' || (p.imageURL && p.imageURL.match(/\.(mp4|webm|ogg)$/i)));
    } else if (window.appState.currentFilter === 'Image Prompts') {
        filtered = window.appState.promptsList.filter(p => p.mediaType !== 'video' && (!p.imageURL || !p.imageURL.match(/\.(mp4|webm|ogg)$/i)));
    } else if (window.appState.currentFilter !== 'All') {
        filtered = window.appState.promptsList.filter(p => p.tags === window.appState.currentFilter);
    }

    const searchVal = (document.getElementById('desktopSearch')?.value || document.getElementById('mobileSearch')?.value || '').toLowerCase();
    
    if (searchVal) {
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(searchVal) || 
            p.description.toLowerCase().includes(searchVal) || 
            (p.tags && p.tags.toLowerCase().includes(searchVal))
        );
    }

    filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.views - a.views;
    });

    if(countText) {
        if (searchVal) {
            countText.innerHTML = `<span class="bg-brand-500/10 text-brand-500 px-2 py-1 rounded-md font-bold shadow-sm">${filtered.length} Found</span>`;
        } else {
            countText.innerText = `${filtered.length} prompts`;
        }
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 flex flex-col items-center justify-center text-center animate-fade-in w-full">
                <i class="fa-solid fa-face-frown-open text-4xl text-slate-300 dark:text-slate-600 mb-4 animate-bounce"></i>
                <h3 class="text-xl font-bold text-slate-700 dark:text-slate-300">No Results Found</h3>
                <p class="text-sm text-slate-500 mt-2">Try searching with different keywords.</p>
            </div>
        `;
        if(pagControls) pagControls.classList.add('hidden');
        return;
    }

    const itemsPerPage = 8;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    if(window.appState.currentPage > totalPages) {
        window.appState.currentPage = totalPages || 1;
    }

    const startIndex = (window.appState.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (filtered.length > itemsPerPage) {
        if(pagControls) pagControls.classList.remove('hidden');
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');
        const pageNumber = document.getElementById('pageNumber');

        if (window.appState.currentPage === 1) {
            if(btnPrev) btnPrev.classList.add('hidden');
        } else {
            if(btnPrev) btnPrev.classList.remove('hidden');
        }

        if (window.appState.currentPage === totalPages) {
            if(btnNext) btnNext.classList.add('hidden');
        } else {
            if(btnNext) btnNext.classList.remove('hidden');
        }

        if(pageNumber) pageNumber.innerText = `${window.appState.currentPage} / ${totalPages}`;
    } else {
        if(pagControls) pagControls.classList.add('hidden');
    }

    paginatedItems.forEach(p => {
        const isPaid = p.type === 'paid';
        const card = document.createElement('article'); 
        card.className = "relative overflow-hidden aspect-[2/3] rounded-[1.5rem] bg-slate-100 dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 transition cursor-pointer group flex flex-col justify-end text-slate-100";
        card.onclick = () => window.openPromptDetail(p.id);

        const finalUrl = window.resolveImageSrc(p.imageURL);
        const optimizedAltText = `${p.title} - ${p.tags || 'Viral'} AI Prompt`;
        const finalThumbImg = p.thumbnailURL ? window.resolveImageSrc(p.thumbnailURL) : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';

        const isVideo = p.mediaType === 'video' || (p.imageURL && p.imageURL.match(/\.(mp4|webm|ogg)$/i));
        let mediaHTML = '';
        
        if (isVideo) {
            mediaHTML = `<video src="${finalUrl}" poster="${finalThumbImg}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300" muted playsinline preload="none" loop onmouseover="let pl=this.play(); if(pl)pl.catch(()=>{});" onmouseout="this.pause()"></video>`;
        } else {
            mediaHTML = `<img src="${finalUrl}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';" alt="${optimizedAltText}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300">`;
        }

        let displayTitle = searchVal ? window.highlightText(p.title, searchVal) : p.title;
        let displayTags = searchVal && p.tags ? window.highlightText(p.tags, searchVal) : (p.tags || 'General');

        card.innerHTML = `
            ${mediaHTML}
            <div class="absolute top-3 left-3 flex flex-col gap-1 z-10">
                ${p.isPinned ? '<span class="bg-amber-500 text-[8px] font-extrabold text-slate-950 px-2 py-0.5 rounded-full shadow uppercase">Pinned</span>' : ''}
            </div>
            <span class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur text-[8px] px-2.5 py-0.5 rounded-full font-bold text-slate-200 z-10">
                ${isPaid ? `<span class="text-amber-400"><i class="fa-solid fa-coins mr-1"></i>${formatCoins(p.priceCoins)}</span>` : 'Free'}
            </span>
            <div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/45 to-transparent flex flex-col justify-end min-h-[50%] rounded-b-[1.5rem] pointer-events-none z-10">
                <h4 class="text-sm font-bold text-white leading-snug line-clamp-2">${displayTitle}</h4>
                <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-300 font-semibold">
                    <span><i class="fa-regular fa-eye mr-1"></i>${formatCoins(p.views || 0)} views</span>
                    <span>${isVideo ? '<i class="fa-solid fa-video text-brand-400 mr-1"></i>' : ''}#${displayTags}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}
window.renderPrompts = renderPrompts;

window.renderUserPrompts = function() {
    const grid = document.getElementById('userPromptsGrid');
    const countText = document.getElementById('userPromptsCount');
    const pagControls = document.getElementById('userPaginationControls');
    
    if(!grid) return;
    grid.innerHTML = '';

    let filtered = window.appState.userPromptsList;
    
    const searchVal = (document.getElementById('desktopSearch')?.value || document.getElementById('mobileSearch')?.value || '').toLowerCase();
    
    if (searchVal) {
        filtered = filtered.filter(p => 
            p.title.toLowerCase().includes(searchVal) || 
            p.description.toLowerCase().includes(searchVal) || 
            (p.tags && p.tags.toLowerCase().includes(searchVal))
        );
    }

    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if(countText) {
        countText.innerText = `${filtered.length} community prompts`;
    }

    if (filtered.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500">No community creations yet. Be the first to upload!</div>`;
        if(pagControls) pagControls.classList.add('hidden');
        return;
    }

    const itemsPerPage = 8;
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    if(window.appState.currentUserPage > totalPages) {
        window.appState.currentUserPage = totalPages || 1;
    }

    const startIndex = (window.appState.currentUserPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    if (filtered.length > itemsPerPage) {
        if(pagControls) pagControls.classList.remove('hidden');
        const btnPrev = document.getElementById('userBtnPrev');
        const btnNext = document.getElementById('userBtnNext');
        const pageNumber = document.getElementById('userPageNumber');

        if (window.appState.currentUserPage === 1) {
            if(btnPrev) btnPrev.classList.add('hidden');
        } else {
            if(btnPrev) btnPrev.classList.remove('hidden');
        }

        if (window.appState.currentUserPage === totalPages) {
            if(btnNext) btnNext.classList.add('hidden');
        } else {
            if(btnNext) btnNext.classList.remove('hidden');
        }

        if(pageNumber) pageNumber.innerText = `${window.appState.currentUserPage} / ${totalPages}`;
    } else {
        if(pagControls) pagControls.classList.add('hidden');
    }

    paginatedItems.forEach(p => {
        const card = document.createElement('article'); 
        card.className = "relative overflow-hidden aspect-[2/3] rounded-[1.5rem] bg-slate-100 dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 transition cursor-pointer group flex flex-col justify-end text-slate-100";
        card.onclick = () => window.openUserPromptDetail(p.id);

        const finalUrl = p.imageURL;
        let displayTitle = searchVal ? window.highlightText(p.title, searchVal) : p.title;

        card.innerHTML = `
            <img src="${finalUrl}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300">
            <span class="absolute top-3 right-3 bg-purple-600/90 backdrop-blur text-[8px] px-2.5 py-0.5 rounded-full font-bold text-white z-10 shadow-sm">
                <i class="fa-solid fa-user"></i> Community
            </span>
            <div class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/45 to-transparent flex flex-col justify-end min-h-[50%] rounded-b-[1.5rem] pointer-events-none z-10">
                <h4 class="text-sm font-bold text-white leading-snug line-clamp-2">${displayTitle}</h4>
                <div class="flex justify-between items-center mt-1.5 text-[9px] text-slate-300 font-semibold">
                    <span><i class="fa-regular fa-eye mr-1"></i>${formatCoins(p.views || 0)} views</span>
                    <span>#${p.tags || 'General'}</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
};

window.renderVideoPrompts = function() {
    const container = document.getElementById('videoPromptsContainer');
    if (!container) return; 
    container.innerHTML = '';
    
    const videoPrompts = window.appState.promptsList.filter(p => p.mediaType === 'video' || (p.imageURL && p.imageURL.match(/\.(mp4|webm|ogg)$/i)));
    videoPrompts.sort((a, b) => b.timestamp - a.timestamp);
    
    if (videoPrompts.length === 0) {
        container.innerHTML = '<div class="text-slate-500 text-sm py-4 w-full text-center">No video prompts uploaded yet.</div>';
        return;
    }

    videoPrompts.forEach(p => {
        const isPaid = p.type === 'paid';
        const finalUrl = window.resolveImageSrc(p.imageURL); 
        const finalThumbImg = p.thumbnailURL ? window.resolveImageSrc(p.thumbnailURL) : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';
        
        const card = document.createElement('article');
        card.className = "snap-start shrink-0 w-[85%] md:w-[45%] lg:w-[30%] bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col transition hover:shadow-md cursor-pointer group relative aspect-[16/9]";
        card.onclick = () => window.openPromptDetail(p.id);
        
        card.innerHTML = `
            <video src="${finalUrl}" poster="${finalThumbImg}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-300" muted playsinline preload="none" loop onmouseover="let pl=this.play(); if(pl)pl.catch(()=>{});" onmouseout="this.pause()"></video>
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none z-10"></div>
            <span class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur text-[8px] px-2.5 py-0.5 rounded-full font-bold text-slate-200 z-20">
                ${isPaid ? `<span class="text-amber-400"><i class="fa-solid fa-coins mr-1"></i>${formatCoins(p.priceCoins)}</span>` : 'Free'}
            </span>
            <div class="absolute bottom-3 left-3 right-3 z-20 flex flex-col pointer-events-none">
                <span class="text-[9px] bg-brand-500/20 text-brand-400 font-bold px-2 py-0.5 rounded-full uppercase w-fit mb-1 border border-brand-500/30"><i class="fa-solid fa-video mr-1"></i>${p.tags || 'Video'}</span>
                <h3 class="text-sm font-bold text-white line-clamp-1">${p.title}</h3>
            </div>
            <button class="absolute inset-0 m-auto w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-20 shadow">
                <i class="fa-solid fa-play text-white"></i>
            </button>
        `;
        container.appendChild(card);
    });
};

window.changePage = function(direction) {
    window.appState.currentPage += direction;
    renderPrompts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.changeUserPage = function(direction) {
    window.appState.currentUserPage += direction;
    window.renderUserPrompts();
};

window.filterCategory = function(cat) {
    window.appState.currentFilter = cat;
    window.appState.currentPage = 1; 
    document.querySelectorAll('.category-btn').forEach(btn => {
        if (btn.getAttribute('data-category') === cat) {
            btn.className = "category-btn bg-brand-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shadow-sm";
        } else {
            btn.className = "category-btn bg-white border border-slate-200 hover:border-brand-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-brand-500 px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition text-slate-955 dark:text-slate-100";
        }
    });
    renderPrompts();
};

// Modal for Admin Verified Prompts
window.openPromptDetail = async function(id) {
    const p = window.appState.promptsList.find(item => item.id === id);
    if (!p) return;

    if (p.type === 'paid') {
        const hasUnlocked = window.appState.currentUserData && window.appState.currentUserData.unlockedPrompts && window.appState.currentUserData.unlockedPrompts[p.id];
        const isAdmin = window.appState.currentUser && window.appState.currentUser.email === 'kazimmustafa38@gmail.com';

        if (!hasUnlocked && !isAdmin) {
            if (!window.appState.currentUser) {
                alert("Please log in to purchase premium prompts.");
                window.openAuthModal('login');
                return;
            }

            const price = p.priceCoins;
            const userCoins = window.appState.currentUserData.coins || 0;

            if (userCoins < price) {
                alert(`Insufficient Coins! Costs ${formatCoins(price)} coins.`);
                window.switchTab('wallet');
                return;
            }

            if (confirm(`Unlock "${p.title}" for ${formatCoins(price)} Coins?`)) {
                try {
                    const userCoinsRef = ref(db, `users/${window.appState.currentUser.uid}/coins`);
                    await runTransaction(userCoinsRef, (current) => {
                        return (current || 0) - price;
                    });

                    await set(ref(db, `users/${window.appState.currentUser.uid}/unlockedPrompts/${p.id}`), true);

                    const purchaseLogRef = push(ref(db, `purchaseLogs/${window.appState.currentUser.uid}`));
                    await set(purchaseLogRef, {
                        promptId: p.id,
                        promptTitle: p.title,
                        amountCoins: price,
                        timestamp: Date.now()
                    });

                    alert("Unlocked successfully!");
                } catch (err) {
                    alert("Deduction failed: " + err.message);
                    return;
                }
            } else {
                return; 
            }
        }
    }

    window.appState.currentDetailPrompt = p;
    runTransaction(ref(db, `prompts/${id}/views`), (curr) => { return (curr || p.views || 0) + 1; });
    window.updatePageMetadata(p.title, `Unlock and copy: ${p.title}.`);
    window.openModal('promptDetailModal');

    const finalDetailsImg = window.resolveImageSrc(p.imageURL);
    const isVideo = p.mediaType === 'video' || (p.imageURL && p.imageURL.match(/\.(mp4|webm|ogg)$/i));
    const detailImgEl = document.getElementById('detailImg');

    if (detailImgEl) {
        const parent = detailImgEl.parentNode;
        parent.classList.add('relative'); 
        
        let oldVideo = document.getElementById('detailVideoEl');
        let oldOverlay = document.getElementById('detailThumbOverlay');
        
        if (oldVideo) { 
            oldVideo.pause(); 
            oldVideo.removeAttribute('src'); 
            oldVideo.load(); 
            oldVideo.remove(); 
        }
        if (oldOverlay) {
            oldOverlay.remove();
        }

        if (isVideo) {
            detailImgEl.classList.add('hidden');
            const finalThumbImg = p.thumbnailURL ? window.resolveImageSrc(p.thumbnailURL) : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';
            
            const thumbOverlay = document.createElement('div');
            thumbOverlay.id = 'detailThumbOverlay';
            thumbOverlay.className = "absolute inset-0 w-full h-full z-20 flex items-center justify-center cursor-pointer group bg-slate-900 rounded-xl overflow-hidden shadow-sm";
            thumbOverlay.innerHTML = `
                <img src="${finalThumbImg}" class="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition duration-300" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'">
                <div class="relative w-16 h-16 bg-brand-500/90 text-white rounded-full flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(14,165,233,0.5)] transform group-hover:scale-110 transition duration-300">
                    <i class="fa-solid fa-play ml-1"></i>
                </div>
            `;
            
            const videoEl = document.createElement('video');
            videoEl.id = 'detailVideoEl';
            videoEl.className = "w-full h-full object-cover rounded-xl shadow-inner max-h-[60vh] md:max-h-full bg-slate-950 absolute inset-0 z-10 hidden";
            videoEl.controls = true;
            videoEl.autoplay = false; 
            videoEl.muted = false; 
            videoEl.playsInline = true;
            videoEl.src = finalDetailsImg;

            parent.style.minHeight = '250px';
            parent.insertBefore(videoEl, detailImgEl.nextSibling);
            parent.insertBefore(thumbOverlay, videoEl);

            thumbOverlay.onclick = () => {
                thumbOverlay.classList.add('hidden');
                videoEl.classList.remove('hidden');
                videoEl.play().catch(e => console.warn("Playback error:", e));
            };

        } else {
            detailImgEl.classList.remove('hidden');
            detailImgEl.src = finalDetailsImg;
            detailImgEl.onerror = function() {
                this.onerror = null;
                this.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe';
            };
        }
    }

    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.href = finalDetailsImg || '#';
        if (isVideo) {
            downloadBtn.setAttribute('download', 'video.mp4');
        } else {
            downloadBtn.removeAttribute('download');
        }
    }

    const detailTitle = document.getElementById('detailTitle');
    if (detailTitle) detailTitle.innerText = p.title;

    const detailViews = document.getElementById('detailViews');
    if (detailViews) detailViews.innerText = formatCoins((p.views || 0) + 1);

    const detailTag = document.getElementById('detailTag');
    if (detailTag) detailTag.innerText = p.tags || 'Trending';

    const lockedOverlay = document.getElementById('lockedOverlay');
    if (lockedOverlay) lockedOverlay.classList.add('hidden'); 

    const detailPromptText = document.getElementById('detailPromptText');
    if (detailPromptText) {
        detailPromptText.innerText = p.description;
        if (window.appState.currentUser && window.appState.currentUser.email === 'kazimmustafa38@gmail.com') {
            detailPromptText.innerHTML += `
                <div class="mt-4 pt-4 border-t border-slate-250 dark:border-slate-850 flex gap-2">
                    <button onclick="window.editPrompt('${p.id}'); window.closePromptDetailModal();" class="bg-blue-600 hover:bg-blue-700 text-white text-[10px] px-2 py-1 rounded transition">Edit</button>
                    <button onclick="window.deletePrompt('${p.id}'); window.closePromptDetailModal();" class="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2 py-1 rounded transition">Delete</button>
                </div>
            `;
        }
    }

    const btnArea = document.querySelector('#promptContentArea .flex-wrap');
    if (btnArea && !document.getElementById('promptShareBtn')) {
        const shareBtn = document.createElement('button');
        shareBtn.id = "promptShareBtn";
        shareBtn.onclick = () => window.sharePrompt();
        shareBtn.className = "bg-slate-200 dark:bg-slate-850 hover:bg-slate-300 dark:hover:bg-slate-800 text-xs px-3 py-1.5 rounded-md text-emerald-500 transition font-sans shadow-sm flex items-center gap-1";
        shareBtn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> Share Prompt`;
        btnArea.appendChild(shareBtn);
    }

    // Hide user elements when admin prompt opens
    const adTopContainer = document.getElementById('modalUserAdTop');
    const adBottomContainer = document.getElementById('modalUserAdBottom');
    const socialBtn = document.getElementById('modalUserSocialBtn');
    const aiRegenBtn = document.getElementById('btnAiRegenerateDisplay');

    if (adTopContainer) {
        adTopContainer.innerHTML = '';
        adTopContainer.classList.add('hidden');
    }
    if (adBottomContainer) {
        adBottomContainer.innerHTML = '';
        adBottomContainer.classList.add('hidden');
    }
    if (socialBtn) {
        socialBtn.href = '#';
        socialBtn.classList.add('hidden');
    }
    if (aiRegenBtn) {
        aiRegenBtn.classList.remove('hidden');
    }
};

// Modal For User Uploaded Prompts
window.openUserPromptDetail = async function(id) {
    const p = window.appState.userPromptsList.find(item => item.id === id);
    if (!p) return;

    window.appState.currentDetailPrompt = p;
    runTransaction(ref(db, `userPrompts/${id}/views`), (curr) => { return (curr || p.views || 0) + 1; });
    
    window.updatePageMetadata(p.title, `Community prompt: ${p.title}.`);
    window.openModal('promptDetailModal');

    const finalDetailsImg = p.imageURL;
    const detailImgEl = document.getElementById('detailImg');

    if (detailImgEl) {
        const parent = detailImgEl.parentNode;
        parent.classList.add('relative'); 
        
        let oldVideo = document.getElementById('detailVideoEl');
        let oldOverlay = document.getElementById('detailThumbOverlay');
        
        if (oldVideo) { 
            oldVideo.pause(); 
            oldVideo.removeAttribute('src'); 
            oldVideo.load(); 
            oldVideo.remove(); 
        }
        if (oldOverlay) {
            oldOverlay.remove();
        }
        
        detailImgEl.classList.remove('hidden');
        detailImgEl.src = finalDetailsImg;
    }

    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.href = finalDetailsImg || '#';
        downloadBtn.removeAttribute('download');
    }

    const detailTitle = document.getElementById('detailTitle');
    if (detailTitle) detailTitle.innerText = p.title;

    const detailViews = document.getElementById('detailViews');
    if (detailViews) detailViews.innerText = formatCoins((p.views || 0) + 1);

    const detailTag = document.getElementById('detailTag');
    if (detailTag) detailTag.innerText = p.tags || 'Community';
    
    const lockedOverlay = document.getElementById('lockedOverlay');
    if (lockedOverlay) lockedOverlay.classList.add('hidden'); 

    const detailPromptText = document.getElementById('detailPromptText');
    if (detailPromptText) {
        detailPromptText.innerText = p.description;
    }

    const btnArea = document.querySelector('#promptContentArea .flex-wrap');
    if (btnArea && !document.getElementById('promptShareBtn')) {
        const shareBtn = document.createElement('button');
        shareBtn.id = "promptShareBtn";
        shareBtn.onclick = () => window.sharePrompt();
        shareBtn.className = "bg-slate-200 dark:bg-slate-850 hover:bg-slate-300 dark:hover:bg-slate-800 text-xs px-3 py-1.5 rounded-md text-emerald-500 transition font-sans shadow-sm flex items-center gap-1";
        shareBtn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> Share Prompt`;
        btnArea.appendChild(shareBtn);
    }

    // INJECT ADSTERRA AND SOCIAL LINKS
    const adTopContainer = document.getElementById('modalUserAdTop');
    const adBottomContainer = document.getElementById('modalUserAdBottom');
    const socialBtn = document.getElementById('modalUserSocialBtn');
    const aiRegenBtn = document.getElementById('btnAiRegenerateDisplay');

    if (adTopContainer) {
        if (p.adsterraBanner) {
            window.injectHtmlWithScripts('modalUserAdTop', p.adsterraBanner);
            adTopContainer.classList.remove('hidden');
        } else {
            adTopContainer.innerHTML = '';
            adTopContainer.classList.add('hidden');
        }
    }

    if (adBottomContainer) {
        if (p.adsterraNative) {
            window.injectHtmlWithScripts('modalUserAdBottom', p.adsterraNative);
            adBottomContainer.classList.remove('hidden');
        } else {
            adBottomContainer.innerHTML = '';
            adBottomContainer.classList.add('hidden');
        }
    }

    if (socialBtn) {
        if (p.socialLink) {
            socialBtn.href = p.socialLink;
            socialBtn.classList.remove('hidden');
        } else {
            socialBtn.href = '#';
            socialBtn.classList.add('hidden');
        }
    }

    if(aiRegenBtn) {
        aiRegenBtn.classList.add('hidden');
    }
};

window.copyToClipboard = function() {
    if (!window.appState.currentDetailPrompt) return;
    const text = document.getElementById('detailPromptText').innerText;
    if (window.appState.currentDetailPrompt.type === 'paid') {
        const hasUnlocked = window.appState.currentUserData && window.appState.currentUserData.unlockedPrompts && window.appState.currentUserData.unlockedPrompts[window.appState.currentDetailPrompt.id];
        const isAdmin = window.appState.currentUser && window.appState.currentUser.email === 'kazimmustafa38@gmail.com';
        if (!hasUnlocked && !isAdmin) {
            alert("Please unlock first.");
            return;
        }
    }
    window.safeCopy(text);
};

window.regeneratePromptWithAI = async function() {
    if (!window.appState.currentUser) {
        alert("Please log in.");
        window.openAuthModal('login');
        return;
    }

    const cost = 50000;
    const userCoins = window.appState.currentUserData.coins || 0;

    if (userCoins < cost) {
        alert(`Insufficient Balance! Costs ${formatCoins(cost)} coins.`);
        window.closePromptDetailModal();
        window.switchTab('wallet');
        return;
    }

    const apiSnap = await get(ref(db, 'settings/geminiApiKey'));
    if (!apiSnap.exists() || !apiSnap.val()) {
        alert("AI Engine is currently offline.");
        return;
    }
    const apiKey = apiSnap.val();

    const selectedStyle = document.getElementById('aiStyle').value;
    const selectedLighting = document.getElementById('aiLighting').value;
    const selectedLength = document.getElementById('aiLength').value;
    const selectedStrength = document.getElementById('aiStrength').value;

    const originalPromptText = window.appState.currentDetailPrompt ? window.appState.currentDetailPrompt.description : "";

    const structuredInstructionPrompt = `
        Analyze original prompt: "${originalPromptText}". Expand with selected features: Style: ${selectedStyle}, Lighting: ${selectedLighting}, Length: ${selectedLength}, Strength: ${selectedStrength}. Return enhanced prompt ONLY without any extra chat.
    `;

    if (confirm(`Regenerate for 50,000 Coins?`)) {
        const btn = document.getElementById('btnGenerateAI');
        const outContainer = document.getElementById('aiOutputContainer');
        const outText = document.getElementById('aiOutputText');

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Generating...`;
        outContainer.classList.remove('hidden');
        outText.innerText = "Connecting...";

        let logId = "";
        let purchaseLogRef = null;

        try {
            const userCoinsRef = ref(db, `users/${window.appState.currentUser.uid}/coins`);
            await runTransaction(userCoinsRef, (current) => {
                return (current || 0) - cost;
            });

            logId = push(ref(db, `purchaseLogs/${window.appState.currentUser.uid}`)).key;
            purchaseLogRef = ref(db, `purchaseLogs/${window.appState.currentUser.uid}/${logId}`);
            await set(purchaseLogRef, {
                promptId: window.appState.currentDetailPrompt.id || "ai-regenerate",
                promptTitle: `AI Generation: ${window.appState.currentDetailPrompt.title || "Custom Prompt"}`,
                amountCoins: cost,
                timestamp: Date.now()
            });

            const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
            let apiSuccess = false;
            let generatedResponseText = "";

            for (let modelName of models) {
                outText.innerText = `Analyzing prompt structure...`;
                try {
                    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                    const response = await fetch(endpoint, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: structuredInstructionPrompt
                                }]
                            }]
                        })
                    });

                    if (response.ok) {
                        const resJson = await response.json();
                        generatedResponseText = resJson.candidates[0].content.parts[0].text;
                        apiSuccess = true;
                        break;
                    }
                } catch (err) {
                    console.warn("Retrying model...");
                }
            }

            if (apiSuccess) {
                outText.innerText = generatedResponseText;
                alert("AI prompt successfully regenerated!");
            } else {
                const refundCoinsRef = ref(db, `users/${window.appState.currentUser.uid}/coins`);
                await runTransaction(refundCoinsRef, (current) => {
                    return (current || 0) + cost;
                });

                if (purchaseLogRef) {
                    await update(purchaseLogRef, {
                        promptTitle: `AI Generation (Failed - Refunded)`
                    });
                }

                outText.innerText = `Servers busy. Refunded successfully.`;
                alert("Servers busy. Coins fully refunded!");
            }

        } catch (err) {
            alert("Failed: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-play"></i> Generate with PromptKaro AI 🚀`;
        }
    }
};

window.copyAiOutput = function() {
    const text = document.getElementById('aiOutputText').innerText;
    if(!text || text.startsWith("Connecting") || text.startsWith("Error")) {
        alert("Nothing valid to copy.");
        return;
    }
    window.safeCopy(text);
};
