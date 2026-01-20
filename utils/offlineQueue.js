/**
 * نظام قائمة انتظار للعمليات المعلقة
 * يخزن العمليات في localStorage حتى يتم مزامنتها مع Firebase
 * 
 * @module utils/offlineQueue
 */

class OfflineQueue {
  constructor() {
    this.queue = this.loadQueue();
  }

  /**
   * تحميل القائمة من localStorage
   */
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

  /**
   * حفظ القائمة في localStorage
   */
  saveQueue() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("offlineQueue", JSON.stringify(this.queue));
      // إرسال event لتحديث UI
      window.dispatchEvent(new CustomEvent("offlineQueueUpdated", {
        detail: { count: this.getPending().length }
      }));
    } catch (error) {
      console.error("Error saving queue:", error);
    }
  }

  /**
   * إضافة عملية جديدة للقائمة
   * @param {object} operation - العملية المراد إضافتها
   * @returns {string} - ID العملية
   */
  add(operation) {
    // التحقق من التكرار
    if (this.isDuplicate(operation)) {
      console.log("⚠️ Duplicate operation detected, skipping");
      return null;
    }

    const queueItem = {
      id: `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...operation,
      synced: false,
      retries: 0,
      lastRetry: null
    };

    this.queue.push(queueItem);
    this.saveQueue();
    
    // إرسال event
    window.dispatchEvent(new CustomEvent("offlineOperationAdded", {
      detail: { operation: queueItem }
    }));
    
    return queueItem.id;
  }

  /**
   * التحقق من التكرار
   */
  isDuplicate(operation) {
    const { collectionName, action, docId, data } = operation;
    
    return this.queue.some(item => {
      if (item.synced) return false;
      
      if (action === "add") {
        // للعمليات الجديدة، نتحقق من البيانات بشكل أكثر دقة
        if (item.collectionName !== collectionName || item.action !== "add") {
          return false;
        }
        
        // ✅ للـ cart: نتحقق من الكود واللون والمقاس والكمية
        if (collectionName === "cart" && data && item.data) {
          const sameCode = (data.code || "") === (item.data.code || "");
          const sameColor = (data.color || "") === (item.data.color || "");
          const sameSize = (data.size || "") === (item.data.size || "");
          const sameShop = (data.shop || "") === (item.data.shop || "");
          return sameCode && sameColor && sameSize && sameShop;
        }
        
        // ✅ للـ dailySales: نتحقق من invoiceNumber و total و shop
        if (collectionName === "dailySales" && data && item.data) {
          const sameInvoiceNumber = (data.invoiceNumber || 0) === (item.data.invoiceNumber || 0);
          const sameTotal = (data.total || 0) === (item.data.total || 0);
          const sameShop = (data.shop || "") === (item.data.shop || "");
          const sameDate = Math.abs(new Date(data.date || 0).getTime() - new Date(item.data.date || 0).getTime()) < 60000; // نفس الدقيقة
          return sameInvoiceNumber && sameTotal && sameShop && sameDate;
        }
        
        // ✅ للـ lacosteProducts و wared: نتحقق من code و shop و name
        if ((collectionName === "lacosteProducts" || collectionName === "wared") && data && item.data) {
          const sameCode = (data.code || "") === (item.data.code || "");
          const sameShop = (data.shop || "") === (item.data.shop || "");
          const sameName = (data.name || "").trim() === (item.data.name || "").trim();
          const sameType = (data.type || "") === (item.data.type || "");
          // التحقق من نفس اللحظة (خلال ثانية واحدة) لتجنب التكرار السريع
          const timeDiff = Math.abs(new Date(item.timestamp || 0).getTime() - Date.now());
          return sameCode && sameShop && sameName && sameType && timeDiff < 2000; // خلال ثانيتين
        }
        
        // للعمليات الأخرى، نتحقق من البيانات بالكامل
        return JSON.stringify(item.data) === JSON.stringify(data);
      } else if (action === "update" || action === "delete") {
        // للعمليات الأخرى، نتحقق من docId
        return item.collectionName === collectionName &&
               item.action === action &&
               item.docId === docId;
      }
      
      return false;
    });
  }

  /**
   * جلب العمليات غير المزامنة
   */
  getPending() {
    return this.queue.filter(item => !item.synced);
  }

  /**
   * جلب عدد العمليات المعلقة
   */
  getPendingCount() {
    return this.getPending().length;
  }

  /**
   * جلب عدد العمليات الفاشلة
   */
  getFailedCount() {
    return this.queue.filter(item => !item.synced && item.retries >= 5).length;
  }

  /**
   * تحديث حالة العملية كمزامنة
   */
  markAsSynced(id) {
    const item = this.queue.find(op => op.id === id);
    if (item) {
      item.synced = true;
      item.syncedAt = new Date().toISOString();
      this.saveQueue();
      
      window.dispatchEvent(new CustomEvent("offlineOperationSynced", {
        detail: { operationId: id }
      }));
    }
  }

  /**
   * تحديث عدد المحاولات
   */
  incrementRetry(id) {
    const item = this.queue.find(op => op.id === id);
    if (item) {
      item.retries++;
      item.lastRetry = new Date().toISOString();
      this.saveQueue();
      
      if (item.retries >= 5) {
        window.dispatchEvent(new CustomEvent("offlineOperationFailed", {
          detail: { operation: item }
        }));
      }
    }
  }

  /**
   * حذف العملية بعد المزامنة الناجحة
   */
  remove(id) {
    const index = this.queue.findIndex(op => op.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
    }
  }

  /**
   * تنظيف العمليات المزامنة القديمة (أكثر من يوم)
   */
  cleanup() {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const initialLength = this.queue.length;
    
    this.queue = this.queue.filter(item => {
      if (item.synced && item.syncedAt) {
        const syncedDate = new Date(item.syncedAt);
        return syncedDate > oneDayAgo;
      }
      return true;
    });
    
    if (this.queue.length < initialLength) {
      this.saveQueue();
      console.log(`🧹 Cleaned ${initialLength - this.queue.length} old synced operations`);
    }
  }

  /**
   * مزامنة جميع العمليات المعلقة
   */
  async sync() {
    const pending = this.getPending();
    if (pending.length === 0) return { success: 0, failed: 0, skipped: 0 };

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const operation of pending) {
      // تخطي العمليات التي فشلت 5 مرات
      if (operation.retries >= 5) {
        skipped++;
        continue;
      }

      // Exponential backoff: انتظر قبل إعادة المحاولة
      if (operation.lastRetry) {
        const lastRetryTime = new Date(operation.lastRetry).getTime();
        const waitTime = Math.min(1000 * Math.pow(2, operation.retries), 30000); // Max 30 seconds
        const timeSinceLastRetry = Date.now() - lastRetryTime;
        
        if (timeSinceLastRetry < waitTime) {
          skipped++;
          continue;
        }
      }

      try {
        // سيتم تنفيذ العملية في useOfflineSync
        // هنا نعيد فقط المعلومات
        success++;
    } catch (error) {
        this.incrementRetry(operation.id);
        failed++;
      }
    }

    return { success, failed, skipped, total: pending.length };
  }
}

export const offlineQueue = new OfflineQueue();

