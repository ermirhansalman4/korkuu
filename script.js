// Firebase v10+ (Modular) SDK Importları
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    onSnapshot,
    deleteDoc,
    serverTimestamp,
    updateDoc,
    arrayUnion,
    arrayRemove,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Firebase Config (Yer Tutucu - Kendi bilgilerinizle değiştirin)
const firebaseConfig = {
    apiKey: "AIzaSyA1QMP7SqLod4_GI6lKALxuqYilGLqPS5c",
    authDomain: "korku-forumu.firebaseapp.com",
    projectId: "korku-forumu",
    storageBucket: "korku-forumu.firebasestorage.app",
    messagingSenderId: "127514438054",
    appId: "1:127514438054:web:cd90a4997aa4401cf04767",
    measurementId: "G-CHCE8CWPTH"
};

// Uygulama Başlatma
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// State Yönetimi
let currentUser = null;
let userData = null; // Firestore'daki kullanıcı verisi (role, bio vs.)
let chatUnsubscribe = null;
let currentStoryToDelete = null;
let commentUnsubscribe = null;

// DOM Elementleri Seçimi
const elements = {
    navLinks: document.querySelectorAll('.nav-link'),
    views: document.querySelectorAll('.view'),
    guestControls: document.getElementById('guest-controls'),
    userControls: document.getElementById('user-controls'),
    userDisplayName: document.getElementById('user-display-name'),
    navProfile: document.getElementById('nav-profile'),
    navAdmin: document.getElementById('nav-admin'),
    btnWriteStory: document.getElementById('btn-write-story'),
    chatGuestWarning: document.getElementById('chat-guest-warning'),
    chatWrapper: document.getElementById('chat-wrapper'),
    toastContainer: document.getElementById('toast-container'),

    modals: document.querySelectorAll('.modal'),
    closeBtns: document.querySelectorAll('.close-btn'),
    
    // Atmosferik Elementler
    spotlight: document.getElementById('spotlight'),
    bgMusic: document.getElementById('bg-music'),
    audioToggle: document.getElementById('audio-toggle'),
    audioIcon: document.getElementById('audio-icon'),
};

// ==================== ATMOSFERİK EFEKTLER ====================

// Mouse & Dokunmatik Takibi (Spotlight)
const updateSpotlight = (e) => {
    const x = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const y = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    document.documentElement.style.setProperty('--mouse-x', `${x}px`);
    document.documentElement.style.setProperty('--mouse-y', `${y}px`);
};

document.addEventListener('mousemove', updateSpotlight);
document.addEventListener('touchmove', updateSpotlight);

// Ses Kontrolü
if (elements.audioToggle) {
    elements.audioToggle.addEventListener('click', () => {
        if (elements.bgMusic.paused) {
            elements.bgMusic.play();
            elements.audioToggle.classList.add('active');
            elements.audioIcon.classList.replace('fa-volume-mute', 'fa-volume-up');
            showToast('Karanlığın fısıltılarını duyuyor musun?', 'info');
        } else {
            elements.bgMusic.pause();
            elements.audioToggle.classList.remove('active');
            elements.audioIcon.classList.replace('fa-volume-up', 'fa-volume-mute');
            showToast('Sessizlik bazen daha korkutucudur...');
        }
    });
}

// ==================== UI & NAVİGASYON FONKSİYONLARI ====================

// Sayfa Geçişi
function switchView(targetId) {
    elements.views.forEach(view => view.classList.remove('active'));
    elements.navLinks.forEach(link => link.classList.remove('active', 'text-danger'));

    document.getElementById(targetId).classList.add('active');

    const activeLink = Array.from(elements.navLinks).find(link => link.dataset.target === targetId);
    if (activeLink) {
        activeLink.classList.add('active');
        if (targetId === 'admin-view') activeLink.classList.add('text-danger');
    }

    // Seçili view'a göre verileri yükleme
    if (targetId === 'stories-view') loadStories();
    if (targetId === 'chat-view') initChat();
    if (targetId === 'profile-view' && currentUser) loadProfile();
    if (targetId === 'admin-view' && userData?.role === 'admin') loadAdminPanel();
}

