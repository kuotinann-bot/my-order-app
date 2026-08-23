import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Utensils, 
  Store, 
  X, 
  ChevronRight,
  User,
  Settings,
  Image as ImageIcon
} from 'lucide-react';

// --- 1. Firebase 初始化 ---
// ⚠️ 請務必確認這裡的 apiKey 與設定值是您自己的真實金鑰
const firebaseConfig = {
  apiKey: "AIzaSyCxv5YiEcmgJqOBmC7SlJAoa6etmE9jqto",
  authDomain: "my-order-app-2ad04.firebaseapp.com",
  projectId: "my-order-app-2ad04",
  storageBucket: "my-order-app-2ad04.firebasestorage.app",
  messagingSenderId: "276485020555",
  appId: "1:276485020555:web:0d32d4083a3757f4ed6d8e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-order-app-v2';

// 預設預備菜單（資料庫無資料時自動寫入）
const INITIAL_MENU = [
  {
    name: '招牌牛肉堡',
    category: '主餐',
    price: 180,
    description: '100% 純牛肉漢堡排搭配特製醬汁與新鮮生菜',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '黃金脆薯條',
    category: '點心',
    price: 60,
    description: '金黃酥脆美味薯條，撒上薄鹽',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=80'
  },
  {
    name: '冰紅茶',
    category: '飲料',
    price: 40,
    description: '遵循古法甘醇阿薩姆紅茶，解膩清甜',
    image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500&auto=format&fit=crop&q=80'
  }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('welcome'); // welcome | customer | merchant
  const [customerName, setCustomerName] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [cart, setCart] = useState({});
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [merchantTab, setMerchantTab] = useState('orders'); // orders | menu | restaurantInfo

  // 餐廳設定 State
  const [restaurantName, setRestaurantName] = useState('美味點餐 App');
  const [restaurantBanner, setRestaurantBanner] = useState('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1000&auto=format&fit=crop&q=80');

  // 新增餐點的表單 State
  const [newItem, setNewItem] = useState({
    name: '',
    category: '主餐',
    price: '',
    description: '',
    image: ''
  });

  // 1. Firebase 匿名認證
  useEffect(() => {
    signInAnonymously(auth).then(res => setUser(res.user)).catch(console.error);
  }, []);

  // 2. 監聽「餐廳設定」資料
  useEffect(() => {
    if (!user) return;
    const configRef = doc(db, 'artifacts', appId, 'public', 'restaurant_config');
    const unsubscribe = onSnapshot(configRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.name) setRestaurantName(data.name);
        if (data.banner) setRestaurantBanner(data.banner);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 3. 監聽「菜單」資料（若無資料則上傳預設菜單）
  useEffect(() => {
    if (!user) return;
    const menuRef = collection(db, 'artifacts', appId, 'public', 'data', 'menu');
    const unsubscribe = onSnapshot(menuRef, async (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // 若資料庫完全沒有菜單，寫入初始菜單
      if (items.length === 0) {
        for (const item of INITIAL_MENU) {
          await addDoc(menuRef, item);
        }
      } else {
        setMenuItems(items);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 4. 即時監聽「訂單」資料
  useEffect(() => {
    if (!user) return;
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
      const docsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      docsData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(docsData);
    });
    return () => unsubscribe();
  }, [user]);

  const categories = ['全部', '主餐', '點心', '飲料'];

  // 購物車數量變動
  const updateCart = (itemId, delta) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const updated = current + delta;
      if (updated <= 0) {
        const newCart = { ...prev };
        delete newCart[itemId];
        return newCart;
      }
      return { ...prev, [itemId]: updated };
    });
  };

  const totalCartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalCartPrice = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItems.find(m => m.id === id);
    return sum + (item ? Number(item.price) * qty : 0);
  }, 0);

  // 送出訂單
  const handleSubmitOrder = async () => {
    if (!customerName.trim()) {
      alert('請先輸入您的暱稱！');
      return;
    }
    if (totalCartCount === 0) return;

    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menuItems.find(m => m.id === id);
      return { id: item.id, name: item.name, price: Number(item.price), qty };
    });

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
        customerName,
        items,
        totalPrice: totalCartPrice,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setCart({});
      setIsCartOpen(false);
      alert('訂單已成功送出！');
    } catch (err) {
      console.error(err);
      alert('送出訂單失敗：' + err.message);
    }
  };

  // 後台：新增餐點
  const handleAddMenuItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) {
      alert('請填寫餐點名稱與價格！');
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'menu'), {
        name: newItem.name,
        category: newItem.category,
        price: Number(newItem.price),
        description: newItem.description || '暫無描述',
        image: newItem.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80'
      });
      setNewItem({ name: '', category: '主餐', price: '', description: '', image: '' });
      alert('餐點已順利新增！');
    } catch (err) {
      console.error(err);
      alert('新增失敗');
    }
  };

  // 後台：刪除餐點
  const handleDeleteMenuItem = async (itemId) => {
    if (window.confirm('確定要刪除這道餐點嗎？')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'menu', itemId));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 後台：更新餐廳名稱與圖片
  const handleSaveRestaurantInfo = async (e) => {
    e.preventDefault();
    try {
      const configRef = doc(db, 'artifacts', appId, 'public', 'restaurant_config');
      await setDoc(configRef, {
        name: restaurantName,
        banner: restaurantBanner
      }, { merge: true });
      alert('餐廳資訊更新成功！');
    } catch (err) {
      console.error(err);
      alert('更新失敗');
    }
  };

  // 後台：切換訂單狀態
  const handleToggleOrderStatus = async (orderId, currentStatus) => {
    const newStatus = currentStatus === 'pending' ? 'completed' : 'pending';
    try {
      const orderRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', orderId);
      await updateDoc(orderRef, { status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMenu = activeCategory === '全部'
    ? menuItems
    : menuItems.filter(m => m.category === activeCategory);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <div 
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => setMode('welcome')}
          >
            <div className="p-2 bg-orange-500 rounded-xl text-white shadow-md shadow-orange-200">
              <Utensils className="w-5 h-5" />
            </div>
            <span className="font-bold text-lg text-slate-900 tracking-tight truncate max-w-[160px]">
              {restaurantName}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setMode('customer')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                mode === 'customer' 
                  ? 'bg-orange-100 text-orange-600' 
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              顧客點餐
            </button>
            <button
              onClick={() => setMode('merchant')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1 transition ${
                mode === 'merchant' 
                  ? 'bg-slate-900 text-white' 
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>後台管理</span>
            </button>
          </div>
        </div>
      </header>

      {/* --- 模式 1: 歡迎首頁（改為輸入暱稱） --- */}
      {mode === 'welcome' && (
        <div className="max-w-md mx-auto px-6 min-h-[calc(100vh-3.5rem)] flex flex-col justify-between py-6">
          <div className="flex-1 flex flex-col items-center justify-center text-center pt-2">
            {/* 餐廳品牌圖片封面 */}
            <div className="w-full h-44 rounded-2xl overflow-hidden shadow-md mb-6 relative bg-slate-200">
              <img 
                src={restaurantBanner} 
                alt={restaurantName}
                className="w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                <h1 className="text-white text-xl font-black text-left">{restaurantName}</h1>
              </div>
            </div>

            <p className="text-sm text-slate-500 max-w-xs mb-6">
              歡迎光臨！請輸入您的暱稱或稱呼，即可開始挑選美食！
            </p>

            {/* 暱稱輸入框 */}
            <div className="w-full bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1 text-left flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-orange-500" />
                <span>您的暱稱或稱呼</span>
              </label>
              <input
                type="text"
                placeholder="例如：小明、陳小姐"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 text-center text-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <button
              onClick={() => {
                if (!customerName.trim()) {
                  alert('請先輸入您的暱稱再開始點餐喔！');
                  return;
                }
                setMode('customer');
              }}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition flex items-center justify-center space-x-2 text-base"
            >
              <span>開始點餐</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4 text-center">
            <button
              onClick={() => setMode('merchant')}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 underline underline-offset-4"
            >
              我是店家？進入管理後台
            </button>
          </div>
        </div>
      )}

      {/* --- 模式 2: 顧客點餐頁面 --- */}
      {mode === 'customer' && (
        <div className="max-w-md mx-auto px-4 pt-4">
          <div className="bg-orange-500 text-white p-4 rounded-2xl shadow-lg shadow-orange-200 mb-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-orange-100 font-medium">顧客暱稱</p>
              <h2 className="text-2xl font-black">{customerName || '未填寫暱稱'}</h2>
            </div>
            <button
              onClick={() => setMode('welcome')}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium backdrop-blur-sm transition"
            >
              修改暱稱
            </button>
          </div>

          {/* 分類清單 */}
          <div className="flex space-x-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  activeCategory === cat
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-100 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* 餐點列表 */}
          <div className="space-y-3">
            {filteredMenu.map((item) => {
              const qty = cart[item.id] || 0;
              return (
                <div 
                  key={item.id} 
                  className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex space-x-3 items-center hover:shadow-md transition"
                >
                  <div className="w-24 h-24 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 relative">
                    <img 
                      src={item.image} 
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 text-sm mb-0.5 truncate">{item.name}</h3>
                    <p className="text-xs text-slate-400 mb-2 line-clamp-2 leading-tight">
                      {item.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-orange-500 text-base">
                        NT$ {item.price}
                      </span>

                      <div className="flex items-center space-x-2">
                        {qty > 0 && (
                          <>
                            <button
                              onClick={() => updateCart(item.id, -1)}
                              className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="font-bold text-slate-800 text-xs w-4 text-center">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          onClick={() => updateCart(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 active:scale-95 shadow-sm shadow-orange-200 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 購物車懸浮按鈕 */}
          {totalCartCount > 0 && (
            <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-20">
              <button
                onClick={() => setIsCartOpen(true)}
                className="w-full bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between active:scale-[0.98] transition"
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <ShoppingBag className="w-6 h-6 text-orange-400" />
                    <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                      {totalCartCount}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs text-slate-400">已選餐點</p>
                    <p className="font-extrabold text-white text-base">NT$ {totalCartPrice}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1 text-orange-400 font-bold text-sm">
                  <span>查看購物車</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 購物車 Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-lg text-slate-800">購物車明細 ({customerName})</h3>
              <button onClick={() => setIsCartOpen(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
              {Object.entries(cart).map(([id, qty]) => {
                const item = menuItems.find(m => m.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="flex justify-between items-center py-2 border-b border-slate-50">
                    <div className="flex items-center space-x-3">
                      <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                      <div>
                        <p className="font-bold text-sm text-slate-800">{item.name}</p>
                        <p className="text-xs text-orange-500 font-semibold">NT$ {item.price}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => updateCart(id, -1)} className="w-6 h-6 bg-slate-100 text-slate-600 rounded flex items-center justify-center">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-bold text-xs w-4 text-center">{qty}</span>
                      <button onClick={() => updateCart(id, 1)} className="w-6 h-6 bg-orange-500 text-white rounded flex items-center justify-center">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex justify-between items-center text-sm font-bold">
                <span className="text-slate-500">總金額</span>
                <span className="text-xl text-orange-500 font-black">NT$ {totalCartPrice}</span>
              </div>
              <button
                onClick={handleSubmitOrder}
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition"
              >
                確認送出訂單
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- 模式 3: 店家管理後台 --- */}
      {mode === 'merchant' && (
        <div className="max-w-md mx-auto px-4 pt-4">
          {/* 後台三大分頁導覽 */}
          <div className="flex bg-slate-200 p-1 rounded-xl mb-4 text-xs font-bold">
            <button
              onClick={() => setMerchantTab('orders')}
              className={`flex-1 py-2 rounded-lg transition ${
                merchantTab === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              訂單列表
            </button>
            <button
              onClick={() => setMerchantTab('menu')}
              className={`flex-1 py-2 rounded-lg transition ${
                merchantTab === 'menu' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              菜單管理
            </button>
            <button
              onClick={() => setMerchantTab('restaurantInfo')}
              className={`flex-1 py-2 rounded-lg transition ${
                merchantTab === 'restaurantInfo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              店面設定
            </button>
          </div>

          {/* 後台分頁 1：即時訂單 */}
          {merchantTab === 'orders' && (
            <div className="space-y-3">
              <h2 className="text-lg font-extrabold text-slate-900">即時接單狀態</h2>
              {orders.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl text-center border border-slate-100">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm font-bold text-slate-400">目前尚無任何訂單</p>
                </div>
              ) : (
                orders.map((ord) => (
                  <div
                    key={ord.id}
                    className={`border rounded-2xl p-4 transition ${
                      ord.status === 'completed'
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : 'bg-white border-orange-200 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2 border-b border-slate-100 pb-2">
                      <div>
                        <span className="bg-slate-900 text-white text-xs font-black px-2 py-0.5 rounded-md mr-2">
                          顧客: {ord.customerName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {ord.createdAt?.seconds 
                            ? new Date(ord.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : '剛才'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleOrderStatus(ord.id, ord.status)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition ${
                          ord.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-500 text-white shadow-sm'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{ord.status === 'completed' ? '已完成' : '完成出餐'}</span>
                      </button>
                    </div>

                    <div className="space-y-1 mb-3">
                      {ord.items?.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-slate-700 font-medium">
                          <span>{it.name} x {it.qty}</span>
                          <span className="text-slate-400">NT$ {it.price * it.qty}</span>
                        </div>
                      ))}
                    </div>

                    <div className="text-right border-t border-slate-50 pt-2">
                      <span className="text-xs text-slate-400 mr-1">總計:</span>
                      <span className="font-extrabold text-orange-500 text-sm">NT$ {ord.totalPrice}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 後台分頁 2：新增與刪除餐點 */}
          {merchantTab === 'menu' && (
            <div className="space-y-4">
              {/* 新增餐點區塊 */}
              <form onSubmit={handleAddMenuItem} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-1">
                  <Plus className="w-4 h-4 text-orange-500" />
                  <span>新增餐點</span>
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="餐點名稱"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                    required
                  />
                  <input
                    type="number"
                    placeholder="價格 (NT$)"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    className="p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="p-2 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white"
                  >
                    <option value="主餐">主餐</option>
                    <option value="點心">點心</option>
                    <option value="飲料">飲料</option>
                  </select>
                  <input
                    type="url"
                    placeholder="圖片網址 (可選)"
                    value={newItem.image}
                    onChange={(e) => setNewItem({ ...newItem, image: e.target.value })}
                    className="p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                  />
                </div>

                <input
                  type="text"
                  placeholder="餐點簡介描述"
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none"
                />

                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition"
                >
                  確認新增此餐點
                </button>
              </form>

              {/* 現有餐點列表（可刪除） */}
              <div className="space-y-2">
                <h3 className="font-bold text-xs text-slate-400">目前菜單清單 ({menuItems.length})</h3>
                {menuItems.map((item) => (
                  <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                      <div>
                        <p className="font-bold text-xs text-slate-800">{item.name}</p>
                        <p className="text-[10px] text-slate-400">[{item.category}] NT$ {item.price}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteMenuItem(item.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 後台分頁 3：店面設定 (修改餐廳名稱與封面圖) */}
          {merchantTab === 'restaurantInfo' && (
            <form onSubmit={handleSaveRestaurantInfo} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-1">
                <Settings className="w-4 h-4 text-orange-500" />
                <span>店面基本設定</span>
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">餐廳名稱</label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">餐廳封面圖片網址</label>
                <input
                  type="url"
                  value={restaurantBanner}
                  onChange={(e) => setRestaurantBanner(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none"
                  required
                />
                {/* 預覽 */}
                <div className="mt-2 h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <img src={restaurantBanner} alt="封面預覽" className="w-full h-full object-cover" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-orange-500 text-white font-bold text-xs rounded-xl hover:bg-orange-600 transition shadow-md shadow-orange-200"
              >
                儲存餐廳設定
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}