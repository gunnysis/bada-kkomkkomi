import { useEffect, useRef, useState, type FormEvent } from 'react';
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [observedAt, setObservedAt] = useState(() => {
    if (existingRecord) return existingRecord.observedAt.slice(0, 16);
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [count, setCount] = useState(() => existingRecord?.count ?? 1);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (count < 1) return;

    if (existingRecord && onUpdate) {
      onUpdate(existingRecord.id, {
        observedAt,
        count,
      });
    } else {
      onSave({
        lat,
        lng,
        observedAt,
        count,
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
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      aria-labelledby="porpoise-modal-title"
      className="bada-modal-dialog knps-modal-surface fixed inset-0 z-[1300] m-auto w-[calc(100%-1.5rem)] max-w-md rounded-3xl border-2 border-[#00a79d]/65 bg-white p-5 text-[#003360] shadow-2xl"
    >
      <div>
        <div className="flex items-center justify-between border-b border-sky-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 p-1 shadow-2xs">
              <img
                src={`${import.meta.env.BASE_URL}images/brand/icon_porpoise.png`}
                alt=""
                aria-hidden="true"
                className="h-7 w-7 object-contain"
              />
            </div>
            <div>
              <h2
                id="porpoise-modal-title"
                className="text-base font-black tracking-tight text-[#003360]"
              >
                {existingRecord ? '상괭이 관찰기록 확인·수정' : '상괭이 목격 기록'}
              </h2>
              <p className="text-xs font-bold text-slate-600">개인 관찰용 (기기 내부 단독 저장)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-[#003360] shadow-2xs active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 1. 목격 위치 GPS 좌표 */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">관찰 위치 GPS 좌표</span>
              <span className="flex items-center gap-1 font-mono text-xs font-black text-[#00846c]">
                <Compass className="h-3.5 w-3.5 text-[#00846c]" />
                {lat.toFixed(5)}°N, {lng.toFixed(5)}°E
              </span>
            </div>
          </div>

          {/* 2. 목격 날짜 및 시간 */}
          <div>
            <label
              htmlFor="porpoise-observed-at"
              className="mb-1 flex items-center gap-1.5 text-xs font-extrabold text-[#003360]"
            >
              <Calendar className="h-3.5 w-3.5 text-[#00846c]" />
              <span>관찰 날짜 및 시간</span>
            </label>
            <input
              id="porpoise-observed-at"
              type="datetime-local"
              required
              value={observedAt}
              onChange={(e) => setObservedAt(e.target.value)}
              className="w-full rounded-xl border-2 border-slate-400 bg-white px-3.5 py-2.5 text-base font-bold text-[#003360] shadow-2xs focus:border-[#00846c] focus:outline-none"
            />
          </div>

          {/* 3. 발견 개체수 (기본 1마리) */}
          <div>
            <label className="mb-1.5 block text-xs font-extrabold text-[#003360]">
              발견 개체수 (마리)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCount((prev) => Math.max(1, prev - 1))}
                aria-label="개체수 감소"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-[#003360] shadow-2xs active:scale-90"
              >
                <Minus className="h-5 w-5" />
              </button>
              <div className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-teal-300 bg-teal-50/70 font-mono text-xl font-black text-[#00846c]">
                {count} 마리
              </div>
              <button
                type="button"
                onClick={() => setCount((prev) => prev + 1)}
                aria-label="개체수 증가"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-[#003360] shadow-2xs active:scale-90"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#d6c6b2] bg-[#f7f4ee] p-2.5 text-[11px] font-semibold leading-snug text-slate-700">
            * 개인 기록은 다른 직원에게 공유되지 않으며 이 기기 브라우저에만 저장됩니다. (브라우저 데이터 초기화 또는 기기 변경 시 유실될 수 있습니다.)
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-2 pt-1">
            {existingRecord && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-red-300 bg-red-50 text-red-700 active:scale-95"
                title="기록 삭제"
                aria-label="기록 삭제"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            <button
              type="submit"
              className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-[#00854a] via-[#00846c] to-[#00a79d] py-3 text-sm font-black text-white shadow-md active:scale-95"
            >
              {existingRecord ? '수정 저장' : '상괭이 관찰 저장'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
