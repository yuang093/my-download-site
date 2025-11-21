import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Eye, 
  FileText, 
  Plus, 
  Settings, 
  Trash2, 
  Edit, 
  ArrowLeft, 
  BarChart3, 
  ExternalLink,
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  Loader2,
  FileSpreadsheet,
  FileUp
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics"; // 新增：匯入 Analytics
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

// Firebase 初始化設定
// 邏輯：如果是預覽環境(有 __firebase_config)則使用預覽設定；否則使用您提供的設定(正式環境)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyCcF4vyGDPIr9QLGZbSjIVVYSLKLqXIVmk",
  authDomain: "tydl-5add9.firebaseapp.com",
  projectId: "tydl-5add9",
  storageBucket: "tydl-5add9.firebasestorage.app",
  messagingSenderId: "333114709592",
  appId: "1:333114709592:web:b2b7d010dca81ba5ce1c2d",
  measurementId: "G-6YCGZ45QGQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (加入錯誤處理以防在非瀏覽器環境報錯)
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics initialized failed (might be in a restricted environment):", e);
}

const auth = getAuth(app);
const db = getFirestore(app);

// 資料庫集合 ID (如果在預覽環境使用系統 ID，如果在正式環境使用自訂 ID 'public-downloads')
const appId = typeof __app_id !== 'undefined' ? __app_id : 'public-downloads';

const ADMIN_PASSWORD = "@113cctv";

