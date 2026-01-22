"use client";
import styles from "../styles.module.css";
import { useState, useEffect } from "react";
import { CONFIG } from "@/constants/config";
import { useNotification } from "@/contexts/NotificationContext";
import { getAvailableQuantity } from "@/utils/productHelpers";
import PasswordModal from "./PasswordModal";
import dataReader from "@/lib/DataReader";

export default function PriceModal({
  isOpen,
  onClose,
  product,
  onAddToCart,
}) {
  const { error: showError } = useNotification();
  const [price, setPrice] = useState(0);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingPrice, setPendingPrice] = useState(null);

  useEffect(() => {
    if (product) {
      setPrice(product.sellPrice ?? product.finalPrice ?? 0);
    }
  }, [product]);

  if (!isOpen || !product) return null;

  const handlePasswordConfirm = (password) => {
    setShowPasswordModal(false);
    const priceNum = Number(pendingPrice);

    if (password !== CONFIG.DISCOUNT_PASSWORDS.FULL_ACCESS) {
      showError("الباسورد غير صحيح");
      setPendingPrice(null);
      return;
    }

    // Password is correct, proceed with adding to cart
    proceedWithAdd(priceNum);
  };

  const proceedWithAdd = async (priceNum) => {
    const sellPrice = Number(product.sellPrice);

    if (priceNum > sellPrice) {
      showError(`السعر أكبر من السعر الافتراضي: ${sellPrice}`);
      setPendingPrice(null);
      return;
    }

    // Check available quantity للمنتجات البسيطة بالاعتماد على البيانات الممررة فقط (بدون Firestore)
    if (product.id) {
      try {
        const available = getAvailableQuantity(product, null, null);
        const requestedQty = 1;

        if (requestedQty > available) {
          showError(
            `⚠️ الكمية المطلوبة (${requestedQty}) أكبر من المتاح\nالكمية المتاحة: ${available}`
          );
          setPendingPrice(null);
          return;
        }
      } catch (err) {
        console.error("Error checking availability:", err);
      }
    }

    await onAddToCart(product, {
      price: priceNum,
      quantity: 1,
    });

    setPendingPrice(null);
    onClose();
  };

  const handleAdd = async () => {
    if (!price) {
      showError("من فضلك أدخل السعر");
      return;
    }

    const priceNum = Number(price);
    const finalPrice = Number(product.finalPrice);
    const sellPrice = Number(product.sellPrice);

    // Validate price
    if (priceNum < finalPrice) {
      setPendingPrice(price);
      setShowPasswordModal(true);
      return;
    }

    if (priceNum > sellPrice) {
      showError(`السعر أكبر من السعر الافتراضي: ${sellPrice}`);
      return;
    }

    await proceedWithAdd(priceNum);
  };

  return (
    <div className={styles.popupOverlay} onClick={onClose}>
      <div className={styles.popupBox} onClick={(e) => e.stopPropagation()}>
        <h3>تحديد السعر — {product.name}</h3>
        <label>السعر:</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={`أدخل سعر ≥ ${product.finalPrice}`}
          className={styles.modalInput}
        />
        <div className={styles.priceInfo}>
          <p>السعر النهائي: {product.finalPrice} EGP</p>
          <p>السعر الافتراضي: {product.sellPrice} EGP</p>
        </div>
        <div className={styles.popupBtns}>
          <button onClick={onClose} className={styles.cancelBtn}>
            إلغاء
          </button>
          <button onClick={handleAdd} className={styles.addBtn}>
            أضف للسلة
          </button>
        </div>
      </div>

      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPendingPrice(null);
        }}
        onConfirm={handlePasswordConfirm}
        finalPrice={product?.finalPrice}
        title="إدخال كلمة المرور"
        message="أدخل كلمة المرور للسماح بالخصم"
      />
    </div>
  );
}


