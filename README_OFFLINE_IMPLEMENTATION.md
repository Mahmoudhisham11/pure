# دليل تنفيذ نظام Offline كامل مع المزامنة التلقائية

## 📋 نظرة عامة

هذا الدليل يشرح بالتفصيل كيفية تحويل نظام POS الحالي ليعمل بشكل كامل في وضع **Offline** مع مزامنة تلقائية عند عودة الاتصال بالإنترنت.

---

## 🎯 الهدف

جعل النظام يعمل بنفس الطريقة سواء كان **Online** أو **Offline**:
- ✅ جميع العمليات (قراءة، كتابة، حذف) تعمل بدون إنترنت
- ✅ البيانات تُخزن محلياً أولاً
- ✅ مزامنة تلقائية مع Firebase عند عودة الاتصال
- ✅ عرض البيانات من Firebase عند الاتصال، ومن التخزين المحلي عند عدم الاتصال

---

## 🗂 أين يتم تخزين البيانات في Offline؟

### 1. **IndexedDB (Firebase Offline Persistence)**
**الاستخدام**: تخزين جميع البيانات من Firebase للقراءة السريعة

**المميزات**:
- تخزين تلقائي لجميع البيانات المقروءة من Firebase
- سعة تخزين كبيرة (عدة GB)
- سريع جداً في القراءة
- يدعم الاستعلامات المعقدة

**متى يُستخدم**:
- عند قراءة البيانات من Firebase
- Firebase يقوم تلقائياً بحفظ نسخة في IndexedDB
- عند عدم الاتصال، البيانات تُقرأ من IndexedDB

### 2. **localStorage**
**الاستخدام**: تخزين العمليات المعلقة (Pending Operations) والبيانات المؤقتة

**المميزات**:
- سهل الاستخدام
- متاح في جميع المتصفحات
- مناسب للبيانات الصغيرة

**متى يُستخدم**:
- قائمة انتظار العمليات المعلقة (`offlineQueue`)
- الفواتير المحلية (`offlineInvoices`)
- المصاريف المحلية (`offlineMasrofat`)
- الوارد المحلي (`offlineWared`)
- العدادات المحلية (`lastInvoiceNumber`)

**البنية**:
```javascript
localStorage.setItem("offlineQueue", JSON.stringify([...operations]))
localStorage.setItem("offlineInvoices", JSON.stringify([...invoices]))
localStorage.setItem("offlineMasrofat", JSON.stringify([...expenses]))
localStorage.setItem("offlineWared", JSON.stringify([...products]))
```

### 3. **SessionStorage (اختياري)**
**الاستخدام**: البيانات المؤقتة للجلسة الحالية فقط

---

## 🏗 البنية المقترحة للنظام

```
┌─────────────────────────────────────────┐
│         UI Layer (Components)           │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      Offline Wrappers Layer             │
│  - offlineAdd()                         │
│  - offlineUpdate()                      │
│  - offlineDelete()                      │
│  - offlineGet()                         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      Sync Queue Manager                 │
│  - offlineQueue.js                      │
│  - useOfflineSync.js                    │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼──────┐  ┌─────▼──────┐
│  Online     │  │  Offline   │
│  Firebase   │  │  Storage   │
└─────────────┘  └────────────┘
```

---

## 📝 الخطوات التفصيلية للتنفيذ

### المرحلة 1: تفعيل Firebase Offline Persistence

#### الخطوة 1.1: تحديث `app/firebase.jsx`

```javascript
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// تفعيل IndexedDB Persistence
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("✅ Firebase IndexedDB persistence enabled");
    })
    .catch((err) => {
      if (err.code === "failed-precondition") {
        console.info("ℹ️ Multiple tabs open, persistence enabled in another tab");
      } else if (err.code === "unimplemented") {
        console.warn("⚠️ Browser doesn't support persistence");
      }
    });
}
```

**ما يحدث هنا**:
- Firebase يحفظ تلقائياً جميع البيانات المقروءة في IndexedDB
- عند عدم الاتصال، البيانات تُقرأ من IndexedDB تلقائياً
- لا حاجة لتعديل كود القراءة

---

### المرحلة 2: إنشاء نظام Queue للعمليات المعلقة

#### الخطوة 2.1: إنشاء `utils/offlineQueue.js`