// Nav tıklama olayları
elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = e.currentTarget.dataset.target;
        if(target) switchView(target);
    });
});

window.switchView = switchView;
document.getElementById('btn-hero-stories').addEventListener('click', () => switchView('stories-view'));

// Toggle View by Auth State
function updateUI() {
    if (currentUser) {
        elements.guestControls.classList.add('hidden');
        elements.userControls.classList.remove('hidden');
        elements.userDisplayName.textContent = `Hoşgeldin, ${currentUser.displayName || 'Ruh'}`;
        elements.navProfile.classList.remove('hidden');
        elements.btnWriteStory.classList.remove('hidden');
        elements.chatGuestWarning.classList.add('hidden');
        elements.chatWrapper.classList.remove('hidden');

        if (userData && userData.role === 'admin') {
            elements.navAdmin.classList.remove('hidden');
        } else {
            elements.navAdmin.classList.add('hidden');
        }
    } else {
        elements.guestControls.classList.remove('hidden');
        elements.userControls.classList.add('hidden');
        elements.navProfile.classList.add('hidden');
        elements.navAdmin.classList.add('hidden');
        elements.btnWriteStory.classList.add('hidden');
        elements.chatGuestWarning.classList.remove('hidden');
        elements.chatWrapper.classList.add('hidden');

        // Eğer kullanıcı gizli bir sayfadaysa ana sayfaya at
        const activeView = document.querySelector('.view.active').id;
        if (['profile-view', 'admin-view'].includes(activeView)) {
            switchView('home-view');
        }
    }
}

// Toast Mesajı Gösterme
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Modal Yönetimi
window.openModal = function(modalId) {
    document.getElementById(modalId).classList.add('show');
}

window.closeModal = function() {
    elements.modals.forEach(modal => modal.classList.remove('show'));
}

elements.closeBtns.forEach(btn => {
    btn.addEventListener('click', window.closeModal);
});

// Modal dışına tıklayınca kapatma
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        window.closeModal();
    }
});


// ==================== AUTHENTICATION ====================

// Auth Durumu Dinleyicisi
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // Kullanıcı verisini Firestore'dan çek (role vb. için)
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                userData = userDoc.data();
            } else {
                userData = { role: 'user' }; // Fallback
            }
            updateUI();
        } catch (e) {
            console.error(e);
            updateUI();
        }
    } else {
        currentUser = null;
        userData = null;
        updateUI();
    }
});

// Kayıt Ol
document.getElementById('btn-register-modal').addEventListener('click', () => window.openModal('register-modal'));
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firebase Auth profil güncelleme
        await updateProfile(user, { displayName: username });

        // Firestore users koleksiyonuna ekleme
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            username: filterBadWords(username),
            email: email,
            role: 'user', // Varsayılan yetki
            bio: 'Karanlıkta bekleyen yeni bir ruh...',
            createdAt: serverTimestamp()
        });

        window.closeModal();
        e.target.reset();
        showToast('Ruhun başarıyla bağlandı.');
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Giriş Yap
document.getElementById('btn-login-modal').addEventListener('click', () => window.openModal('login-modal'));
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.closeModal();
        e.target.reset();
        showToast('Karanlığa tekrar hoşgeldin.');
    } catch (error) {
        showToast('Giriş başarısız. Girdiğin bilgiler cehenneme ait değil.', 'error');
    }
});

// Çıkış Yap
document.getElementById('btn-logout').addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Zihnin serbest kaldı.');
    } catch (error) {
        showToast(error.message, 'error');
    }
});


// ==================== HİKAYE SİSTEMİ (FIRESTORE) ====================