export default function App() {
  // 狀態管理
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('home'); // home, create, admin, detail
  const [selectedItem, setSelectedItem] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({ title: '', url: '', description: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [notification, setNotification] = useState(null);
  
  // 檔案上傳參考
  const fileInputRef = useRef(null);

  // 1. 初始化 Auth
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // 如果已經有使用者登入，就不需要再執行登入動作
        if (auth.currentUser) {
          console.log("User already signed in");
          if (isMounted) {
            setUser(auth.currentUser);
            setLoading(false);
          }
          return;
        }

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          console.log("Signing in with custom token...");
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          console.log("Signing in anonymously...");
          try {
            await signInAnonymously(auth);
          } catch (anonError) {
            // 這裡我們特別處理 configuration-not-found 錯誤，讓它不會變成紅色錯誤
            console.warn("Anonymous auth skipped (not configured):", anonError.message);
          }
        }
      } catch (error) {
        if (error?.code !== 'auth/configuration-not-found') {
           console.error("Auth initialization warning:", error);
        }
        if (isMounted) {
           showNotification("系統以受限模式運行", "warning");
        }
      } finally {
        if (isMounted) {
          setTimeout(() => setLoading(false), 500);
        }
      }
    };
    
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isMounted) {
        setUser(currentUser);
        if (currentUser) {
          setLoading(false);
        }
      }
    });
    
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // 2. 監聽 Firestore 資料
  useEffect(() => {
    // 必須要有 user 才能讀取資料
    if (!user) return;

    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'downloads'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // 在前端進行排序
      fetchedItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      setItems(fetchedItems);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      if (error.code !== 'permission-denied') {
        showNotification("讀取資料失敗", "error");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 顯示通知
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // 統計數據
  const totalItems = items.length;
  const totalVisits = items.reduce((acc, item) => acc + (item.visits || 0), 0);
  const totalDownloads = items.reduce((acc, item) => acc + (item.downloads || 0), 0);

  // 頁面導航
  const navigateTo = async (page, item = null) => {
    if (page === 'detail' && item) {
      // 增加訪問次數 (寫入資料庫)
      if (user) {
        try {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'downloads', item.id);
          await updateDoc(docRef, {
            visits: (item.visits || 0) + 1
          });
        } catch (error) {
          console.error("Error updating visits:", error);
        }
      }
      setSelectedItem(item);
    }
    setCurrentPage(page);
    setLoginError('');
    setPasswordInput('');
  };

  // 下載處理
  const handleDownload = async (item) => {
    if (user) {
      try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'downloads', item.id);
        await updateDoc(docRef, {
          downloads: (item.downloads || 0) + 1
        });
      } catch (error) {
        console.error("Error updating downloads:", error);
      }
    }
    
    window.open(item.url, '_blank');
    showNotification('系統正在啟動下載...', 'success');
  };

  // 匯出 CSV 功能
  const handleExport = () => {
    if (items.length === 0) {
      showNotification('目前沒有資料可以匯出', 'error');
      return;
    }

    // 定義 CSV 標頭
    const headers = ['ID', '主旨', '連結', '說明', '訪問次數', '下載次數', '建立時間'];
    
    // 轉換資料為 CSV 格式
    const csvContent = [
      headers.join(','),
      ...items.map(item => {
        return [
          `"${item.id}"`,
          `"${(item.title || '').replace(/"/g, '""')}"`, // 處理內容中的雙引號
          `"${(item.url || '').replace(/"/g, '""')}"`,
          `"${(item.description || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`, // 處理換行
          item.visits || 0,
          item.downloads || 0,
          `"${new Date(item.createdAt).toISOString()}"`
        ].join(',');
      })
    ].join('\n');

    // 加入 BOM (\uFEFF)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // 建立臨時下載連結並點擊
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `resources_backup_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('CSV 檔案匯出成功');
  };

  // 匯入 CSV 相關邏輯
  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  // 解析 CSV 單行
  const parseCSVLine = (line) => {
    const result = [];
    let startValueIndex = 0;
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        let value = line.substring(startValueIndex, i).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1).replace(/""/g, '"');
        }
        result.push(value);
        startValueIndex = i + 1;
      }
    }
    let value = line.substring(startValueIndex).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }
    result.push(value);
    
    return result;
  };

  const handleFileImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!user) {
        showNotification('未連線到資料庫，無法匯入', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const content = text.startsWith('\uFEFF') ? text.slice(1) : text;
        const lines = content.split(/\r\n|\n/).filter(line => line.trim() !== '');
        
        if (lines.length < 2) {
          showNotification('CSV 檔案格式錯誤或是空的', 'error');
          return;
        }

        let successCount = 0;
        let errorCount = 0;

        for (let i = 1; i < lines.length; i++) {
          try {
            const row = parseCSVLine(lines[i]);
            if (row.length < 3) continue;

            const [id, title, url, description, visits, downloads, createdAt] = row;

            const itemData = {
              title: title || '未命名',
              url: url || '#',
              description: description || '',
              visits: parseInt(visits) || 0,
              downloads: parseInt(downloads) || 0,
              createdAt: createdAt || new Date().toISOString()
            };

            if (id && id.trim() !== '') {
               await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'downloads', id), itemData);
            } else {
               await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'downloads'), itemData);
            }
            successCount++;
          } catch (err) {
            console.error("Row import error:", err);
            errorCount++;
          }
        }
        
        showNotification(`匯入完成: 成功 ${successCount} 筆, 失敗 ${errorCount} 筆`);
        event.target.value = '';
        
      } catch (error) {
        console.error("Import error:", error);
        showNotification('讀取檔案發生錯誤', 'error');
      }
    };
    reader.readAsText(file);
  };

  // 登入處理
  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setLoginError('');
      showNotification('權限驗證通過');
    } else {
      setLoginError('存取被拒：密碼錯誤');
    }
  };

  // 提交表單
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.url) {
      showNotification('錯誤：欄位不完整', 'error');
      return;
    }
    
    if (!user) {
        showNotification('無法連接資料庫，請檢查網路或重整', 'error');
        return;
    }

    try {
      if (isEditing && formData.id) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'downloads', formData.id);
        await updateDoc(docRef, {
          title: formData.title,
          url: formData.url,
          description: formData.description,
        });
        showNotification('資料更新完畢');
        setIsEditing(false);
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'downloads'), {
          title: formData.title,
          url: formData.url,
          description: formData.description,
          visits: 0,
          downloads: 0,
          createdAt: new Date().toISOString()
        });
        showNotification('新節點建立成功');
      }
      
      setFormData({ title: '', url: '', description: '' });
      if (isEditing) {
        setCurrentPage('admin');
      } else {
        setCurrentPage('home');
      }
    } catch (error) {
      console.error("Error saving document:", error);
      showNotification('儲存失敗，請稍後再試', 'error');
    }
  };

  // 刪除處理
  const handleDeleteClick = (id) => setDeleteId(id);
  const confirmDelete = async () => {
    if (deleteId) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'downloads', deleteId));
        showNotification('目標已從系統移除');
        setDeleteId(null);
      } catch (error) {
        console.error("Error deleting document:", error);
        showNotification('刪除失敗', 'error');
      }
    }
  };

  const startEdit = (item) => {
    setFormData(item);
    setIsEditing(true);
    setCurrentPage('create');
  };

  // --- UI 元件 ---

  // 導航列
  const Navbar = () => (
    <nav className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 shadow-[0_4px_20px_-5px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div 
            className="flex items-center space-x-2 font-bold text-xl cursor-pointer group"
            onClick={() => navigateTo('home')}
          >
            <div className="p-1.5 rounded bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors">
              <Zap className="h-6 w-6 text-cyan-400 group-hover:text-cyan-300 group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-wide">NEXUS DL</span>
          </div>
          <div className="flex space-x-2 md:space-x-4">
            <button 
              onClick={() => navigateTo('home')}
              className={`px-4 py-2 rounded text-sm font-medium transition-all duration-300 border ${currentPage === 'home' ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              監控儀表板
            </button>
            <button 
              onClick={() => {
                setIsEditing(false);
                setFormData({ title: '', url: '', description: '' });
                setCurrentPage('create');
              }}
              className={`px-4 py-2 rounded text-sm font-medium transition-all duration-300 border ${currentPage === 'create' ? 'bg-purple-500/10 border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              建立節點
            </button>
            <button 
              onClick={() => navigateTo('admin')}
              className={`flex items-center px-4 py-2 rounded text-sm font-medium transition-all duration-300 border ${currentPage === 'admin' ? 'bg-rose-500/10 border-rose-500/50 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
            >
              <Settings className="h-4 w-4 mr-1" />
              核心管理
            </button>
          </div>
        </div>
      </div>
    </nav>
  );

  // 統計卡片
  const StatCard = ({ title, value, icon: Icon, colorClass, borderClass }) => (
    <div className={`relative group bg-slate-800/40 backdrop-blur-sm p-6 rounded-xl border border-slate-700 overflow-hidden transition-all duration-300 hover:bg-slate-800/60 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,0,0,0.3)] ${borderClass}`}>
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>
      <div className="flex justify-between items-center relative z-10">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">{title}</p>
          <p className={`text-3xl font-bold mt-2 font-mono ${colorClass}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-lg bg-slate-900/50 border border-slate-700 ${colorClass} group-hover:shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-shadow`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-200 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* 背景裝飾 */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20" 
           style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #334155 1px, transparent 0)', backgroundSize: '40px 40px' }}>
      </div>
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-[#0B0F19]/80 to-[#0B0F19] z-0 pointer-events-none"></div>
      
      <div className="relative z-10">
        <Navbar />

        <main className="max-w-7xl mx-auto px-4 py-8 md:py-12">
          {/* 通知 */}
          {notification && (
            <div className={`fixed top-24 right-4 px-6 py-3 rounded border backdrop-blur-md shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center animate-fade-in-down z-50 ${
              notification.type === 'error' 
                ? 'bg-red-900/80 border-red-500/50 text-red-200' 
                : 'bg-emerald-900/80 border-emerald-500/50 text-emerald-200'
            }`}>
              {notification.type === 'error' ? <XCircle className="h-5 w-5 mr-3" /> : <CheckCircle className="h-5 w-5 mr-3" />}
              <span className="font-mono text-sm tracking-wide">{notification.message}</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
             <div className="fixed inset-0 bg-[#0B0F19] z-[100] flex items-center justify-center flex-col">
               <Loader2 className="h-12 w-12 text-cyan-500 animate-spin mb-4" />
               <p className="text-cyan-400 font-mono text-sm animate-pulse">INITIALIZING SYSTEM...</p>
             </div>
          )}

          {/* 刪除 Modal */}
          {deleteId && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
              <div className="bg-slate-900 rounded-2xl p-1 p-[1px] bg-gradient-to-br from-red-500/50 to-transparent shadow-[0_0_40px_rgba(239,68,68,0.2)] w-full max-w-sm">
                <div className="bg-slate-900 rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent"></div>
                  <div className="flex items-center mb-4 text-red-500">
                    <AlertTriangle className="h-7 w-7 mr-3 animate-pulse" />
                    <h3 className="text-xl font-bold tracking-wide">警告：刪除操作</h3>
                  </div>
                  <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                    即將永久移除此資料節點。<br/>
                    <span className="text-red-400 font-mono text-xs border border-red-900/50 bg-red-900/20 px-2 py-1 rounded mt-2 inline-block">此操作無法復原</span>
                  </p>
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => setDeleteId(null)}
                      className="flex-1 px-4 py-3 border border-slate-700 text-slate-300 font-medium rounded-lg hover:bg-slate-800 hover:border-slate-600 transition"
                    >
                      取消
                    </button>
                    <button 
                      onClick={confirmDelete}
                      className="flex-1 px-4 py-3 bg-red-600/20 border border-red-600/50 text-red-400 font-bold rounded-lg hover:bg-red-600 hover:text-white shadow-[0_0_15px_rgba(220,38,38,0.2)] hover:shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-all duration-300 flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      確認刪除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 首頁 */}
          {currentPage === 'home' && (
            <div className="space-y-10 animate-fade-in">
              {/* 儀表板 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                  title="資料節點總數" 
                  value={totalItems} 
                  icon={FileText} 
                  colorClass="text-blue-400" 
                  borderClass="hover:border-blue-500/50"
                />
                <StatCard 
                  title="累計訪問流量" 
                  value={totalVisits} 
                  icon={Eye} 
                  colorClass="text-purple-400" 
                  borderClass="hover:border-purple-500/50"
                />
                <StatCard 
                  title="資源下載次數" 
                  value={totalDownloads} 
                  icon={Download} 
                  colorClass="text-emerald-400" 
                  borderClass="hover:border-emerald-500/50"
                />
                <StatCard 
                  title="系統運行狀態" 
                  value="ONLINE" 
                  icon={BarChart3} 
                  colorClass="text-amber-400" 
                  borderClass="hover:border-amber-500/50"
                />
              </div>

              {/* 列表 (字體已縮小) */}
              <div className="rounded-2xl bg-slate-900/50 border border-slate-800 overflow-hidden backdrop-blur-sm">
                <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                  <h2 className="text-lg font-bold text-white flex items-center tracking-wide">
                    <div className="h-2 w-2 bg-cyan-400 rounded-full mr-3 shadow-[0_0_10px_#22d3ee]"></div>
                    資源列表
                  </h2>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                    TOTAL: {items.length}
                  </span>
                </div>
                
                {items.length === 0 ? (
                  <div className="p-16 text-center text-slate-600 font-mono">
                    {loading ? (
                      <p>SYNCING DATABASE...</p>
                    ) : (
                      <>
                        <div className="mb-4 text-4xl opacity-20">¯\_(ツ)_/¯</div>
                        <p>NO DATA FOUND. PLEASE INITIATE NEW NODE.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-1 p-2">
                    {items.map((item) => (
                      <div key={item.id} className="group relative bg-slate-800/30 hover:bg-slate-800/80 border border-transparent hover:border-cyan-500/30 rounded-xl p-4 transition-all duration-300 hover:shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                          <div className="flex-1">
                            <h3 className="text-base font-bold text-slate-200 group-hover:text-cyan-300 transition-colors flex items-center">
                              {item.title}
                            </h3>
                            <p className="text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed max-w-2xl border-l-2 border-slate-700 pl-3">
                              {item.description}
                            </p>
                            <div className="flex items-center mt-2 space-x-6 text-[10px] font-mono text-slate-500">
                              <span className="flex items-center"><Eye className="h-3 w-3 mr-1.5 text-purple-500" /> {item.visits}</span>
                              <span className="flex items-center"><Download className="h-3 w-3 mr-1.5 text-emerald-500" /> {item.downloads}</span>
                              <span className="text-slate-600">{new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => navigateTo('detail', item)}
                            className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-500 font-bold text-xs hover:bg-cyan-500 hover:text-white hover:border-cyan-500 hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all duration-300 flex items-center justify-center min-w-[100px]"
                          >
                            <span>ACCESS</span>
                            <ArrowLeft className="h-3 w-3 ml-2 rotate-180" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 詳情頁 */}
          {currentPage === 'detail' && selectedItem && items.find(i => i.id === selectedItem.id) && (
            <div className="max-w-4xl mx-auto animate-fade-in">
              <button 
                onClick={() => navigateTo('home')}
                className="mb-8 flex items-center text-slate-500 hover:text-cyan-400 transition group font-mono text-sm"
              >
                <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" /> 
                BACK_TO_LIST
              </button>

              <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
                {/* 頂部裝飾線 */}
                <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600"></div>
                
                <div className="p-8 md:p-12">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
                      {items.find(i => i.id === selectedItem.id).title}
                    </h1>
                    <div className="flex space-x-2 mt-4 md:mt-0">
                      <span className="px-3 py-1 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs font-mono flex items-center">
                        VISITS: {items.find(i => i.id === selectedItem.id).visits}
                      </span>
                      <span className="px-3 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-mono flex items-center">
                        DL: {items.find(i => i.id === selectedItem.id).downloads}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-950/50 rounded-xl p-6 border border-slate-800 mb-10">
                    <h3 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wider flex items-center">
                      <FileText className="h-4 w-4 mr-2" /> 
                      Description
                    </h3>
                    <p className="text-slate-300 leading-relaxed whitespace-pre-wrap font-light text-lg">
                      {items.find(i => i.id === selectedItem.id).description || "無詳細數據"}
                    </p>
                  </div>

                  <div className="flex flex-col items-center text-center space-y-6">
                    <button 
                      onClick={() => handleDownload(items.find(i => i.id === selectedItem.id))}
                      className="group relative w-full md:w-auto px-10 py-5 bg-cyan-600/20 text-cyan-400 font-bold text-lg rounded-xl overflow-hidden transition-all duration-300 hover:bg-cyan-500 hover:text-white hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] border border-cyan-500/50"
                    >
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer"></div>
                      <span className="relative flex items-center justify-center">
                        <Download className="h-6 w-6 mr-3" />
                        INITIATE DOWNLOAD
                      </span>
                    </button>
                    
                    <div className="font-mono text-xs text-slate-600 max-w-full break-all bg-slate-950 px-4 py-2 rounded border border-slate-800">
                      TARGET_URL: {items.find(i => i.id === selectedItem.id).url}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 新增/編輯 */}
          {currentPage === 'create' && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl"></div>
                
                <h2 className="text-2xl font-bold text-white mb-8 flex items-center relative z-10">
                  {isEditing ? <Edit className="h-6 w-6 mr-3 text-purple-400" /> : <Plus className="h-6 w-6 mr-3 text-cyan-400" />}
                  <span className="tracking-wide">{isEditing ? '編輯節點參數' : '建立新資源節點'}</span>
                </h2>
                
                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                  <div className="group">
                    <label className="block text-xs font-mono text-cyan-400 mb-2 uppercase">Subject Title</label>
                    <input 
                      type="text" 
                      value={formData.title}
                      onChange={(e) => setFormData({...formData, title: e.target.value})}
                      placeholder="輸入主旨..."
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all placeholder-slate-700"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-cyan-400 mb-2 uppercase">Resource URL</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <ExternalLink className="h-4 w-4 text-slate-600" />
                      </div>
                      <input 
                        type="url" 
                        value={formData.url}
                        onChange={(e) => setFormData({...formData, url: e.target.value})}
                        placeholder="https://..."
                        className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg pl-10 pr-4 py-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all placeholder-slate-700 font-mono text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-cyan-400 mb-2 uppercase">Description</label>
                    <textarea 
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="輸入詳細說明內容..."
                      rows="5"
                      className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-4 py-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 outline-none transition-all placeholder-slate-700 resize-none"
                    ></textarea>
                  </div>

                  <div className="pt-6 flex space-x-4">
                    <button 
                      type="button" 
                      onClick={() => isEditing ? setCurrentPage('admin') : setCurrentPage('home')}
                      className="flex-1 px-4 py-3 border border-slate-700 text-slate-400 font-medium rounded-lg hover:bg-slate-800 transition"
                    >
                      取消操作
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 px-4 py-3 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 font-bold rounded-lg hover:bg-cyan-600 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all"
                    >
                      {isEditing ? '更新節點' : '發布節點'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 管理後台 */}
          {currentPage === 'admin' && (
            <div className="max-w-6xl mx-auto animate-fade-in">
              {!isAdmin ? (
                // 登入
                <div className="max-w-md mx-auto mt-20 relative">
                  <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full opacity-20"></div>
                  <div className="bg-slate-900/90 backdrop-blur-xl p-10 rounded-2xl border border-slate-700 shadow-2xl relative z-10 text-center">
                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-700 shadow-inner">
                      <Lock className="h-8 w-8 text-cyan-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-wider">安全驗證</h2>
                    <p className="text-slate-500 mb-8 text-sm font-mono">RESTRICTED AREA. AUTHORIZATION REQUIRED.</p>
                    
                    <form onSubmit={handleLogin}>
                      <input 
                        type="password" 
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="ENTER PASSCODE"
                        className="w-full bg-slate-950 text-center text-xl text-white border border-slate-700 rounded-lg py-4 mb-6 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none tracking-[0.5em] placeholder-slate-800 transition-all"
                        autoFocus
                      />
                      {loginError && (
                        <div className="mb-6 p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs font-mono flex items-center justify-center">
                          <AlertTriangle className="h-3 w-3 mr-2" />
                          {loginError}
                        </div>
                      )}
                      <button 
                        type="submit"
                        className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all duration-300 tracking-widest"
                      >
                        LOGIN
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                // 管理列表
                <div className="space-y-8">
                  <div className="flex flex-wrap justify-between items-center bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white flex items-center">
                        <Settings className="h-6 w-6 mr-3 text-rose-500 animate-spin-slow" />
                        CORE_ADMIN
                      </h2>
                      <p className="text-slate-500 text-xs mt-2 font-mono">ROOT ACCESS GRANTED. SYSTEM READY.</p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleFileImport}
                        accept=".csv"
                        className="hidden"
                      />
                      <button 
                        onClick={handleImportClick}
                        className="px-5 py-2 bg-blue-600/20 text-blue-400 rounded border border-blue-600/50 hover:bg-blue-600 hover:text-white transition-all text-sm flex items-center font-mono shadow-lg shadow-blue-900/20"
                      >
                        <FileUp className="h-4 w-4 mr-2" /> IMPORT CSV
                      </button>
                      <button 
                        onClick={handleExport}
                        className="px-5 py-2 bg-emerald-600/20 text-emerald-400 rounded border border-emerald-600/50 hover:bg-emerald-600 hover:text-white transition-all text-sm flex items-center font-mono shadow-lg shadow-emerald-900/20"
                      >
                        <FileSpreadsheet className="h-4 w-4 mr-2" /> EXPORT CSV
                      </button>
                      <button 
                        onClick={() => setIsAdmin(false)}
                        className="px-5 py-2 bg-slate-800 text-slate-400 rounded border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-500 transition-all text-sm flex items-center font-mono"
                      >
                        <Unlock className="h-3 w-3 mr-2" /> LOGOUT
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-slate-950 border-b border-slate-800">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-mono text-cyan-500 uppercase tracking-wider">Subject</th>
                            <th className="px-6 py-4 text-left text-xs font-mono text-cyan-500 uppercase tracking-wider">Source URL</th>
                            <th className="px-6 py-4 text-center text-xs font-mono text-cyan-500 uppercase tracking-wider">Stats (V/D)</th>
                            <th className="px-6 py-4 text-center text-xs font-mono text-cyan-500 uppercase tracking-wider">Timestamp</th>
                            <th className="px-6 py-4 text-right text-xs font-mono text-cyan-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {items.map((item) => (
                            <tr key={item.id} className="group hover:bg-slate-800/50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-white group-hover:text-cyan-300 transition">{item.title}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-xs font-mono text-slate-500 max-w-xs truncate group-hover:text-slate-300">{item.url}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className="px-2 py-1 text-xs font-mono rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 mr-2">
                                  {item.visits}
                                </span>
                                <span className="px-2 py-1 text-xs font-mono rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {item.downloads}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-center text-xs text-slate-500 font-mono">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button 
                                  onClick={() => startEdit(item)}
                                  className="text-indigo-400 hover:text-indigo-300 mr-4 inline-flex items-center transition hover:scale-110"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteClick(item.id)}
                                  className="text-rose-500 hover:text-rose-400 inline-flex items-center transition hover:scale-110"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {items.length === 0 && (
                            <tr>
                              <td colSpan="5" className="px-6 py-12 text-center text-slate-600 font-mono">
                                // NULL DATA EXCEPTION
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        .animate-spin-slow {
          animation: spin 4s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
        @keyframes fade-in-down {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}