```javascript
/**
 * نظام قائمة انتظار للعمليات المعلقة
 * يخزن العمليات في localStorage حتى يتم مزامنتها مع Firebase
 */

class OfflineQueue {
  constructor() {
    this.queue = this.loadQueue();
  }

  // تحميل القائمة من localStorage
  loadQueue() {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("offlineQueue");
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Error loading queue:", error);
      return [];
    }
  }

  // حفظ القائمة في localStorage
  saveQueue() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("offlineQueue", JSON.stringify(this.queue));
    } catch (error) {
      console.error("Error saving queue:", error);
    }
  }

  // إضافة عملية جديدة للقائمة
  add(operation) {
    const queueItem = {
      id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...operation,
      synced: false,
      retries: 0
    };

    this.queue.push(queueItem);
    this.saveQueue();
    return queueItem.id;
  }

  // جلب العمليات غير المزامنة
  getPending() {
    return this.queue.filter(item => !item.synced);
  }

  // تحديث حالة العملية
  markAsSynced(id) {
    const item = this.queue.find(op => op.id === id);
    if (item) {
      item.synced = true;
      item.syncedAt = new Date().toISOString();
      this.saveQueue();
    }
  }

  // حذف العملية بعد المزامنة الناجحة
  remove(id) {
    this.queue = this.queue.filter(op => op.id !== id);
    this.saveQueue();
  }

  // تنظيف العمليات المزامنة القديمة
  cleanup() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    this.queue = this.queue.filter(item => {
      if (item.synced && item.syncedAt) {
        const syncedDate = new Date(item.syncedAt);
        return syncedDate > oneDayAgo;
      }
      return true;
    });
    
    this.saveQueue();
  }
}

export const offlineQueue = new OfflineQueue();
```

**ما يحدث هنا**:
- كل عملية (add, update, delete) تُحفظ في قائمة انتظار
- القائمة تُحفظ في `localStorage` تحت مفتاح `offlineQueue`
- عند عودة الاتصال، يتم مزامنة جميع العمليات المعلقة

---

### المرحلة 3: إنشاء Offline Wrappers

#### الخطوة 3.1: إنشاء `utils/firebaseOffline.js`