document.getElementById('btn-write-story').addEventListener('click', () => {
    document.getElementById('story-form').reset();
    document.getElementById('story-id').value = "";
    document.getElementById('story-modal-title').textContent = "Dehşeti Yaz";
    window.openModal('story-modal');
});

// Hikaye Ekleme / Güncelleme
document.getElementById('story-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('story-title').value;
    const content = document.getElementById('story-content').value;
    const storyId = document.getElementById('story-id').value;

    try {
        if (storyId) {
            // Güncelleme
            const storyRef = doc(db, "stories", storyId);
            await updateDoc(storyRef, {
                title, content
            });
            showToast('Dehşet yeniden şekillendi.');
        } else {
            // Yeni Ekleme
            await addDoc(collection(db, "stories"), {
                title: filterBadWords(title),
                content: filterBadWords(content),
                authorId: currentUser.uid,
                authorName: currentUser.displayName,
                timestamp: serverTimestamp(),
                likes: 0,
                likedBy: [] // array
            });
            showToast('Dehşet dünyaya salındı.');
        }
        window.closeModal();
        switchView('stories-view'); // Yenile
    } catch (error) {
        showToast(error.message, 'error');
    }
});

// Hikayeleri Çekme ve Ekrana Basma
window.storiesMap = {}; // Okuma görünümü için hikaye hafızası

