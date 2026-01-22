"use client";
import { useState, useEffect, useCallback } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/app/firebase";
import { DEFAULT_CONFIG } from "@/constants/config";
import { CONFIG } from "@/constants/config";

const CONFIG_DOC_ID = "main";
const CONFIG_COLLECTION = "appConfig";
const LOCAL_STORAGE_KEY = "appConfig";

// Load config from localStorage
function loadOfflineConfig() {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch (error) {
    console.error("Error loading offline config:", error);
    return null;
  }
}

// Save config to localStorage
function saveOfflineConfig(config) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("Error saving offline config:", error);
  }
}

// Update CONFIG object dynamically
function updateConfigObject(configData) {
  if (configData?.DISCOUNT_PASSWORDS) {
    CONFIG.DISCOUNT_PASSWORDS = {
      ...CONFIG.DISCOUNT_PASSWORDS,
      ...configData.DISCOUNT_PASSWORDS,
    };
  }
  if (configData?.ADMIN_EMAILS) {
    CONFIG.ADMIN_EMAILS = [...configData.ADMIN_EMAILS];
  }
}

/**
 * Hook to manage app configuration from Firebase
 * Supports offline mode with localStorage cache
 */
export function useAppConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load config from Firebase or localStorage
  const loadConfig = useCallback(async () => {
    try {
      const configRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
      const configSnap = await getDoc(configRef);

      if (configSnap.exists()) {
        const configData = configSnap.data();
        setConfig(configData);
        saveOfflineConfig(configData);
        updateConfigObject(configData);
      } else {
        // Create default config if doesn't exist
        const defaultConfig = {
          DISCOUNT_PASSWORDS: DEFAULT_CONFIG.DISCOUNT_PASSWORDS,
          ADMIN_EMAILS: DEFAULT_CONFIG.ADMIN_EMAILS,
        };
        await setDoc(configRef, defaultConfig);
        setConfig(defaultConfig);
        saveOfflineConfig(defaultConfig);
        updateConfigObject(defaultConfig);
      }
    } catch (err) {
      console.error("Error loading config from Firebase:", err);
      // Fallback to localStorage
      const offlineConfig = loadOfflineConfig();
      if (offlineConfig) {
        setConfig(offlineConfig);
        updateConfigObject(offlineConfig);
      } else {
        // Fallback to default config
        const defaultConfig = {
          DISCOUNT_PASSWORDS: DEFAULT_CONFIG.DISCOUNT_PASSWORDS,
          ADMIN_EMAILS: DEFAULT_CONFIG.ADMIN_EMAILS,
        };
        setConfig(defaultConfig);
        updateConfigObject(defaultConfig);
      }
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Update config in Firebase
  const updateConfig = useCallback(
    async (updates) => {
      try {
        const configRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID);
        const currentConfig = config || {
          DISCOUNT_PASSWORDS: DEFAULT_CONFIG.DISCOUNT_PASSWORDS,
          ADMIN_EMAILS: DEFAULT_CONFIG.ADMIN_EMAILS,
        };

        const updatedConfig = {
          ...currentConfig,
          ...updates,
        };

        await setDoc(configRef, updatedConfig, { merge: true });
        setConfig(updatedConfig);
        saveOfflineConfig(updatedConfig);
        updateConfigObject(updatedConfig);
        return true;
      } catch (err) {
        console.error("Error updating config:", err);
        setError(err);
        return false;
      }
    },
    [config]
  );

  // Initialize config on mount
  useEffect(() => {
    // Try loading from localStorage first for immediate access
    const offlineConfig = loadOfflineConfig();
    if (offlineConfig) {
      setConfig(offlineConfig);
      updateConfigObject(offlineConfig);
      setLoading(false);
    }

    // Then load from Firebase
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    loading,
    error,
    updateConfig,
    reloadConfig: loadConfig,
  };
}