```javascript
import dataLayer from "@/lib/DataLayer";
import { offlineQueue } from "./offlineQueue";

/**
 * Wrapper لإضافة مستند جديد
 * يعمل في Online و Offline
 */
export const offlineAdd = async (collectionName, data) => {
  // إضافة queueId للبيانات للربط لاحقاً
  const queueId = offlineQueue.add({
    collectionName,
    action: "add",
    data
  });

  // حفظ محلياً للعرض الفوري
  saveToLocalStorage(collectionName, "add", data, queueId);

  // محاولة المزامنة مع Firebase إذا كان هناك اتصال
  if (navigator.onLine) {
    try {
      const result = await dataLayer.add(collectionName, data);
      
      // تحديث البيانات المحلية بالـ ID الحقيقي من Firebase
      updateLocalDataWithFirebaseId(collectionName, queueId, result.id);
      
      // تحديد العملية كمزامنة
      offlineQueue.markAsSynced(queueId);
      
      return { success: true, id: result.id, queueId, offline: false };
    } catch (error) {
      console.error("Error syncing to Firebase:", error);
      // في حالة الخطأ، تبقى العملية في القائمة للمزامنة لاحقاً
      return { success: false, queueId, offline: true, error };
    }
  }

  return { success: false, queueId, offline: true };
};

/**
 * Wrapper لتحديث مستند
 */
export const offlineUpdate = async (collectionName, docId, data) => {
  const queueId = offlineQueue.add({
    collectionName,
    action: "update",
    docId,
    data
  });

  // تحديث محلياً للعرض الفوري
  updateLocalStorage(collectionName, docId, data);

  if (navigator.onLine) {
    try {
      await dataLayer.update(collectionName, docId, data);
      offlineQueue.markAsSynced(queueId);
      return { success: true, queueId, offline: false };
    } catch (error) {
      console.error("Error syncing update:", error);
      return { success: false, queueId, offline: true, error };
    }
  }

  return { success: false, queueId, offline: true };
};

/**
 * Wrapper لحذف مستند
 */
export const offlineDelete = async (collectionName, docId) => {
  const queueId = offlineQueue.add({
    collectionName,
    action: "delete",
    docId
  });

  // حذف محلياً للعرض الفوري
  removeFromLocalStorage(collectionName, docId);

  if (navigator.onLine) {
    try {
      await dataLayer.delete(collectionName, docId);
      offlineQueue.markAsSynced(queueId);
      return { success: true, queueId, offline: false };
    } catch (error) {
      console.error("Error syncing delete:", error);
      return { success: false, queueId, offline: true, error };
    }
  }

  return { success: false, queueId, offline: true };
};

/**
 * حفظ البيانات محلياً للعرض الفوري
 */
function saveToLocalStorage(collectionName, action, data, queueId) {
  if (typeof window === "undefined") return;

  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        invoices.push({ id: queueId, queueId, ...data, isOffline: true });
        localStorage.setItem("offlineInvoices", JSON.stringify(invoices));
        window.dispatchEvent(new Event("offlineInvoiceAdded"));
        break;

      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        masrofat.push({ id: queueId, queueId, ...data, isOffline: true });
        localStorage.setItem("offlineMasrofat", JSON.stringify(masrofat));
        window.dispatchEvent(new Event("offlineMasrofAdded"));
        break;

      case "wared":
        const wared = JSON.parse(localStorage.getItem("offlineWared") || "[]");
        wared.push({ id: queueId, queueId, ...data, isOffline: true });
        localStorage.setItem("offlineWared", JSON.stringify(wared));
        window.dispatchEvent(new Event("offlineWaredAdded"));
        break;

      case "lacosteProducts":
        window.dispatchEvent(new Event("offlineProductAdded"));
        break;
    }
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
}

/**
 * تحديث البيانات المحلية
 */
function updateLocalStorage(collectionName, docId, data) {
  if (typeof window === "undefined") return;

  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        const invoiceIndex = invoices.findIndex(inv => inv.id === docId || inv.queueId === docId);
        if (invoiceIndex !== -1) {
          invoices[invoiceIndex] = { ...invoices[invoiceIndex], ...data };
          localStorage.setItem("offlineInvoices", JSON.stringify(invoices));
          window.dispatchEvent(new Event("offlineInvoiceUpdated"));
        }
        break;

      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        const masrofIndex = masrofat.findIndex(m => m.id === docId || m.queueId === docId);
        if (masrofIndex !== -1) {
          masrofat[masrofIndex] = { ...masrofat[masrofIndex], ...data };
          localStorage.setItem("offlineMasrofat", JSON.stringify(masrofat));
          window.dispatchEvent(new Event("offlineMasrofUpdated"));
        }
        break;
    }
  } catch (error) {
    console.error("Error updating localStorage:", error);
  }
}

/**
 * حذف البيانات المحلية
 */
function removeFromLocalStorage(collectionName, docId) {
  if (typeof window === "undefined") return;

  try {
    switch (collectionName) {
      case "dailySales":
        const invoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
        const filteredInvoices = invoices.filter(inv => inv.id !== docId && inv.queueId !== docId);
        localStorage.setItem("offlineInvoices", JSON.stringify(filteredInvoices));
        window.dispatchEvent(new Event("offlineInvoiceRemoved"));
        break;

      case "masrofat":
        const masrofat = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
        const filteredMasrofat = masrofat.filter(m => m.id !== docId && m.queueId !== docId);
        localStorage.setItem("offlineMasrofat", JSON.stringify(filteredMasrofat));
        window.dispatchEvent(new Event("offlineMasrofRemoved"));
        break;
    }
  } catch (error) {
    console.error("Error removing from localStorage:", error);
  }
}
```

**ما يحدث هنا**:
- كل عملية تُحفظ محلياً أولاً في `localStorage`
- تُضاف للقائمة (`offlineQueue`) للمزامنة لاحقاً
- إذا كان هناك اتصال، تُحاول المزامنة فوراً
- إذا نجحت المزامنة، تُحدد العملية كمزامنة
- إذا فشلت أو لم يكن هناك اتصال، تبقى في القائمة

---

### المرحلة 4: تحديث DataReader للقراءة من IndexedDB

#### الخطوة 4.1: تحديث `lib/DataReader.js`

```javascript
/**
 * DataReader - يقرأ من Firebase أو IndexedDB تلقائياً
 * Firebase يقوم تلقائياً بحفظ البيانات في IndexedDB
 * عند عدم الاتصال، البيانات تُقرأ من IndexedDB
 */

class DataReader {
  async get(query) {
    try {
      // Firebase يقوم تلقائياً بالقراءة من IndexedDB إذا لم يكن هناك اتصال
      const snapshot = await getDocs(query);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error reading data:", error);
      throw error;
    }
  }

  async getById(collectionName, docId) {
    try {
      const docRef = doc(db, collectionName, docId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.error("Error reading document:", error);
      throw error;
    }
  }

  onSnapshot(query, callback) {
    // Firebase يقوم تلقائياً بالاستماع من IndexedDB عند عدم الاتصال
    return onSnapshot(query, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(data, null);
      },
      (error) => {
        callback([], error);
      }
    );
  }
}
```