async function loadStories() {
    const container = document.getElementById('stories-container');
    container.innerHTML = '<div class="loading-text">Karanlıktan hikayeler çekiliyor...</div>';

    try {
        const q = query(collection(db, "stories"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        container.innerHTML = '';

        if (querySnapshot.empty) {
            container.innerHTML = '<p>Henüz kimse dehşetini paylaşmaya cesaret edemedi.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const story = docSnap.data();
            const docId = docSnap.id;

            const card = document.createElement('div');
            card.className = 'story-card';

            // Tarih Formatı
            const dateStr = story.timestamp ? new Date(story.timestamp.toDate()).toLocaleDateString('tr-TR') : 'Bilinmeyen Zaman';
            
            // Bilgiyi havuza ekle
            window.storiesMap[docId] = { ...story, docId, dateStr };

            // Beğeni Durumu
            const hasLiked = currentUser && story.likedBy && story.likedBy.includes(currentUser.uid);

            // İşlem Butonları (Sadece yazan kişi veya Admin)
            let actionHtml = '';
            if (currentUser && (story.authorId === currentUser.uid || userData?.role === 'admin')) {
                actionHtml = `
                    <button class="action-btn" title="Sil" onclick="window.confirmDelete('${docId}')"><i class="fas fa-trash"></i></button>
                    ${story.authorId === currentUser.uid ? `<button class="action-btn" title="Düzenle" onclick="window.editStory('${docId}')"><i class="fas fa-edit"></i></button>` : ''}
                `;
            }

            card.innerHTML = `
                <div style="cursor: pointer; padding-bottom: 0.5rem;" onclick="window.readStory('${docId}')">
                    <h3 style="transition: color 0.3s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--blood-red)'">${filterBadWords(story.title)}</h3>
                    <div class="story-meta">
                        <span><i class="fas fa-skull"></i> ${filterBadWords(story.authorName)}</span>
                        <span><i class="far fa-clock"></i> ${dateStr}</span>
                    </div>
                    <div class="story-content-preview">${filterBadWords(story.content)}</div>
                </div>
                <div class="story-actions-bar">
                    <button class="action-btn ${hasLiked ? 'liked' : ''}" onclick="window.toggleLike('${docId}', ${hasLiked})">
                        <i class="fas fa-heart"></i> <span id="like-count-${docId}">${story.likes || 0}</span>
                    </button>
                    <div>${actionHtml}</div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        showToast('Hikayeler çekilirken bir fısıltı koptu. ' + error.message, 'error');
    }
}
// Global olarak erişilebilir fonksiyonlar
window.readStory = (docId) => {
    const story = window.storiesMap[docId];
    if (story) {
        window.currentReadingStoryId = docId; // Yorumlar için sakla
        document.getElementById('read-story-title').textContent = filterBadWords(story.title);
        document.getElementById('read-story-meta').innerHTML = `<i class="fas fa-skull"></i> Yazan: <strong>${filterBadWords(story.authorName)}</strong> &nbsp; | &nbsp; <i class="far fa-clock"></i> ${story.dateStr}`;
        document.getElementById('read-story-content').textContent = filterBadWords(story.content);
        
        let actions = `<span><i class="fas fa-heart text-danger"></i> ${story.likes || 0} Ruh Beğendi</span>`;
        document.getElementById('read-story-actions').innerHTML = actions;

        window.openModal('read-story-modal');

        // Yorumları Yükle
        loadComments(docId);

        // Yorum Formu Görünürlüğü
        const commentForm = document.getElementById('comment-form');
        const guestWarning = document.getElementById('comment-guest-warning');
        if (currentUser) {
            commentForm.classList.remove('hidden');
            guestWarning.classList.add('hidden');
        } else {
            commentForm.classList.add('hidden');
            guestWarning.classList.remove('hidden');
        }
    }
}

// ==================== YORUM SİSTEMİ (FIRESTORE) ====================

async function loadComments(storyId) {
    const container = document.getElementById('comments-container');
    container.innerHTML = '<div class="text-muted text-center">Ruhların fısıltıları dinleniyor...</div>';
    
    if (commentUnsubscribe) commentUnsubscribe();

    const q = query(collection(db, "comments"), where("storyId", "==", storyId) /*, orderBy("timestamp", "asc")*/); // Geçici Index Testi

    commentUnsubscribe = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-muted text-center">Henüz bu dehşete kimse fısıldamadı...</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const comment = docSnap.data();
            const commentId = docSnap.id;
            const dateStr = comment.timestamp ? new Date(comment.timestamp.toDate()).toLocaleString('tr-TR') : 'Bilinmeyen Zaman';
            const isSelf = currentUser && comment.uid === currentUser.uid;

            const div = document.createElement('div');
            div.className = `comment-card ${isSelf ? 'self' : ''}`;
            div.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${filterBadWords(comment.username)}</span>
                    <span class="comment-date">${dateStr}</span>
                </div>
                <div class="comment-text">${filterBadWords(comment.text)}</div>
                ${(isSelf || (userData && userData.role === 'admin')) ? `
                    <div class="comment-actions">
                        <button class="comment-delete-btn" onclick="window.deleteComment('${commentId}')"><i class="fas fa-trash"></i></button>
                    </div>
                ` : ''}
            `;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
}

document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('comment-text');
    const text = input.value.trim();
    const storyId = Object.keys(window.storiesMap).find(id => window.storiesMap[id].title === document.getElementById('read-story-title').textContent);
    
    // Daha güvenli bir storyId alma yöntemi:
    // readStory fonksiyonunda bir data-attribute set edebiliriz ama şimdilik storiesMap üzerinden gidelim.
    // Aslında storyId'yi global bir değişkende tutmak daha mantıklı.
    const activeStoryId = window.currentReadingStoryId;

    if (text && currentUser && activeStoryId) {
        try {
            await addDoc(collection(db, "comments"), {
                storyId: activeStoryId,
                text: filterBadWords(text),
                uid: currentUser.uid,
                username: currentUser.displayName,
                timestamp: serverTimestamp()
            });
            input.value = '';
            showToast('Fısıltın kaydedildi.');
        } catch (e) {
            console.error(e);
            showToast('Fısıltın kayboldu: ' + e.message, 'error');
        }
    }
});

window.deleteComment = async (commentId) => {
    try {
        await deleteDoc(doc(db, "comments", commentId));
        showToast('Yorum karanlığa gömüldü.');
    } catch (e) {
        showToast('Yok etme başarısız.', 'error');
    }
};
window.toggleLike = async (docId, isLiked) => {
    if (!currentUser) {
        showToast('Beğenmek için ruhunu (hesabını) getirmelisin!', 'error');
        return;
    }

    const storyRef = doc(db, "stories", docId);

    try {
        // Optimistic UI update (basit geçici çözüm)
        const likeCountEl = document.getElementById(`like-count-${docId}`);
        const currentCount = parseInt(likeCountEl.textContent);

        if (isLiked) {
            await updateDoc(storyRef, {
                likedBy: arrayRemove(currentUser.uid),
                likes: currentCount - 1
            });
        } else {
            await updateDoc(storyRef, {
                likedBy: arrayUnion(currentUser.uid),
                likes: currentCount + 1
            });
        }
        // Tüm listeyi yeniden yükleyebiliriz sayfayı çok kalabalık yapmamak adına
        loadStories();
    } catch (e) {
        showToast('İşlem başarısız.', 'error');
    }
};

window.editStory = async (docId) => {
    try {
        const docSnap = await getDoc(doc(db, "stories", docId));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('story-id').value = docId;
            document.getElementById('story-title').value = data.title;
            document.getElementById('story-content').value = data.content;
            document.getElementById('story-modal-title').textContent = "Dehşeti Yeniden Yaz";
            openModal('story-modal');
        }
    } catch (e) {
        showToast('Erişilemedi.', 'error');
    }
}

window.confirmDelete = (docId) => {
    currentStoryToDelete = docId;
    window.openModal('delete-modal');
}

// Silme Onayı
document.getElementById('btn-cancel-delete').addEventListener('click', () => {
    currentStoryToDelete = null;
    window.closeModal();
});

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
    if (currentStoryToDelete) {
        try {
            await deleteDoc(doc(db, "stories", currentStoryToDelete));
            showToast('Hikaye sonsuzluğa gömüldü.');
            closeModal();
            loadStories(); // Refresh

            // Eğer     anelindeysek orayı da yenile
            if (document.getElementById('admin-view').classList.contains('active')) {
                loadAdminPanel();
            }
        } catch (e) {
            showToast('Yok etme başarısız: ' + e.message, 'error');
        }
    }
});


