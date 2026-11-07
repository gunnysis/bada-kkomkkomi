import { useState, useCallback } from 'react';
import type { PorpoiseRecord } from '../types/porpoise';

const STORAGE_KEY = 'bada_finless_porpoise_records_v1';

export function usePorpoiseStorage() {
  const [records, setRecords] = useState<PorpoiseRecord[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PorpoiseRecord[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });
  const [isLoaded] = useState(true);

  // 저장소 쓰기 헬퍼
  const persistRecords = useCallback((newRecords: PorpoiseRecord[]) => {
    setRecords(newRecords);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newRecords));
    } catch (e) {
      console.error('Failed to persist porpoise records to localStorage:', e);
    }
  }, []);

  // 생성
  const addRecord = useCallback(
    (record: Omit<PorpoiseRecord, 'id' | 'createdAt'>) => {
      const newEntry: PorpoiseRecord = {
        ...record,
        id: `finless_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };
      const updated = [newEntry, ...records];
      persistRecords(updated);
      return newEntry;
    },
    [records, persistRecords]
  );

  // 수정
  const updateRecord = useCallback(
    (id: string, updates: Partial<Omit<PorpoiseRecord, 'id' | 'createdAt'>>) => {
      const updated = records.map((r) => (r.id === id ? { ...r, ...updates } : r));
      persistRecords(updated);
    },
    [records, persistRecords]
  );

  // 삭제
  const deleteRecord = useCallback(
    (id: string) => {
      const updated = records.filter((r) => r.id !== id);
      persistRecords(updated);
    },
    [records, persistRecords]
  );

  return {
    records,
    isLoaded,
    addRecord,
    updateRecord,
    deleteRecord,
  };
}