**ما يحدث هنا**:
- Firebase يقوم تلقائياً بالقراءة من IndexedDB عند عدم الاتصال
- لا حاجة لتعديل كود القراءة
- البيانات تُحدث تلقائياً عند عودة الاتصال

---

### المرحلة 5: دمج البيانات المحلية مع Firebase

#### الخطوة 5.1: تحديث `hooks/useInvoices.js`

```javascript
import { useState, useEffect } from "react";
import dataReader from "@/lib/DataReader";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";

// تحميل الفواتير المحلية
function loadOfflineInvoices(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineInvoices");
    if (!saved) return [];
    const invoices = JSON.parse(saved);
    return invoices.filter(inv => inv.shop === shop);
  } catch (error) {
    console.error("Error loading offline invoices:", error);
    return [];
  }
}

// دمج الفواتير من Firebase والمحلية
function mergeInvoices(firebaseInvoices, offlineInvoices) {
  const merged = [...firebaseInvoices];
  const firebaseIds = new Set(firebaseInvoices.map(inv => inv.id));
  
  // إضافة الفواتير المحلية التي لم يتم مزامنتها بعد
  offlineInvoices.forEach(offlineInv => {
    if (!firebaseIds.has(offlineInv.id) && offlineInv.queueId) {
      merged.push(offlineInv);
    }
  });
  
  return merged.sort((a, b) => {
    const numA = a.invoiceNumber || 0;
    const numB = b.invoiceNumber || 0;
    return numB - numA;
  });
}

export function useInvoices(shop) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  // تحميل الفواتير المحلية فوراً
  useEffect(() => {
    if (!shop) return;
    
    const offlineInvoices = loadOfflineInvoices(shop);
    if (offlineInvoices.length > 0) {
      setInvoices(offlineInvoices);
      setLoading(false);
    }
  }, [shop]);

  // الاستماع للفواتير من Firebase
  useEffect(() => {
    if (!shop) return;

    const q = query(collection(db, "dailySales"), where("shop", "==", shop));
    
    const unsubscribe = dataReader.onSnapshot(q, (firebaseData, error) => {
      if (error) {
        console.error("Error fetching invoices:", error);
        // عند الخطأ، نستخدم البيانات المحلية فقط
        const offlineInvoices = loadOfflineInvoices(shop);
        setInvoices(offlineInvoices);
        setLoading(false);
        return;
      }

      // دمج البيانات من Firebase والمحلية
      const offlineInvoices = loadOfflineInvoices(shop);
      const merged = mergeInvoices(firebaseData, offlineInvoices);
      
      setInvoices(merged);
      setLoading(false);
    });

    // الاستماع للتحديثات المحلية
    const handleOfflineInvoiceAdded = () => {
      setInvoices(prev => {
        const offlineInvoices = loadOfflineInvoices(shop);
        const firebaseInvoices = prev.filter(inv => !inv.queueId);
        return mergeInvoices(firebaseInvoices, offlineInvoices);
      });
    };

    window.addEventListener("offlineInvoiceAdded", handleOfflineInvoiceAdded);

    return () => {
      unsubscribe();
      window.removeEventListener("offlineInvoiceAdded", handleOfflineInvoiceAdded);
    };
  }, [shop]);

  return { invoices, loading };
}
```

**ما يحدث هنا**:
- تحميل البيانات المحلية فوراً للعرض السريع
- دمج البيانات من Firebase والمحلية
- إزالة التكرارات تلقائياً
- تحديث فوري عند إضافة بيانات محلية جديدة

---

### المرحلة 6: نظام المزامنة التلقائية

#### الخطوة 6.1: إنشاء `hooks/useOfflineSync.js`