// ==================== CHAT SİSTEMİ (REAL-TIME FIRESTORE) ====================

// Küfür Filtresi (Genişletilmiş ve Bypass Korumalı)
const badWords = [
    // Temel Küfürler ve Varyasyonlar
    "am", "amcık", "amcı", "amk", "amına", "amına koyayım", "amına koduğum", "amına koyduğum", 
    "amınakoyayım", "amınakodum", "amına koydum", "amq", "aq", "amqq", "amınaq", "amcik", "amcuk", 
    "amcığ", "amcig", "sik", "siktir", "siktir git", "sikeyim", "sikim", "siktim", "sikik", 
    "siktiriboktan", "siktiğim", "siktiğin", "siik", "siikiyim", "orospu", "orospu çocuğu", 
    "orospu cocugu", "orospu evladı", "orosbu", "orspu", "piç", "piç kurusu", "piçin evladı", 
    "pic", "göt", "götveren", "götlek", "göt lalesi", "got", "g0t", "yarrak", "yarak", "yarra", 
    "yarram", "yarrağım", "yarraa", "ibne", "ibne oğlu ibne", "ibo", "pezevenk", "pezo", 
    "pezvank", "bok", "boktan", "bok gibi", "boka", "bokum", "kaltak", "kalta", "fahişe", 
    "fahiş", "kerhane", "kerhaneci", "götünü sikeyim", "götüne sokayım", "ananı", "ananı sikerim", 
    "ananı sikeyim", "ananı avradını", "anasını sikerim", "anasini sikeyim", "anaskm", "bacını", 
    "bacını sikerim", "kardeşini", "kardeşini sikerim", "karını", "karını sikerim", "eşek", 
    "eşşek", "eşek oğlu eşek", "mal", "malın götü", "mal gibi", "gerizekalı", "geri zekalı", 
    "gerizekali", "öküz", "salak", "aptal", "moron", "beyinsiz", "it", "it oğlu it", "köpek", 
    "hayvan", "hayvan herif", "yavşak", "yavş", "şerefsiz", "şerefsz", "namussuz", "puşt", 
    "kevaşe", "sürtük", "mk", "mq", "skm", "skt", "sktr", "ananıskm", "anasikim", "koduğumun", 
    "kodumun", "koduğum", "kodum", "sülaleni", "sülaleni sikerim", "31 çek", "otuzbir", "31", 
    "zıkkım", "geber", "oç", "oc", "orocu", "oroc", "gavur", "imansız",
    // Bypass Varyasyonları
    "am1na", "amına k0yayım", "amınak0yum", "s1k", "s1keyim", "0rospu", "p1ç", "y4rrak", 
    "yarr4k", "1bne", "pezev3nk", "@mk", "a.m.k", "a-m-k", "n-a-m-u-s-s-u-z", "o.ç", "o-ç"
];

