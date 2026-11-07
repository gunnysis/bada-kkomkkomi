import { useState, type FormEvent } from 'react';
import { Plus, Minus, Trash2, Calendar, Compass, X } from 'lucide-react';
import type { PorpoiseRecord } from '../../types/porpoise';

interface PorpoiseObservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lat: number;
  lng: number;
  existingRecord?: PorpoiseRecord | null;
  onSave: (record: Omit<PorpoiseRecord, 'id' | 'createdAt'>) => void;
  onUpdate?: (id: string, updates: Partial<PorpoiseRecord>) => void;
  onDelete?: (id: string) => void;
}

export function PorpoiseObservationModal({
  isOpen,
  onClose,
  lat,
  lng,
  existingRecord,
  onSave,
  onUpdate,
  onDelete,
}: PorpoiseObservationModalProps) {
  const [observedAt, setObservedAt] = useState(() => {
    if (existingRecord) return existingRecord.observedAt.slice(0, 16);
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [count, setCount] = useState(() => existingRecord?.count ?? 1);
  const [note, setNote] = useState(() => existingRecord?.note ?? '');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (count < 1) return;

    if (existingRecord && onUpdate) {
      onUpdate(existingRecord.id, {
        observedAt,
        count,
        note,
      });
    } else {
      onSave({
        lat,
        lng,
        observedAt,
        count,
        note,
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (existingRecord && onDelete && confirm('이 상괭이 관찰 기록을 삭제하시겠습니까?')) {
      onDelete(existingRecord.id);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="porpoise-modal-title"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border-2 border-teal-500/60 bg-[#0b192c] p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700/90 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400">
              <span className="text-xl">🐬</span>
            </div>
            <div>
              <h2 id="porpoise-modal-title" className="text-base font-black tracking-tight text-white">
                {existingRecord ? '상괭이 관찰기록 수정' : '상괭이 목격 기록'}
              </h2>
              <p className="text-xs text-slate-400">개인 관찰용 (기기 내부 저장)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 위치 좌표 */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">목격 위치</span>
              <span className="flex items-center gap-1 font-mono text-xs font-black text-teal-300">
                <Compass className="h-3.5 w-3.5 text-teal-400" />
                {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
              </span>
            </div>
          </div>

          {/* 목격 일시 */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-teal-400" />
              <span>관찰 날짜 및 시간</span>
            </label>
            <input
              type="datetime-local"
              required
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white focus:border-teal-400 focus:outline-none"
            />
          </div>

          {/* 발견 개체수 */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              발견 개체수 (마리)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCount((prev) => Math.max(1, prev - 1))}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-90"
              >
                <Minus className="h-5 w-5" />
              </button>
              <div className="flex h-12 flex-1 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 font-mono text-xl font-black text-teal-300">
                {count} 마리
              </div>
              <button
                type="button"
                onClick={() => setCount((prev) => prev + 1)}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-800 text-white active:scale-90"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 간단 메모 (선택) */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              관찰 메모 (선택)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 어미와 새끼 2마리 유영 관찰"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm font-bold text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
            />
          </div>

          <div className="text-[11px] text-slate-400 leading-tight">
            * 저장된 상괭이 기록은 기기 브라우저에만 보관되며 타인에게 공유되지 않습니다.
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-2">
            {existingRecord && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-500/60 bg-red-950/60 text-red-400 active:scale-95"
                title="기록 삭제"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              type="submit"
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-teal-400 py-3 text-sm font-black text-slate-950 shadow-lg active:scale-95"
            >
              {existingRecord ? '수정 완료' : '상괭이 위치 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
