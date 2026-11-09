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

  // 저장소 쓰기 헬퍼 (함수형 상태 업데이터 지원으로 참조 안정성 및 동시 호출 정합성 보장)
  const updateAndPersist = useCallback(
    (updater: (prev: PorpoiseRecord[]) => PorpoiseRecord[]) => {
      setRecords((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
          console.error('Failed to persist porpoise records to localStorage:', e);
        }
        return next;
      });
    },
    [],
  );

  // 생성
  const addRecord = useCallback(
    (record: Omit<PorpoiseRecord, 'id' | 'createdAt'>) => {
      const newEntry: PorpoiseRecord = {
        ...record,
        id: `finless_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };
      updateAndPersist((prev) => [newEntry, ...prev]);
      return newEntry;
    },
    [updateAndPersist],
  );

  // 수정
  const updateRecord = useCallback(
    (id: string, updates: Partial<Omit<PorpoiseRecord, 'id' | 'createdAt'>>) => {
      updateAndPersist((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
    },
    [updateAndPersist],
  );

  // 삭제
  const deleteRecord = useCallback(
    (id: string) => {
      updateAndPersist((prev) => prev.filter((r) => r.id !== id));
    },
    [updateAndPersist],
  );

  return {
    records,
    isLoaded,
    addRecord,
    updateRecord,
    deleteRecord,
  };
}