// Uzun kelimeleri önce sıralıyoruz ki "amına koyayım", "amına" dan önce yakalansın
const sortedBadWords = [...badWords].sort((a, b) => b.length - a.length);
const filterRegex = new RegExp(sortedBadWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');

function filterBadWords(text) {
    if (!text) return "";
    return text.replace(filterRegex, (match) => '*'.repeat(match.length));
}

function initChat() {
    if (!currentUser) return;

    const messagesContainer = document.getElementById('chat-messages');

    // Eski dinleyiciyi temizle
    if (chatUnsubscribe) chatUnsubscribe();

    // Sadece bugünün mesajlarını göster (00:00 Resetleme mantığı)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfToday = Timestamp.fromDate(today);

    const q = query(
        collection(db, "messages"), 
        where("timestamp", ">=", startOfToday),
        orderBy("timestamp", "asc")
    );

    chatUnsubscribe = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const div = document.createElement('div');

            const isSelf = msg.uid === currentUser.uid;
            div.className = `chat-msg ${isSelf ? 'self' : ''}`;

            const timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

            div.innerHTML = `
                <div class="chat-header">${msg.username || 'Bilinmeyen'} <span>${timeStr}</span></div>
                <div class="chat-text">${filterBadWords(msg.text)}</div>
            `;
            messagesContainer.appendChild(div);
        });
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();

    if (text && currentUser) {
        input.value = '';
        // Gönderirken de filtreleyelim ki veritabanı temiz kalsın
        const safeText = filterBadWords(text);
        try {
            await addDoc(collection(db, "messages"), {
                text: safeText,
                uid: currentUser.uid,
                username: currentUser.displayName,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            showToast('Mesaj iletilemedi, karanlık çok yoğun.', 'error');
        }
    }
});


// ==================== PROFİL SİSTEMİ ====================