```javascript
import { useEffect, useState, useCallback } from "react";
import { offlineQueue } from "@/utils/offlineQueue";
import dataLayer from "@/lib/DataLayer";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // مزامنة العمليات المعلقة
  const sync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;

    setIsSyncing(true);
    const pending = offlineQueue.getPending();

    for (const operation of pending) {
      try {
        if (operation.action === "add") {
          const result = await dataLayer.add(operation.collectionName, operation.data);
          
          // تحديث البيانات المحلية بالـ ID الحقيقي
          updateLocalDataWithFirebaseId(operation.collectionName, operation.id, result.id);
          
          offlineQueue.markAsSynced(operation.id);
        } else if (operation.action === "update") {
          await dataLayer.update(operation.collectionName, operation.docId, operation.data);
          offlineQueue.markAsSynced(operation.id);
        } else if (operation.action === "delete") {
          await dataLayer.delete(operation.collectionName, operation.docId);
          offlineQueue.markAsSynced(operation.id);
        }

        // حذف العملية بعد المزامنة الناجحة
        offlineQueue.remove(operation.id);
      } catch (error) {
        console.error("Error syncing operation:", error);
        operation.retries++;
        // إذا فشلت 5 مرات، توقف عن المحاولة
        if (operation.retries >= 5) {
          console.error("Max retries reached for operation:", operation.id);
        }
      }
    }

    setPendingCount(offlineQueue.getPending().length);
    setIsSyncing(false);
  }, [isSyncing]);

  // الاستماع لتغييرات الاتصال
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log("🌐 Connection restored, syncing...");
      sync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log("📴 Connection lost");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // مزامنة فورية عند الاتصال
    if (navigator.onLine) {
      sync();
    }

    // مزامنة دورية كل 30 ثانية
    const syncInterval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        sync();
      }
      setPendingCount(offlineQueue.getPending().length);
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(syncInterval);
    };
  }, [sync, isSyncing]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    sync  
  };
}
```

**ما يحدث هنا**:
- الاستماع لتغييرات الاتصال (online/offline)
- مزامنة تلقائية عند عودة الاتصال
- مزامنة دورية كل 30 ثانية
- إعادة المحاولة عند الفشل (حتى 5 مرات)

---

## 🔄 تدفق البيانات الكامل

### عند الكتابة (Add/Update/Delete)

```
1. المستخدم ينفذ عملية (مثلاً: إضافة فاتورة)
   ↓
2. offlineAdd/Update/Delete() يُستدعى
   ↓
3. البيانات تُحفظ في localStorage (للعرض الفوري)
   ↓
4. العملية تُضاف للقائمة (offlineQueue)
   ↓
5. إذا كان هناك اتصال:
   ├─ محاولة المزامنة مع Firebase
   ├─ إذا نجحت: تحديث البيانات المحلية بالـ ID الحقيقي
   └─ تحديد العملية كمزامنة
   ↓
6. إذا لم يكن هناك اتصال:
   └─ العملية تبقى في القائمة للمزامنة لاحقاً
   ↓
7. عند عودة الاتصال:
   └─ useOfflineSync يقوم بمزامنة جميع العمليات المعلقة
```

### عند القراءة (Get/Query)

```
1. المستخدم يطلب البيانات
   ↓
2. dataReader.get() أو onSnapshot() يُستدعى
   ↓
3. Firebase يحاول القراءة من Firebase
   ↓
4. إذا كان هناك اتصال:
   └─ البيانات تُقرأ من Firebase وتُحفظ في IndexedDB تلقائياً
   ↓
5. إذا لم يكن هناك اتصال:
   └─ البيانات تُقرأ من IndexedDB (النسخة المحفوظة)
   ↓
6. دمج البيانات من Firebase مع البيانات المحلية (localStorage)
   ↓
7. عرض البيانات المدمجة للمستخدم
```

---

## 📦 بنية التخزين المحلي

### localStorage Keys

```javascript
// قائمة انتظار العمليات المعلقة
"offlineQueue" = [
  {
    id: "offline-1234567890-abc123",
    timestamp: "2024-12-01T10:00:00.000Z",
    collectionName: "dailySales",
    action: "add", // أو "update" أو "delete"
    data: { ... }, // بيانات العملية
    docId: "...", // للـ update و delete
    synced: false,
    retries: 0
  }
]

// الفواتير المحلية
"offlineInvoices" = [
  {
    id: "offline-1234567890-abc123",
    queueId: "offline-1234567890-abc123",
    invoiceNumber: 1001,
    total: 500,
    shop: "shop1",
    isOffline: true,
    ...otherInvoiceData
  }
]

// المصاريف المحلية
"offlineMasrofat" = [
  {
    id: "offline-1234567890-abc123",
    queueId: "offline-1234567890-abc123",
    masrof: 100,
    shop: "shop1",
    isOffline: true,
    ...otherMasrofData
  }
]

// الوارد المحلي
"offlineWared" = [
  {
    id: "offline-1234567890-abc123",
    queueId: "offline-1234567890-abc123",
    code: "P001",
    shop: "shop1",
    isOffline: true,
    ...otherProductData
  }
]

// آخر رقم فاتورة
"lastInvoiceNumber" = "1001"
```