async function loadProfile() {
    if (!currentUser) return;
    document.getElementById('profile-username').textContent = currentUser.displayName || 'Bilinmeyen Ruh';
    document.getElementById('profile-email').textContent = currentUser.email;

    if (userData) {
        document.getElementById('profile-bio').textContent = userData.bio || 'Hakkında bilgi yok.';
    }

    // Avatar Yüklemesi
    const avatarEl = document.querySelector('.profile-avatar');
    if (userData?.photoURL) {
        avatarEl.innerHTML = `<img src="${userData.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else if (currentUser.photoURL) {
        avatarEl.innerHTML = `<img src="${currentUser.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
        avatarEl.innerHTML = '<i class="fas fa-user-ghost"></i>';
    }

    // Kullanıcının Hikayelerini Çek
    const container = document.getElementById('profile-stories-container');
    container.innerHTML = '<div class="loading-text">Kayıtların aranıyor...</div>';

    try {
        const q = query(collection(db, "stories"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        let storyCount = 0;
        container.innerHTML = '';

        snapshot.forEach(docSnap => {
            const story = docSnap.data();
            if (story.authorId === currentUser.uid) {
                storyCount++;
                const div = document.createElement('div');
                div.className = 'story-card';
                window.storiesMap[docSnap.id] = { ...story, docId: docSnap.id };

                div.innerHTML = `
                    <div style="cursor: pointer;" onclick="window.readStory('${docSnap.id}')">
                        <h3>${story.title}</h3>
                        <div class="story-content-preview mt-3">${story.content}</div>
                    </div>
                    <div class="story-actions-bar" style="margin-top: 1rem;">
                        <span><i class="fas fa-heart text-danger"></i> ${story.likes || 0} Beğeni</span>
                        <div>
                            <button class="action-btn" title="Düzenle" onclick="window.editStory('${docSnap.id}')"><i class="fas fa-edit"></i></button>
                            <button class="action-btn" title="Sil" onclick="window.confirmDelete('${docSnap.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `;
                container.appendChild(div);
            }
        });

        document.getElementById('stat-story-count').textContent = storyCount;
        if (storyCount === 0) container.innerHTML = '<p>Henüz bir yara izi bırakmadın...</p>';

    } catch (e) {
        console.error(e);
    }
}

// Profil Düzenleme Modalı
document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('edit-bio').value = userData?.bio || '';
    window.openModal('profile-edit-modal');
});

document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bioText = document.getElementById('edit-bio').value;
    const fileInput = document.getElementById('edit-avatar-file');
    
    if (!currentUser) return;

    showToast('Kaderin güncelleniyor...', 'info');

    try {
        let photoURL = userData?.photoURL || currentUser?.photoURL || null;

        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            // Base64 string formatı için 800KB ideal bir sınırdır (Firestore 1MB limitine takılmamak için)
            if (file.size > 800 * 1024) { 
                showToast('Görsel çok ağır! En fazla 800KB yüklenebilir.', 'error');
                return;
            }

            // CORS hatasını aşmak için Storage yerine Base64 formatına çevirip Firestore'a kaydediyoruz
            showToast('Görsel işleniyor...', 'info');
            photoURL = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = (e) => reject(new Error("Dosya okunamadı"));
                reader.readAsDataURL(file);
            });
        }

        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, {
            bio: bioText,
            photoURL: photoURL
        });
        
        if (!userData) userData = {};
        userData.bio = bioText;
        userData.photoURL = photoURL;
        
        window.closeModal();
        loadProfile();
        
        if(fileInput) fileInput.value = "";
        showToast('Kaderin başarıyla güncellendi.');
    } catch (error) {
        console.error("Profile Update Error:", error);
        showToast('Güncelleme başarısız: ' + error.message, 'error');
    }
});


// ==================== ADMİN ARAF (YÖNETİM PANeli) ====================

async function loadAdminPanel() {
    const tbody = document.getElementById('admin-stories-tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="loading-text">Tüm ruhlar çağrılıyor...</td></tr>';

    try {
        const q = query(collection(db, "stories"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4">Kayıt bulunamadı.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            const story = docSnap.data();
            const dateStr = story.timestamp ? new Date(story.timestamp.toDate()).toLocaleDateString('tr-TR') : 'Bilinmeyen';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${story.title}</strong></td>
                <td>${story.authorName}</td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn btn-danger small-btn" onclick="window.confirmDelete('${docSnap.id}')">
                        <i class="fas fa-skull-crossbones"></i> Yok Et
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Araf çöktü: ' + e.message, 'error');
    }
}

// Mobil Menü Toggle
const mobileToggle = document.querySelector('.mobile-toggle');
const navList = document.getElementById('nav-list');
if (mobileToggle && navList) {
    mobileToggle.addEventListener('click', () => {
        navList.classList.toggle('show');
    });
}