### IndexedDB (Firebase)

Firebase يقوم تلقائياً بحفظ البيانات في IndexedDB تحت:
- `firebaseLocalStorageDb` - قاعدة البيانات الرئيسية
- `firestore/[project-id]` - بيانات Firestore

**لا حاجة للتعامل مع IndexedDB مباشرة** - Firebase يتولى ذلك تلقائياً.

---

## 🔧 خطوات التنفيذ العملية

### الخطوة 1: تحديث `app/firebase.jsx`

```javascript
import { enableIndexedDbPersistence } from "firebase/firestore";

// بعد getFirestore
enableIndexedDbPersistence(db)
  .then(() => console.log("✅ Persistence enabled"))
  .catch((err) => {
    if (err.code === "failed-precondition") {
      console.info("ℹ️ Multiple tabs");
    }
  });
```

### الخطوة 2: إنشاء `utils/offlineQueue.js`

انسخ الكود من القسم أعلاه.

### الخطوة 3: إنشاء `utils/firebaseOffline.js`

انسخ الكود من القسم أعلاه.

### الخطوة 4: تحديث جميع عمليات الكتابة

استبدل:
```javascript
await dataLayer.add("dailySales", data);
```

بـ:
```javascript
import { offlineAdd } from "@/utils/firebaseOffline";
await offlineAdd("dailySales", data);
```

نفس الشيء لـ `update` و `delete`.

### الخطوة 5: تحديث Hooks للدمج

- `hooks/useInvoices.js` - دمج الفواتير
- `hooks/useMasrofat.js` - دمج المصاريف
- `hooks/useProducts.js` - دمج المنتجات
- `app/wared/page.jsx` - دمج الوارد

### الخطوة 6: إضافة `useOfflineSync` في المكون الرئيسي

```javascript
import { useOfflineSync } from "@/hooks/useOfflineSync";

function MainContent() {
  const { isOnline, pendingCount, sync } = useOfflineSync();
  
  // عرض حالة الاتصال
  return (
    <div>
      {!isOnline && <div>📴 Offline Mode</div>}
      {pendingCount > 0 && <div>⏳ {pendingCount} pending operations</div>}
    </div>
  );
}
```

---

## ✅ قائمة التحقق (Checklist)

### المرحلة 1: الأساسيات
- [ ] تفعيل Firebase IndexedDB Persistence
- [ ] إنشاء `utils/offlineQueue.js`
- [ ] إنشاء `utils/firebaseOffline.js`
- [ ] إنشاء `hooks/useOfflineSync.js`

### المرحلة 2: تحديث عمليات الكتابة
- [ ] استبدال `dataLayer.add` بـ `offlineAdd` في جميع الملفات
- [ ] استبدال `dataLayer.update` بـ `offlineUpdate` في جميع الملفات
- [ ] استبدال `dataLayer.delete` بـ `offlineDelete` في جميع الملفات

### المرحلة 3: تحديث عمليات القراءة
- [ ] تحديث `hooks/useInvoices.js` للدمج
- [ ] تحديث `hooks/useMasrofat.js` للدمج
- [ ] تحديث `hooks/useProducts.js` للدمج
- [ ] تحديث `app/wared/page.jsx` للدمج

### المرحلة 4: الاختبار
- [ ] اختبار إضافة فاتورة بدون إنترنت
- [ ] اختبار تحديث منتج بدون إنترنت
- [ ] اختبار حذف مصروف بدون إنترنت
- [ ] اختبار المزامنة عند عودة الاتصال
- [ ] اختبار عرض البيانات المدمجة

---

## 🎯 النتيجة النهائية

بعد تنفيذ جميع الخطوات:

1. ✅ النظام يعمل بشكل كامل بدون إنترنت
2. ✅ جميع العمليات تُحفظ محلياً أولاً
3. ✅ البيانات تُعرض فوراً من التخزين المحلي
4. ✅ المزامنة التلقائية عند عودة الاتصال
5. ✅ لا فقدان للبيانات
6. ✅ تجربة مستخدم سلسة في جميع الحالات

---

## 📚 مراجع إضافية

- [Firebase Offline Persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [localStorage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

---

**ملاحظة**: هذا الدليل يشرح البنية الكاملة. يمكن تنفيذ النظام على مراحل حسب الأولوية.

